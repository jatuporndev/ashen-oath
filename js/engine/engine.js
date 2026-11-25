// Engine core — renderer, shared helpers for painted billboards, terrain shader, VFX.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const P = window.Paint;
  const E = (EW.engine = {});

  // pixel-art mode: low internal resolution, nearest upscale, palette-snapped textures
  const PIX = (EW.PIXEL = new URLSearchParams(location.search).get('pixel') !== '0');
  const renderer = new THREE.WebGLRenderer({ antialias: !PIX, powerPreference: 'high-performance' });
  renderer.setPixelRatio(PIX ? 1 / 3 : Math.min(window.devicePixelRatio, 1.75));
  if (PIX) document.documentElement.classList.add('pixel');
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.id = 'game-canvas';
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000);
  Object.assign(E, { renderer, scene, camera, tint: new THREE.Color(1, 1, 1), billboards: new Set(), time: 0 });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  const ANISO = renderer.capabilities.getMaxAnisotropy();

  // pixelize a painted canvas (factor = how many painted px collapse into one texel)
  const pixMemo = new WeakMap();
  E.pix = (canvas, factor = 3, opts) => {
    if (!(PIX && window.Pixel && canvas.width > 8)) return canvas;
    let m = pixMemo.get(canvas); if (!m) { m = new Map(); pixMemo.set(canvas, m); }
    const key = factor + '|' + (opts && opts.outline === false ? 0 : 1);
    if (!m.has(key)) m.set(key, window.Pixel.scaled(canvas, factor, opts));
    return m.get(key);
  };
  E.nearest = (t) => { if (PIX) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.anisotropy = 1; } return t; };
  E.tex = (canvas, repeat, factor) => {
    const t = new THREE.CanvasTexture(E.pix(canvas, factor || (repeat ? 2 : 3), { outline: !repeat }));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; E.nearest(t);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  };
  E.unitPlane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  E.centerPlane = new THREE.PlaneGeometry(1, 1);
  const shadowTex = E.tex(P.shadowTex());
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  E.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.62, polygonOffset: true, polygonOffsetFactor: -4 });
  E.shadow = (r, sq = 0.6) => { const s = new THREE.Mesh(shadowGeo, E.shadowMat); s.scale.set(r * 2, 1, r * 2 * sq); s.position.y = 0.06; s.renderOrder = 1; return s; };
  E.glowTex = E.tex(P.glowTex('#ffffff'));

  // painted billboard prop; materials cached per texture
  const matCache = new Map(), spriteTex = new WeakMap();
  E.spriteMat = (canvas, unique) => {
    if (!unique && matCache.has(canvas)) return matCache.get(canvas);
    let t = spriteTex.get(canvas); if (!t) { t = E.tex(canvas); spriteTex.set(canvas, t); }
    const m = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, transparent: !!unique });
    m.color.copy(E.tint);
    if (!unique) matCache.set(canvas, m);
    return m;
  };
  E.prop = (canvas, h, o = {}) => {
    const g = new THREE.Group();
    const w = h * (canvas.width / canvas.height);
    const m = new THREE.Mesh(E.unitPlane, o.mat || E.spriteMat(canvas, o.unique));
    m.scale.set(o.flip ? -w : w, h, 1); m.rotation.order = 'YXZ';
    g.add(m); E.billboards.add(m);
    if (o.shadow) g.add(E.shadow(o.shadow));
    g.userData.sprite = m; g.userData.w = w; g.userData.h = h;
    return g;
  };
  E.glow = (color, size, opacity = 0.8) => {
    const m = new THREE.Mesh(E.centerPlane, new THREE.MeshBasicMaterial({ map: E.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    m.scale.set(size, size, 1); m.rotation.order = 'YXZ'; E.billboards.add(m); return m;
  };
  E.retint = (color) => { E.tint.copy(color); matCache.forEach((m) => m.color.copy(color)); };

  // ---------------------------------------------------------------- painted terrain
  E.terrain = ({ size, segs, height, map, mapExtent, detail, rock, sun = [-0.4, 0.8, 0.45], light = [0.62, 0.55], rockScale = 7 }) => {
    const geo = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, detail: { value: null }, rock: { value: null }, ext: { value: mapExtent }, sunDir: { value: new THREE.Vector3(...sun).normalize() }, light: { value: new THREE.Vector2(...light) }, rockScale: { value: rockScale }, tint: { value: new THREE.Color(1, 1, 1) } }]);
    uniforms.map.value = E.tex(map, null, 1.5);
    const d = new THREE.CanvasTexture(detail); d.wrapS = d.wrapT = THREE.RepeatWrapping; d.anisotropy = ANISO; uniforms.detail.value = d;
    if (rock) uniforms.rock.value = E.tex(rock, [1, 1]);
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, defines: rock ? { USE_ROCK: 1 } : {},
      vertexShader: `varying vec3 vW; varying vec3 vN;
        #include <fog_pars_vertex>
        void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix)*normal);
          vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform sampler2D detail; uniform sampler2D rock; uniform float ext; uniform vec3 sunDir; uniform vec2 light; uniform float rockScale; uniform vec3 tint;
        varying vec3 vW; varying vec3 vN;
        #include <fog_pars_fragment>
        void main(){
          vec2 uv = clamp((vW.xz + ext) / (2.0*ext), 0.0, 1.0); uv.y = 1.0 - uv.y;
          vec3 c = texture2D(map, uv).rgb;
          float d = texture2D(detail, vW.xz/5.0).r*0.6 + texture2D(detail, vW.xz/17.0 + 0.37).r*0.4;
          c *= mix(0.74, 1.22, d);
          vec3 n = normalize(vN);
          #ifdef USE_ROCK
            float slope = 1.0 - n.y;
            vec3 rx = texture2D(rock, vW.zy/rockScale).rgb, rz = texture2D(rock, vW.xy/rockScale).rgb, ry = texture2D(rock, vW.xz/rockScale).rgb;
            vec3 an = abs(n); an /= (an.x+an.y+an.z);
            vec3 rc = rx*an.x + ry*an.y + rz*an.z;
            c = mix(c, rc, smoothstep(0.22, 0.42, slope));
          #endif
          float l = light.x + light.y*max(dot(n, sunDir), 0.0);
          gl_FragColor = vec4(c*l*tint, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.uniforms = uniforms;
    return mesh;
  };

  // sky dome + parallax backdrop rings + clouds
  E.backdrop = ({ sky, rings, clouds }) => {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), new THREE.MeshBasicMaterial({ map: E.tex(sky), side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -10; g.add(dome);
    const ring = (canvas, r, h, rep, opts = {}) => {
      const t = E.tex(canvas); t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96, 1, true), new THREE.MeshBasicMaterial(Object.assign({ map: t, side: THREE.BackSide, fog: false, alphaTest: 0.5 }, opts)));
      m.position.y = h / 2 - 14; g.add(m); return m;
    };
    if (clouds) { const c = ring(clouds, 1100, 420, 2, { depthWrite: false, alphaTest: 0, transparent: true, opacity: 0.85 }); c.position.y = 260; c.renderOrder = -5; g.userData.clouds = c; }
    rings.forEach(([canvas, r, h, rep]) => ring(canvas, r, h, rep));
    return g;
  };

  // ---------------------------------------------------------------- VFX: pooled additive particles + slash trails
  const fx = [];
  const fxGeo = E.centerPlane;
  E.fxGroup = new THREE.Group(); scene.add(E.fxGroup);
  E.burst = (x, y, z, color, n = 12, speed = 5, { size = [0.25, 0.6], life = [0.5, 0.9], up = [1, 5], grav = 9, spread = 1 } = {}) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ map: E.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const s = size[0] + Math.random() * (size[1] - size[0]); m.scale.set(s, s, 1); m.rotation.order = 'YXZ';
      m.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.5, z + (Math.random() - 0.5) * spread);
      E.fxGroup.add(m); E.billboards.add(m);
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random() * 0.7) * speed, l = life[0] + Math.random() * (life[1] - life[0]);
      fx.push({ m, vx: Math.cos(a) * v, vy: up[0] + Math.random() * (up[1] - up[0]), vz: Math.sin(a) * v, life: l, max: l, grav, s });
    }
  };
  E.dust = (x, y, z, n = 10, r = 2, col = 0x9a8a7a) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ map: E.glowTex, color: col, transparent: true, depthWrite: false, opacity: 0.5 }));
      const s = 1 + Math.random() * 2.2 * (r / 2); m.scale.set(s, s, 1); m.rotation.order = 'YXZ';
      const a = Math.random() * Math.PI * 2; m.position.set(x + Math.cos(a) * r * 0.5, y + 0.4, z + Math.sin(a) * r * 0.5);
      E.fxGroup.add(m); E.billboards.add(m);
      fx.push({ m, vx: Math.cos(a) * r * 1.2, vy: 0.6 + Math.random(), vz: Math.sin(a) * r * 1.2, life: 0.9 + Math.random() * 0.6, max: 1.4, grav: -0.2, s, grow: 1.6, soft: true });
    }
  };
  // ground shockwave ring decal
  E.ring = (x, z, y, r0, r1, dur, color = 0xffa050) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, y + 0.15, z); E.fxGroup.add(m);
    fx.push({ m, ring: true, r0, r1, life: dur, max: dur });
    return m;
  };
  // telegraph decal (danger zone) that the boss AI updates & removes
  E.decal = (color = 0xff6a2a) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    m.renderOrder = 2; E.fxGroup.add(m); return m;
  };
  // weapon slash trail: a flat arc ribbon lying in the attack plane
  E.slash = (x, y, z, yaw, { radius = 3, arc = 2.2, width = 0.9, color = 0xfff0d0, dur = 0.22, tilt = 0, thrust = false, reach = 4 } = {}) => {
    let geo;
    if (thrust) { geo = new THREE.PlaneGeometry(reach, width * 0.5).translate(reach / 2, 0, 0).rotateX(-Math.PI / 2); }
    else geo = new THREE.RingGeometry(radius - width, radius, 32, 1, -arc / 2, arc).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.9 }));
    m.position.set(x, y, z); m.rotation.order = 'YZX'; m.rotation.y = yaw; m.rotation.z = tilt;
    E.fxGroup.add(m); fx.push({ m, life: dur, max: dur, slash: true });
  };
  E.updateFx = (dt) => {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt; const k = Math.max(0, f.life / f.max);
      if (f.ring) { const r = f.r1 + (f.r0 - f.r1) * k; f.m.scale.set(r, 1, r); f.m.material.opacity = k * 0.9; }
      else if (f.slash) { f.m.material.opacity = k * 0.9; f.m.scale.setScalar(1 + (1 - k) * 0.12); }
      else {
        f.vy -= f.grav * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
        f.vx *= 0.96; f.vz *= 0.96;
        f.m.material.opacity = (f.soft ? 0.45 : 1) * k;
        if (f.grow) { const s = f.s * (1 + (1 - k) * f.grow); f.m.scale.set(s, s, 1); }
      }
      if (f.life <= 0) { E.fxGroup.remove(f.m); f.m.material.dispose(); if (f.ring || f.slash) f.m.geometry.dispose(); E.billboards.delete(f.m); fx.splice(i, 1); }
    }
  };

  // drifting ambient particles (embers / fireflies / ash) that wrap around a focus point
  E.ambientParticles = (n, color, size, { rise = 0.4, spread = 40, height = [0.3, 8], drift = 1.2 } = {}) => {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { seed[i * 3] = (Math.random() - 0.5) * spread * 2; seed[i * 3 + 1] = height[0] + Math.random() * (height[1] - height[0]); seed[i * 3 + 2] = (Math.random() - 0.5) * spread * 2; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: E.glowTex, size, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    pts.userData.update = (t, fx2, fz2) => {
      const H = height[1] - height[0];
      for (let i = 0; i < n; i++) {
        let x = seed[i * 3] + Math.sin(t * 0.3 + i) * drift * 2, z = seed[i * 3 + 2] + Math.cos(t * 0.25 + i * 1.7) * drift * 2;
        x = ((x - fx2 + spread) % (spread * 2) + spread * 2) % (spread * 2) - spread + fx2;
        z = ((z - fz2 + spread) % (spread * 2) + spread * 2) % (spread * 2) - spread + fz2;
        const y = height[0] + (((seed[i * 3 + 1] - height[0]) + t * rise * (0.5 + (i % 5) * 0.2)) % H);
        pos[i * 3] = x; pos[i * 3 + 1] = y + Math.sin(t * 0.8 + i * 3) * 0.3; pos[i * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return pts;
  };

  // project world → screen for HUD overlays
  const v3 = new THREE.Vector3();
  E.project = (x, y, z) => {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight, ok: v3.z < 1 && Math.abs(v3.x) < 1.15 && Math.abs(v3.y) < 1.15 };
  };
  E.render = () => renderer.render(scene, camera);
})();
