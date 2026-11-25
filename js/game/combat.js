// Combat System — resolves hunter swings against the boss's body-part spheres
// (range, arc and vertical reach), environmental triggers, hit-stop and hit feedback.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine;
  const C = (EW.combat = { stop: 0 });

  C.hitstop = (t) => { C.stop = Math.max(C.stop, t); };

  // move: weapon move def; opts: { charge }
  C.swing = (p, move, opts = {}) => {
    const W = EW.WEAPONS[p.kind];
    const fl = Math.hypot(p.fx, p.fz) || 1, fx = p.fx / fl, fz = p.fz / fl;
    const h0 = p.y + move.h[0], h1 = p.y + move.h[1];
    // environment: ember crystals react to any blow
    for (const cr of EW.world.crystals) {
      if (cr.state !== 'idle') continue;
      const dx = cr.x - p.x, dz = cr.z - p.z, d = Math.hypot(dx, dz);
      if (d < move.range + 1.2 && (d < 1.5 || (dx * fx + dz * fz) / d > Math.cos(Math.min(Math.PI, move.arc / 2 + 0.3)))) { EW.world.igniteCrystal(cr); EW.audio.sfx('hitArmor', { vol: 0.6 }); E.burst(cr.x, cr.y + 1.5, cr.z, 0xffa040, 10, 4, { size: [0.15, 0.35] }); }
    }
    const boss = EW.hunt && EW.hunt.boss;
    if (!boss || boss.state === 'dead' || boss.state === 'dormant' && false) return null;
    if (boss.air > 3) return null;
    let best = null, bestScore = 1e9;
    const aimX = p.x + fx * move.range * 0.55, aimZ = p.z + fz * move.range * 0.55, aimY = (h0 + h1) / 2;
    for (const s of boss.spheres()) {
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
      if (d - s.r > move.range) continue;
      if (move.arc < 6.2 && d > s.r * 0.7) { const cos = (dx * fx + dz * fz) / d; const ang = Math.acos(Math.max(-1, Math.min(1, cos))); if (ang > move.arc / 2 + Math.atan2(s.r, d)) continue; }
      if (s.y + s.r < h0 || s.y - s.r > h1) continue;
      // prefer exposed weak parts + whatever sits nearest the swing's sweet spot
      const sc = Math.hypot(s.x - aimX, s.z - aimZ, (s.y - aimY) * 0.7) - s.r - (s.part === 'body' ? -1.5 : 0) - (s.part === 'core' ? 2 : 0);
      if (sc < bestScore) { bestScore = sc; best = s; }
    }
    if (!best) return null;
    const part = boss.parts[best.part];
    const charge = opts.charge || 1;
    const emberheart = EW.progress.skills().includes('emberheart') && p.hp < p.maxHp * 0.5;
    const dmg = EW.weaponDamage(p.kind, move, best.part, part.hz, { charge, emberheart });
    let breakMul = W.bonus.break * (move.kind === 'impact' ? 1.1 : 1);
    if (part.cut && move.kind !== 'cut') breakMul = 0; // only blades sever the tail
    const res = boss.takeHit(best.part, dmg, { breakMul, stagger: (move.stagger || 0) * W.bonus.stagger * charge });
    if (!res) return null;
    // feedback: contact point on the sphere surface facing the hunter
    const dx = p.x - best.x, dz = p.z - best.z, dl = Math.hypot(dx, dz) || 1;
    const hx = best.x + (dx / dl) * best.r * 0.8, hz = best.z + (dz / dl) * best.r * 0.8, hy = Math.max(h0 + 0.5, Math.min(h1, best.y));
    const armored = part.hz < 0.5;
    EW.audio.sfx(res.weak ? 'hitWeak' : armored ? 'hitArmor' : charge > 1.5 || p.kind === 'greatsword' ? 'hitHeavy' : 'hit', { vol: 0.9 });
    E.burst(hx, hy, hz, armored ? 0xffe0a0 : res.weak ? 0xff5a3a : 0xffa060, armored ? 10 : 16, armored ? 6 : 7, { size: [0.12, 0.38], life: [0.2, 0.45], up: [1, 5] });
    if (!armored) E.burst(hx, hy, hz, 0x5a1a10, 6, 4, { size: [0.2, 0.4], grav: 16 });
    C.hitstop(p.kind === 'greatsword' ? 0.07 + (charge - 1) * 0.04 : p.kind === 'spear' ? 0.045 : 0.025);
    if (p.kind === 'greatsword') EW.cam.shake(0.12 + (charge - 1) * 0.12);
    EW.hud && EW.hud.dmg(hx, hy + 0.6, hz, res.dmg, res.weak, armored);
    EW.hunt && EW.hunt.stats && (EW.hunt.stats.dealt += res.dmg);
    return res;
  };

  // crystal explosion: damages the boss (and a careless hunter)
  C.explosion = (cr) => {
    const boss = EW.hunt && EW.hunt.boss, p = EW.hunt && EW.hunt.player;
    if (boss && boss.state !== 'dead' && boss.state !== 'dormant') {
      let best = null, bd = 1e9;
      for (const s of boss.spheres()) { const d = Math.hypot(s.x - cr.x, s.z - cr.z, (s.y - cr.y - 1.5) * 0.5) - s.r; if (d < bd) { bd = d; best = s; } }
      if (best && bd < 7) {
        const r = boss.takeHit(best.part, 130, { breakMul: 1.2, stagger: 140 });
        if (r) { EW.hud && EW.hud.dmg(best.x, best.y, best.z, r.dmg, true); EW.hud && EW.hud.notice('env.crystal', 'good'); }
        if (boss.state !== 'dead' && boss.state !== 'topple' && boss.state !== 'mounted') boss.enter('flinch');
      }
    } else if (boss && boss.state === 'dormant' && Math.hypot(boss.x - cr.x, boss.z - cr.z) < 30) boss.wake(true);
    if (p && Math.hypot(p.x - cr.x, p.z - cr.z) < 5.5) p.receive({ dmg: 20, knock: 10, fire: true, src: { x: cr.x, z: cr.z } });
  };

  // lightweight fire-stream particles (boss breath)
  const flames = [];
  C.fireParticle = (x, y, z, vx, vy, vz) => {
    const m = new THREE.Mesh(E.centerPlane, new THREE.MeshBasicMaterial({ map: E.glowTex, color: Math.random() < 0.5 ? 0xff6a1a : 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.order = 'YXZ'; m.position.set(x, y, z); E.fxGroup.add(m); E.billboards.add(m);
    flames.push({ m, vx, vy, vz, t: 0, life: 0.9 + Math.random() * 0.3 });
  };
  C.update = (dt) => {
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i]; f.t += dt; const k = f.t / f.life;
      f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      const g = EW.world.heightAt(f.m.position.x, f.m.position.z) + 0.6;
      if (f.m.position.y < g) { f.m.position.y = g; f.vy = 0; f.vx *= 0.9; f.vz *= 0.9; }
      const s = 1 + k * 4.5; f.m.scale.set(s, s, 1); f.m.material.opacity = (1 - k) * 0.85;
      if (k >= 1) { E.fxGroup.remove(f.m); f.m.material.dispose(); E.billboards.delete(f.m); flames.splice(i, 1); }
    }
  };
  C.clear = () => { for (const f of flames) { E.fxGroup.remove(f.m); E.billboards.delete(f.m); } flames.length = 0; };
})();
