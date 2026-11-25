// Sprite Forge — real pixel-art sprite sheets baked from a tiny 3D rig, at boot, in the browser.
//
// The idea (same family as Dead Cells / SpriteCast's free half): build the hunter as a low-poly 3D
// puppet with joints, pose it with keyframed animations, render every frame from 8 facings with an
// orthographic camera at the game's pitch, then turn each render into pixel art:
//   · toon shading in hard bands, each material's colours taken from a fixed hand-picked ramp
//     (the shader outputs palette colours directly — nothing to quantise afterwards)
//   · rendered at 4x, then each output pixel takes the MOST COMMON colour of its 4x4 block
//     (no blending: edges stay crisp, one colour per pixel)
//   · a 1px dark outline round the silhouette, plus inner lines where a part passes in front of another
//     (from a second render pass carrying each part's id and depth)
// Held weapons are joints of the rig, so they are always in the hand and swing in real 3D — from
// any facing the swing, the roll and the grip read correctly.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const F = (EW.Forge = {});

  // ------------------------------------------------------------------ colour ramps
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb([h, s, l]) {
    const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  // hue-shifted ramp: shadows cooler and more saturated, lights warmer — the pixel-art way
  F.ramp = (base, { contrast = 1, lift = true } = {}) => {
    let [h, s, l] = rgb2hsl(hex(base));
    if (lift && l < 0.42) l = 0.42 - (0.42 - l) * 0.55; // lift dark materials (hair, pants, cape) so their bands stay readable
    base = toHex(hsl2rgb([h, s, l]));
    const shift = (dh, ds, dl) => toHex(hsl2rgb([(h + dh + 1) % 1, Math.max(0, Math.min(1, s + ds)), Math.max(0.03, Math.min(0.97, l + dl * contrast))]));
    // a gentle hue drift (never more than ~0.035 of the wheel), shadows a touch cooler, lights warmer
    const toward = (target, k) => { let d = target - h; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return Math.max(-0.035, Math.min(0.035, d * k)); };
    return [
      shift(toward(0.7, 0.1), -0.04, -0.17),
      shift(toward(0.7, 0.05), -0.02, -0.085),
      base,
      shift(toward(0.13, 0.08), -0.03, 0.12),
    ];
  };
  F.INK = '#1c1418';

  // ------------------------------------------------------------------ toon material (palette colours out)
  const LIGHT = new THREE.Vector3(-0.55, 0.75, 0.6).normalize(); // fixed relative to the camera: upper-left-front
  function toonMat(ramp, { metal = false } = {}) {
    const c = ramp.map((h) => new THREE.Color(h));
    return new THREE.ShaderMaterial({
      uniforms: { c0: { value: c[0] }, c1: { value: c[1] }, c2: { value: c[2] }, c3: { value: c[3] }, L: { value: LIGHT }, metal: { value: metal ? 1 : 0 } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 L; uniform float metal; varying vec3 vN;
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float d = dot(n, L);
          vec3 c = d > 0.7 ? c3 : d > -0.05 ? c2 : d > -0.45 ? c1 : c0;
          if (metal < 0.5 && d > 0.7) c = d > 0.85 ? c3 : c2;
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.DoubleSide,
    });
  }
  // id + depth pass (for inner lines)
  const idMat = new THREE.ShaderMaterial({
    uniforms: { uId: { value: 0 } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uId; void main(){ float z = gl_FragCoord.z; float hi = floor(z*255.0)/255.0; gl_FragColor = vec4(uId/255.0, hi, (z-hi)*255.0, 1.0); }',
    side: THREE.DoubleSide,
  });

  // flat (unlit) material for glowing ember lines
  const flatMat = (h) => new THREE.MeshBasicMaterial({ color: new THREE.Color(h), side: THREE.DoubleSide });

  // ------------------------------------------------------------------ the rig
  // +Z is forward, +Y up, feet at y = 0, the right hand on -X. Chibi proportions (~3 heads), 2.3 units tall.
  F.buildHunter = (pal, weapon = 'greatsword') => {
    const R = {}, mats = {};
    const mat = (k, o = {}) => mats[k] || (mats[k] = o.flat ? flatMat(pal[k]) : toonMat(F.ramp(pal[k], o), o));
    let nextId = 1;
    const part = (geo, k, parent, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(geo, mat(k, o)); m.position.set(x, y, z); m.userData.pid = nextId++; parent.add(m); return m; };
    const joint = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); R[name] = g; return g; };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);
    const ball = (r, w = 12, hh = 9) => new THREE.SphereGeometry(r, w, hh);

    const root = new THREE.Group(); R.root = root;
    const body = joint('body', root, 0, 0, 0);           // roll / bob pivot lives here
    const hips = joint('hips', body, 0, 0.82, 0);
    part(box(0.46, 0.2, 0.3), 'pants', hips, 0, 0.02, 0);
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const th = joint('thigh' + n, hips, 0.13 * s, -0.04, 0);
      part(cyl(0.11, 0.1, 0.36), 'pants', th, 0, -0.18, 0);
      const kn = joint('knee' + n, th, 0, -0.36, 0);
      part(cyl(0.1, 0.09, 0.3), 'pants', kn, 0, -0.15, 0);
      const ft = joint('foot' + n, kn, 0, -0.32, 0);
      part(box(0.2, 0.16, 0.3), 'boot', ft, 0, -0.02, 0.05);
    }
    const spine = joint('spine', hips, 0, 0.1, 0);
    part(cyl(0.25, 0.27, 0.46, 10), 'leather', spine, 0, 0.24, 0);
    part(cyl(0.285, 0.285, 0.09, 10), 'cloth', spine, 0, 0.06, 0);
    part(box(0.12, 0.1, 0.05), 'accent', spine, 0, 0.06, 0.28);
    const chest = joint('chest', spine, 0, 0.46, 0);
    const neck = joint('neck', chest, 0, 0.04, 0);
    const head = joint('head', neck, 0, 0.36, 0);
    part(ball(0.36), 'skin', head, 0, 0, 0.02);
    const hair = part(ball(0.385, 12, 9), 'hair', head, 0, 0.07, -0.05);
    hair.scale.set(1, 0.92, 1);
    part(box(0.6, 0.14, 0.32), 'hair', head, 0, 0.2, 0.1);                 // fringe
    part(box(0.07, 0.11, 0.04), 'ink', head, -0.12, -0.02, 0.36);          // eyes
    part(box(0.07, 0.11, 0.04), 'ink', head, 0.12, -0.02, 0.36);
    const capeA = joint('capeA', chest, 0, -0.02, -0.22);
    part(box(0.56, 0.42, 0.05), 'cape', capeA, 0, -0.2, 0);
    const capeB = joint('capeB', capeA, 0, -0.4, 0);
    part(box(0.6, 0.34, 0.05), 'cape', capeB, 0, -0.16, 0);
    part(box(0.36, 0.12, 0.3), 'cape', chest, 0, 0.0, -0.04);             // collar / hood roll
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const sh = joint('shoulder' + n, chest, 0.33 * s, -0.06, 0);
      part(ball(0.13, 8, 6), 'metal', sh, 0, 0.02, 0, { metal: true });
      part(cyl(0.085, 0.08, 0.24), 'leather', sh, 0, -0.13, 0);
      const el = joint('elbow' + n, sh, 0, -0.26, 0);
      part(cyl(0.08, 0.075, 0.22), 'leather', el, 0, -0.11, 0);
      const hd = joint('hand' + n, el, 0, -0.25, 0);
      part(ball(0.085, 8, 6), 'skin', hd, 0, 0, 0);
    }
    // weapon: a joint in the right hand, blade along its +Z, broad face normal along its +Y
    const glow = pal.glow ? (g, parent, x, y, z) => part(g, 'glow', parent, x, y, z, { flat: true }) : () => null;
    const wp = joint('weapon', R.handR, 0, 0, 0);
    if (weapon === 'greatsword') {
      part(box(0.08, 0.08, 0.46), 'grip', wp, 0, 0, -0.04);
      part(box(0.15, 0.12, 0.12), 'guard', wp, 0, 0, -0.3, { metal: true });    // pommel
      part(box(0.62, 0.11, 0.13), 'guard', wp, 0, 0, 0.24, { metal: true });    // wide crossguard
      part(box(0.2, 0.13, 0.12), 'guard', wp, 0, 0, 0.35, { metal: true });     // ricasso block
      part(box(0.36, 0.08, 1.9), 'blade', wp, 0, 0, 1.36, { metal: true });     // slab of a blade
      part(box(0.24, 0.07, 0.2), 'blade', wp, 0, 0, 2.4, { metal: true });
      part(box(0.12, 0.06, 0.14), 'blade', wp, 0, 0, 2.56, { metal: true });
      part(box(0.05, 0.1, 1.7), 'guard', wp, 0, 0, 1.3, { metal: true });       // fuller
      glow(box(0.06, 0.11, 1.7), wp, 0, 0, 1.3);
    } else if (weapon === 'spear') {
      part(cyl(0.035, 0.035, 2.3, 6), 'shaft', wp, 0, 0, 0.5).rotation.x = Math.PI / 2;
      part(box(0.09, 0.09, 0.09), 'guard', wp, 0, 0, 1.6, { metal: true });
      part(new THREE.ConeGeometry(0.09, 0.4, 6), 'blade', wp, 0, 0, 1.84, { metal: true }).rotation.x = Math.PI / 2;
      glow(box(0.03, 0.03, 0.3), wp, 0, 0, 1.82);
    } else {
      for (const [name, hand] of [['weapon', null], ['weaponOff', R.handL]]) {
        const w = hand ? joint(name, hand, 0, 0, 0) : wp;
        part(box(0.06, 0.06, 0.16), 'grip', w, 0, 0, 0);
        part(box(0.2, 0.06, 0.05), 'guard', w, 0, 0, 0.1, { metal: true });
        part(box(0.1, 0.03, 0.62), 'blade', w, 0, 0, 0.42, { metal: true });
        glow(box(0.03, 0.04, 0.55), w, 0, 0, 0.42);
      }
    }
    root.traverse((o) => { o.userData.rest = { p: o.position.clone(), r: o.rotation.clone() }; });
    root.userData.kind = weapon;
    root.updateMatrixWorld(true); root.userData.chestRestInv = chest.matrixWorld.clone().invert();
    return { root, R, ids: nextId };
  };
  // hero palette + weapon colours ('ink' is for tiny dark details)
  F.PALETTE = (p, tier = 0) => {
    const ember = tier >= 1;
    return Object.assign({ ink: '#2a1c1c' }, p, {
      blade: ember ? '#4a4044' : '#c8d2dc', guard: ember ? '#d8ccb0' : '#b0893c', grip: '#5a3420',
      shaft: ember ? '#3a2a26' : '#8a6038', glow: ember ? '#ff8a3a' : null,
    });
  };

  // ------------------------------------------------------------------ poses
  // a pose is { joint: [rx, ry, rz], …, _y: body lift, _rx: forward roll, _fall: fall on the back,
  //             _ik: { R: { g, d, f }, L: { g, d, f } } }
  // _ik places the hands at g (character space) with inverse kinematics and points each held blade
  // along d (its broad face toward f) — so a swing is just "where are the hands, where is the blade".
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const easeIn = (t) => t * t;
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const l3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const L1 = 0.26, L2 = 0.25, FACE = nrm([1, 0, 1]);
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
  function solveArm(R, side, g, pole) {
    const sh = R['shoulder' + side], el = R['elbow' + side], hd = R['hand' + side];
    const T = R.chest.worldToLocal(R.root.localToWorld(V3(g)));
    const S = sh.position.clone();
    const u = T.clone().sub(S); let d = u.length(); u.normalize();
    d = Math.max(0.1, Math.min(L1 + L2 - 1e-3, d));
    // pole (where the elbow points) from character space into chest space
    R.root.getWorldQuaternion(_q); R.chest.getWorldQuaternion(_q2).invert();
    const P = V3(pole).applyQuaternion(_q).applyQuaternion(_q2);
    let v = P.clone().sub(u.clone().multiplyScalar(P.dot(u)));
    if (v.lengthSq() < 1e-6) v.set(0, 0, -1).sub(u.clone().multiplyScalar(-u.z));
    v.normalize();
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))), sinA = Math.sqrt(1 - cosA * cosA);
    const Ed = u.clone().multiplyScalar(cosA).add(v.clone().multiplyScalar(sinA));
    const E = S.clone().add(Ed.clone().multiplyScalar(L1));
    const Fd = S.clone().add(u.clone().multiplyScalar(d)).sub(E).normalize();
    const y = Ed.clone().negate();
    let z = Fd.clone().sub(Ed.clone().multiplyScalar(Fd.dot(Ed)));
    if (z.lengthSq() < 1e-6) z = v.clone().sub(Ed.clone().multiplyScalar(v.dot(Ed)));
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    sh.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
    el.rotation.set(-Math.acos(Math.max(-1, Math.min(1, Ed.dot(Fd)))), 0, 0);
    hd.rotation.set(0, 0, 0);
  }
  function orientWeapon(R, jn, hn, d, f) {
    if (!R[jn]) return;
    R.root.getWorldQuaternion(_q);
    const z = V3(nrm(d)).applyQuaternion(_q);
    const h = V3(f || FACE).applyQuaternion(_q); h.sub(z.clone().multiplyScalar(h.dot(z)));
    if (h.lengthSq() < 1e-4) { h.set(0, 1, 0).applyQuaternion(_q); h.sub(z.clone().multiplyScalar(h.dot(z))); }
    h.normalize();
    const x = new THREE.Vector3().crossVectors(h, z);
    const Qw = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, h, z));
    R[hn].getWorldQuaternion(_q2).invert();
    R[jn].quaternion.copy(_q2.multiply(Qw));
  }
  function solveIK(R, ik) {
    R.root.updateMatrixWorld(true);
    solveArm(R, 'R', ik.R.g, [-0.8, -1, -0.5]);
    solveArm(R, 'L', ik.L.g, [0.8, -1, -0.5]);
    R.root.updateMatrixWorld(true);
    if (ik.R.d) orientWeapon(R, 'weapon', 'handR', ik.R.d, ik.R.f);
    if (ik.L.d) orientWeapon(R, 'weaponOff', 'handL', ik.L.d, ik.L.f);
  }
  // ------------------------------------------------------------------ sheathed weapons (carried on the back)
  // [joint, hand, grip position, blade direction, broad-face normal] in character space at rest; the
  // placement rides on the chest, so it follows the spine when running hunched or rolling.
  const SHEATH = {
    // Cloud-style: hilt jutting up over the right shoulder, the slab of a blade slanting down the back
    greatsword: [['weapon', 'handR', [-0.38, 2.3, -0.42], nrm([0.6, -0.8, -0.04]), [0, 0, 1]]], // tip stays above the ankles (blade is longer than the hero is tall)
    // across the back, head up over the right shoulder
    spear: [['weapon', 'handR', [0.06, 1.18, -0.36], nrm([-0.5, 0.86, -0.02]), [0, 0, 1]]],
    // crossed on the back, hilts up
    dual: [['weapon', 'handR', [-0.22, 1.6, -0.36], nrm([0.42, -0.9, -0.04]), [0, 0, 1]], ['weaponOff', 'handL', [0.22, 1.6, -0.39], nrm([-0.42, -0.9, -0.04]), [0, 0, 1]]],
  };
  // the weapon's two ends along its own +Z (pommel / blade tip, butt / spearhead)
  const SHEATH_ENDS = { greatsword: [-0.36, 2.63], spear: [-0.65, 2.04], dual: [-0.08, 0.73] };
  const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _vs = new THREE.Vector3();
  function sheathe(R) {
    const ud = R.root.userData, list = SHEATH[ud.kind]; if (!list) return;
    R.root.updateMatrixWorld(true);
    for (const [jn, hn, g, d, f] of list) {
      if (!R[jn]) continue;
      const z = V3(d), y = V3(f); y.sub(z.clone().multiplyScalar(y.dot(z))).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      _M.makeBasis(x, y, z).setPosition(g[0], g[1], g[2]);           // wanted, in rest character space
      _M2.copy(ud.chestRestInv).multiply(_M);                         // -> relative to the chest
      _M.copy(R.chest.matrixWorld).multiply(_M2);                     // -> world, following the posed chest
      // never into the ground (lying on the back, mid-roll): lift by however far the lower end would sink
      const ends = SHEATH_ENDS[ud.kind] || [0, 1];
      let low = Infinity;
      for (const ez of ends) { const yy = _vs.set(0, 0, ez).applyMatrix4(_M).y - R.root.matrixWorld.elements[13]; if (yy < low) low = yy; }
      if (low < 0.16) _M.elements[13] += 0.16 - low; // margin covers the blade's width past its centre line
      _M2.copy(R[hn].matrixWorld).invert().multiply(_M);              // -> local to the hand the joint hangs from
      _M2.decompose(R[jn].position, R[jn].quaternion, _vs);
    }
  }
  F.SHEATH = SHEATH;
  F._apply = (R, pose) => apply(R, pose); // for tools / tests
  function apply(R, pose) {
    for (const [k, o] of Object.entries(R)) { const r = o.userData.rest; if (r && k !== 'root') { o.position.copy(r.p); o.rotation.copy(r.r); } }
    for (const [k, v] of Object.entries(pose)) {
      if (k === '_y') R.body.position.y += v;
      else if (k === '_rx') { const c = 1.0; R.body.rotation.x = v; R.body.position.y += c * (1 - Math.cos(v)); R.body.position.z -= c * Math.sin(v); }
      else if (k === '_fall') { R.body.rotation.x = v; R.body.position.y += 0.3 * Math.abs(Math.sin(v)); R.body.position.z += 1.0 * Math.abs(Math.sin(v)); }
      else if (k === '_z') R.body.position.z += v;
      else if (k === '_ik' || k === '_sheath') continue;
      else if (R[k]) R[k].rotation.set(v[0] || 0, v[1] || 0, v[2] || 0);
    }
    if (pose._ik) solveIK(R, pose._ik);
    if (pose._sheath > 0.5) sheathe(R);
  }
  const mixHand = (a, b, t) => ({
    g: a.g && b.g ? l3(a.g, b.g, t) : a.g || b.g,
    d: a.d && b.d ? nrm(l3(a.d, b.d, t)) : a.d || b.d,
    f: a.f && b.f ? nrm(l3(a.f, b.f, t)) : a.f || b.f,
  });
  const mixIk = (a, b, t) => ({ R: mixHand(a.R, b.R, t), L: mixHand(a.L, b.L, t) });
  function mix(a, b, t) {
    const o = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (k === '_ik') continue;
      const x = a[k], y = b[k];
      if (typeof x === 'number' || typeof y === 'number') o[k] = lerp(x || 0, y || 0, t);
      else { const p = x || [0, 0, 0], q = y || [0, 0, 0]; o[k] = [lerp(p[0] || 0, q[0] || 0, t), lerp(p[1] || 0, q[1] || 0, t), lerp(p[2] || 0, q[2] || 0, t)]; }
    }
    if (a._ik && b._ik) o._ik = mixIk(a._ik, b._ik, t); else if (a._ik || b._ik) o._ik = a._ik || b._ik;
    return o;
  }
  const withIk = (pose, ik) => Object.assign({}, pose, { _ik: ik });
  const shiftIk = (ik, dR, dL = dR) => ({ R: Object.assign({}, ik.R, { g: add(ik.R.g, dR) }), L: Object.assign({}, ik.L, { g: add(ik.L.g, dL) }) });

  // ------------------------------------------------------------------ weapon handling
  // swing angle a: the game's convention (weapons.js) — 0 = blade up, negative = rotated toward the facing.
  // roll tips the swing plane over toward the weapon hand's side (0 = vertical chop, ~1.4 = flat sweep).
  // style: 'heavy' (two-handed, hands travel over the head), 'quick' (one blade per hand), 'thrust'.
  function swing(a, { roll = 0, side = -1, style = 'heavy', ext = 0 } = {}) {
    const up = [-side * Math.sin(roll), Math.cos(roll), 0];
    // the blade leans out toward its hand's side so it clears the body even when seen from behind
    const lean = style === 'thrust' ? 0.1 : style === 'heavy' ? 0.3 : 0.4;
    const d = nrm(add(add(mul(up, Math.cos(a)), [0, 0, -Math.sin(a)]), [side * lean * Math.abs(Math.sin(a)), 0, 0]));
    if (style === 'thrust') return { g: add([side * 0.26, 1.14, 0.1], mul(d, ext)), d };
    const heavy = style === 'heavy';
    const th = heavy ? (a > 0 ? a * 0.12 : a * 0.85) : a * 0.62;
    const r = heavy ? 0.38 : 0.36;
    const c = heavy ? [-0.22 - (a > 0 ? 0.1 * Math.min(1, a / 2.5) : 0), 1.28, 0.3] : [side * 0.3, 1.2, 0.2];
    return { g: add(c, add(mul(up, Math.cos(th) * r), [0, 0, -Math.sin(th) * r])), d };
  }
  // the other hand of a two-handed weapon goes on the grip
  function grip(weapon, R, L) {
    if (L) return { R, L };
    if (weapon === 'greatsword') return { R, L: { g: add(R.g, mul(R.d, -0.2)) } };
    if (weapon === 'spear') return { R, L: { g: add(R.g, mul(R.d, 0.45)) } };
    return { R, L: { g: [0.3, 0.95, 0.12] } };
  }

  // greatsword guard: both hands on the hilt in front, blade upright (hand-posed, then measured into _ik)
  const GS_GUARD = {
    shoulderR: [-0.5, 0, -0.32], elbowR: [-1.0, 0, 0], handR: [0, 0, 0], weapon: [0.1, -0.42, 0],
    shoulderL: [-0.62, 0, 0.12], elbowL: [-1.05, 0, 0], handL: [0, 0, 0],
    spine: [0.04, -0.28, 0], head: [-0.04, 0.22, 0],
    thighL: [-0.12, 0, 0.04], thighR: [0.16, 0, -0.04], kneeL: [0.12, 0, 0], kneeR: [0.1, 0, 0],
    capeA: [0.1, 0, 0], capeB: [0.06, 0, 0],
  };
  const STAND = {
    spine: [0.04, 0, 0], thighL: [-0.1, 0, 0.05], thighR: [0.12, 0, -0.05], kneeL: [0.1, 0, 0], kneeR: [0.08, 0, 0], capeA: [0.1, 0, 0], capeB: [0.05, 0, 0],
  };
  function measure(rig, pose) {
    const R = rig.R; R.root.rotation.set(0, 0, 0);
    const p = Object.assign({}, pose); delete p._ik; apply(R, p); R.root.updateMatrixWorld(true);
    const pos = (o) => R.root.worldToLocal(o.getWorldPosition(new THREE.Vector3())).toArray();
    const dir = (o, v) => v.applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())).toArray();
    return { R: { g: pos(R.handR), d: dir(R.weapon, new THREE.Vector3(0, 0, 1)), f: dir(R.weapon, new THREE.Vector3(0, 1, 0)) }, L: { g: pos(R.handL) } };
  }
  function basePose(rig, weapon) {
    if (weapon === 'greatsword') return withIk(Object.assign({}, STAND, { spine: [0.1, -0.12, 0.04], head: [-0.05, 0.1, 0], capeA: [0.12, 0, 0] }),
      { R: { g: [-0.2, 1.26, 0.34], d: nrm([-0.5, 0.14, -0.85]), f: [0, 1, 0] }, L: { g: [0.34, 0.94, 0.08] } }); // blade lies across the right shoulder
    if (weapon === 'spear') return withIk(STAND, { R: { g: [-0.34, 0.98, 0.14], d: nrm([0, Math.cos(0.35), Math.sin(0.35)]) }, L: { g: [0.3, 0.94, 0.06] } });
    return withIk(STAND, { R: { g: [-0.32, 1.0, 0.16], d: nrm([-0.55, 0.6, 0.55]) }, L: { g: [0.32, 1.0, 0.16], d: nrm([0.55, 0.65, 0.5]) } });
  }

  // body motion for each phase of an attack
  const BODY = {
    heavy: {
      wind: { spine: [-0.18, 0.3, 0], head: [0.05, -0.2, 0], thighL: [-0.3, 0, 0.05], thighR: [0.35, 0, 0], kneeL: [0.25, 0, 0], kneeR: [0.2, 0, 0], capeA: [0.15, 0, 0], _y: 0.02 },
      act: { spine: [0.42, -0.15, 0], head: [-0.2, 0.1, 0], thighL: [-0.75, 0, 0.05], thighR: [0.55, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.35, 0, 0], capeA: [0.6, 0, 0], capeB: [0.4, 0, 0], _y: -0.14 },
    },
    thrust: {
      wind: { spine: [-0.05, 0.4, 0], head: [0, -0.3, 0], thighL: [-0.25, 0, 0.05], thighR: [0.3, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.2, 0, 0], _y: -0.04 },
      act: { spine: [0.22, -0.25, 0], head: [-0.1, 0.2, 0], thighL: [-0.8, 0, 0.05], thighR: [0.5, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.2, 0, 0], capeA: [0.5, 0, 0], capeB: [0.3, 0, 0], _y: -0.16 },
    },
    quick: {
      wind: { spine: [0.08, 0.4, 0], head: [0, -0.3, 0], thighL: [-0.2, 0, 0.05], thighR: [0.25, 0, 0], kneeL: [0.25, 0, 0], kneeR: [0.2, 0, 0], _y: -0.05 },
      act: { spine: [0.25, -0.45, 0], head: [-0.05, 0.3, 0], thighL: [-0.55, 0, 0.05], thighR: [0.4, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.25, 0, 0], capeA: [0.45, 0, 0], _y: -0.1 },
    },
  };
  const twist = (b, k) => Object.assign({}, b, { spine: [b.spine[0], b.spine[1] * k, b.spine[2]] });

  // one attack from weapons.js → wind / act / recover frames
  function moveAnim(weapon, m, base) {
    const style = weapon === 'greatsword' ? 'heavy' : m.thrust ? 'thrust' : 'quick';
    const n = style === 'heavy' ? [3, 3, 3] : [2, 3, 2];
    if (!(m.wind > 0)) n[0] = 1;
    const tilt = m.trail ? m.trail.tilt : 1.25;
    const roll = Math.max(0, Math.min(1.45, (1.25 - Math.abs(tilt)) * 1.2));
    const hand = m.hand || 'main';
    const B = BODY[style], sgn = hand === 'off' ? -1 : 1;
    const wB = twist(B.wind, sgn * (roll > 0.8 ? 1.6 : 1)), aB = twist(B.act, sgn * (roll > 0.8 ? 1.6 : 1));
    const ik = (a, ext) => {
      if (style === 'thrust') return grip(weapon, swing(a, { style, ext }));
      if (style === 'heavy') return grip(weapon, swing(a, { roll, style }));
      const R = hand === 'off' ? base._ik.R : swing(a, { roll, style, side: -1 });
      const L = hand === 'main' ? base._ik.L : swing(hand === 'both' ? a + 0.35 : a, { roll, style, side: 1 });
      return { R, L };
    };
    const [a0, a1, a2] = m.a, poses = [];
    for (let i = 1; i <= n[0]; i++) {
      const k = i / n[0], a = lerp(a0, a1, ease(k)), e = lerp(0, -0.3, k);
      poses.push(withIk(mix(base, wB, ease(k)), mixIk(base._ik, ik(a, e), Math.min(1, k * 1.5))));
    }
    for (let i = 1; i <= n[1]; i++) {
      const k = i / n[1], a = lerp(a1, a2, easeIn(k)), e = lerp(-0.3, 0.35, k);
      poses.push(withIk(mix(wB, aB, ease(k)), ik(a, e)));
    }
    for (let i = 1; i <= n[2]; i++) {
      const k = i / n[2];
      poses.push(withIk(mix(aB, base, ease(k)), mixIk(ik(a2, 0.35), base._ik, ease(k))));
    }
    return { poses, nW: n[0], nA: n[1], nR: n[2] };
  }

  // the full animation set for one weapon
  F.animsFor = (rig, weapon) => {
    const base = basePose(rig, weapon), bi = base._ik, A = {};
    const legs = (k) => Object.assign({}, k);
    A.idle = { loop: true, poses: [0, 1, 2, 3].map((f) => { const b = (1 - Math.cos((f / 4) * Math.PI * 2)) / 2; return withIk(mix(base, { _y: -0.02, spine: [base.spine[0] + 0.03, base.spine[1], 0], capeA: [0.14, 0, 0], capeB: [0.12, 0, 0] }, b), shiftIk(bi, [0, -0.025 * b, 0])); }) };
    A.walk = {
      loop: true, poses: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
        const a = (f / 8) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        const p = Object.assign({}, base, {
          _y: Math.abs(c) * 0.06 - 0.03,
          thighL: [-s * 0.62, 0, 0.03], thighR: [s * 0.62, 0, -0.03],
          kneeL: [Math.max(0, s) * 0.9 + 0.1, 0, 0], kneeR: [Math.max(0, -s) * 0.9 + 0.1, 0, 0],
          footL: [-Math.max(0, s) * 0.3, 0, 0], footR: [-Math.max(0, -s) * 0.3, 0, 0],
          spine: [0.1, base.spine[1] + s * 0.08, 0], capeA: [0.3 + Math.abs(c) * 0.1, 0, 0], capeB: [0.25, 0, s * 0.05],
        });
        const sw = weapon === 'greatsword' ? 0 : 0.05;
        return withIk(p, shiftIk(bi, [0, Math.abs(c) * 0.03 - 0.015, s * sw], [0, Math.abs(c) * 0.03 - 0.015, -s * sw]));
      }),
    };
    A.hurt = { poses: [withIk(mix(base, { spine: [-0.35, 0, 0.12], head: [-0.35, 0, 0], thighL: [0.2, 0, 0.1], thighR: [-0.25, 0, -0.1], kneeL: [0.3, 0, 0], kneeR: [0.4, 0, 0], capeA: [-0.1, 0, 0], _y: -0.05 }, 1), shiftIk(bi, [0, 0.06, -0.16]))] };
    A.down = {
      poses: [1, 2, 3, 4].map((f) => {
        const k = ease(f / 4);
        return { _fall: -1.5 * k, spine: [-0.2 * k, 0, 0], head: [-0.3 * k, 0, 0], thighL: [-0.5 * k, 0, 0.15 * k], kneeL: [0.6 * k, 0, 0], thighR: [-0.2 * k, 0, -0.15 * k], kneeR: [0.3 * k, 0, 0], shoulderR: [-0.4, 0, -1.1 * k], shoulderL: [-0.4, 0, 1.1 * k], elbowR: [-0.4, 0, 0], elbowL: [-0.4, 0, 0], weapon: [0.6, 0, 0], capeA: [0.2, 0, 0] };
      }),
    };
    const oneHand = { g: [-0.32, 0.98, 0.16], d: weapon === 'dual' ? bi.R.d : nrm([0, 0.85, 0.5]), f: weapon === 'greatsword' ? bi.R.f : undefined };
    A.drink = { poses: [[0.12, 1.35, 0.42], [0.05, 1.6, 0.42]].map((g, i) => withIk(Object.assign({}, base, { head: [-0.25 * i, 0, 0] }), { R: oneHand, L: { g } })) };
    A.gather = { poses: [withIk(Object.assign({}, base, { _y: -0.36, thighL: [-1.1, 0, 0.08], kneeL: [1.9, 0, 0], footL: [-0.8, 0, 0], thighR: [-0.4, 0, -0.08], kneeR: [1.6, 0, 0], footR: [-1.1, 0, 0], spine: [0.5, 0, 0] }), { R: { g: [-0.32, 0.9, 0.1], d: nrm([0, 0.6, -0.8]) }, L: { g: [0.15, 0.4, 0.55], d: bi.L.d } })] };
    A.jump = {
      poses: [
        withIk(Object.assign({}, base, { thighL: [-1.0, 0, 0.05], kneeL: [1.3, 0, 0], thighR: [-0.2, 0, -0.05], kneeR: [0.6, 0, 0], spine: [0.12, base.spine[1], 0], capeA: [0.6, 0, 0], capeB: [0.3, 0, 0] }), shiftIk(bi, [0, 0.08, 0])),
        withIk(Object.assign({}, base, { thighL: [-0.35, 0, 0.08], kneeL: [0.35, 0, 0], thighR: [0.15, 0, -0.08], kneeR: [0.45, 0, 0], spine: [0.02, base.spine[1], 0], capeA: [0.9, 0, 0], capeB: [0.5, 0, 0] }), shiftIk(bi, [0, 0.12, -0.04])),
      ],
    };
    A.land = { poses: [withIk(Object.assign({}, base, { _y: -0.2, thighL: [-0.6, 0, 0.06], kneeL: [1.15, 0, 0], footL: [-0.55, 0, 0], thighR: [-0.5, 0, -0.06], kneeR: [1.05, 0, 0], footR: [-0.55, 0, 0], spine: [0.3, base.spine[1], 0] }), shiftIk(bi, [0, -0.2, 0.06]))] };
    const plungeD = nrm([0, -0.97, 0.25]);
    A.plunge = { poses: [withIk(Object.assign({}, base, { thighL: [-1.1, 0, 0.05], kneeL: [1.5, 0, 0], thighR: [-0.7, 0, -0.05], kneeR: [1.4, 0, 0], spine: [0.15, 0, 0], capeA: [1.1, 0, 0] }), grip(weapon, { g: [-0.1, 1.66, 0.28], d: plungeD }, weapon === 'dual' ? { g: [0.1, 1.66, 0.28], d: plungeD } : null))] };
    const kneel = { _y: -0.42, thighL: [-1.5, 0, 0.1], kneeL: [1.9, 0, 0], thighR: [-0.3, 0, -0.1], kneeR: [2.2, 0, 0], spine: [0.15, 0, 0], capeA: [0.4, 0, 0] };
    const both = (R) => grip(weapon, R, weapon === 'dual' ? { g: add(R.g, [0.22, 0, 0]), d: R.d } : null);
    A.mraise = { poses: [withIk(Object.assign({}, base, kneel), both({ g: [-0.1, 1.62, 0.22], d: nrm([0, -0.35, 0.94]) }))] };
    A.mstab = { poses: [withIk(Object.assign({}, base, kneel, { spine: [0.55, 0, 0] }), both({ g: [-0.1, 0.92, 0.5], d: nrm([0, -0.92, 0.38]) }))] };
    A.brace = { poses: [withIk(Object.assign({}, base, kneel, { _y: -0.52, spine: [0.75, 0, 0], head: [-0.3, 0, 0] }), { R: { g: [-0.18, 0.86, 0.45], d: nrm([0, 0.3, -0.95]) }, L: { g: [0.18, 0.86, 0.45], d: bi.L.d } })] };
    if (weapon === 'greatsword') {
      A.roll = {
        poses: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
          const t = f / 7, tuck = Math.sin(Math.min(1, t * 1.15) * Math.PI);
          return {
            _rx: ease(Math.min(1, t * 1.08)) * Math.PI * 2, _y: tuck * 0.42,
            thighL: [-1.9 * tuck, 0, 0.1], thighR: [-1.7 * tuck, 0, -0.1], kneeL: [2.3 * tuck, 0, 0], kneeR: [2.2 * tuck, 0, 0],
            shoulderR: [-0.6 - 0.9 * tuck, 0, -0.05], elbowR: [-1.3 * tuck - 0.9, 0, 0], shoulderL: [-0.6 - 0.9 * tuck, 0, 0.3], elbowL: [-1.2 * tuck - 0.9, 0, 0],
            spine: [0.9 * tuck, 0, 0], head: [0.5 * tuck, 0, 0], capeA: [0.4 + 1.2 * tuck, 0, 0], capeB: [0.5 * tuck, 0, 0],
          };
        }),
      };
      A.guard = { poses: [withIk(Object.assign({}, base, { _y: -0.1, spine: [0.12, 0, 0], head: [0.05, 0, 0], thighL: [-0.45, 0, 0.08], kneeL: [0.45, 0, 0], thighR: [0.4, 0, -0.08], kneeR: [0.35, 0, 0] }), { R: { g: [-0.05, 1.12, 0.42], d: nrm([0.05, 1, 0.12]), f: [0, 0, 1] }, L: { g: [0.1, 1.5, 0.48] } })] };
      A.charge = { poses: [withIk(mix(base, BODY.heavy.wind, 1), grip(weapon, swing(2.6, { style: 'heavy' })))] };
    }
    if (weapon === 'spear') {
      A.stance = { poses: [withIk(Object.assign({}, base, { _y: -0.14, spine: [0.2, 0.3, 0], head: [0, -0.25, 0], thighL: [-0.55, 0, 0.08], kneeL: [0.65, 0, 0], thighR: [0.45, 0, -0.08], kneeR: [0.4, 0, 0] }), grip(weapon, { g: [-0.18, 1.0, 0.02], d: nrm([0, 0.22, 1]) }))] };
    }
    if (weapon === 'dual') {
      A.dash = { poses: [0.6, 1].map((k) => withIk(Object.assign({}, base, { _y: -0.12 * k, spine: [0.55 * k, 0, 0], head: [-0.3 * k, 0, 0], thighL: [-0.9 * k, 0, 0.05], kneeL: [0.8 * k, 0, 0], thighR: [0.6 * k, 0, -0.05], kneeR: [0.5 * k, 0, 0], capeA: [1.0 * k, 0, 0], capeB: [0.5 * k, 0, 0] }), { R: { g: [-0.3, 1.0, -0.1], d: nrm([-0.2, 0.25, -1]) }, L: { g: [0.3, 1.0, -0.1], d: nrm([0.2, 0.25, -1]) } })) };
      A.dance = { poses: [1, -1].map((s) => withIk(Object.assign({}, base, { spine: [0.15, 0.5 * s, 0], _y: -0.08 }), { R: swing(s > 0 ? 2.2 : -2.4, { roll: 0.8, style: 'quick', side: -1 }), L: swing(s > 0 ? -2.4 : 2.2, { roll: 0.8, style: 'quick', side: 1 }) })) };
    }
    // ---- sheathed (weapon on the back): free arms; '_s' twins of the everyday moves + sheathe / draw
    const FREE = { R: { g: [-0.36, 0.84, 0.05] }, L: { g: [0.36, 0.84, 0.05] } };
    const sb = Object.assign({}, STAND, { _sheath: 1, spine: [0.06, 0, 0] });
    // armed pose -> same body, hands keep their motion relative to the free-arm rest, weapon on the back
    const unarm = (pose) => {
      const o = Object.assign({}, pose, { _sheath: 1 });
      if (pose._ik) {
        const hand = (s) => { const h = pose._ik[s]; return { g: h && h.g ? add(FREE[s].g, add(h.g, mul(bi[s].g, -1))) : FREE[s].g }; };
        o._ik = { R: hand('R'), L: hand('L') };
      }
      if (o.spine && base.spine && o.spine[1] === base.spine[1]) o.spine = [o.spine[0], 0, o.spine[2]];
      return o;
    };
    for (const n of ['hurt', 'down', 'drink', 'gather', 'jump', 'land', 'roll', 'dash']) if (A[n]) A[n + '_s'] = { loop: A[n].loop, poses: A[n].poses.map(unarm) };
    A.idle_s = { loop: true, poses: [0, 1, 2, 3].map((f) => { const b = (1 - Math.cos((f / 4) * Math.PI * 2)) / 2; return withIk(mix(sb, { _sheath: 1, _y: -0.02, spine: [0.09, 0, 0], capeA: [0.14, 0, 0], capeB: [0.12, 0, 0] }, b), shiftIk(FREE, [0, -0.02 * b, 0])); }) };
    A.walk_s = {
      loop: true, poses: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
        const a = (f / 8) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        const p = Object.assign({}, sb, { _y: Math.abs(c) * 0.06 - 0.03, thighL: [-s * 0.62, 0, 0.03], thighR: [s * 0.62, 0, -0.03], kneeL: [Math.max(0, s) * 0.9 + 0.1, 0, 0], kneeR: [Math.max(0, -s) * 0.9 + 0.1, 0, 0], footL: [-Math.max(0, s) * 0.3, 0, 0], footR: [-Math.max(0, -s) * 0.3, 0, 0], spine: [0.1, s * 0.06, 0], capeA: [0.3 + Math.abs(c) * 0.1, 0, 0], capeB: [0.25, 0, s * 0.05] });
        return withIk(p, { R: { g: add(FREE.R.g, [0, Math.abs(s) * 0.03, s * 0.16]) }, L: { g: add(FREE.L.g, [0, Math.abs(s) * 0.03, -s * 0.16]) } });
      }),
    };
    // full sprint: long stride, hunched, arms pumping
    A.run_s = {
      loop: true, poses: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
        const a = (f / 8) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        const p = Object.assign({}, sb, {
          _y: Math.abs(c) * 0.1 - 0.06,
          thighL: [-s * 0.95 - 0.15, 0, 0.03], thighR: [s * 0.95 - 0.15, 0, -0.03],
          kneeL: [Math.max(0, s) * 1.35 + 0.25, 0, 0], kneeR: [Math.max(0, -s) * 1.35 + 0.25, 0, 0],
          footL: [-Math.max(0, s) * 0.4, 0, 0], footR: [-Math.max(0, -s) * 0.4, 0, 0],
          spine: [0.38, s * 0.1, 0], head: [-0.22, 0, 0], capeA: [0.85 + Math.abs(c) * 0.15, 0, 0], capeB: [0.45, 0, s * 0.08],
        });
        return withIk(p, { R: { g: [-0.3, 1.0 + s * 0.08, 0.1 + s * 0.26] }, L: { g: [0.3, 1.0 - s * 0.08, 0.1 - s * 0.26] } });
      }),
    };
    // sheathe: the weapon hand(s) carry the blade over the shoulder, let go, arms drop free
    const SH = SHEATH[weapon] || [];
    const reach = (i) => { const e = SH[i]; return e ? { g: add(e[2], [e[1] === 'handR' ? 0.05 : -0.05, -0.12, 0.2]), d: e[3], f: e[4] } : null; };
    const rR = reach(0), rL = weapon === 'dual' ? reach(1) : null;
    const halfR = { g: l3(bi.R.g, rR.g, 0.5), d: nrm(l3(bi.R.d || rR.d, rR.d, 0.5)), f: rR.f };
    const halfL = rL ? { g: l3(bi.L.g, rL.g, 0.5), d: nrm(l3(bi.L.d || rL.d, rL.d, 0.5)), f: rL.f } : { g: l3(bi.L.g, FREE.L.g, 0.5) };
    const turnBody = { spine: [0.02, 0.22, 0], head: [-0.05, -0.18, 0] };
    const sheatheP = [
      withIk(Object.assign({}, base, turnBody), { R: halfR, L: halfL }),
      withIk(Object.assign({}, base, turnBody, { _y: -0.02 }), { R: rR, L: rL || { g: FREE.L.g } }),
      withIk(Object.assign({}, sb, turnBody, { _sheath: 1 }), { R: { g: rR.g }, L: { g: rL ? rL.g : FREE.L.g } }),
      withIk(Object.assign({}, sb), { R: { g: l3(rR.g, FREE.R.g, 0.6) }, L: { g: rL ? l3(rL.g, FREE.L.g, 0.6) : FREE.L.g } }),
    ];
    A.sheathe = { poses: sheatheP };
    A.draw = { poses: sheatheP.slice().reverse() };
    // the weapon's attacks
    const W = EW.WEAPONS && EW.WEAPONS[weapon];
    if (W) for (const [name, m] of Object.entries(W.moves)) { if (name === 'dance') continue; A['mv_' + name] = moveAnim(weapon, m, base); }
    return A;
  };

  // ------------------------------------------------------------------ the baker
  // frames are packed row-major into an atlas `cols` frames wide; animation `name`, frame f, facing d
  // sits at cell start + d * frames + f.
  // all 8 facings of a frame are drawn side by side (one viewport each) into one wide buffer and read back
  // with a single readPixels per pass — the GPU->CPU stalls were most of the bake time
  function* bakeSteps({ pal, weapon = 'greatsword', tier = 0, only = null, fw = weapon === 'greatsword' ? 128 : 112, fh = weapon === 'greatsword' ? 120 : 96, footY = weapon === 'greatsword' ? 0.62 : 0.32, ppu = 24, pitch = 24, ss = 4, maxW = weapon === 'greatsword' ? 2560 : 2048 } = {}) {
    const rig = F.buildHunter(F.PALETTE(pal, tier), weapon);
    const scene = new THREE.Scene(); scene.add(rig.root);
    const W = fw * ss, H = fh * ss, WW = W * 8;
    const wu = fw / ppu, hu = fh / ppu;     // feet sit footY units above the frame's bottom
    const cam = new THREE.OrthographicCamera(-wu / 2, wu / 2, hu - footY, -footY, -20, 20);
    const p = (pitch * Math.PI) / 180; cam.position.set(0, Math.sin(p) * 10, Math.cos(p) * 10); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
    const renderer = F._renderer || (F._renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true }));
    renderer.setPixelRatio(1); renderer.setSize(WW, H, false); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shader colours are already the palette's sRGB values
    const gl = renderer.getContext();
    const col = new Uint8Array(WW * H * 4), idb = new Uint8Array(WW * H * 4);
    const toonOf = new Map(); rig.root.traverse((o) => { if (o.isMesh) toonOf.set(o, o.material); });
    const setId = (on) => rig.root.traverse((o) => { if (!o.isMesh) return; if (on) { o.material = idMat; o.onBeforeRender = () => { idMat.uniforms.uId.value = o.userData.pid; idMat.uniformsNeedUpdate = true; }; } else { o.material = toonOf.get(o); o.onBeforeRender = () => {}; } });

    const all = F.animsFor(rig, weapon);
    const list = Object.entries(all).filter(([n]) => !only || only.includes(n));
    const total = list.reduce((s, [, A]) => s + A.poses.length * 8, 0);
    const cols = Math.floor(maxW / fw), rows = Math.ceil(total / cols);
    const out = document.createElement('canvas'); out.width = cols * fw; out.height = rows * fh;
    const ox = out.getContext('2d');
    const meta = { fw, fh, cols, rows, dirs: 8, anims: {}, anchor: [fw / 2, fh - footY * ppu], footY, ppu };
    const ink = hex(F.INK);
    const img = ox.createImageData(fw, fh);
    const pass = (pose, id) => {
      setId(id);
      renderer.autoClear = false; renderer.setScissorTest(false); renderer.setViewport(0, 0, WW, H); renderer.clear();
      renderer.setScissorTest(true);
      for (let d = 0; d < 8; d++) {
        rig.root.rotation.set(0, (d * Math.PI) / 4, 0); // d=0 faces the camera, then counter-clockwise seen from above
        apply(rig.R, pose);
        renderer.setViewport(d * W, 0, W, H); renderer.setScissor(d * W, 0, W, H);
        renderer.render(scene, cam);
      }
      gl.readPixels(0, 0, WW, H, gl.RGBA, gl.UNSIGNED_BYTE, id ? idb : col);
    };
    try {
      let start = 0;
      for (const [name, A] of list) {
        const n = A.poses.length;
        meta.anims[name] = { frames: n, start, loop: !!A.loop, nW: A.nW, nA: A.nA, nR: A.nR };
        for (let f = 0; f < n; f++) {
          const k0 = (start + f * 8) / total;
          pass(A.poses[f], false); yield k0;
          pass(A.poses[f], true); setId(false); yield k0;
          for (let d = 0; d < 8; d++) {
            const cell = start + d * n + f;
            pixelize(col, idb, WW, d * W, ss, fw, fh, img.data, ink);
            ox.putImageData(img, (cell % cols) * fw, Math.floor(cell / cols) * fh);
            if (d % 2) yield (start + f * 8 + d + 1) / total;
          }
        }
        start += n * 8;
      }
    } finally {
      renderer.setScissorTest(false); renderer.autoClear = true;
      scene.remove(rig.root);
    }
    return Object.assign(meta, { canvas: out });
  }
  F.bake = (opts) => { const it = bakeSteps(opts); let r; do r = it.next(); while (!r.done); return r.value; };
  // the same bake spread over short slices so the game (and a loading animation) keeps running;
  // returns { promise, progress } with progress() in 0..1
  F.bakeAsync = (opts, { budget = 22 } = {}) => {
    const it = bakeSteps(opts); let prog = 0;
    const promise = new Promise((res, rej) => {
      const step = () => {
        const t0 = performance.now();
        try {
          for (;;) {
            const r = it.next();
            if (r.done) { prog = 1; res(r.value); return; }
            prog = r.value;
            if (performance.now() - t0 > budget) break;
          }
        } catch (e) { rej(e); return; }
        setTimeout(step, 0);
      };
      setTimeout(step, 0);
    });
    return { promise, progress: () => prog };
  };
  F.cell = (S, name, f, d) => { const A = S.anims[name]; return A.start + d * A.frames + Math.max(0, Math.min(A.frames - 1, f)); };

  // ss×ss block → the most common colour; coverage threshold; outer + inner outline
  const keys = new Int32Array(64), counts = new Int32Array(64), ids = new Int32Array(64), idn = new Int32Array(64);
  function pixelize(col, idb, W, ox, ss, fw, fh, dst, ink) {
    const n = fw * fh, C = new Int32Array(n).fill(-1), ID = new Int32Array(n), Z = new Float32Array(n);
    const need = ss * ss * 0.4;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      let nk = 0, ni = 0, cov = 0, zmin = 9;
      for (let j = 0; j < ss; j++) {
        const sy = (fh - 1 - y) * ss + j; // GL rows are bottom-up
        for (let i = 0; i < ss; i++) {
          const k = (sy * W + ox + x * ss + i) * 4;
          if (col[k + 3] < 128) continue;
          cov++;
          const key = (col[k] << 16) | (col[k + 1] << 8) | col[k + 2];
          let q = 0; while (q < nk && keys[q] !== key) q++;
          if (q === nk) { keys[nk] = key; counts[nk++] = 1; } else counts[q]++;
          const id = idb[k]; let r = 0; while (r < ni && ids[r] !== id) r++;
          if (r === ni) { ids[ni] = id; idn[ni++] = 1; } else idn[r]++;
          const z = idb[k + 1] / 255 + idb[k + 2] / 65025; if (z < zmin) zmin = z;
        }
      }
      if (cov < need) continue;
      let best = 0; for (let q = 1; q < nk; q++) if (counts[q] > counts[best]) best = q;
      let bi = 0; for (let r = 1; r < ni; r++) if (idn[r] > idn[bi]) bi = r;
      const p = y * fw + x; C[p] = keys[best]; ID[p] = ids[bi]; Z[p] = zmin;
    }
    const out = new Int32Array(C);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const p = y * fw + x;
      if (C[p] < 0) {
        if ((x > 0 && C[p - 1] >= 0) || (x < fw - 1 && C[p + 1] >= 0) || (y > 0 && C[p - fw] >= 0) || (y < fh - 1 && C[p + fw] >= 0)) out[p] = -2;
        continue;
      }
      for (const q of [x > 0 ? p - 1 : -1, x < fw - 1 ? p + 1 : -1, y > 0 ? p - fw : -1, y < fh - 1 ? p + fw : -1]) {
        if (q < 0 || C[q] < 0 || ID[q] === ID[p]) continue;
        if (Z[p] - Z[q] > 0.004) { out[p] = -3; break; }
      }
    }
    for (let p = 0; p < n; p++) {
      const k = p * 4, v = out[p];
      if (v === -1) { dst[k] = dst[k + 1] = dst[k + 2] = dst[k + 3] = 0; continue; }
      if (v === -2) { dst[k] = ink[0]; dst[k + 1] = ink[1]; dst[k + 2] = ink[2]; dst[k + 3] = 255; continue; }
      let r = (C[p] >> 16) & 255, g = (C[p] >> 8) & 255, b = C[p] & 255;
      if (v === -3) { r = r * 0.62 + ink[0] * 0.38; g = g * 0.62 + ink[1] * 0.38; b = b * 0.62 + ink[2] * 0.38; }
      dst[k] = r; dst[k + 1] = g; dst[k + 2] = b; dst[k + 3] = 255;
    }
  }

  // ------------------------------------------------------------------ in-game sprite
  // a camera-facing quad showing one cell of a baked sheet; picks 1 of 8 facings from the actor's
  // heading relative to the camera (with a little hysteresis so it doesn't flicker on the boundary)
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  class ForgeSprite {
    constructor(sheet) {
      this.root = new THREE.Group();
      this.bb = new THREE.Group(); this.bb.rotation.order = 'YXZ'; this.root.add(this.bb);
      this.wob = new THREE.Group(); this.wob.position.y = 1.0; this.bb.add(this.wob); // pivot at mid-body
      this.mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(quad, this.mat); this.wob.add(this.mesh);
      this.d = 0; this.flip = 1; this.setSheet(sheet);
    }
    setSheet(S) {
      this.S = S;
      if (this.tex) this.tex.dispose();
      const t = (this.tex = new THREE.CanvasTexture(S.canvas));
      t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      t.repeat.set(1 / S.cols, 1 / S.rows);
      this.mat.map = t; this.mat.needsUpdate = true;
      this.mesh.scale.set(S.fw / S.ppu, S.fh / S.ppu, 1); this.mesh.position.y = -1.0 - S.footY;
      this.show('idle', 0);
    }
    face(fx, fz, camYaw) {
      const f = [-Math.sin(camYaw), -Math.cos(camYaw)], r = [Math.cos(camYaw), -Math.sin(camYaw)];
      const toward = -(fx * f[0] + fz * f[1]), right = fx * r[0] + fz * r[1];
      const th = Math.atan2(right, toward), step = Math.PI / 4;
      let diff = th - this.d * step; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > step * 0.5 + 0.07) this.d = ((Math.round(th / step) % 8) + 8) % 8;
      this.flip = right >= 0 ? 1 : -1;
      return this.d;
    }
    has(name) { return !!this.S.anims[name]; }
    show(name, f, d = this.d) {
      const S = this.S, A = S.anims[name] || S.anims.idle;
      const i = A.start + d * A.frames + Math.max(0, Math.min(A.frames - 1, f | 0));
      this.tex.offset.set((i % S.cols) / S.cols, 1 - (Math.floor(i / S.cols) + 1) / S.rows);
    }
    billboard(yaw, tilt) { this.bb.rotation.y = yaw; this.bb.rotation.x = tilt; }
  }
  F.Sprite = ForgeSprite;
})();
