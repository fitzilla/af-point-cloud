// The controls: picking a song (YouTube's own player, in its own frame), tapping the beat, listening,
// reset and full screen.
//
// The music is never touched: it plays inside YouTube's player, which stays on screen while it plays.
// Nothing is loaded from YouTube until a song is picked.
(function () {
  "use strict";
  const SK = (window.SK = window.SK || {});
  // by now the stage has picked his colours: show the title and the dock (once the title's font is in,
  // or after a second at most, so a slow font never hides them)
  const ready = () => document.body.classList.add("ready");
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('40px Anton'), new Promise((r) => setTimeout(r, 1000))]).then(ready, ready);
  else ready();
  if (!SK.beat) return;      // the stage didn't start (no WebGL): nothing to control
  const $ = (id) => document.getElementById(id);
  const beat = SK.beat, bs = beat.state;
  const params = new URLSearchParams(location.search);

  // Tempos here are from memory, good enough to start from; Tap puts him exactly on the beat.
  const SONGS = [
    { id: "q6-ZGAGcJrk", name: "Spooky Scary Skeletons", style: "spooky", by: "The Living Tombstone", bpm: 128, vibe: "hype" },
    { id: "fNFzfwLM72c", name: "Stayin’ Alive", style: "disco", by: "Bee Gees", bpm: 104, vibe: "groove" },
    { id: "sOnqjkJTMaA", name: "Thriller", style: "spooky", by: "Michael Jackson", bpm: 118, vibe: "groove" },
    { id: "Gs069dndIYk", name: "September", style: "disco", by: "Earth, Wind & Fire", bpm: 126, vibe: "groove" },
    { id: "dQw4w9WgXcQ", name: "Never Gonna Give You Up", style: "pop", by: "Rick Astley", bpm: 113, vibe: "groove" },
    { id: "OPf0YbXqDm0", name: "Uptown Funk", style: "disco", by: "Mark Ronson", bpm: 115, vibe: "groove" },
    { id: "v2AC41dglnM", name: "Thunderstruck", style: "rock", by: "AC/DC", bpm: 134, vibe: "hype" },
    { id: "CD-E-LDc384", name: "Enter Sandman", style: "metal", by: "Metallica", bpm: 123, vibe: "hype" },
    { id: "y6120QOlsfU", name: "Sandstorm", style: "rave", by: "Darude", bpm: 136, vibe: "hype" },
  ];

  // ---------- cards: one open at a time, above the dock ----------
  // Clicking away or Esc closes it; on a touch screen so does swiping it down, like a sheet (the little
  // bar at its top says so). Same as pomo.fm.
  const cards = [...document.querySelectorAll(".card")];
  const triggers = [...document.querySelectorAll("[data-card]")];
  let openCard = null;
  function show(card) {
    if (openCard === card) return;
    openCard = card;
    for (const c of cards) {
      c.classList.toggle("open", c === card);
      c.inert = c !== card;
      if (c === card) c.style.transition = c.style.transform = c.style.opacity = "";     // whatever a swipe left behind
    }
    for (const t of triggers) t.setAttribute("aria-expanded", String(!!card && t.dataset.card === card.id));
    document.body.classList.toggle("card-open", !!card);
    if (card) card.focus({ preventScroll: true });
  }
  for (const t of triggers) t.addEventListener("click", () => { const card = $(t.dataset.card); show(openCard === card ? null : card); });
  addEventListener("pointerdown", (e) => { if (openCard && !openCard.contains(e.target) && !e.target.closest(".dock")) show(null); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && openCard) show(null); });
  for (const card of cards) {
    const grab = document.createElement("i");
    grab.className = "grab";
    grab.setAttribute("aria-hidden", "true");
    card.prepend(grab);
    swipeAway(card);
    card.inert = true;
  }
  // A drag counts when it starts with the card scrolled to its top and heads mostly downward; a tap or a
  // sideways drag is left alone.
  function swipeAway(card) {
    let x0 = 0, y0 = 0, t0 = 0, dy = 0, state = "idle";
    const clear = () => { card.style.transition = card.style.transform = card.style.opacity = ""; };
    card.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      state = e.touches.length === 1 && openCard === card && card.scrollTop <= 0 ? "maybe" : "no";
      x0 = touch.clientX; y0 = touch.clientY; t0 = performance.now(); dy = 0;
    }, { passive: true });
    card.addEventListener("touchmove", (e) => {
      if (state !== "maybe" && state !== "drag") return;
      const touch = e.touches[0], mx = touch.clientX - x0, my = touch.clientY - y0;
      if (state === "maybe") {
        if (my > 0 && my >= Math.abs(mx)) e.preventDefault();
        if (Math.hypot(mx, my) < 8) return;
        if (my <= 0 || Math.abs(mx) > my) { state = "no"; return; }
        state = "drag";
        card.style.transition = "none";
      }
      e.preventDefault();
      dy = Math.max(0, my);
      card.style.transform = `translateY(${dy}px)`;
      card.style.opacity = String(Math.max(0.3, 1 - dy / 360));
    }, { passive: false });
    function end() {
      if (state !== "drag") { state = "idle"; return; }
      state = "idle";
      const fast = dy / Math.max(1, performance.now() - t0) > 0.5;
      card.style.transition = "transform 0.2s ease, opacity 0.2s ease";
      if (dy > 90 || (dy > 30 && fast)) {
        card.style.transform = `translateY(${card.offsetHeight + 40}px)`;
        card.style.opacity = "0";
        setTimeout(() => { if (openCard === card) show(null); setTimeout(clear, 250); }, 200);
      } else {
        card.style.transform = card.style.opacity = "";
        setTimeout(() => { if (state === "idle") card.style.transition = ""; }, 220);
      }
    }
    card.addEventListener("touchend", end);
    card.addEventListener("touchcancel", end);
  }

  // ---------- the first-visit nudge: comes and goes at the top until they do something ----------
  const hint = $("hint"), hintText = $("hint-text");
  const HINTS = ["Pick a song", "Type something", "Poke him"];
  let hintTimer = 0, hintN = 0;
  function hintCycle(on) {
    if (on) hintText.textContent = HINTS[hintN++ % HINTS.length];
    hint.classList.toggle("on", on);
    hintTimer = setTimeout(() => hintCycle(!on), on ? 2600 + Math.random() * 2200 : 3000 + Math.random() * 6000);
  }
  // the first thing they do: the nudge stops, and the title fades away
  const titleEl = $("title");
  function acted() { clearTimeout(hintTimer); hint.classList.remove("on"); if (titleEl) titleEl.classList.add("gone"); }
  addEventListener("pointerdown", (e) => { if (!(e.target instanceof Element) || !e.target.closest("#tube")) acted(); }, { passive: true });
  addEventListener("keydown", (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) acted(); });
  try {
    const fresh = !localStorage.getItem("af-bones-seen");
    localStorage.setItem("af-bones-seen", "1");
    if (fresh || params.has("hint")) hintTimer = setTimeout(() => hintCycle(true), 2500);
  } catch (e) { /* private window: no nudge */ }

  // ---------- YouTube ----------
  const tube = $("tube"), nowEl = $("now"), noteEl = $("pick-note"), linkEl = $("link");
  let api = null, player = null, current = null, wanted = null;
  function loadApi() {
    if (api) return api;
    api = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      const earlier = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (earlier) earlier(); resolve(window.YT); };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.addEventListener("error", () => { tag.remove(); api = null; reject(new Error("YouTube can’t be reached")); });
      document.head.append(tag);
    });
    return api;
  }
  // a link, a share link, a shorts or live link, or just the eleven-character id
  function videoId(text) {
    const s = String(text || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/.exec(s);
    return m ? m[1] : "";
  }
  const say = (text) => { noteEl.textContent = text; };

  function onState(e) {
    bs.playing = e.data === 1;
    if (e.data === 1 || e.data === 5) {
      const data = player.getVideoData ? player.getVideoData() : null;
      const title = (current && current.name) || (data && data.title) || "";
      if (title) nowEl.textContent = current && current.name ? `${current.name} · ${current.by}` : title;
      // a pasted link: the title is all there is to go on for tempo and vibe
      if (current && !current.told && title) { current.told = true; if (!current.bpm) beat.setSong({ title }); paint(); }
    }
    if (e.data === 0) nowEl.textContent = "That’s the end of that one";
  }
  function onError(e) {
    bs.playing = false;
    nowEl.textContent = e.data === 101 || e.data === 150 ? "Its owner doesn’t let that one play here. Try another." : "That one won’t play. Try another.";
  }

  // autoplay: true when a click or paste asked for it; a link opened cold just cues up, ready to press
  // via: how it was chosen (preset, link, paste, shared_link)
  async function play(song, autoplay, via) {
    current = Object.assign({}, song);
    SK.track("song_picked", { video_id: song.id, preset: !!song.name, name: song.name || "", via });
    wanted = current.id;
    acted();
    show(null);
    tube.hidden = false;
    nowEl.textContent = current.name ? `${current.name} · ${current.by}` : "Loading…";
    beat.setSong({ title: current.name ? `${current.name} ${current.by}` : "", bpm: current.bpm, vibe: current.vibe, style: current.style });
    paint();
    try {
      const url = new URL(location.href);
      url.searchParams.set("v", current.id);
      history.replaceState(null, "", url);      // so the address bar is a link to him dancing to this
    } catch (e) { /* not allowed here: no shareable link, nothing else lost */ }
    try {
      const YT = await loadApi();
      if (wanted !== current.id) return;
      if (!player) {
        player = await new Promise((resolve) => {
          const p = new YT.Player("player", {
            width: "100%", height: "100%", videoId: current.id, host: "https://www.youtube-nocookie.com",
            playerVars: { playsinline: 1, rel: 0, autoplay: autoplay ? 1 : 0, origin: location.origin },
            events: { onReady: () => resolve(p), onStateChange: onState, onError },
          });
        });
        player.getIframe().title = "YouTube player";
      } else if (autoplay) player.loadVideoById(current.id);
      else player.cueVideoById(current.id);
    } catch (e) {
      nowEl.textContent = e.message + ". Check your connection and try again.";
    }
  }
  function stopSong() {
    wanted = null;
    if (player && player.stopVideo) player.stopVideo();
    bs.playing = false;
    tube.hidden = true;
  }
  $("tube-close").addEventListener("click", stopSong);
  const list = $("songs");
  for (const song of SONGS) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<b></b><span></span>";
    b.firstChild.textContent = song.name;
    b.lastChild.textContent = song.by;
    b.addEventListener("click", () => play(song, true, "preset"));
    list.append(b);
  }
  function go() {
    const id = videoId(linkEl.value);
    if (!id) { say("That doesn’t look like a YouTube link."); return; }
    linkEl.value = "";
    say("");
    play(SONGS.find((s) => s.id === id) || { id }, true, "link");
  }
  $("link-form").addEventListener("submit", (e) => { e.preventDefault(); go(); });
  // paste a YouTube link anywhere on the page and he starts
  addEventListener("paste", (e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea")) return;
    const id = videoId(e.clipboardData && e.clipboardData.getData("text"));
    if (id) { e.preventDefault(); play(SONGS.find((s) => s.id === id) || { id }, true, "paste"); }
  });
  const linked = videoId(params.get("v"));
  if (linked) play(SONGS.find((s) => s.id === linked) || { id: linked }, false, "shared_link");

  // ---------- tap, and the two switches: Listen and Copy me ----------
  // A switch says, while it's off, what turning it on will use; while it's on, what it's doing.
  const tapBtn = $("tap"), dockEl = $("dock"), put = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const listenBtn = $("listen"), listenSay = $("listen-say"), listenNote = $("listen-note");
  // sharing a tab's sound is a desktop Chrome and Edge thing; elsewhere the switch goes straight to the mic
  const canTab = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia("(pointer: coarse)").matches;
  if (!canTab) $("listen-tab").hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) listenBtn.hidden = true;
  let listenMsg = "", listenUntil = 0, asking = false;
  function sayListen(text, secs) { listenMsg = text; listenUntil = performance.now() + secs * 1000; paint(); }
  function paint() {
    put(tapBtn.querySelector("b"), String(Math.round(bs.bpm)));
    const on = !!bs.listening;
    listenBtn.setAttribute("aria-checked", String(on));
    listenBtn.setAttribute("aria-busy", String(asking || (on && !bs.locked)));
    const msg = performance.now() < listenUntil ? listenMsg : "";
    put(listenSay, msg || (on ? (bs.locked ? "On · he’s on the real beat" : "On · listening for the beat…") : bs.playing ? "Off · he’s guessing. Turn on so he hears it" : "Off · turn on so he hears the music"));
    listenBtn.classList.toggle("nudge", !on && !asking && bs.playing && !tube.hidden);
    // how tall the dock is (the cards and the player sit above it), and how much of the bottom of the
    // picture is covered in the middle, where he is: he moves up to dance in what's left
    document.documentElement.style.setProperty("--dock-h", dockEl.offsetHeight + "px");
    let top = innerHeight;
    for (const el of [tube, dockEl]) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.left < innerWidth / 2 && r.right > innerWidth / 2) top = Math.min(top, r.top);
    }
    SK.cover = Math.min(0.6, Math.max(0, 1 - top / innerHeight - 0.03));
  }
  function tap() {
    beat.tap(performance.now() / 1000);
    // no song? tapping is enough to get him going
    if (!bs.playing && !bs.listening) { bs.playing = true; clearTimeout(tap.rest); tap.rest = setTimeout(() => { if (!player || player.getPlayerState() !== 1) bs.playing = false; }, 12000); }
    tapBtn.classList.remove("hit");
    void tapBtn.offsetWidth;
    tapBtn.classList.add("hit");
    paint();
  }
  tapBtn.addEventListener("click", () => { tap(); tapBtn.blur(); });
  // via: where it was switched on from (card = the choice of mic or tab, switch = straight from the switch)
  async function listen(kind, via) {
    asking = true;
    show(null);
    sayListen(kind === "tab" ? "Pick this tab, tick “share tab audio”" : "Allow the mic, turn the music up", 60);
    try {
      await beat.listen(kind);
      listenUntil = 0;
      SK.track("listen_started", { kind, via });
      listenNote.textContent = "";
    } catch (e) {
      const why = e && e.name === "NotAllowedError" ? "No mic allowed, so he’s guessing" : (e && e.message) || "That didn’t work";
      sayListen(why, 6);
      listenNote.textContent = why;
    }
    asking = false;
    paint();
  }
  listenBtn.addEventListener("click", () => {
    if (bs.listening) { beat.stop(); sayListen("Off · back to guessing the beat", 3); return; }
    if (asking) return;
    if (canTab) show(openCard === $("card-listen") ? null : $("card-listen"));
    else listen("mic", "switch");
  });
  $("listen-mic").addEventListener("click", () => listen("mic", "card"));
  $("listen-tab").addEventListener("click", () => listen("tab", "card"));
  addEventListener("resize", paint);
  setInterval(paint, 500);
  paint();

  // ---------- copy me: the webcam, and he does what you do ----------
  const mirror = SK.mirror, copyBtn = $("copy"), copySay = $("copy-say"), camEl = $("cam"), camNote = $("cam-note");
  const COPY_SAYS = { asking: "Allow the camera…", loading: "On · loading his eyes…", looking: "On · step back so he can see you", copying: "On · he’s copying you" };
  const CAM_SAYS = { loading: "Loading his eyes", looking: "Step back", copying: "Copying you" };
  let copyMsg = "", copyUntil = 0, copied = false;
  if (!mirror || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) copyBtn.hidden = true;
  function paintCopy() {
    const on = !!(mirror && mirror.guide.on), status = mirror ? mirror.status : "off";
    copyBtn.setAttribute("aria-checked", String(on));
    copyBtn.setAttribute("aria-busy", String(status === "asking" || status === "loading"));
    camEl.hidden = !on;
    const msg = performance.now() < copyUntil ? copyMsg : "";
    put(copySay, msg || COPY_SAYS[status] || "Off · turn on so he copies your moves");
    put(camNote, CAM_SAYS[status] || "");
    // once per visit: it found someone, so it works for them
    if (on && status === "copying" && !copied) { copied = true; SK.track("copy_me_seen", {}); }
  }
  async function copy() {
    try {
      const asked = mirror.camera($("cam-view"));
      paintCopy();
      await asked;
      SK.track("copy_me_started", {});
      paintCopy();
      await mirror.load();
    } catch (e) {
      const name = e && e.name;
      copyMsg = name === "NotAllowedError" ? "No permission, so he can’t see you" : name === "NotFoundError" || name === "OverconstrainedError" ? "He can’t find a camera" : name === "NotReadableError" ? "Something else is using the camera" : (e && e.message) || "That didn’t work";
      copyUntil = performance.now() + 6000;
    }
    paintCopy();
  }
  copyBtn.addEventListener("click", () => {
    if (mirror.status === "asking") return;
    if (mirror.guide.on) { mirror.stop(); copyMsg = "Off · camera’s off"; copyUntil = performance.now() + 2500; paintCopy(); return; }
    copy();
  });
  setInterval(paintCopy, 500);
  paintCopy();

  // ---------- reset, full screen ----------
  const rstBtn = $("rst"), fsBtn = $("fs");
  rstBtn.addEventListener("click", () => { SK.stage.resetAll(); rstBtn.blur(); });
  const root = document.documentElement;
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.hidden = true;
  fsBtn.addEventListener("click", () => {
    try {
      const done = isFs() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      if (done && done.catch) done.catch(() => {});
    } catch (e) { fsBtn.hidden = true; }
    fsBtn.blur();
  });
  const paintFs = () => { fsBtn.setAttribute("aria-pressed", String(isFs())); fsBtn.setAttribute("aria-label", isFs() ? "Leave full screen" : "Full screen"); };
  document.addEventListener("fullscreenchange", paintFs);
  document.addEventListener("webkitfullscreenchange", paintFs);

  SK.ui = { tap, acted, play, videoId, songs: SONGS };
})();
