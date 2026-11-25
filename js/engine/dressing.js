// Set dressing — runs after a place is built and fills it in: ground cover, rock outcrops,
// trees, village clutter, far mountains, colossal silhouettes and birds. Purely visual except
// for the colliders on big rocks / trees.
(function () {
  'use strict';
  const EW = window.EW, E = EW.engine, W = EW.world, P = window.Paint, A = window.Art;
  const D = (EW.dress = {});
  const SC = A.SC, SCAT = A.SCATTER;
  // painters are seeded and deterministic: paint each variant once, share canvas + texture
  for (const k of ['greenTree', 'bush', 'deadTree', 'ashPine', 'boulder', 'cliffTex', 'ivy', 'hay', 'woodpile', 'well', 'cart', 'stall', 'ribcage', 'colossusRibs', 'volcano', 'crate', 'barrel', 'brazier', 'lantern', 'tent', 'herb', 'banner']) {
    const fn = A[k], memo = new Map(); if (!fn) continue;
    A[k] = (...a) => { const key = a.join('|'); if (!memo.has(key)) memo.set(key, fn(...a)); return memo.get(key); };
  }
  let sd = 1; const seed = (s) => { sd = s; }; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  // weighted pick from [[cell, weight, hMin, hMax, sway], …]
  const choose = (table) => { let t = 0; for (const e of table) t += e[1]; let k = rnd() * t; for (const e of table) { k -= e[1]; if (k <= 0) return e; } return table[0]; };
  const item = (list, x, z, e, shade) => { const h = rr(e[2], e[3]); list.push({ x, y: W.heightAt(x, z) - 0.04, z, cell: e[0], w: h, h, sway: e[4] || 0, flip: rnd() < 0.5, shade: shade || rr(0.82, 1.08) }); };
  const addScatter = (list) => { const m = E.scatter(A.scatterAtlas(), SCAT.cols, SCAT.rows, list); W.group.add(m); W.updaters.push((t) => m.userData.update(t)); return m; };
  // purely visual rocks (rubble, cliff spires) are collected per area and merged into ONE mesh each —
  // hundreds of draw calls become a handful. Solid rocks stay separate: they fade when they hide the hunter.
  let batch = null;
  const rock = (x, z, sx, sy, sz, { solid = true, y, tone } = {}) => {
    const m = E.rock(Math.floor(rnd() * 1000), sx, sy, sz, A.cliffTex(), { tone });
    m.position.set(x, (y == null ? W.heightAt(x, z) : y) - sy * 0.06, z); m.rotation.y = rnd() * 6.28;
    if (!solid && batch) { batch.push(m); return m; }
    W.group.add(m);
    if (solid) { const r = Math.max(sx, sz) * 0.78; W.colliders.push({ x, z, r }); W.occluders.push({ x, z, r: r + 0.4, h: sy * 0.9, mats: [m.material] }); }
    return m;
  };
  const flushRocks = () => {
    if (!batch || !batch.length) { batch = null; return; }
    const list = batch; batch = null;
    let n = 0; for (const m of list) n += m.geometry.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3(); let o = 0;
    for (const m of list) {
      m.updateMatrix(); nm.getNormalMatrix(m.matrix);
      const g = m.geometry, ps = g.attributes.position, ns = g.attributes.normal, us = g.attributes.uv, cs = g.attributes.color;
      for (let i = 0; i < ps.count; i++, o++) {
        v.fromBufferAttribute(ps, i).applyMatrix4(m.matrix); P[o * 3] = v.x; P[o * 3 + 1] = v.y; P[o * 3 + 2] = v.z;
        v.fromBufferAttribute(ns, i).applyMatrix3(nm).normalize(); N[o * 3] = v.x; N[o * 3 + 1] = v.y; N[o * 3 + 2] = v.z;
        U[o * 2] = us.getX(i); U[o * 2 + 1] = us.getY(i);
        C[o * 3] = cs.getX(i); C[o * 3 + 1] = cs.getY(i); C[o * 3 + 2] = cs.getZ(i);
      }
      g.dispose(); if (m !== list[0]) m.material.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    W.group.add(new THREE.Mesh(g, list[0].material));
  };

  // ================================================================== Emberwatch Lodge
  D.hub = () => {
    const K = W.kit; seed(9001);
    // far ranges in the dusk haze
    W.group.add(E.mountains(0, 0, [
      { R: 300, depth: 90, base: 46, amp: 70, col: 0x7a5e6e, haze: 0xb08a80 },
      { R: 370, depth: 110, base: 70, amp: 120, col: 0x94727a, haze: 0xc09684 },
    ], 77));
    const birds = E.birds(7, 0, 0, { r: [30, 80], h: [34, 60], color: 0x2a2228, size: 1.1 }); W.group.add(birds); W.updaters.push((t) => birds.userData.update(t));
    // a wood beyond the walls — crowns rise over the battlements so the court is not a bare box
    const inCourt = (x, z) => Math.abs(x) < 33 && Math.abs(z) < 33, road = (x, z) => Math.abs(x) < 9 && z < -28;
    for (let i = 0; i < 90; i++) {
      const a = rnd() * 6.283, r = rr(40, 66), x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r * 1.05;
      if (inCourt(x, z) || road(x, z)) continue;
      K.prop(A.greenTree(i % 3), rr(13, 21), x, z, { flip: i % 2 === 0 });
    }
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.283, r = rr(35, 60), x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 1.1; if (inCourt(x, z) || road(x, z)) continue; K.prop(A.bush(i % 2), rr(2.2, 3.6), x, z, { flip: i % 2 === 0 }); }
    // courtyard: two shade trees, a well, a hunter's cart, a provisioner's stall, hay and firewood
    [[-24, -19, 0], [23.5, 21, 1]].forEach(([x, z, v]) => { K.prop(A.greenTree(v), 13, x, z, { fade: true, r: 0.9, shadow: 3.4 }); });
    K.prop(A.well(), 4.6, 12, 19.5, { r: 2.1, shadow: 2 });
    K.prop(A.cart(), 3.4, 17, -22.5, { r: 2.4, shadow: 2.4 });
    K.prop(A.stall('#8a2e26'), 5.2, -17, -24, { r: 2.6, fade: true });
    K.prop(A.stall('#2e4a6a'), 5.2, 6, 27.2, { r: 2.6, fade: true });
    [[26.5, 17], [24.4, 19.6], [26.2, 20.4]].forEach(([x, z]) => K.prop(A.hay(), 1.7, x, z, { r: 1 }));
    K.prop(A.hay(), 1.7, 25.4, 18.6, { y: 1.5 });
    K.prop(A.woodpile(), 2.1, -27, -8.5, { r: 1.5 }); K.prop(A.woodpile(), 1.8, -27.2, 12.5, { r: 1.3 });
    [[-14, -27.6, 1], [14, -27.6, 0], [-20, 27.6, 0], [18, 27.6, 1], [-27.6, -4, 1], [27.6, -10, 0]].forEach(([x, z, v]) => K.prop(A.bush(v), 2.4, x, z, { r: 0.9 }));
    // an avenue of planters up to the quest board, and working clutter so the court reads as lived-in
    [-3, 5, 13, 21].forEach((z, i) => [-5.2, 5.2].forEach((x) => K.prop(A.bush((i + (x > 0 ? 1 : 0)) % 2), 2.1, x, z, { r: 0.9, shadow: 1.1 })));
    [[-14.5, 15, 2], [15.5, -9, 0]].forEach(([x, z, v]) => K.prop(A.greenTree(v), 10.5, x, z, { fade: true, r: 0.8, shadow: 3 }));
    [[-11, 5.5, 'barrel'], [-12.4, 6.6, 'crate'], [-10.2, 7.4, 'barrel'], [10, -5, 'crate'], [11.6, -5.6, 'hay'], [10.8, -3.6, 'barrel'], [-9, -8, 'hay'], [16, 13, 'crate'], [17.3, 12.2, 'crate']]
      .forEach(([x, z, k]) => K.prop(A[k](), k === 'hay' ? 1.7 : 1.4, x, z, { r: 0.8, shadow: 0.8 }));
    K.prop(A.crate(), 1.2, 16.6, 12.6, { y: 1.3 });
    // ivy climbing the old walls
    [[-22, 29.1, Math.PI, 0], [14, 29.1, Math.PI, 1], [-29.1, 22, Math.PI / 2, 1], [-29.1, -22, Math.PI / 2, 0], [29.1, 8, -Math.PI / 2, 0], [29.1, -24, -Math.PI / 2, 1], [-18, -29.1, 0, 1], [20, -29.1, 0, 0]]
      .forEach(([x, z, yaw, v]) => K.fixedPlane(A.ivy(v), 5, 6.6, x, 0.6, z, yaw));
    // forge smoke
    W.updaters.push((t, dt) => { if (Math.random() < dt * 5) E.burst(-25.5 + (Math.random() - 0.5), 7.5, 1, 0x6a6058, 1, 0.4, { size: [1.2, 2.2], up: [1.4, 2.4], grav: -0.6, life: [2.2, 3.4] }); });
    // ground cover: weeds along the walls and between the flags, meadow outside
    const list = [];
    const weeds = [[SC.grass, 6, 0.5, 0.9, 0.05], [SC.grassTall, 2, 0.8, 1.2, 0.08], [SC.pebbles, 2, 0.4, 0.7], [SC.flowersY, 1, 0.6, 0.9, 0.05], [SC.fern, 1, 0.7, 1.1, 0.05]];
    for (let i = 0; i < 520; i++) { const side = Math.floor(rnd() * 4), u = rr(-28.5, 28.5), off = 28.6 - Math.pow(rnd(), 2.2) * 6; const x = side < 2 ? u : (side === 2 ? -off : off), z = side < 2 ? (side === 0 ? -off : off) : u; if (Math.abs(x) < 8 && z < -24) continue; item(list, x, z, choose(weeds)); }
    const meadow = [[SC.grass, 8, 0.7, 1.2, 0.08], [SC.grassTall, 6, 1.0, 1.7, 0.12], [SC.flowersY, 2, 0.7, 1.1, 0.08], [SC.flowersW, 2, 0.7, 1.1, 0.08], [SC.fern, 2, 0.9, 1.4, 0.06], [SC.rock, 1, 0.8, 1.6], [SC.shroom, 0.6, 0.5, 0.8]];
    for (let i = 0; i < 2600; i++) { const x = rr(-68, 68), z = rr(-68, 68); if (inCourt(x, z)) continue; if (Math.abs(x) < 4 && z < -30) continue; item(list, x, z, choose(meadow)); }
    addScatter(list);
  };

  // ================================================================== The Ashen Ravine
  D.ravine = () => {
    const K = W.kit; seed(4711);
    // ranges beyond the rim + a burning mountain to the north + the ribs of something vast
    W.group.add(E.mountains(-60, -110, [
      { R: 430, depth: 110, base: 70, amp: 120, col: 0x4a3a38, haze: 0x6a5048 },
      { R: 530, depth: 140, base: 110, amp: 190, col: 0x5c4640, haze: 0x74564c },
    ], 99));
    const vol = K.fixedPlane(A.volcano(), 620, 340, 70, 30, -560, 0); vol.material.fog = false; vol.material.color.setRGB(0.92, 0.84, 0.8);
    const vg = K.glowAt(64, 196, -556, 0xff6a1a, 150, true, 0.5); vg.material.fog = false;
    [[-118, -146, 0, 0.9, 170], [156, -96, 1, -1.3, 150], [-150, 92, 1, 2.5, 150], [150, -330, 0, -0.5, 170]].forEach(([x, z, v, yaw, w]) => { const m = K.fixedPlane(A.colossusRibs(v), w, w * 0.55, x, W.heightAt(x, z) - 6, z, yaw); m.material.color.setRGB(0.8, 0.72, 0.68); });
    [[0, -10], [-212, -40], [44, -236]].forEach(([x, z], i) => { const b = E.birds(5, x, z, { r: [30, 70], h: [44, 70], color: 0x141012, size: 1.3, seed: 60 + i }); W.group.add(b); W.updaters.push((t) => b.userData.update(t)); });

    const segs = []; for (const k in W.passes) { const L = W.passes[k]; for (let i = 0; i < L.length - 1; i++) segs.push([L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]]); } segs.push([0, 50, 0, 130]);
    const segD = (x, z, q) => { const vx = q[2] - q[0], vz = q[3] - q[1], L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - q[0]) * vx + (z - q[1]) * vz) / L2)); return Math.hypot(x - q[0] - vx * t, z - q[1] - vz * t); };
    const passD = (x, z) => { let d = 1e9; for (const q of segs) d = Math.min(d, segD(x, z, q)); return d; };
    const denD = (x, z) => Math.min(...W.dens.map((d) => Math.hypot(x - d.x, z - d.z)));
    const L = W.ledge, nearLedge = (x, z, m) => x > L.x0 - m && x < L.x1 + m && z > L.z0 - m && z < L.z1 + 18 + m;
    const propsClear = (x, z, m) => W.pillars.every((p) => Math.hypot(x - p.x, z - p.z) > m) && W.crystals.every((c) => Math.hypot(x - c.x, z - c.z) > m * 0.6) && W.colliders.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + m * 0.5);

    for (const zn of W.zones) {
      batch = [];
      // outcrops crowding in from the rim (solid) — the basin stops reading as a clean bowl
      for (let i = 0, placed = 0; i < 400 && placed < 26; i++) {
        const a = rnd() * 6.283, d = rr(0.5, 1.0) * zn.r, x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d, o = W.open(x, z);
        if (o < 0.55 || o > 0.999 && rnd() < 0.55) continue;
        if (passD(x, z) < 17 || denD(x, z) < 30 || nearLedge(x, z, 7) || Math.hypot(x, z - 84) < 16) continue;
        const s = rr(2.4, 6.5); if (!propsClear(x, z, s + 5)) continue;
        rock(x, z, s * rr(0.8, 1.2), s * rr(1.0, 2.6), s * rr(0.8, 1.2), { tone: rr(0.86, 1.05) }); placed++;
        // rubble at its foot
        for (let k = 0; k < 3; k++) { const b = rnd() * 6.28, q = s + rr(0.6, 2.2), bx = x + Math.cos(b) * q, bz = z + Math.sin(b) * q; if (W.open(bx, bz) > 0.5 && passD(bx, bz) > 12) rock(bx, bz, rr(0.6, 1.3), rr(0.5, 1.2), rr(0.6, 1.3), { solid: false, tone: rr(0.8, 1) }); }
      }
      // spires standing on the cliffs themselves: a broken skyline instead of a smooth wall
      for (let i = 0, placed = 0; i < 300 && placed < 26; i++) {
        const a = rnd() * 6.283, d = rr(0.86, 1.3) * zn.r, x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d, o = W.open(x, z);
        if (o > 0.3 || passD(x, z) < 20) continue;
        const s = rr(5, 11); rock(x, z, s, s * rr(2.2, 4.6), s * rr(0.8, 1.2), { solid: false, y: W.heightAt(x, z) - s, tone: rr(0.7, 0.92) }); placed++;
      }
      flushRocks();
    }
    // a few big lonely stones out in the open, well away from the dens
    for (const zn of W.zones) for (let i = 0, placed = 0; i < 200 && placed < 7; i++) {
      const a = rnd() * 6.283, d = rr(0.25, 0.6) * zn.r, x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (W.open(x, z) < 0.99 || passD(x, z) < 18 || denD(x, z) < 34 || nearLedge(x, z, 8) || !propsClear(x, z, 9)) continue;
      const s = rr(1.8, 3.4); rock(x, z, s, s * rr(0.9, 1.8), s * rr(0.8, 1.2), { tone: rr(0.9, 1.05) }); placed++;
    }
    // more charred trunks near the rims of every basin
    for (const zn of W.zones) for (let i = 0; i < (zn.id === 'wood' ? 70 : 34); i++) {
      const a = rnd() * 6.283, d = rr(0.55, 0.97) * zn.r, x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (W.open(x, z) < 0.6 || passD(x, z) < 12 || denD(x, z) < 26 || nearLedge(x, z, 5) || Math.hypot(x, z - 84) < 14 || !propsClear(x, z, 4)) continue;
      K.prop(zn.id === 'caldera' || rnd() < 0.25 ? A.ashPine(i % 2) : A.deadTree(i % 4), rr(9, 16), x, z, { fade: true, r: 0.6, flip: i % 2 === 0 });
    }
    // ground cover
    const list = [];
    const T = {
      crater: [[SC.dry, 9, 0.6, 1.0, 0.07], [SC.dryTall, 5, 0.8, 1.25, 0.1], [SC.scrub, 4, 0.7, 1.1, 0.03], [SC.pebbles, 5, 0.4, 0.8], [SC.rock, 3, 0.7, 1.6], [SC.bones, 1.2, 0.7, 1.1], [SC.skull, 0.4, 0.6, 0.8], [SC.cinder, 1, 0.6, 1.1], [SC.stump, 0.8, 0.9, 1.4]],
      wood: [[SC.dry, 6, 0.6, 1.1, 0.07], [SC.dryTall, 8, 0.8, 1.35, 0.1], [SC.scrub, 8, 0.7, 1.3, 0.03], [SC.stump, 4, 0.9, 1.4], [SC.shroom, 3, 0.5, 0.9], [SC.fern, 2, 0.8, 1.2, 0.05], [SC.pebbles, 3, 0.4, 0.8], [SC.rock, 2, 0.7, 1.5], [SC.bones, 1, 0.7, 1.1], [SC.skull, 0.5, 0.6, 0.8]],
      caldera: [[SC.cinder, 6, 0.7, 1.4], [SC.emberBloom, 3, 0.8, 1.3, 0.05], [SC.pebbles, 6, 0.4, 0.9], [SC.rock, 6, 0.8, 1.9], [SC.scrub, 3, 0.8, 1.3, 0.03], [SC.dry, 2, 0.5, 0.9, 0.06], [SC.bones, 1.5, 0.7, 1.1], [SC.skull, 0.6, 0.6, 0.8]],
    };
    for (const zn of W.zones) {
      const tb = T[zn.id], N = zn.id === 'wood' ? 3600 : 3000;
      for (let i = 0; i < N; i++) {
        const a = rnd() * 6.283, d = Math.sqrt(rnd()) * zn.r * 1.02, x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
        if (W.open(x, z) < 0.8 || denD(x, z) < 9) continue;
        // clump: patches of cover with bare ground between
        if (W.fbm(x * 0.07 + 11, z * 0.07) < 0.42 && rnd() < 0.75) continue;
        item(list, x, z, choose(tb));
      }
    }
    for (const q of segs) for (let i = 0; i < 260; i++) { const t = rnd(), x = q[0] + (q[2] - q[0]) * t + rr(-10, 10), z = q[1] + (q[3] - q[1]) * t + rr(-10, 10); if (W.open(x, z) > 0.8) item(list, x, z, choose(T.crater)); }
    addScatter(list);
  };
})();
