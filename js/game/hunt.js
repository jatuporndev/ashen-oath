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
      EW.cam.reset(player.x, player.y + 1.6, player.z, 0, 14, 0.32);
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
    onBossWake() {
      EW.audio.music('battle', { intensity: 0.6 });
      const b = this.boss, p = this.player;
      EW.hud && EW.hud.bossCard(b);
      // intro cinematic framing the waking behemoth (unless it was struck awake)
      const from = EW.cam.snapshot();
      const mid = new THREE.Vector3((b.x + p.x) / 2, 0, (b.z + p.z) / 2);
      const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
      const camPos = new THREE.Vector3(p.x + (dx / l) * 14 + (-dz / l) * 10, p.y + 7, p.z + (dz / l) * 14 + (dx / l) * 10);
      const look = new THREE.Vector3(b.x, b.y + 9, b.z);
      p.setState('cine'); p.autoWalk = null; this.phase = 'intro';
      EW.cam.cinematic(from, { pos: camPos, look }, 1.4, () => {
        EW.cam.cinematic({ pos: camPos.clone(), look: look.clone() }, { pos: camPos.clone().add(new THREE.Vector3(0, 1.5, 0)), look: look.clone().add(new THREE.Vector3(0, 2, 0)) }, 2.4, () => {
          const back = { pos: new THREE.Vector3(p.x + (dx / l) * 16, p.y + 8, p.z + (dz / l) * 16), look: new THREE.Vector3(mid.x, p.y + 4, mid.z) };
          EW.cam.cinematic({ pos: E.camera.position.clone(), look: look.clone() }, back, 0.8, () => {
            EW.cam.yaw = Math.atan2(dx, dz); EW.cam.look.copy(back.look); EW.cam.curDist = 16;
            p.setState('move'); this.phase = 'hunt';
            EW.hud && EW.hud.tip('tip.lockon');
          });
        });
      });
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
        EW.cam.reset(p.x, p.y + 1.6, p.z, 0, 13, 0.4);
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
