// The controls: picking a song (YouTube's own player, in its own frame), tapping the beat, listening,
// reset and full screen.
//
// The music is never touched: it plays inside YouTube's player, which stays on screen while it plays.
// Nothing is loaded from YouTube until a song is picked.
(function () {
  "use strict";
  const SK = (window.SK = window.SK || {});
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
    { id: "y6120QOlsfU", name: "Sandstorm", style: "rave", by: "Darude", bpm: 136, vibe: "hype" },
    { id: "tRsQsTMvPNg", name: "Claude FM", style: "chill", by: "lofi, live", bpm: 80, vibe: "chill" },
  ];

  // ---------- cards: one open at a time; click away or Esc closes ----------
  const cards = [...document.querySelectorAll(".card")];
  let openCard = null;
  function show(card) {
    openCard = card;
    for (const c of cards) c.hidden = c !== card;
    for (const b of document.querySelectorAll("[data-card]")) b.setAttribute("aria-expanded", String(!!card && b.dataset.card === card.id));
  }
  for (const b of document.querySelectorAll("[data-card]")) {
    b.addEventListener("click", () => { const card = $(b.dataset.card); show(openCard === card ? null : card); b.blur(); });
  }
  addEventListener("pointerdown", (e) => { if (openCard && !e.target.closest(".card, [data-card]")) show(null); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && openCard) show(null); });

  // ---------- the first-visit nudge: comes and goes at the top until they do something ----------
  const hint = $("hint"), hintText = $("hint-text");
  const HINTS = ["Pick a song", "Type something", "Poke him"];
  let hintTimer = 0, hintN = 0;
  function hintCycle(on) {
    if (on) hintText.textContent = HINTS[hintN++ % HINTS.length];
    hint.classList.toggle("on", on);
    hintTimer = setTimeout(() => hintCycle(!on), on ? 2600 + Math.random() * 2200 : 3000 + Math.random() * 6000);
  }
  function acted() { clearTimeout(hintTimer); hint.classList.remove("on"); }
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
  // he keeps time by tempo until he's allowed to hear: the offer sits under the player
  $("tube-listen").addEventListener("click", () => show($("card-listen")));

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

  // ---------- tap, listen ----------
  const tapBtn = $("tap"), listenBtn = $("listen"), listenNote = $("listen-note");
  function paint() {
    tapBtn.lastElementChild.textContent = `Tap · ${Math.round(bs.bpm)}`;
    listenBtn.setAttribute("aria-pressed", String(!!bs.listening));
    listenBtn.lastElementChild.textContent = bs.listening ? (bs.locked ? "Listening" : "Listening…") : "Listen";
    $("listen-off").hidden = !bs.listening;
    $("tube-listen").hidden = !!bs.listening || listenBtn.hidden;
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
  async function listen(kind) {
    listenNote.textContent = kind === "tab" ? "Choose this tab, and tick “also share tab audio”." : "Allow the microphone, and turn the music up.";
    try {
      await beat.listen(kind);
      listenNote.textContent = "He’s listening. Nothing is recorded or sent anywhere.";
      SK.track("listen_started", { kind });
      show(null);
    } catch (e) {
      listenNote.textContent = e && e.name === "NotAllowedError" ? "No permission, so he can’t hear. He’ll keep time by tempo." : (e && e.message) || "That didn’t work.";
    }
    paint();
  }
  $("listen-mic").addEventListener("click", () => listen("mic"));
  const tabBtn = $("listen-tab");
  // sharing a tab's sound is a desktop Chrome and Edge thing
  if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || matchMedia("(pointer: coarse)").matches) tabBtn.hidden = true;
  tabBtn.addEventListener("click", () => listen("tab"));
  $("listen-off").addEventListener("click", () => { beat.stop(); listenNote.textContent = ""; paint(); show(null); });
  if (!navigator.mediaDevices) listenBtn.hidden = true;
  setInterval(paint, 500);
  paint();

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
