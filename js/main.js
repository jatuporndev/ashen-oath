// Game State Manager — boot → language (first launch) → title → guild hub ⇄ hunting field
// → results → guild. Owns the main loop and wires every system together.
(function () {
  'use strict';
  const EW = window.EW, E = EW.engine, W = EW.world, t = (k, v) => EW.t(k, v);
  const G = (EW.game = { state: 'boot', quest: null, player: null });

  // ------------------------------------------------------------------ subtitles
  const subEl = document.getElementById('subtitles');
  let subTimer = 0;
  G.say = (speaker, line, dur = 5) => {
    if (!EW.save.setting('subtitles')) return;
    subEl.dataset.size = EW.save.setting('subSize');
    subEl.innerHTML = `<span class="sp">${t(speaker)}</span><span class="ln">${t(line)}</span>`;
    subEl.classList.add('on'); clearTimeout(subTimer); subTimer = setTimeout(() => subEl.classList.remove('on'), dur * 1000);
    EW.audio.sfx('whisper', { vol: 0.5 });
  };

  // ------------------------------------------------------------------ attract mode (menus over the living guild)
  function attract() {
    document.body.classList.remove('cine-on');
    G.state = 'attract';
    if (EW.hunt) { EW.hunt.dispose(); EW.hunt = null; }
    if (G.player) G.player.root.visible = false;
    W.load('hub'); W.player = null;
    EW.cam.ground = W.heightAt; EW.cam.inside = null;
    EW.cam.reset(0, 4, -8, 0, 30, 0.2);
    EW.hud.show(false); EW.hud.clear();
    EW.audio.music('menu'); EW.audio.ambience('hub');
  }

  // ------------------------------------------------------------------ guild hub
  function ensurePlayer() {
    if (!G.player) G.player = new EW.Player();
    G.player.setWeapon(EW.save.game.weapon, true); G.player.root.visible = true; // sync: we're behind a fade here
    G.player.resetVitals();
    return G.player;
  }
  function enterHub(from) {
    document.body.classList.remove('cine-on');
    if (EW.hunt) { EW.hunt.dispose(); EW.hunt = null; }
    W.load('hub');
    const p = ensurePlayer(); W.player = p;
    if (from === 'return') p.place(0, -22, Math.PI); else p.place(W.spawn.x, W.spawn.z, W.spawn.yaw);
    EW.cam.ground = W.heightAt; EW.cam.inside = W.camInside;
    EW.cam.reset(p.x, p.y + 1.6, p.z, from === 'return' ? Math.PI : 0, 10, 0.3);
    EW.cam.lock = false;
    G.quest = null;
    const N = EW.net;
    if (N.isHost) { N.setMeta({ ph: 'hub', q: null, b: null, open: 1 }); N.sentHost = null; }
    if (N.isGuest && N.meta && N.meta.q) G.setCoopQuest(N.meta.q, true);
    W.interact.push({ id: 'gate', x: 0, z: -26, r: 5.5, y: 9, label: 'prompt.gate', enabled: () => !G.quest, act: () => { EW.hud.notice('notice.gateSealed', 'warn'); EW.audio.sfx('fail', { vol: 0.4 }); } });
    G.state = 'hub';
    EW.audio.music('hub'); EW.audio.ambience('hub');
    EW.hud.clear(); EW.hud.show(true);
    UIsync();
  }
  G.newGame = () => { EW.save.newGame(); EW.ui.fadeThrough(() => { EW.ui.reset(); enterHub('new'); setTimeout(() => { G.say('dlg.master', 'dlg.welcome'); EW.hud.tip('tip.hub'); }, 900); }, { card: [t('area.hub'), t('game.subtitle')] }); };
  G.continueGame = () => { EW.save.loadGame(); EW.ui.fadeThrough(() => { EW.ui.reset(); enterHub('new'); setTimeout(() => EW.hud.tip('tip.hub'), 900); }, { card: [t('area.hub'), ''] }); };
  G.acceptQuest = (q) => {
    if (EW.net.isGuest) { EW.hud.notice('coop.hostPicks', 'warn'); return; }
    G.quest = q; W.gate.target = 1;
    EW.net.setMeta({ q: q.id });
    EW.audio.sfx('uiConfirm'); EW.hud.notice('notice.questAccepted', 'good');
    setTimeout(() => { EW.hud.notice('notice.gateOpen', 'good'); G.say('dlg.master', q.boss === 'gravemaw' ? 'dlg.accept' : 'dlg.accept.' + q.boss); EW.hud.tip('tip.gate'); }, 700);
  };
  G.cancelQuest = () => { if (EW.net.isGuest) return; G.quest = null; W.gate.target = 0; EW.net.setMeta({ q: null }); EW.hud.notice('notice.questCancelled'); };
  // co-op guests: the host's quest opens (or seals) the gate for them too
  G.setCoopQuest = (qid, quiet) => {
    const q = qid ? EW.data.quests.find((x) => x.id === qid) : null;
    if ((G.quest && G.quest.id) === (q && q.id)) return;
    G.quest = q; if (W.gate) W.gate.target = q ? 1 : 0;
    if (!quiet && G.state === 'hub') { EW.hud.notice(q ? 'notice.questAccepted' : 'notice.questCancelled', q ? 'good' : ''); if (q) EW.hud.notice('notice.gateOpen', 'good'); }
  };
  G.coopDepart = (qid) => { G.setCoopQuest(qid, true); if (G.quest && G.state === 'hub') depart(); };
  // co-op guest: the host left — back to the title
  G.onRoomClosed = () => {
    if (G.state === 'attract' || G.state === 'boot') { EW.ui.toast(t('coop.closed'), 'warn'); return; }
    EW.ui.fadeThrough(() => { attract(); EW.ui.reset('title'); EW.ui.toast(t('coop.closed'), 'warn'); });
  };
  // co-op guest: joined a room → walk into the host's guild with your own hunter and save
  G.enterCoop = () => {
    if (EW.save.hasGame()) EW.save.loadGame(); else EW.save.newGame();
    EW.ui.fadeThrough(() => { EW.ui.reset(); enterHub('new'); setTimeout(() => EW.hud.notice('coop.welcome', 'good', { name: (EW.net.meta && EW.net.meta.hn) || '' }), 700); }, { card: [t('area.hub'), t('menu.coop')] });
  };
  G.abandon = () => { if (EW.net.isHost) EW.net.send({ t: 'abandon' }); EW.ui.reset(); G.returnToGuild(false); };
  function depart() {
    const N = EW.net;
    if (N.isHost) { N.send({ t: 'depart', qid: G.quest.id }); N.setMeta({ ph: 'field' }); }
    G.state = 'depart';
    const p = G.player; p.setState('cine'); p.autoWalk = [0, -1];
    EW.audio.sfx('gate', { vol: 0.5 });
    EW.ui.fadeThrough(() => {
      p.autoWalk = null;
      EW.hunt = new EW.Hunt(G.quest, p);
      G.state = 'field'; EW.hud.clear(); UIsync();
    }, { out: 1100, hold: 900, card: [t('load.title'), t('load.ravine')] });
  }
  G.returnToGuild = (success) => {
    EW.ui.fadeThrough(() => {
      enterHub('return');
      setTimeout(() => G.say('dlg.master', success ? 'dlg.return' : 'dlg.fail'), 900);
    }, { out: 900, hold: 700, card: [t('area.hub'), ''] });
  };
  G.quitToTitle = () => { EW.net.leave(); EW.ui.fadeThrough(() => { attract(); EW.ui.reset('title'); }); };
  G.exit = () => { EW.ui.reset('farewell'); EW.audio.music(null); EW.hud.show(false); setTimeout(() => { try { window.close(); } catch (e) { /* browsers may refuse */ } }, 1600); };
  G.afterLanguage = () => { EW.ui.reset('title'); };

  // ------------------------------------------------------------------ gameplay raw input (only when no menu is open)
  G.onRaw = (r) => {
    if (!(G.state === 'hub' || G.state === 'field')) return;
    const P = EW.input.PAD;
    const is = (code, btn) => (r.src === 'kb' && r.code === code && !r.repeat) || (r.src === 'pad' && r.btn === btn);
    if (is('Escape', P.MENU) || (r.src === 'kb' && r.code === 'KeyP')) { EW.ui.open('pause'); return; }
    if (!control()) return;
    if (is('KeyE', P.A)) { const it = currentInteract(); if (it) { EW.audio.sfx('uiConfirm', { vol: 0.5 }); it.act(); } }
    if (is('KeyQ', P.LT) && EW.hunt && EW.hunt.boss.engaged && !EW.hunt.boss.lost && EW.hunt.boss.state !== 'dead') { EW.cam.lock = !EW.cam.lock; EW.audio.sfx('uiMove'); }
  };
  // mouse look: capture the cursor while playing; releasing it (Esc / alt-tab) pauses
  const playingFree = () => (G.state === 'hub' || G.state === 'field') && !EW.ui.isOpen();
  EW.input.canLock = playingFree;
  EW.input.onLockLost = () => { if (playingFree()) EW.ui.open('pause'); };
  // Ctrl is the roll key and Ctrl+W closes a tab (a page cannot block it): ask before leaving mid-game
  addEventListener('beforeunload', (e) => { if (G.state === 'hub' || G.state === 'field') { e.preventDefault(); e.returnValue = ''; } });
  function control() {
    if (EW.ui.isOpen()) return false;
    if (G.state === 'hub') return G.player.state !== 'cine';
    if (G.state === 'field') return EW.hunt && EW.hunt.control && G.player.state !== 'cine';
    return false;
  }
  function currentInteract() { const p = G.player; if (!p || !control() || p.state === 'mounted') return null; return W.nearestInteract(p.x, p.z); }
  function UIsync() { G.syncChrome(); }
  G.syncChrome = () => {
    const playing = (G.state === 'hub' || G.state === 'field' || G.state === 'depart');
    EW.hud.show(playing && !EW.ui.isOpen());
    document.body.classList.toggle('in-game', playing);
  };

  // ------------------------------------------------------------------ main loop
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    E.time += dt;
    EW.input.poll(dt);
    if (EW.input.locked() && !(playingFree() || G.state === 'depart')) EW.input.unlock();
    const fov = EW.save.setting('fov'); if (E.camera.fov !== fov) { E.camera.fov = fov; E.camera.updateProjectionMatrix(); }
    if (G.state === 'attract' || G.state === 'boot') {
      EW.cam.yaw = Math.sin(E.time * 0.05) * 0.42;
      EW.cam.update(dt, { player: { x: 0, y: 2.5, z: -8 }, inputEnabled: false });
      W.update(dt, { x: 0, y: 0, z: -8 });
      E.updateFx(dt);
      E.render(); return;
    }
    const steps = DEBUG_STEPS;
    for (let i = 0; i < steps; i++) tick(dt, i === steps - 1);
    EW.net.tick(dt);
    E.render();
  }
  const DEBUG_STEPS = Math.max(1, Math.min(8, +(new URLSearchParams(location.search).get('steps') || 1)));
  function tick(dt, last) {
    if (!last) E.time += dt;
    const p = G.player;
    const frozen = G.state === 'field' && EW.ui.isOpen() && !EW.net.active; // menus pause the hunt (not in co-op)
    let sim = frozen ? 0 : dt;
    if (EW.combat.stop > 0) { EW.combat.stop -= dt; sim *= 0.06; }
    if (G.state === 'hub' || G.state === 'depart' || G.state === 'field') {
      const hunt = EW.hunt;
      if (sim > 0) {
        const boss = hunt && hunt.boss;
        // a thrown error here used to freeze the hunter for good (the loop kept drawing, the player never
        // updated again): log it once and put the hunter back on their feet instead
        try { p.update(sim, { control: control(), lockTarget: EW.cam.lock && boss ? boss : null }); }
        catch (e) { if (!G.updErr) { G.updErr = true; console.error('player update failed', p.state, e); } p.vy = 0; p.y = W.heightAt(p.x, p.z); if (p.state !== 'mounted' && p.state !== 'faint') p.setState('move'); }
        if (hunt) hunt.update(sim);
        EW.combat.update(sim);
        if (G.state === 'hub' && G.quest && p.z < W.departZ) {
          // co-op: the host leads everyone through together, once the whole party is in town
          const N = EW.net, hold = N.isGuest ? 'coop.waitHost' : N.isHost && !N.partyReady() ? 'coop.waitParty' : null;
          if (hold) { p.z = W.departZ + 0.4; if (E.time - (G.holdNote || -9) > 3) { G.holdNote = E.time; EW.hud.notice(hold, 'warn'); } }
          else depart();
        }
        if (G.state === 'hub') EW.save.game.playtime += dt;
      }
      W.update(dt, p);
      E.updateFx(sim);
      const boss = hunt && hunt.boss;
      EW.cam.update(dt, { player: p, boss: boss ? boss.frame() : null, inputEnabled: !EW.ui.isOpen() });
      if (last) EW.hud.update(dt, { player: p, interact: currentInteract() });
    }
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    const bootEl = document.getElementById('boot');
    const lang = EW.save.profile.lang;
    EW.lang = lang || ((navigator.language || '').startsWith('th') ? 'th' : 'en');
    document.documentElement.lang = EW.lang; document.body.dataset.lang = EW.lang;
    EW.ui.init(); EW.hud.init();
    // climbing a downed beast + other context interactions are registered per hunt
    const _Hunt = EW.Hunt;
    EW.Hunt = class extends _Hunt { constructor(q, p) { super(q, p); const b = this.boss; W.interact.push({ id: 'climb', get x() { return b.x; }, get z() { return b.z; }, r: 13, y: 6, label: 'prompt.climb', enabled: () => b.state === 'topple' && b.canMount() && b.st > 0.6, act: () => b.climb(p) }); } };
    attract();
    requestAnimationFrame(frame);
    setTimeout(() => {
      bootEl.classList.add('done');
      if (!lang) EW.ui.open('lang'); else EW.ui.open('title');
      setTimeout(() => bootEl.remove(), 1200);
    }, 250);
  }
  // let the boot screen paint before the heavy art generation
  setTimeout(boot, 60);
})();
