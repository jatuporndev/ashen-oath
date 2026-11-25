// Quest runtime — one hunt in a field: arrival, boss wake, faints (3 = failure), timer,
// part breaks, carving, camp supplies, victory → rewards → return to the guild.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine;

  class Hunt {
    constructor(quest, player) {
      this.quest = quest; this.player = player; this.bossDef = EW.data.bosses[quest.boss];
      this.time = 0; this.faints = 0; this.breaks = []; this.carved = []; this.campUsed = false; this.phase = 'arrive';
      this.stats = { dealt: 0, mounts: 0, pillars: 0, herbs: 0 };
      EW.world.load(quest.field);
      EW.world.player = player;
      this.boss = new EW.BOSSES[quest.boss](EW.world.bossHome);
      const sp = EW.world.spawn;
      player.place(sp.x, sp.z, sp.yaw); player.resetVitals(); player.potions = 5;
      EW.cam.ground = EW.world.heightAt; EW.cam.inside = null;
      EW.cam.reset(player.x, player.y + 1.6, player.z, 0, 11, 0.28);
      // arrival: the hunter walks in from the canyon road
      player.setState('cine'); player.autoWalk = [0, -1];
      EW.audio.music('field'); EW.audio.ambience('field');
      setTimeout(() => EW.hud && EW.hud.areaCard('area.ravine', 'area.ravine.sub'), 600);
    }
    get control() { return this.phase === 'hunt' || this.phase === 'victory'; }
    update(dt) {
      const p = this.player;
      if (this.phase === 'arrive') {
        if (p.z < 90) { p.autoWalk = null; p.setState('move'); this.phase = 'hunt'; EW.hud && EW.hud.tip('tip.hunt'); }
      }
      if (this.phase === 'hunt') {
        this.time += dt;
        if (this.time > this.quest.limit) this.fail('timeout');
      }
      if (this.phase === 'victory') {
        this.victoryT -= dt;
        if (this.victoryT <= 0 && !this.resultsShown) this.showResults();
      }
      this.boss.update(dt, p);
      // entering a new basin shows its name
      const zn = EW.world.zoneAt && EW.world.zoneAt(p.x, p.z);
      if (zn && zn.id !== this.zone && this.phase !== 'arrive') { const first = this.zone === undefined; this.zone = zn.id; if (!first) EW.hud && EW.hud.areaCard(zn.area, 'area.ravine'); }
      EW.world.tickEnv(dt, (cr) => EW.combat.explosion(cr));
      // music intensity follows the fight
      if (this.boss.engaged && this.phase === 'hunt') EW.audio.intensity(this.boss.phase === 2 ? 1 : 0.6);
    }
    // ------------------------------------------------------------------ cutscenes
    // Film-style: black letterbox bars, HUD hidden, the hunter can only watch (no control,
    // no damage). shots: [{ from:{pos,look}, to:{pos,look}, dur }] played as hard cuts.
    cutscene(shots, onDone) {
      const p = this.player;
      this.cine = true; EW.cam.lock = false;
      p.setState('cine'); p.autoWalk = null; p.iframe = false;
      document.body.classList.add('cine-on');
      const run = (i) => {
        if (i >= shots.length) return this.endCutscene(onDone);
        const s = shots[i];
        EW.cam.cinematic(s.from, s.to, s.dur, () => run(i + 1), s.track);
      };
      run(0);
    }
    endCutscene(onDone) {
      const p = this.player, b = this.boss;
      // hand back a normal follow camera behind the hunter, facing the beast
      const dx = p.x - b.x, dz = p.z - b.z;
      EW.cam.yaw = Math.atan2(dx, dz); EW.cam.look.set(p.x, p.y + 1.6, p.z); EW.cam.curDist = EW.cam.dist;
      EW.cam.endCinematic();
      document.body.classList.remove('cine-on');
      this.cine = false;
      if (p.state === 'cine') p.setState('move');
      onDone && onDone();
    }
    // camera rig around the boss head, measured toward the hunter (that side is always open
    // ground — the head may face into a cave wall). Falls back to the mirrored side / closer in
    // when the spot would sit inside a cliff.
    // distances are from the boss's body centre; `up` is above the ground under the boss.
    // The look target is an offset added to the LIVE head position (see trackHead) so the
    // camera keeps the beast framed while it rises, turns and roars.
    shotAt(fwd, side, up, lookUp = 0) {
      const b = this.boss, p = this.player, Wd = EW.world, gy = Wd.heightAt(b.x, b.z);
      let fx = p.x - b.x, fz = p.z - b.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
      const sx = -fz, sz = fx;
      const at = (f, s) => [b.x + fx * f + sx * s, b.z + fz * f + sz * s];
      const ok = ([x, z]) => !Wd.open || Wd.open(x, z) > 0.55;
      let xz = at(fwd, side);
      for (const [f, s] of [[fwd, -side], [fwd * 0.7, side * 0.5], [fwd * 0.7, -side * 0.5], [fwd * 0.5, 0]]) { if (ok(xz)) break; xz = at(f, s); }
      const [x, z] = xz;
      return { pos: new THREE.Vector3(x, Math.max(Wd.heightAt(x, z) + 1.4, gy + up), z), look: new THREE.Vector3(0, lookUp, 0) };
    }
    trackHead() {
      // eased so head bobs during the roar don't shake the frame
      const b = this.boss, s = new THREE.Vector3().copy(b.headWorld());
      return () => { const q = b.headWorld(); s.x += (q.x - s.x) * 0.12; s.y += (q.y - s.y) * 0.12; s.z += (q.z - s.z) * 0.12; return s.clone(); };
    }
    onBossWake() {
      EW.audio.music('battle', { intensity: 0.6 });
      const b = this.boss, p = this.player;
      EW.hud && EW.hud.bossCard(b);
      this.phase = 'intro';
      // wide establishing shot, then a low hero angle as it rises and roars
      // (the head is low while it sleeps, so these sit higher than the rage shots)
      const tr = this.trackHead();
      const a0 = this.shotAt(46, 18, 12, -2), a1 = this.shotAt(41, 15, 13, -1);
      const b0 = this.shotAt(26, -10, 3, 1), b1 = this.shotAt(23, -8, 4, 2);
      this.cutscene([{ from: a0, to: a1, dur: 1.6, track: tr }, { from: b0, to: b1, dur: 2.4, track: tr }], () => {
        this.phase = 'hunt';
        EW.hud && EW.hud.tip('tip.lockon');
      });
    }
    // phase 2: the beast's rage gets its own short cut — a low push-in on the roaring head
    onEnrage() {
      if (this.cine || this.player.state === 'mounted' || this.player.state === 'faint') return false;
      const tr = this.trackHead();
      const a0 = this.shotAt(22, 7, 2, 1), a1 = this.shotAt(19, 5, 2.5, 1.5);
      const b0 = this.shotAt(34, -14, 9, 1), b1 = this.shotAt(30, -11, 10, 2);
      this.cutscene([{ from: a0, to: a1, dur: 1.1, track: tr }, { from: b0, to: b1, dur: 1.9, track: tr }]);
      return true;
    }
    onBreak(part) { this.breaks.push(part); }
    onBossFlee() { this.stats.flees = (this.stats.flees || 0) + 1; setTimeout(() => EW.hud && EW.hud.tip('tip.track'), 2500); }
    onPillar() { this.stats.pillars++; EW.hud && EW.hud.notice('env.pillar', 'good'); }
    onMount() { this.stats.mounts++; EW.hud && EW.hud.tip('tip.mount'); }
    gatherHerb() { const p = this.player; p.heal += 35; p.setState('gather'); this.stats.herbs++; EW.audio.sfx('herb'); EW.hud && EW.hud.notice('notice.herb', 'good'); }
    useCamp() { this.campUsed = true; this.player.potions += 3; this.player.hp = this.player.maxHp; EW.audio.sfx('potion'); EW.hud && EW.hud.notice('notice.camp', 'good'); }
    onFaint() {
      this.faints++;
      EW.hud && EW.hud.notice(this.faints >= this.quest.faints ? 'notice.faintFinal' : 'notice.faint', 'warn', { n: this.quest.faints - this.faints });
      if (this.faints >= this.quest.faints) { setTimeout(() => this.fail('faints'), 2400); return; }
      setTimeout(() => EW.ui.fadeThrough(() => {
        const p = this.player; p.place(0, 80, 0); p.resetVitals(); p.y = EW.world.heightAt(0, 80);
        EW.cam.reset(p.x, p.y + 1.6, p.z, 0, 11, 0.3);
        if (this.boss.mount) this.boss.mount = null;
        if (this.boss.state === 'mounted') this.boss.enter('stalk');
      }), 2200);
    }
    onBossDown() {
      if (this.phase !== 'hunt' && this.phase !== 'intro') return;
      this.phase = 'victory'; this.victoryT = 50;
      EW.cam.lock = false;
      EW.audio.music(null); setTimeout(() => EW.audio.fanfare(), 900);
      setTimeout(() => { EW.hud && EW.hud.banner('banner.complete', 'banner.complete.sub'); }, 1200);
      setTimeout(() => { EW.hud && EW.hud.tip('tip.carve'); EW.audio.music('hub'); }, 5200);
      EW.save.game.cleared[this.quest.boss] = (EW.save.game.cleared[this.quest.boss] || 0) + 1;
    }
    carve(kind) {
      const table = kind === 'tail' ? this.bossDef.tailCarve : this.bossDef.carve;
      const id = EW.progress.roll(table);
      EW.progress.give(id, 1); this.carved.push(id);
      this.player.setState('gather');
      EW.audio.sfx('paper'); EW.hud && EW.hud.loot(id, 1);
      if (kind === 'body' && this.boss.carves >= this.boss.carveMax) this.victoryT = Math.min(this.victoryT, 4);
    }
    // quest reward roll: base rewards + a guaranteed material for every broken part
    rewards() {
      if (this._rewards) return this._rewards;
      const items = [];
      for (let i = 0; i < 4; i++) items.push(EW.progress.roll(this.bossDef.reward));
      const breaks = this.breaks.map((p) => this.bossDef.breaks[p]).filter(Boolean);
      this._rewards = { crowns: this.quest.crowns, items, breaks, carved: this.carved.slice(), time: this.time, faints: this.faints };
      return this._rewards;
    }
    showResults() {
      this.resultsShown = true;
      const r = this.rewards();
      for (const id of r.items.concat(r.breaks)) EW.progress.give(id, 1);
      EW.progress.give('crowns', r.crowns);
      EW.save.game.hunts++; EW.save.game.lastQuest = this.quest.id;
      EW.save.commit();
      EW.ui.open('results', r);
    }
    fail(reason) {
      if (this.phase === 'failed') return;
      this.phase = 'failed';
      EW.audio.music(null);
      EW.ui.open('failed', { reason });
    }
    dispose() {
      this.boss.dispose(); EW.combat.clear();
    }
  }
  EW.Hunt = Hunt;
})();
