// The skeleton: his bones, what each one looks like, and how a pose becomes a place for every bone.
//
// Each bone has its own space: the joint is the origin and +y runs along the bone. Particles are given
// a home in one bone's space once; after that only the bones move (18 small matrices a frame), and the
// GPU carries every particle along with its bone.
/* global THREE */
(function () {
  "use strict";
  const SK = (window.SK = window.SK || {});
  const FLOOR = -1.8;
  const W = 32;                    // the bone texture is this wide: one column a bone
  const B = { pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4, jaw: 5, armL: 6, foreL: 7, handL: 8, armR: 9, foreR: 10, handR: 11, thighL: 12, shinL: 13, footL: 14, thighR: 15, shinR: 16, footR: 17, air: 18 };
  const NB = 19;

  // ---------- where the joints are at rest (he's 3.6 tall, feet on FLOOR, facing us) ----------
  const J = {
    pelvis: [0, 0.02, 0], spine: [0, 0.2, 0], chest: [0, 0.58, 0], neck: [0, 1.18, 0], head: [0, 1.32, 0], jaw: [0, 1.37, 0],
    shoulder: [0.37, 1.1, 0], elbow: [0.43, 0.5, 0], wrist: [0.47, -0.02, 0], fingertip: [0.48, -0.32, 0],
    hip: [0.19, 0.06, 0], knee: [0.165, -0.82, 0], ankle: [0.15, -1.62, 0], toe: [0.225, -1.755, 0.255],
  };
  const v3 = (a, side) => new THREE.Vector3(a[0] * (side || 1), a[1], a[2]);
  const side2 = (name, parent, from, to, s) => ({ name, parent, pos: v3(J[from], s), dir: v3(J[to], s).sub(v3(J[from], s)), side: s });
  const up = (name, parent, len) => ({ name, parent, pos: v3(J[name]), dir: new THREE.Vector3(0, len, 0), side: 0 });
  const bones = [
    up("pelvis", -1, 0.22), up("spine", B.pelvis, 0.38), up("chest", B.spine, 0.6), up("neck", B.chest, 0.14), up("head", B.neck, 0.48), up("jaw", B.head, 0.1),
    side2("armL", B.chest, "shoulder", "elbow", 1), side2("foreL", B.armL, "elbow", "wrist", 1), side2("handL", B.foreL, "wrist", "fingertip", 1),
    side2("armR", B.chest, "shoulder", "elbow", -1), side2("foreR", B.armR, "elbow", "wrist", -1), side2("handR", B.foreR, "wrist", "fingertip", -1),
    side2("thighL", B.pelvis, "hip", "knee", 1), side2("shinL", B.thighL, "knee", "ankle", 1), side2("footL", B.shinL, "ankle", "toe", 1),
    side2("thighR", B.pelvis, "hip", "knee", -1), side2("shinR", B.thighR, "knee", "ankle", -1), side2("footR", B.shinR, "ankle", "toe", -1),
    { name: "air", parent: -1, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), side: 0 },
  ];

  // A bone's own axes: y along it, z toward the viewer where it can be (up, for the feet).
  const tx = new THREE.Vector3(), ty = new THREE.Vector3(), tz = new THREE.Vector3();
  function aim(m, pos, dir, ref) {
    ty.copy(dir).normalize();
    tx.crossVectors(ty, ref);
    if (tx.lengthSq() < 1e-6) tx.set(1, 0, 0);
    tx.normalize();
    tz.crossVectors(tx, ty);
    return m.makeBasis(tx, ty, tz).setPosition(pos);
  }
  const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
  for (const b of bones) {
    b.len = b.dir.length();
    b.rest = aim(new THREE.Matrix4(), b.pos, b.dir, b.name.startsWith("foot") ? Y : Z);
    b.world = b.rest.clone();
  }
  // each bone's rest place, seen from its parent
  for (const b of bones) b.local = b.parent < 0 ? b.rest.clone() : new THREE.Matrix4().copy(bones[b.parent].rest).invert().multiply(b.rest);

  // ---------- what each bone looks like ----------
  // seg: a tapered rod from a to b. ell: an ellipse (ring: just its band). g: glyph size (1 big, 2 small,
  // 0 none: dust only). z: how far toward his front. tx: an ellipse tipped front-to-back across its
  // width, so it isn't flat. ball: an ellipse that's really a dome that deep (negative: the back of one).
  // He is built to be seen from any side: the ribs are a barrel, the pelvis a bowl, the skull a ball.
  // Holes are cut out of everything on the front of that bone.
  const seg = (ax, ay, bx, by, r0, r1, o) => Object.assign({ t: "seg", a: [ax, ay], b: [bx, by], r0, r1: r1 === undefined ? r0 : r1, g: 1, z: 0 }, o);
  const ell = (cx, cy, rx, ry, o) => Object.assign({ t: "ell", c: [cx, cy], r: [rx, ry], g: 1, z: 0 }, o);
  const shapes = [], holes = [];
  for (let i = 0; i < NB; i++) { shapes.push([]); holes.push([]); }

  // pelvis: two wings, the sacrum between them, and the two loops underneath
  for (const s of [-1, 1]) {
    // (each wing swings forward as it goes out, so from above the pelvis is a bowl open at the front)
    shapes[B.pelvis].push(ell(s * 0.2, 0.11, 0.165, 0.14, { ring: 0.07, w: 1.6, tx: s * 0.75 }), ell(s * 0.2, 0.11, 0.1, 0.08, { g: 0, w: 0.35, tx: s * 0.75 }));
    shapes[B.pelvis].push(ell(s * 0.095, -0.1, 0.085, 0.075, { ring: 0.036, g: 2, z: 0.07 }), ell(s * 0.2, 0.03, 0.05, 0.05, { g: 0 }));
  }
  shapes[B.pelvis].push(seg(0, 0.2, 0, -0.03, 0.075, 0.03, { g: 2, z: -0.09 }));
  // the spine is a stack of little blocks all the way up
  const vertebrae = (bone, n, y0, y1, half, r, z) => {
    for (let i = 0; i < n; i++) { const y = y0 + ((y1 - y0) * i) / Math.max(1, n - 1); shapes[bone].push(seg(-half, y, half, y, r, r, { g: 2, z })); }
  };
  vertebrae(B.spine, 5, 0.035, 0.345, 0.062, 0.03, -0.07);       // the spine runs up his back
  vertebrae(B.chest, 9, 0.02, 0.58, 0.036, 0.021, -0.15);
  vertebrae(B.neck, 3, 0.02, 0.12, 0.04, 0.021, -0.05);
  // ribcage: each rib leaves the spine at the back, swings round the side and comes back in at the front
  const RIBS = [0.19, 0.25, 0.295, 0.32, 0.335, 0.34, 0.335, 0.315, 0.285, 0.245];
  RIBS.forEach((w, i) => {
    const top = 0.565 - i * 0.05, reach = i < 7 ? 1 : [0.78, 0.66, 0.52][i - 7], steps = 9;
    for (const s of [-1, 1]) {
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k <= steps; k++) {
        const u = (k / steps) * reach;
        const x = s * w * Math.sin(Math.PI * (u * 0.94 + 0.03)), y = top - 0.17 * u - 0.03 * Math.sin(Math.PI * u), z = 0.02 - 0.17 * Math.cos(Math.PI * u);
        if (k) shapes[B.chest].push(seg(px, py, x, y, 0.016, 0.016, { g: 2, z: (pz + z) / 2 }));
        px = x; py = y; pz = z;
      }
    }
  });
  shapes[B.chest].push(seg(0, 0.53, 0, 0.21, 0.036, 0.02, { g: 2, z: 0.19 }));
  for (const s of [-1, 1]) {
    shapes[B.chest].push(seg(s * 0.04, 0.55, s * 0.345, 0.585, 0.021, 0.021, { g: 2, z: 0.13 }));
    shapes[B.chest].push(ell(s * 0.27, 0.42, 0.07, 0.115, { ring: 0.02, g: 0, z: -0.17, w: 0.6 }));
  }
  // skull: a round cranium, a narrower face, cheekbones, and a row of teeth
  shapes[B.head].push(ell(0, 0.27, 0.2, 0.215, { ball: 0.2, w: 1.3 }), ell(0, 0.125, 0.135, 0.115, { ball: 0.12 }));
  const skullBack = ell(0, 0.27, 0.2, 0.215, { ball: -0.2, w: 0.5 });      // added after the face and teeth, so a typed word reads down his front first
  for (const s of [-1, 1]) shapes[B.head].push(seg(s * 0.12, 0.165, s * 0.19, 0.205, 0.024, 0.02, { g: 0, z: 0.06 }));
  for (let i = 0; i < 6; i++) shapes[B.head].push(seg(-0.075 + i * 0.03, 0.07, -0.075 + i * 0.03, 0.035, 0.0115, 0.0115, { g: 0, z: 0.1, w: 2 }));
  shapes[B.head].push(skullBack);
  holes[B.head].push({ c: [-0.085, 0.215], r: [0.058, 0.05] }, { c: [0.085, 0.215], r: [0.058, 0.05] }, { c: [0, 0.128], r: [0.026, 0.04] });
  // jaw: a U, and the bottom teeth
  const JAW = [[-0.135, 0.02], [-0.118, -0.05], [-0.07, -0.095], [0, -0.108], [0.07, -0.095], [0.118, -0.05], [0.135, 0.02]];
  // (the chin juts forward and the hinges sit back by his ears: a horseshoe, seen from above)
  for (let i = 1; i < JAW.length; i++) shapes[B.jaw].push(seg(JAW[i - 1][0], JAW[i - 1][1], JAW[i][0], JAW[i][1], 0.025, 0.025, { g: 2, z: 0.12 - 0.13 * Math.abs(JAW[i - 1][0] + JAW[i][0]) / 0.27 }));
  for (let i = 0; i < 6; i++) shapes[B.jaw].push(seg(-0.075 + i * 0.03, -0.012, -0.075 + i * 0.03, -0.045, 0.0115, 0.0115, { g: 0, z: 0.1, w: 2 }));
  // arms and legs: a shaft with a knob at each end; forearm and shin are two bones side by side.
  // Bones that hang down have their x mirrored, so `out` is the side away from the body on both sides.
  for (const s of [-1, 1]) {
    const L = s > 0 ? "L" : "R", out = -s;     // which way local x has to go to point away from the body
    const arm = bones[B["arm" + L]].len, fore = bones[B["fore" + L]].len, thigh = bones[B["thigh" + L]].len, shin = bones[B["shin" + L]].len;
    shapes[B["arm" + L]].push(seg(0, 0.03, 0, arm - 0.03, 0.028, 0.024), ell(0, 0.02, 0.05, 0.05, { g: 0 }), ell(0, arm - 0.012, 0.05, 0.03, { g: 0 }));
    shapes[B["fore" + L]].push(seg(-0.026, 0.02, -0.03, fore, 0.017, 0.019, { g: 2 }), seg(0.026, 0, 0.022, fore - 0.02, 0.018, 0.014, { g: 2 }));
    const hand = shapes[B["hand" + L]];
    hand.push(ell(0, 0.035, 0.05, 0.035, { g: 0 }));
    [[-0.05, -0.1, 0.15], [-0.027, -0.035, 0.25], [-0.003, -0.004, 0.28], [0.02, 0.028, 0.26], [0.042, 0.058, 0.21]].forEach(([x0, x1, tip]) => {
      const mid = 0.07 + (tip - 0.07) * 0.5, xm = x0 + (x1 - x0) * 0.5;
      hand.push(seg(-x0 * out, 0.07, -xm * out, mid - 0.008, 0.011, 0.01, { g: 2 }), seg(-xm * out, mid + 0.008, -x1 * out, tip, 0.01, 0.008, { g: 2 }));   // thumb on the outside
    });
    shapes[B["thigh" + L]].push(seg(0, 0.05, 0, thigh - 0.05, 0.036, 0.03), ell(0, 0, 0.055, 0.055, { g: 0 }), ell(0.055 * out, 0.035, 0.035, 0.04, { g: 0 }));
    shapes[B["thigh" + L]].push(ell(-0.03, thigh - 0.02, 0.036, 0.042, { g: 0 }), ell(0.03, thigh - 0.02, 0.036, 0.042, { g: 0 }));
    shapes[B["shin" + L]].push(seg(-0.012 * out, 0.03, -0.008 * out, shin, 0.03, 0.021), seg(0.045 * out, 0.05, 0.036 * out, shin - 0.01, 0.012, 0.012, { g: 2 }));
    shapes[B["shin" + L]].push(ell(0, 0.022, 0.062, 0.026, { g: 0 }), ell(0, -0.012, 0.034, 0.04, { g: 0, z: 0.05 }), ell(0, shin, 0.045, 0.028, { g: 0 }));
    const foot = shapes[B["foot" + L]];
    foot.push(ell(0, 0.03, 0.05, 0.065, { g: 0, w: 1.4 }));
    [-0.04, -0.02, 0, 0.02, 0.04].forEach((x, i) => {
      const tip = 0.29 - Math.abs(i - 1) * 0.022;
      foot.push(seg(x, 0.085, x * 1.35, 0.19, 0.012, 0.011, { g: 2 }), seg(x * 1.38, 0.205, x * 1.55, tip, 0.011, 0.009, { g: 2 }));
    });
  }

  // ---------- handing out homes ----------
  const R = Math.random;
  const inHole = (bone, x, y, z) => z > 0 && holes[bone].some((h) => ((x - h.c[0]) / h.r[0]) ** 2 + ((y - h.c[1]) / h.r[1]) ** 2 < 1);
  const area = (p) => (p.t === "seg" ? Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) * (p.r0 + p.r1) : p.ring ? Math.PI * (p.r[0] + p.r[1]) * p.ring : Math.PI * p.r[0] * p.r[1]) * (p.w || 1);
  const out3 = [0, 0, 0];
  // one random point on a shape; `rim` keeps it on the outline, which is what makes the edges crisp
  function sample(p, rim) {
    if (p.t === "seg") {
      const t = R(), r = p.r0 + (p.r1 - p.r0) * t, dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], l = Math.hypot(dx, dy) || 1;
      const o = rim ? (R() < 0.5 ? -r : r) : (R() * 2 - 1) * r;
      out3[0] = p.a[0] + dx * t - (dy / l) * o;
      out3[1] = p.a[1] + dy * t + (dx / l) * o;
      out3[2] = p.z + (R() * 2 - 1) * Math.sqrt(Math.max(0, r * r - o * o));
    } else {
      const a = R() * Math.PI * 2;
      const k = p.ring ? 1 - (R() * p.ring) / Math.min(p.r[0], p.r[1]) : rim ? 1 : Math.sqrt(R());
      out3[0] = p.c[0] + Math.cos(a) * p.r[0] * k;
      out3[1] = p.c[1] + Math.sin(a) * p.r[1] * k;
      const deep = p.ball ? p.ball * Math.sqrt(Math.max(0, 1 - k * k)) : Math.min(p.r[0], p.r[1]) * 0.35;
      // a dome's points sit on its shell
      out3[2] = p.z + (p.tx || 0) * (out3[0] - p.c[0]) + (p.ball ? deep * (0.85 + 0.15 * R()) : (R() * 2 - 1) * deep);
    }
  }

  // Lays homes out for n particles. The glyphs come first, in reading order (head to toe, and along
  // each bone), so a typed word can be written along him; then the dust that fills the bones in; then
  // the dust in the air and on the floor.
  //   cell: [big, small] glyph size in world units
  // Returns { home, ang, size, glyphs, counts }: home is xyz in the bone's space and w = bone + 32 * kind
  // + a random in [0, 1) (kind 1 = glyph, 0 = dust).
  function build(n, cell) {
    const home = new Float32Array(n * 4), ang = new Float32Array(n), size = new Float32Array(n);
    let i = 0;
    const put = (bone, x, y, z, kind) => { home[i * 4] = x; home[i * 4 + 1] = y; home[i * 4 + 2] = z; home[i * 4 + 3] = bone + 32 * kind + R() * 0.999; return i++; };
    const order = [B.head, B.jaw, B.neck, B.chest, B.spine, B.pelvis, B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR, B.thighL, B.shinL, B.footL, B.thighR, B.shinR, B.footR];
    for (const bone of order) {
      for (const p of shapes[bone]) {
        if (!p.g) continue;
        const s = cell[p.g - 1];
        if (p.t === "seg") {
          const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], l = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          const along = Math.max(1, Math.round(l / s)), across = Math.max(1, Math.round((p.r0 + p.r1) / s));
          for (let k = 0; k < along && i < n; k++) for (let c = 0; c < across && i < n; c++) {
            const t = (k + 0.5) / along, o = across > 1 ? ((c + 0.5) / across * 2 - 1) * (p.r0 + (p.r1 - p.r0) * t) * 0.62 : 0;
            const x = p.a[0] + dx * t - (dy / l) * o, y = p.a[1] + dy * t + (dx / l) * o;
            if (inHole(bone, x, y, p.z + 0.02)) continue;
            const j = put(bone, x, y, p.z + 0.02, 1);
            ang[j] = a; size[j] = s;
          }
        } else {
          for (let y = p.c[1] + p.r[1] - s * 0.5; y > p.c[1] - p.r[1] && i < n; y -= s) for (let x = p.c[0] - p.r[0] + s * 0.5; x < p.c[0] + p.r[0] && i < n; x += s) {
            const q = ((x - p.c[0]) / p.r[0]) ** 2 + ((y - p.c[1]) / p.r[1]) ** 2;
            const z = p.z + (p.tx || 0) * (x - p.c[0]) + (p.ball ? p.ball * Math.sqrt(Math.max(0, 1 - q)) : 0.02);
            if (q > 1 || inHole(bone, x, y, z)) continue;
            if (p.ring && Math.sqrt(q) < 1 - (p.ring * 1.3) / Math.min(p.r[0], p.r[1])) continue;
            const j = put(bone, x, y, z, 1);
            ang[j] = 0; size[j] = s;
          }
        }
      }
    }
    const glyphs = i;

    // the air: a floor of rings under his feet, and motes out in the dark
    const airN = Math.round((n - glyphs) * 0.16), floorN = Math.round(airN * 0.45), boneN = n - glyphs - airN;
    // dust on the bones, shared out by how much bone there is
    const all = [];
    let total = 0;
    for (const bone of order) for (const p of shapes[bone]) { const a = area(p); all.push([bone, p, a]); total += a; }
    for (const [bone, p, a] of all) {
      const count = Math.round((a / total) * boneN);
      for (let k = 0; k < count && i < n - airN; k++) {
        let tries = 0;
        do sample(p, R() < 0.3); while (inHole(bone, out3[0], out3[1], out3[2]) && ++tries < 8);
        if (tries >= 8) continue;
        put(bone, out3[0], out3[1], out3[2], 0);
      }
    }
    // rounding leaves a few spare: they go to the skull, where detail is most looked at
    while (i < n - airN) { const p = shapes[B.head][R() < 0.6 ? 0 : 1]; sample(p, R() < 0.3); if (!inHole(B.head, out3[0], out3[1], out3[2])) put(B.head, out3[0], out3[1], out3[2], 0); }
    for (let k = 0; k < floorN && i < n; k++) {
      const ring = Math.ceil(R() * 7), a = R() * Math.PI * 2, r = ring * 0.26 + (R() - 0.5) * 0.012;
      put(B.air, Math.cos(a) * r, FLOOR - 0.02, Math.sin(a) * r * 0.9, 0);
    }
    while (i < n) put(B.air, (R() * 2 - 1) * 5.5, (R() * 2 - 1) * 3, -4 + R() * 5, 0);
    return { home, ang, size, glyphs, counts: { glyphs, bone: boneN, air: airN } };
  }

  // ---------- from a pose to where every bone is ----------
  // A pose is a flat set of numbers (see dance.js). Spine and arms are turned joint by joint; the legs
  // are worked backward from where the feet should be, so feet stay put while the hips move.
  const P = (fill) => Object.assign({
    hx: 0, hy: 0, hz: 0, hrx: 0, hry: 0, hrz: 0,            // hips: where, and which way they tip
    srx: 0, sry: 0, srz: 0, crx: 0, cry: 0, crz: 0,        // lower back, chest
    nrx: 0, nry: 0, nrz: 0, hdx: 0, pop: 0, spin: 0, jaw: 0,  // head: nod, turn, tilt, slide, lift off, spin; jaw open
    aLa: 0.1, aLf: 0, aLt: 0, aLb: 0.12, aLz: 0, aLh: 0,   // left arm: out to the side, forward, twist; elbow forward, elbow sideways; hand
    aRa: 0.1, aRf: 0, aRt: 0, aRb: 0.12, aRz: 0, aRh: 0,
    fLx: 0, fLy: 0, fLz: 0, fLr: 0, fRx: 0, fRy: 0, fRz: 0, fRr: 0,   // feet: sideways, lift, forward, turn
    kL: 0.25, kR: 0.25, air: 0,                             // knees: how far they point outward (negative: knocked in); jump
    turn: 0,                                                // all of him, turned on the spot (a quarter turn is PI / 2; any amount is fine)
  }, fill);

  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), m3 = new THREE.Matrix4(), e = new THREE.Euler();
  const a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), a3 = new THREE.Vector3(), a4 = new THREE.Vector3(), a5 = new THREE.Vector3();
  const rot = (x, y, z, order) => m1.makeRotationFromEuler(e.set(x, y, z, order || "XYZ"));
  const child = (b, parent) => bones[b].world.copy(bones[parent === undefined ? bones[b].parent : parent].world).multiply(bones[b].local);

  function leg(L, s, p, pelvisX) {
    const thigh = bones[B["thigh" + L]], shin = bones[B["shin" + L]], foot = bones[B["foot" + L]];
    const hip = a1.set(J.hip[0] * s, J.hip[1] - J.pelvis[1], 0).applyMatrix4(bones[B.pelvis].world);
    const ankle = a2.set(J.ankle[0] * s + p["f" + L + "x"], J.ankle[1] + p["f" + L + "y"] + p.air, p["f" + L + "z"]);
    const to = a3.copy(ankle).sub(hip);
    const reach = thigh.len + shin.len - 0.002;
    let d = to.length();
    if (d > reach) { ankle.copy(hip).addScaledVector(to, reach / d); to.copy(ankle).sub(hip); d = reach; }   // can't reach: the foot comes up
    to.divideScalar(d);
    const along = (thigh.len * thigh.len - shin.len * shin.len + d * d) / (2 * d);
    const off = Math.sqrt(Math.max(0, thigh.len * thigh.len - along * along));
    // which way the knee goes: forward, and out to the side
    const bend = a4.set(s * p["k" + L], 0.05, 1);
    bend.addScaledVector(to, -bend.dot(to)).normalize();
    const knee = a5.copy(hip).addScaledVector(to, along).addScaledVector(bend, off);
    // a bone from here to there, keeping its front as near the pelvis's front as it can
    const span = (bone, from, target) => {
      ty.copy(target).sub(from).normalize();
      tx.copy(pelvisX).addScaledVector(ty, -pelvisX.dot(ty));
      if (tx.lengthSq() < 1e-5) tx.set(0, 0, 1);
      tx.normalize().negate();
      tz.crossVectors(tx, ty);
      bone.world.makeBasis(tx, ty, tz).setPosition(from);
    };
    span(thigh, hip, knee);
    span(shin, knee, ankle);
    // the foot keeps flat while it's down and droops as it lifts
    const lift = Math.max(0, ankle.y - (J.ankle[1] + p.air * 0.4));
    foot.world.makeRotationY(p["f" + L + "r"] * s).multiply(m2.extractRotation(foot.rest)).multiply(m1.makeRotationX(-Math.min(0.9, lift * 3.2))).setPosition(ankle);
  }

  const px = new THREE.Vector3();
  function solve(p) {
    const w = (b) => bones[b].world;
    w(B.pelvis).makeRotationFromEuler(e.set(p.hrx, p.hry, p.hrz, "YXZ")).setPosition(J.pelvis[0] + p.hx, J.pelvis[1] + p.hy + p.air, p.hz);
    child(B.spine).multiply(rot(p.srx, p.sry, p.srz));
    child(B.chest).multiply(rot(p.crx, p.cry, p.crz));
    child(B.neck).multiply(rot(p.nrx * 0.4, p.nry * 0.4, p.nrz * 0.4));
    child(B.head).multiply(m2.makeTranslation(p.hdx, p.pop, 0)).multiply(rot(p.nrx * 0.6, p.nry * 0.6 + p.spin, p.nrz * 0.6, "YXZ"));
    child(B.jaw).multiply(m2.makeTranslation(0, -p.jaw * 0.075, 0)).multiply(rot(p.jaw * 0.35, 0, 0));
    for (const [L, s] of [["L", 1], ["R", -1]]) {
      const a = "a" + L;
      child(B["arm" + L]).multiply(rot(p[a + "f"], p[a + "t"], s * p[a + "a"], "ZXY"));
      child(B["fore" + L]).multiply(rot(p[a + "b"], 0, s * p[a + "z"], "ZXY"));
      child(B["hand" + L]).multiply(rot(p[a + "h"], 0, 0));
    }
    px.setFromMatrixColumn(w(B.pelvis), 0);
    leg("L", 1, p, px);
    leg("R", -1, p, px);
    // turning on the spot: everything above was worked out facing front, and now all of him swings
    // round the upright line through his hips
    if (p.turn) {
      const cx = J.pelvis[0] + p.hx, cz = p.hz;
      m2.makeTranslation(cx, 0, cz).multiply(m1.makeRotationY(p.turn)).multiply(m3.makeTranslation(-cx, 0, -cz));
      for (let i = 0; i < NB - 1; i++) bones[i].world.premultiply(m2);
    }
  }

  // ---------- copying someone ----------
  // Copy me (mirror.js) says which way each arm bone should point. The pose has already put him
  // somewhere; this turns each arm from there toward where it's told, as far as `w` trusts it.
  const fq = new THREE.Quaternion(), fw = new THREE.Quaternion(), fx = new THREE.Vector3(), end = new THREE.Vector3();
  function point(bone, want, w) {
    ty.fromArray(want).normalize();
    // its front faces us where it can; a bone pointing straight at us keeps the side it already had
    tx.crossVectors(ty, Z);
    const flat = tx.lengthSq();
    if (flat < 0.04) { fx.setFromMatrixColumn(bone.world, 0); tx.lerp(fx.addScaledVector(ty, -fx.dot(ty)), 1 - flat / 0.04); }
    if (tx.lengthSq() < 1e-6) tx.set(1, 0, 0);
    tx.normalize();
    tz.crossVectors(tx, ty);
    fw.setFromRotationMatrix(m1.makeBasis(tx, ty, tz));
    fq.setFromRotationMatrix(bone.world).slerp(fw, w);
    bone.world.makeRotationFromQuaternion(fq).setPosition(end);
    end.addScaledVector(ty.setFromMatrixColumn(bone.world, 1), bone.len);      // the next bone starts where this one stops
  }
  function follow(g) {
    for (const L of ["L", "R"]) {
      const w = g["wArm" + L] * g.seen;
      if (w < 0.004) continue;
      end.setFromMatrixPosition(bones[B["arm" + L]].world);
      point(bones[B["arm" + L]], g["arm" + L], w);
      point(bones[B["fore" + L]], g["fore" + L], w);
      point(bones[B["hand" + L]], g["hand" + L], w);
    }
  }

  // ---------- falling apart ----------
  // Every bone has a place in a heap on the floor. `heap` (0 to 1 for each bone) slides it there and back.
  const pile = bones.map((b, i) => {
    const m = new THREE.Matrix4();
    if (b.name === "air") return m;
    const skull = i === B.head, jaw = i === B.jaw;
    const x = skull ? 0.05 : jaw ? 0.3 : (R() * 2 - 1) * 0.62, long = b.len > 0.4;
    const lie = long ? (R() < 0.5 ? 1 : -1) * (Math.PI / 2 + (R() - 0.5) * 0.5) : R() * Math.PI * 2;
    m.makeRotationFromEuler(new THREE.Euler(skull ? -0.15 : (R() - 0.5) * 0.5, (R() - 0.5) * 0.9, skull ? 0.12 : jaw ? 0.3 : lie));
    // long bones lie on their sides, so the joint end is half a length off centre
    const y = FLOOR + (skull ? 0.2 : jaw ? 0.1 : 0.05 + R() * 0.16);
    m.setPosition(x - (long ? Math.sin(-lie) * b.len * 0.5 : 0), y + (long ? -Math.cos(lie) * b.len * 0.5 : 0), (R() - 0.5) * 0.5 + (skull ? 0.25 : 0));
    return m;
  });
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  function heap(amounts) {
    for (let i = 0; i < NB - 1; i++) {
      const k = amounts[i];
      if (k <= 0) continue;
      bones[i].world.decompose(pa, qa, sc);
      pile[i].decompose(pb, qb, sc);
      // on the way down a bone drops; it doesn't glide
      const fall = k * k;
      pa.x += (pb.x - pa.x) * k; pa.z += (pb.z - pa.z) * k; pa.y += (pb.y - pa.y) * fall;
      bones[i].world.compose(pa, qa.slerp(qb, k), one);
    }
  }

  // Writes the bones into `out`: W columns, six rows (three for now, then the same three as they were
  // last frame, which is how the particles know how fast their bone is moving).
  function write(out) {
    out.copyWithin(W * 4 * 3, 0, W * 4 * 3);
    for (let b = 0; b < NB; b++) {
      const m = bones[b].world.elements;
      for (let r = 0; r < 3; r++) {
        const o = (r * W + b) * 4;
        out[o] = m[r]; out[o + 1] = m[4 + r]; out[o + 2] = m[8 + r]; out[o + 3] = m[12 + r];
      }
    }
  }

  SK.rig = { B, NB, W, FLOOR, J, bones, shapes, build, pose: P, solve, follow, heap, write };
})();
