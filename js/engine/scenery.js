// Scenery systems — everything that makes a place feel inhabited rather than an empty arena:
//  · E.scatter   thousands of tiny camera-facing sprites in ONE draw call (grass, pebbles, flowers…)
//  · E.rock      faceted 3D outcrops and spires that break up flat ground and smooth rims
//  · E.mountains layered silhouette ranges beyond the playable rim (real parallax)
//  · E.birds     a few birds wheeling overhead
(function () {
  'use strict';
  const EW = window.EW, E = EW.engine;

  E.scatter = (atlas, cols, rows, items) => {
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const n = items.length, ip = new Float32Array(n * 3), ic = new Float32Array(n * 2), id = new Float32Array(n * 4);
    items.forEach((it, i) => {
      ip[i * 3] = it.x; ip[i * 3 + 1] = it.y; ip[i * 3 + 2] = it.z;
      ic[i * 2] = it.cell % cols; ic[i * 2 + 1] = Math.floor(it.cell / cols);
      id[i * 4] = it.w * (it.flip ? -1 : 1); id[i * 4 + 1] = it.h; id[i * 4 + 2] = it.sway || 0; id[i * 4 + 3] = it.shade || 1;
    });
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(ip, 3));
    g.setAttribute('iCell', new THREE.InstancedBufferAttribute(ic, 2));
    g.setAttribute('iDim', new THREE.InstancedBufferAttribute(id, 4));
    g.instanceCount = n;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, time: { value: 0 }, grid: { value: new THREE.Vector2(cols, rows) }, tint: { value: new THREE.Color(1, 1, 1) } }]);
    uniforms.map.value = E.tex(atlas, null, 3);
    uniforms.tint.value.copy(E.tint);
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 iPos; attribute vec2 iCell; attribute vec4 iDim; uniform float time; uniform vec2 grid; varying vec2 vUv; varying float vShade;
        #include <fog_pars_vertex>
        void main(){
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float sw = sin(time*1.6 + iPos.x*0.37 + iPos.z*0.51) * iDim.z * position.y * position.y;
          vec3 p = iPos + right*(position.x*iDim.x + sw) + vec3(0.0, position.y*iDim.y, 0.0);
          vUv = (uv + vec2(iCell.x, grid.y - 1.0 - iCell.y)) / grid; vShade = iDim.w;
          vec4 mvPosition = viewMatrix*vec4(p, 1.0); gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying float vShade;
        #include <fog_pars_fragment>
        void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb*tint*vShade, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
    m.userData.update = (t) => { uniforms.time.value = t; };
    return m;
  };

  // chunky faceted rock; origin at its base centre
  const rockTex = new Map();
  E.rock = (seed, sx, sy, sz, canvas, { sun = [-0.4, 0.75, 0.5], tone = 1 } = {}) => {
    const g = new THREE.IcosahedronGeometry(1, 2), pos = g.attributes.position, s = seed * 1.37;
    const hash = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + s * 19.19) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const lump = Math.sin(x * 2.1 + s) * Math.sin(y * 1.7 + s * 2) * Math.sin(z * 2.3 + s * 3);
      const r = 0.8 + lump * 0.34 + (hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * 0.16;
      x *= r; y *= r; z *= r;
      y = y * 0.5 + 0.5; if (y < 0.08) y = 0; // sits flat on the ground
      const taper = 1 - Math.max(0, y - 0.2) * 0.45; // narrower toward the top
      pos.setXYZ(i, x * sx * taper, y * sy, z * sz * taper);
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal, col = new Float32Array(pos.count * 3), uv = g.attributes.uv;
    const L = new THREE.Vector3(...sun).normalize();
    for (let i = 0; i < pos.count; i++) {
      const l = (0.5 + 0.6 * Math.max(0, nor.getX(i) * L.x + nor.getY(i) * L.y + nor.getZ(i) * L.z)) * (0.78 + 0.22 * Math.min(1, pos.getY(i) / (sy * 0.5))) * tone;
      col[i * 3] = l; col[i * 3 + 1] = l; col[i * 3 + 2] = l;
      uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.11, pos.getY(i) * 0.11);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let t = rockTex.get(canvas); if (!t) { t = E.tex(canvas, [1, 1]); rockTex.set(canvas, t); }
    const mat = new THREE.MeshBasicMaterial({ map: t, vertexColors: true });
    mat.color.copy(E.tint);
    return new THREE.Mesh(g, mat);
  };

  // ridged silhouette ranges; colours are pre-hazed so they ignore scene fog
  E.mountains = (cx, cz, layers, seed = 4242) => {
    let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const group = new THREE.Group();
    for (const Lr of layers) {
      const N = 180, rows = 3;
      const harm = Array.from({ length: 18 }, (_, k) => ({ f: 2 + k * (1 + Math.floor(rnd() * 2)), a: 1 / Math.pow(k + 1.5, 0.85), p: rnd() * 6.283 }));
      const ridge = (th) => { let s = 0, t = 0; for (const h of harm) { s += h.a * (1 - Math.abs(Math.sin(h.f * th * 0.5 + h.p))); t += h.a; } return s / t; };
      const pos = [], col = [], idx = [], c = new THREE.Color(Lr.col), lo = new THREE.Color(Lr.haze || Lr.col), cc = new THREE.Color();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2, r0 = ridge(th), h = Lr.base + Math.pow(r0, 1.7) * Lr.amp * 1.6, sx = Math.sin(th), sz = Math.cos(th);
        const prof = [[-Lr.depth, -40, 0], [-Lr.depth * 0.4, h * 0.5, 0.5], [0, h, 1]];
        for (let j = 0; j < rows; j++) {
          const [dr, y, k] = prof[j];
          pos.push(cx + sx * (Lr.R + dr), y, cz + sz * (Lr.R + dr));
          cc.copy(lo).lerp(c, k).multiplyScalar(0.9 + r0 * 0.22 + (rnd() - 0.5) * 0.05); col.push(cc.r, cc.g, cc.b);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < rows - 1; j++) { const a = i * rows + j, b = a + rows; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; group.add(m);
    }
    return group;
  };

  E.birds = (n, cx, cz, { r = [40, 90], h = [38, 70], color = 0x1e1a1c, size = 1.2, seed = 55 } = {}) => {
    let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, 1, 0, -0.1, 0, 0, -0.28], 3));
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const group = new THREE.Group();
    const birds = Array.from({ length: n }, (_, i) => {
      const b = new THREE.Group(), l = new THREE.Mesh(wing, mat), rg = new THREE.Mesh(wing, mat); rg.scale.x = -1; b.add(l, rg); b.scale.setScalar(size * (0.8 + rnd() * 0.5)); group.add(b);
      return { b, l, rg, r: r[0] + rnd() * (r[1] - r[0]), h: h[0] + rnd() * (h[1] - h[0]), sp: (0.06 + rnd() * 0.05) * (i % 3 === 0 ? -1 : 1), ph: rnd() * 6.28 };
    });
    group.userData.update = (t) => {
      for (const q of birds) {
        const a = q.ph + t * q.sp;
        q.b.position.set(cx + Math.sin(a) * q.r, q.h + Math.sin(a * 2.3 + q.ph) * 4, cz + Math.cos(a) * q.r);
        q.b.rotation.y = a + (q.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
        const glide = Math.sin(t * 0.35 + q.ph) > 0.3 ? 0.15 : 1, f = Math.sin(t * 7 + q.ph) * 0.6 * glide + 0.15;
        q.l.rotation.z = f; q.rg.rotation.z = -f;
      }
    };
    return group;
  };
})();
