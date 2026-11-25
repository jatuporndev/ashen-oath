// HUD — hunter vitals in a forged frame, weapon emblem + charge, potions, quest timer and
// faint marks, boss nameplate (no health bar — read the beast), part-break notices,
// interaction prompts, damage numbers, lock-on reticle, mount meter, loot, cards & banners.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const h = EW.ui.h, t = (k, v) => EW.t(k, v), E = EW.engine;
  const root = document.getElementById('hud');
  const HUD = (EW.hud = { root, nums: [] });

  const el = {};
  function build() {
    root.replaceChildren(
      (el.vitals = h('div.vitals',
        (el.emblem = h('div.emblem')),
        h('div.bars',
          h('div.bar.hp', (el.hpLag = h('span.lag')), (el.hpHeal = h('span.heal')), (el.hp = h('span.fill'))),
          h('div.bar.st', (el.st = h('span.fill'))),
          (el.pips = h('div.pips', h('span'), h('span'), h('span')))))),
      (el.potion = h('div.item-slot', (el.potIcon = EW.ui.matIcon('potion')), (el.potN = h('span.n')), EW.ui.glyph('potion'))),
      (el.quest = h('div.quest-info', (el.qName = h('div.q-name')), h('div.q-row', (el.qTime = h('span.q-time')), (el.qFaints = h('span.q-faints')))) ),
      (el.boss = h('div.bossplate', (el.bossName = h('div.bp-name')), h('div.bp-orn'), (el.bossState = h('div.bp-state')))),
      (el.prompt = h('div.prompt')),
      (el.notices = h('div.notices')),
      (el.tips = h('div.tips')),
      (el.area = h('div.areacard')),
      (el.banner = h('div.banner')),
      (el.numLayer = h('div.num-layer')),
      (el.reticle = h('div.reticle')),
      (el.mount = h('div.mount', h('div.m-label'), h('div.m-bar', (el.mFill = h('span'))), (el.mBrace = h('div.m-brace')))),
      (el.loot = h('div.loot')),
      (el.vignette = h('div.hurt-vignette')),
      (el.lock = h('div.lockhint')),
    );
    HUD.relang();
  }
  HUD.relang = () => {
    el.mount.querySelector('.m-label').textContent = t('mount.meter');
    el.mBrace.replaceChildren(EW.ui.glyph('brace'), h('span', t('mount.braceKey')));
  };
  HUD.show = (on) => root.classList.toggle('is-hidden', !on);

  let lastHp = 150, lagHp = 150, lastW = null, lastTier = -1;
  HUD.update = (dt, ctx) => {
    const p = ctx.player;
    if (!p) return;
    const hpK = Math.max(0, p.hp) / p.maxHp;
    if (p.hp < lastHp) lagHp = Math.max(lagHp, lastHp); lastHp = p.hp;
    lagHp = Math.max(p.hp, lagHp - dt * 40);
    el.hp.style.width = hpK * 100 + '%';
    el.hpLag.style.width = (lagHp / p.maxHp) * 100 + '%';
    el.hpHeal.style.width = Math.min(1, (p.hp + p.heal) / p.maxHp) * 100 + '%';
    el.st.style.width = (p.stam / p.maxStam) * 100 + '%';
    el.vitals.classList.toggle('low', hpK < 0.3);
    el.vitals.classList.toggle('tired', p.stam < 20);
    const tier = EW.progress.weaponTier(p.kind);
    if (lastW !== p.kind || tier !== lastTier) { lastW = p.kind; lastTier = tier; el.emblem.replaceChildren(EW.ui.icon('w:' + p.kind + tier, () => window.Art.weaponIcon(p.kind, tier, 96))); }
    const lv = p.state === 'charge' ? p.chargeLv : 0;
    el.pips.classList.toggle('on', p.state === 'charge');
    [...el.pips.children].forEach((s, i) => s.classList.toggle('lit', i < lv));
    // hunt-only widgets
    const hunt = EW.hunt;
    el.potion.style.display = hunt ? '' : 'none';
    el.quest.style.display = hunt ? '' : 'none';
    if (hunt) {
      el.potN.textContent = '×' + p.potions;
      el.potion.classList.toggle('empty', p.potions <= 0);
      el.qName.textContent = t('boss.' + hunt.quest.boss + '.quest');
      el.qTime.textContent = EW.ui.fmtTime(hunt.quest.limit - hunt.time);
      el.qFaints.replaceChildren(...Array.from({ length: hunt.quest.faints }, (_, i) => h('span.mark' + (i < hunt.faints ? '.lost' : ''))));
      const b = hunt.boss;
      const showBoss = b.engaged && b.state !== 'dead' && !b.lost;
      el.boss.classList.toggle('on', showBoss);
      if (showBoss) {
        el.bossName.textContent = t('boss.' + hunt.quest.boss);
        const st = b.state === 'exhausted' ? 'bstate.exhausted' : b.state === 'topple' ? 'bstate.down' : b.state === 'stun' ? 'bstate.stunned' : b.phase === 2 ? 'bstate.enraged' : '';
        el.bossState.textContent = st ? t(st) : '';
        el.boss.classList.toggle('enraged', b.phase === 2);
      }
      // lock-on reticle
      if (EW.cam.lock && showBoss) {
        const sp = b.spheres().find((s) => s.part === 'head') || { x: b.x, y: b.y + 8, z: b.z };
        const pr = E.project(sp.x, sp.y, sp.z);
        el.reticle.style.display = pr.ok ? '' : 'none'; el.reticle.style.transform = `translate(${pr.x}px, ${pr.y}px)`;
      } else el.reticle.style.display = 'none';
      // mount meter
      const m = b.mount;
      el.mount.classList.toggle('on', !!m);
      if (m) { el.mFill.style.width = Math.min(100, m.meter) + '%'; el.mBrace.classList.toggle('on', m.tele > 0 || m.thrash > 0); el.mBrace.classList.toggle('ok', !!p.braced); }
      el.lock.style.display = 'none';
    } else { el.boss.classList.remove('on'); el.reticle.style.display = 'none'; el.mount.classList.remove('on'); }
    // interaction prompt
    const it = ctx.interact;
    if (it) {
      if (el.prompt.__key !== it.label) { el.prompt.__key = it.label; el.prompt.replaceChildren(EW.ui.glyph('interact'), h('span', t(it.label))); }
      const pr = E.project(it.x, EW.world.heightAt(it.x, it.z) + (it.y || 2.5), it.z);
      el.prompt.classList.add('on'); el.prompt.style.transform = `translate(${pr.x}px, ${pr.y}px)`;
    } else { el.prompt.classList.remove('on'); el.prompt.__key = null; }
    // damage numbers
    for (let i = HUD.nums.length - 1; i >= 0; i--) {
      const n = HUD.nums[i]; n.t += dt;
      const pr = E.project(n.x, n.y + n.t * 1.2, n.z);
      n.el.style.transform = `translate(${pr.x}px, ${pr.y}px) scale(${n.t < 0.08 ? 1.5 : 1})`;
      n.el.style.opacity = pr.ok ? Math.min(1, (0.9 - n.t) * 3) : 0;
      if (n.t > 0.9) { n.el.remove(); HUD.nums.splice(i, 1); }
    }
    el.vignette.style.opacity = Math.max(0, (HUD.hurtT || 0)) + (hpK < 0.3 ? 0.25 + Math.sin(E.time * 5) * 0.1 : 0);
    HUD.hurtT = Math.max(0, (HUD.hurtT || 0) - dt * 1.5);
  };

  HUD.dmg = (x, y, z, n, weak, armored) => {
    if (!EW.save.setting('dmgNums')) return;
    const d = h('div.num' + (weak ? '.weak' : '') + (armored ? '.armored' : ''), String(n));
    el.numLayer.append(d);
    HUD.nums.push({ el: d, x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), t: 0 });
  };
  HUD.hurt = (d, fire, chip) => { HUD.hurtT = Math.min(0.8, (HUD.hurtT || 0) + (chip ? 0.1 : 0.35)); el.vignette.classList.toggle('fire', !!fire); };
  HUD.notice = (key, kind = '', vars) => {
    const n = h('div.notice-line' + (kind ? '.' + kind : ''), h('span.nl-orn'), h('span', t(key, vars)), h('span.nl-orn'));
    el.notices.append(n);
    while (el.notices.children.length > 3) el.notices.firstChild.remove();
    setTimeout(() => n.classList.add('out'), 2600); setTimeout(() => n.remove(), 3200);
  };
  HUD.flash = (kind) => { const f = h('div.flash-word.' + kind, t('flash.' + kind)); el.notices.append(f); setTimeout(() => f.remove(), 900); };
  const seenTips = new Set();
  HUD.tip = (key) => {
    if (seenTips.has(key)) return; seenTips.add(key);
    const tip = h('div.tip', h('div.tip-k', t('tip.title')), h('div.tip-b', { html: t(key).replace(/\{(\w+)\}/g, (m, a) => `<span class="glyph">${EW.input.glyphText(a)}</span>`) }));
    el.tips.append(tip); setTimeout(() => tip.classList.add('out'), 7500); setTimeout(() => tip.remove(), 8200);
  };
  HUD.areaCard = (k1, k2) => {
    el.area.replaceChildren(h('div.ac-orn'), h('div.ac-title', t(k1)), h('div.ac-sub', t(k2)), h('div.ac-orn'));
    el.area.classList.remove('on'); void el.area.offsetWidth; el.area.classList.add('on');
  };
  HUD.bossCard = (b) => {
    el.area.replaceChildren(h('div.ac-kicker', t('size.' + b.size)), h('div.ac-title.boss', t('boss.gravemaw')), h('div.ac-sub', t('boss.gravemaw.title')));
    el.area.classList.remove('on'); void el.area.offsetWidth; el.area.classList.add('on', 'boss');
    setTimeout(() => el.area.classList.remove('boss'), 5000);
  };
  HUD.banner = (k1, k2) => {
    el.banner.replaceChildren(h('div.bn-title', t(k1)), h('div.bn-sub', t(k2)));
    el.banner.classList.remove('on'); void el.banner.offsetWidth; el.banner.classList.add('on');
  };
  HUD.loot = (id, n) => {
    const r = h('div.loot-row', EW.ui.matIcon(id), h('span', t('mat.' + id)), h('b', '×' + n));
    el.loot.append(r); setTimeout(() => r.classList.add('out'), 3200); setTimeout(() => r.remove(), 3800);
  };
  HUD.clear = () => { el.notices.replaceChildren(); el.tips.replaceChildren(); el.loot.replaceChildren(); el.numLayer.replaceChildren(); HUD.nums.length = 0; el.area.classList.remove('on'); el.banner.classList.remove('on'); };
  HUD.init = build;
})();
