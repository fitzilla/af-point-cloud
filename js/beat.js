// The beat: what tempo the skeleton dances at, where in the bar it is, and how worked up the music is.
// YouTube won't let a page hear its player, so there are two ways to keep time:
//   tempo   a clock at a known or tapped tempo, running while the song plays
//   listen  the microphone (or this tab's sound) is analysed, and the clock follows what it hears
(function (root) {
  "use strict";

  // ---------- finding the tempo in what's heard ----------
  // Fed one number per frame (how much new sound just arrived), it keeps the last few seconds and works
  // out the spacing that best lines them up. Plain JS, no audio: the page feeds it, and so can a test.
  function Tracker() {
    const SPAN = 8, RATE = 100, N = SPAN * RATE;
    const times = [], flux = [];
    const env = new Float32Array(N);
    let bpm = 0, confidence = 0, lastBeat = 0;

    function push(t, f) {
      times.push(t); flux.push(f);
      while (times.length && times[0] < t - SPAN - 1) { times.shift(); flux.shift(); }
    }
    // resample the uneven frames onto an even grid ending at `now`
    function resample(now) {
      let j = 0, sum = 0;
      for (let i = 0; i < N; i++) {
        const t = now - SPAN + (i + 1) / RATE;
        while (j < times.length - 2 && times[j + 1] < t) j++;
        let v = 0;
        if (times.length > 1 && t >= times[0] && t <= times[times.length - 1]) {
          const a = times[j], b = times[j + 1], k = b > a ? (t - a) / (b - a) : 0;
          v = flux[j] + (flux[j + 1] - flux[j]) * Math.min(1, Math.max(0, k));
        }
        env[i] = v; sum += v;
      }
      const mean = sum / N;
      for (let i = 0; i < N; i++) env[i] = Math.max(0, env[i] - mean);
    }
    // Returns { bpm, confidence, lastBeat } or null when there isn't enough to go on.
    function estimate(now) {
      if (times.length < 120 || times[times.length - 1] - times[0] < SPAN * 0.6) return null;
      resample(now);
      const lo = Math.round((60 / 185) * RATE), hi = Math.round((60 / 68) * RATE);
      let best = 0, bestLag = 0, total = 0, count = 0;
      const score = new Float32Array(hi + 2);
      for (let lag = lo - 1; lag <= hi + 1; lag++) {
        let s = 0;
        for (let i = lag; i < N; i++) s += env[i] * env[i - lag];
        // a second look two beats apart steadies it, and a gentle preference for the middle tempos
        // settles the half-time / double-time question the way a dancer would
        let s2 = 0;
        for (let i = lag * 2; i < N; i++) s2 += env[i] * env[i - lag * 2];
        const b = (60 * RATE) / lag, pref = Math.exp(-0.5 * Math.pow(Math.log2(b / 118) / 0.75, 2));
        score[lag] = (s + 0.5 * s2) * pref;
        total += score[lag]; count++;
        if (lag >= lo && lag <= hi && score[lag] > best) { best = score[lag]; bestLag = lag; }
      }
      if (!bestLag || best <= 0) return null;
      // the peak usually sits between two grid steps
      const a = score[bestLag - 1], b = score[bestLag], c = score[bestLag + 1];
      const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
      const period = (bestLag + Math.max(-0.5, Math.min(0.5, shift))) / RATE;
      // where the beats fall: slide a comb of that spacing along and see where it catches most
      let bestPhase = 0, bestComb = -1;
      const P = period * RATE;
      for (let ph = 0; ph < P; ph++) {
        let s = 0;
        for (let k = 0; ; k++) {
          const i = Math.round(N - 1 - ph - k * P);
          if (i < 0) break;
          s += env[i] + 0.5 * (env[i - 1] || 0) + 0.5 * (env[i + 1] || 0);
        }
        if (s > bestComb) { bestComb = s; bestPhase = ph; }
      }
      bpm = 60 / period;
      confidence = best / (total / count + 1e-9);
      lastBeat = now - bestPhase / RATE;
      return { bpm, confidence, lastBeat };
    }
    return { push, estimate };
  }

  // ---------- guessing from a title ----------
  // No sound to go on, so the title is all there is. Wrong often enough that tap and the vibe switch exist.
  const CHILL = /lo-?fi|chill|relax|study|sleep|ambient|piano|acoustic|jazz|calm|rain|slow|ballad|bossa|meditat|soft|unplugged|lullaby/i;
  const HYPE = /techno|hardstyle|hardcore|drum ?(and|&|n) ?bass|\bdnb\b|dubstep|phonk|metal|punk|rave|trance|gabber|speed|nightcore|workout|hype|jungle|drill|\bedm\b|festival|sandstorm/i;
  function guess(title) {
    if (CHILL.test(title)) return { vibe: "chill", bpm: 84 };
    if (HYPE.test(title)) return { vibe: "hype", bpm: 140 };
    return { vibe: "groove", bpm: 118 };
  }

  // ---------- the clock ----------
  function createBeat() {
    const s = {
      bpm: 118, beat: 0, playing: false,
      vibe: "groove",         // what the dance is: chill, groove or hype
      choice: "auto",         // what the visitor asked for: auto, or one of those
      suggested: "groove",    // what the song seems to be, used while the choice is auto
      energy: 0.6,            // 0 to 1: how big the moves are
      kick: 0,                // jumps to 1 on a beat and fades: for anything that should pulse
      bar: 0,                 // the same, on the first beat of each four
      heard: 0,               // 0 to 1: how loud the room is, while listening
      listening: "",          // "", "mic" or "tab"
      locked: false,          // listening, and sure enough of the tempo to follow it
    };
    const taps = [];
    let whole = 0, ctx = null, analyser = null, stream = null, bins = null, prev = null;
    let tracker = null, lastGuess = 0, level = 0, peak = 0.05, fluxAvg = 0, onsets = 0, busy = 0;

    function setSong(meta) {
      const g = guess(meta.title || "");
      s.suggested = meta.vibe || g.vibe;
      if (!s.locked) s.bpm = meta.bpm || g.bpm;
      s.beat = 0; whole = 0;
      taps.length = 0;
    }
    function setChoice(v) { s.choice = v; }

    // Tap along: the gaps set the tempo and the last tap is a beat.
    function tap(now) {
      if (taps.length && now - taps[taps.length - 1] > 2) taps.length = 0;
      taps.push(now);
      if (taps.length > 8) taps.shift();
      if (taps.length >= 2) {
        const gap = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
        s.bpm = Math.min(220, Math.max(50, 60 / gap));
      }
      s.beat = Math.round(s.beat);
      s.kick = 1;
      return taps.length;
    }

    async function listen(kind) {
      stop();
      const md = navigator.mediaDevices;
      if (!md) throw new Error("This browser can't listen.");
      if (kind === "tab") {
        stream = await md.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true });
        if (!stream.getAudioTracks().length) { stream.getTracks().forEach((t) => t.stop()); stream = null; throw new Error("No sound was shared. Tick “share tab audio” and try again."); }
      } else {
        stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      }
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      ctx.createMediaStreamSource(stream).connect(analyser);     // analysed only: never played back, never recorded
      bins = new Uint8Array(analyser.frequencyBinCount);
      prev = new Uint8Array(analyser.frequencyBinCount);
      tracker = Tracker();
      level = 0; peak = 0.05; fluxAvg = 0; lastGuess = 0;
      s.listening = kind;
      stream.getTracks().forEach((t) => t.addEventListener("ended", stop));
    }
    function stop() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null; analyser = null; tracker = null;
      s.listening = ""; s.locked = false; s.heard = 0;
    }

    function hear(now, dt) {
      analyser.getByteFrequencyData(bins);
      // new sound in the low and middle of the spectrum: drums and bass, mostly
      let flux = 0, sum = 0;
      const top = Math.min(bins.length, 180);
      for (let i = 1; i < top; i++) {
        const d = bins[i] - prev[i];
        if (d > 0) flux += d * (i < 12 ? 2 : 1);
        sum += bins[i];
        prev[i] = bins[i];
      }
      flux /= top * 255; sum /= top * 255;
      tracker.push(now, flux);
      level += (sum - level) * Math.min(1, dt * 6);
      peak = Math.max(peak * Math.exp(-dt * 0.05), level, 0.05);
      s.heard = Math.min(1, level / peak);
      // a hit: well above what's usual lately
      fluxAvg += (flux - fluxAvg) * Math.min(1, dt * 2.5);
      const hit = flux > fluxAvg * 2.2 + 0.004;
      busy += ((hit ? 1 : 0) / Math.max(dt, 1 / 240) * 0.1 - busy) * Math.min(1, dt * 0.5);
      if (hit && now - onsets > 0.12) {
        onsets = now;
        // close to where a beat was expected? lean the clock toward it
        if (s.locked) {
          const off = s.beat - Math.round(s.beat);
          if (Math.abs(off) < 0.22) s.beat -= off * 0.2;
        }
      }
      if (now - lastGuess > 1.2) {
        lastGuess = now;
        const g = tracker.estimate(now);
        const quiet = s.heard < 0.12 || level < 0.012;
        if (g && g.confidence > 1.6 && !quiet) {
          s.bpm += (g.bpm - s.bpm) * (s.locked && Math.abs(g.bpm - s.bpm) < 6 ? 0.35 : 1);
          // how far through a beat we should be, by what was heard
          const want = ((now - g.lastBeat) * s.bpm) / 60;
          let err = want - s.beat;
          err -= Math.round(err);
          s.beat += err * (s.locked ? 0.5 : 1);
          s.locked = true;
        } else if (quiet) s.locked = false;
        // what it sounds like: fast or busy is hype, slow and sparse is chill
        const drive = s.heard * 0.5 + Math.min(1, busy / 4) * 0.5;
        s.suggested = !s.locked ? s.suggested : s.bpm > 136 || drive > 0.8 ? "hype" : s.bpm < 92 && drive < 0.5 ? "chill" : "groove";
      }
    }

    function update(dt, now) {
      if (analyser) hear(now, dt);
      // listening and hearing music is as good as the player saying it's playing
      const going = s.playing || (s.listening && s.locked);
      if (going) s.beat += (dt * s.bpm) / 60;
      const n = Math.floor(s.beat);
      s.kick *= Math.exp(-dt * 7);
      s.bar *= Math.exp(-dt * 3.5);
      if (going && n !== whole) {
        whole = n;
        s.kick = 1;
        if (n % 4 === 0) s.bar = 1;
      }
      s.vibe = s.choice === "auto" ? s.suggested : s.choice;
      const base = { chill: 0.35, groove: 0.65, hype: 1 }[s.vibe];
      const want = going ? (s.listening && s.locked ? base * (0.65 + 0.5 * s.heard) : base) : 0;
      s.energy += (want - s.energy) * Math.min(1, dt * 1.5);
      s.going = going;
    }

    return { state: s, update, tap, listen, stop, setSong, setChoice };
  }

  const api = { Tracker, guess, createBeat };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.SK = root.SK || {}).beatKit = api;
})(typeof window !== "undefined" ? window : globalThis);
