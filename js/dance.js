// The dancing: a handful of moves for each vibe, each one a little formula that turns "how far through
// the beat are we" into a pose. He picks a new one every eight beats, eases between them, and has a
// few things he does for a laugh (his head comes off, his knees knock, he falls in a heap).
(function () {
  "use strict";
  const SK = (window.SK = window.SK || {});
  const { B, NB, pose: P } = SK.rig;
  const TAU = Math.PI * 2;
  const sn = (ph, per, off) => Math.sin(TAU * (ph / (per || 1) + (off || 0)));
  const hit = (ph, sharp) => Math.pow(0.5 + 0.5 * Math.cos(TAU * ph), sharp || 3);   // 1 on the beat, 0 between
  const fr = (x) => x - Math.floor(x);
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

  // ---------- the moves: (beats since it started, pose to fill in, what's going on) ----------
  const MOVES = {
    // weight from foot to foot, arms swinging loose
    sway(ph, p) {
      const s = sn(ph, 2);
      p.hx = 0.07 * s; p.hrz = -0.05 * s; p.hy = -0.035 - 0.025 * hit(ph); p.srz = 0.07 * s; p.crz = 0.03 * s;
      p.nrz = -0.06 * s; p.nrx = 0.1 * hit(ph);
      p.aLa = 0.14 + 0.05 * s; p.aRa = 0.14 - 0.05 * s; p.aLf = 0.22 * sn(ph, 2, 0.1); p.aRf = -0.22 * sn(ph, 2, 0.1); p.aLb = p.aRb = 0.3;
    },
    // nodding along, clicking his fingers, tapping a foot
    nodSnap(ph, p) {
      p.hy = -0.04 - 0.04 * hit(ph); p.hx = -0.03; p.nrx = 0.24 * hit(ph, 2); p.crx = 0.05 * hit(ph);
      p.aRf = 1.0; p.aRa = 0.25; p.aRb = 1.5 + 0.25 * hit(ph + 0.5); p.aRh = -0.6 * hit(ph + 0.5);
      p.aLf = 0.1 * sn(ph, 2); p.fLy = 0.05 * hit(ph + 0.5, 4); p.fLz = 0.08;
    },
    stepTouch(ph, p) {
      p.hx = 0.16 * sn(ph, 4); p.fLx = 0.16 * sn(ph - 0.35, 4); p.fRx = 0.16 * sn(ph + 0.35, 4);
      p.fLy = 0.06 * hit(ph * 0.5 + 0.25, 2); p.fRy = 0.06 * hit(ph * 0.5 + 0.75, 2);
      p.hy = -0.05 - 0.04 * hit(ph); p.cry = 0.2 * sn(ph, 2); p.nrz = 0.06 * sn(ph, 2);
      p.aLf = 0.5 * sn(ph, 2); p.aRf = -0.5 * sn(ph, 2); p.aLb = p.aRb = 0.7; p.aLa = p.aRa = 0.25;
    },
    twist(ph, p) {
      const w = sn(ph, 1);
      p.hry = 0.45 * w; p.cry = -0.5 * w; p.crx = 0.1; p.hy = -0.14 - 0.03 * sn(ph, 4); p.kL = p.kR = 0.5;
      p.fLr = 0.35 * w; p.fRr = -0.35 * w; p.nry = -0.2 * w;
      p.aLf = 0.55 + 0.35 * w; p.aRf = 0.55 - 0.35 * w; p.aLb = p.aRb = 1.35; p.aLa = p.aRa = 0.35;
    },
    // one arm to the sky, the other on his hip: Saturday night
    discoPoint(ph, p) {
      const k = 0.5 - 0.5 * Math.cos(Math.PI * ph), d = 2 * k - 1;
      p.aRa = -0.55 + 3.0 * k; p.aRf = 0.5 * (1 - k); p.aRb = 0.15;
      p.aLa = 0.75; p.aLz = -1.75; p.aLb = 0.2;
      p.hx = 0.09 * d; p.hrz = -0.1 * d; p.srz = 0.12 * d; p.hy = -0.06 - 0.03 * hit(ph);
      p.nry = -0.5 * d; p.nrx = -0.15 * k; p.fRy = 0.04 * (1 - k); p.jaw = 0.3 * hit(ph, 4);
    },
    // crouched, knees clacking in and out, hands crossing over them
    kneeKnock(ph, p) {
      const v = sn(ph, 1);
      p.hy = -0.2; p.kL = p.kR = 0.15 + 0.85 * v; p.fLr = p.fRr = 0.5 * v; p.fLx = 0.1; p.fRx = -0.1;
      p.aLf = p.aRf = 0.75; p.aLb = p.aRb = 0.25; p.aLa = p.aRa = 0.1 - 0.35 * v;
      p.crx = 0.45; p.nrx = -0.35; p.jaw = 0.6 * hit(ph * 2, 2);
    },
    shimmy(ph, p) {
      const q = sn(ph, 0.5);
      p.cry = 0.3 * q; p.crz = 0.06 * q; p.crx = -0.12; p.hy = -0.07 - 0.03 * hit(ph); p.hx = 0.05 * sn(ph, 4);
      p.aLa = p.aRa = 1.25; p.aLz = p.aRz = 0.5; p.aLf = 0.25 * q; p.aRf = -0.25 * q; p.jaw = 0.25;
    },
    // stiff right angles, a new one every beat
    robot(ph, p) {
      const T = [[1.57, 1.57, 1.57, -1.57, 0.7], [1.57, -1.57, 1.57, 1.57, -0.7], [0.1, 1.57, 1.57, 0, 0], [1.57, 0, 0.1, 1.57, 0.7]][Math.floor(ph) % 4];
      p.aLa = T[0]; p.aLz = T[1]; p.aRa = T[2]; p.aRz = T[3]; p.nry = T[4]; p.aLb = p.aRb = 0;
      p.hy = -0.03 * hit(ph, 6); p.crz = 0.06 * (Math.floor(ph) % 2 ? 1 : -1); p.snap = 1;
    },
    egyptian(ph, p) {
      const q = Math.floor(ph / 2) % 2 ? -1 : 1;
      p.aLa = p.aRa = 1.5; p.aLz = 1.5 * q; p.aRz = -1.5 * q; p.nry = 0.9 * q; p.hdx = 0.07 * sn(ph, 1);
      p.hy = -0.06 - 0.03 * hit(ph); p.hx = 0.05 * sn(ph, 2); p.fLz = 0.15 * q; p.fRz = -0.15 * q;
    },
    // playing his own ribs like a xylophone, teeth chattering
    rattle(ph, p) {
      p.aLf = p.aRf = 0.75; p.aLa = p.aRa = 0.05; p.aLz = p.aRz = -0.3;
      p.aLb = 1.75 + 0.3 * hit(ph * 2, 3); p.aRb = 1.75 + 0.3 * hit(ph * 2 + 0.5, 3);
      p.crz = 0.06 * sn(ph, 2); p.hy = -0.05 - 0.03 * hit(ph); p.nrx = 0.25; p.nrz = 0.1 * sn(ph, 2); p.jaw = 0.7 * hit(ph * 2, 2);
    },
    pogo(ph, p) {
      const a = Math.abs(Math.sin(Math.PI * ph));
      p.air = 0.24 * Math.pow(a, 0.7); p.hy = -0.03 - 0.1 * hit(ph, 4); p.kL = p.kR = 0.35; p.fLy = p.fRy = 0.03 * a;
      p.aLa = p.aRa = 2.75 + 0.15 * sn(ph, 1); p.aLz = p.aRz = 0.2; p.nrx = -0.15 + 0.2 * hit(ph); p.jaw = 0.5 * a;
    },
    fistPump(ph, p) {
      const h = hit(ph, 2);
      p.aRa = 1.1 + 1.5 * h; p.aRz = 0.9 * (1 - h); p.aRf = 0.2; p.aLa = 0.3; p.aLb = 0.9;
      p.hy = -0.06 - 0.07 * h; p.crz = -0.08 * h; p.nrx = 0.2 * h; p.jaw = 0.5 * h; p.fLy = 0.05 * hit(ph + 0.5, 3);
    },
    // head down, air guitar
    headbang(ph, p) {
      const h = hit(ph, 2);
      p.crx = 0.25 + 0.4 * h; p.nrx = 0.75 * h - 0.2; p.hy = -0.14; p.kL = p.kR = 0.5; p.fLx = 0.12; p.fRx = -0.12;
      p.aLa = 1.05; p.aLf = 0.5; p.aLz = 0.35; p.aRa = 0.25; p.aRf = 0.55; p.aRb = 1.2 + 0.45 * sn(ph, 0.5); p.jaw = 0.4 * h;
    },
    armsWave(ph, p) {
      const s = sn(ph, 2);
      p.aLa = 2.7 + 0.35 * s; p.aRa = 2.7 - 0.35 * s; p.aLz = -0.15 * s; p.aRz = 0.15 * s;
      p.hx = -0.08 * s; p.srz = 0.1 * s; p.nrz = 0.1 * s; p.hy = -0.05 - 0.05 * hit(ph);
    },
    // his head pops off, spins once and lands back on, to his own alarm
    headPop(ph, p) {
      const c = ph % 4;
      p.hy = -0.05 - 0.04 * hit(ph);
      if (c < 1.5) {
        const up = Math.sin((Math.PI * c) / 1.5);
        p.pop = 0.4 * up; p.spin = TAU * sm(0.1, 1.4, c); p.jaw = 0.9 * up;
        p.aLa = p.aRa = 0.3 + 2.3 * Math.min(1, up * 1.6); p.aLz = p.aRz = -0.3;
      } else { p.aLa = p.aRa = 0.5; p.aLz = p.aRz = 0.6; p.nrz = 0.15 * sn(ph, 2); }
    },
    // can-can
    kicks(ph, p) {
      const k = Math.sin(Math.PI * fr(ph)), L = Math.floor(ph) % 2 === 0 ? "L" : "R";
      const side = L === "L" ? 1 : -1;
      // up and out to the side, where a kick can be seen from the front
      p["f" + L + "x"] = side * 0.5 * k; p["f" + L + "z"] = 0.35 * k; p["f" + L + "y"] = 0.72 * k; p.hx = -side * 0.07 * k; p.srz = -side * 0.1 * k;
      p.crx = -0.2 * k; p.aLa = p.aRa = 1.35; p.aLz = p.aRz = 0.15; p.hy = -0.03; p.air = 0.05 * k; p.jaw = 0.3 * k;
    },
  };
  const POOL = {
    chill: ["sway", "nodSnap", "stepTouch"],
    groove: ["stepTouch", "twist", "discoPoint", "kneeKnock", "shimmy", "robot", "egyptian", "rattle"],
    hype: ["pogo", "fistPump", "headbang", "armsWave", "headPop", "kicks", "twist", "kneeKnock"],
  };

  // nothing playing: hand on hip, tapping a foot, looking at whoever's pointer is about, checking a
  // watch he doesn't have, and the odd yawn
  function idle(t, p, c) {
    p.hy = -0.02 + 0.006 * Math.sin(t * 1.6); p.crx = 0.02 * Math.sin(t * 1.6); p.hx = 0.04; p.hrz = 0.04;
    p.nry = c.lookX * 0.7; p.nrx = -c.lookY * 0.4; p.cry = c.lookX * 0.15;
    p.fRy = 0.045 * hit(t * 1.7, 6); p.fRz = 0.1;
    p.aLa = 0.7; p.aLz = -1.7;
    const watch = sm(0, 0.5, fr(t / 11) * 11 - 6) * (1 - sm(2.4, 2.9, fr(t / 11) * 11 - 6));
    p.aRf = 1.1 * watch; p.aRb = 0.12 + 1.5 * watch; p.nrx += 0.4 * watch; p.nry *= 1 - watch;
    const yawn = sm(0, 1, fr(t / 17) * 17 - 12) * (1 - sm(1.8, 2.6, fr(t / 17) * 17 - 12));
    p.jaw = 0.95 * yawn; p.nrx -= 0.2 * yawn;
  }

  // how quickly each part catches up with where the move wants it: hips fast, hands last
  const RATE = (key) => (key === "spin" || key === "pop" || key === "air" ? 60 : key === "jaw" ? 30 : key[0] === "f" ? 22 : key[0] === "h" ? 18 : key[0] === "k" ? 10 : key[0] === "n" ? 12 : key[1] === "L" || key[1] === "R" ? (key[2] === "h" ? 9 : 13) : 14);
  // the order he's put back together in: feet first, skull last
  const RISE = { footL: 0, footR: 0.05, shinL: 0.14, shinR: 0.19, thighL: 0.3, thighR: 0.35, pelvis: 0.46, spine: 0.56, chest: 0.66, armL: 0.8, armR: 0.84, foreL: 0.92, foreR: 0.96, handL: 1.04, handR: 1.08, neck: 1.12, head: 1.3, jaw: 1.42 };

  SK.createDance = function () {
    const neutral = P(), now = P(), a = P(), b = P(), out = P();
    const keys = Object.keys(neutral);
    const heap = new Float32Array(NB), fallAt = new Float32Array(NB);
    const names = Object.keys(B);
    let cur = "sway", prev = "sway", curStart = 0, phrase = -1, live = 0, startled = 0, talking = 0, tada = 0;
    let fall = { phase: "up", t: 0 }, landed = false, pinned = false;

    function choose(vibe, seed) {
      const pool = POOL[vibe] || POOL.groove;
      let next;
      do next = pool[Math.floor(Math.random() * pool.length)]; while (next === cur && pool.length > 1);
      return next;
    }
    const fill = (p, name, ph, c) => {
      for (const k of keys) p[k] = neutral[k];
      p.snap = 0;
      MOVES[name](ph, p, c);
      const amp = Math.min(1.15, 0.55 + 0.6 * c.energy);
      for (const k of keys) if (k !== "spin") p[k] = neutral[k] + (p[k] - neutral[k]) * amp;
    };

    // c: { beat, bpm, vibe, energy, going, lookX, lookY, t }. Returns { pose, heap, landed }.
    function step(dt, c) {
      // very fast songs are danced at half speed, very slow ones at double
      const db = c.beat * (c.bpm > 150 ? 0.5 : c.bpm < 72 ? 2 : 1);
      const n = Math.floor(db / 8);
      if (c.going && !pinned && (n !== phrase || !POOL[c.vibe].includes(cur))) {
        phrase = n;
        prev = cur;
        cur = choose(c.vibe);
        curStart = db;
      }
      fill(a, cur, db, c);
      const w = sm(0, 0.75, db - curStart);
      if (w < 1) {
        fill(b, prev, db, c);
        for (const k of keys) a[k] = k === "spin" ? (w > 0.5 ? a[k] : b[k]) : b[k] + (a[k] - b[k]) * w;
        a.snap = Math.max(a.snap, b.snap);
      }
      for (const k of keys) b[k] = neutral[k];
      idle(c.t, b, c);
      live += ((c.going ? 1 : 0) - live) * Math.min(1, dt * 2.5);
      for (const k of keys) out[k] = k === "spin" ? (live > 0.5 ? a[k] : 0) : b[k] + (a[k] - b[k]) * live;

      // a poke makes him jump; typing makes his jaw go
      startled *= Math.exp(-dt * 3.5); talking *= Math.exp(-dt * 9); tada *= Math.exp(-dt * 1.8);
      out.aLa += 1.6 * startled; out.aRa += 1.6 * startled; out.pop += 0.1 * startled; out.hy += 0.05 * startled;
      out.jaw = Math.max(out.jaw, startled, talking * 0.8, tada);
      out.aLa += (1.5 - out.aLa) * tada; out.aRa += (1.5 - out.aRa) * tada; out.aLz += (0.3 - out.aLz) * tada; out.aRz += (0.3 - out.aRz) * tada;

      const quick = a.snap ? 3 : 1;
      for (const k of keys) now[k] += (out[k] - now[k]) * Math.min(1, dt * RATE(k) * quick);

      // the heap
      landed = false;
      if (fall.phase !== "up") {
        fall.t += dt;
        let done = true;
        for (let i = 0; i < NB - 1; i++) {
          if (fall.phase === "falling") {
            const k = sm(fallAt[i], fallAt[i] + 0.42, fall.t);
            if (k >= 1 && heap[i] < 1) landed = true;
            heap[i] = k;
            if (k < 1) done = false;
          } else if (fall.phase === "rising") {
            // each bone snaps back into place with a little overshoot
            const u = Math.min(1, Math.max(0, (fall.t - RISE[names[i]]) / 0.3));
            heap[i] = Math.max(0, 1 - (1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2)));
            if (u < 1) done = false;
          }
        }
        if (fall.phase === "falling" && done) { fall = { phase: "down", t: 0 }; }
        else if (fall.phase === "down" && fall.t > 1.5) { fall = { phase: "rising", t: 0 }; }
        else if (fall.phase === "rising" && done) { fall = { phase: "up", t: 0 }; tada = 1; }
      }
      return { pose: now, heap, landed, down: fall.phase !== "up" };
    }

    return {
      step,
      collapse() {
        if (fall.phase !== "up") return false;
        fall = { phase: "falling", t: 0 };
        for (let i = 0; i < NB; i++) fallAt[i] = Math.random() * 0.22;
        return true;
      },
      startle() { startled = 1; },
      talk() { talking = 1; },
      get move() { return cur; },
      set move(name) { pinned = !!MOVES[name]; if (pinned) { prev = cur; cur = name; } },     // for trying one move out: it stays until set to ""
      moves: Object.keys(MOVES),
    };
  };
})();
