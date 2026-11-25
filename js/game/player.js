// Player Controller — hunter movement (camera-relative, 360°), stamina, dodge i-frames,
// weapon move execution with procedural weapon animation, guard / counter / blade dance,
// potions, falling + plunge attacks, hit reactions and fainting.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine, A = window.Art;
  const ease = (k) => 1 - Math.pow(1 - k, 3), easeIn = (k) => k * k;
  const lerp = (a, b, t) => a + (b - a) * t;

  // baked pixel-art sheets (js/art/forge.js), one per weapon + armour palette + weapon tier
  // a sheet is a big canvas (tens of MB): keep only the few most recent
  const forged = new Map(), baking = new Map(), KEEP = 3;
  const sheetKey = (kind) => kind + '|' + EW.progress.palette() + '|' + EW.progress.weaponTier(kind);
  const bakeOpts = (kind) => ({ pal: A.HERO_PALETTES[EW.progress.palette()], weapon: kind, tier: EW.progress.weaponTier(kind) });
  const remember = (k, S) => { forged.delete(k); forged.set(k, S); while (forged.size > KEEP) forged.delete(forged.keys().next().value); return S; };
  function forgeSheet(kind) {
    const k = sheetKey(kind);
    if (forged.has(k)) return remember(k, forged.get(k));
    return remember(k, EW.Forge.bake(bakeOpts(kind)));
  }
  // baked in slices (no frozen frame); the shop shows the smith at work meanwhile
  function forgeSheetAsync(kind) {
    const k = sheetKey(kind);
    if (baking.has(k)) return baking.get(k);
    const job = EW.Forge.bakeAsync(bakeOpts(kind));
    job.key = k;
    job.promise = job.promise.then((S) => { baking.delete(k); return remember(k, S); }, (e) => { baking.delete(k); throw e; });
    baking.set(k, job);
    return job;
  }
  // how long it takes to get the weapon off the back and into the hands
  const DRAW = { greatsword: 0.5, spear: 0.38, dual: 0.3 }, SHEATHE = 0.34;
  class Player {
    constructor() {
      this.kind = EW.save.game.weapon;
      this.sprite = new EW.Forge.Sprite(forgeSheet(this.kind));
      this.root = this.sprite.root;
      this.shadow = E.shadow(0.75); this.root.add(this.shadow);
      E.scene.add(this.root);
      this.x = 0; this.y = 0; this.z = 0; this.vy = 0; this.fx = 0; this.fz = -1;
      this.maxHp = 150; this.hp = 150; this.stam = 100; this.maxStam = 100; this.stamDelay = 0;
      this.state = 'move'; this.t = 0; this.walk = 0; this.iframe = false; this.potions = 0;
      this.heal = 0; this.prev = {}; this.buffer = 0; this.skillT = 0; this.danceT = 0; this.kv = { x: 0, z: 0 };
      this.sheathed = false;
      this.setWeapon(EW.save.game.weapon, true);
    }
    // returns null when the sheet was ready (or baked on the spot with sync), else a bake job
    // { promise, progress() } that the UI can show while the hero keeps the old look
    refreshSheet(sync) {
      const k = sheetKey(this.kind);
      if (forged.has(k)) { const S = remember(k, forged.get(k)); if (this.sprite.S !== S) this.sprite.setSheet(S); return null; }
      if (sync) { this.sprite.setSheet(forgeSheet(this.kind)); return null; }
      const job = forgeSheetAsync(this.kind);
      job.promise.then((S) => { if (sheetKey(this.kind) === k && this.sprite.S !== S) this.sprite.setSheet(S); }).catch((e) => console.error(e));
      return job;
    }
    setPalette(sync) { return this.refreshSheet(sync); }
    setWeapon(kind, sync) { this.kind = kind; this.W = EW.WEAPONS[kind]; this.sheathed = false; return this.refreshSheet(sync); }
    place(x, z, yaw = 0) { this.x = x; this.z = z; this.y = EW.world.heightAt(x, z); this.vy = 0; this.fx = -Math.sin(yaw); this.fz = -Math.cos(yaw); this.state = 'move'; this.t = 0; this.root.visible = true; }
    resetVitals() { this.hp = this.maxHp; this.stam = this.maxStam; this.heal = 0; this.state = 'move'; this.iframe = false; }
    get def() { return EW.progress.defense(); }
    useStam(n) { this.stam = Math.max(0, this.stam - n); this.stamDelay = 0.55; }
    pressed(action) { const h = EW.input.held(action); const p = this.prev[action]; this.prev[action] = h; const e = EW.input.takeEdge(action); return (h && !p) || e; }
    released(action) { const h = EW.input.held(action); const p = this.prev[action]; this.prev[action] = h; return !h && p; }
    setState(s) { this.state = s; this.t = 0; }

    // ------------------------------------------------------------------ input-driven update
    update(dt, ctx) {
      const I = EW.input, S = this.sprite;
      this.t += dt;
      const can = ctx.control;
      if (!can) EW.input.edges.clear();
      // edges (always sampled so stale presses don't fire later)
      const atk = can && this.pressed('attack'), atkUp = !EW.input.held('attack');
      const dodge = can && this.pressed('dodge');
      const jump = can && this.pressed('jump');
      const skillDown = can && EW.input.held('skill'), skillP = can && this.pressed('skill');
      const potion = can && this.pressed('potion');
      if (atk) this.buffer = 0.32; else this.buffer = Math.max(0, this.buffer - dt);
      // stamina regen
      this.stamDelay -= dt;
      if (this.stamDelay <= 0 && !['dance', 'stance', 'sprint'].includes(this.state) && !this.sprinting) this.stam = Math.min(this.maxStam, this.stam + 30 * dt);
      // potion heal-over-time
      if (this.heal > 0) { const h = Math.min(this.heal, 50 * dt); this.heal -= h; this.hp = Math.min(this.maxHp, this.hp + h); }

      const mv = can ? I.move() : { x: 0, y: 0, mag: 0 };
      const B = EW.cam.basis();
      let wx = B.rx * mv.x + B.fx * mv.y, wz = B.rz * mv.x + B.fz * mv.y;
      const wl = Math.hypot(wx, wz); if (wl > 1e-3) { wx /= wl; wz /= wl; }
      const lockT = ctx.lockTarget;
      const aimDir = () => { if (wl > 0.2) return [wx, wz]; if (lockT) { const dx = lockT.x - this.x, dz = lockT.z - this.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; } return [this.fx, this.fz]; };
      let speed = 0;
      this.sprinting = false;

      switch (this.state) {
        case 'move': {
          this.iframe = false;
          // sprinting means the weapon goes on the back first (and has to be drawn again before a swing)
          if (!this.sheathed && mv.mag > 0.5 && I.held('sprint') && this.stam > 1 && this.sprite.has('sheathe')) { this.setState('sheathe'); EW.audio.sfx('uiMove', { vol: 0.35 }); speed = 6.2 * Math.min(1, mv.mag); this.fx = lerp(this.fx, wx, Math.min(1, dt * 14)); this.fz = lerp(this.fz, wz, Math.min(1, dt * 14)); break; }
          if (this.sheathed && (this.buffer > 0 || skillP || skillDown)) { this.drawNext = this.buffer > 0 ? 'attack' : null; this.buffer = 0; this.setState('draw'); EW.audio.sfx('swingLight', { vol: 0.35 }); break; }
          if (mv.mag > 0.1) {
            const sprint = this.sheathed && I.held('sprint') && this.stam > 1 && mv.mag > 0.5;
            speed = (sprint ? 9.6 : 6.2) * Math.min(1, mv.mag);
            if (sprint) { this.sprinting = true; this.useStam(18 * dt); this.stamDelay = 0.4; }
            this.fx = lerp(this.fx, wx, Math.min(1, dt * 14)); this.fz = lerp(this.fz, wz, Math.min(1, dt * 14));
          }
          if (dodge && this.stam >= 6) { this.startDodge(wl > 0.2 ? wx : this.fx, wl > 0.2 ? wz : this.fz); break; }
          if (jump && this.y - EW.world.heightAt(this.x, this.z) < 0.2) { this.vy = 11.5; this.y += 0.06; this.setState('fall'); EW.audio.sfx('dodge', { vol: 0.5 }); break; }
          if (potion && this.potions > 0 && this.hp < this.maxHp) { this.potions--; this.setState('drink'); EW.audio.sfx('potion'); break; }
          if (this.buffer > 0) { this.buffer = 0; const [ax, az] = aimDir(); this.fx = ax; this.fz = az; this.startMove(this.firstMove()); break; }
          if (skillP) this.skillT = 0;
          if (skillDown) this.skillT += dt;
          if (this.kind === 'greatsword' && skillDown) { this.setState('guard'); break; }
          if (this.kind === 'dual' && skillDown && this.stam > 8) { this.setState('dance'); this.danceT = 0; EW.audio.sfx('charge', { vol: 0.4 }); break; }
          if (this.kind === 'spear') {
            if (skillDown && this.skillT > 0.22) { this.setState('stance'); EW.audio.sfx('guard', { vol: 0.5 }); break; }
            if (!skillDown && this.skillT > 0 && this.skillT <= 0.22 && this.stam >= 10) { this.skillT = 0; const [ax, az] = aimDir(); this.fx = ax; this.fz = az; this.startMove('high'); break; }
            if (!skillDown) this.skillT = 0;
          }
          break;
        }
        case 'sheathe':
          if (mv.mag > 0.1) { speed = 6.2 * Math.min(1, mv.mag); this.fx = lerp(this.fx, wx, Math.min(1, dt * 14)); this.fz = lerp(this.fz, wz, Math.min(1, dt * 14)); }
          if (dodge && this.stam >= 6) { this.sheathed = true; this.startDodge(wl > 0.2 ? wx : this.fx, wl > 0.2 ? wz : this.fz); break; }
          if (this.t >= SHEATHE) { this.sheathed = true; this.setState('move'); }
          break;
        case 'draw': {
          // drawing is a commitment: slow steps, the attack only starts once the weapon is in hand
          if (mv.mag > 0.1) { speed = 1.6 * Math.min(1, mv.mag); this.fx = lerp(this.fx, wx, dt * 6); this.fz = lerp(this.fz, wz, dt * 6); }
          if (atk) this.drawNext = 'attack';
          if (dodge && this.stam >= 6) { this.startDodge(wl > 0.2 ? wx : this.fx, wl > 0.2 ? wz : this.fz); break; }
          if (this.t >= DRAW[this.kind]) {
            this.sheathed = false; EW.audio.sfx('guard', { vol: 0.25 });
            if (this.drawNext === 'attack') { const [ax, az] = aimDir(); this.fx = ax; this.fz = az; this.setState('move'); this.startMove(this.firstMove()); }
            else this.setState('move');
            this.drawNext = null;
          }
          break;
        }
        case 'attack': speed = this.tickMove(dt, atkUp, dodge, wl > 0.2 ? [wx, wz] : null); break;
        case 'charge': {
          this.charge += dt;
          const lv = this.W.chargeLv.filter((c) => this.charge >= c).length;
          if (lv > this.chargeLv) { this.chargeLv = lv; EW.audio.sfx('charge', { level: lv }); E.burst(this.x, this.y + 2.4, this.z, [0xffffff, 0xffe08a, 0xffa040, 0xff5a20][lv], 10 + lv * 6, 3, { size: [0.15, 0.4], life: [0.3, 0.5], up: [1, 4] }); }
          if (wl > 0.2) { this.fx = lerp(this.fx, wx, dt * 3); this.fz = lerp(this.fz, wz, dt * 3); }
          if (atkUp || this.charge > 2.6) this.startMove('charged', this.W.chargeMul[Math.min(3, this.chargeLv)]);
          else if (dodge && this.stam >= 6) this.startDodge(wl > 0.2 ? wx : this.fx, wl > 0.2 ? wz : this.fz);
          break;
        }
        case 'dodge': speed = this.tickDodge(dt); break;
        case 'guard':
          if (!skillDown) this.setState('move');
          else if (wl > 0.2) { this.fx = lerp(this.fx, wx, dt * 6); this.fz = lerp(this.fz, wz, dt * 6); speed = 1.4 * mv.mag; }
          if (this.buffer > 0) { this.buffer = 0; this.startMove('slash'); }
          break;
        case 'stance':
          this.useStam(7 * dt);
          if (!skillDown || this.stam <= 0) { this.setState('move'); this.skillT = 0; }
          if (wl > 0.2) { this.fx = lerp(this.fx, wx, dt * 6); this.fz = lerp(this.fz, wz, dt * 6); }
          break;
        case 'dance':
          this.useStam(30 * dt);
          this.danceT -= dt;
          if (wl > 0.2) { this.fx = lerp(this.fx, wx, dt * 5); this.fz = lerp(this.fz, wz, dt * 5); speed = 2.6 * mv.mag; }
          if (this.danceT <= 0) { this.danceT = 0.1; this.flipDance = !this.flipDance; EW.combat.swing(this, this.W.moves.dance, {}); EW.audio.sfx('swingLight', { vol: 0.5 }); }
          if (!skillDown || this.stam <= 0) this.setState('move');
          if (dodge && this.stam >= 6) this.startDodge(wl > 0.2 ? wx : this.fx, wl > 0.2 ? wz : this.fz);
          break;
        case 'drink':
          speed = 1.2 * mv.mag;
          if (wl > 0.2) { this.fx = wx; this.fz = wz; }
          if (this.t > 0.35 && !this.drank) { this.drank = true; this.heal += 50; E.burst(this.x, this.y + 1.2, this.z, 0x7aff8a, 12, 1.5, { size: [0.15, 0.35], up: [1, 3], grav: -1 }); }
          if (this.t > 1.0) { this.drank = false; this.setState('move'); }
          break;
        case 'gather': if (this.t > 0.8) this.setState('move'); break;
        case 'hurt': speed = 0; if (this.t > 0.42) this.setState('move'); break;
        case 'down': if (this.t > 1.25) { this.setState('move'); this.iframe = false; } else this.iframe = this.t > 0.6; break;
        case 'stun': if (this.t > 1.3) this.setState('move'); break;
        case 'fall':
        case 'plunge':
          // a click buffered on the take-off frame counts too (it used to be lost to the jump)
          if (this.state === 'fall' && (atk || this.buffer > 0)) { this.buffer = 0; this.sheathed = false; this.setState('plunge'); EW.audio.sfx('swingHeavy'); }
          // never hang in the air: no real fall lasts this long — put the hunter back on the ground
          if (this.t > 4) { this.y = EW.world.heightAt(this.x, this.z); this.vy = 0; this.setState('land'); }
          if (mv.mag > 0.1) { this.fx = lerp(this.fx, wx, dt * 4); this.fz = lerp(this.fz, wz, dt * 4); speed = 4 * mv.mag; }
          break;
        case 'land': if (this.t > 0.35) this.setState('move'); break;
        case 'mounted': this.sheathed = false; this.updateMounted(dt, atk); break;
        case 'faint': break;
        case 'cine': speed = this.autoWalk ? 5.2 : 0; if (this.autoWalk) { this.fx = this.autoWalk[0]; this.fz = this.autoWalk[1]; } break;
      }

      if (this.state !== 'mounted') this.integrate(dt, speed);
      this.animate(dt, speed, ctx);
    }
    firstMove() { return { greatsword: 'slash', spear: 'thrust1', dual: 'd1' }[this.kind]; }

    integrate(dt, speed) {
      const W = EW.world;
      const fl = Math.hypot(this.fx, this.fz) || 1; this.fx /= fl; this.fz /= fl;
      let vx = this.fx * speed + this.kv.x, vz = this.fz * speed + this.kv.z;
      this.kv.x *= Math.pow(0.02, dt); this.kv.z *= Math.pow(0.02, dt);
      if (this.state === 'dodge') { vx = this.dv.x * speed; vz = this.dv.z * speed; }
      const nx = this.x + vx * dt, nz = this.z + vz * dt;
      const pos = { x: nx, z: nz };
      const airborne = this.y > W.heightAt(this.x, this.z) + 0.3;
      if (airborne || W.walkable(this.x, this.z, nx, nz)) { this.x = nx; this.z = nz; }
      else if (W.walkable(this.x, this.z, nx, this.z)) this.x = nx;
      else if (W.walkable(this.x, this.z, this.x, nz)) this.z = nz;
      pos.x = this.x; pos.z = this.z; W.collide(pos, 0.55);
      if (EW.hunt && EW.hunt.boss) EW.hunt.boss.pushOut(pos, 0.55);
      this.x = pos.x; this.z = pos.z;
      const g = W.heightAt(this.x, this.z);
      const airState = this.state === 'fall' || this.state === 'plunge';
      if (!airState && this.vy <= 0 && this.y - g < 0.8) this.y = g;
      if (this.y > g + 0.05 || this.vy > 0) {
        this.vy -= 30 * dt; this.y += this.vy * dt;
        if (!airState && this.state !== 'dodge') this.setState('fall');
        if (this.state === 'plunge' && EW.hunt && EW.hunt.boss && EW.hunt.boss.tryPlunge(this)) return;
        if (this.y <= g) {
          this.y = g; const fallV = this.vy; this.vy = 0;
          if (this.state === 'fall' || this.state === 'plunge') { this.setState('land'); EW.audio.sfx('step', { vol: 0.8 }); E.dust(this.x, g, this.z, 6, 1.2); if (fallV < -16) EW.cam.shake(0.15); }
        }
      } else this.y = g;
    }

    // ------------------------------------------------------------------ moves
    startMove(name, charge = 1) {
      const m = this.W.moves[name];
      if (m.stam) { if (this.stam < m.stam) return; this.useStam(m.stam); }
      this.setState('attack'); this.move = m; this.moveName = name; this.phase = m.wind > 0 ? 'wind' : 'act'; this.pt = 0; this.charge = 0; this.chargeLv = 0; this.chargeMul = charge; this.swung = false; this.hitsLeft = m.hits || 1;
      if (this.phase === 'act') this.enterAct();
    }
    enterAct() {
      const m = this.move;
      this.phase = 'act'; this.pt = 0;
      EW.audio.sfx(m.thrust ? 'thrust' : this.kind === 'greatsword' ? 'swingHeavy' : 'swingLight', { vol: this.chargeMul > 1 ? 1 : 0.8 });
      const yaw = Math.atan2(this.fx, this.fz) - Math.PI / 2;
      if (m.trail) E.slash(this.x, this.y + 1.2 + (m.h[1] - 3) * 0.2, this.z, -yaw - Math.PI, { radius: m.trail.radius, width: m.trail.width, arc: Math.min(m.arc, 3.6), tilt: m.trail.tilt * (this.sprite.flip || 1) * 0.25, color: this.chargeMul > 1 ? 0xffc070 : 0xfff4e0, dur: 0.2 });
      else if (m.thrust) E.slash(this.x, this.y + (m.high ? 2.8 : 1.3), this.z, -yaw - Math.PI, { thrust: true, reach: m.range, width: 0.9, dur: 0.16, tilt: m.high ? -0.7 : 0 });
    }
    tickMove(dt, atkUp, dodge, inDir) {
      const m = this.move, sp = this.W.speed;
      this.pt += dt;
      let speed = 0;
      if (this.phase === 'wind') {
        if (inDir && this.pt < m.wind * 0.6) { this.fx = lerp(this.fx, inDir[0], dt * 8); this.fz = lerp(this.fz, inDir[1], dt * 8); }
        if (m.chargeable && this.pt > 0.2 && !atkUp) { this.setState('charge'); this.charge = 0.2; this.chargeLv = 0; return 0; }
        if (this.pt >= m.wind / sp) this.enterAct();
      } else if (this.phase === 'act') {
        speed = (m.lunge / (m.act / sp)) * (1 - this.pt / (m.act / sp));
        if (!this.swung || (this.hitsLeft > 0 && this.pt > (m.act / sp) * 0.5)) {
          this.swung = true; this.hitsLeft--;
          EW.combat.swing(this, m, { charge: this.chargeMul });
        }
        if (this.pt >= m.act / sp) { this.phase = 'rec'; this.pt = 0; }
      } else {
        const r = this.pt / (m.rec / sp);
        if (r > 0.3 && dodge && this.stam >= 6) { this.startDodge(inDir ? inDir[0] : this.fx, inDir ? inDir[1] : this.fz); return 0; }
        if (r > 0.25 && this.buffer > 0 && m.next) { this.buffer = 0; if (inDir) { this.fx = inDir[0]; this.fz = inDir[1]; } this.startMove(m.next); return 0; }
        if (r >= 1) this.setState('move');
      }
      return speed;
    }
    startDodge(dx, dz) {
      const W = this.W;
      this.useStam(W.dodgeCost);
      const l = Math.hypot(dx, dz) || 1; this.dv = { x: dx / l, z: dz / l }; this.fx = this.dv.x; this.fz = this.dv.z;
      this.setState('dodge'); this.dodgeKind = W.dodge;
      EW.audio.sfx('dodge');
      if (W.dodge === 'dash') E.dust(this.x, this.y, this.z, 4, 0.8);
    }
    tickDodge(dt) {
      const k = this.dodgeKind;
      const dur = k === 'dash' ? 0.3 : k === 'hop' ? 0.4 : 0.48;
      const ifr = k === 'dash' ? [0.02, 0.24] : [0.06, 0.32];
      this.iframe = this.t > ifr[0] && this.t < ifr[1];
      const r = this.t / dur;
      if (r >= 1) { this.setState('move'); this.iframe = false; if (k === 'roll') E.dust(this.x, this.y, this.z, 3, 0.8); return 0; }
      if (k === 'dash' && Math.random() < 0.5) E.burst(this.x, this.y + 1, this.z, 0xa8d0ff, 1, 0.3, { size: [0.5, 0.8], life: [0.15, 0.25], up: [0, 0.2], grav: 0 });
      return (k === 'dash' ? 19 : k === 'hop' ? 11 : 12) * (1 - r * 0.7);
    }

    // ------------------------------------------------------------------ receiving damage
    // hit: { dmg, fire, knock, src:{x,z}, stun, roar, unblockable }
    receive(hit) {
      if (this.state === 'faint' || this.state === 'cine') return 'none';
      if (this.iframe) return 'dodged';
      if (this.state === 'mounted') return 'none';
      const dx = hit.src.x - this.x, dz = hit.src.z - this.z, l = Math.hypot(dx, dz) || 1;
      const front = (dx / l) * this.fx + (dz / l) * this.fz > 0.25;
      if (hit.roar) {
        if (this.state === 'guard' || this.state === 'stance') return 'blocked';
        this.setState('stun'); return 'hit';
      }
      if (front && !hit.unblockable && this.state === 'stance') {
        this.useStam(8); EW.audio.sfx('guard'); EW.cam.shake(0.15);
        E.burst(this.x + this.fx, this.y + 1.4, this.z + this.fz, 0xbfe0ff, 16, 5, { size: [0.15, 0.4], life: [0.2, 0.4] });
        this.fx = dx / l; this.fz = dz / l; this.startMove('counter'); EW.hud && EW.hud.flash('counter');
        return 'countered';
      }
      if (front && !hit.unblockable && this.state === 'guard') {
        const cost = 10 + hit.dmg * 0.5;
        if (this.stam >= cost) {
          this.useStam(cost); this.hp -= Math.round(hit.dmg * 0.12); EW.audio.sfx('guard'); EW.cam.shake(0.18);
          this.kv.x = -(dx / l) * 9; this.kv.z = -(dz / l) * 9;
          E.burst(this.x + this.fx, this.y + 1.4, this.z + this.fz, 0xffe0a0, 14, 4, { size: [0.12, 0.35], life: [0.2, 0.4] });
          if (this.hp <= 0) this.faint();
          return 'blocked';
        }
        this.stam = 0;
      }
      let d = (hit.dmg * 100) / (100 + this.def);
      if (hit.fire && EW.progress.skills().includes('fireward')) d *= 0.7;
      d = Math.max(1, Math.round(d));
      this.hp -= d;
      if (hit.chip) { EW.hud && EW.hud.hurt(d, hit.fire, true); if (this.hp <= 0) this.faint(); return 'hit'; }
      EW.audio.sfx('hurt'); EW.cam.shake(Math.min(0.6, 0.15 + d / 60));
      EW.hud && EW.hud.hurt(d, hit.fire);
      E.burst(this.x, this.y + 1.2, this.z, hit.fire ? 0xff7a2a : 0xff4a4a, 10, 4, { size: [0.12, 0.3], life: [0.3, 0.5] });
      this.kv.x = -(dx / l) * (hit.knock || 4); this.kv.z = -(dz / l) * (hit.knock || 4);
      this.fx = dx / l; this.fz = dz / l;
      this.heal = 0;
      if (this.hp <= 0) { this.faint(); return 'hit'; }
      this.setState(hit.knock >= 10 ? 'down' : 'hurt');
      return 'hit';
    }
    faint() { this.hp = 0; this.setState('faint'); this.iframe = true; EW.audio.sfx('fail'); EW.hunt && EW.hunt.onFaint(); }

    // ------------------------------------------------------------------ mounted (driven by the boss)
    updateMounted(dt, atk) {
      const b = EW.hunt && EW.hunt.boss;
      if (!b || !b.mount) { this.vy = 0; this.setState('fall'); return; } // safety: never stay stuck in the riding pose
      const mp = b.mountPoint(); this.x = mp.x; this.y = mp.y; this.z = mp.z;
      this.braced = EW.input.held('brace');
      if (atk && !this.braced && this.t > 0.25) { this.t = 0; this.stab = 0.22; b.mountStab(this); }
      this.stab = Math.max(0, (this.stab || 0) - dt);
    }

    // ------------------------------------------------------------------ sprite animation
    animate(dt, speed, ctx) {
      const S = this.sprite, cam = EW.cam.billboardAngles();
      S.face(this.fx, this.fz, cam.yaw);
      S.billboard(cam.yaw, -cam.pitch * 0.35);
      this.root.position.set(this.x, this.y, this.z);
      this.shadow.position.y = EW.world.heightAt(this.x, this.z) - this.y + 0.06;
      S.wob.rotation.z = 0; S.wob.position.set(0, 1.0, 0);
      let anim = 'idle', f = Math.floor(E.time * 2.5) % 4;
      const st = this.state, at = (k, n) => Math.min(n - 1, Math.floor(Math.max(0, k) * n));
      if (st === 'move' || st === 'cine' || st === 'drink' || st === 'guard' || st === 'stance' || st === 'draw' || st === 'sheathe') {
        if (speed > 0.3) { this.walk += dt * speed * 1.15; anim = 'walk'; f = Math.floor(this.walk * 4) % 8; }
        if (speed > 7.5 && this.sheathed) { anim = 'run'; f = Math.floor(this.walk * 3.2) % 8; }
      }
      if (st === 'attack') {
        const m = this.move, sp = this.W.speed, a = S.S.anims['mv_' + this.moveName];
        if (a) {
          anim = 'mv_' + this.moveName;
          if (this.phase === 'wind') f = at(this.pt / (m.wind / sp), a.nW);
          else if (this.phase === 'act') f = a.nW + at(this.pt / (m.act / sp), a.nA);
          else f = a.nW + a.nA + at(this.pt / (m.rec / sp), a.nR);
        }
      }
      if (st === 'charge') { anim = 'charge'; f = 0; S.wob.position.x = Math.sin(E.time * 40) * 0.012 * (1 + this.chargeLv); }
      if (st === 'guard') { anim = 'guard'; f = 0; }
      if (st === 'stance') { anim = 'stance'; f = 0; }
      if (st === 'dance') { anim = 'dance'; f = this.flipDance ? 1 : 0; }
      if (st === 'dodge') {
        const k = this.dodgeKind, dur = k === 'dash' ? 0.3 : k === 'hop' ? 0.4 : 0.48, r = Math.min(1, this.t / dur);
        if (k === 'roll') { anim = 'roll'; f = at(r, 8); }
        else if (k === 'hop') { anim = 'jump'; f = r < 0.5 ? 0 : 1; S.wob.position.y = 1.0 + Math.sin(r * Math.PI) * 0.6; }
        else { anim = 'dash'; f = r < 0.35 ? 0 : 1; }
      }
      if (st === 'hurt') { anim = 'hurt'; f = 0; }
      if (st === 'stun') { anim = 'hurt'; f = 0; S.wob.rotation.z = Math.sin(E.time * 14) * 0.06; }
      if (st === 'down') { anim = 'down'; f = this.t < 0.9 ? at(this.t / 0.25, 4) : 3 - at((this.t - 0.9) / 0.35, 4); }
      if (st === 'faint') { anim = 'down'; f = 3; }
      if (st === 'drink') { anim = 'drink'; f = this.t > 0.25 && this.t < 0.85 ? 1 : 0; }
      if (st === 'gather') { anim = 'gather'; f = 0; }
      if (st === 'fall') { anim = 'jump'; f = this.vy > 1.5 ? 0 : 1; }
      if (st === 'plunge') { anim = 'plunge'; f = 0; }
      if (st === 'land') { anim = 'land'; f = 0; }
      if (st === 'sheathe') { anim = 'sheathe'; f = at(this.t / SHEATHE, 4); }
      if (st === 'draw') { anim = 'draw'; f = at(this.t / DRAW[this.kind], 4); }
      if (st === 'mounted') {
        anim = this.braced ? 'brace' : this.stab > 0 ? 'mstab' : 'mraise'; f = 0;
        if (EW.hunt && EW.hunt.boss && EW.hunt.boss.thrashing) S.wob.rotation.z = Math.sin(E.time * 26) * 0.2;
      }
      // weapon on the back: the '_s' twin of the animation when there is one
      if (this.sheathed && st !== 'draw' && S.has(anim + '_s')) anim += '_s';
      S.show(anim, f);
      S.mat.color.setScalar(this.iframe && st === 'dodge' ? 1.25 : 1);
    }
  }
  EW.Player = Player;
})();
