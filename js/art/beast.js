// Beast Forge — the same idea as the hero's Sprite Forge (js/art/forge.js), applied to bosses in real time.
//
// A boss is a low-poly 3D rig whose pose comes every frame from the AI's continuous pose parameters
// (bodyY, pitch, headDrop, jaw, legs, tail, topple, plateOpen, glow), so it can't be pre-baked into frames.
// Instead it is rendered live the pixel-art way:
//   · toon shading in hard bands, each material's colours taken from a fixed hue-shifted ramp (EW.Forge.ramp)
//     with the light fixed relative to the camera — identical rules to the baked hero
//   · drawn into a low-resolution buffer sized so one texel ≈ one hero texel (1/24 world unit) at the
//     beast's distance, never blurred (nearest sampling)
//   · composited back into the main scene WITH its depth, so the hunter, effects and terrain sort
//     correctly against it (the old flat puppet could not do that), plus a 1-texel ink outline and inner
//     lines wherever a nearer part overlaps a farther one
// Legs are placed with two-bone IK so the feet stay on the ground whatever the body does.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const B = (EW.Beast = {});
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------------ materials
  // shared uniforms for one beast: tint (hit flash, enrage, death fade, area light), fog, glow strength
  function makeUniforms() {
    return {
      tint: { value: new THREE.Color(1, 1, 1) }, glow: { value: 1 },
      fogColor: { value: new THREE.Color(0, 0, 0) }, fogNear: { value: 1e5 }, fogFar: { value: 2e5 },
      L: { value: new THREE.Vector3(-0.55, 0.75, 0.6).normalize() }, // view space: upper-left-front, as the hero bake
    };
  }
  const VS = `varying vec3 vN; varying float vDepth;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`;
  function toonMat(U, base, { metal = false, glow = false } = {}) {
    const r = EW.Forge.ramp(base, { contrast: 1.7, lift: false }).map((h) => new THREE.Color(h)); // darker, punchier bands than the hero: a big shape needs strong light/shadow to read
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { c0: { value: r[0] }, c1: { value: r[1] }, c2: { value: r[2] }, c3: { value: r[3] }, cFlat: { value: new THREE.Color(base) }, metal: { value: metal ? 1 : 0 }, isGlow: { value: glow ? 1 : 0 } }),
      vertexShader: VS,
      fragmentShader: `uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 cFlat; uniform float metal; uniform float isGlow;
        uniform vec3 L; uniform vec3 tint; uniform float glow; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        varying vec3 vN; varying float vDepth;
        void main(){
          vec3 c;
          if (isGlow > 0.5) c = cFlat * (0.35 + 0.65 * clamp(glow, 0.0, 1.6));
          else {
            vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float d = dot(n, L);
            c = d > 0.7 ? c3 : d > -0.05 ? c2 : d > -0.45 ? c1 : c0;
            if (metal < 0.5 && d > 0.7) c = d > 0.85 ? c3 : c2;
            c *= tint;
          }
          c = mix(c, fogColor, smoothstep(fogNear, fogFar, vDepth));
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.DoubleSide,
    });
  }

  // ------------------------------------------------------------------ the pixel layer
  // renders its own scene with the main camera into a low-res colour + depth buffer, then a full-screen
  // quad in the main scene puts those texels back (outlined) with their depth
  class PixelLayer {
    constructor({ ppu = 24, ink = '#1c1418' } = {}) {
      const E = EW.engine;
      this.scene = new THREE.Scene(); this.ppu = ppu; this.k = 1; this.size = new THREE.Vector2();
      this.rt = null;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { tC: { value: null }, tD: { value: null }, px: { value: new THREE.Vector2(1, 1) }, near: { value: 0.1 }, far: { value: 3000 }, ink: { value: new THREE.Color(ink) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `uniform sampler2D tC; uniform sampler2D tD; uniform vec2 px; uniform float near; uniform float far; uniform vec3 ink; varying vec2 vUv;
          float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
          void main(){
            vec2 uv = (floor(vUv / px) + 0.5) * px;
            vec4 c = texture2D(tC, uv); float d = texture2D(tD, uv).r;
            vec2 o[4]; o[0] = vec2(px.x, 0.0); o[1] = vec2(-px.x, 0.0); o[2] = vec2(0.0, px.y); o[3] = vec2(0.0, -px.y);
            if (c.a < 0.5) {
              float best = 1.0; bool hit = false;
              for (int i = 0; i < 4; i++) { vec4 n = texture2D(tC, uv + o[i]); if (n.a > 0.5) { hit = true; best = min(best, texture2D(tD, uv + o[i]).r); } }
              if (!hit) discard;
              gl_FragColor = linearToOutputTexel(vec4(ink, 1.0)); gl_FragDepth = best; return;
            }
            float Lz = lin(d), thr = max(0.9, Lz * 0.035); bool edge = false;
            for (int i = 0; i < 4; i++) { vec4 n = texture2D(tC, uv + o[i]); if (n.a > 0.5 && lin(texture2D(tD, uv + o[i]).r) < Lz - thr) edge = true; }
            vec3 col = edge ? mix(c.rgb, ink, 0.45) : c.rgb;
            gl_FragColor = linearToOutputTexel(vec4(col, 1.0)); gl_FragDepth = d;
          }`,
        depthTest: true, depthWrite: true,
      });
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false;
      E.scene.add(this.quad);
      this.focus = null; // () => Vector3 world point used to pick the texel size
      this.pre = () => this.draw();
      E.preRender.add(this.pre);
    }
    draw() {
      const E = EW.engine, R = E.renderer, cam = E.camera;
      R.getDrawingBufferSize(this.size);
      // texel size: aim for ppu texels per world unit at the focus distance (whole screen pixels only, with hysteresis)
      if (this.focus) {
        const dist = Math.max(1, cam.position.distanceTo(this.focus()));
        const pxu = this.size.y / (2 * dist * Math.tan((cam.fov * Math.PI) / 360));
        const want = Math.max(1, pxu / this.ppu);
        if (Math.abs(want - this.k) > 0.65) this.k = Math.max(1, Math.round(want));
      }
      const w = Math.max(1, Math.ceil(this.size.x / this.k)), h = Math.max(1, Math.ceil(this.size.y / this.k));
      if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
        if (this.rt) { this.rt.depthTexture.dispose(); this.rt.dispose(); }
        this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
        this.rt.depthTexture = new THREE.DepthTexture(w, h); this.rt.depthTexture.type = THREE.UnsignedIntType;
        this.rt.depthTexture.minFilter = this.rt.depthTexture.magFilter = THREE.NearestFilter;
        this.mat.uniforms.tC.value = this.rt.texture; this.mat.uniforms.tD.value = this.rt.depthTexture;
        this.mat.uniforms.px.value.set(1 / w, 1 / h);
      }
      this.mat.uniforms.near.value = cam.near; this.mat.uniforms.far.value = cam.far;
      const prevT = R.getRenderTarget(), prevC = R.getClearAlpha(), cc = R.getClearColor(new THREE.Color());
      R.setRenderTarget(this.rt); R.setClearColor(0x000000, 0); R.clear(true, true, true);
      R.render(this.scene, cam);
      R.setRenderTarget(prevT); R.setClearColor(cc, prevC);
    }
    dispose() {
      const E = EW.engine;
      E.preRender.delete(this.pre); E.scene.remove(this.quad);
      if (this.rt) { this.rt.depthTexture.dispose(); this.rt.dispose(); }
      this.mat.dispose();
    }
  }
  B.PixelLayer = PixelLayer;

  // ------------------------------------------------------------------ two-bone IK (bone rest direction −Y, bends about its X)
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
  function solve2(upper, lower, L1, L2, targetW, poleW) {
    const parent = upper.parent;
    const T = parent.worldToLocal(targetW.clone());
    parent.getWorldQuaternion(_q).invert();
    const P = poleW.clone().applyQuaternion(_q);
    const S = upper.position.clone();
    const u = T.sub(S); let d = u.length(); u.normalize();
    d = Math.max(0.2, Math.min(L1 + L2 - 1e-3, d));
    let v = P.clone().sub(u.clone().multiplyScalar(P.dot(u)));
    if (v.lengthSq() < 1e-6) v = V(1, 0, 0).sub(u.clone().multiplyScalar(u.x));
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
    upper.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
    lower.rotation.set(-Math.acos(Math.max(-1, Math.min(1, Ed.dot(Fd)))), 0, 0);
  }

  // ------------------------------------------------------------------ Gravemaw, the Ashen Behemoth
  // boss-local frame: +X forward, +Y up, feet on y = 0. ~43 units nose to tail, 14 tall.
  const GRAVEMAW = { hide: '#57483f', hideD: '#33291f', belly: '#8a7462', plate: '#2a2324', bone: '#ddd0b2', horn: '#cbbd9c', claw: '#2a2224', ember: '#ff8a2a', eye: '#ffc060', mouth: '#ff6a1a' };

  // merge the plain child meshes of every group that share a material (meshes that are toggled or
  // referenced on their own are left alone)
  function mergeStatic(root, keep) {
    const groups = []; root.traverse((o) => { if (!o.isMesh) groups.push(o); });
    for (const g of groups) {
      const byMat = new Map();
      for (const m of g.children) {
        if (!m.isMesh || m.children.length || keep.has(m) || Object.keys(m.userData).length) continue;
        (byMat.get(m.material) || byMat.set(m.material, []).get(m.material)).push(m);
      }
      for (const [mat, list] of byMat) {
        if (list.length < 2) continue;
        const parts = list.map((m) => { m.updateMatrix(); const q = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); q.applyMatrix4(m.matrix); return q; });
        let n = 0; for (const q of parts) n += q.attributes.position.count;
        const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
        for (const q of parts) { P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; q.dispose(); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.computeBoundingSphere();
        for (const m of list) { g.remove(m); m.geometry.dispose(); }
        const merged = new THREE.Mesh(geo, mat); merged.frustumCulled = list.every((m) => m.frustumCulled); g.add(merged);
      }
    }
  }
  B.gravemaw = () => {
    const U = makeUniforms(), mats = {};
    const mat = (k, o) => mats[k + (o && o.glow ? '!' : '')] || (mats[k + (o && o.glow ? '!' : '')] = toonMat(U, GRAVEMAW[k], o));
    const J = {};
    const joint = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); if (name) J[name] = g; return g; };
    const mesh = (geo, k, parent, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(geo, mat(k, o)); m.position.set(x, y, z); parent.add(m); return m; };
    const ball = (r, sx, sy, sz, k, parent, x, y, z, o) => { const m = mesh(new THREE.SphereGeometry(r, 14, 10), k, parent, x, y, z, o); m.scale.set(sx, sy, sz); return m; };
    const box = (w, h, d, k, parent, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), k, parent, x, y, z, o);
    // a tapered limb segment hanging along −Y from its joint
    const seg = (r0, r1, len, k, parent, o) => mesh(new THREE.CylinderGeometry(r0, r1, len, 8), k, parent, 0, -len / 2, 0, o);
    // a cone pointing along dir from p
    const spike = (r, len, k, parent, p, dir, o) => {
      const m = mesh(new THREE.ConeGeometry(r, len, 6), k, parent, 0, 0, 0, o);
      const d = V(...dir).normalize(); m.quaternion.setFromUnitVectors(V(0, 1, 0), d); m.position.set(p[0], p[1], p[2]).add(d.multiplyScalar(len / 2));
      return m;
    };
    // a horizontal tapered segment along −X (tail)
    const tailSeg = (r0, r1, len, parent) => { const m = mesh(new THREE.CylinderGeometry(r1, r0, len, 9), 'hide', parent, -len / 2, 0, 0); m.rotation.z = Math.PI / 2; return m; };

    const root = new THREE.Group();
    const torso = joint('torso', root, 0, 8, 0);
    // body masses
    ball(1, 9.5, 5.2, 5.0, 'hide', torso, 0, 0, 0);
    ball(1, 5.2, 5.4, 5.0, 'hide', torso, 5.6, 0.5, 0);
    ball(1, 4.8, 4.9, 4.9, 'hide', torso, -6, 0.2, 0);
    ball(1, 8.4, 2.8, 4.1, 'belly', torso, 0.4, -2.5, 0);
    // ember fissures down the flanks
    for (const s of [1, -1]) for (const [x, y, rz, len] of [[-3, 1.2, 0.5, 4.2], [2.5, 0.6, -0.4, 3.6], [6.4, 0.9, 0.3, 2.8], [-7, 0.4, -0.3, 2.6]]) {
      const zz = s * Math.sqrt(Math.max(0.1, 1 - (x / 9.5) ** 2 - (y / 5.2) ** 2)) * 5.0;
      const m = box(0.32, len, 0.3, 'ember', torso, x, y, zz, { glow: true }); m.rotation.set(0, 0, rz);
    }
    // back plates + bone ridge (breakable), core beneath
    const plates = joint('plates', torso, 0, 4.0, 0);
    const platesOk = joint('platesOk', plates);
    for (let i = -2; i <= 2; i++) {
      const p = box(3.4, 3.0, 5.0, 'plate', platesOk, i * 3.3, 0.6 - Math.abs(i) * 0.45, 0, { metal: true });
      p.rotation.set(0, 0, -i * 0.12);
      spike(0.75, 2.6 - Math.abs(i) * 0.3, 'bone', platesOk, [i * 3.3, 2.0 - Math.abs(i) * 0.45, 0], [-0.25, 1, 0]);
      box(0.25, 2.4, 5.1, 'ember', platesOk, i * 3.3 + 1.55, 0.4 - Math.abs(i) * 0.45, 0, { glow: true }).rotation.z = -i * 0.12;
    }
    const platesBroken = joint('platesBroken', plates); platesBroken.visible = false;
    for (let i = -2; i <= 2; i++) {
      const p = box(3.0, 1.2 + ((i * 7 + 3) % 3) * 0.3, 4.6, 'plate', platesBroken, i * 3.3, -0.4 - Math.abs(i) * 0.4, 0, { metal: true });
      p.rotation.set(((i * 5) % 3) * 0.12, 0, -i * 0.2);
    }
    const core = ball(2.2, 1, 1, 1, 'ember', torso, 0, 4.4, 0, { glow: true }); J.core = core;
    // neck + head
    const neck = joint('neck', torso, 8.4, 1.4, 0);
    const neckM = mesh(new THREE.CylinderGeometry(2.4, 3.0, 5.2, 10), 'hide', neck, 2.2, 0, 0); neckM.rotation.z = Math.PI / 2;
    box(4.2, 1.4, 3.6, 'plate', neck, 2.0, 2.4, 0, { metal: true });
    const head = joint('head', neck, 5.0, 0.4, 0);
    box(6.0, 3.6, 4.4, 'hide', head, 2.4, 0.4, 0);
    box(4.2, 1.2, 4.9, 'plate', head, 1.8, 2.3, 0, { metal: true });            // brow armour
    box(3.0, 2.4, 3.4, 'hide', head, 5.6, -0.1, 0);                             // snout
    box(0.5, 0.5, 0.5, 'claw', head, 7.0, 0.6, 0.9); box(0.5, 0.5, 0.5, 'claw', head, 7.0, 0.6, -0.9);
    box(0.9, 0.55, 0.3, 'eye', head, 3.8, 1.3, 2.22, { glow: true }); box(0.9, 0.55, 0.3, 'eye', head, 3.8, 1.3, -2.22, { glow: true });
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) spike(0.28, 0.9, 'bone', head, [3.4 + i * 1.1, -1.4, s * 1.5], [0, -1, 0]);
    const scar = joint('scar', head); scar.visible = false;
    for (const s of [1, -1]) { const m = box(3.6, 0.35, 0.2, 'ember', scar, 3.4, 1.0, s * 2.25, { glow: true }); m.rotation.z = -0.5; }
    const jaw = joint('jaw', head, 0.6, -1.3, 0);
    box(7.0, 1.3, 3.7, 'hideD', jaw, 3.4, -0.7, 0);
    box(5.6, 0.4, 2.8, 'mouth', jaw, 3.6, 0.05, 0, { glow: true });
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) spike(0.26, 0.8, 'bone', jaw, [3.0 + i * 1.2, -0.1, s * 1.45], [0, 1, 0]);
    // horns: three bends sweeping back and out
    const horns = joint('horns', head, 1.4, 2.6, 0);
    const hornsOk = joint('hornsOk', horns), hornsBroken = joint('hornsBroken', horns); hornsBroken.visible = false;
    for (const s of [1, -1]) {
      let p = [0, 0, s * 1.7];
      [[[-0.4, 1, s * 0.35], 3.2, 0.95], [[-1, 0.55, s * 0.25], 3.0, 0.7], [[-1, -0.1, s * 0.1], 2.4, 0.5]].forEach(([dir, len, r], i) => {
        const d = V(...dir).normalize();
        const m = mesh(new THREE.CylinderGeometry(r * 0.72, r, len, 7), 'horn', hornsOk); m.quaternion.setFromUnitVectors(V(0, 1, 0), d); m.position.set(...p).addScaledVector(d, len / 2);
        p = [p[0] + d.x * len, p[1] + d.y * len, p[2] + d.z * len];
        if (i === 2) spike(r * 0.72, 1.2, 'horn', hornsOk, p, dir);
      });
      const st = mesh(new THREE.CylinderGeometry(0.7, 0.95, 1.6, 7), 'horn', hornsBroken, -0.3, 0.75, s * 1.85); st.rotation.set(s * 0.3, 0, 0.35);
      box(0.9, 0.2, 0.9, 'ember', hornsBroken, -0.6, 1.55, s * 1.95, { glow: true });
    }
    // legs: shoulder/hip → (L1) knee → (L2) ankle → foot. Armoured forelegs (breakable).
    const legs = {};
    const leg = (name, parent, x, y, z, L1, L2, fore) => {
      const up = joint(name, parent, x, y, z);
      seg(fore ? 1.75 : 1.65, 1.35, L1, 'hide', up);
      const lo = joint(name + 'Lo', up, 0, -L1, 0);
      seg(1.3, 1.05, L2, 'hide', lo);
      const ft = joint(name + 'Ft', lo, 0, -L2, 0);
      box(2.8, 1.0, 2.5, 'hideD', ft, 0.5, -0.1, 0);
      for (const cz of [-0.8, 0, 0.8]) spike(0.32, 1.1, 'claw', ft, [1.8, -0.35, cz], [1, -0.25, 0]);
      let armour = null, cracks = null;
      if (fore) {
        armour = joint(null, up);
        box(1.0, 3.2, 2.6, 'plate', armour, 1.4, -1.7, 0, { metal: true }).rotation.z = 0.08;
        const la = box(0.9, 2.6, 2.2, 'plate', lo, 1.15, -1.5, 0, { metal: true }); la.userData.armour = true;
        armour.userData.lower = la;
        cracks = joint(null, lo); cracks.visible = false;
        box(0.3, 2.6, 0.3, 'ember', cracks, 1.2, -1.6, 0.4, { glow: true }).rotation.z = 0.4;
        box(0.3, 1.8, 0.3, 'ember', cracks, 1.1, -1.5, -0.5, { glow: true }).rotation.z = -0.5;
      }
      legs[name] = { up, lo, ft, L1, L2, fore, armour, cracks, base: V(x, 0, z) };
    };
    leg('foreL', torso, 6.8, -1.0, 3.6, 3.7, 3.6, true);
    leg('foreR', torso, 6.8, -1.0, -3.6, 3.7, 3.6, true);
    leg('hindL', torso, -6.8, -0.8, 3.8, 3.8, 3.7, false);
    leg('hindR', torso, -6.8, -0.8, -3.8, 3.8, 3.7, false);
    // tail: two segments + spiked club (second segment can be severed)
    const tail1 = joint('tail1', torso, -9.0, 0.8, 0);
    tailSeg(2.5, 1.7, 7.8, tail1);
    for (let i = 0; i < 3; i++) spike(0.5, 1.6 - i * 0.3, 'bone', tail1, [-1.5 - i * 2.4, 2.0 - i * 0.25, 0], [-0.4, 1, 0]);
    const tail2 = joint('tail2', tail1, -7.6, 0, 0);
    const buildTail2 = (parent) => {
      tailSeg(1.7, 0.9, 7.0, parent);
      box(2.8, 2.3, 2.6, 'plate', parent, -7.4, 0, 0, { metal: true });
      for (const [p, d] of [[[-7.4, 1.1, 0], [0, 1, 0]], [[-7.4, 0, 1.3], [0, 0.3, 1]], [[-7.4, 0, -1.3], [0, 0.3, -1]], [[-8.8, 0, 0], [-1, 0, 0]], [[-3, 1.4, 0], [-0.3, 1, 0]]]) spike(0.55, 1.6, 'bone', parent, p, d);
    };
    buildTail2(tail2);
    const stump = joint('stump', tail1, -7.6, 0, 0); stump.visible = false;
    box(0.4, 2.8, 2.8, 'ember', stump, 0.1, 0, 0, { glow: true });

    // ---------------------------------------------------------------- posing from the AI's parameters
    const _w = new THREE.Vector3(), _p = new THREE.Vector3();
    function pose(a, st) {
      const moving = st.moving, walk = a.walk;
      const bob = moving ? Math.abs(Math.sin(walk * 2)) * 0.25 : Math.sin(st.time * 1.4) * 0.12;
      torso.position.set(0, 8 + a.bodyY + bob - a.topple * 2.6, 0);
      torso.rotation.set(a.topple * 0.32, 0, -a.pitch);
      neck.rotation.set(0, 0, -Math.atan2(a.headDrop, 6.5) + (st.breathe ? Math.sin(st.time * 1.4) * 0.02 : 0));
      head.rotation.set(0, 0, Math.max(-0.2, Math.min(0.25, a.headDrop * -0.02)));
      jaw.rotation.set(0, 0, -0.55 * Math.max(0, Math.min(1, a.jaw)));
      tail1.rotation.set(0, a.tail * 0.9 + (moving ? Math.sin(walk) * 0.07 : Math.sin(st.time) * 0.04), 0.28 - a.topple * 0.15);
      tail2.rotation.set(0, a.tail * 0.5, 0.14);
      plates.position.y = 4.0 + a.plateOpen * 0.9;
      plates.rotation.z = a.plateOpen * Math.sin(st.time * 30) * 0.02;
      core.visible = st.coreOpen;
      core.scale.setScalar(0.9 + Math.sin(st.time * 6) * 0.08 + a.plateOpen * 0.3);
      U.glow.value = a.glow;
      // feet: planted under each hip, striding when moving, lifted / folded by the leg parameters
      root.updateMatrixWorld(true);
      const gait = { foreL: 0, hindR: 0, foreR: Math.PI, hindL: Math.PI };
      for (const [name, L] of Object.entries(legs)) {
        const v = L.fore ? a.fore[name === 'foreL' ? 0 : 1] : a.hind[name === 'hindL' ? 0 : 1];
        const ph = walk * 2 + gait[name];
        let fx = L.base.x + (moving ? Math.sin(ph) * 1.7 : 0), fy = 0.6 + (moving ? Math.max(0, Math.cos(ph)) * 0.9 : 0), fz = L.base.z * (1 + a.topple * 0.5);
        if (L.fore) { if (v < 0) { fy += -v * 4.6; fx += -v * 2.6; } else { fy += v * 1.3; fx -= v * 2.4; } }
        else { if (v > 0) { fy += v * 1.1; fx += v * 2.2; } else { fy += -v * 1.6; fx += v * 2.6; } }
        fy += a.topple * 1.2;
        _w.set(fx, fy, fz); root.localToWorld(_w);
        _p.set(L.fore ? -1 : 1, 0, 0).applyQuaternion(root.getWorldQuaternion(_q2));
        solve2(L.up, L.lo, L.L1, L.L2, _w, _p);
        // keep the foot level with the ground
        L.lo.updateMatrixWorld(true);
        L.lo.getWorldQuaternion(_q).invert(); root.getWorldQuaternion(_q2);
        L.ft.quaternion.copy(_q.multiply(_q2));
      }
    }
    // break visuals
    function breakPart(part) {
      if (part === 'horns') { hornsOk.visible = false; hornsBroken.visible = true; }
      if (part === 'plates') { platesOk.visible = false; platesBroken.visible = true; }
      if (part === 'head') scar.visible = true;
      if (part === 'forelegs') for (const n of ['foreL', 'foreR']) { const L = legs[n]; L.armour.visible = false; L.armour.userData.lower.visible = false; L.cracks.visible = true; }
      if (part === 'tail') { tail2.visible = false; stump.visible = true; }
    }
    // the cut-off tail as a separate prop (lies on the ground, carvable)
    function severedTail() { const g = new THREE.Group(); buildTail2(g); g.rotation.set(0, 0, -0.06); return g; }
    // world positions the boss AI wants for glows
    const mouthPt = V(6.6, -0.9, 0), corePt = V(0, 0, 0);
    const mouthWorld = () => head.localToWorld(mouthPt.clone());
    const coreWorld = () => core.localToWorld(corePt.clone());
    // one draw call per (joint, material) instead of one per primitive: ~100 calls → ~40
    mergeStatic(root, new Set(Object.values(J)));
    return { root, U, J, pose, breakPart, severedTail, mouthWorld, coreWorld };
  };
})();
