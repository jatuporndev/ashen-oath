// Scene Manager — builds and tears down the Guild Hub and the hunting fields:
// painted terrain (heightmap + cliffs), layered parallax backdrops, painted billboard props,
// structures, collision, interactables, occlusion fading and environmental objects
// (breakable pillars, ember crystals, herbs, the plateau ledge, the guild gate).
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine, P = window.Paint, A = window.Art;
  const W = (EW.world = { name: null, group: null, colliders: [], walls: [], interact: [], occluders: [], updaters: [], pillars: [], crystals: [], herbs: [] });
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
  W.smooth = smooth; W.fbm = fbm;

  // ------------------------------------------------------------------ helpers
  function add(o, x = 0, y = null, z = 0) { o.position.set(x, y == null ? W.heightAt(x, z) : y, z); W.group.add(o); return o; }
  function prop(canvas, h, x, z, o = {}) {
    const g = E.prop(canvas, h, { shadow: o.shadow, flip: o.flip, unique: o.fade });
    add(g, x, o.y, z);
    if (o.r) W.colliders.push({ x, z, r: o.r });
    if (o.fade) W.occluders.push({ x, z, r: Math.max(0.8, g.userData.w * 0.35), h, mats: [g.userData.sprite.material] });
    return g;
  }
  // shaded box built from painted textures (manual directional shading, no lights)
  function box(w, h, d, tex, { top, repeat = [1, 1], topRepeat, fade = false, shadeK = [0.92, 0.7, 0.82, 0.6, 1.0, 0.5] } = {}) {
    const mk = (t, s, rep) => { const tt = E.tex(t, rep); const m = new THREE.MeshBasicMaterial({ map: tt, transparent: fade, side: THREE.FrontSide }); m.color.setScalar(s).multiply(E.tint); m.userData.k = s; return m; };
    // order: +x, -x, +y, -y, +z, -z
    const mats = [mk(tex, shadeK[0], [repeat[0] * d / w, repeat[1]]), mk(tex, shadeK[1], [repeat[0] * d / w, repeat[1]]), mk(top || tex, shadeK[4], topRepeat || [repeat[0], Math.max(1, repeat[0] * d / w)]), mk(tex, shadeK[5], repeat), mk(tex, shadeK[2], repeat), mk(tex, shadeK[3], repeat)];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), mats);
    return m;
  }
  function wallSeg(x0, z0, x1, z1, h, t, tex, o = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0), m = box(len, h, t, tex, Object.assign({ repeat: [len / 6, h / 6], fade: true }, o));
    m.position.set((x0 + x1) / 2, o.y || 0, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); W.group.add(m);
    W.walls.push({ x0, z0, x1, z1, t: t / 2 + 0.05 });
    W.occluders.push({ seg: [x0, z0, x1, z1], h: h + (o.y || 0), mats: m.material });
    return m;
  }
  function fixedPlane(canvas, w, h, x, y, z, yaw, o = {}) {
    const m = new THREE.Mesh(E.unitPlane, new THREE.MeshBasicMaterial({ map: E.tex(canvas), alphaTest: 0.5, side: THREE.DoubleSide, transparent: !!o.fade }));
    m.material.color.copy(E.tint).multiplyScalar(o.k || 1);
    m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = yaw; W.group.add(m); return m;
  }
  function glowAt(x, y, z, col, size, flicker = true, op = 0.75) {
    const g = E.glow(col, size, op); g.position.set(x, y, z); W.group.add(g);
    if (flicker) { const ph = Math.random() * 9; W.updaters.push((t) => { const s = size * (0.9 + Math.sin(t * 9 + ph) * 0.05 + Math.sin(t * 23 + ph) * 0.04); g.scale.set(s, s, 1); }); }
    return g;
  }
  function paintMap(N, ext, colorAt, post) {
    const c = P.canvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i / N) * 2 * ext - ext, wz = (j / N) * 2 * ext - ext, col = colorAt(wx, wz), k = (j * N + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (post) post(x, (wx) => ((wx + ext) / (2 * ext)) * N);
    return c;
  }
  W.kit = { add, prop, box, wallSeg, fixedPlane, glowAt };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  W.unload = () => {
    if (W.group) {
      E.scene.remove(W.group);
      W.group.traverse((o) => { if (o.geometry && o.geometry !== E.unitPlane && o.geometry !== E.centerPlane) o.geometry.dispose(); });
    }
    E.billboards.clear();
    Object.assign(W, { camInside: null, group: null, colliders: [], walls: [], interact: [], occluders: [], updaters: [], pillars: [], crystals: [], herbs: [], ledge: null, gate: null, name: null, bossHome: null });
    E.scene.fog = null;
  };
  W.load = (name) => {
    W.unload();
    W.name = name; W.group = new THREE.Group(); E.scene.add(W.group);
    (name === 'hub' ? buildHub : FIELDS[name])();
    if (EW.dress && EW.dress[name]) EW.dress[name]();
    if (E.setGrade) E.setGrade(name); // per-area colour theme
    W.particles && W.group.add(W.particles);
  };

  // ------------------------------------------------------------------ collision
  W.collide = (pos, r) => {
    for (const c of W.colliders) {
      if (c.off) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { pos.x = c.x + (dx / d) * m; pos.z = c.z + (dz / d) * m; }
    }
    for (const w of W.walls) {
      if (w.off) continue;
      const vx = w.x1 - w.x0, vz = w.z1 - w.z0, L2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((pos.x - w.x0) * vx + (pos.z - w.z0) * vz) / L2));
      const cx = w.x0 + vx * t, cz = w.z0 + vz * t, dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz), m = w.t + r;
      if (d < m) { const nx = d > 1e-4 ? dx / d : -vz / Math.sqrt(L2), nz = d > 1e-4 ? dz / d : vx / Math.sqrt(L2); pos.x = cx + nx * m; pos.z = cz + nz * m; }
    }
    const R = W.radius;
    const rr = Math.hypot(pos.x - W.center[0], pos.z - W.center[1]);
    if (rr > R) { pos.x = W.center[0] + ((pos.x - W.center[0]) / rr) * R; pos.z = W.center[1] + ((pos.z - W.center[1]) / rr) * R; }
  };
  // can a walker step from (x0,z0) to (x1,z1)?  blocks steep climbs (cliffs, ledge walls)
  W.walkable = (x0, z0, x1, z1) => {
    const h0 = W.heightAt(x0, z0), h1 = W.heightAt(x1, z1), d = Math.hypot(x1 - x0, z1 - z0) || 1e-4;
    return (h1 - h0) / d < 1.15;
  };

  // ------------------------------------------------------------------ per-frame: billboards, occluders, ambience
  const ndc = new THREE.Vector3();
  W.update = (dt, focus) => {
    const t = E.time;
    const { yaw, pitch } = EW.cam.billboardAngles();
    const tilt = -pitch * 0.35;
    for (const m of E.billboards) { m.rotation.y = yaw; m.rotation.x = tilt; }
    for (const f of W.updaters) f(t, dt);
    if (W.particles) W.particles.userData.update(t, focus.x, focus.z);
    // occlusion: fade anything standing between the lens and the hunter
    const cp = E.camera.position;
    for (const o of W.occluders) {
      let hit = false;
      if (o.seg) {
        hit = segX(cp.x, cp.z, focus.x, focus.z, o.seg[0], o.seg[1], o.seg[2], o.seg[3]) && cp.y < o.h + 6;
      } else {
        const vx = focus.x - cp.x, vz = focus.z - cp.z, L2 = vx * vx + vz * vz;
        const tt = ((o.x - cp.x) * vx + (o.z - cp.z) * vz) / L2;
        if (tt > 0.02 && tt < 0.98) { const cx = cp.x + vx * tt, cz = cp.z + vz * tt; hit = Math.hypot(o.x - cx, o.z - cz) < o.r + 0.9; }
        if (hit) { const yAt = cp.y + (focus.y + 1 - cp.y) * tt; hit = yAt < (o.y0 || W.heightAt(o.x, o.z)) + o.h; }
      }
      const target = hit ? 0.28 : 1;
      o.op = o.op == null ? 1 : o.op + (target - o.op) * Math.min(1, dt * 8);
      const mats = Array.isArray(o.mats) ? o.mats : [o.mats];
      for (const m of mats) { m.opacity = o.op; m.alphaTest = o.op < 0.99 ? 0.05 : 0.5; m.depthWrite = o.op > 0.98; m.transparent = true; }
    }
  };
  function segX(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  // nearest interactable for the prompt
  W.nearestInteract = (x, z) => {
    let best = null, bd = 1e9;
    for (const it of W.interact) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  };

  // ================================================================== GUILD HUB — Emberwatch Lodge
  function buildHub() {
    W.center = [0, 0]; W.radius = 60; W.kind = 'hub';
    E.retint(new THREE.Color(1.0, 0.92, 0.82));
    W.heightAt = (x, z) => {
      const ax = Math.abs(x), az = Math.abs(z);
      const out = Math.max(ax - 32, az - 32, 0);
      const road = Math.abs(x) < 5 && z < -30 ? 1 : 0;
      return out > 0 ? (out * 0.12 + Math.pow(out / 25, 2) * 10) * (1 - road * 0.85) + (fbm(x * 0.05, z * 0.05) - 0.5) * 2 * smooth(0, 8, out) : 0;
    };
    E.scene.fog = new THREE.Fog(0xc8a088, 34, 240); // near enough that the far courtyard and the forest beyond soften into haze
    const map = paintMap(512, 70, (x, z) => {
      const n = fbm(x * 0.15, z * 0.15), inside = Math.abs(x) < 30 && Math.abs(z) < 30;
      const grass = mix3([62, 84, 46], [92, 108, 58], n);
      if (Math.abs(x) < 4.5 && z < -29) return mix3([120, 100, 78], [150, 128, 98], n);
      if (!inside) return grass;
      const st = (Math.floor(x * 0.9) + Math.floor(z * 0.9) * 3) % 5;
      const tile = (x * 0.9 - Math.floor(x * 0.9) < 0.08) || (z * 0.9 - Math.floor(z * 0.9) < 0.08);
      let c = mix3([128, 116, 100], [158, 144, 122], (hash(Math.floor(x * 0.9), Math.floor(z * 0.9)) * 0.7 + n * 0.3));
      if (tile) c = mix3(c, [70, 60, 52], 0.6);
      if (st === 0) c = mix3(c, [110, 98, 86], 0.3);
      const edge = smooth(26, 30, Math.max(Math.abs(x), Math.abs(z)));
      return mix3(c, [96, 90, 70], edge * 0.4);
    }, (x, toPx) => {
      // worn dirt paths between stations
      x.globalAlpha = 0.25; x.strokeStyle = '#6a5440'; x.lineCap = 'round';
      [[0, 22, 0, -30], [-20, 0, 20, 0], [0, -12, -8, 18]].forEach(([a, b, c, d]) => { x.lineWidth = 22; x.beginPath(); x.moveTo(toPx(a), toPx(b)); x.lineTo(toPx(c), toPx(d)); x.stroke(); });
      x.globalAlpha = 1;
    });
    const ground = E.terrain({ size: 140, segs: 70, height: W.heightAt, map, mapExtent: 70, detail: P.groundDetail(), sun: [-0.5, 0.7, 0.3], light: [0.72, 0.4] });
    ground.userData.uniforms.tint.value.copy(E.tint);
    W.group.add(ground);
    W.group.add(E.backdrop({
      sky: P.sky([[0, '#2a2a5a'], [0.28, '#7a5a8a'], [0.44, '#f0a070'], [0.5, '#ffd8a0'], [0.53, '#c89880'], [1, '#c89880']]),
      clouds: P.clouds([255, 200, 160], [200, 130, 120]),
      rings: [[P.panorama('duskFar'), 900, 380, 2], [P.panorama('duskMid'), 640, 220, 3], [P.panorama('duskNear'), 420, 90, 4]],
    }));
    const stone = P.stone(), wallTex = P.wall(false), roofTex = P.roof(false), plank = A.wood(256, 256, { base: '#6a4428', n: 5 });
    // courtyard walls with gate gap
    const WH = 7;
    wallSeg(-30, 30, 30, 30, WH, 1.6, stone);
    wallSeg(-30, -30, -30, 30, WH, 1.6, stone);
    wallSeg(30, -30, 30, 30, WH, 1.6, stone);
    wallSeg(-30, -30, -7.5, -30, WH, 1.6, stone);
    wallSeg(7.5, -30, 30, -30, WH, 1.6, stone);
    // battlements
    for (let i = -28; i <= 28; i += 3) { if (Math.abs(i) > 8) { const b1 = box(1.4, 1.1, 1.8, stone); b1.position.set(i, WH, -30); W.group.add(b1); } const b2 = box(1.4, 1.1, 1.8, stone); b2.position.set(i, WH, 30); W.group.add(b2); const b3 = box(1.8, 1.1, 1.4, stone); b3.position.set(-30, WH, i); W.group.add(b3); const b4 = box(1.8, 1.1, 1.4, stone); b4.position.set(30, WH, i); W.group.add(b4); }
    // corner towers
    [[-30, -30], [30, -30], [-30, 30], [30, 30]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 13, 16, 1, true).translate(0, 6.5, 0), new THREE.MeshBasicMaterial({ map: E.tex(stone, [3, 2]), color: new THREE.Color(0.8, 0.74, 0.68) }));
      t.position.set(x, 0, z); W.group.add(t);
      const r = new THREE.Mesh(new THREE.ConeGeometry(4.4, 6, 16).translate(0, 16, 0), new THREE.MeshBasicMaterial({ map: E.tex(roofTex, [3, 1]), color: new THREE.Color(0.9, 0.8, 0.75) }));
      r.position.set(x, 0, z); W.group.add(r);
      W.colliders.push({ x, z, r: 3.6 });
      W.occluders.push({ x, z, r: 3.6, h: 19, y0: 0, mats: [t.material, r.material] });
      glowAt(x, 11, z + (z < 0 ? 3.6 : -3.6), 0xffb060, 3.4);
    });
    // ---------------- the Guild Gate
    const gate = (W.gate = { open: 0, target: 0, doors: [] });
    [-1, 1].forEach((s) => {
      const pil = box(3, 16, 3, stone); pil.position.set(s * 9, 0, -30); W.group.add(pil);
      W.colliders.push({ x: s * 9, z: -30, r: 2 });
      W.occluders.push({ x: s * 9, z: -30, r: 2.2, h: 16, y0: 0, mats: pil.material });
    });
    const lintel = box(21, 3, 3.4, stone); lintel.position.set(0, 14, -30); W.group.add(lintel);
    W.occluders.push({ seg: [-10, -30, 10, -30], h: 17, mats: lintel.material, high: true });
    fixedPlane(A.banner('#7a1a16'), 3.2, 8.2, 0, 8.6, -28.2, 0);
    const doorTex = A.gateDoor();
    [-1, 1].forEach((s) => {
      const hinge = new THREE.Group(); hinge.position.set(s * 7.4, 0, -30); W.group.add(hinge);
      const d = new THREE.Mesh(E.unitPlane, new THREE.MeshBasicMaterial({ map: E.tex(doorTex), alphaTest: 0.5, side: THREE.DoubleSide }));
      d.material.color.copy(E.tint); d.scale.set(7.4 * -s, 13.6, 1); d.position.x = -s * 3.7;
      // thickness slab so the door reads as a heavy object
      const slab = box(7.4, 13.6, 0.5, plank); slab.position.set(-s * 3.7, 0, -0.3);
      hinge.add(slab, d);
      gate.doors.push({ hinge, s });
    });
    const gateWall = { x0: -7.5, z0: -30, x1: 7.5, z1: -30, t: 0.8 };
    W.walls.push(gateWall);
    W.updaters.push((t, dt) => {
      const prev = gate.open;
      gate.open += Math.sign(gate.target - gate.open) * Math.min(Math.abs(gate.target - gate.open), dt * 0.42);
      const e = gate.open * gate.open * (3 - 2 * gate.open);
      gate.doors.forEach(({ hinge, s }) => { hinge.rotation.y = s * e * 1.75; });
      gateWall.off = gate.open > 0.75;
      if (prev === 0 && gate.open > 0) { EW.audio.sfx('gate'); EW.cam.shake(0.2); }
      if (gate.open > 0 && gate.open < 1 && Math.random() < dt * 6) E.dust((Math.random() - 0.5) * 14, 0, -31, 1, 2);
    });
    // road + braziers outside the gate
    [-6, 6].forEach((x) => { prop(A.brazier(), 3, x, -38, { r: 0.8 }); glowAt(x, 2.6, -38, 0xff8a2a, 5); });
    [[-7, -48], [7, -52], [-9, -60]].forEach(([x, z], i) => prop(A.ashPine(i % 2), 10, x, z, { fade: true, r: 0.6 }));

    // ---------------- quest board + guildmaster
    const qb = new THREE.Group(); qb.position.set(0, 0, -12); W.group.add(qb);
    const face = new THREE.Mesh(E.unitPlane, new THREE.MeshBasicMaterial({ map: E.tex(A.questBoardFace()), side: THREE.DoubleSide })); face.material.color.copy(E.tint);
    face.scale.set(7, 4.6, 1); face.position.y = 1.6; qb.add(face);
    [-3.4, 3.4].forEach((x) => { const post = box(0.5, 7.4, 0.5, plank); post.position.set(x, 0, -0.1); qb.add(post); });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 1.6), new THREE.MeshBasicMaterial({ map: E.tex(roofTex, [3, 1]), color: 0xb09080 })); cap.position.set(0, 6.6, 0.2); cap.rotation.x = 0.25; qb.add(cap);
    W.walls.push({ x0: -3.6, z0: -12.2, x1: 3.6, z1: -12.2, t: 0.4 });
    W.interact.push({ id: 'questboard', x: 0, z: -10, r: 4.2, y: 4.5, label: 'prompt.questboard', act: () => EW.ui.open('questboard') });
    const master = prop(A.npc('master'), 2.5, 5.2, -9.6, { shadow: 0.7, r: 0.6 });
    animNPC(master, 'master');
    // ---------------- Weapon Workshop (west)
    shed(-21, 2, 'west', wallTex, roofTex);
    prop(A.forge(), 6, -25.5, 1, { r: 2.2 }); glowAt(-25.5, 1.6, 1.8, 0xff7a20, 6);
    prop(A.anvil(), 1.5, -19.5, 4, { r: 0.9, shadow: 0.9 });
    prop(A.weaponRack(), 3.6, -24.5, 7, { r: 1.2 });
    const smith = prop(A.npc('smith'), 2.4, -17.6, 2.6, { shadow: 0.7, r: 0.6 }); animNPC(smith, 'smith');
    W.updaters.push((t) => { if (Math.random() < 0.012) { E.burst(-19.5, 1.6, 4, 0xffa040, 8, 3, { size: [0.08, 0.2], life: [0.3, 0.6], up: [2, 5] }); if (W.player && Math.hypot(W.player.x + 19.5, W.player.z - 4) < 18) EW.audio.sfx('anvil', { vol: 0.25 }); } });
    W.interact.push({ id: 'weapons', x: -18, z: 3, r: 4, y: 3.4, label: 'prompt.weapons', act: () => EW.ui.open('weapons') });
    // ---------------- Armor Workshop (east)
    shed(21, 2, 'east', wallTex, roofTex);
    prop(A.armorStand('leather'), 3, 24.5, -1.5, { r: 0.8 }); prop(A.armorStand('gravemaw'), 3, 24.5, 4.5, { r: 0.8 });
    prop(A.crate(), 1.3, 26, 8, { r: 0.8 }); prop(A.barrel(), 1.5, 24, 9, { r: 0.7 });
    const armorer = prop(A.npc('armorer'), 2.4, 17.8, 1.6, { shadow: 0.7, r: 0.6 }); animNPC(armorer, 'armorer');
    W.interact.push({ id: 'armor', x: 18, z: 2, r: 4, y: 3.4, label: 'prompt.armor', act: () => EW.ui.open('armor') });
    // ---------------- hunter's quarters: tent + storage chest
    prop(A.tent(), 5, -12, 22, { r: 2.8 });
    prop(A.chest(), 1.3, -6.5, 19.5, { r: 0.9, shadow: 1 });
    W.interact.push({ id: 'storage', x: -6.5, z: 19.5, r: 3, y: 2, label: 'prompt.storage', act: () => EW.ui.open('inventory') });
    // ---------------- dressing: banners, lanterns, braziers, barrels, crates
    [[-20, 29.1], [-6, 29.1], [8, 29.1], [22, 29.1]].forEach(([x, z], i) => fixedPlane(A.banner(i % 2 ? '#1e3a5a' : '#7a1a16'), 2.4, 6.2, x, 0.4, z, Math.PI));
    [[-29.1, -16], [-29.1, 16], [29.1, -16], [29.1, 16]].forEach(([x, z]) => fixedPlane(A.banner('#7a1a16'), 2.4, 6.2, x, 0.4, z, x < 0 ? Math.PI / 2 : -Math.PI / 2));
    [[-10, -20], [10, -20], [-12, 10], [12, 10], [0, 26]].forEach(([x, z]) => { prop(A.lantern(), 4.2, x, z, { r: 0.35 }); glowAt(x, 3.9, z, 0xffb060, 3); });
    [[-6, -16], [6, -16]].forEach(([x, z]) => { prop(A.brazier(), 2.6, x, z, { r: 0.8 }); glowAt(x, 2.3, z, 0xff8a2a, 4.5); });
    [[-27, -26], [-25, -27.5], [26, -26], [27, 25], [-27, 26]].forEach(([x, z], i) => prop(i % 2 ? A.crate() : A.barrel(), 1.4, x, z, { r: 0.8 }));
    [[-40, 10], [44, -8], [-46, -26], [40, 36], [-36, 44], [12, 46], [50, 20]].forEach(([x, z], i) => prop(A.ashPine(i % 2), 11 + (i % 3) * 2, x, z, { fade: true, r: 0.6 }));
    W.particles = E.ambientParticles(90, 0xffb060, 0.22, { rise: 0.35, spread: 36, height: [0.5, 10] });
    W.spawn = { x: 0, z: 14, yaw: 0 };
    W.departZ = -46;
    W.camInside = (x, z, look) => (Math.abs(look.x) > 29.5 || Math.abs(look.z) > 29.5) || (Math.abs(x) < 28.3 && Math.abs(z) < 28.3);
  }
  function animNPC(g, who) {
    const a = A.npc(who, 0), b = A.npc(who, 1), mA = g.userData.sprite.material, ta = mA.map, tb = E.tex(b);
    const ph = Math.random() * 3;
    W.updaters.push((t) => { mA.map = Math.sin(t * 1.6 + ph) > 0 ? ta : tb; });
  }
  function shed(x, z, side, wallTex, roofTex) {
    const s = side === 'west' ? -1 : 1, bx = x + s * 6.5;
    wallSeg(bx, z - 8, bx, z + 8, 6.5, 0.8, wallTex);
    wallSeg(bx, z - 8, x - s * 2, z - 8, 5.5, 0.6, wallTex);
    wallSeg(bx, z + 8, x - s * 2, z + 8, 5.5, 0.6, wallTex);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 18), new THREE.MeshBasicMaterial({ map: E.tex(roofTex, [3, 3]), side: THREE.DoubleSide, transparent: true }));
    roof.material.color.copy(E.tint).multiplyScalar(0.85);
    roof.rotation.order = 'ZYX'; roof.rotation.x = -Math.PI / 2; roof.rotation.y = -s * 0.42; roof.position.set(x + s * 1.6, 7.4, z);
    W.group.add(roof);
    W.occluders.push({ x: x + s * 1.6, z, r: 6, h: 8, y0: 0, mats: roof.material });
    [[x - s * 2, z - 8], [x - s * 2, z + 8]].forEach(([px, pz]) => { const p = box(0.6, 6, 0.6, A.wood(64, 256, { n: 1, vertical: true })); p.position.set(px, 0, pz); W.group.add(p); });
  }

  // ================================================================== HUNTING FIELD — The Ashen Ravine
  const FIELDS = {};
  FIELDS.ravine = () => {
    // three basins joined by narrow passes — a wounded behemoth flees between its dens
    W.center = [0, 0]; W.radius = 330; W.kind = 'field';
    E.retint(new THREE.Color(0.95, 0.86, 0.8));
    const ledge = (W.ledge = { x0: 30, x1: 52, z0: -38, z1: -14, h: 5.5 });
    const ZONES = (W.zones = [
      { id: 'crater', x: 0, z: 0, r: 100, area: 'area.crater' },
      { id: 'wood', x: -212, z: -36, r: 88, area: 'area.wood' },
      { id: 'caldera', x: 44, z: -238, r: 82, area: 'area.caldera' },
    ]);
    W.dens = [{ id: 'crater', x: 0, z: -66, zone: 'crater' }, { id: 'wood', x: -222, z: -48, zone: 'wood' }, { id: 'caldera', x: 50, z: -250, zone: 'caldera' }];
    const PASSES = (W.passes = {
      'crater-wood': [[-62, -12], [-96, -16], [-134, -26], [-176, -34]],
      'caldera-crater': [[42, -200], [38, -160], [30, -100], [24, -68]],
      'caldera-wood': [[0, -214], [-60, -182], [-150, -112], [-196, -76]],
    });
    W.route = (from, to) => {
      const key = [from, to].sort().join('-'), pts = PASSES[key].map((q) => ({ x: q[0], z: q[1] }));
      if (key.split('-')[0] !== from) pts.reverse();
      const d = W.dens.find((q) => q.id === to); pts.push({ x: d.x, z: d.z }); return pts;
    };
    const segs = [];
    for (const k in PASSES) { const L = PASSES[k]; for (let i = 0; i < L.length - 1; i++) segs.push([L[i][0], L[i][1], L[i + 1][0], L[i + 1][1], 12]); }
    segs.push([0, 56, 0, 130, 11]); // canyon road to the camp
    const segD = (x, z, q) => { const vx = q[2] - q[0], vz = q[3] - q[1], L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - q[0]) * vx + (z - q[1]) * vz) / L2)); return Math.hypot(x - q[0] - vx * t, z - q[1] - vz * t); };
    W.open = (x, z) => {
      let o = 0;
      for (const zn of ZONES) {
        const dx = x - zn.x, dz = z - zn.z, d = Math.hypot(dx, dz); if (d >= zn.r) continue;
        // ragged rim: bays and headlands instead of a clean circle
        const k = d > 1 ? 1.7 / d : 0, rim = zn.r * (0.86 + 0.16 * fbm(dx * k + zn.x * 0.13 + 5, dz * k + zn.z * 0.13 + 5) + 0.06 * vnoise(dx * k * 3.1 + 9, dz * k * 3.1));
        if (d < rim) o = Math.max(o, smooth(rim, rim - 15, d));
      }
      for (const q of segs) { const d = segD(x, z, q); if (d < q[4]) o = Math.max(o, smooth(q[4], q[4] - 6, d)); }
      return o;
    };
    W.zoneAt = (x, z) => { let best = null, bd = 1e9; for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z) / zn.r; if (d < bd) { bd = d; best = zn; } } return bd < 1 ? best : null; };
    W.heightAt = (x, z) => {
      let cliff = (1 - W.open(x, z)) * (34 + fbm(x * 0.03, z * 0.03) * 22);
      const caveCut = smooth(10, 4, Math.abs(x)) * smooth(-80, -96, z) * smooth(-112, -100, z);
      cliff *= 1 - caveCut * 0.8;
      let h = (fbm(x * 0.04 + 3, z * 0.04) - 0.5) * 2.4 + cliff;
      let calm = smooth(46, 70, z) + smooth(ledge.x0 - 22, ledge.x0 - 6, x) * smooth(ledge.x1 + 22, ledge.x1 + 6, x) * smooth(ledge.z0 - 22, ledge.z0 - 6, z) * smooth(ledge.z1 + 34, ledge.z1 + 18, z);
      for (const d of W.dens) calm += smooth(44, 22, Math.hypot(x - d.x, z - d.z));
      const roll = Math.abs(fbm(x * 0.021 + 40, z * 0.021 + 7) - 0.5) * 2;
      h += (fbm(x * 0.016 + 9, z * 0.016 + 2) - 0.5) * 9 * (1 - Math.min(1, calm)) + (1 - roll) * (1 - roll) * 3.2 * (1 - Math.min(1, calm));
      const inX = smooth(ledge.x0 - 1.2, ledge.x0, x) * smooth(ledge.x1 + 1.2, ledge.x1, x);
      const inZ = smooth(ledge.z0 - 1.2, ledge.z0, z) * smooth(ledge.z1 + 1.2, ledge.z1, z);
      h += ledge.h * inX * inZ;
      const rampT = Math.min(1, Math.max(0, (z - ledge.z1) / 16));
      if (x > ledge.x0 && x < ledge.x0 + 6 && z > ledge.z1 && z < ledge.z1 + 16) h = Math.max(h, ledge.h * (1 - rampT) + (fbm(x * 0.04 + 3, z * 0.04) - 0.5) * 2.4 * rampT);
      for (const d of W.dens) h -= smooth(18, 4, Math.hypot(x - d.x, z - d.z)) * 1.6;
      return h;
    };
    E.scene.fog = new THREE.Fog(0x6a5048, 32, 250); // depth layering: the far basin and rim recede into ash haze
    const map = paintMap(1400, 340, (x, z) => {
      const n = fbm(x * 0.05, z * 0.05), n2 = fbm(x * 0.21 + 7, z * 0.21);
      let c = mix3([74, 66, 62], [104, 94, 86], n);
      c = mix3(c, [52, 44, 42], smooth(0.55, 0.75, n2) * 0.7);
      const zn = W.zoneAt(x, z);
      if (zn && zn.id === 'wood') c = mix3(c, mix3([44, 40, 34], [70, 62, 48], n), 0.75);
      if (zn && zn.id === 'caldera') c = mix3(c, mix3([40, 30, 28], [76, 50, 40], n), 0.7);
      if (Math.abs(x) < 4 + n * 3 && z > 40) c = mix3(c, [120, 100, 80], 0.55);
      for (const d of W.dens) c = mix3(c, [40, 32, 30], smooth(16, 4, Math.hypot(x - d.x, z - d.z)) * 0.6);
      return c;
    }, (x, toPx) => {
      P.seed(31);
      for (let i = 0; i < 1500; i++) { const px = P.r(-320, 320), pz = P.r(-320, 320); if (W.open(px, pz) < 0.3) continue; const rx = toPx(px + P.r(3, 13)) - toPx(px); x.globalAlpha = P.r(0.06, 0.2); x.fillStyle = P.pick(['#2a2220', '#1e1818', '#8a7a6a', '#6e6054', '#3a2e2a', '#9a8672']); x.beginPath(); x.ellipse(toPx(px), toPx(pz), rx, rx * P.r(0.4, 0.9), P.r(0, 3), 0, 7); x.fill(); }
      x.globalAlpha = 0.5; x.strokeStyle = '#1c1614'; x.lineWidth = 1;
      for (let i = 0; i < 700; i++) { let px = P.r(-320, 320), pz = P.r(-320, 320); if (W.open(px, pz) < 0.3) continue; x.beginPath(); x.moveTo(toPx(px), toPx(pz)); for (let k = 0; k < 4; k++) { px += P.r(-3, 3); pz += P.r(-3, 3); x.lineTo(toPx(px), toPx(pz)); } x.stroke(); }
      x.globalAlpha = 1;
      P.seed(77);
      x.save(); x.shadowColor = '#ff6a1a'; x.shadowBlur = 10; x.lineCap = 'round';
      const fissure = (cx, cz, R, n, w) => {
        for (let i = 0; i < n; i++) {
          const a = P.r(0, 7), rr = Math.sqrt(P.r(0, 1)) * R; let px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
          if (Math.hypot(px, pz - 80) < 20) continue;
          x.strokeStyle = 'rgba(255,' + (100 + P.r(0, 60) | 0) + ',30,.85)'; x.lineWidth = P.r(1.2, w);
          x.beginPath(); x.moveTo(toPx(px), toPx(pz));
          for (let k = 0; k < 7; k++) { px += P.r(-4, 4); pz += P.r(-4, 4); x.lineTo(toPx(px), toPx(pz)); }
          x.stroke();
        }
      };
      fissure(0, -5, 82, 40, 3); fissure(-212, -36, 70, 14, 2); fissure(44, -238, 70, 34, 2.4);
      // molten pools in the caldera
      [[70, -260, 12, 7], [10, -220, 9, 6], [80, -205, 7, 5], [20, -275, 10, 6]].forEach(([px, pz, rx, rz]) => {
        const R = toPx(px + rx) - toPx(px), g = x.createRadialGradient(toPx(px), toPx(pz), 0, toPx(px), toPx(pz), R);
        g.addColorStop(0, '#ffe08a'); g.addColorStop(0.5, '#ff7a1a'); g.addColorStop(0.85, '#8a2a0a'); g.addColorStop(1, 'rgba(60,20,10,0)');
        x.fillStyle = g; x.beginPath(); x.ellipse(toPx(px), toPx(pz), R, toPx(pz + rz) - toPx(pz), 0, 0, 7); x.fill();
      });
      x.restore();
      x.fillStyle = 'rgba(110,90,66,.6)'; x.beginPath(); x.ellipse(toPx(0), toPx(80), toPx(12) - toPx(0), toPx(9) - toPx(0), 0, 0, 7); x.fill();
    });
    const ground = E.terrain({ size: 680, segs: 300, height: W.heightAt, map, mapExtent: 340, detail: P.groundDetail(), rock: A.cliffTex(), sun: [-0.4, 0.75, 0.5], light: [0.6, 0.55], rockScale: 9 });
    ground.userData.uniforms.tint.value.copy(E.tint);
    W.group.add(ground);
    W.group.add(E.backdrop({
      sky: P.sky([[0, '#1e1a22'], [0.3, '#4a3434'], [0.45, '#a8583a'], [0.5, '#e8904a'], [0.53, '#6a5048'], [1, '#6a5048']]),
      clouds: P.clouds([120, 96, 92], [70, 50, 50]),
      rings: [[P.panorama('ashFar'), 1150, 420, 2], [P.panorama('ashMid'), 900, 250, 3], [P.panorama('ashNear'), 680, 120, 4]],
    }));
    fixedPlane(A.caveMouth(), 30, 20, 0, W.heightAt(0, -92) - 3, -94, 0, { k: 0.85 });
    glowAt(0, W.heightAt(0, -90) + 2, -91, 0xff5a10, 16, true, 0.5);
    const stone = P.stone();
    [[-34, -20, -22, -20], [-40, 6, -40, -8]].forEach(([a, b, c, d], i) => wallSeg(a, b, c, d, 3 + i, 1.4, stone, { y: W.heightAt((a + c) / 2, (b + d) / 2) - 0.4 }));
    const pillarSpots = [[-18, -34], [16, -40], [-30, 22], [24, 18], [-4, -2], [44, 34], [-196, -20], [-232, -64], [-180, -60], [30, -226], [68, -232], [40, -268]];
    pillarSpots.forEach(([x, z], i) => pillar(x, z, stone, i));
    [[-12, -52], [22, -60], [-46, -30], [8, 30], [52, -2], [-200, -6], [-246, -40], [24, -244], [62, -214], [74, -272]].forEach(([x, z]) => crystal(x, z));
    [[-54, 40], [60, 36], [-62, -12], [36, -50], [-24, 52], [36, 56], [-230, 0], [-262, -50], [-190, -92], [8, -258], [96, -240], [-110, -22]].forEach(([x, z]) => herb(x, z));
    P.seed(4040);
    const free = (x, z) => !(z > 60 && Math.abs(x) < 18) && !(x > 26 && x < 56 && z > -40 && z < 2) && W.dens.every((d) => Math.hypot(x - d.x, z - d.z) > 22)
      && W.open(x, z) > 0.6 && pillarSpots.every(([a, b]) => Math.hypot(x - a, z - b) > 6) && segs.every((q) => segD(x, z, q) > 9);
    for (let i = 0; i < 46; i++) {
      const a = P.r(0, Math.PI * 2), rr = P.r(58, 86), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (!free(x, z)) continue;
      const west = x < 0;
      prop(west ? A.deadTree(i % 4) : A.ashPine(i % 2), west ? P.r(9, 14) : P.r(10, 15), x, z, { fade: true, r: 0.6, flip: i % 2 === 0 });
    }
    // charred wood — a dense burnt forest that hides the beast
    for (let i = 0; i < 90; i++) {
      const a = P.r(0, Math.PI * 2), rr = Math.sqrt(P.r(0.04, 1)) * 80, x = -212 + Math.cos(a) * rr, z = -36 + Math.sin(a) * rr;
      if (!free(x, z)) continue;
      prop(i % 5 === 0 ? A.ashPine(i % 2) : A.deadTree(i % 4), P.r(10, 17), x, z, { fade: true, r: 0.6, flip: i % 2 === 0 });
    }
    // molten caldera
    for (let i = 0; i < 18; i++) {
      const a = P.r(0, Math.PI * 2), rr = P.r(50, 74), x = 44 + Math.cos(a) * rr, z = -238 + Math.sin(a) * rr;
      if (free(x, z)) prop(A.ashPine(i % 2), P.r(9, 13), x, z, { fade: true, r: 0.6, flip: i % 2 === 0 });
    }
    [[70, -260, 14], [10, -220, 10], [80, -205, 9], [20, -275, 12]].forEach(([x, z, sz]) => glowAt(x, W.heightAt(x, z) + 1, z, 0xff6a1a, sz, true, 0.55));
    [[-50, 20, 0], [-58, -4, 1], [30, 50, 2], [-20, 64, 0], [64, 10, 1], [12, -76, 2], [-36, -60, 1], [70, -36, 0], [-240, -10, 1], [-200, -90, 0], [-150, -40, 2], [96, -262, 0], [0, -250, 2], [60, -190, 1]].forEach(([x, z, v]) => prop(A.boulder(v), 4.5, x, z, { r: 2.6, fade: true }));
    prop(A.ribcage(), 6, -26, 34, { shadow: 3 });
    prop(A.ribcage(), 5, 58, 46, { flip: true });
    prop(A.ribcage(), 7, -250, -24, { shadow: 3 });
    prop(A.ribcage(), 8, 86, -250, { flip: true });
    // the camp at the southern entrance
    prop(A.tent(), 5, -7, 86, { r: 2.6 });
    prop(A.crate(), 1.3, 6, 84, { r: 0.8 }); prop(A.barrel(), 1.5, 7.5, 86, { r: 0.7 });
    prop(A.brazier(), 2.2, 3, 80, { r: 0.6 }); glowAt(3, 2, 80, 0xff8a2a, 4.5);
    W.interact.push({ id: 'campbox', x: 6, z: 84, r: 3, y: 2, label: 'prompt.campbox', enabled: () => EW.hunt && !EW.hunt.campUsed, act: () => EW.hunt.useCamp() });
    W.particles = E.ambientParticles(160, 0xff9a4a, 0.28, { rise: 0.9, spread: 45, height: [0.2, 14], drift: 2 });
    const ash = E.ambientParticles(120, 0x9a9090, 0.32, { rise: -0.5, spread: 45, height: [0.5, 18], drift: 3 });
    W.group.add(ash); W.updaters.push((t) => W.player && ash.userData.update(t, W.player.x, W.player.z));
    W.spawn = { x: 0, z: 112, yaw: 0 };
    W.bossHome = { x: 0, z: -66 };
  };
  function pillar(x, z, stone, i) {
    const y = W.heightAt(x, z) - 0.3, h = 12 + (i % 3) * 2;
    const mat = new THREE.MeshBasicMaterial({ map: E.tex(stone, [1.5, 3]), transparent: true }); mat.color.copy(E.tint).multiplyScalar(0.92);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, h, 12, 1).translate(0, h / 2, 0), mat);
    const capM = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1, 3.6).translate(0, h + 0.5, 0), mat);
    const g = new THREE.Group(); g.add(col, capM); g.position.set(x, y, z); W.group.add(g);
    const rubble = new THREE.Group(); rubble.visible = false; rubble.position.set(x, y, z); W.group.add(rubble);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 3.2, 12).translate(0, 1.6, 0), mat); rubble.add(stump);
    for (let k = 0; k < 4; k++) { const chunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 2.6, 10).rotateZ(Math.PI / 2), mat); chunk.position.set(Math.cos(k * 1.7 + i) * 4, 0.9, Math.sin(k * 1.7 + i) * 4); chunk.rotation.y = k * 0.9; rubble.add(chunk); }
    const c = { x, z, r: 1.6 }; W.colliders.push(c);
    const occ = { x, z, r: 1.6, h: h + 1, y0: y, mats: [mat] }; W.occluders.push(occ);
    W.pillars.push({ x, z, r: 1.6, h, hp: 1, broken: false, collider: c,
      break() { if (this.broken) return; this.broken = true; g.visible = false; rubble.visible = true; occ.h = 3.4; EW.audio.sfx('crumble'); EW.cam.shake(0.5); E.dust(x, y, z, 26, 5, 0x8a7a6a); E.burst(x, y + 4, z, 0xc8b8a0, 16, 6, { size: [0.3, 0.7] }); } });
  }
  function emberCrystalArt() {
    if (W._ecArt) return W._ecArt;
    P.seed(5150);
    const c = P.canvas(140, 200), x = c.getContext('2d');
    A.glow(x, 70, 120, 70, '#ff7a20', 0.55);
    [[70, 0, 30, 1], [36, 50, 20, 0.8], [104, 60, 18, 0.75]].forEach(([cx, top, w, k]) => P.polyShape(x, [[cx - w, 196], [cx - w * 0.8, top + 70 * k], [cx, top + 10], [cx + w * 0.8, top + 70 * k], [cx + w, 196]], { base: '#ff8a3a', outline: '#4a1206', hi: 0.9 }));
    x.fillStyle = 'rgba(255,240,190,.8)'; x.fillRect(66, 40, 5, 120);
    W._ecArt = c; return c;
  }
  function crystal(x, z) {
    const g = prop(emberCrystalArt(), 3.2, x, z, { r: 1.1 });
    const glow = glowAt(x, W.heightAt(x, z) + 1.4, z, 0xff7a20, 5);
    const cr = { x, z, y: W.heightAt(x, z), r: 1.2, state: 'idle', fuse: 0, g, glow, collider: W.colliders[W.colliders.length - 1], respawn: 0 };
    W.crystals.push(cr);
  }
  W.igniteCrystal = (cr) => { if (cr.state !== 'idle') return; cr.state = 'fuse'; cr.fuse = 1.1; EW.audio.sfx('charge', { vol: 0.6 }); };
  W.tickEnv = (dt, onExplode) => {
    for (const cr of W.crystals) {
      if (cr.state === 'fuse') {
        cr.fuse -= dt; const s = 5 + (1.1 - cr.fuse) * 8 + Math.sin(E.time * 40) * 1.2; cr.glow.scale.set(s, s, 1);
        if (cr.fuse <= 0) {
          cr.state = 'spent'; cr.g.visible = false; cr.collider.off = true; cr.glow.visible = false; cr.respawn = 60;
          EW.audio.sfx('explosion'); EW.cam.shake(0.6);
          E.burst(cr.x, cr.y + 1.5, cr.z, 0xff8a2a, 40, 12, { size: [0.4, 1.1], up: [2, 10] });
          E.burst(cr.x, cr.y + 1.5, cr.z, 0xfff0a0, 18, 6, { size: [0.6, 1.4], life: [0.2, 0.4] });
          E.ring(cr.x, cr.z, cr.y, 0.5, 7.5, 0.5, 0xff9a40); E.dust(cr.x, cr.y, cr.z, 14, 5, 0x6a5a50);
          onExplode && onExplode(cr);
        }
      } else if (cr.state === 'spent') {
        cr.respawn -= dt;
        if (cr.respawn <= 0) { cr.state = 'idle'; cr.g.visible = true; cr.glow.visible = true; cr.collider.off = false; cr.glow.scale.set(5, 5, 1); }
      }
    }
  };
  function herb(x, z) {
    const g = prop(A.herb(), 1.1, x, z);
    const gl = glowAt(x, W.heightAt(x, z) + 0.6, z, 0x9aff8a, 2.2, true, 0.5);
    const h = { x, z, taken: false };
    W.herbs.push(h);
    W.interact.push({ id: 'herb', x, z, r: 2.4, y: 1.6, label: 'prompt.herb', enabled: () => !h.taken, act: () => { h.taken = true; g.visible = false; gl.visible = false; EW.hunt && EW.hunt.gatherHerb(h); } });
  }
  W.FIELDS = FIELDS;
})();
