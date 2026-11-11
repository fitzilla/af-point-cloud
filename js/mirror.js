// Copy me: the webcam, a body tracker, and what the skeleton should do about what it sees.
//
// The picture never leaves the page. Frames go from the camera to a tracker running in this tab
// (MediaPipe's Pose Landmarker, fetched only when Copy me is switched on) and are thrown away.
//
// He is a mirror: your right hand is on the right of the picture, so it moves the arm on the right of
// the screen, which is his left. Everything the tracker says is turned round to match.
(function (root) {
  "use strict";
  const LIB = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  // the tracker's numbering (its left and right are the person's own)
  const NOSE = 0, EAR_L = 7, EAR_R = 8, SH_L = 11, SH_R = 12, EL_L = 13, EL_R = 14, WR_L = 15, WR_R = 16, IX_L = 19, IX_R = 20;
  const HIP_L = 23, HIP_R = 24, KN_L = 25, KN_R = 26, AN_L = 27, AN_R = 28;
  const DEPTH = 0.75;      // toward and away from the camera is the tracker's shakiest guess: believe three quarters of it

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sm = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  // What the skeleton is told: which way each arm bone points, numbers for the rest of the pose (the same
  // names dance.js uses), and how far to believe each part (0: can't see it, 1: clear as day).
  function createGuide() {
    const down = () => [0, -1, 0];
    return {
      on: false, seen: 0, wArmL: 0, wArmR: 0, wLegs: 0, wTorso: 0, wHead: 0,
      armL: down(), foreL: down(), handL: down(), armR: down(), foreR: down(), handR: down(),
      pose: { hx: 0, hy: 0, hz: 0, hrx: 0, hry: 0, hrz: 0, srx: 0, sry: 0, srz: 0, crx: 0, cry: 0, crz: 0, nrx: 0, nry: 0, nrz: 0,
        fLx: 0, fLy: 0, fLz: 0, fLr: 0, fRx: 0, fRy: 0, fRz: 0, fRr: 0, kL: 0.25, kR: 0.25, air: 0 },
      floor: 0, legImg: 0,
    };
  }

  // One reading from the tracker into the guide.
  //   world: 33 points in metres, hips at the middle, y down, nearer the camera is smaller z
  //   image: the same 33 as places in the picture (0 to 1)
  //   aspect: the picture's width over its height
  //   R: his own measurements (see stage.js)
  function read(g, world, image, aspect, dt, R) {
    const at = (i, depth) => [-world[i].x, -world[i].y, -world[i].z * (depth === undefined ? DEPTH : depth)];
    const vis = (i) => { const v = world[i].visibility; return v === undefined ? (image[i].visibility === undefined ? 1 : image[i].visibility) : v; };
    const clear = (...ids) => sm(0.35, 0.65, Math.min(...ids.map(vis)));
    const quick = 1 - Math.exp(-dt * 22), slow = 1 - Math.exp(-dt * 6);
    const p = g.pose, want = {};

    // arms: his left follows their right
    for (const [L, sh, el, wr, ix] of [["L", SH_R, EL_R, WR_R, IX_R], ["R", SH_L, EL_L, WR_L, IX_L]]) {
      const S = at(sh), E = at(el), Wr = at(wr), fore = unit(sub(Wr, E)), finger = unit(sub(at(ix), Wr));
      const turn = (have, to) => { for (let i = 0; i < 3; i++) have[i] += (to[i] - have[i]) * quick; };
      turn(g["arm" + L], unit(sub(E, S)));
      turn(g["fore" + L], fore);
      turn(g["hand" + L], unit([fore[0] + finger[0] * 0.6, fore[1] + finger[1] * 0.6, fore[2] + finger[2] * 0.6]));
      g["wArm" + L] += (clear(sh, el) - g["wArm" + L]) * slow;
    }

    // hips, back and shoulders
    const sL = at(SH_R), sR = at(SH_L), hL = at(HIP_R), hR = at(HIP_L);
    const hipAx = sub(hL, hR), shAx = sub(sL, sR), spine = sub(mid(sL, sR), mid(hL, hR));
    const hips = clear(HIP_L, HIP_R);
    const hrz = Math.atan2(hipAx[1], hipAx[0]) * hips, hry = Math.atan2(-hipAx[2], hipAx[0]) * hips * 0.8;
    const roll = Math.atan2(shAx[1], shAx[0]), yaw = Math.atan2(-shAx[2], shAx[0]);
    // with the hips out of shot (sat at a desk) the tilt of the shoulders is all there is to go on
    const lean = roll + (Math.atan2(-spine[0], spine[1]) - roll) * hips;
    const bend = clamp(Math.atan2(spine[2], spine[1]), -0.3, 0.9) * hips;
    want.hrz = clamp(hrz, -0.6, 0.6); want.hry = clamp(hry, -0.9, 0.9); want.hrx = 0; want.hz = 0;
    want.srz = clamp(lean - hrz, -0.6, 0.6); want.crz = clamp(roll - lean, -0.5, 0.5);
    want.sry = 0; want.cry = clamp((yaw - hry) * 0.8, -0.9, 0.9);
    want.srx = want.crx = bend * 0.5;
    g.wTorso += (clear(SH_L, SH_R) - g.wTorso) * slow;

    // head: the ears give the tilt, and where the nose sits between them gives the turn and the nod
    const eL = at(EAR_R, 1), eR = at(EAR_L, 1), ears = sub(eL, eR), nose = sub(at(NOSE, 1), mid(eL, eR));
    want.nrz = clamp(Math.atan2(ears[1], ears[0]) - roll, -0.7, 0.7);
    // (how far the nose is off centre against how wide apart the ears look: no depth needed, which is as well)
    want.nry = clamp(Math.atan2(nose[0] * 1.5, Math.abs(ears[0]) + 0.02) * 1.4 - (want.hry + want.cry), -1.2, 1.2);
    want.nrx = clamp(Math.atan2(-nose[1], Math.max(0.02, nose[2])) - 0.3 - bend, -0.7, 0.8);
    g.wHead += (clear(NOSE, EAR_L, EAR_R) - g.wHead) * slow;

    // where they are across the picture, in his own size
    const iS = [(image[SH_L].x + image[SH_R].x) / 2, (image[SH_L].y + image[SH_R].y) / 2], iH = [(image[HIP_L].x + image[HIP_R].x) / 2, (image[HIP_L].y + image[HIP_R].y) / 2];
    const wide = Math.abs(image[SH_L].x - image[SH_R].x) * aspect;
    const tall = Math.max(0.08, wide * 1.4 + (Math.hypot((iS[0] - iH[0]) * aspect, iS[1] - iH[1]) - wide * 1.4) * hips);
    const legs = clear(HIP_L, HIP_R, KN_L, KN_R, AN_L, AN_R);
    const across = (0.5 - (iS[0] + (iH[0] - iS[0]) * hips)) * aspect / tall * R.torso * 0.9;
    const room = 0.3 + 1.1 * g.wLegs;
    want.hx = clamp(across, -room, room);

    // legs: each foot goes where theirs is from the hip, the lower one stands on the floor, and the
    // hips sit wherever that leaves them (so a squat is a squat)
    const reach = {};
    for (const [L, s, hip, kn, an] of [["L", 1, HIP_R, KN_R, AN_R], ["R", -1, HIP_L, KN_L, AN_L]]) {
      const H = at(hip), K = at(kn), A = at(an), thigh = sub(K, H);
      const k = R.leg / Math.max(0.3, len(thigh) + len(sub(A, K)));
      const to = sub(A, H).map((x) => x * k), line = unit(to), along = thigh[0] * line[0] + thigh[1] * line[1] + thigh[2] * line[2];
      const off = [thigh[0] - line[0] * along, thigh[1] - line[1] * along, thigh[2] - line[2] * along], bent = len(off);
      // which way the knee points: out to the side against forward
      want["k" + L] = bent < 0.03 ? 0.25 : clamp((s * off[0]) / Math.max(off[2], 0.35 * bent), -1.2, 3);
      reach[L] = to;
    }
    const hipY = R.ankleY - Math.min(reach.L[1], reach.R[1]);
    want.hy = clamp(hipY - R.hipY, -1.3, 0.1);
    for (const [L, s] of [["L", 1], ["R", -1]]) {
      want["f" + L + "x"] = want.hx + s * (R.hipX - R.ankleX) + reach[L][0];
      want["f" + L + "y"] = Math.max(0, hipY + reach[L][1] - R.ankleY);
      want["f" + L + "z"] = reach[L][2];
      want["f" + L + "r"] = 0;
    }
    // a jump: both feet higher in the picture than where the floor has been
    const feet = Math.max(image[AN_L].y, image[AN_R].y), legImg = feet - iH[1];
    if (legs > 0.5) {
      g.legImg = Math.max(legImg, g.legImg + (legImg - g.legImg) * (1 - Math.exp(-dt / 3)));
      g.floor = feet > g.floor || !g.floor ? feet : g.floor + (feet - g.floor) * (1 - Math.exp(-dt / 1.2));
    }
    want.air = g.legImg > 0.05 ? clamp(((g.floor - feet) / g.legImg) * R.leg * 1.3 - 0.05, 0, 1) * legs : 0;
    g.wLegs += (legs - g.wLegs) * slow;

    for (const k in want) p[k] += (want[k] - p[k]) * quick;
    return g;
  }

  // The camera and the tracker. `R` is the skeleton's own measurements.
  function createMirror(R) {
    const g = createGuide();
    let video = null, stream = null, tracker = null, loading = null, lastFrame = -1, lastRun = 0, lastSeen = -9, fails = 0, status = "off";

    async function fetchTracker() {
      const vision = await import(LIB + "/vision_bundle.mjs");
      const files = await vision.FilesetResolver.forVisionTasks(LIB + "/wasm");
      const make = (delegate) => vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
      try { return await make("GPU"); } catch (e) { return make("CPU"); }
    }
    // asks for the camera and shows it in `el`; throws what getUserMedia throws
    async function camera(el) {
      if (g.on || status === "asking") return;
      status = "asking";
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
      } catch (e) { status = "off"; throw e; }
      video = el;
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      if (track) track.addEventListener("ended", stop);      // unplugged, or permission taken away
      try { await video.play(); } catch (e) { /* it plays once it can */ }
      g.on = true; g.floor = 0; g.legImg = 0; fails = 0; lastSeen = -9;
      status = tracker ? "looking" : "loading";
    }
    // fetches the tracker (once); the camera can already be showing
    async function load() {
      if (tracker) return;
      try { tracker = await (loading = loading || fetchTracker()); }
      catch (e) { loading = null; stop(); status = "failed"; throw new Error("His eyes didn’t load. Check your connection and try again."); }
      if (g.on) status = "looking";
    }
    function stop() {
      if (stream) for (const t of stream.getTracks()) t.stop();
      if (video) video.srcObject = null;
      stream = null; g.on = false; status = "off";
    }
    // once a frame: look at the newest picture (thirty times a second at most) and bring the guide up to date
    function tick(now, dt) {
      if (g.on && tracker && video && video.readyState >= 2 && video.currentTime !== lastFrame && now - lastRun > 1 / 32) {
        const since = Math.min(0.2, now - lastRun);
        lastRun = now; lastFrame = video.currentTime;
        try {
          const res = tracker.detectForVideo(video, now * 1000);
          if (res && res.worldLandmarks && res.worldLandmarks[0] && res.landmarks && res.landmarks[0]) {
            read(g, res.worldLandmarks[0], res.landmarks[0], (video.videoWidth || 4) / (video.videoHeight || 3), since, R);
            lastSeen = now;
          }
          fails = 0;
        } catch (e) { if (++fails > 8) { stop(); status = "failed"; } }
      }
      const there = g.on && now - lastSeen < 0.5;
      g.seen += ((there ? 1 : 0) - g.seen) * Math.min(1, dt * (there ? 5 : 2.5));
      if (g.on && tracker) status = there ? "copying" : "looking";
      return g;
    }
    return { guide: g, camera, load, stop, tick, get status() { return status; } };
  }

  const api = { createGuide, read, createMirror };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.SK = root.SK || {}).mirrorKit = api;
})(typeof window !== "undefined" ? window : globalThis);
