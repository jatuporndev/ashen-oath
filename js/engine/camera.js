// Camera Controller — free orbit (RMB drag / right stick), wheel zoom, follow with
// dynamic framing that keeps both the hunter and a large boss on screen, lock-on,
// cinematic overrides (gate walk, boss intro) and trauma-based screen shake.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine;
  const cam = E.camera;
  const C = (EW.cam = {
    yaw: 0, pitch: 0.42, dist: 13, minDist: 5, maxDist: 34,
    target: new THREE.Vector3(), look: new THREE.Vector3(),
    trauma: 0, lock: false, cine: null, framing: null, fovBase: 50,
  });
  const lerp = (a, b, t) => a + (b - a) * t;
  const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
  C.angLerp = angLerp;

  C.reset = (x, y, z, yaw = 0, dist = 13, pitch = 0.42) => {
    C.target.set(x, y, z); C.look.set(x, y, z); C.yaw = yaw; C.dist = dist; C.pitch = pitch; C.cine = null; C.trauma = 0;
    place(0);
  };
  C.shake = (amt) => { if (EW.save.setting('shake')) C.trauma = Math.min(1, C.trauma + amt); };
  // cinematic: { pos:Vector3, look:Vector3, t, dur, ease } — overrides follow until done
  C.cinematic = (from, to, dur, onDone) => { C.cine = { from, to, t: 0, dur, onDone }; };
  C.endCinematic = () => { C.cine = null; };

  function place(dt) {
    const sh = C.trauma * C.trauma;
    const t = E.time * 37;
    const ox = Math.sin(t) * sh * 0.6, oy = Math.sin(t * 1.3 + 1) * sh * 0.45;
    const cp = Math.cos(C.pitch);
    cam.position.set(
      C.look.x + Math.sin(C.yaw) * cp * C.dist + ox,
      C.look.y + Math.sin(C.pitch) * C.dist + oy,
      C.look.z + Math.cos(C.yaw) * cp * C.dist,
    );
    // stay inside the playable volume (e.g. the guild courtyard walls): pull in along the view ray
    if (C.inside && !C.inside(cam.position.x, cam.position.z, C.look)) {
      let lo = 0, hi = 1; const lx = C.look.x, lz = C.look.z, dx = cam.position.x - lx, dy = cam.position.y - C.look.y, dz = cam.position.z - lz;
      for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (C.inside(lx + dx * m, lz + dz * m, C.look)) lo = m; else hi = m; }
      const k = Math.max(0.25, lo); cam.position.set(lx + dx * k, C.look.y + dy * Math.max(k, 0.6), lz + dz * k);
    }
    // keep the lens above the painted ground
    if (C.ground) { const g = C.ground(cam.position.x, cam.position.z) + 1.2; if (cam.position.y < g) cam.position.y = g; }
    cam.lookAt(C.look.x + ox * 0.3, C.look.y + oy * 0.3, C.look.z);
    C.trauma = Math.max(0, C.trauma - dt * 1.6);
  }

  // ctx: { player:{x,y,z, h}, boss?:{x,y,z, size, height}, inputEnabled }
  C.update = (dt, ctx) => {
    const I = EW.input;
    if (C.cine) {
      const c = C.cine; c.t += dt;
      const k = Math.min(1, c.t / c.dur), e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(c.from.pos, c.to.pos, e);
      const lk = new THREE.Vector3().lerpVectors(c.from.look, c.to.look, e);
      const sh = C.trauma * C.trauma; cam.position.x += Math.sin(E.time * 37) * sh * 0.6; cam.position.y += Math.sin(E.time * 48) * sh * 0.45;
      cam.lookAt(lk);
      C.trauma = Math.max(0, C.trauma - dt * 1.2);
      if (k >= 1 && c.dur < 1e5) { const f = c.onDone; C.cine = null; f && f(); }
      return;
    }
    const sens = EW.save.setting('sens') / 5;
    if (ctx.inputEnabled) {
      const l = I.consumeLook();
      C.yaw -= l.x * 0.0042 * sens;
      C.pitch += l.y * 0.0034 * sens * (EW.save.setting('invertY') ? -1 : 1);
      C.pitch = Math.min(1.25, Math.max(0.08, C.pitch));
      const z = I.consumeZoom();
      if (z) C.dist = Math.min(C.maxDist, Math.max(C.minDist, C.dist * Math.pow(1.11, z)));
    } else { I.consumeLook(); I.consumeZoom(); }

    const p = ctx.player; const b = ctx.boss;
    let tx = p.x, ty = p.y + 1.6, tz = p.z, want = C.dist;
    if (b && b.engaged) {
      // dynamic framing: aim between hunter and boss; pull back for size + separation
      const dx = b.x - p.x, dz = b.z - p.z, sep = Math.hypot(dx, dz);
      const w = Math.min(0.42, 0.18 + b.height / 80);
      tx = lerp(p.x, b.x, w); tz = lerp(p.z, b.z, w); ty = lerp(p.y + 1.6, b.y + b.height * 0.45, w * 0.9);
      want = Math.max(C.dist, Math.min(C.maxDist + b.height, b.height * 1.25 + sep * 0.45));
      if (C.lock) C.yaw = angLerp(C.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 3.2));
      else if (EW.save.setting('lockAssist') && sep < b.height * 3) {
        // gentle assist: nudge the boss toward the frame when it drifts off-screen
        const pr = E.project(b.x, b.y + b.height * 0.5, b.z);
        if (!pr.ok) C.yaw = angLerp(C.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 0.9));
      }
    }
    C.target.set(tx, ty, tz);
    C.look.lerp(C.target, Math.min(1, dt * 7));
    C.curDist = lerp(C.curDist || want, want, Math.min(1, dt * 2.5));
    const keep = C.dist; C.dist = C.curDist; place(dt); C.dist = keep;
  };
  // camera basis for movement
  C.basis = () => ({ fx: -Math.sin(C.yaw), fz: -Math.cos(C.yaw), rx: Math.cos(C.yaw), rz: -Math.sin(C.yaw) });
  C.snapshot = () => ({ pos: cam.position.clone(), look: C.look.clone() });
  C.billboardAngles = () => {
    // derive real camera yaw / pitch (also valid during cinematics)
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(-d.y) };
  };
})();
