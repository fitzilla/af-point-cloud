// The stage: a skeleton made of symbols and dust, dancing in the dark.
// A GPU simulation keeps every particle sprung to a home on one of his bones (rig.js says where the
// bones are, dance.js how they move, beat.js when). This file owns the renderer, the pointer, typing,
// the other visitors, and the frame loop.
/* global THREE */
(function () {
  "use strict";
  const SK = (window.SK = window.SK || {});
  const { rig } = SK;
  const $ = (id) => document.getElementById(id);
  function fail(msg) {
    const d = document.createElement("div");
    d.className = "fail";
    d.textContent = msg;
    document.body.appendChild(d);
  }
  if (!window.THREE) { fail("Three.js did not load. Check your connection and reload."); return; }

  const canvas = $("stage");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "default" });
  } catch (e) {
    fail("This piece needs WebGL, and your browser has it switched off.");
    return;
  }

  // ---------- capability checks ----------
  const isGL2 = renderer.capabilities.isWebGL2;
  const ext = (n) => !!renderer.extensions.get(n);
  let simType, fxType;
  if (isGL2) {
    const f = ext("EXT_color_buffer_float");
    const h = f || ext("EXT_color_buffer_half_float");
    simType = f ? THREE.FloatType : THREE.HalfFloatType;
    fxType = h ? THREE.HalfFloatType : THREE.UnsignedByteType;
  } else {
    simType = ext("OES_texture_float") ? THREE.FloatType : THREE.HalfFloatType;
    fxType = THREE.UnsignedByteType;
  }
  const glc = renderer.getContext();
  const canRender = (type) => {
    const rt = new THREE.WebGLRenderTarget(4, 4, {
      type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    renderer.setRenderTarget(rt);
    const ok = glc.checkFramebufferStatus(glc.FRAMEBUFFER) === glc.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(null);
    rt.dispose();
    return ok;
  };
  if (!canRender(simType)) simType = simType === THREE.FloatType && canRender(THREE.HalfFloatType) ? THREE.HalfFloatType : null;
  if (fxType !== THREE.UnsignedByteType && !canRender(fxType)) fxType = THREE.UnsignedByteType;
  if (!simType) { fail("This piece needs a GPU that can render floating-point textures."); return; }

  const params = new URLSearchParams(location.search);
  const coarse = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 560;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MOTION = reduced ? 0.35 : 1.0;
  const SIM = coarse ? 144 : 192;
  const N = SIM * SIM;
  const PR = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
  renderer.setPixelRatio(PR);
  renderer.setClearColor(0x000000, 1);

  // ---------- palette: a fresh hue pair on every load ----------
  const hsl = (h, s, l) => new THREE.Color().setHSL((((h % 360) + 360) % 360) / 360, s, l);
  const makePalette = (hue, off) => ({
    primary: hsl(hue, 1, 0.6),
    highlight: hsl(hue - 26, 1, 0.62),
    soft: hsl(hue + off, 1, 0.81),
    deep: hsl(hue + off - 13, 1, 0.61),
    bgNear: hsl(hue + 35, 0.54, 0.059),
    bgFar: hsl(hue + 45, 0.43, 0.014),
    bloom: hsl(hue + off - 4, 0.68, 0.048),
  });
  let hue = Math.random() * 360;
  const PAL = makePalette(hue, 150 + Math.random() * 50);   // shader uniforms hold these exact objects
  let palTarget = null;
  function newPalette() {
    hue = (hue + 70 + Math.random() * 220) % 360;
    palTarget = makePalette(hue, 150 + Math.random() * 50);
  }
  const tint = () => { document.documentElement.style.setProperty("--tint", "#" + PAL.primary.getHexString()); };
  function stepPalette(dt) {
    if (!palTarget) return;
    const k = Math.min(1, dt * 1.1);
    let done = true;
    for (const key in PAL) {
      PAL[key].lerpHSL(palTarget[key], k);
      if (Math.abs(PAL[key].r - palTarget[key].r) + Math.abs(PAL[key].g - palTarget[key].g) + Math.abs(PAL[key].b - palTarget[key].b) > 0.004) done = false;
    }
    if (done) { for (const key in PAL) PAL[key].copy(palTarget[key]); palTarget = null; }
    tint();
  }
  tint();
  canvas.style.background = "#" + PAL.bgFar.getHexString();

  // ---------- his particles ----------
  // Glyphs are a little bigger on a phone, where there are fewer of them and less screen to read them on.
  const cloud = rig.build(N, coarse ? [0.08, 0.062] : [0.056, 0.043]);
  const homeTex = new THREE.DataTexture(cloud.home, SIM, SIM, THREE.RGBAFormat, THREE.FloatType);
  homeTex.minFilter = homeTex.magFilter = THREE.NearestFilter;
  homeTex.needsUpdate = true;
  const boneData = new Float32Array(rig.W * 6 * 4);
  const boneTex = new THREE.DataTexture(boneData, rig.W, 6, THREE.RGBAFormat, THREE.FloatType);
  boneTex.minFilter = boneTex.magFilter = THREE.NearestFilter;

  const aRef = new Float32Array(N * 2), aRand = new Float32Array(N * 4), aGlyph = new Float32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    aRef[i * 2] = ((i % SIM) + 0.5) / SIM;
    aRef[i * 2 + 1] = (Math.floor(i / SIM) + 0.5) / SIM;
  }
  for (let i = 0; i < N * 4; i++) aRand[i] = Math.random();

  // ---------- what he's made of: symbols, or whatever gets typed ----------
  const GRID = 8, CELL = 64;
  const SYMBOLS = [..."†‡§¶※∴∞≈≠±×÷◆◇○●△▽□■✕✚✦✧♪♫#@&%*+=/\\<>{}[]?!01"];
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = GRID * CELL;
  const atlasCtx = atlasCanvas.getContext("2d");
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.minFilter = atlasTex.magFilter = THREE.LinearFilter;
  atlasTex.generateMipmaps = false;
  let atlasChars = [];
  function drawAtlas(chars) {
    atlasChars = chars.slice(0, GRID * GRID);
    const c = atlasCtx;
    c.fillStyle = "#000";
    c.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `500 ${Math.round(CELL * 0.7)}px "Martian Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    atlasChars.forEach((ch, i) => {
      const x = (i % GRID) * CELL + CELL / 2, y = Math.floor(i / GRID) * CELL + CELL / 2;
      const w = c.measureText(ch).width, k = Math.min(1, (CELL * 0.86) / Math.max(1, w));   // wide characters are squeezed into their cell
      c.save();
      c.translate(x, y + CELL * 0.04);
      c.scale(k, k);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    atlasTex.needsUpdate = true;
  }
  const symbolPick = new Uint8Array(cloud.glyphs);
  for (let i = 0; i < cloud.glyphs; i++) symbolPick[i] = Math.floor(Math.random() * SYMBOLS.length);
  let glyphAttr = null, madeOf = null;
  // "" means symbols. Anything else is written along him, head to toe, over and over.
  function setText(text) {
    if (text === madeOf) return;
    madeOf = text;
    if (!text) {
      drawAtlas(SYMBOLS);
      for (let i = 0; i < cloud.glyphs; i++) aGlyph[i] = symbolPick[i];
    } else {
      const seq = [...text, " "], chars = [...new Set(seq.filter((ch) => ch !== " "))];
      drawAtlas(chars);
      for (let i = 0; i < cloud.glyphs; i++) { const ch = seq[i % seq.length]; aGlyph[i] = ch === " " ? -2 : chars.indexOf(ch); }
    }
    if (glyphAttr) glyphAttr.needsUpdate = true;
  }
  setText("");
  // the mono face may arrive after the first draw
  if (document.fonts && document.fonts.load) document.fonts.load('500 40px "Martian Mono"').then(() => { const was = madeOf; madeOf = null; setText(was); }).catch(() => {});

  // ---------- shared GLSL ----------
  const HASH = `
    float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
    float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  `;
  // Simplex noise by Ian McEwan and Stefan Gustavson (Ashima Arts), MIT licence.
  const NOISE = `
    vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v){
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }
  `;
  // A particle's home is a point in one bone's space; tHome.w packs which bone, glyph or dust, and a random.
  // tBones holds each bone as three rows of a matrix, now (rows 0 to 2) and a frame ago (3 to 5).
  const BONES = `
    uniform sampler2D tBones;
    float homeBone(vec4 H){ return mod(floor(H.w), 32.0); }
    float homeGlyph(vec4 H){ return step(31.5, floor(H.w)); }
    float homeSeed(vec4 H){ return fract(H.w); }
    vec3 boneAt(float bone, vec4 q, float before){
      float u = (bone + 0.5) / ${rig.W.toFixed(1)}, v = before * 0.5;
      return vec3(dot(texture2D(tBones, vec2(u, v + 0.5 / 6.0)), q), dot(texture2D(tBones, vec2(u, v + 1.5 / 6.0)), q), dot(texture2D(tBones, vec2(u, v + 2.5 / 6.0)), q));
    }
  `;
  const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const MAXP = 6;   // how many other visitors' cursors can stir him at once

  // ---------- GPU simulation: velocity pass (w = accumulated damage) ----------
  const VEL_FRAG = `
    uniform sampler2D tPos; uniform sampler2D tVel; uniform sampler2D tHome;
    uniform float uTime, uDt, uEnergy, uGlitch, uInit, uHover, uSpeed, uRadius, uMotion, uKick, uLoose;
    uniform vec3 uRayO, uRayD, uMouseVel;
    uniform vec4 uPeer[${MAXP}]; uniform vec3 uPeerVel[${MAXP}];   // other visitors: xy, presence, speed
    varying vec2 vUv;
    ${HASH}
    ${NOISE}
    ${BONES}
    void main(){
      if (uInit > 0.5) { gl_FragColor = vec4(0.0); return; }
      vec4 P = texture2D(tPos, vUv);
      vec4 V = texture2D(tVel, vUv);
      vec4 H = texture2D(tHome, vUv);
      vec3 p = P.xyz; vec3 v = V.xyz; float dmg = P.w;
      float bone = homeBone(H), glyph = homeGlyph(H), r = homeSeed(H), air = step(17.5, bone);
      vec3 h = boneAt(bone, vec4(H.xyz, 1.0), 0.0);
      // how fast its bone is carrying it: the particle rides along, and the spring only has to tidy up
      vec3 ride = (h - boneAt(bone, vec4(H.xyz, 1.0), 1.0)) / max(uDt, 0.004);
      float rl = length(ride);
      if (rl > 14.0) ride *= 14.0 / rl;
      float inst = clamp(uEnergy, 0.0, 1.5);

      // proximity: distance from the particle to the pointer ray, in object space
      vec3 op = p - uRayO;
      vec3 dv = op - uRayD * dot(op, uRayD);
      float d = length(dv);
      float R = uRadius * (1.0 + inst * 0.8 + min(uSpeed, 4.0) * 0.12);
      float f = smoothstep(R, 0.0, d) * uHover;

      vec3 n = vec3(
        snoise(p * 1.7 + vec3(0.0, 0.0, uTime * 0.3)),
        snoise(p * 1.7 + vec3(31.4, 0.0, uTime * 0.3)),
        snoise(p * 1.7 + vec3(0.0, 47.2, uTime * 0.3)));
      vec3 dir = d > 1e-4 ? dv / d : normalize(n + vec3(1e-3));

      // home spring, loosened by global instability and local damage. Glyphs hold tighter than dust, so
      // the letters stay readable while the dust trails behind a fast limb.
      float loosen = clamp(inst * 0.55 + dmg * 0.45 + uLoose, 0.0, 0.97);
      float k = mix(mix(170.0, 520.0, r), 760.0, glyph) * mix(1.0, 0.03, loosen);
      k = mix(k, 1.2, air);
      vec3 acc = (h - p) * k;

      // turbulence: idle shimmer up to full abstraction
      acc += n * (0.22 + inst * 2.4 + dmg * 1.4 + uGlitch * 1.5 + air * 0.25) * uMotion * mix(1.0, 0.35, glyph);

      // local field near the pointer: a noise partition decides repel, attract or swirl
      float mode = f > 0.0 ? snoise(h * 2.2 + vec3(uTime * 0.2)) : 0.0;
      float repel = smoothstep(-0.25, 0.35, mode);
      acc += dir * f * mix(-18.0, 40.0, repel);
      acc += cross(uRayD, dir) * f * 22.0 * (1.0 - abs(mode));

      // velocity: drag particles along with the pointer, tearing the surface
      acc += uMouseVel * f * (12.0 + min(uSpeed, 5.0) * 12.0);

      // fast strokes detonate the local cloud
      vec3 rnd = vec3(hash11(r * 917.3), hash11(r * 331.7 + 1.3), hash11(r * 613.1 + 7.1)) - 0.5;
      float blast = f * smoothstep(0.8, 3.5, uSpeed);
      acc += normalize(dir * 0.7 + rnd + vec3(1e-4)) * blast * 170.0 * (0.3 + r);

      // everyone else on the page stirs him with their cursors too
      float fPeers = 0.0;
      for (int i = 0; i < ${MAXP}; i++) {
        vec4 q = uPeer[i];
        if (q.z <= 0.0) continue;
        vec2 dq = p.xy - q.xy;
        float dl = length(dq);
        float fp = smoothstep(uRadius * (1.0 + min(q.w, 4.0) * 0.12), 0.0, dl) * q.z;
        if (fp <= 0.0) continue;
        vec3 pd = dl > 1e-4 ? vec3(dq / dl, 0.0) : dir;
        acc += pd * fp * mix(-18.0, 40.0, repel);
        acc += uPeerVel[i] * fp * (12.0 + min(q.w, 5.0) * 12.0);
        acc += normalize(pd * 0.7 + rnd + vec3(1e-4)) * fp * smoothstep(0.8, 3.5, q.w) * 170.0 * (0.3 + r);
        fPeers += fp * (0.3 + min(q.w, 5.0) * 1.2);
      }

      // the beat: every bone puffs a little dust out sideways; the floor's rings jump
      vec3 core = boneAt(bone, vec4(0.0, H.y, 0.0, 1.0), 0.0);
      vec3 puff = normalize(h - core + rnd * 0.35 + vec3(1e-4));
      v += puff * uKick * uKick * (0.25 + r * 1.1) * mix(1.0, 0.2, glyph) * (1.0 - air) * uDt * 26.0;
      v.y += air * uKick * uKick * r * uDt * 9.0;

      v += acc * uDt;
      v += (ride * (1.0 - air) - v) * (1.0 - exp(-mix(mix(13.0, 30.0, r), 44.0, glyph) * mix(1.0, 0.08, clamp(inst * 0.45 + loosen * 0.6, 0.0, 1.0)) * uDt));
      float sp = length(v);
      if (sp > 16.0) v *= 16.0 / sp;

      // damage accumulates where the pointer works the surface, heals slowly
      dmg += (f * (0.3 + min(uSpeed, 5.0) * 1.2) + fPeers) * uDt * 2.0;
      dmg += uKick * uKick * r * (1.0 - glyph) * uDt * 5.0;
      dmg -= uDt * mix(0.9, 0.12, clamp(inst, 0.0, 1.0));
      gl_FragColor = vec4(v, clamp(dmg, 0.0, 1.5));
    }
  `;

  // ---------- GPU simulation: position pass ----------
  const POS_FRAG = `
    uniform sampler2D tPos; uniform sampler2D tVel; uniform sampler2D tHome;
    uniform float uDt, uInit, uTime, uGlitch, uEnergy;
    varying vec2 vUv;
    ${HASH}
    ${BONES}
    void main(){
      vec4 H = texture2D(tHome, vUv);
      vec3 h = boneAt(homeBone(H), vec4(H.xyz, 1.0), 0.0);
      if (uInit > 0.5) {
        float r = homeSeed(H);
        vec3 rnd = vec3(hash11(r * 917.3), hash11(r * 331.7 + 1.3), hash11(r * 613.1 + 7.1)) - 0.5;
        gl_FragColor = vec4(h + normalize(rnd + vec3(1e-4)) * (1.2 + 3.0 * hash11(r * 71.9)), 0.9);
        return;
      }
      vec4 P = texture2D(tPos, vUv);
      vec4 V = texture2D(tVel, vUv);
      vec3 p = P.xyz + V.xyz * uDt;
      // voxel corruption: during glitches whole slices snap toward a coarse grid
      float slice = floor(h.y * 22.0);
      float on = step(1.0 - (uGlitch * 0.5 + uEnergy * 0.04), hash21(vec2(slice, floor(uTime * 9.0))));
      float q = 0.05 + 0.1 * hash11(slice + 0.5);
      p = mix(p, floor(p / q + 0.5) * q, on * 0.5);
      float l = length(p);
      if (l > 10.0) p *= 10.0 / l;
      gl_FragColor = vec4(p, V.w);
    }
  `;

  // ---------- particle render ----------
  const PT_VERT = `
    attribute vec2 aRef; attribute vec4 aRand; attribute float aGlyph, aAng, aSize;
    uniform sampler2D tPos; uniform sampler2D tHome;
    uniform float uTime, uEnergy, uGlitch, uPR, uSize, uCamDist, uMotion, uPxScale, uKick, uBar;
    uniform vec3 uPrimary, uHighlight, uSoft, uDeep;
    varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vSeed; varying float vGlyph; varying vec2 vRot;
    ${HASH}
    ${BONES}
    void main(){
      vec4 P = texture2D(tPos, aRef);
      vec4 H = texture2D(tHome, aRef);
      float bone = homeBone(H), air = step(17.5, bone), glyph = step(-0.5, aGlyph);
      vec3 h = boneAt(bone, vec4(H.xyz, 1.0), 0.0);
      vec3 p = P.xyz; float dmg = P.w;
      float tq = floor(uTime * 24.0);

      // unstable returns: a few points jump every frame
      float fl = step(0.992 - uEnergy * 0.03 - uGlitch * 0.05, hash21(vec2(aRand.x * 311.0, tq)));
      p += (vec3(hash21(vec2(aRand.x, tq)), hash21(vec2(aRand.y, tq)), hash21(vec2(aRand.z, tq))) - 0.5)
           * fl * (0.04 + uEnergy * 0.25) * uMotion;
      p.xy += (vec2(hash21(vec2(aRand.w, tq + 1.0)), hash21(vec2(aRand.x, tq + 2.0))) - 0.5) * 0.004 * uMotion * (1.0 - glyph);

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vec4 clip = projectionMatrix * mv;

      // screen-space tearing bands
      float row = floor((clip.y / clip.w * 0.5 + 0.5) * 64.0);
      float tq2 = floor(uTime * 16.0);
      float tearAmt = (uGlitch * 0.7 + uEnergy * 0.15) * uMotion;
      float tear = step(1.0 - tearAmt * 0.3, hash21(vec2(row, tq2)));
      clip.x += tear * (hash21(vec2(row * 1.7, tq2 + 3.0)) - 0.5) * 0.35 * tearAmt * clip.w;
      gl_Position = clip;

      float big = step(0.988, aRand.w);
      float sz = uSize * (0.55 + aRand.z * 1.1) * (1.0 + dmg * 0.7) * (1.0 + big * 2.2);
      gl_PointSize = min(max(1.0, sz * uPR * uCamDist / -mv.z), 12.0 * uPR);
      vRot = vec2(1.0, 0.0);
      if (glyph > 0.5) {
        // a glyph is a sprite big enough to turn in, laid along its bone as that bone looks on screen
        vec3 along = (modelViewMatrix * vec4(boneAt(bone, vec4(cos(aAng), sin(aAng), 0.0, 0.0), 0.0), 0.0)).xyz;
        float al = length(along.xy);
        if (al > 1e-4) vRot = along.xy / al;
        gl_PointSize = clamp(aSize * 1.42 * uPxScale / -mv.z * (1.0 + dmg * 0.3 + uKick * 0.14 * aRand.z), 3.0, 72.0 * uPR);
      }

      vec3 acid = uPrimary;
      vec3 lime = uHighlight;
      vec3 lav  = uSoft;
      vec3 vio  = uDeep;
      float cp = aRand.y;
      vec3 c = acid;
      if (cp > 0.52) c = lime;
      if (cp > 0.62) c = lav;
      if (cp > 0.78) c = vio;
      if (cp > 0.965) c = vec3(1.0);

      // thin-film interference between the two colour families
      float ph = dot(p, vec3(3.1, -2.3, 4.7)) + uTime * 0.7 + aRand.x * 2.0;
      c = mix(c, mix(acid, lav, 0.5 + 0.5 * sin(ph)), 0.12 + 0.3 * clamp(uEnergy, 0.0, 1.0));

      // the scanner's sweep travelling up him
      float sweepY = mod(uTime * 0.45, 5.0) - 2.5;
      float swd = (h.y - sweepY) * 9.0;
      float sw = exp(-swd * swd) * (1.0 - air);
      c = mix(c, mix(acid, vec3(1.0), 0.8), sw * 0.6);

      // damage burns toward the second colour and white
      c = mix(c, mix(vio, vec3(1.0), step(0.75, aRand.x)), clamp(dmg, 0.0, 1.0) * 0.75);
      // the symbols are the brightest thing on him
      c = mix(c, vec3(1.0), glyph * 0.42);

      float depth = clamp(1.0 - (-mv.z - uCamDist) * 0.45, 0.2, 1.35);
      vColor = c * depth;
      vAlpha = mix(0.34, 0.95, glyph) * (0.6 + 0.4 * aRand.z) * (1.0 + sw * 0.8);
      // the floor glows on the first beat of the bar and sits quiet otherwise; the far dust is faint
      vAlpha *= mix(1.0, 0.3 + 0.9 * uBar + 0.4 * uKick, air);
      if (aGlyph < -1.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // a space between words: not drawn
      vShape = aRand.w;
      vSeed = aRand.x;
      vGlyph = aGlyph;
    }
  `;
  const PT_FRAG = `
    uniform sampler2D tAtlas;
    varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vSeed; varying float vGlyph; varying vec2 vRot;
    ${HASH}
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float a = 1.0;
      if (vGlyph > -0.5) {
        vec2 q = vec2(c.x, -c.y);
        q = vec2(q.x * vRot.x + q.y * vRot.y, q.y * vRot.x - q.x * vRot.y) * 1.42 + 0.5;
        if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
        float col = mod(vGlyph + 0.5, ${GRID.toFixed(1)}) - 0.5, row = floor((vGlyph + 0.5) / ${GRID.toFixed(1)});
        a = texture2D(tAtlas, vec2((col + q.x) / ${GRID.toFixed(1)}, 1.0 - (row + 1.0 - q.y) / ${GRID.toFixed(1)})).r;
      }
      else if (vShape > 0.985) a = step(0.45, hash21(floor(gl_PointCoord * 3.0) + vSeed * 97.0)); // broken pixel cluster
      else if (vShape > 0.4) a = smoothstep(0.5, 0.2, length(c));                           // dot
      if (a < 0.02) discard;
      gl_FragColor = vec4(vColor * vAlpha * a, 1.0);
    }
  `;

  // ---------- post: ghost trail ----------
  const TRAIL_FRAG = `
    uniform sampler2D tScene; uniform sampler2D tPrev;
    uniform float uDecay, uTime, uEnergy; uniform vec2 uDrift;
    varying vec2 vUv;
    ${HASH}
    void main(){
      vec3 cur = texture2D(tScene, vUv).rgb;
      float n = hash21(vec2(floor(vUv.y * 90.0), floor(uTime * 20.0)));
      vec2 off = uDrift + vec2((n - 0.5) * 0.004 * uEnergy, 0.0);
      vec3 prev = texture2D(tPrev, vUv - off).rgb * uDecay;
      gl_FragColor = vec4(max(cur, prev), 1.0);
    }
  `;

  // ---------- post: composite ----------
  const FINAL_FRAG = `
    uniform sampler2D tTrail;
    uniform float uTime, uEnergy, uGlitch, uSpeed, uCollapse, uHover, uAspect, uMotion;
    uniform vec2 uMouse, uSplitDir, uRes;
    uniform vec3 uBgNear, uBgFar, uBloom, uPulseCol;
    uniform float uPulse;
    varying vec2 vUv;
    ${HASH}
    void main(){
      vec2 uv = vUv;
      float prox = smoothstep(0.3, 0.0, length((uv - uMouse) * vec2(uAspect, 1.0))) * uHover;
      float sp = clamp(uSpeed / 3.0, 0.0, 1.5);
      float chaos = (uGlitch * 0.8 + uEnergy * 0.22 + uCollapse * 0.6) * uMotion;
      float local = prox * (0.2 + sp) * uMotion;

      // block displacement
      float bt = floor(uTime * (8.0 + 24.0 * chaos));
      vec2 grid = vec2(18.0, 32.0) * (0.6 + hash21(vec2(bt, 3.0)));
      vec2 blk = floor(uv * grid);
      float bh = hash21(blk + bt * 0.37);
      float amt = chaos * 0.2 + local * 0.55;
      vec2 duv = uv;
      if (bh < amt) duv += (vec2(hash21(blk + bt + 1.7), hash21(blk - bt + 9.1)) - 0.5) * vec2(0.18, 0.04) * (0.4 + chaos + local);

      // hairline tears
      float line = floor(uv.y * uRes.y / 3.0);
      float lt = step(1.0 - (chaos * 0.06 + local * 0.12), hash21(vec2(line, bt)));
      duv.x += lt * (hash21(vec2(line * 3.1, bt)) - 0.5) * 0.12;

      // chromatic separation along the direction of motion
      vec2 sd = uSplitDir * (0.0012 + uEnergy * 0.0035 + uGlitch * 0.012 + local * 0.02 + uCollapse * 0.01) * uMotion;
      vec3 col = vec3(texture2D(tTrail, duv + sd).r, texture2D(tTrail, duv).g, texture2D(tTrail, duv - sd).b);

      // fragmented duplicates
      if (bh > 1.0 - amt * 0.5) col += texture2D(tTrail, duv + uSplitDir * 0.05 * (0.5 + bh)).rgb * vec3(0.6, 0.35, 0.9);

      col = 1.0 - exp(-col * 1.4);

      vec2 cuv = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vg = length(cuv);
      vec3 bg = mix(uBgNear, uBgFar, smoothstep(0.05, 0.9, vg));
      bg += uBloom * smoothstep(0.7, 0.0, vg) * (0.4 + 0.6 * clamp(uEnergy, 0.0, 1.0));
      // the first beat of the bar: a blocky burst of pixels from behind him and a broken ring that widens as it fades
      float pb = floor(uTime * 12.0);
      float px = 0.012 + 0.03 * hash21(vec2(pb, 5.0));
      vec2 pcell = floor(cuv / px);
      float qd = length(pcell * px);
      float bn = hash21(pcell + pb * 1.37);
      float big = smoothstep(0.6, 1.0, uPulse);
      float ringR = 0.1 + (1.0 - uPulse) * 0.9;
      float rd = (qd - ringR) * 9.0;
      float ring = exp(-rd * rd);
      float core = smoothstep(0.9, 0.0, qd);
      float pix = step(1.0 - (0.35 + 0.4 * big) * uPulse, bn);
      bg += uPulseCol * uPulse * (core * 0.12 + ring * 0.13) * (0.35 + 1.3 * pix);
      bg += mix(uPulseCol, vec3(1.0), 0.5) * step(0.985 - big * uPulse * 0.05, bn) * big * uPulse * 0.55 * smoothstep(1.4, 0.2, qd);
      vec3 o = bg + col;
      o *= 0.94 + 0.06 * sin(gl_FragCoord.y * 1.5708 + uTime * 6.0);
      o += (hash21(gl_FragCoord.xy + fract(uTime) * 517.0) - 0.5) * 0.045;
      o *= smoothstep(1.3, 0.35, vg);
      gl_FragColor = vec4(o, 1.0);
    }
  `;

  // ---------- plumbing ----------
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  fsScene.add(quad);
  function pass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }
  const fsMat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const makeRT = (w, h, type, filter) => new THREE.WebGLRenderTarget(w, h, {
    minFilter: filter, magFilter: filter, format: THREE.RGBAFormat, type, depthBuffer: false, stencilBuffer: false,
  });

  const posRT = [makeRT(SIM, SIM, simType, THREE.NearestFilter), makeRT(SIM, SIM, simType, THREE.NearestFilter)];
  const velRT = [makeRT(SIM, SIM, simType, THREE.NearestFilter), makeRT(SIM, SIM, simType, THREE.NearestFilter)];
  const sceneRT = makeRT(1, 1, fxType, THREE.LinearFilter);
  const trailRT = [makeRT(1, 1, fxType, THREE.LinearFilter), makeRT(1, 1, fxType, THREE.LinearFilter)];

  const V3 = () => new THREE.Vector3();
  const velMat = fsMat(VEL_FRAG, {
    tPos: { value: null }, tVel: { value: null }, tHome: { value: homeTex }, tBones: { value: boneTex },
    uTime: { value: 0 }, uDt: { value: 0.016 }, uEnergy: { value: 0 }, uGlitch: { value: 0 },
    uInit: { value: 1 }, uHover: { value: 0 }, uSpeed: { value: 0 }, uRadius: { value: 0.3 }, uMotion: { value: MOTION },
    uKick: { value: 0 }, uLoose: { value: 0 },
    uRayO: { value: V3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uMouseVel: { value: V3() },
    uPeer: { value: Array.from({ length: MAXP }, () => new THREE.Vector4()) }, uPeerVel: { value: Array.from({ length: MAXP }, V3) },
  });
  const posMat = fsMat(POS_FRAG, {
    tPos: { value: null }, tVel: { value: null }, tHome: { value: homeTex }, tBones: { value: boneTex },
    uDt: { value: 0.016 }, uInit: { value: 1 }, uTime: { value: 0 }, uGlitch: { value: 0 }, uEnergy: { value: 0 },
  });
  const trailMat = fsMat(TRAIL_FRAG, {
    tScene: { value: null }, tPrev: { value: null }, uDecay: { value: 0.4 }, uTime: { value: 0 }, uEnergy: { value: 0 },
    uDrift: { value: new THREE.Vector2() },
  });
  const finalMat = fsMat(FINAL_FRAG, {
    tTrail: { value: null }, uTime: { value: 0 }, uEnergy: { value: 0 }, uGlitch: { value: 0 }, uSpeed: { value: 0 },
    uCollapse: { value: 0 }, uHover: { value: 0 }, uAspect: { value: 1 }, uMotion: { value: MOTION },
    uBgNear: { value: PAL.bgNear }, uBgFar: { value: PAL.bgFar }, uBloom: { value: PAL.bloom },
    uPulse: { value: 0 }, uPulseCol: { value: PAL.primary.clone() },
    uMouse: { value: new THREE.Vector2(-9, -9) }, uSplitDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) },
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute("aRef", new THREE.BufferAttribute(aRef, 2));
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 4));
  geo.setAttribute("aAng", new THREE.BufferAttribute(cloud.ang, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(cloud.size, 1));
  glyphAttr = new THREE.BufferAttribute(aGlyph, 1);
  glyphAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aGlyph", glyphAttr);
  const ptMat = new THREE.ShaderMaterial({
    vertexShader: PT_VERT, fragmentShader: PT_FRAG,
    uniforms: {
      tPos: { value: null }, tHome: { value: homeTex }, tBones: { value: boneTex }, tAtlas: { value: atlasTex },
      uTime: { value: 0 }, uEnergy: { value: 0 }, uGlitch: { value: 0 }, uKick: { value: 0 }, uBar: { value: 0 },
      uPrimary: { value: PAL.primary }, uHighlight: { value: PAL.highlight }, uSoft: { value: PAL.soft }, uDeep: { value: PAL.deep },
      uPR: { value: PR }, uSize: { value: coarse ? 0.95 : 1.15 }, uCamDist: { value: 6 }, uMotion: { value: MOTION }, uPxScale: { value: 1 },
    },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, ptMat);
  points.frustumCulled = false;

  const scene = new THREE.Scene();
  const sculpture = new THREE.Group();
  sculpture.add(points);
  scene.add(sculpture);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const TF = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  // The camera keeps all of him in shot: close while he stands, pulling back as his arms go up or he
  // jumps, and on a tall screen it's how wide he is that sets the distance.
  const view = { top: 2.0, half: 1.2, y: 0.08, dist: 0 }, reachP = new THREE.Vector3();
  function frameHim(k) {
    let top = 1.95, half = 0.75;
    for (const [bone, len] of [[rig.B.head, 0.5], [rig.B.handL, 0.3], [rig.B.handR, 0.3], [rig.B.footL, 0.3], [rig.B.footR, 0.3]]) {
      reachP.set(0, len, 0).applyMatrix4(rig.bones[bone].world);
      top = Math.max(top, reachP.y + 0.12);
      half = Math.max(half, Math.abs(reachP.x) + 0.2);
    }
    view.top += (top - view.top) * (top > view.top ? Math.min(1, k * 3) : k * 0.4);
    view.half += (half - view.half) * (half > view.half ? Math.min(1, k * 3) : k * 0.4);
    const bottom = rig.FLOOR - 0.44, tall = (view.top - bottom) / 2 + 0.08;
    view.y = bottom + tall - 0.04;
    // on a tall phone screen he's kept big, and lets a flung-out arm leave the picture
    view.dist = Math.max(tall / TF, Math.min(view.half, 1.3) / (TF * camera.aspect));
    camera.position.set(0, view.y + 0.34, view.dist);
    camera.lookAt(0, view.y, 0);
    ptMat.uniforms.uCamDist.value = view.dist;
  }

  // the offscreen particle and trail buffers have a pixel budget; only the final pass runs at full
  // resolution. qScale drops further if the device can't keep up (see the loop).
  const PIX_BUDGET = coarse ? 1.0e6 : 2.4e6;
  let qScale = 1, pointPR = PR;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameHim(1);
    const bw = Math.floor(w * PR), bh = Math.floor(h * PR);
    const rs = Math.min(1, Math.sqrt(PIX_BUDGET / (bw * bh))) * qScale;
    const sw = Math.max(1, Math.floor(bw * rs)), sh = Math.max(1, Math.floor(bh * rs));
    sceneRT.setSize(sw, sh);
    trailRT.forEach((rt) => { rt.setSize(sw, sh); renderer.setRenderTarget(rt); renderer.clear(); });
    renderer.setRenderTarget(null);
    pointPR = PR * rs;   // points are sized in buffer pixels, so they keep their on-screen size
    ptMat.uniforms.uPR.value = pointPR;
    ptMat.uniforms.uPxScale.value = sh / (2 * TF);
    finalMat.uniforms.uAspect.value = w / h;
    finalMat.uniforms.uRes.value.set(bw, bh);
  }
  let resizeQueued = false;
  addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  });
  resize();

  // ---------- the music, and the dancing ----------
  const beat = (SK.beat = SK.beatKit.createBeat());
  const dance = (SK.dance = SK.createDance());

  // ---------- interaction state ----------
  const pointer = { ndc: new THREE.Vector2(9, 9), inside: false, lx: 0, ly: 0, lt: 0 };
  const st = {
    hover: 0, speed: 0, speedTarget: 0, energy: 0, glitch: 0, lastMove: -10, clickBoom: 0, pulse: 0, peak: 0, loose: 0,
    velScreen: new THREE.Vector2(), velScreenTarget: new THREE.Vector2(), splitDir: new THREE.Vector2(1, 0),
    velWorld: new THREE.Vector3(), lastHit: null, parX: 0, parY: 0,
  };
  const overUI = (e) => e.target instanceof Element && !!e.target.closest(".controls, .card, #tube");

  function onMove(e) {
    const now = performance.now() / 1000;
    const x = e.clientX, y = e.clientY, w = innerWidth, h = innerHeight;
    pointer.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    if (pointer.inside && pointer.lt) {
      const dt = Math.max(1 / 240, now - pointer.lt);
      const m = Math.min(w, h);
      const vx = (x - pointer.lx) / m / dt, vy = -(y - pointer.ly) / m / dt;
      st.velScreenTarget.set(vx, vy);
      st.speedTarget = Math.max(st.speedTarget * 0.5, Math.hypot(vx, vy));
    }
    pointer.inside = true;
    pointer.lx = x; pointer.ly = y; pointer.lt = now;
    st.lastMove = now;
  }
  function onLeave() { pointer.inside = false; pointer.lt = 0; st.lastHit = null; }
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", (e) => {
    if (overUI(e)) return;
    pointer.lt = 0;
    st.clickBoom = 1;      // a click blows the particles apart under the cursor,
    dance.startle();       // and makes him jump
    onMove(e);
  }, { passive: true });
  addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") onLeave(); });
  addEventListener("pointercancel", onLeave);
  document.addEventListener("pointerleave", onLeave);
  addEventListener("blur", onLeave);

  const raycaster = new THREE.Raycaster();
  const inv = new THREE.Matrix4();
  const rayO = velMat.uniforms.uRayO.value, rayD = velMat.uniforms.uRayD.value;
  const hit = new THREE.Vector3(), tmpV = new THREE.Vector3();

  // ---------- typing: whatever you type is what he's made of ----------
  // Backspace edits; Esc (or nothing left) turns him back into symbols.
  const TYPEABLE = /^[\p{L}\p{N}!?&@#$%*+=.,:;'"()\/ -]$/u;
  let typed = "", wordTimer = 0, lastKey = 0;
  addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
    if (e.key === "Enter") { e.preventDefault(); SK.ui && SK.ui.tap(); return; }
    let next;
    if (e.key === "Escape") next = "";
    else if (e.key === "Backspace") next = [...typed].slice(0, -1).join("");
    else if (e.key.length === 1 && TYPEABLE.test(e.key)) next = [...typed].length < 14 ? typed + e.key.toUpperCase() : typed;
    else return;
    e.preventDefault();
    // keep Space from pressing whichever control was clicked last
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    typeText(next);
  });
  // remote: someone else typed it, so don't send it back
  function typeText(next, remote) {
    if (next === typed) return;
    typed = next;
    lastKey = performance.now() / 1000;
    // every key rattles him a little, and his jaw goes as if he's saying it
    st.glitch = Math.max(st.glitch, 0.45);
    st.energy = Math.min(1.4, st.energy + 0.06);
    dance.talk();
    clearTimeout(wordTimer);
    wordTimer = setTimeout(() => setText(typed.trim()), 60);
    if (!remote) { SK.ui && SK.ui.acted(); send({ t: "w", w: typed }); }
  }

  // reset: symbols again, a fresh palette, and he falls in a heap and puts himself back together
  function resetAll() {
    typeText("");
    st.energy = 0; st.glitch = 1;
    dance.collapse();
    newPalette();
  }

  // ---------- together: everyone on the page sees each other's cursors (which stir him) and anyone can type ----------
  // The relay is a small Cloudflare worker (see relay/); ?mp=ws://... points at another one for testing.
  const RELAY = "wss://aaron-cursors.aaron-cursors.workers.dev/ws";
  const MP_URL = params.get("mp") || (RELAY && location.hostname === "aaronfitzsimmons.com" ? RELAY : "");
  const peerBox = $("peers"), peers = new Map();
  const peerU = velMat.uniforms.uPeer.value, peerV = velMat.uniforms.uPeerVel.value, peerP = new THREE.Vector3();
  const mp = { ws: null, tries: 0, sentAt: 0, sx: 9, sy: 9, left: true };
  const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
  function send(m) { if (mp.ws && mp.ws.readyState === 1) mp.ws.send(JSON.stringify(m)); }
  function connect() {
    if (!MP_URL || mp.ws) return;
    let ws;
    try { ws = mp.ws = new WebSocket(MP_URL); } catch (e) { return; }
    ws.onopen = () => { mp.tries = 0; mp.left = true; };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === "c") peerMove(m);
      else if (m.t === "l" || m.t === "x") peerGone(m.id, m.t === "x");
      else if ((m.t === "w" || m.t === "hi") && typeof m.w === "string" && [...m.w].length <= 14 && [...m.w].every((ch) => TYPEABLE.test(ch))) typeText(m.w.toUpperCase(), true);
    };
    ws.onclose = () => {
      mp.ws = null;
      for (const id of [...peers.keys()]) peerGone(id, true);
      setTimeout(connect, Math.min(30000, 1500 * 2 ** mp.tries++));   // back off and try again
    };
  }
  function peerMove(m) {
    if (typeof m.id !== "string") return;
    let p = peers.get(m.id);
    if (!p) {
      if (peers.size > 60) return;
      const el = document.createElement("i");
      el.style.color = `hsl(${num(m.h, 360)} 100% 66%)`;
      peerBox.appendChild(el);
      p = { el, x: num(m.x, 10), y: num(m.y, 10), a: 0 };
      peers.set(m.id, p);
    }
    Object.assign(p, { tx: num(m.x, 10), ty: num(m.y, 10), vx: num(m.vx, 14), vy: num(m.vy, 14), s: num(m.s, 50), seen: performance.now() / 1000, gone: false });
  }
  function peerGone(id, remove) {
    const p = peers.get(id);
    if (!p) return;
    if (remove) { p.el.remove(); peers.delete(id); } else p.gone = true;
  }
  // send my cursor about ten times a second while it moves, and follow everyone else's
  function stepPeers(dt, now) {
    if (mp.ws && mp.ws.readyState === 1) {
      if (pointer.inside && st.lastHit) {
        const moved = Math.abs(hit.x - mp.sx) + Math.abs(hit.y - mp.sy) > 0.003;
        if (now - mp.sentAt > 0.1 && (moved || now - mp.sentAt > 1)) {
          mp.sentAt = now; mp.sx = hit.x; mp.sy = hit.y; mp.left = false;
          send({ t: "c", x: +hit.x.toFixed(3), y: +hit.y.toFixed(3), vx: +st.velWorld.x.toFixed(2), vy: +st.velWorld.y.toFixed(2), s: +st.speed.toFixed(2) });
        }
      } else if (!mp.left) { mp.left = true; send({ t: "l" }); }
    }
    let k = 0;
    const decay = Math.exp(-dt * 4), follow = Math.min(1, dt * 14);
    for (const [id, p] of peers) {
      const fresh = !p.gone && now - p.seen < 3;
      p.a += ((fresh ? 1 : 0) - p.a) * Math.min(1, dt * 5);
      if (!fresh && p.a < 0.01) { p.el.style.opacity = "0"; if (now - p.seen > 60) peerGone(id, true); continue; }
      p.x += (p.tx - p.x) * follow; p.y += (p.ty - p.y) * follow;
      p.vx *= decay; p.vy *= decay; p.s *= decay;
      peerP.set(p.x, p.y, 0).applyMatrix4(sculpture.matrixWorld).project(camera);
      p.el.style.transform = `translate(${((peerP.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((0.5 - peerP.y * 0.5) * innerHeight).toFixed(1)}px)`;
      p.el.style.opacity = (p.a * 0.9).toFixed(2);
      if (k < MAXP) { peerU[k].set(p.x, p.y, p.a, p.s); peerV[k].set(p.vx, p.vy, 0); k++; }
    }
    for (; k < MAXP; k++) peerU[k].z = 0;
  }
  connect();

  const danceCtx = { beat: 0, bpm: 118, vibe: "groove", energy: 0, going: false, lookX: 0, lookY: 0, t: 0 };
  let heapMax = 0;
  function update(dt, t) {
    const now = performance.now() / 1000;
    const idleFor = now - st.lastMove;
    // on your own he drifts back to symbols after a minute; when shared, the word stays until someone changes it
    if (typed && !mp.ws && now - lastKey > 60) { typed = ""; setText(""); }
    const active = pointer.inside && idleFor < 0.25;

    st.hover += ((pointer.inside ? 1 : 0) - st.hover) * Math.min(1, dt * (pointer.inside ? 6 : 2.5));
    st.speed += (st.speedTarget - st.speed) * Math.min(1, dt * 12);
    st.speedTarget *= Math.exp(-dt * 7);
    st.velScreen.lerp(st.velScreenTarget, Math.min(1, dt * 10));
    st.velScreenTarget.multiplyScalar(Math.exp(-dt * 7));
    if (st.velScreen.length() > 0.08) st.splitDir.lerp(tmpV.set(st.velScreen.x, st.velScreen.y, 0).normalize(), Math.min(1, dt * 8)).normalize();

    // accumulation: presence alone barely registers, sustained speed builds instability
    const gain = st.hover * (0.012 + Math.min(st.speed, 5) * 0.09) * (active ? 1 : 0.12);
    st.energy += gain * dt;
    if (idleFor > 0.4 || !pointer.inside) st.energy -= dt * (0.35 + st.energy * 0.5);
    st.energy = Math.min(1.4, Math.max(0, st.energy));
    // rough him up enough and he comes apart at the joints
    if (st.energy > 0.75 && Math.random() < dt * (st.energy - 0.65) * 0.5 && dance.collapse()) st.energy *= 0.6;

    // glitch pulses: rare at rest, frequent under pressure, lingering after
    const rate = (0.1 + st.energy * 1.2 + Math.min(st.speed, 4) * 0.4 * st.hover) * (reduced ? 0.4 : 1);
    if (Math.random() < rate * dt) st.glitch = Math.max(st.glitch, 0.3 + Math.random() * 0.7);
    st.glitch *= Math.exp(-dt * 7);

    // the beat, then the pose it asks for, then where that puts every bone
    beat.update(dt, now);
    const bs = beat.state;
    danceCtx.beat = bs.beat; danceCtx.bpm = bs.bpm; danceCtx.vibe = bs.vibe; danceCtx.energy = bs.energy; danceCtx.going = !!bs.going; danceCtx.t = t;
    danceCtx.lookX += ((pointer.inside ? pointer.ndc.x : 0) - danceCtx.lookX) * Math.min(1, dt * 3);
    danceCtx.lookY += ((pointer.inside ? pointer.ndc.y - 0.55 : 0) - danceCtx.lookY) * Math.min(1, dt * 3);
    const moved = dance.step(dt, danceCtx);
    rig.solve(moved.pose);
    rig.heap(moved.heap);
    rig.write(boneData);
    boneTex.needsUpdate = true;
    heapMax = 0;
    for (let i = 0; i < rig.NB - 1; i++) heapMax = Math.max(heapMax, moved.heap[i]);
    if (moved.landed) { st.glitch = Math.max(st.glitch, 0.8); st.pulse = Math.max(st.pulse, 0.6); }
    // dust comes loose while he's in pieces
    st.loose += ((moved.down ? 0.35 : 0) - st.loose) * Math.min(1, dt * 4);

    // pulls back quickly when he reaches out of shot, and comes back in slowly
    if (!(SK.debug && SK.debug.freeCam)) frameHim(Math.min(1, dt * 1.6));

    // slow sway plus pointer parallax
    const tx = pointer.inside ? pointer.ndc.x : 0, ty = pointer.inside ? pointer.ndc.y : 0;
    st.parX += (tx - st.parX) * Math.min(1, dt * 1.5);
    st.parY += (ty - st.parY) * Math.min(1, dt * 1.5);
    const sway = reduced ? 0.4 : 1;
    sculpture.rotation.y = Math.sin(t * 0.21) * 0.1 * sway + st.parX * 0.3;
    sculpture.rotation.x = Math.sin(t * 0.13) * 0.03 * sway - st.parY * 0.14;
    sculpture.updateMatrixWorld();

    // pointer ray into object space
    raycaster.setFromCamera(pointer.ndc, camera);
    inv.copy(sculpture.matrixWorld).invert();
    rayO.copy(raycaster.ray.origin).applyMatrix4(inv);
    rayD.copy(raycaster.ray.direction).transformDirection(inv);
    if (pointer.inside && Math.abs(rayD.z) > 1e-4) {
      hit.copy(rayD).multiplyScalar(-rayO.z / rayD.z).add(rayO);
      if (st.lastHit) {
        tmpV.copy(hit).sub(st.lastHit).divideScalar(Math.max(dt, 1 / 240));
        if (tmpV.length() > 14) tmpV.setLength(14);
        st.velWorld.lerp(tmpV, Math.min(1, dt * 12));
      } else st.lastHit = new THREE.Vector3();
      st.lastHit.copy(hit);
    }
    st.velWorld.multiplyScalar(Math.exp(-dt * 4));
    stepPeers(dt, now);

    // the music gets into everything a little: louder songs shake the picture more
    const drive = bs.going ? bs.energy : 0;
    const energy = Math.max(st.energy, drive * 0.16);
    const kick = bs.going ? bs.kick * (0.35 + 0.65 * bs.energy) * (1 - 0.6 * Math.min(1, st.energy)) : 0;
    if (bs.going && bs.bar > 0.97) {
      st.pulse = Math.max(st.pulse, 0.25 + 0.4 * bs.energy);
      finalMat.uniforms.uPulseCol.value.copy(Math.floor(bs.beat / 4) % 4 === 0 ? PAL.soft : PAL.primary);
      if (bs.energy > 0.8 && Math.random() < 0.35) st.glitch = Math.max(st.glitch, 0.6);
    }

    const vu = velMat.uniforms;
    vu.uTime.value = t; vu.uDt.value = dt; vu.uEnergy.value = energy; vu.uLoose.value = st.loose;
    st.clickBoom *= Math.exp(-dt * 6);
    vu.uGlitch.value = st.glitch; vu.uHover.value = st.hover; vu.uSpeed.value = Math.max(st.speed, st.clickBoom * 4);
    vu.uMouseVel.value.copy(st.velWorld);
    vu.uKick.value = kick;
    const pu = posMat.uniforms;
    pu.uTime.value = t; pu.uDt.value = dt; pu.uGlitch.value = st.glitch; pu.uEnergy.value = energy;
    const pt = ptMat.uniforms;
    pt.uTime.value = t; pt.uEnergy.value = energy; pt.uGlitch.value = st.glitch; pt.uKick.value = kick; pt.uBar.value = bs.going ? bs.bar : 0;
    const tu = trailMat.uniforms;
    tu.uTime.value = t % 600; tu.uEnergy.value = energy;
    tu.uDecay.value = Math.min(0.95, 0.35 + Math.min(energy, 1) * 0.5 + st.glitch * 0.1 + drive * 0.18);
    tu.uDrift.value.set(st.velScreen.x * dt * 0.25 * st.hover, st.velScreen.y * dt * 0.25 * st.hover + 0.0008 * energy);
    const fu = finalMat.uniforms;
    fu.uTime.value = t % 600; fu.uEnergy.value = energy; fu.uGlitch.value = st.glitch; fu.uSpeed.value = st.speed;
    fu.uCollapse.value = heapMax * 0.5; fu.uHover.value = st.hover;
    fu.uMouse.value.set(pointer.ndc.x * 0.5 + 0.5, pointer.ndc.y * 0.5 + 0.5);
    fu.uSplitDir.value.copy(st.splitDir);
    st.pulse *= Math.exp(-dt * 3.2);
    fu.uPulse.value = st.pulse;

    // after a big chaotic episode calms down, the whole palette turns to a new colour
    st.peak = Math.max(st.peak, st.energy + heapMax);
    if (st.peak > 1.1 && st.energy < 0.08 && heapMax < 0.05) { newPalette(); st.peak = 0; }
    stepPalette(dt);
  }

  // ---------- loop ----------
  let cur = 0, tCur = 0, first = true, last = performance.now() / 1000, t0 = last;
  let perfAcc = 0, perfN = 0, perfT = last, lastRaf = last, rafEma = 1 / 60, skipOdd = false;
  canvas.addEventListener("webglcontextrestored", () => { first = true; resize(); });
  function draw(dt, t) {
    update(dt, t);

    const nxt = 1 - cur;
    velMat.uniforms.uInit.value = posMat.uniforms.uInit.value = first ? 1 : 0;
    velMat.uniforms.tPos.value = posRT[cur].texture;
    velMat.uniforms.tVel.value = velRT[cur].texture;
    pass(velMat, velRT[nxt]);
    posMat.uniforms.tPos.value = posRT[cur].texture;
    posMat.uniforms.tVel.value = velRT[nxt].texture;
    pass(posMat, posRT[nxt]);
    cur = nxt;
    first = false;

    ptMat.uniforms.tPos.value = posRT[cur].texture;
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    const tn = 1 - tCur;
    trailMat.uniforms.tScene.value = sceneRT.texture;
    trailMat.uniforms.tPrev.value = trailRT[tCur].texture;
    pass(trailMat, trailRT[tn]);
    tCur = tn;

    finalMat.uniforms.tTrail.value = trailRT[tCur].texture;
    pass(finalMat, null);
  }
  function frame() {
    requestAnimationFrame(frame);
    const nowS = performance.now() / 1000;
    // on 90 Hz+ screens draw every other refresh (about 60 fps); wait out a lost GPU context
    const iv = nowS - lastRaf;
    lastRaf = nowS;
    if (iv > 0 && iv < 0.1) rafEma += (iv - rafEma) * 0.05;
    if (rafEma < 1 / 90) skipOdd = !skipOdd;
    else skipOdd = false;
    if (skipOdd || glc.isContextLost()) return;
    const raw = nowS - last;
    const dt = Math.min(1 / 30, Math.max(1 / 240, raw));
    last = nowS;

    // adaptive quality: if frames run slow for a couple of seconds, shrink the offscreen buffers
    if (nowS - t0 > 4 && raw < 0.25) {
      perfAcc += raw;
      perfN++;
      if (nowS - perfT > 2) {
        if (perfAcc / perfN > 0.024 && qScale > 0.5) { qScale = Math.max(0.5, qScale * 0.8); resize(); }
        perfAcc = perfN = 0;
        perfT = nowS;
      }
    }
    draw(dt, nowS - t0);
  }
  requestAnimationFrame(frame);

  SK.stage = { resetAll, newPalette, typeText, cloud, counts: cloud.counts, N };
  // ?debug: step it by hand (the preview pane doesn't animate while it's hidden) and see inside
  if (params.has("debug")) {
    let fake = 0;
    SK.debug = {
      st, pointer, rig, danceCtx,
      step(n, dt) { for (let i = 0; i < (n || 1); i++) { fake += dt || 1 / 60; draw(dt || 1 / 60, fake); } return fake; },
      setText, renderer, ptMat, camera,
      programs: () => renderer.info.programs.map((p) => ({ id: p.id, used: p.usedTimes, diagnostics: p.diagnostics || null })),
      // where the particles are, and how far from home: bounds, and the mean distance for glyphs and for bone dust
      probe() {
        const buf = new Float32Array(N * 4), m = new THREE.Matrix4(), h = new THREE.Vector3();
        renderer.readRenderTargetPixels(posRT[cur], 0, 0, SIM, SIM, buf);
        renderer.setRenderTarget(null);
        const lo = [9, 9, 9], hi = [-9, -9, -9], away = [0, 0], count = [0, 0];
        let bad = 0;
        for (let i = 0; i < N; i++) {
          const w = cloud.home[i * 4 + 3], bone = Math.floor(w) % 32, kind = Math.floor(w / 32);
          if (!Number.isFinite(buf[i * 4])) { bad++; continue; }
          if (bone === rig.B.air) continue;
          h.set(cloud.home[i * 4], cloud.home[i * 4 + 1], cloud.home[i * 4 + 2]).applyMatrix4(m.copy(rig.bones[bone].world));
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], buf[i * 4 + k]); hi[k] = Math.max(hi[k], buf[i * 4 + k]); }
          away[kind] += Math.hypot(buf[i * 4] - h.x, buf[i * 4 + 1] - h.y, buf[i * 4 + 2] - h.z); count[kind]++;
        }
        return { bad, lo: lo.map((v) => +v.toFixed(2)), hi: hi.map((v) => +v.toFixed(2)), dustAway: +(away[0] / count[0]).toFixed(3), glyphAway: +(away[1] / count[1]).toFixed(3), simType: simType === THREE.FloatType ? "float" : "half" };
      },
    };
  }
})();
