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
    // Saturday Night Fever, the whole bit: point at the sky, point at the floor, twice over; roll the
    // arms; then hold the point for the "ah, ah, ah, ah"
    stayinAlive(ph, p) {
      const c = ph % 8, h = hit(ph);
      p.snap = 1; p.hy = -0.06 - 0.05 * h; p.kL = p.kR = 0.35;
      p.aLa = 0.75; p.aLz = -1.75; p.aLb = 0.2;                       // left hand planted on the hip
      if (c >= 4 && c < 6) {
        const s = sn(ph, 2);
        p.aLz = 0; p.aLf = p.aRf = 1.0; p.aLa = p.aRa = 0.12; p.aLb = 1.6 + 0.55 * sn(ph, 0.5); p.aRb = 1.6 - 0.55 * sn(ph, 0.5);
        p.hx = 0.1 * s; p.hrz = -0.1 * s; p.crz = 0.14 * s; p.nrz = 0.1 * s; p.crx = 0.12; p.jaw = 0.25;
        return;
      }
      const hold = c >= 6, up = hold || Math.floor(c) % 2 === 0, d = up ? 1 : -1, ah = hold ? hit(ph * 2, 2) : 0;
      p.aRa = up ? 2.5 : -1.0; p.aRf = up ? 0 : 0.6; p.aRb = up ? 0 : 0.1; p.aRh = 0.5 * ah;
      p.hx = 0.16 * d; p.hrz = -0.2 * d; p.srz = 0.16 * d; p.crz = up ? 0.06 : -0.14; p.cry = up ? -0.15 : 0.4; p.hz = 0.07 * ah;
      p.fLx = 0.14; p.fRx = -0.14; p.hy = (up ? -0.04 : -0.14) - 0.04 * h;
      p.nry = -0.5 * d; p.nrx = up ? -0.2 : 0.3; p.fRy = up ? 0 : 0.05; p.kR = up ? 0.35 : -0.1;
      p.jaw = hold ? 0.75 * ah : 0.3 * hit(ph, 4);
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

    // ---- and a lot more, so he isn't doing the same eight things all night ----
    // Y, M, C, A: one letter a beat
    ymca(ph, p) {
      const T = [[2.55, 0, 2.55, 0, 0], [2.0, -2.1, 2.0, -2.1, 0], [2.9, -0.9, -0.5, -0.6, 0.2], [2.75, -0.75, 2.75, -0.75, 0]][Math.floor(ph) % 4];
      p.aLa = T[0]; p.aLz = T[1]; p.aRa = T[2]; p.aRz = T[3]; p.srz = T[4]; p.aLb = p.aRb = 0; p.snap = 1;
      p.hy = -0.04 - 0.05 * hit(ph); p.hx = 0.06 * sn(ph, 4); p.jaw = 0.5 * hit(ph, 2);
    },
    // both arms out to one side like claws, shuffling after them: the graveyard one
    zombie(ph, p) {
      const d = Math.floor(ph / 4) % 2 ? -1 : 1, near = d > 0 ? "L" : "R", far = d > 0 ? "R" : "L";
      p["a" + near + "a"] = 1.25; p["a" + near + "f"] = 0.5; p["a" + far + "a"] = -1.0; p["a" + far + "f"] = 0.9;
      p.aLh = p.aRh = 0.9; p.aLb = p.aRb = 0.45;
      p.nrz = -0.22 * d; p.srz = 0.1 * d; p.hx = 0.1 * d + 0.05 * sn(ph, 2); p.crz = 0.1 * sn(ph, 1);
      p.hy = -0.1 - 0.04 * hit(ph); p.fLy = 0.05 * hit(ph * 0.5, 3); p.fRy = 0.05 * hit(ph * 0.5 + 0.5, 3); p.jaw = 0.5;
    },
    runningMan(ph, p) {
      const up = Math.sin(Math.PI * fr(ph)), L = Math.floor(ph) % 2 === 0 ? "L" : "R", R = L === "L" ? "R" : "L";
      p["f" + L + "y"] = 0.4 * up; p["f" + L + "z"] = 0.25 * up; p["f" + R + "z"] = -0.2 * fr(ph);
      p.hy = -0.08; p.crx = 0.12; p.aLf = 0.7 * sn(ph, 2); p.aRf = -0.7 * sn(ph, 2); p.aLb = p.aRb = 1.4;
    },
    // heels and toes in and out, the rave shuffle
    shuffle(ph, p) {
      const v = sn(ph, 1), wide = 0.5 + 0.5 * v;
      p.fLx = 0.16 * wide; p.fRx = -0.16 * wide; p.fLr = p.fRr = 0.6 * v; p.air = 0.04 * Math.abs(v); p.hy = -0.1;
      p.aLf = 0.4 + 0.3 * sn(ph, 2); p.aRf = 0.4 - 0.3 * sn(ph, 2); p.aLb = p.aRb = 1.0; p.nrx = 0.15 * hit(ph);
    },
    // big fish, little fish, cardboard box
    bigFish(ph, p) {
      const step = Math.floor(ph) % 4;
      p.aLf = p.aRf = 0.9; p.aLb = p.aRb = 0.7; p.aLa = p.aRa = step === 0 ? 0.55 : step === 1 ? 0.1 : 0.38;
      if (step === 2) p.aLb = p.aRb = 1.5;
      if (step === 3) { p.aLb = 1.9; p.aRb = 0.4; }
      p.snap = 1; p.hy = -0.05 - 0.05 * hit(ph); p.nrx = 0.15 * hit(ph);
    },
    // one hand behind the head, the other arm out, turning in jerks like a garden sprinkler
    sprinkler(ph, p) {
      const q = Math.floor(ph * 2) % 8, turn = q < 6 ? -0.5 + q * 0.2 : 0.7 - (q - 5) * 0.6;
      p.aLa = 2.2; p.aLz = -2.2; p.aRa = 1.5; p.aRb = 0; p.cry = turn; p.hry = turn * 0.4; p.snap = 1;
      p.hy = -0.06 - 0.03 * hit(ph * 2);
    },
    dab(ph, p) {
      const d = Math.floor(ph / 2) % 2 ? -1 : 1, k = sm(0, 0.3, ph % 2), near = d > 0 ? "L" : "R", far = d > 0 ? "R" : "L";
      p["a" + near + "a"] = 0.1 + 2.1 * k; p["a" + far + "a"] = 0.1 + 1.4 * k; p["a" + far + "z"] = -2.4 * k; p.aLb = p.aRb = 0.05;
      p.nrx = 0.5 * k; p.nrz = -0.3 * d * k; p.srz = 0.15 * d * k; p.hy = -0.05 - 0.06 * hit(ph, 2);
    },
    // low and loose, head going, arms hanging forward
    bounce(ph, p) {
      p.hy = -0.12 - 0.07 * hit(ph, 2); p.crx = 0.25; p.nrx = 0.3 * hit(ph, 2); p.crz = 0.12 * sn(ph, 2); p.hx = 0.05 * sn(ph, 2);
      p.aLf = p.aRf = 0.45 + 0.1 * sn(ph, 1); p.aLb = p.aRb = 0.5; p.kL = p.kR = 0.6; p.fLx = 0.08; p.fRx = -0.08;
    },
    // a wave that runs in one hand, across his shoulders and out the other
    armWave(ph, p) {
      const a = TAU * ph / 2;
      p.aLa = 1.45 + 0.15 * Math.sin(a); p.aLz = 0.45 * Math.sin(a - 0.9); p.aLh = 0.7 * Math.sin(a - 1.8);
      p.aRa = 1.45 - 0.15 * Math.sin(a - 2.6); p.aRz = -0.45 * Math.sin(a - 3.4); p.aRh = -0.7 * Math.sin(a - 4.2);
      p.aLb = p.aRb = 0; p.crz = 0.08 * Math.sin(a - 2.2); p.nrz = 0.1 * Math.sin(a - 2.2); p.hy = -0.04 - 0.02 * hit(ph);
    },
    // all in the hips
    hipSway(ph, p) {
      const s = sn(ph, 2), c = sn(ph, 2, 0.25);
      p.hx = 0.1 * s; p.hrz = 0.16 * s; p.hry = 0.22 * c; p.srz = -0.18 * s; p.crz = -0.04 * s; p.fLz = 0.08 * c; p.fRz = -0.08 * c;
      p.hy = -0.07 - 0.02 * hit(ph); p.aLa = p.aRa = 0.45; p.aLb = p.aRb = 1.5; p.aLf = 0.2 + 0.15 * c; p.aRf = 0.2 - 0.15 * c;
    },
    charleston(ph, p) {
      const s = sn(ph, 2), v = sn(ph, 1);
      p.fLz = 0.35 * s; p.fRz = -0.35 * s; p.fLy = 0.16 * Math.max(0, s); p.fRy = 0.16 * Math.max(0, -s); p.fLr = p.fRr = 0.5 * v;
      p.kL = p.kR = 0.2 + 0.6 * v; p.aLf = -0.8 * s; p.aRf = 0.8 * s; p.aLa = p.aRa = 0.35; p.aLb = p.aRb = 0.3;
      p.hy = -0.1 - 0.03 * hit(ph); p.crx = 0.1; p.jaw = 0.3;
    },
    // gliding sideways without, apparently, moving his feet
    moonwalk(ph, p) {
      p.hx = 0.28 * sn(ph, 8); p.fLx = 0.28 * sn(ph - 0.5, 8); p.fRx = 0.28 * sn(ph + 0.5, 8);
      p.fLy = 0.06 * hit(ph * 0.5, 2); p.fRy = 0.06 * hit(ph * 0.5 + 0.5, 2); p.hy = -0.05; p.crx = 0.12; p.nrx = 0.2;
      p.aLf = 0.3 * sn(ph, 2); p.aRf = -0.3 * sn(ph, 2); p.aRa = 0.2;
    },
    // arms out, palms up, shoulders, head, hips, bum, wiggle, hop
    macarena(ph, p) {
      const step = Math.floor(ph) % 16;
      const POSE = { fwd: [0.1, 1.5, 0.05, 0], cross: [-0.3, 1.0, 1.9, 0], head: [2.1, 0, 0, -2.2], hip: [-0.45, 0.5, 0.7, 0], bum: [0.5, -0.2, 0, -1.3] };
      const at = (n) => (n < 0 ? null : n < 4 ? POSE.fwd : n < 6 ? POSE.cross : n < 8 ? POSE.head : n < 10 ? POSE.hip : POSE.bum);
      const set = (L, v) => { if (v) { p["a" + L + "a"] = v[0]; p["a" + L + "f"] = v[1]; p["a" + L + "b"] = v[2]; p["a" + L + "z"] = v[3]; } };
      set("R", at(step)); set("L", at(step - 1));
      p.snap = 1; p.hy = -0.05 - 0.04 * hit(ph);
      if (step >= 12 && step < 15) { p.hx = 0.1 * sn(ph, 1); p.hrz = 0.15 * sn(ph, 1); }
      if (step === 15) { p.air = 0.16 * Math.sin(Math.PI * fr(ph)); p.jaw = 0.6; }
    },
    // riding an invisible horse, then swinging an invisible lasso
    gangnam(ph, p) {
      const s = sn(ph, 2);
      p.fLx = 0.2; p.fRx = -0.2; p.fLy = 0.14 * Math.max(0, s); p.fRy = 0.14 * Math.max(0, -s); p.kL = p.kR = 0.7;
      p.hy = -0.16 + 0.04 * Math.abs(sn(ph, 1)); p.nrx = 0.15 * hit(ph);
      p.aLf = p.aRf = 0.75; p.aLa = p.aRa = -0.15; p.aLb = p.aRb = 0.6 + 0.3 * hit(ph * 2, 2);
      if (ph % 8 >= 4) { p.aRa = 2.6; p.aRb = 0.1; p.aRz = 0.5 * sn(ph, 1); p.aRf = 0.4 * sn(ph, 1, 0.25); }
    },
    // side to side, elbows in, forearms swinging across: you know the one
    rickSway(ph, p) {
      const s = sn(ph, 2);
      p.hx = 0.09 * s; p.hrz = -0.05 * s; p.cry = 0.15 * s; p.nrz = 0.08 * s; p.hy = -0.05 - 0.03 * hit(ph);
      p.aLb = p.aRb = 1.4; p.aLf = p.aRf = 0.3; p.aLa = 0.25 + 0.3 * s; p.aRa = 0.25 - 0.3 * s;
      p.fLy = 0.04 * hit(ph * 0.5, 3); p.fRy = 0.04 * hit(ph * 0.5 + 0.5, 3);
    },
    // straight arms one way, hips the other, very fast
    floss(ph, p) {
      const s = sn(ph, 1);
      p.aLa = 0.1 + 0.55 * s; p.aRa = 0.1 - 0.55 * s; p.aLf = 0.35 * sn(ph, 2); p.aRf = -0.35 * sn(ph, 2); p.aLb = p.aRb = 0.05;
      p.hx = -0.1 * s; p.hrz = 0.12 * s; p.crz = -0.06 * s; p.hy = -0.06;
    },
    // step, touch, and a clap over his head on two and four
    sideClap(ph, p) {
      const clap = hit(ph * 0.5 + 0.5, 4);
      p.hx = 0.14 * sn(ph, 4); p.fLx = 0.14 * sn(ph - 0.35, 4); p.fRx = 0.14 * sn(ph + 0.35, 4);
      p.fLy = 0.06 * hit(ph * 0.5 + 0.25, 2); p.fRy = 0.06 * hit(ph * 0.5 + 0.75, 2); p.hy = -0.05 - 0.04 * hit(ph);
      p.aLa = p.aRa = 1.2 + 1.6 * clap; p.aLz = p.aRz = -0.55 * clap; p.aLb = p.aRb = 0.1; p.jaw = 0.4 * clap;
    },
    airDrums(ph, p) {
      p.aLf = p.aRf = 0.9; p.aLa = 0.35; p.aRa = 0.35 + 0.9 * hit(ph / 4, 6);
      p.aLb = 1.5 - 0.9 * hit(ph, 3); p.aRb = 1.5 - 0.9 * hit(ph + 0.5, 3);
      p.nrx = 0.25 * hit(ph); p.fRy = 0.07 * hit(ph, 4); p.hy = -0.1; p.crx = 0.15; p.jaw = 0.3 * hit(ph, 2);
    },
    // one arm going right round like a windmill, the other holding the neck of a guitar
    windmill(ph, p) {
      const a = TAU * ph / 2;
      p.aRa = 1.57 - 1.57 * Math.cos(a); p.aRf = 0.9 * Math.sin(a); p.aRb = 0.05;
      p.aLa = 1.05; p.aLf = 0.5; p.aLz = 0.35;
      p.fLx = 0.14; p.fRx = -0.14; p.kL = p.kR = 0.5; p.hy = -0.14 - 0.03 * hit(ph); p.nrx = -0.2; p.jaw = 0.4;
    },
    // heel taps and swinging arms, then the goggles
    griddy(ph, p) {
      const up = Math.sin(Math.PI * fr(ph)), L = Math.floor(ph) % 2 === 0 ? "L" : "R";
      p["f" + L + "z"] = 0.3 * up; p["f" + L + "y"] = 0.06 * up; p.air = 0.05 * up; p.crx = -0.12; p.hy = -0.06;
      p.aLf = p.aRf = 0.6 * sn(ph, 2); p.aLb = p.aRb = 0.4; p.aLa = p.aRa = 0.2;
      if (ph % 8 >= 6) { p.aLa = p.aRa = 0.55; p.aLf = p.aRf = 1.35; p.aLb = p.aRb = 2.1; p.nrx = 0.1; }
    },
    // a brother and sister's school dance routine, performed with total commitment: hands on knees,
    // rolling arms, pointing at the ceiling, and a big finish
    routine(ph, p) {
      const c = ph % 8, q = sn(ph, 0.5);
      p.hy = -0.05 - 0.04 * hit(ph);
      if (c < 2) { p.hy = -0.22; p.crx = 0.5; p.nrx = -0.4; p.aLf = p.aRf = 0.75; p.aLb = p.aRb = 0.2; p.aLa = p.aRa = 0.05; p.kL = p.kR = 0.2 + 0.7 * q; p.hx = 0.05 * q; }
      else if (c < 4) { p.aLf = p.aRf = 1.0; p.aLa = p.aRa = 0.1; p.aLb = 1.6 + 0.5 * q; p.aRb = 1.6 - 0.5 * q; p.hx = 0.08 * sn(ph, 2); p.crz = 0.08 * sn(ph, 2); }
      else if (c < 6) {
        const up = c < 5 ? "R" : "L", hip = c < 5 ? "L" : "R", d = c < 5 ? -1 : 1;
        p["a" + up + "a"] = 2.7; p["a" + up + "b"] = 0; p["a" + hip + "a"] = 0.75; p["a" + hip + "z"] = -1.75; p.hx = 0.09 * d; p.hrz = -0.1 * d; p.snap = 1; p.jaw = 0.4;
      } else if (c < 7) { p.aLa = p.aRa = 2.6; p.aLh = p.aRh = 0.6 * sn(ph, 0.25); p.jaw = 0.6; }
      else { p.air = 0.2 * Math.sin(Math.PI * fr(ph)); p.aLa = p.aRa = 1.6; p.jaw = 0.8; }
    },
    // elbows in, forearms going like pistons, head like a chicken: a man in a brown suit at a disco
    bean(ph, p) {
      const s = sn(ph, 1);
      p.aLa = p.aRa = 0.12; p.aLf = p.aRf = 0.1; p.aLb = 1.5 + 0.55 * s; p.aRb = 1.5 - 0.55 * s;
      p.crx = 0.18; p.crz = 0.1 * s; p.hdx = 0.05 * sn(ph, 1, 0.25); p.nrx = -0.15 + 0.2 * hit(ph);
      p.hx = 0.07 * s; p.hrz = 0.1 * s; p.hy = -0.1 - 0.05 * hit(ph, 2); p.kL = p.kR = -0.1; p.fLr = p.fRr = 0.25 * s;
    },
    hipThrust(ph, p) {
      const h = hit(ph, 2);
      p.hz = 0.2 * h; p.hrx = -0.4 * h; p.srx = 0.25 * h; p.crx = 0.1 * h; p.nrx = -0.15 * h; p.hy = -0.12;
      p.kL = p.kR = 0.6; p.fLx = 0.1; p.fRx = -0.1; p.aLa = p.aRa = 0.4; p.aLb = p.aRb = 1.3; p.aLf = p.aRf = 0.5 - 1.0 * h; p.jaw = 0.4 * h;
    },
  };
  // how hard each one goes, 0 to 1: quiet passages get the low ones and loud ones the high
  const HEAT = {
    sway: 0.2, nodSnap: 0.25, armWave: 0.3, hipSway: 0.4, stepTouch: 0.4, rickSway: 0.45, moonwalk: 0.45, sideClap: 0.5, bounce: 0.5, robot: 0.5,
    egyptian: 0.5, rattle: 0.5, zombie: 0.5, twist: 0.6, discoPoint: 0.6, shimmy: 0.6, kneeKnock: 0.6, sprinkler: 0.6, macarena: 0.6, bigFish: 0.65,
    charleston: 0.7, ymca: 0.7, dab: 0.7, airDrums: 0.75, floss: 0.8, runningMan: 0.8, shuffle: 0.8, windmill: 0.8, armsWave: 0.8, fistPump: 0.85,
    gangnam: 0.85, headbang: 0.9, kicks: 0.9, headPop: 0.9, pogo: 1, bean: 0.55, hipThrust: 0.65, routine: 0.7, griddy: 0.75, stayinAlive: 0.65,
  };
  // what kind of music it is decides which dances are on the table (beat.js guesses the kind from the title)
  const STYLES = {
    chill: ["sway", "nodSnap", "armWave", "hipSway", "stepTouch", "moonwalk", "rickSway"],
    disco: ["stayinAlive", "discoPoint", "stepTouch", "twist", "shimmy", "sideClap", "sprinkler", "hipSway", "kneeKnock", "armsWave", "charleston", "armWave", "hipThrust", "routine", "bean"],
    pop: ["stepTouch", "sideClap", "floss", "rickSway", "twist", "shimmy", "runningMan", "robot", "egyptian", "bigFish", "sprinkler", "kneeKnock", "armsWave", "headPop", "dab", "moonwalk", "sway", "pogo", "griddy", "routine", "bean", "hipThrust"],
    rock: ["headbang", "airDrums", "windmill", "fistPump", "pogo", "kicks", "twist", "kneeKnock", "headPop", "nodSnap", "stepTouch", "hipThrust", "bean"],
    rave: ["fistPump", "shuffle", "runningMan", "bigFish", "pogo", "armsWave", "robot", "floss", "headPop", "bounce", "armWave", "griddy"],
    hiphop: ["bounce", "armWave", "dab", "robot", "runningMan", "nodSnap", "floss", "moonwalk", "kneeKnock", "sway", "griddy", "hipThrust"],
    latin: ["hipSway", "stepTouch", "shimmy", "sideClap", "twist", "armsWave", "sway", "hipThrust"],
    spooky: ["rattle", "kneeKnock", "zombie", "headPop", "charleston", "egyptian", "shimmy", "kicks", "robot", "sway", "pogo", "bean"],
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

  // which parts of the pose Copy me speaks for (see mirror.js)
  const TORSO = ["hx", "hrz", "hry", "srx", "sry", "srz", "crx", "cry", "crz"], HEAD = ["nrx", "nry", "nrz"];
  const LEGS = ["hy", "hz", "hrx", "air", "fLx", "fLy", "fLz", "fLr", "fRx", "fRy", "fRz", "fRr", "kL", "kR"];

  SK.createDance = function () {
    const neutral = P(), now = P(), a = P(), b = P(), out = P();
    const keys = Object.keys(neutral);
    const heap = new Float32Array(NB), fallAt = new Float32Array(NB);
    const names = Object.keys(B);
    let cur = "sway", prev = "sway", curStart = 0, phrase = -1, live = 0, startled = 0, talking = 0, tada = 0, leap = 0, statue = 0, wasGoing = false, vigour = 0;
    const lately = [];
    let poked = null, limb = null;
    let fall = { phase: "up", t: 0 }, landed = false, pinned = false;

    // The next dance: one that suits the kind of music, as lively as the music is right now, and not one
    // he's just done. A song with a dance of its own (Y.M.C.A., Thriller...) gets it every third phrase.
    function choose(c, n) {
      if (c.signature && MOVES[c.signature] && n % 2 === 0 && cur !== c.signature) return c.signature;
      const pool = STYLES[c.style] || STYLES.pop;
      // phrases build like a song does: a bit more each time, biggest on the fourth
      const want = Math.min(1, c.energy * [0.85, 1, 0.92, 1.15][((n % 4) + 4) % 4]);
      let pick = pool[0], best = -1;
      for (const name of pool) {
        if (name === cur || lately.includes(name)) continue;
        const w = Math.exp(-Math.pow((HEAT[name] - want) / 0.22, 2)) * (0.35 + Math.random());
        if (w > best) { best = w; pick = name; }
      }
      lately.push(pick);
      if (lately.length > Math.min(4, pool.length - 2)) lately.shift();
      return pick;
    }
    const fill = (p, name, ph, energy) => {
      for (const k of keys) p[k] = neutral[k];
      p.snap = 0;
      MOVES[name](ph, p);
      const amp = Math.min(1.15, 0.55 + 0.6 * energy);
      for (const k of keys) if (k !== "spin") p[k] = neutral[k] + (p[k] - neutral[k]) * amp;
    };

    // c: { beat, bpm, vibe, energy, going, lookX, lookY, t }. Returns { pose, heap, landed }.
    function step(dt, c) {
      // very fast songs are danced at half speed, very slow ones at double
      const db = c.beat * (c.bpm > 150 ? 0.5 : c.bpm < 72 ? 2 : 1);
      const n = Math.floor(db / 8);
      if (c.going && !pinned && n !== phrase) {
        phrase = n;
        prev = cur;
        cur = choose(c, n);
        curStart = db;
      }
      // The music stopped: he freezes exactly where he is, like musical statues, wobbles a bit trying to
      // hold it, and only then gives up and stands about.
      if (wasGoing && !c.going) statue = 2.4;
      if (c.going) { statue = 0; vigour = c.energy; }
      else statue = Math.max(0, statue - dt);
      wasGoing = c.going;
      const frozen = !c.going && statue > 0;
      fill(a, cur, db, vigour);
      const w = sm(0, 0.75, db - curStart);
      if (w < 1) {
        fill(b, prev, db, vigour);
        for (const k of keys) a[k] = k === "spin" ? (w > 0.5 ? a[k] : b[k]) : b[k] + (a[k] - b[k]) * w;
        a.snap = Math.max(a.snap, b.snap);
      }
      for (const k of keys) b[k] = neutral[k];
      idle(c.t, b, c);
      live += ((c.going || frozen ? 1 : 0) - live) * Math.min(1, dt * 2.5);
      for (const k of keys) out[k] = k === "spin" ? (live > 0.5 ? a[k] : 0) : b[k] + (a[k] - b[k]) * live;

      // whatever the move, the beat goes through him: a dip in the knees and a nod on every one
      const pulse = hit(c.beat, 2) * vigour * live;
      if (frozen) { out.hrz += 0.012 * Math.sin(c.t * 11); out.aLa += 0.025 * Math.sin(c.t * 13 + 1); out.aRa += 0.025 * Math.sin(c.t * 12); out.nrz += 0.015 * Math.sin(c.t * 9 + 2); }
      out.hy -= 0.045 * pulse; out.nrx += 0.09 * pulse; out.crx += 0.03 * pulse; out.aLa += 0.05 * pulse; out.aRa += 0.05 * pulse;
      // a drum he actually heard: shoulders pop and his teeth clack
      const heard = (c.hit || 0) * live;
      out.crx -= 0.05 * heard; out.hy -= 0.02 * heard; out.jaw = Math.max(out.jaw, heard * 0.45);
      // the drop: straight up in the air, arms to the sky
      if (leap > 0) {
        leap = Math.max(0, leap - dt / 0.7);
        const u = Math.sin(Math.PI * (1 - leap));
        out.air += 0.38 * u; out.aLa += (2.8 - out.aLa) * u; out.aRa += (2.8 - out.aRa) * u; out.jaw = Math.max(out.jaw, u);
      }

      // Copy me: where the camera can see their body, his goes where theirs is. (The arms are pointed
      // straight at theirs afterwards, in rig.follow; this is the rest of him.) Legs it can't see carry
      // on dancing by themselves.
      const g = c.mirror;
      if (g && g.seen > 0.01) {
        const gp = g.pose;
        for (const k of TORSO) out[k] += (gp[k] - out[k]) * g.wTorso * g.seen;
        for (const k of HEAD) out[k] += (gp[k] - out[k]) * g.wHead * g.seen;
        for (const k of LEGS) out[k] += (gp[k] - out[k]) * g.wLegs * g.seen;
      }
      // the camera's on and there's nobody there: hand to his brow, looking for them
      if (g && g.on) {
        const k = (1 - g.seen) * (1 - live);
        out.aRa += (0.75 - out.aRa) * k; out.aRf += (1.0 - out.aRf) * k; out.aRb += (2.3 - out.aRb) * k; out.aRz *= 1 - k; out.aRh += (-0.5 - out.aRh) * k;
        out.nry += (0.7 * Math.sin(c.t * 0.9) - out.nry) * k; out.cry += (0.25 * Math.sin(c.t * 0.9) - out.cry) * k; out.crx += 0.14 * k; out.nrx += 0.1 * k;
      }

      // Poked: every part of him takes it differently.
      if (poked) {
        const u = (poked.t += dt), L = poked.side > 0 ? "L" : "R";
        let over = 1;
        if (poked.part === "head") {            // it pops off, spins once and lands back on
          over = 0.9;
          const up = Math.sin((Math.PI * Math.min(u, over)) / over);
          out.pop += 0.45 * up; out.spin = TAU * sm(0.05, 0.85, u); out.jaw = Math.max(out.jaw, up);
        } else if (poked.part === "jaw") {      // his teeth chatter
          over = 1.2;
          out.jaw = Math.max(out.jaw, Math.abs(Math.sin(u * 28)) * (1 - u / over));
        } else if (poked.part === "chest") {    // ticklish: he hugs his ribs and shakes with laughing
          over = 1.3;
          const k = 1 - u / over;
          out.crz += 0.13 * Math.sin(u * 55) * k; out.hy -= 0.06 * k; out.jaw = Math.max(out.jaw, Math.abs(Math.sin(u * 20)) * k);
          for (const s of ["L", "R"]) { out["a" + s + "a"] += (0.05 - out["a" + s + "a"]) * k; out["a" + s + "f"] += (0.6 - out["a" + s + "f"]) * k; out["a" + s + "b"] += (1.9 - out["a" + s + "b"]) * k; out["a" + s + "z"] *= 1 - k; }
        } else if (poked.part === "pelvis") {   // two sharp thrusts
          over = 0.9;
          const h = Math.pow(Math.abs(Math.sin((TAU * u) / over)), 2);
          out.hz += 0.2 * h; out.hrx -= 0.4 * h; out.srx += 0.25 * h; out.jaw = Math.max(out.jaw, 0.5 * h);
        } else if (poked.part === "leg") {      // the knee reflex: that foot shoots out
          over = 0.5;
          const k = Math.sin((Math.PI * u) / over);
          out["f" + L + "z"] += 0.55 * k; out["f" + L + "y"] += 0.35 * k; out["f" + L + "x"] += poked.side * 0.2 * k;
        } else if (poked.part === "foot") {     // ow: he grabs it and hops about on the other one
          over = 1.4;
          const k = sm(0, 0.15, u) * (1 - sm(1.1, 1.4, u));
          out["f" + L + "y"] += 0.5 * k; out["f" + L + "x"] -= poked.side * 0.12 * k; out.air += 0.07 * Math.abs(Math.sin(u * 14)) * k;
          out.aLa += 1.1 * k; out.aRa += 1.1 * k; out.jaw = Math.max(out.jaw, k);
        } else if (poked.part === "arm") {      // it drops off (see the heap, below); he stares at where it was
          over = 1.55;
          const k = sm(0, 0.2, u) * (1 - sm(1.2, 1.5, u));
          out.nry += poked.side * 0.6 * k; out.nrx += 0.25 * k; out.jaw = Math.max(out.jaw, k);
        }
        if (u >= over) poked = null;
      }

      // a poke makes him jump; typing makes his jaw go
      startled *= Math.exp(-dt * 3.5); talking *= Math.exp(-dt * 9); tada *= Math.exp(-dt * 1.8);
      out.aLa += 1.6 * startled; out.aRa += 1.6 * startled; out.pop += 0.1 * startled; out.hy += 0.05 * startled;
      out.jaw = Math.max(out.jaw, startled, talking * 0.8, tada);
      out.aLa += (1.5 - out.aLa) * tada; out.aRa += (1.5 - out.aRa) * tada; out.aLz += (0.3 - out.aLz) * tada; out.aRz += (0.3 - out.aRz) * tada;

      const quick = a.snap || (g && g.seen > 0.5) ? 3 : 1;      // copying someone, he keeps up
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
      } else if (limb) {
        // one arm on its own: off, on the floor for a second, and back with a snap
        limb.t += dt;
        const back = Math.min(1, Math.max(0, (limb.t - 1.2) / 0.35));
        const k = limb.t < 1.2 ? sm(0, 0.3, limb.t) : Math.max(0, 1 - (1 + 2.2 * Math.pow(back - 1, 3) + 1.2 * Math.pow(back - 1, 2)));
        for (const i of limb.bones) heap[i] = k;
        if (back >= 1) { for (const i of limb.bones) heap[i] = 0; limb = null; }
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
      // name: the bone that was clicked. Returns which part of him reacted.
      poke(name) {
        const part = /^(head|neck)/.test(name) ? "head" : name === "jaw" ? "jaw" : name === "chest" ? "chest" : /^(spine|pelvis)/.test(name) ? "pelvis" : /^(arm|fore|hand)/.test(name) ? "arm" : /^(thigh|shin)/.test(name) ? "leg" : "foot";
        const side = name.endsWith("L") ? 1 : name.endsWith("R") ? -1 : 0;
        if (fall.phase !== "up") return "";
        poked = { part, side, t: 0 };
        if (part === "arm" && !limb) { const L = side > 0 ? "L" : "R"; limb = { bones: [B["arm" + L], B["fore" + L], B["hand" + L]], t: 0 }; }
        return part;
      },
      drop() { leap = 1; },
      talk() { talking = 1; },
      get move() { return cur; },
      set move(name) { pinned = !!MOVES[name]; if (pinned) { prev = cur; cur = name; } },     // for trying one move out: it stays until set to ""
      moves: Object.keys(MOVES),
    };
  };
})();
