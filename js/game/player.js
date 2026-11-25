// Player Controller — hunter movement (camera-relative, 360°), stamina, dodge i-frames,
// weapon move execution with procedural weapon animation, guard / counter / blade dance,
// potions, falling + plunge attacks, hit reactions and fainting.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine, A = window.Art;
  const sheets = {};
  const sheetFor = (pal) => (sheets[pal] = sheets[pal] || A.heroSheet(pal));
  const ease = (k) => 1 - Math.pow(1 - k, 3), easeIn = (k) => k * k;
  const lerp = (a, b, t) => a + (b - a) * t;

  const fistCache = {};
  function fistMat(col) {
    if (fistCache[col]) return fistCache[col];
    const c = document.createElement('canvas'); c.width = 30; c.height = 26; const x = c.getContext('2d');
    x.fillStyle = '#2a1a14'; x.beginPath(); x.ellipse(15, 13, 14, 12, 0, 0, 7); x.fill();
    x.fillStyle = col; x.beginPath(); x.ellipse(15, 13, 11, 9, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(60,30,20,.55)'; x.lineWidth = 2; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(9 + k * 6, 6); x.lineTo(9 + k * 6, 12); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(11, 9, 4, 2.5, 0, 0, 7); x.fill();
    return (fistCache[col] = new THREE.MeshBasicMaterial({ map: E.tex(c, null, 2), alphaTest: 0.5, side: THREE.DoubleSide }));
  }
  class Player {
    constructor() {
      const H = A.HERO;
      this.sprite = new EW.DirectionalSprite({ sheet: sheetFor(EW.progress.palette()), cols: H.POSES.length, rows: H.VIEWS.length, frameW: H.FW, frameH: H.FH, height: 2.2, views: H.VIEWS, poses: H.POSES });
      this.root = this.sprite.root;
      this.shadow = E.shadow(0.75); this.root.add(this.shadow);
      E.scene.add(this.root);
      this.x = 0; this.y = 0; this.z = 0; this.vy = 0; this.fx = 0; this.fz = -1;
      this.maxHp = 150; this.hp = 150; this.stam = 100; this.maxStam = 100; this.stamDelay = 0;
      this.state = 'move'; this.t = 0; this.walk = 0; this.iframe = false; this.potions = 0;
      this.heal = 0; this.prev = {}; this.buffer = 0; this.skillT = 0; this.danceT = 0; this.kv = { x: 0, z: 0 };
      this.setWeapon(EW.save.game.weapon);
    }
    setPalette() { this.sprite.setSheet(sheetFor(EW.progress.palette())); }
    setWeapon(kind) {
      this.kind = kind; this.W = EW.WEAPONS[kind];
      for (const p of [this.sprite.main, this.sprite.off]) while (p.children.length) p.remove(p.children[0]);
      const art = A.weapon(kind, EW.progress.weaponTier(kind));
      this.wMain = EW.makeWeaponMesh(art, A.HERO.PX_PER_UNIT * (kind === 'spear' ? 0.95 : kind === 'greatsword' ? 1.22 : 1));
      this.wHolder = new THREE.Group(); this.wHolder.add(this.wMain); this.sprite.main.add(this.wHolder);
      this.wOff = null; this.oHolder = new THREE.Group(); this.sprite.off.add(this.oHolder);
      if (kind === 'dual') { this.wOff = EW.makeWeaponMesh(art, A.HERO.PX_PER_UNIT); this.oHolder.add(this.wOff); }
      // fists wrapped over the grip so the weapon always reads as held (two for two-handers)
      const pal = EW.progress.palette ? (A.HERO_PALETTES || {})[EW.progress.palette()] : null;
      const fist = (holder, dy) => { const m = new THREE.Mesh(E.centerPlane, fistMat(pal ? pal.skin : '#f0c6a0')); m.scale.set(0.3, 0.26, 1); m.position.set(0, dy, 0.03); holder.add(m); return m; };
      this.fists = [fist(this.wHolder, 0)];
      if (this.W.twoHand) this.fists.push(fist(this.wHolder, -0.22));
      else if (kind === 'spear') this.fists.push(fist(this.wHolder, 0.62));
      if (this.wOff) this.fists.push(fist(this.oHolder, 0));
      this.angMain = this.W.idle.main; this.angOff = this.W.idle.off;
    }
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
          if (mv.mag > 0.1) {
            const sprint = I.held('sprint') && this.stam > 1 && mv.mag > 0.5;
            speed = (sprint ? 9.6 : 6.2) * Math.min(1, mv.mag);
            if (sprint) { this.sprinting = true; this.useStam(18 * dt); this.stamDelay = 0.4; }
            this.fx = lerp(this.fx, wx, Math.min(1, dt * 14)); this.fz = lerp(this.fz, wz, Math.min(1, dt * 14));
          }
          if (dodge && this.stam >= 6) { this.startDodge(wl > 0.2 ? wx : this.fx, wl > 0.2 ? wz : this.fz); break; }
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
          if (this.state === 'fall' && atk) { this.setState('plunge'); EW.audio.sfx('swingHeavy'); }
          if (mv.mag > 0.1) { this.fx = lerp(this.fx, wx, dt * 4); this.fz = lerp(this.fz, wz, dt * 4); speed = 4 * mv.mag; }
          break;
        case 'land': if (this.t > 0.35) this.setState('move'); break;
        case 'mounted': this.updateMounted(dt, atk); break;
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
      if (name === 'charged') { this.angMain = m.a[0]; }
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
      const b = EW.hunt && EW.hunt.boss; if (!b) return;
      const mp = b.mountPoint(); this.x = mp.x; this.y = mp.y; this.z = mp.z;
      this.braced = EW.input.held('brace');
      if (atk && !this.braced && this.t > 0.25) { this.t = 0; this.stab = 0.22; b.mountStab(this); }
      this.stab = Math.max(0, (this.stab || 0) - dt);
    }

    // ------------------------------------------------------------------ sprite animation
    animate(dt, speed, ctx) {
      const S = this.sprite, yaw = EW.cam.billboardAngles();
      const view = S.face(this.fx, this.fz, yaw.yaw);
      S.billboard(yaw.yaw, -yaw.pitch * 0.35);
      this.root.position.set(this.x, this.y, this.z);
      this.shadow.position.y = EW.world.heightAt(this.x, this.z) - this.y + 0.06;
      S.roll.rotation.z = 0; S.body.scale.y = S.h; S.roll.position.y = S.h * 0.42;
      let pose = 'idle', aM = this.W.idle.main, aO = this.W.idle.off, push = 0;
      const st = this.state;
      if (st === 'move' || st === 'drink' || st === 'guard' || st === 'dance' || st === 'cine') {
        if (speed > 0.3) { this.walk += dt * speed * 1.15; pose = 'walk' + (1 + (Math.floor(this.walk * 2) % 4)); }
        else { S.body.scale.y = S.h * (1 + Math.sin(E.time * 2.4) * 0.012); }
        if (this.sprinting) aM = this.kind === 'spear' ? -0.9 : this.W.idle.main + 0.3;
      }
      if (st === 'attack') {
        const m = this.move, sp = this.W.speed;
        const hand = m.hand || 'main';
        let a;
        if (this.phase === 'wind') { const k = Math.min(1, this.pt / (m.wind / sp)); a = lerp(m.a[0], m.a[1], ease(k)); pose = 'raise'; }
        else if (this.phase === 'act') { const k = Math.min(1, this.pt / (m.act / sp)); a = lerp(m.a[1], m.a[2], easeIn(k)); pose = 'strike'; push = m.thrust ? k * 0.5 : 0; }
        else { const k = Math.min(1, this.pt / (m.rec / sp)); const idle = hand === 'off' ? this.W.idle.off : this.W.idle.main; a = lerp(m.a[2], idle, ease(Math.max(0, k - 0.35) / 0.65)); pose = k < 0.55 ? 'strike' : 'idle'; push = m.thrust ? 0.5 * (1 - k) : 0; }
        if (hand === 'main' || hand === 'both') aM = a;
        if (hand === 'off' || hand === 'both') aO = hand === 'both' ? a + 0.35 : a;
        if (this.moveName === 'high') pose = this.phase === 'wind' ? 'raise' : 'strike';
      }
      if (st === 'charge') { pose = 'raise'; aM = 2.6 + Math.sin(E.time * 30) * 0.02 * (1 + this.chargeLv); }
      if (st === 'guard') { pose = 'raise'; aM = -0.25; }
      if (st === 'stance') { pose = 'raise'; aM = -1.3; }
      if (st === 'dance') { pose = this.flipDance ? 'strike' : 'raise'; aM = this.flipDance ? -2.4 : 2.2; aO = this.flipDance ? 2.2 : -2.4; S.bb.scale.x *= this.flipDance ? -1 : 1; }
      if (st === 'dodge') {
        const k = this.dodgeKind; pose = 'dodge';
        if (k === 'roll' || k === 'hop') { const dur = k === 'hop' ? 0.4 : 0.48; S.roll.rotation.z = -Math.min(1, this.t / dur) * Math.PI * 2 * (k === 'hop' ? 0 : 1); S.roll.position.y = S.h * 0.42 * (k === 'roll' ? 0.7 : 1) + (k === 'hop' ? Math.sin(Math.min(1, this.t / dur) * Math.PI) * 0.6 : 0); }
      }
      if (st === 'hurt' || st === 'stun') { pose = 'hurt'; if (st === 'stun') S.roll.rotation.z = Math.sin(E.time * 14) * 0.06; }
      if (st === 'down' || st === 'faint') { pose = 'hurt'; const k = st === 'faint' ? 1 : this.t < 0.9 ? Math.min(1, this.t / 0.2) : Math.max(0, 1 - (this.t - 0.9) / 0.3); S.roll.rotation.z = k * 1.45; S.roll.position.y = S.h * 0.42 * (1 - k * 0.7); }
      if (st === 'drink' || st === 'gather') { pose = st === 'gather' ? 'hurt' : 'raise'; }
      if (st === 'fall') pose = 'dodge';
      if (st === 'plunge') { pose = 'strike'; aM = this.kind === 'spear' ? -3.0 : -2.9; aO = -2.9; }
      if (st === 'land') pose = 'dodge';
      if (st === 'mounted') { pose = this.braced ? 'hurt' : this.stab > 0 ? 'strike' : 'raise'; aM = this.stab > 0 ? -2.9 : 2.0; aO = aM; S.roll.rotation.z = this.braced ? -0.4 : 0; if (EW.hunt && EW.hunt.boss && EW.hunt.boss.thrashing) S.roll.rotation.z += Math.sin(E.time * 26) * 0.25; }
      S.setFrame(view, pose);
      // weapon pivots: smooth toward targets, mirrored by the billboard flip
      this.angMain = st === 'attack' || st === 'dance' ? aM : lerp(this.angMain, aM, Math.min(1, dt * 14));
      this.angOff = st === 'attack' || st === 'dance' ? aO : lerp(this.angOff, aO, Math.min(1, dt * 14));
      this.wHolder.rotation.z = this.angMain; this.oHolder.rotation.z = this.angOff;
      this.wHolder.position.x = push;
      // greatsword drawn behind the body when idle in front view; spear tip forward in back view
      this.wHolder.position.z = 0.02;
      // the off-hand blade hides behind the body in side view unless swinging
      this.oHolder.visible = !!this.wOff;
      const tint = this.iframe && st === 'dodge' ? 1.25 : 1;
      S.mat.color.setScalar(tint);
    }
  }
  EW.Player = Player;
})();
