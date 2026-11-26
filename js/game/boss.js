// Boss AI + Body Part Damage — Gravemaw, the Ashen Behemoth (Large class, ~6.5× hunter height).
// Logic runs in a 3D local frame (+X = forward). Body-part hit spheres are derived from the
// same animation parameters that pose the 3D pixel-art rig (js/art/beast.js), so what you see is what you hit.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine, A = window.Art;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

  const PARTS = {
    head: { hz: 1.0, dur: 280, label: 'part.head' },
    horns: { hz: 0.8, dur: 260, label: 'part.horns' },
    body: { hz: 0.45 },
    plates: { hz: 0.3, dur: 420, label: 'part.plates' },
    core: { hz: 1.6 },
    forelegs: { hz: 0.7, dur: 300, label: 'part.forelegs' },
    hindlegs: { hz: 0.55 },
    tail: { hz: 0.8, dur: 280, label: 'part.tail', cut: true },
  };
  // rest-pose hit spheres (local): [part, x, y, z, r]
  const SPHERES = [
    ['head', 15, 10, 0, 3], ['horns', 16.5, 13.6, 0, 2.1],
    ['body', 0, 7.5, 0, 5.4], ['body', 6.5, 7.8, 0, 4.6], ['body', -6.5, 7.2, 0, 4.6],
    ['plates', 0, 12.6, 0, 4.2], ['plates', -6, 12, 0, 3.2], ['plates', 6, 12.2, 0, 3.2], ['core', 0, 13.6, 0, 2.2],
    ['forelegs', 7, 3.2, 3.4, 2.3], ['forelegs', 7, 3.2, -3.4, 2.3],
    ['hindlegs', -7, 3, 3.6, 2.3], ['hindlegs', -7, 3, -3.6, 2.3],
    ['tail', -14, 6, 0, 2.4], ['tail', -21, 3.8, 0, 3],
  ];

  class Gravemaw {
    constructor(home) {
      this.key = this.constructor.KEY || 'gravemaw';
      this.def = EW.data.bosses[this.key];
      this.height = 14; this.size = 'large';
      this.maxHp = this.def.hp; this.hp = this.maxHp;
      this.x = home.x; this.z = home.z; this.yaw = Math.PI / 2; this.vy = 0; this.air = 0;
      this.state = 'dormant'; this.st = 0; this.phase = 1; this.stamina = 100; this.cool = 2;
      this.flinchAcc = 0; this.stagger = 0; this.staggerMax = 320; this.toppleCount = 0; this.roarCd = 25;
      this.parts = {}; for (const [k, v] of Object.entries(PARTS)) this.parts[k] = Object.assign({ dmg: 0, broken: false }, v);
      this.a = { bodyY: -2.6, pitch: 0, headDrop: 7, jaw: 0, fore: [0.9, 0.9], hind: [0.7, 0.7], tail: 0, walk: 0, topple: 0, plateOpen: 0, glow: 0.4 };
      this.patches = []; this.flash = 0; this.engaged = false; this.mount = null; this.carves = 0; this.carveMax = 3; this.fledAt = []; this.tracks = []; this.lost = false; this.pd = 0;
      this.flinchNeed = 260; this.staggerStep = 160;
      this.pace = 1; this.SPH = SPHERES; this.col = { mouth: 0xff7a20, core: 0xff9a40, spark: 0xff8a2a };
      this.tune();
      this.buildPuppet();
      this.y = this.ground();
    }
    // co-op balance: more hunters -> a tougher beast (hp, parts, flinch / topple thresholds)
    scaleParty(n) {
      if (n <= 1) return;
      const hpMul = [1, 1, 1.75, 2.4, 2.9][Math.min(4, n)], k = n - 1;
      this.maxHp = Math.round(this.def.hp * hpMul); this.hp = this.maxHp;
      this.staggerMax = Math.round(this.staggerMax * (1 + 0.4 * k)); this.staggerStep = Math.round(this.staggerStep * (1 + 0.4 * k));
      this.flinchNeed = Math.round(this.flinchNeed * (1 + 0.35 * k));
      for (const P of Object.values(this.parts)) if (P.dur) P.dur = Math.round(P.dur * (1 + 0.3 * k));
    }
    // co-op: everyone the beast can hit (host side); solo it's just the hunter
    hunters(local) { return EW.net && EW.net.party() ? EW.net.hunters(local) : [local]; }
    pickTarget(local, dt) {
      const hs = this.hs;
      if (hs.length === 1) return local;
      const ok = (q) => q && hs.includes(q) && q.state !== 'faint' && q.state !== 'cine';
      this.aggroT = (this.aggroT || 0) - dt;
      if (this.state !== 'attack' && (!ok(this.aggro) || this.aggroT <= 0)) {
        // mostly the nearest hunter, sometimes whoever else is close enough - and stick with them a while
        const live = hs.filter(ok); if (!live.length) return local;
        const d = (q) => Math.hypot(q.x - this.x, q.z - this.z);
        live.sort((a, b) => d(a) - d(b));
        const near = live.filter((q) => d(q) < d(live[0]) * 1.35 + 4);
        this.aggro = near[Math.floor(Math.random() * near.length)]; this.aggroT = 6 + Math.random() * 5;
      }
      return ok(this.aggro) ? this.aggro : local;
    }

    // ------------------------------------------------------------------ puppet
    tune() {} // per-species stats (subclasses)
    buildPuppet() {
      // a real 3D rig drawn as pixel art in real time (js/art/beast.js) — posed from this.a every frame
      this.beast = EW.Beast[this.key]();
      this.layer = new EW.Beast.PixelLayer({ ppu: 24 });
      this.layer.scene.add(this.beast.root);
      this.layer.focus = () => new THREE.Vector3(this.x, this.y + 7, this.z);
      this.root = new THREE.Group();
      this.shadow = E.shadow(13, 0.45); this.root.add(this.shadow);
      this.mouthGlow = E.glow(this.col.mouth, 6, 0); this.root.add(this.mouthGlow);
      this.coreGlow = E.glow(this.col.core, 9, 0); this.root.add(this.coreGlow);
      this.decals = { circle: E.decal(), ring: E.decal(), cone: this.coneDecal(), lane: this.laneDecal() };
      E.scene.add(this.root);
    }
    coneDecal() { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32, -0.6, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending })); E.fxGroup.add(m); return m; }
    laneDecal() { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending })); E.fxGroup.add(m); return m; }
    dispose() {
      E.scene.remove(this.root); this.layer.dispose();
      Object.values(this.decals).forEach((d) => E.fxGroup.remove(d));
      this.tailProp = null;
      E.billboards.delete(this.mouthGlow); E.billboards.delete(this.coreGlow);
    }

    // ------------------------------------------------------------------ geometry helpers
    ground() {
      // average under the body, but never more than a little above the centre: a head or tail hanging over a
      // cliff must not lift the whole beast onto the mountain
      let s = 0; for (const [lx, lz] of [[0, 0], [8, 0], [-8, 0], [0, 4], [0, -4]]) { const w = this.toWorld(lx, 0, lz, true); s += EW.world.heightAt(w.x, w.z); }
      return Math.min(s / 5, EW.world.heightAt(this.x, this.z) + 0.8);
    }
    toWorld(lx, ly, lz, flat) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return { x: this.x + lx * c + lz * s, y: (flat ? 0 : this.y) + ly, z: this.z - lx * s + lz * c }; }
    toLocal(wx, wz) { const dx = wx - this.x, dz = wz - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw); return { x: dx * c - dz * s, z: dx * s + dz * c }; }
    get fwd() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
    angleTo(px, pz) { return wrap(Math.atan2(-(pz - this.z), px - this.x) - this.yaw); }
    dist(p) { return Math.hypot(p.x - this.x, p.z - this.z); }
    headWorld() { const a = this.a; return this.toWorld(15 - a.headDrop * 0.3, 10 + a.bodyY - a.headDrop, 0); }
    // world-space hit spheres for the current pose
    spheres() {
      const a = this.a, out = [], squash = 1 - a.topple * 0.55;
      for (const [part, lx, ly, lz, r] of this.SPH) {
        if (part === 'core' && !(this.parts.plates.broken || a.plateOpen > 0.5 || this.state === 'dead')) continue;
        if (part === 'tail' && this.parts.tail.broken && lx < -18) continue;
        let x = lx, y = ly + a.bodyY, z = lz;
        if (part === 'head' || part === 'horns') { y -= a.headDrop; x -= a.headDrop * 0.3; }
        if (part === 'forelegs') { y += Math.max(0, a.fore[0]) * 3; }
        if (part === 'tail') { const sw = a.tail, rx = x + 9.5; x = -9.5 + rx * Math.cos(sw); z = -rx * Math.sin(sw); }
        y = Math.max(r * 0.6, y * squash);
        const w = this.toWorld(x, y, z);
        out.push({ part, x: w.x, y: w.y, z: w.z, r });
      }
      return out;
    }
    mountPoint() {
      const a = this.a; const w = this.toWorld(-1, 14.2 * (1 - a.topple * 0.5) + a.bodyY + (this.thrashing ? Math.sin(E.time * 30) * 0.3 : 0), 0);
      const cp = E.camera.position, dx = cp.x - w.x, dz = cp.z - w.z, l = Math.hypot(dx, dz) || 1;
      return { x: w.x + (dx / l) * 2.5, y: w.y, z: w.z + (dz / l) * 2.5 };
    }
    // keep the hunter out of the body volume (capsule along the spine)
    pushOut(pos, r) {
      if (this.air > 2 || this.state === 'dormant') return;
      const L = this.toLocal(pos.x, pos.z), half = this.state === 'dead' || this.a.topple > 0.5 ? 5.2 : 4.2;
      const cx = clamp(L.x, -9, 11), dz = L.z, dx = L.x - cx, d = Math.hypot(dx, dz), m = half + r;
      if (d < m) {
        const nx = d > 1e-3 ? dx / d : 0, nz = d > 1e-3 ? dz / d : 1;
        const lx = cx + nx * m, lz = nz * m;
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        pos.x = this.x + lx * c + lz * s; pos.z = this.z - lx * s + lz * c;
      }
    }

    // ------------------------------------------------------------------ damage + parts
    // returns { dmg, weak, broke }
    takeHit(part, dmg, opts = {}) {
      if (this.state === 'dead') return null;
      const P = this.parts[part];
      let d = dmg;
      if (part === 'core' && this.a.plateOpen > 0.5) d = Math.round(d * 1.5);
      if (this.state === 'dormant') this.wake(true);
      this.hp -= d; this.flash = 0.09;
      if (part === 'core' && this.attack && (this.attack.name === 'vent' || this.attack.name === 'quake')) this.attack.interrupt = (this.attack.interrupt || 0) + d;
      let broke = false;
      if (P.dur && !P.broken) {
        P.dmg += d * (opts.breakMul || 1);
        if (P.dmg >= P.dur) { P.broken = true; broke = true; this.onBreak(part); }
      }
      this.flinchAcc += d * (part === 'head' ? 1.5 : 1);
      this.stagger += (opts.stagger || 0) + (part === 'head' ? d * 0.5 : 0);
      if (this.hp <= 0) { this.die(); return { dmg: d, weak: P.hz >= 1, broke }; }
      if (this.state === 'rest') this.rouse();
      for (const th of [0.65, 0.3]) if (this.hp < this.maxHp * th && !this.fledAt.includes(th) && EW.world.dens) { this.fledAt.push(th); this.fleeQueued = true; }
      if (this.phase === 1 && this.hp < this.maxHp * 0.6) { this.phase = 2; this.queueRoar = true; EW.hud && EW.hud.notice('boss.enraged', 'warn'); EW.audio.intensity(1); }
      if (!['topple', 'stun', 'dead', 'intro', 'mounted', 'flee'].includes(this.state) && !this.mount) {
        if (this.stagger >= this.staggerMax) { this.stagger = 0; this.staggerMax += this.staggerStep; this.enter('topple'); }
        else if (this.flinchAcc >= this.flinchNeed && (!this.attack || this.attack.name !== 'leap' || (this.attack.phase === 0 && this.attack.t < 0.8))) { this.flinchAcc = 0; this.enter('flinch'); }
      }
      return { dmg: d, weak: P.hz * (part === 'core' && this.a.plateOpen > 0.5 ? 1.5 : 1) >= 1, broke };
    }
    onBreak(part) {
      this.breakFx(part, true);
      if (part === 'head') { this.scar = true; }
      if (part === 'forelegs') this.enter('topple');
      if (part === 'tail' && this.state !== 'dead') this.enter('flinch');
    }
    breakFx(part, loud) {
      if (loud) { EW.audio.sfx('partBreak'); EW.cam.shake(0.55); const k = 'break.' + part + '.' + this.key; EW.hud && EW.hud.notice(EW.t(k) !== k ? k : 'break.' + part, 'break'); }
      EW.hunt && EW.hunt.onBreak(part);
      const sp = this.spheres().find((q) => q.part === part) || { x: this.x, y: this.y + 8, z: this.z };
      E.burst(sp.x, sp.y, sp.z, 0xffa040, 40, 10, { size: [0.3, 0.9], up: [3, 10] });
      E.burst(sp.x, sp.y, sp.z, 0xd8ccb0, 20, 8, { size: [0.4, 0.8], grav: 14 });
      this.beast.breakPart(part);
      if (part === 'tail') {
        // severed tail lies on the ground and can be carved (drawn by the same pixel layer)
        const tw = this.toWorld(-20, 0, 0, true);
        const g = this.beast.severedTail(); g.position.set(tw.x, EW.world.heightAt(tw.x, tw.z) + 1.0, tw.z); g.rotation.y = this.yaw + 0.5; this.layer.scene.add(g);
        g.position.x += Math.cos(this.yaw) * 4; g.position.z -= Math.sin(this.yaw) * 4;
        this.tailProp = g;
        EW.world.interact.push({ id: 'carveTail', x: tw.x, z: tw.z, r: 3.6, y: 2, label: 'prompt.carve', enabled: () => !this.tailCarved, act: () => { this.tailCarved = true; EW.hunt.carve('tail'); g.visible = false; } });
      }
    }
    die() {
      this.hp = 0; this.enter('dead'); this.attack = null; this.clearDecals();
      if (this.mount) this.endMount(false);
      EW.audio.sfx('roar', { vol: 0.7 }); EW.cam.shake(0.8);
      EW.hunt && EW.hunt.onBossDown();
      EW.world.interact.push({ id: 'carve', x: this.x, z: this.z, r: 12, y: 6, label: 'prompt.carve', enabled: () => this.st > 2.5 && this.carves < this.carveMax, act: () => { this.carves++; EW.hunt.carve('body'); } });
    }

    // ------------------------------------------------------------------ state machine
    enter(s) {
      if (this.state === 'flee' && s !== 'rest' && s !== 'dead') this.fleeQueued = true; // interrupted: it tries again
      if (this.attack && s !== 'attack') { this.attack = null; this.clearDecals(); }
      // any other state while ridden (part break → flinch/topple, low-hp flee, death…) drops the rider
      // properly — otherwise the player stays frozen in the riding pose on a beast that's no longer 'mounted'
      if (this.mount && s !== 'mounted') { this.state = s; this.endMount(false); }
      this.state = s; this.st = 0;
      if (s === 'topple') { this.toppleCount++; EW.audio.sfx('stomp', { vol: 1 }); EW.cam.shake(0.6); E.dust(this.x, this.y, this.z, 30, 10); EW.hud && EW.hud.notice('boss.toppled', 'good'); }
      if (s === 'exhausted') EW.hud && EW.hud.notice('boss.exhausted', 'good');
      if (s === 'flinch') EW.audio.sfx('growl', { vol: 0.8 });
      if (s === 'stun') { EW.hud && EW.hud.notice('boss.stunned', 'good'); }
    }
    wake(fromHit) {
      if (this.state !== 'dormant') return;
      this.engaged = true; this.enter('intro'); this.introHit = fromHit;
      EW.hunt && EW.hunt.onBossWake();
    }
    // ------------------------------------------------------------------ fleeing between dens + tracks
    startFlee(player) {
      const W = EW.world, dd = (d) => Math.hypot(d.x - this.x, d.z - this.z);
      const here = W.dens.reduce((a, d) => (dd(d) < dd(a) ? d : a));
      const others = W.dens.filter((d) => d !== here);
      // prefer the den farthest from the hunter
      others.sort((a, b) => Math.hypot(b.x - player.x, b.z - player.z) - Math.hypot(a.x - player.x, a.z - player.z));
      const to = Math.random() < 0.75 ? others[0] : others[others.length - 1];
      this.fleeQueued = false; this.den = to;
      this.path = [{ x: here.x, z: here.z }].concat(W.route(here.id, to.id));
      if (dd(here) > 30) this.path.shift();
      this.trackDist = 0; this.enter('flee');
      EW.audio.sfx('roar', { vol: 0.8 }); EW.cam.shake(0.4);
      EW.hud && EW.hud.notice('boss.flee', 'warn');
      EW.hunt && EW.hunt.onBossFlee && EW.hunt.onBossFlee(to);
    }
    dropTrack() {
      const W = EW.world, m = E.decal(0xff7a2a), side = (this.tracks.length % 2 ? 1 : -1) * 2.6;
      const w = this.toWorld(4, 0, side, true);
      m.position.set(w.x, W.heightAt(w.x, w.z) + 0.08, w.z); m.scale.set(0.95, 1, 0.6); m.rotation.y = this.yaw;
      m.material.opacity = 0.75;
      this.tracks.push({ m, x: w.x, z: w.z, life: 160, den: this.den, seen: false });
    }
    tickTracks(dt, player) {
      for (let i = this.tracks.length - 1; i >= 0; i--) {
        const tr = this.tracks[i]; tr.life -= dt;
        tr.m.material.opacity = 0.75 * Math.min(1, tr.life / 40) * (0.75 + Math.sin(E.time * 3 + i) * 0.25);
        if (!tr.seen && this.lost && Math.hypot(player.x - tr.x, player.z - tr.z) < 7) {
          tr.seen = true;
          if (!this.trackNoticeT || E.time - this.trackNoticeT > 12) {
            this.trackNoticeT = E.time;
            const zn = EW.world.zones.find((z) => z.id === tr.den.zone);
            EW.hud && EW.hud.notice('notice.tracks', 'good', { area: EW.t(zn.area) }); EW.audio.sfx('paper', { vol: 0.5 });
          }
        }
        if (tr.life <= 0) { E.fxGroup.remove(tr.m); tr.m.geometry.dispose(); tr.m.material.dispose(); this.tracks.splice(i, 1); }
      }
    }
    rouse() { if (this.state !== 'rest') return; this.enter('stalk'); this.queueRoar = true; this.cool = 0.6; EW.hud && EW.hud.notice('boss.found', 'warn'); EW.audio.music('battle', { intensity: 0.8 }); }
    update(dt, player) {
      const local = player;
      this.hs = this.hunters(local);
      player = this.pickTarget(local, dt);
      this.st += dt;
      this.pd = Math.min(...this.hs.map((q) => Math.hypot(q.x - this.x, q.z - this.z)));
      this.lost = (this.state === 'flee' || this.state === 'rest') && Math.hypot(local.x - this.x, local.z - this.z) > 60;
      if (this.lost && EW.cam.lock) EW.cam.lock = false;
      this.tickTracks(dt, local);
      this.flash = Math.max(0, this.flash - dt);
      this.roarCd -= dt;
      const a = this.a, pd = this.dist(player), ang = this.angleTo(player.x, player.z);
      const limp = this.parts.forelegs.broken ? 0.62 : 1, spd = (this.phase === 2 ? 1.15 : 1) * this.pace;
      let move = 0, turn = 0, tgt = null;
      // pose targets (blended toward each frame)
      const T = { bodyY: 0, pitch: 0, headDrop: 0, jaw: 0, fore: [0, 0], hind: [0, 0], tail: 0, topple: 0, plateOpen: 0, glow: this.phase === 2 ? 1 : 0.6 };
      switch (this.state) {
        case 'dormant': {
          Object.assign(T, { bodyY: -2.6, headDrop: 7, fore: [0.9, 0.9], hind: [0.7, 0.7], glow: 0.35 + Math.sin(E.time * 0.8) * 0.15 });
          if (this.pd < 46) this.wake(false);
          break;
        }
        case 'intro': {
          const t = this.st;
          if (t < 1.4) Object.assign(T, { bodyY: -2.6 + smooth(t / 1.4) * 2.6, headDrop: 7 - smooth(t / 1.4) * 9 });
          else if (t < 3.6) { Object.assign(T, { headDrop: -3, jaw: 1, pitch: -0.12 }); if (!this.roared) { this.roared = true; this.roar(player, true); } }
          else this.enter('stalk');
          tgt = player; turn = 0.9;
          break;
        }
        case 'flee': {
          const wp = this.path[0];
          if (!wp) { this.enter('rest'); this.restCap = Math.min(this.maxHp, this.hp + this.maxHp * 0.05); break; }
          Object.assign(T, { headDrop: -1, pitch: -0.05, glow: 0.8 });
          tgt = wp; turn = 2.6; move = 12.5 * limp;
          if (Math.hypot(wp.x - this.x, wp.z - this.z) < 7) this.path.shift();
          this.trackDist += Math.abs(move) * dt;
          if (this.trackDist > 5) { this.trackDist = 0; this.dropTrack(); }
          break;
        }
        case 'rest': {
          // licking its wounds: dozes in the den and slowly mends
          Object.assign(T, { bodyY: -2.2, headDrop: 6.5, fore: [0.8, 0.8], hind: [0.6, 0.6], glow: 0.3 + Math.sin(E.time * 0.8) * 0.15 });
          if (this.hp < this.restCap) this.hp = Math.min(this.restCap, this.hp + this.maxHp * 0.0015 * dt);
          if (this.pd < 34 && this.st > 1) this.rouse();
          break;
        }
        case 'stalk': {
          if (this.fleeQueued && EW.world.dens) { this.startFlee(player); break; }
          if (this.queueRoar) {
            this.queueRoar = false; this.startAttack('roar');
            // first roar of phase 2 = the enrage moment: cut to a letterboxed cutscene
            if (this.phase === 2 && !this.enrageCut && EW.hunt && EW.hunt.onEnrage && EW.hunt.onEnrage()) this.enrageCut = true;
            break;
          }
          tgt = player; turn = 1.35 * spd;
          if (EW.hunt && EW.hunt.cine) break; // hold still while a cutscene plays
          const want = 11;
          if (pd > want + 2) move = (pd > 30 ? 8.5 : 5) * limp * spd;
          else if (Math.abs(ang) < 0.5 && pd < 6) move = -2;
          this.cool -= dt;
          if (this.cool <= 0) { const atk = this.chooseAttack(player, pd, ang); if (atk) this.startAttack(atk); else this.cool = 0.4; }
          break;
        }
        case 'attack': this.tickAttack(dt, player, T); if (this.attack) { move = this.attack.move || 0; turn = this.attack.turn || 0; tgt = player; } break;
        case 'exhausted': {
          Object.assign(T, { headDrop: 5.5, bodyY: -0.8, jaw: Math.sin(E.time * 3) > 0.6 ? 1 : 0, glow: 0.2 });
          tgt = player; turn = 0.5; if (pd > 10) move = 1.8 * limp;
          if (Math.random() < dt * 3) { const h = this.headWorld(); E.burst(h.x, h.y - 1, h.z, 0x8a8a8a, 2, 1, { size: [0.6, 1.2], up: [0.5, 1.5], grav: -0.5, life: [1, 1.6] }); }
          if (this.st > 8) { this.stamina = 100; this.enter('stalk'); this.cool = 0.5; }
          break;
        }
        case 'flinch': Object.assign(T, { headDrop: 3 + Math.sin(this.st * 18) * 1.4, pitch: 0.08, bodyY: -0.4 }); if (this.st > 1.0) { this.enter('stalk'); this.cool = 0.6; } break;
        case 'stun': Object.assign(T, { headDrop: 6, bodyY: -1.4, jaw: 1, glow: 0.2 }); if (this.st > 4) { this.enter('stalk'); this.cool = 0.4; } break;
        case 'topple': {
          const dur = this.mountFinish ? 7 : 6;
          Object.assign(T, { topple: 1, bodyY: -1.2, headDrop: 3, fore: [1.3, -0.4], hind: [1.2, -0.4], jaw: Math.sin(this.st * 3) > 0 ? 1 : 0, glow: 0.3 });
          if (this.st > dur) { Object.assign(T, { topple: 0 }); this.enter('stalk'); this.cool = 1; this.mountFinish = false; EW.audio.sfx('growl'); }
          break;
        }
        case 'mounted': {
          if (!this.mount) { this.enter('stalk'); break; }
          this.tickMount(dt, this.mount.rider || local, T);
          if (!this.mount) break;
          move = 6 * limp; turn = 1.6; tgt = this.mount.wander;
          break;
        }
        case 'dead': {
          const k = smooth(this.st / 2.2);
          Object.assign(T, { topple: k, bodyY: -1.6 * k, headDrop: 6 * k + 1, fore: [1.3 * k, -0.4 * k], hind: [1.2 * k, -0.4 * k], glow: Math.max(0, 0.6 - this.st * 0.15), jaw: 0 });
          if (this.st > 0.4 && this.st < 0.5) EW.cam.shake(0.3);
          if (this.st > 2.1 && !this.thud) { this.thud = true; EW.audio.sfx('stomp'); EW.cam.shake(0.7); E.dust(this.x, this.y, this.z, 40, 12); }
          break;
        }
      }
      // turning + locomotion
      if (tgt && turn) { const d = wrap(Math.atan2(-(tgt.z - this.z), tgt.x - this.x) - this.yaw); this.yaw += clamp(d, -turn * dt, turn * dt); }
      if (move && !this.locomote(move * dt) && this.mount) this.mount.wander = this.wanderPoint();
      if (move) a.walk += dt * Math.abs(move) * 0.55;
      // pose blending
      const k = Math.min(1, dt * (this.state === 'attack' ? 10 : 5));
      for (const key of ['bodyY', 'pitch', 'headDrop', 'jaw', 'tail', 'topple', 'plateOpen', 'glow']) a[key] = lerp(a[key], T[key], key === 'topple' ? Math.min(1, dt * 3) : k);
      for (let i = 0; i < 2; i++) { a.fore[i] = lerp(a.fore[i], T.fore[i], k); a.hind[i] = lerp(a.hind[i], T.hind[i], k); }
      // vertical (leap) — a leap cut short mid-air (flinch, topple, exhaustion…) must still come down
      if (!(this.attack && this.attack.name === 'leap' && this.attack.phase === 1) && this.air > 0) this.air = Math.max(0, this.air - dt * 26);
      this.y = this.ground() + this.air;
      // footsteps
      if (move && this.state !== 'mounted') { const ph = Math.floor(a.walk * 2 / Math.PI); if (ph !== this.lastStep) { this.lastStep = ph; this.footstep(); } }
      this.tickPatches(dt, local);
      if (Math.random() < dt * (this.phase === 2 ? 6 : 3) && this.state !== 'dead') { const sp = this.toWorld((Math.random() - 0.5) * 18, 8 + Math.random() * 5 + a.bodyY, (Math.random() - 0.5) * 6); E.burst(sp.x, sp.y, sp.z, this.col.spark, 1, 0.6, { size: [0.15, 0.3], up: [1, 3], grav: -1, life: [0.8, 1.4] }); }
      this.render();
    }
    locomote(step) {
      const f = this.fwd, nx = this.x + f.x * step, nz = this.z + f.z * step;
      const r = Math.hypot(nx, nz);
      const W = EW.world;
      const lead = Math.sign(step) * 9, hx = nx + f.x * lead, hz = nz + f.z * lead;
      let moved = false;
      if ((W.open ? W.open(nx, nz) > 0.5 && W.open(hx, hz) > 0.3 : r < 84) && W.heightAt(nx, nz) < W.heightAt(this.x, this.z) + 3) { this.x = nx; this.z = nz; moved = true; }
      // shove around pillars (the boss is too heavy to be stopped by props)
      for (const p of EW.world.pillars) { if (p.broken) continue; const dx = this.x - p.x, dz = this.z - p.z, d = Math.hypot(dx, dz), m = p.r + 4; if (d < m && d > 0.01) { this.x = p.x + (dx / d) * m; this.z = p.z + (dz / d) * m; } }
      return moved;
    }
    footstep() {
      const w = this.toWorld(7, 0, 0, true);
      EW.audio.sfx('stomp', { vol: 0.35 }); E.dust(w.x, EW.world.heightAt(w.x, w.z), w.z, 3, 3);
      const p = EW.hunt && EW.hunt.player; if (p && Math.hypot(p.x - this.x, p.z - this.z) < 30) EW.cam.shake(0.08);
    }

    // ------------------------------------------------------------------ attacks
    chooseAttack(p, pd, ang) {
      const ph2 = this.phase === 2, A2 = Math.abs(ang), list = [];
      const add = (n, w) => list.push([n, w]);
      if (this.roarCd <= 0 && pd < 20 && Math.random() < 0.15) add('roar', 2);
      if (A2 < 0.9 && pd < 14) add('swipe', 5);
      if (A2 < 0.8 && pd < 12 && !this.parts.forelegs.broken) add('stomp', 4);
      if (A2 > 1.6 && pd < 24) add('tail', 7);
      if (A2 > 0.9 && A2 <= 1.6 && pd < 18) add('tail', 3);
      if (A2 < 0.7 && pd > 13 && pd < 50) add('charge', 4);
      if (ph2 && A2 < 0.7 && pd < 20) add('breath', 4);
      if (ph2 && pd > 9 && pd < 40) add('leap', 3);
      if (ph2 && !this.parts.plates.broken && pd < 18 && Math.random() < 0.4) add('vent', 3);
      if (!list.length) return null;
      const tot = list.reduce((s, [, w]) => s + w, 0); let r = Math.random() * tot;
      for (const [n, w] of list) { r -= w; if (r <= 0) return n; }
      return list[0][0];
    }
    startAttack(name) {
      const cost = { swipe: 8, stomp: 12, tail: 10, charge: 18, breath: 16, leap: 18, vent: 14, roar: 4, hurl: 12, quake: 16 }[name];
      this.stamina -= cost;
      this.attack = { name, t: 0, hit: false, phase: 0 };
      this.state = 'attack'; this.st = 0;
      if (name === 'charge') { this.attack.dist = this.parts.horns.broken ? 22 : 40; this.attack.speed = this.parts.horns.broken ? 16 : 20; }
    }
    endAttack() {
      this.clearDecals();
      this.attack = null; this.cool = (this.phase === 2 ? 0.7 : 1.1) + Math.random() * 0.9;
      if (this.stamina <= 0) this.enter('exhausted'); else this.enter('stalk');
    }
    clearDecals() { for (const d of Object.values(this.decals)) d.material.opacity = 0; }
    hitPlayer(p, hit) {
      const go = () => p.receive(Object.assign({ src: { x: this.x, z: this.z } }, hit));
      const r = EW.net ? EW.net.quiet(go) : go();
      if (r === 'dodged' && !p.remote) EW.hud && EW.hud.flash('dodge');
      return r;
    }
    decalCircle(x, z, r, op, which = 'circle') { const d = this.decals[which]; d.position.set(x, EW.world.heightAt(x, z) + 0.2, z); d.scale.set(r, 1, r); d.material.opacity = op; }
    tickAttack(dt, p, T) {
      const at = this.attack, s = (this.phase === 2 ? 1.15 : 1) * this.pace, all = this.hs || [p];
      const once = (q) => { const hs = at.hs || (at.hs = new Set()); if (hs.has(q)) return false; hs.add(q); return true; };
      at.t += dt * s; const t = at.t;
      at.move = 0; at.turn = 0;
      const pd = this.dist(p);
      switch (at.name) {
        case 'swipe': {
          if (t < 0.8) { T.headDrop = -1.5; T.pitch = -0.06; T.jaw = 1; at.turn = 1.0; if (t > 0.3) this.headGlint(); }
          else if (t < 1.15) { T.headDrop = 4.5; T.jaw = 1; if (!at.hit && t > 0.85) { at.hit = true; EW.audio.sfx('swingHeavy', { vol: 1 }); for (const q of all) this.sectorHit(q, 13, 0, 1.05, { dmg: 22, knock: 9 }); const h = this.headWorld(); E.dust(h.x, EW.world.heightAt(h.x, h.z), h.z, 6, 4); } }
          else if (t < 2.1) { T.headDrop = 2.5; }
          else this.endAttack();
          break;
        }
        case 'stomp': {
          const foot = this.toWorld(9, 0, 0, true);
          if (t < 1.0) { T.fore = [-0.8 * smooth(t / 0.8), -0.6 * smooth(t / 0.8)]; T.pitch = -0.18; T.bodyY = 0.8; T.headDrop = -2; at.turn = 0.8; this.decalCircle(foot.x, foot.z, 6.5, 0.12 + t * 0.3); }
          else if (t < 1.1) { T.fore = [0.15, 0.15]; T.pitch = 0.08; T.bodyY = -0.6;
            if (!at.hit) { at.hit = true; this.clearDecals(); EW.audio.sfx('stomp', { vol: 1 }); EW.cam.shake(0.7); E.dust(foot.x, EW.world.heightAt(foot.x, foot.z), foot.z, 22, 7); E.ring(foot.x, foot.z, EW.world.heightAt(foot.x, foot.z), 1, 9, 0.5, 0xd8b890);
              for (const q of all) if (Math.hypot(q.x - foot.x, q.z - foot.z) < 7 && q.y - EW.world.heightAt(q.x, q.z) < 1.5) this.hitPlayer(q, { dmg: 30, knock: 12, src: foot }); } }
          else if (t < 2.2) { T.bodyY = -0.4; T.headDrop = 1; }
          else this.endAttack();
          break;
        }
        case 'tail': {
          const side = at.side || (at.side = this.angleTo(p.x, p.z) > 0 ? 1 : -1);
          if (t < 0.9) { T.tail = -side * 0.5 * smooth(t / 0.9); T.headDrop = 1; T.bodyY = -0.3; if (t > 0.5) this.headGlint(); }
          else if (t < 1.45) {
            const k = (t - 0.9) / 0.55;
            this.yaw += side * 3.2 * dt * s; T.tail = side * 0.9 * Math.sin(k * Math.PI);
            if (!at.sfx) { at.sfx = true; EW.audio.sfx('swingHeavy', { vol: 1 }); }
            const len = this.parts.tail.broken ? 15 : 24;
            const root = this.toWorld(-8, 0, 0, true), tip = this.toWorld(-len, 0, 0, true);
            for (const q of all) if (segDist(q.x, q.z, root.x, root.z, tip.x, tip.z) < 3.8 && q.y - EW.world.heightAt(q.x, q.z) < 2.5 && once(q)) this.hitPlayer(q, { dmg: this.parts.tail.broken ? 16 : 26, knock: 12, src: { x: root.x, z: root.z } });
            if (Math.random() < 0.5) E.dust(tip.x, EW.world.heightAt(tip.x, tip.z), tip.z, 1, 2);
          } else if (t < 2.4) T.tail = 0;
          else this.endAttack();
          break;
        }
        case 'charge': {
          if (at.phase === 0) {
            T.headDrop = 3.5; T.bodyY = -0.8; T.pitch = 0.1; at.turn = 2.0;
            if (t > 0.4 && !at.scrape) { at.scrape = true; EW.audio.sfx('growl'); }
            const f = this.fwd, h = this.toWorld(12, 0, 0, true);
            this.decals.lane.position.set(h.x, EW.world.heightAt(h.x, h.z) + 0.25, h.z); this.decals.lane.rotation.y = this.yaw; this.decals.lane.scale.set(at.dist - 6, 1, 6); this.decals.lane.material.opacity = 0.08 + smooth(t / 1.2) * 0.22;
            if (Math.random() < 0.3) { const fo = this.toWorld(8, 0, 3, true); E.dust(fo.x, EW.world.heightAt(fo.x, fo.z), fo.z, 1, 2); }
            if (t > 1.2) { at.phase = 1; at.run = 0; EW.audio.sfx('roar', { vol: 0.6 }); this.clearDecals(); }
          } else if (at.phase === 1) {
            T.headDrop = 4; T.bodyY = -0.6;
            const step = at.speed * dt * s; at.run += step;
            const ok = this.locomoteCharge(step);
            this.a.walk += dt * 5;
            const h = this.toWorld(14, 0, 0, true);
            if (Math.random() < 0.7) E.dust(this.x, this.y, this.z, 1, 4);
            for (const q of all) {
              const air = q.y - EW.world.heightAt(q.x, q.z);
              if (Math.hypot(q.x - h.x, q.z - h.z) < 5 && air < 3) { if (once(q)) this.hitPlayer(q, { dmg: this.parts.horns.broken ? 25 : 35, knock: 15, src: { x: this.x, z: this.z } }); continue; }
              const L = this.toLocal(q.x, q.z); if (L.x > -8 && L.x < 12 && Math.abs(L.z) < 4.5 && air < 3 && once(q)) this.hitPlayer(q, { dmg: 22, knock: 12, src: { x: this.x, z: this.z } });
            }
            const pil = EW.world.pillars.find((q) => !q.broken && Math.hypot(q.x - h.x, q.z - h.z) < q.r + 3.5);
            if (pil) {
              pil.break(); pil.collider.off = true;
              EW.hunt && EW.hunt.onPillar();
              this.takeHit('plates', 90, { breakMul: 1.4, stagger: 0 }); this.takeHit('head', 50, {});
              if (this.state !== 'dead') this.enter('stun');
              return;
            }
            if (!ok || at.run > at.dist) { at.phase = 2; at.t = 0; }
            if (Math.floor(at.run / 4) !== at.lastStep) { at.lastStep = Math.floor(at.run / 4); EW.audio.sfx('stomp', { vol: 0.45 }); EW.cam.shake(0.06); }
          } else {
            T.headDrop = 1; T.bodyY = -0.3; const sk = Math.max(0, 1 - at.t * 1.5) * at.speed * 0.5; this.locomoteCharge(sk * dt);
            if (Math.random() < 0.6) E.dust(this.x, this.y, this.z, 1, 5);
            if (at.t > 1.4) this.endAttack();
          }
          break;
        }
        case 'breath': {
          const h = this.headWorld(), f = this.fwd;
          if (t < 1.2) { T.headDrop = -3; T.pitch = -0.15; T.jaw = 1; at.turn = 0.9; this.mouthGlow.material.opacity = smooth(t / 1.2) * 0.95; if (Math.random() < 0.5) E.burst(h.x + f.x * 4, h.y - 1, h.z + f.z * 4, 0xffa040, 1, 0.8, { size: [0.2, 0.4], up: [0.5, 1.5], grav: -2 });
            this.decals.cone.position.set(h.x - f.x * 3, EW.world.heightAt(h.x, h.z) + 0.25, h.z - f.z * 3); this.decals.cone.rotation.y = this.yaw; this.decals.cone.scale.set(20, 1, 20); this.decals.cone.material.opacity = 0.05 + smooth(t / 1.2) * 0.15; }
          else if (t < 2.8) {
            T.headDrop = 2; T.jaw = 1; this.mouthGlow.material.opacity = 1; this.decals.cone.material.opacity = 0;
            const sweep = Math.sin((t - 1.2) * 2.4) * 0.35; this.yaw += sweep * dt * 0.8;
            if (!at.sfx) { at.sfx = true; EW.audio.sfx('breath'); }
            const mouth = this.toWorld(19, 0, 0, true); const my = h.y - 1.5;
            this.breathStream(mouth, my, dt);
            at.tick = (at.tick || 0) - dt;
            if (at.tick <= 0) {
              at.tick = 0.25;
              for (const q of all) { const L = this.toLocal(q.x, q.z), dd = Math.hypot(L.x - 17, L.z), an = Math.atan2(L.z, L.x - 15);
                if (L.x > 14 && dd < 20 && Math.abs(an) < 0.62) this.hitPlayer(q, { dmg: 9, knock: 3, fire: true, src: mouth }); }
              for (const c of EW.world.crystals) { const Lc = this.toLocal(c.x, c.z); if (c.state === 'idle' && Lc.x > 14 && Math.hypot(Lc.x - 17, Lc.z) < 18 && Math.abs(Math.atan2(Lc.z, Lc.x - 15)) < 0.62) EW.world.igniteCrystal(c); }
            }
            if (!at.patched && t > 2.2) { at.patched = true; [8, 13, 17].forEach((d, i) => { const w = this.toWorld(15 + d, 0, (i - 1) * 2.5, true); this.addPatch(w.x, w.z); }); }
          } else if (t < 3.8) { T.headDrop = 1; this.mouthGlow.material.opacity = Math.max(0, 1 - (t - 2.8) * 2); }
          else { this.mouthGlow.material.opacity = 0; this.endAttack(); }
          break;
        }
        case 'leap': {
          if (at.phase === 0) {
            T.bodyY = -1.8; T.headDrop = 1; T.fore = [0.3, 0.3]; T.hind = [0.4, 0.4]; at.turn = 2.2;
            if (t > 0.8) {
              at.phase = 1; at.t = 0; at.from = { x: this.x, z: this.z };
              const lead = 0.4; let tx = p.x + (p.x - (at.lastP ? at.lastP.x : p.x)) * lead, tz = p.z;
              const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz), back = Math.min(d, Math.max(0, d - 4));
              at.to = { x: this.x + (dx / (d || 1)) * back, z: this.z + (dz / (d || 1)) * back };
              const rr = Math.hypot(at.to.x, at.to.z); if (rr > 80) { at.to.x *= 80 / rr; at.to.z *= 80 / rr; }
              EW.audio.sfx('roar', { vol: 0.5 }); E.dust(this.x, this.y, this.z, 16, 7); EW.cam.shake(0.3);
            }
          } else if (at.phase === 1) {
            const k = Math.min(1, at.t / 1.1);
            this.x = lerp(at.from.x, at.to.x, smooth(k)); this.z = lerp(at.from.z, at.to.z, smooth(k));
            this.air = Math.sin(k * Math.PI) * 13;
            T.fore = [-0.6, -0.6]; T.hind = [0.8, 0.8]; T.pitch = k < 0.5 ? -0.2 : 0.2; T.headDrop = -1;
            this.decalCircle(at.to.x, at.to.z, 9, 0.1 + k * 0.35);
            if (k >= 1) {
              at.phase = 2; at.t = 0; this.air = 0; this.clearDecals();
              EW.audio.sfx('explosion', { vol: 0.8 }); EW.audio.sfx('stomp'); EW.cam.shake(0.9);
              E.dust(this.x, this.y, this.z, 40, 12); E.ring(this.x, this.z, EW.world.heightAt(this.x, this.z), 4, 18, 0.65, 0xffa060);
              for (const q of all) if (this.dist(q) < 9.5 && once(q)) this.hitPlayer(q, { dmg: 34, knock: 14 });
              at.wave = 9;
            }
          } else {
            T.bodyY = -1; T.headDrop = 2;
            if (at.wave != null && at.wave < 18) {
              const prev = at.wave; at.wave += dt * 18;
              for (const q of all) { const qd = this.dist(q); if (qd > prev && qd <= at.wave + 0.5 && q.y - EW.world.heightAt(q.x, q.z) < 0.8 && once(q)) this.hitPlayer(q, { dmg: 16, knock: 6, tremor: true }); }
            }
            if (at.t > 1.4) this.endAttack();
          }
          at.lastP = { x: p.x, z: p.z };
          break;
        }
        case 'vent': {
          if (t < 2.6) {
            T.plateOpen = 1; T.bodyY = -0.6; T.headDrop = 2; T.glow = 1.4;
            this.coreGlow.material.opacity = 0.4 + smooth(t / 2.6) * 0.6;
            this.decalCircle(this.x, this.z, 11, 0.06 + smooth(t / 2.6) * 0.26);
            if (Math.random() < 0.6) { const c = this.toWorld(0, 13 + this.a.bodyY, 0); E.burst(c.x, c.y, c.z, 0xff9a40, 2, 1.5, { size: [0.3, 0.7], up: [2, 6], grav: -1 }); }
            if (!at.sfx) { at.sfx = true; EW.audio.sfx('charge', { vol: 1, level: 3 }); EW.hud && EW.hud.notice('boss.vent', 'warn'); }
            if ((at.interrupt || 0) >= 140) { this.coreGlow.material.opacity = 0; this.clearDecals(); this.stagger += 200; EW.hud && EW.hud.notice('boss.ventBroken', 'good'); this.takeHit('plates', 60, {}); this.attack = null; this.enter('topple'); return; }
          } else if (t < 2.75) {
            if (!at.hit) { at.hit = true; this.clearDecals(); EW.audio.sfx('explosion'); EW.cam.shake(0.8); E.burst(this.x, this.y + 10, this.z, 0xff7a20, 60, 16, { size: [0.5, 1.4], up: [2, 12] }); E.ring(this.x, this.z, this.y, 3, 12, 0.5, 0xff8a30); for (const q of all) if (this.dist(q) < 11.5) this.hitPlayer(q, { dmg: 40, knock: 14, fire: true }); }
          } else if (t < 3.8) { T.plateOpen = 0; this.coreGlow.material.opacity = Math.max(0, 1 - (t - 2.75) * 2); }
          else { this.coreGlow.material.opacity = 0; this.endAttack(); }
          break;
        }
        case 'roar': {
          if (t < 0.6) { T.headDrop = 0.5; T.pitch = 0.05; }
          else if (t < 2.4) { T.headDrop = -3.5; T.pitch = -0.15; T.jaw = 1; if (!at.hit) { at.hit = true; this.roar(p, false); this.roarCd = 30; } }
          else this.endAttack();
          break;
        }
        default: this.tickExtra(at, t, dt, p, T, all, once);
      }
    }
    tickExtra() { this.endAttack(); }
    roar(p, intro) {
      EW.audio.sfx('roar', { vol: 1 }); EW.cam.shake(intro ? 0.9 : 0.7);
      const h = this.headWorld(); E.ring(h.x, h.z, EW.world.heightAt(h.x, h.z), 2, 22, 0.8, 0xffe0c0);
      if (!intro) for (const q of this.hs || [p]) if (this.dist(q) < 17) this.hitPlayer(q, { roar: true, dmg: 0 });
    }
    headGlint() { if (Math.random() < 0.2) { const h = this.headWorld(); E.burst(h.x, h.y + 1, h.z, 0xffc060, 1, 0.4, { size: [0.4, 0.8], life: [0.2, 0.3], up: [0, 0.4], grav: 0 }); } }
    sectorHit(p, r, rMin, half, hit) {
      const L = this.toLocal(p.x, p.z), base = 6, dd = Math.hypot(L.x - base, L.z), an = Math.atan2(L.z, L.x - base);
      if (L.x > base - 1 && dd < r && dd > rMin && Math.abs(an) < half && p.y - EW.world.heightAt(p.x, p.z) < 4) return this.hitPlayer(p, hit);
      return null;
    }
    locomoteCharge(step) {
      const f = this.fwd, nx = this.x + f.x * step, nz = this.z + f.z * step;
      if (Math.hypot(nx, nz) > 84 || EW.world.heightAt(nx + f.x * 10, nz + f.z * 10) > EW.world.heightAt(this.x, this.z) + 4) return false;
      this.x = nx; this.z = nz; return true;
    }
    breathStream(mouth, my, dt) {
      // dense fire stream particles shot along the facing
      const f = this.fwd;
      for (let i = 0; i < 3; i++) {
        const sp = 16 + Math.random() * 6, sw = (Math.random() - 0.5) * 0.5, c = Math.cos(sw), s = Math.sin(sw);
        const vx = (f.x * c - f.z * s) * sp, vz = (f.x * s + f.z * c) * sp;
        EW.combat.fireParticle(mouth.x, my, mouth.z, vx, -3 - Math.random() * 3, vz);
      }
    }
    addPatch(x, z) {
      if (EW.net && EW.net.isHost && EW.net.party()) EW.net.send({ t: 'pa', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
      const g = E.glow(0xff6a1a, 6, 0.75); g.position.set(x, EW.world.heightAt(x, z) + 0.6, z); E.fxGroup.add(g);
      this.patches.push({ x, z, r: 2.8, t: 7, g, tick: 0 });
    }
    tickPatches(dt, p) {
      for (let i = this.patches.length - 1; i >= 0; i--) {
        const q = this.patches[i]; q.t -= dt; q.g.material.opacity = Math.min(0.75, q.t / 2) * (0.85 + Math.sin(E.time * 12 + i) * 0.15);
        if (Math.random() < dt * 8) E.burst(q.x + (Math.random() - 0.5) * 3, EW.world.heightAt(q.x, q.z) + 0.3, q.z + (Math.random() - 0.5) * 3, 0xff8a2a, 1, 0.5, { size: [0.2, 0.5], up: [1, 3], grav: -1, life: [0.4, 0.8] });
        q.tick -= dt;
        if (q.tick <= 0 && Math.hypot(p.x - q.x, p.z - q.z) < q.r && p.y - EW.world.heightAt(p.x, p.z) < 0.5) { q.tick = 0.5; p.receive({ dmg: 5, fire: true, chip: true, unblockable: true, src: q }); }
        if (q.t <= 0) { E.fxGroup.remove(q.g); E.billboards.delete(q.g); this.patches.splice(i, 1); }
      }
    }

    // ------------------------------------------------------------------ mounting
    plungeOk(p) {
      if (['dormant', 'intro', 'dead', 'mounted'].includes(this.state) || this.air > 1 || !this.canMount()) return false;
      const L = this.toLocal(p.x, p.z);
      const top = this.y + 6 + this.a.bodyY;
      return L.x > -10 && L.x < 11 && Math.abs(L.z) < 6.5 && p.y < top + 6 && p.y > this.y + 3 && p.y - EW.world.heightAt(p.x, p.z) > 2.5;
    }
    tryPlunge(p) {
      if (!this.plungeOk(p)) return false;
      this.plungeLand(p, true);
      return true;
    }
    // plunge strike lands on the back
    plungeLand(p, local) {
      const sp = this.spheres().filter((s) => s.part === 'plates' || s.part === 'core');
      const part = sp.some((s) => s.part === 'core') ? 'core' : 'plates';
      const dmg = EW.weaponDamage(p.kind, { dmg: 42 }, part, this.parts[part].hz + 0.4, {});
      const r = this.takeHit(part, dmg, { breakMul: 1.2, stagger: 20 });
      if (r && local) EW.hud && EW.hud.dmg(p.x, p.y + 1, p.z, r.dmg, true);
      EW.audio.sfx('hitHeavy'); EW.cam.shake(0.4); if (local) EW.combat.hitstop(0.1);
      if (this.state !== 'dead') this.startMount(p);
    }
    // host: a guest asks to get on (plunge / climb). Only one rider - anyone else is put back down.
    remoteMount(q, how) {
      const okState = how === 'climb' ? this.state === 'topple' : !['dormant', 'intro', 'dead', 'mounted'].includes(this.state) && this.air <= 1;
      if (!q) return;
      if (this.mount || !this.canMount() || !okState) { const side = this.toWorld(0, 0, 9, true); EW.net.send({ t: 'dm', th: 0, x: side.x, z: side.z }, q.id); return; }
      if (how === 'plunge') this.plungeLand(q, false); else this.startMount(q);
    }
    startMount(p) {
      this.attack = null; this.clearDecals(); this.air = 0;
      this.mount = { meter: 0, next: 1.6, tele: 0, thrash: 0, wander: { x: this.x, z: this.z }, fails: 0, rider: p };
      this.enter('mounted');
      if (p.remote) EW.net.send({ t: 'mt' }, p.id);
      else { p.setState('mounted'); p.vy = 0; EW.audio.sfx('mount'); EW.hud && EW.hud.notice('mount.on', 'good'); EW.hunt && EW.hunt.onMount(p); }
    }
    // a point to thrash toward while ridden: somewhere open in the basin it stands in
    wanderPoint() {
      const W = EW.world, zn = W.zoneAt && W.zoneAt(this.x, this.z);
      for (let i = 0; i < 12; i++) {
        const an = Math.random() * TAU, r = 14 + Math.random() * 26;
        const x = (zn ? zn.x : this.x) + Math.cos(an) * Math.min(r, zn ? zn.r * 0.55 : r), z = (zn ? zn.z : this.z) + Math.sin(an) * Math.min(r, zn ? zn.r * 0.55 : r);
        if (!W.open || W.open(x, z) > 0.85) return { x, z };
      }
      return zn ? { x: zn.x, z: zn.z } : { x: this.x, z: this.z };
    }
    canMount() { return !this.mount && !this.mountFinish && E.time >= (this.mountCd || 0); }
    climb(p) { if (this.state === 'dead' || !this.canMount()) return; if (this.state === 'topple') this.startMount(p); }
    tickMount(dt, p, T) {
      const m = this.mount;
      T.headDrop = 1; T.bodyY = -0.2;
      m.next -= dt;
      if (Math.hypot(m.wander.x - this.x, m.wander.z - this.z) < 6 || Math.random() < dt * 0.3) m.wander = this.wanderPoint();
      if (m.tele > 0) {
        m.tele -= dt; T.headDrop = -2; T.jaw = 1;
        if (m.tele <= 0) { m.thrash = 0.7; this.thrashing = true; EW.audio.sfx('thrash'); EW.cam.shake(0.5); }
      } else if (m.thrash > 0) {
        m.thrash -= dt; T.pitch = Math.sin(E.time * 22) * 0.12; T.bodyY = Math.sin(E.time * 18) * 0.6;
        // a guest's brace arrives ~0.1 s late: give them a slightly later check
        if (!p.braced && m.thrash < (p.remote ? 0.45 : 0.55)) { this.thrashing = false; this.endMount(true); return; }
        if (m.thrash <= 0) { this.thrashing = false; m.next = 1.4 + Math.random() * 1.4; if (!p.remote) EW.hud && EW.hud.flash('braced'); }
      } else if (m.next <= 0) { m.tele = 0.75; if (!p.remote) EW.hud && EW.hud.notice('mount.brace', 'warn'); EW.audio.sfx('growl', { vol: 1 }); }
    }
    mountStab(p) {
      if (!this.mount) return;
      const m = this.mount;
      const part = this.parts.plates.broken ? 'core' : 'plates';
      const dmg = EW.weaponDamage(p.kind, { dmg: 16 }, part, 0.8, {});
      const r = this.takeHit(part, dmg, { breakMul: 1 });
      if (!this.mount) return; // died or ended
      m.meter += { greatsword: 11, spear: 9, dual: 8 }[p.kind] * (m.thrash > 0 ? 0 : 1);
      if (!p.remote) { EW.audio.sfx('hit', { vol: 0.8 }); E.burst(p.x, p.y, p.z, 0xffa040, 8, 4, { size: [0.15, 0.4] }); if (r) EW.hud && EW.hud.dmg(p.x, p.y + 0.5, p.z, r.dmg, part === 'core'); }
      if (m.meter >= 100) {
        const fin = EW.weaponDamage(p.kind, { dmg: 120 }, part, 1.2, {});
        const rr = this.takeHit(part, fin, { breakMul: 1.5 });
        if (rr && !p.remote) EW.hud && EW.hud.dmg(p.x, p.y + 1, p.z, rr.dmg, true);
        EW.audio.sfx('hitHeavy'); EW.cam.shake(0.7); if (!p.remote) EW.combat.hitstop(0.18);
        E.burst(p.x, p.y, p.z, 0xffc060, 40, 10, { size: [0.3, 0.9], up: [3, 10] });
        EW.hud && EW.hud.notice('mount.finish', 'good');
        this.endMount(false);
        if (this.state !== 'dead') { this.mountFinish = true; this.enter('topple'); }
      }
    }
    endMount(thrown) {
      const p = (this.mount && this.mount.rider) || EW.hunt.player; this.mount = null; this.thrashing = false;
      this.mountCd = E.time + 25; // the beast won't let you back on right away
      const side = this.toWorld(0, 0, 9, true);
      if (p.remote) { EW.net.send({ t: 'dm', th: thrown ? 1 : 0, x: side.x, z: side.z }, p.id); if (thrown) { this.enter('stalk'); this.cool = 1.2; } return; }
      p.place(side.x, side.z); p.y = EW.world.heightAt(side.x, side.z);
      if (thrown) { p.setState('down'); p.hp -= 8; EW.audio.sfx('hurt'); EW.hud && EW.hud.notice('mount.thrown', 'warn'); if (p.hp <= 0) p.faint(); this.enter('stalk'); this.cool = 1.2; }
    }

    // ------------------------------------------------------------------ rendering (pixel-art 3D rig)
    render() {
      const a = this.a, bz = this.beast;
      this.root.position.set(this.x, this.y, this.z);
      bz.root.position.set(this.x, this.y, this.z); bz.root.rotation.set(0, this.yaw, 0);
      const moving = this.state === 'stalk' || this.state === 'mounted' || this.state === 'flee' || (this.attack && this.attack.name === 'charge');
      bz.pose(a, { moving, time: E.time, breathe: !moving, coreOpen: this.parts.plates.broken || a.plateOpen > 0.3 });
      // glows sit at the real mouth / core, nudged toward the camera so the body doesn't swallow them
      const cam = E.camera.position, toCam = (p, k) => { const d = new THREE.Vector3().subVectors(cam, p).normalize(); return p.addScaledVector(d, k); };
      const m = toCam(bz.mouthWorld(), 2.5), c = toCam(bz.coreWorld(), 2.5);
      this.mouthGlow.position.set(m.x - this.x, m.y - this.y, m.z - this.z);
      this.coreGlow.position.set(c.x - this.x, c.y - this.y, c.z - this.z);
      if (this.parts.plates.broken && this.state !== 'dead') this.coreGlow.material.opacity = Math.max(this.coreGlow.material.opacity, 0.45 + Math.sin(E.time * 4) * 0.15);
      // tint: area light, hit flash, enrage warmth, death fade
      const fl = this.flash > 0 ? 1.7 : 1, dead = this.state === 'dead' ? Math.max(0.55, 1 - this.st * 0.1) : 1;
      bz.U.tint.value.setRGB(E.tint.r * fl * dead * (this.phase === 2 ? 1.06 : 1), E.tint.g * fl * dead * (this.phase === 2 ? 0.94 : 1), E.tint.b * fl * dead * (this.phase === 2 ? 0.9 : 1));
      const fog = E.scene.fog;
      if (fog) { bz.U.fogColor.value.copy(fog.color); bz.U.fogNear.value = fog.near; bz.U.fogFar.value = fog.far; }
      this.shadow.position.y = -this.air + 0.08; this.shadow.scale.set(26 * (1 - this.air / 30), 1, 26 * 0.45 * (1 - this.air / 30));
      this.shadow.rotation.y = this.yaw;
    }
    // data used by the camera + HUD
    frame() { return { x: this.x, y: this.y, z: this.z, height: this.height, engaged: this.engaged && this.state !== 'dead' && !this.lost }; }
  }
  // ------------------------------------------------------------------ co-op guest: a replica of the host's beast
  // No AI here: pose, position, state and telegraphs come from the host's snapshots (~10/s) and are eased in.
  // Hits, plunges, climbs and stabs are sent to the host, which decides. Fire patches hurt only the local hunter.
  Gravemaw.prototype.makeReplica = function () {
    const N = EW.net, b = this;
    b.replica = true; b.snap = null; b.kt = 0;
    const A_KEYS = ['bodyY', 'pitch', 'headDrop', 'jaw', 'tail', 'topple', 'plateOpen', 'glow', 'walk'];
    b.applySnap = (s) => {
      const first = !b.snap; b.snap = s;
      if (first) { [b.x, b.y, b.z, b.yaw, b.air] = s.p; }
      if (s.s !== b.state) {
        const was = b.state; b.state = s.s; b.st = 0;
        if (s.s === 'dead') { b.hp = 0; b.clearDecals(); EW.hunt && EW.hunt.onBossDown(); EW.world.interact.push({ id: 'carve', x: b.x, z: b.z, r: 12, y: 6, label: 'prompt.carve', enabled: () => b.st > 2.5 && b.carves < b.carveMax, act: () => { b.carves++; EW.hunt.carve('body'); } }); }
        if (s.s === 'flee') { b.trackDist = 0; b.den = null; EW.hunt && EW.hunt.onBossFlee && EW.hunt.onBossFlee(); }
        if (was === 'dormant' && !b.engaged && s.en) { b.engaged = true; EW.hunt && EW.hunt.onBossWake(); }
      }
      if (s.en && !b.engaged) { b.engaged = true; EW.hunt && EW.hunt.onBossWake(); }
      if (s.ph === 2 && b.phase === 1) { b.phase = 2; if (!b.enrageCut && EW.hunt && EW.hunt.onEnrage()) b.enrageCut = true; }
      b.phase = s.ph; b.hp = s.hp; b.maxHp = s.mx;
      if (s.fl) b.flash = 0.09;
      N.PART_KEYS.forEach((k, i) => { if ((s.pb & (1 << i)) && !b.parts[k].broken) { b.parts[k].broken = true; b.breakFx(k, false); } });
      EW.world.pillars.forEach((q, i) => { if ((s.pl & (1 << i)) && !q.broken) { q.break(); if (q.collider) q.collider.off = true; } });
      if (s.k !== (b.attack ? b.attack.name : '')) b.attack = s.k ? { name: s.k, t: s.kt } : null;
      else if (b.attack) b.attack.t = s.kt;
      N.DECALS.forEach((k, i) => { const d = b.decals[k], v = s.dc[i]; if (!v) { d.material.opacity = 0; return; } d.material.opacity = v[0]; d.position.set(v[1], v[2], v[3]); d.scale.set(v[4], 1, v[5]); d.rotation.y = v[6]; });
      b.mouthGlow.material.opacity = s.g[0]; b.coreGlow.material.opacity = s.g[1];
      b.mc = !!s.mc;
      // the rider
      const m = s.m, me = EW.game.player;
      if (m) {
        const mine = m[0] === N.id;
        if (!b.mount || b.mount.rid !== m[0]) b.mount = { rid: m[0], meter: 0, tele: 0, thrash: 0 };
        const M = b.mount;
        if (mine && m[2] && !M.tele) { EW.hud.notice('mount.brace', 'warn'); }
        if (mine && M.thrash && !m[3] && me.state === 'mounted') EW.hud.flash('braced');
        M.meter = m[1]; M.tele = m[2]; M.thrash = m[3]; b.thrashing = !!m[3];
      } else if (b.mount && !(b.mount.pending && E.time - b.mount.pending < 1.5)) { b.mount = null; b.thrashing = false; }
    };
    b.canMount = () => !!b.mc && !b.mount;
    b.update = (dt, player) => {
      b.st += dt; b.flash = Math.max(0, b.flash - dt);
      const s = b.snap;
      if (s) {
        const k = Math.min(1, dt * 10), a = b.a;
        const far = Math.hypot(s.p[0] - b.x, s.p[2] - b.z) > 12;
        const ox = b.x, oz = b.z;
        b.x = far ? s.p[0] : lerp(b.x, s.p[0], k); b.z = far ? s.p[2] : lerp(b.z, s.p[2], k); b.air = lerp(b.air, s.p[4], k);
        b.yaw += wrap(s.p[3] - b.yaw) * k;
        A_KEYS.forEach((key, i) => { a[key] = key === 'walk' && Math.abs(s.a[i] - a.walk) > 6 ? s.a[i] : lerp(a[key], s.a[i], k); });
        for (let i = 0; i < 2; i++) { a.fore[i] = lerp(a.fore[i], s.a[9 + i], k); a.hind[i] = lerp(a.hind[i], s.a[11 + i], k); }
        // tracks while it runs to another den
        if (b.state === 'flee') { b.trackDist = (b.trackDist || 0) + Math.hypot(b.x - ox, b.z - oz); if (b.trackDist > 5) { b.trackDist = 0; b.den = EW.world.dens && EW.world.dens[s.dn]; if (b.den) b.dropTrack(); } }
        // fire breath stream (pure visuals; the hits come from the host)
        if (b.attack) { b.attack.t += dt * (b.phase === 2 ? 1.15 : 1) * b.pace; if (b.attack.name === 'breath' && b.attack.t > 1.2 && b.attack.t < 2.8) { const h = b.headWorld(); b.breathStream(b.toWorld(19, 0, 0, true), h.y - 1.5, dt); } }
        b.replicaFx && b.replicaFx(dt);
      }
      b.y = b.ground() + b.air;
      b.pd = Math.hypot(player.x - b.x, player.z - b.z);
      b.lost = (b.state === 'flee' || b.state === 'rest') && b.pd > 60;
      if (b.lost && EW.cam.lock) EW.cam.lock = false;
      b.tickTracks(dt, player);
      b.tickPatches(dt, player);
      if (Math.random() < dt * (b.phase === 2 ? 6 : 3) && b.state !== 'dead') { const sp = b.toWorld((Math.random() - 0.5) * 18, 8 + Math.random() * 5 + b.a.bodyY, (Math.random() - 0.5) * 6); E.burst(sp.x, sp.y, sp.z, b.col.spark, 1, 0.6, { size: [0.15, 0.3], up: [1, 3], grav: -1, life: [0.8, 1.4] }); }
      b.render();
    };
    b.takeHit = (part, dmg, opts = {}) => {
      if (b.state === 'dead') return null;
      const P = b.parts[part], core = part === 'core' && b.a.plateOpen > 0.5, d = core ? Math.round(dmg * 1.5) : dmg;
      N.send({ t: 'hit', part, d: dmg, bm: opts.breakMul || 1, sg: opts.stagger || 0 }, 'host');
      b.flash = 0.09;
      return { dmg: d, weak: P.hz * (core ? 1.5 : 1) >= 1, broke: false };
    };
    // getting on: optimistic — ride now, the host confirms ('mt') or puts us back down ('dm')
    const ask = (p, how) => { b.mount = { rid: N.id, meter: 0, tele: 0, thrash: 0, pending: E.time }; N.send({ t: how }, 'host'); p.setState('mounted'); p.vy = 0; EW.audio.sfx('mount'); };
    b.tryPlunge = (p) => { if (!b.plungeOk(p)) return false; EW.audio.sfx('hitHeavy'); EW.cam.shake(0.4); ask(p, 'plunge'); return true; };
    b.climb = (p) => { if (b.state === 'topple' && b.canMount()) ask(p, 'climb'); };
    b.confirmMount = () => { if (b.mount) b.mount.pending = 0; };
    b.mountStab = (p) => { if (!b.mount) return; N.send({ t: 'stab' }, 'host'); EW.audio.sfx('hit', { vol: 0.8 }); E.burst(p.x, p.y, p.z, 0xffa040, 8, 4, { size: [0.15, 0.4] }); };
    b.dismountLocal = (m) => {
      const p = EW.game.player; b.mount = null; b.thrashing = false;
      if (p.state !== 'mounted') return;
      p.place(m.x, m.z); p.y = EW.world.heightAt(m.x, m.z);
      if (m.th) { p.setState('down'); p.hp -= 8; EW.audio.sfx('hurt'); EW.hud && EW.hud.notice('mount.thrown', 'warn'); if (p.hp <= 0) p.faint(); }
    };
    b.enter = (s) => { b.state = s; b.st = 0; };
    b.wake = () => {};
    b.die = () => {};
    return b;
  };
  // host: everything the beast does in these calls is recorded and replayed on the guests
  Gravemaw.prototype.captureForParty = function () {
    for (const k of ['update', 'takeHit', 'mountStab', 'tryPlunge', 'remoteMount', 'climb', 'endMount']) {
      const f = this[k].bind(this);
      this[k] = (...a) => EW.net.capture(() => f(...a));
    }
  };

  // ------------------------------------------------------------------ Cragjaw, the Ridge Breaker
  // Same body plan and riding / part rules as Gravemaw, but a quicker, lighter rock beast: no fire.
  // New: Boulder Hurl (crystal boulders lobbed at marked spots) and Quake (rears up, slams, ground waves —
  // jump or roll the rings; hit the exposed core while it rears to topple it).
  const CRAG_SPHERES = SPHERES.filter((s) => s[0] !== 'horns').concat([['horns', 19.8, 10.2, 0, 2.2]]);
  class Cragjaw extends Gravemaw {
    tune() {
      this.height = 13; this.pace = 1.12;
      this.flinchNeed = 230; this.staggerMax = 290; this.staggerStep = 150;
      this.SPH = CRAG_SPHERES;
      this.col = { mouth: 0xffb040, core: 0xffc050, spark: 0xffc04a };
    }
    chooseAttack(p, pd, ang) {
      const ph2 = this.phase === 2, A2 = Math.abs(ang), list = [];
      const add = (n, w) => list.push([n, w]);
      if (this.roarCd <= 0 && pd < 20 && Math.random() < 0.15) add('roar', 2);
      if (A2 < 0.9 && pd < 14) add('swipe', 5);
      if (A2 < 0.8 && pd < 12 && !this.parts.forelegs.broken) add('stomp', 4);
      if (A2 > 1.6 && pd < 24) add('tail', 7);
      if (A2 > 0.9 && A2 <= 1.6 && pd < 18) add('tail', 3);
      if (A2 < 0.7 && pd > 13 && pd < 50) add('charge', 4);
      if (A2 < 1.1 && pd > 12 && pd < 60) add('hurl', ph2 ? 6 : 4);
      if (ph2 && pd > 9 && pd < 40) add('leap', 3);
      if (ph2 && pd < 22 && Math.random() < 0.45) add('quake', 3);
      if (!list.length) return null;
      const tot = list.reduce((s, [, w]) => s + w, 0); let r = Math.random() * tot;
      for (const [n, w] of list) { r -= w; if (r <= 0) return n; }
      return list[0][0];
    }
    clearDecals() { super.clearDecals(); if (this._bould) this._bould.forEach((g) => { g.visible = false; }); }
    boulders() {
      if (!this._bould) { this._bould = [0, 1, 2].map(() => { const g = this.beast.boulder(); g.visible = false; this.layer.scene.add(g); return g; }); }
      return this._bould;
    }
    // a boulder k (0..1) of the way from `from` to the spot, on an arc
    flyBoulder(g, from, to, k, i) {
      const gy = EW.world.heightAt(to.x, to.z) + 1.2;
      g.visible = k < 1;
      g.position.set(lerp(from.x, to.x, k), lerp(from.y, gy, k) + Math.sin(k * Math.PI) * 7, lerp(from.z, to.z, k));
      g.rotation.set(k * 7 + i, k * 5, k * 3);
    }
    tickExtra(at, t, dt, p, T, all, once) {
      if (at.name === 'hurl') return this.tickHurl(at, t, dt, p, T, all);
      if (at.name === 'quake') return this.tickQuake(at, t, dt, p, T, all);
      this.endAttack();
    }
    tickHurl(at, t, dt, p, T, all) {
      const B = this.boulders();
      if (t < 1.0) {
        T.headDrop = -3.2; T.pitch = -0.16; T.jaw = 1; T.fore = [-0.35, 0.1]; at.turn = 1.6;
        if (t > 0.3) this.headGlint();
        if (t > 0.5 && !at.spots) {
          // main boulder on the target; the next on another hunter (or beside the target); a third when enraged
          const others = all.filter((q) => q !== p && this.dist(q) < 60);
          const near = (q, r) => { const an = Math.random() * TAU; return { x: q.x + Math.cos(an) * r, z: q.z + Math.sin(an) * r }; };
          at.spots = [{ x: p.x, z: p.z }, others.length ? { x: others[0].x, z: others[0].z } : near(p, 7 + Math.random() * 3)];
          if (this.phase === 2) at.spots.push(near(p, 9 + Math.random() * 4));
          EW.audio.sfx('growl', { vol: 0.8 });
        }
        if (at.spots) {
          const op = 0.1 + smooth((t - 0.5) / 0.5) * 0.25;
          this.decalCircle(at.spots[0].x, at.spots[0].z, 4.4, op);
          this.decalCircle(at.spots[1].x, at.spots[1].z, 4.4, op, 'ring');
          if (at.spots[2] && !at.ringed) { at.ringed = true; E.ring(at.spots[2].x, at.spots[2].z, EW.world.heightAt(at.spots[2].x, at.spots[2].z), 4.4, 4.4, 1.6, 0xffb040); }
        }
      } else if (t < 2.0) {
        // the throw: a toss of the head, boulders arc to the marks
        T.headDrop = 3; T.pitch = 0.08; T.jaw = 1;
        if (!at.from) { const m = this.beast.mouthWorld(); at.from = { x: m.x, y: m.y, z: m.z }; EW.audio.sfx('swingHeavy', { vol: 1 }); EW.cam.shake(0.2); }
        const k = (t - 1.0) / 1.0;
        at.spots.forEach((sp, i) => this.flyBoulder(B[i], at.from, sp, k, i));
        this.decals.circle.material.opacity = this.decals.ring.material.opacity = 0.35 + k * 0.2;
      } else if (!at.hit) {
        at.hit = true; this.clearDecals(); B.forEach((g) => { g.visible = false; });
        EW.audio.sfx('explosion', { vol: 0.55 }); EW.audio.sfx('stomp', { vol: 0.9 }); EW.cam.shake(0.5);
        for (const sp of at.spots) {
          const gy = EW.world.heightAt(sp.x, sp.z);
          E.dust(sp.x, gy, sp.z, 16, 6); E.ring(sp.x, sp.z, gy, 1, 6, 0.4, 0xffc060);
          E.burst(sp.x, gy + 1, sp.z, 0xffb040, 14, 7, { size: [0.2, 0.6], up: [3, 8] });
          for (const q of all) if (Math.hypot(q.x - sp.x, q.z - sp.z) < 4.4 && q.y - gy < 2.5 && !(at.hs && at.hs.has(q))) { (at.hs || (at.hs = new Set())).add(q); this.hitPlayer(q, { dmg: 26, knock: 11, src: sp }); }
          for (const c of EW.world.crystals || []) if (c.state === 'idle' && Math.hypot(c.x - sp.x, c.z - sp.z) < 4.5) EW.world.igniteCrystal(c);
        }
      } else if (t < 2.8) { T.headDrop = 1.5; }
      else this.endAttack();
    }
    tickQuake(at, t, dt, p, T, all) {
      if (t < 2.2) {
        // rears up on the hind legs, crystals blazing, core open beneath them
        const k = smooth(t / 1.2);
        T.fore = [-0.9 * k, -0.9 * k]; T.pitch = -0.3 * k; T.bodyY = 1.2 * k; T.headDrop = -2.5; T.jaw = 1; T.plateOpen = 1; T.glow = 1.4;
        this.coreGlow.material.opacity = 0.4 + smooth(t / 2.2) * 0.6;
        this.decalCircle(this.x, this.z, 24, 0.05 + smooth(t / 2.2) * 0.2);
        if (Math.random() < 0.5) { const c = this.toWorld((Math.random() - 0.5) * 12, 13 + this.a.bodyY, (Math.random() - 0.5) * 4); E.burst(c.x, c.y, c.z, 0xffc04a, 2, 1.5, { size: [0.3, 0.7], up: [2, 6], grav: -1 }); }
        if (!at.sfx) { at.sfx = true; EW.audio.sfx('roar', { vol: 0.7 }); EW.audio.sfx('charge', { vol: 1, level: 3 }); EW.hud && EW.hud.notice('boss.quake', 'warn'); }
        if ((at.interrupt || 0) >= 140) { this.coreGlow.material.opacity = 0; this.clearDecals(); this.stagger += 200; EW.hud && EW.hud.notice('boss.quakeBroken', 'good'); this.takeHit('plates', 60, {}); this.attack = null; this.enter('topple'); return; }
      } else if (t < 4.0) {
        // the slam, then two ground waves rolling out — on the ground they hurt; jump or roll through
        T.fore = [0.2, 0.2]; T.pitch = 0.1; T.bodyY = -0.8; T.headDrop = 3; T.plateOpen = 0;
        this.coreGlow.material.opacity = Math.max(0, 1 - (t - 2.2) * 2);
        if (!at.hit) {
          at.hit = true; this.clearDecals();
          const f = this.toWorld(9, 0, 0, true), gy = EW.world.heightAt(f.x, f.z);
          EW.audio.sfx('explosion'); EW.audio.sfx('stomp', { vol: 1 }); EW.cam.shake(0.9);
          E.dust(f.x, gy, f.z, 34, 10); E.burst(f.x, gy + 1, f.z, 0xffb040, 40, 12, { size: [0.3, 0.9], up: [3, 10] });
          for (const q of all) if (Math.hypot(q.x - f.x, q.z - f.z) < 8 && q.y - EW.world.heightAt(q.x, q.z) < 2) this.hitPlayer(q, { dmg: 32, knock: 13, src: f });
          at.waves = [{ r: 4, d: 0, hit: new Set() }, { r: 4, d: 0.5, hit: new Set() }];
          at.c = f;
        }
        for (const w of at.waves) {
          if (w.d > 0) { w.d -= dt; continue; }
          if (!w.rung) { w.rung = true; E.ring(at.c.x, at.c.z, EW.world.heightAt(at.c.x, at.c.z), 4, 26, 1.2, 0xffc060); }
          const prev = w.r; w.r = Math.min(27, w.r + dt * 18);
          for (const q of all) {
            const qd = Math.hypot(q.x - at.c.x, q.z - at.c.z);
            if (qd > prev - 0.5 && qd <= w.r + 0.5 && q.y - EW.world.heightAt(q.x, q.z) < 0.8 && !w.hit.has(q)) { w.hit.add(q); this.hitPlayer(q, { dmg: 18, knock: 6, tremor: true, src: at.c }); }
          }
        }
      } else { this.coreGlow.material.opacity = 0; this.endAttack(); }
    }
    // guests: draw the boulders from the host's marks (decals) and the attack clock
    replicaFx() {
      const at = this.attack, B = this.boulders();
      if (!at || at.name !== 'hurl') { B.forEach((g) => { g.visible = false; }); this.rSpots = null; return; }
      if (at.t < 1.0) { this.rSpots = ['circle', 'ring'].map((k) => this.decals[k]).filter((d) => d.material.opacity > 0.01).map((d) => ({ x: d.position.x, z: d.position.z })); this.rFrom = null; return; }
      if (at.t >= 2.0 || !this.rSpots) { B.forEach((g) => { g.visible = false; }); return; }
      if (!this.rFrom) { const m = this.beast.mouthWorld(); this.rFrom = { x: m.x, y: m.y, z: m.z }; }
      this.rSpots.forEach((sp, i) => this.flyBoulder(B[i], this.rFrom, sp, (at.t - 1.0) / 1.0, i));
    }
  }
  Cragjaw.KEY = 'cragjaw';
  EW.Cragjaw = Cragjaw;

  function segDist(px, pz, ax, az, bx, bz) { const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz; const t = clamp(((px - ax) * vx + (pz - az) * vz) / L, 0, 1); return Math.hypot(px - ax - vx * t, pz - az - vz * t); }
  EW.Gravemaw = Gravemaw;
  EW.BOSSES = { gravemaw: Gravemaw, cragjaw: Cragjaw };
})();
