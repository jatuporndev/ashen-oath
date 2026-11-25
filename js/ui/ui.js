// UI Manager — every menu is a physical object of the world (parchment, carved wood, leather,
// forged iron) driven like a console game: focus navigation with keyboard / mouse / gamepad,
// glyph hints, screen stack, atmospheric transitions. Text comes from the Localization System.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const A = window.Art, t = (k, v) => EW.t(k, v);
  const UI = (EW.ui = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function h(tag, attrs, ...children) {
    if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { if (attrs != null) children.unshift(attrs); attrs = {}; }
    const [name, ...cls] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (cls.length) el.className = cls.join(' ');
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }
  UI.h = h;
  const img = (canvas, cls = 'art') => { const i = h('img.' + cls); i.src = canvas.toDataURL(); i.draggable = false; return i; };
  const iconCache = new Map();
  const icon = (key, make) => { if (!iconCache.has(key)) iconCache.set(key, make().toDataURL()); const i = h('img.icon'); i.src = iconCache.get(key); i.draggable = false; return i; };
  UI.matIcon = (id) => icon('m:' + id, () => A.materialIcon(id));
  UI.icon = icon;

  // ------------------------------------------------------------------ painted materials → CSS
  UI.initArt = () => {
    const root = document.documentElement.style;
    const url = (c) => `url(${c.toDataURL()})`;
    root.setProperty('--tex-parchment', url(A.parchment(720, 900, { seed: 7 })));
    root.setProperty('--tex-parchment-wide', url(A.parchment(1200, 760, { seed: 8 })));
    root.setProperty('--tex-note', url(A.parchment(320, 220, { seed: 9 })));
    root.setProperty('--tex-wood', url(A.wood(1024, 640, { base: '#4a3020', n: 7 })));
    root.setProperty('--tex-leather', url(A.leather(512, 512)));
    root.setProperty('--tex-frame', url(A.ironFrame(120)));
    root.setProperty('--tex-divider', url(A.divider(420, 28)));
    root.setProperty('--tex-seal', url(A.waxSeal(120)));
    root.setProperty('--tex-crest', url(A.crest(220)));
  };

  // ------------------------------------------------------------------ the smith at work
  // shown while a new hero sheet is baked in slices (weapon swap / upgrade, armour change): the hammer
  // rings on the anvil in time with the animation and a thin bar fills — the game never looks frozen.
  UI.busy = false;
  UI.forging = (job, what = 'weapon') => {
    if (!job) return Promise.resolve();
    const fill = h('span.fg-fill'), pct = h('span.fg-pct', '0%');
    const art = h('div.fg-art'); art.innerHTML = '<svg viewBox="0 0 120 90" width="150" height="112" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">'
      + '<path class="fg-anvil" d="M22 52h70c0 8-8 12-18 12v8h10v6H36v-6h10v-8c-14 0-24-6-24-12z"/><path class="fg-anvil" d="M92 52l14-4"/>'
      + '<g class="fg-hammer"><path d="M104 40H66"/><path d="M56 30h10v20H56z"/></g>'
      + '<g class="fg-sparks"><circle cx="54" cy="48" r="1.6"/><circle cx="46" cy="40" r="1.2"/><circle cx="62" cy="38" r="1.3"/><circle cx="40" cy="47" r="1"/></g></svg>';
    const el = h('div.forging', h('div.fg-panel', art, h('div.fg-title', t('forge.busy.' + what)), h('div.fg-sub', t('forge.busy.sub')), h('div.fg-bar', fill), pct));
    document.body.append(el); requestAnimationFrame(() => el.classList.add('on'));
    UI.busy = true;
    const ring = setInterval(() => EW.audio.sfx('anvil', { vol: 0.32 }), 560); // in time with the hammer (0.56 s)
    let raf = 0;
    const tick = () => { const k = Math.round(job.progress() * 100); fill.style.width = k + '%'; pct.textContent = k + '%'; raf = requestAnimationFrame(tick); };
    tick();
    const t0 = performance.now();
    const end = () => new Promise((res) => setTimeout(res, Math.max(0, 700 - (performance.now() - t0)))).then(() => {
      clearInterval(ring); cancelAnimationFrame(raf); UI.busy = false;
      EW.audio.sfx('anvil', { vol: 0.6 });
      el.classList.remove('on'); setTimeout(() => el.remove(), 400);
    });
    return job.promise.then(end, (e) => { end(); throw e; });
  };

  // ------------------------------------------------------------------ input routing
  const layer = document.getElementById('ui');
  const stack = [];
  const top = () => stack[stack.length - 1];
  UI.top = top; UI.isOpen = () => stack.length > 0;
  const screens = (UI.screens = {});
  EW.input.onRaw = (r) => {
    EW.audio.unlock();
    if (r.up || UI.busy) return;
    const s = top();
    if (s) {
      let ev = null;
      if (r.src === 'kb') {
        const dir = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[r.code];
        if (dir) ev = { type: 'nav', dir };
        else if (['Enter', 'Space', 'NumpadEnter'].includes(r.code)) ev = { type: 'confirm' };
        else if (['Escape', 'Backspace'].includes(r.code)) ev = { type: 'back' };
        else if (r.code === 'KeyQ') ev = { type: 'tab', dir: -1 };
        else if (r.code === 'KeyE') ev = { type: 'tab', dir: 1 };
        else if (r.code === 'KeyX') ev = { type: 'alt' };
        if (!r.repeat) s.onInput({ type: 'any' });
      } else if (r.src === 'pad') {
        const P = EW.input.PAD;
        if ([P.UP, P.DOWN, P.LEFT, P.RIGHT].includes(r.btn)) return;
        ev = { [P.A]: { type: 'confirm' }, [P.B]: { type: 'back' }, [P.MENU]: { type: 'start' }, [P.LB]: { type: 'tab', dir: -1 }, [P.RB]: { type: 'tab', dir: 1 }, [P.X]: { type: 'alt' } }[r.btn] || null;
        s.onInput({ type: 'any' });
      } else if (r.src === 'mouse') s.onInput({ type: 'any' });
      if (ev) s.onInput(ev);
      return;
    }
    EW.game && EW.game.onRaw(r);
  };
  EW.input.onNav = (dir) => { const s = top(); if (s) s.onInput({ type: 'nav', dir }); };

  // ------------------------------------------------------------------ focus navigation
  class FocusNav {
    constructor(root, { cols = 1, onFocus } = {}) {
      this.root = root; this.cols = cols; this.onFocus = onFocus; this.index = 0;
      root.addEventListener('mousemove', (e) => { const it = e.target.closest && e.target.closest('[data-focus]'); if (!it || !root.contains(it)) return; const i = this.items().indexOf(it); if (i >= 0 && i !== this.index) this.focus(i, { scroll: false }); });
      root.addEventListener('click', (e) => { const it = e.target.closest && e.target.closest('[data-focus]'); if (!it || !root.contains(it) || e.target.closest('.arrow')) return; const i = this.items().indexOf(it); if (i >= 0) { this.focus(i, { sound: false }); this.activate(); } });
    }
    items() { return [...this.root.querySelectorAll('[data-focus]')].filter((el) => el.offsetParent !== null); }
    current() { return this.items()[this.index]; }
    focus(i, { sound = true, scroll = true } = {}) {
      const list = this.items(); if (!list.length) return;
      i = clamp(i, 0, list.length - 1);
      const prev = list[this.index];
      this.root.querySelectorAll('.is-focused').forEach((el) => el.classList.remove('is-focused'));
      this.index = i; const el = list[i]; el.classList.add('is-focused');
      if (scroll && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      if (sound && prev !== el) EW.audio.sfx('uiMove');
      this.onFocus && this.onFocus(el);
    }
    refresh() { const n = this.items().length; if (n) this.focus(Math.min(this.index, n - 1), { sound: false, scroll: false }); }
    move(dir) {
      const list = this.items(); if (!list.length) return;
      const cur = list[this.index];
      if ((dir === 'left' || dir === 'right') && cur && cur.__adjust) { cur.__adjust(dir === 'left' ? -1 : 1); return; }
      const step = this.cols > 1 ? { left: -1, right: 1, up: -this.cols, down: this.cols }[dir] : { up: -1, down: 1 }[dir];
      if (!step) return;
      let i = this.index + step;
      if (this.cols > 1) { if (i < 0 || i >= list.length) return; } else i = (i + list.length) % list.length;
      this.focus(i);
    }
    activate() { const c = this.current(); if (c && c.__activate && !c.classList.contains('is-disabled')) c.__activate(); else if (c) EW.audio.sfx('fail', { vol: 0.3 }); }
  }
  UI.FocusNav = FocusNav;

  class Screen {
    constructor(name, cls) { this.name = name; this.el = h(`section.screen.${cls}`); layer.append(this.el); screens[name] = this; }
    enter(p) { this.params = p; this.build(p); this.el.classList.add('is-visible'); this.el.classList.remove('is-under'); }
    exit() { this.el.classList.remove('is-visible', 'is-under'); }
    cover() { this.el.classList.add('is-under'); }
    uncover() { this.el.classList.remove('is-under'); this.el.classList.add('is-visible'); if (this.rebuildOnUncover) this.build(this.params); else this.nav && this.nav.refresh(); }
    build() {}
    relang() { this.build(this.params); }
    onInput(e) {
      if (e.type === 'tab' && this.tab) return this.tab(e.dir);
      if (e.type === 'alt' && this.alt) return this.alt();
      if (!this.nav) { if (e.type === 'back') this.back(); else if (e.type === 'confirm' && this.confirm) this.confirm(); return; }
      if (e.type === 'nav') this.nav.move(e.dir);
      else if (e.type === 'confirm') this.nav.activate();
      else if (e.type === 'back') this.back();
      else if (e.type === 'start') this.start ? this.start() : this.back();
    }
    back() {}
    setNav(root, o) { const idx = this.nav ? this.nav.index : 0; this.nav = new FocusNav(root, o); this.nav.index = this.keepIndex ? idx : 0; requestAnimationFrame(() => this.nav.refresh()); }
  }
  UI.Screen = Screen;
  UI.open = (name, p) => { const s = screens[name]; const tp = top(); if (tp) tp.cover(); stack.push(s); s.enter(p); EW.audio.sfx('uiOpen', { vol: 0.5 }); sync(); };
  UI.close = () => { const s = stack.pop(); if (s) s.exit(); const tp = top(); if (tp) tp.uncover(); sync(); };
  UI.reset = (name, p) => { while (stack.length) stack.pop().exit(); if (name) UI.open(name, p); sync(); };
  function sync() { EW.game && EW.game.syncChrome(); document.body.classList.toggle('ui-open', stack.length > 0); }
  UI.sync = sync;
  EW.bus.on('lang', () => { for (const s of stack) s.relang(); EW.hud && EW.hud.relang(); });

  const fadeEl = document.getElementById('fade');
  UI.fadeThrough = (fn, { hold = 400, out = 650, card } = {}) => new Promise((res) => {
    fadeEl.style.transitionDuration = out + 'ms'; fadeEl.classList.add('is-on');
    fadeEl.querySelector('.fade-card').innerHTML = card ? `<div class="fc-title">${card[0]}</div><div class="fc-sub">${card[1] || ''}</div>` : '';
    setTimeout(() => { fn(); setTimeout(() => { fadeEl.classList.remove('is-on'); res(); }, hold); }, out);
  });

  // ------------------------------------------------------------------ widgets
  UI.glyph = (action) => h('span.glyph', { 'data-action': action }, EW.input.glyphText(action));
  EW.input.onDevice(() => document.querySelectorAll('.glyph[data-action]').forEach((g) => { g.textContent = EW.input.glyphText(g.dataset.action); }));
  function hints(list) { return h('div.hints', list.map(([action, key, fn]) => { const it = h('span.hint', UI.glyph(action), h('span', t(key))); if (fn) it.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return it; })); }
  UI.hints = hints;
  function menuItem(label, onSelect, { sub, sound = 'uiConfirm', disabled } = {}) {
    const el = h('button.menu-item', { 'data-focus': true, type: 'button', tabindex: -1 }, h('span.mi-gem'), h('span.lbl', label), sub ? h('span.sub', sub) : null);
    if (disabled) el.classList.add('is-disabled');
    el.__activate = () => { EW.audio.sfx(sound); onSelect && onSelect(); };
    return el;
  }
  const ICON_L = '<svg viewBox="0 0 10 10"><path d="M6.5 1 2.5 5l4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  const ICON_R = '<svg viewBox="0 0 10 10"><path d="M3.5 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  function rowShell(label, desc) { const el = h('div.row', { 'data-focus': true }, h('span.row-label', label)); el.__desc = desc; return el; }
  function selectRow({ label, desc, options, get, set }) {
    const el = rowShell(label, desc), text = h('span.text');
    const l = h('span.arrow', { html: ICON_L }), r = h('span.arrow', { html: ICON_R });
    el.append(h('span.value', l, text, r));
    const idx = () => Math.max(0, options.findIndex((o) => o.value === get()));
    el.refresh = () => { const i = idx(); text.textContent = options[i].label; l.classList.toggle('is-off', i <= 0); r.classList.toggle('is-off', i >= options.length - 1); };
    el.__adjust = (d) => { const i = idx() + d; if (i < 0 || i >= options.length) return; set(options[i].value); EW.audio.sfx('uiAdjust'); el.refresh(); };
    el.__activate = () => { const i = (idx() + 1) % options.length; set(options[i].value); EW.audio.sfx('uiAdjust'); el.refresh(); };
    l.addEventListener('click', (e) => { e.stopPropagation(); el.__adjust(-1); });
    r.addEventListener('click', (e) => { e.stopPropagation(); el.__adjust(1); });
    el.refresh(); return el;
  }
  const S = EW.save;
  const settingSelect = (key, options, o = {}) => selectRow(Object.assign({ label: t('set.' + key), desc: t('set.' + key + '.d'), options, get: () => S.setting(key), set: (v) => S.setSetting(key, v) }, o));
  const onOff = () => [{ value: false, label: t('ui.off') }, { value: true, label: t('ui.on') }];
  function sliderRow({ key, min, max, step, format = String }) {
    const el = rowShell(t('set.' + key), t('set.' + key + '.d'));
    const fill = h('span.fill'), knob = h('span.knob'), num = h('span.slider-num'), slider = h('span.slider', h('span.track'), fill, knob);
    el.append(h('span.value', slider, num));
    el.refresh = () => { const k = (S.setting(key) - min) / (max - min); fill.style.width = k * 100 + '%'; knob.style.left = k * 100 + '%'; num.textContent = format(S.setting(key)); };
    const setV = (v) => { v = clamp(Math.round(v / step) * step, min, max); if (v === S.setting(key)) return; S.setSetting(key, v); el.refresh(); EW.audio.sfx('uiAdjust'); };
    el.__adjust = (d) => setV(S.setting(key) + d * step);
    const fromMouse = (e) => { const r = slider.getBoundingClientRect(); setV(min + clamp((e.clientX - r.left) / r.width, 0, 1) * (max - min)); };
    slider.addEventListener('mousedown', (e) => { e.stopPropagation(); fromMouse(e); const mm = (ev) => fromMouse(ev), mu = () => { removeEventListener('mousemove', mm); removeEventListener('mouseup', mu); }; addEventListener('mousemove', mm); addEventListener('mouseup', mu); });
    el.refresh(); return el;
  }
  const costList = (cost) => h('div.cost', Object.entries(cost).map(([id, n]) => {
    const have = EW.progress.count(id), ok = have >= n;
    return h('div.cost-item' + (ok ? '' : '.is-short'), UI.matIcon(id), h('span.cost-name', t('mat.' + id)), h('span.cost-num', id === 'crowns' ? `${n}` : `${have} / ${n}`));
  }));
  const fmtTime = (s) => { s = Math.floor(s || 0); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  UI.fmtTime = fmtTime;
  const stars = (n, max = 5) => h('span.stars', Array.from({ length: max }, (_, i) => h('span.star' + (i < n ? '.on' : ''))));
  const crownsEl = () => h('div.purse', UI.matIcon('crowns'), h('span', EW.progress.count('crowns').toLocaleString()), h('span.purse-l', t('mat.crowns')));
  UI.toast = (text, kind = '') => { const el = h('div.toast' + (kind ? '.' + kind : ''), text); document.getElementById('toasts').append(el); setTimeout(() => el.classList.add('out'), 2200); setTimeout(() => el.remove(), 2800); };

  // =================================================================== LANGUAGE (first launch)
  class LangScreen extends Screen {
    constructor() { super('lang', 'lang-screen'); }
    build(p) {
      this.fromSettings = p && p.fromSettings;
      const list = h('div.lang-list',
        this.opt('th', 'ไทย', 'ภาษาไทย'),
        this.opt('en', 'English', 'English'));
      this.el.replaceChildren(h('div.scrim.scrim-deep'), h('div.lang-wrap', h('div.crest'), h('div.lang-title', 'เลือกภาษา  ·  Choose Language'), h('div.divider'), list, h('div.lang-note', 'เปลี่ยนได้ภายหลังในการตั้งค่า  ·  You can change this later in Settings')), h('div.hints', h('span.hint', UI.glyph('confirm'), 'ยืนยัน / Confirm')));
      this.setNav(list);
      requestAnimationFrame(() => { const cur = EW.lang === 'en' ? 1 : 0; this.nav.focus(cur, { sound: false }); });
    }
    opt(code, big, small) {
      const el = h('button.lang-opt', { 'data-focus': true, type: 'button', lang: code }, h('span.lo-big', big), h('span.lo-small', small));
      el.__activate = () => { EW.audio.sfx('uiConfirm'); EW.setLang(code); if (this.fromSettings) UI.close(); else EW.game.afterLanguage(); };
      return el;
    }
    back() { if (this.fromSettings) { EW.audio.sfx('uiBack'); UI.close(); } }
  }

  // =================================================================== TITLE + MAIN MENU
  class TitleScreen extends Screen {
    constructor() { super('title', 'title-screen'); }
    build() {
      const has = S.hasGame();
      const list = h('nav.main-menu',
        menuItem(t('menu.continue'), () => EW.game.continueGame(), { disabled: !has, sub: has ? t('menu.continue.sub', { hunts: S.stored.hunts, crowns: S.stored.crowns }) : t('menu.continue.none') }),
        menuItem(t('menu.new'), () => { if (has) UI.open('confirm', { title: t('confirm.new'), body: t('confirm.new.body'), yes: () => EW.game.newGame() }); else EW.game.newGame(); }),
        menuItem(t('menu.settings'), () => UI.open('settings')),
        menuItem(t('menu.exit'), () => UI.open('confirm', { title: t('confirm.exit'), body: t('confirm.exit.body'), yes: () => EW.game.exit() }), { sound: 'uiBack' }));
      this.el.replaceChildren(
        h('div.scrim.scrim-title'),
        h('div.title-block', h('div.crest.crest-sm'), h('h1.logo', h('span.logo-main', 'EMBERWILD'), h('span.logo-sub', t('game.subtitle'))), h('div.divider.left'), list),
        h('div.title-foot', h('span', t('game.version')), h('span', '·'), h('span', t('game.tag'))),
        hints([['confirm', 'ui.select'], ['move', 'ui.navigate']]));
      this.setNav(list);
      requestAnimationFrame(() => this.nav.focus(has ? 0 : 1, { sound: false }));
    }
  }

  // =================================================================== CONFIRM (parchment writ)
  class ConfirmScreen extends Screen {
    constructor() { super('confirm', 'confirm-screen'); }
    build(p) {
      const list = h('div.writ-actions',
        menuItem(p.yesLabel || t('ui.yes'), () => { UI.close(); p.yes && p.yes(); }),
        menuItem(p.noLabel || t('ui.no'), () => { UI.close(); p.no && p.no(); }, { sound: 'uiBack' }));
      this.el.replaceChildren(h('div.scrim'), h('div.writ', h('div.writ-title', p.title), h('div.divider'), h('p.writ-body', p.body || ''), list, h('div.writ-seal')));
      this.setNav(list, { cols: 2 });
      requestAnimationFrame(() => this.nav.focus(1, { sound: false }));
    }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
  }

  // =================================================================== SETTINGS
  const SET_TABS = ['gameplay', 'camera', 'audio', 'language', 'controls'];
  class SettingsScreen extends Screen {
    constructor() { super('settings', 'settings-screen'); this.tabI = 0; this.keepIndex = false; }
    build() {
      const tabs = h('div.tabs', SET_TABS.map((k, i) => { const el = h('button.tab' + (i === this.tabI ? '.on' : ''), { type: 'button' }, t('tab.' + k)); el.onclick = () => { this.tabI = i; EW.audio.sfx('paper'); this.build(); }; return el; }));
      const body = h('div.rows'); const desc = h('div.row-desc');
      const k = SET_TABS[this.tabI];
      if (k === 'gameplay') body.append(
        settingSelect('dmgNums', onOff()), settingSelect('lockAssist', onOff()), settingSelect('subtitles', onOff()),
        settingSelect('subSize', [{ value: 'small', label: t('ui.small') }, { value: 'medium', label: t('ui.medium') }, { value: 'large', label: t('ui.large') }]));
      if (k === 'camera') body.append(sliderRow({ key: 'sens', min: 1, max: 20, step: 1 }), sliderRow({ key: 'padSens', min: 1, max: 20, step: 1 }), settingSelect('invertY', onOff()), sliderRow({ key: 'fov', min: 40, max: 70, step: 5, format: (v) => v + '°' }), settingSelect('shake', onOff()), settingSelect('filter', onOff()));
      if (k === 'audio') body.append(sliderRow({ key: 'master', min: 0, max: 100, step: 5 }), sliderRow({ key: 'music', min: 0, max: 100, step: 5 }), sliderRow({ key: 'sfx', min: 0, max: 100, step: 5 }));
      if (k === 'language') {
        body.append(selectRow({ label: t('set.lang'), desc: t('set.lang.d'), options: [{ value: 'th', label: 'ไทย' }, { value: 'en', label: 'English' }], get: () => EW.lang, set: (v) => { EW.setLang(v); } }));
      }
      if (k === 'controls') {
        const rows = [['move', 'ctl.move'], ['camera', 'ctl.camera'], ['zoom', 'ctl.zoom'], ['attack', 'ctl.attack'], ['skill', 'ctl.skill'], ['dodge', 'ctl.dodge'], ['jump', 'ctl.jump'], ['sprint', 'ctl.sprint'], ['potion', 'ctl.potion'], ['interact', 'ctl.interact'], ['lockon', 'ctl.lockon'], ['pause', 'ctl.pause']];
        body.append(...rows.map(([a, key]) => { const el = rowShell(t(key), t(key + '.d')); el.append(h('span.value', UI.glyph(a))); return el; }));
        body.append(h('div.weapon-notes', EW.weaponKinds.map((w) => h('div.wn', h('div.wn-title', t('wpn.' + w)), h('div.wn-body', t('wpn.' + w + '.controls'))))));
      }
      this.el.replaceChildren(h('div.scrim'),
        h('div.ledger', h('div.ledger-head', h('div.ledger-title', t('menu.settings')), tabs), h('div.ledger-body', body, desc)),
        hints([['tabs', 'ui.tabs', () => this.tab(1)], ['adjust', 'ui.adjust'], ['back', 'ui.back', () => this.back()]]));
      this.setNav(body, { onFocus: (el) => { desc.textContent = el.__desc || ''; } });
    }
    tab(d) { this.tabI = (this.tabI + d + SET_TABS.length) % SET_TABS.length; EW.audio.sfx('paper'); this.build(); }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
  }

  // =================================================================== PAUSE
  class PauseScreen extends Screen {
    constructor() { super('pause', 'pause-screen'); }
    build() {
      const inHunt = !!EW.hunt;
      const list = h('nav.main-menu',
        menuItem(t('pause.resume'), () => UI.close()),
        menuItem(t('menu.settings'), () => UI.open('settings')),
        inHunt ? menuItem(t('pause.abandon'), () => UI.open('confirm', { title: t('confirm.abandon'), body: t('confirm.abandon.body'), yes: () => { UI.reset(); EW.game.returnToGuild(false); } }), { sound: 'uiBack' }) : null,
        menuItem(t('pause.title'), () => UI.open('confirm', { title: t('confirm.title'), body: inHunt ? t('confirm.title.hunt') : t('confirm.title.body'), yes: () => EW.game.quitToTitle() }), { sound: 'uiBack' }));
      const info = inHunt
        ? h('div.pause-info', h('div.pi-k', t('pause.quest')), h('div.pi-v', t('boss.' + EW.hunt.quest.boss + '.quest')), h('div.pi-k', t('pause.time')), h('div.pi-v', fmtTime(EW.hunt.time) + ' / ' + fmtTime(EW.hunt.quest.limit)), h('div.pi-k', t('pause.faints')), h('div.pi-v', `${EW.hunt.faints} / ${EW.hunt.quest.faints}`))
        : h('div.pause-info', h('div.pi-k', t('pause.location')), h('div.pi-v', t('area.hub')), h('div.pi-k', t('mat.crowns')), h('div.pi-v', EW.progress.count('crowns').toLocaleString()));
      this.el.replaceChildren(h('div.scrim.scrim-pause'), h('div.pause-block', h('div.pause-title', t('pause.paused')), h('div.divider.left'), list), info, hints([['confirm', 'ui.select'], ['back', 'pause.resume', () => UI.close()]]));
      this.setNav(list);
    }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
    start() { this.back(); }
  }

  // =================================================================== QUEST BOARD
  class QuestBoard extends Screen {
    constructor() { super('questboard', 'board-screen'); }
    build() {
      const qs = EW.data.quests, cur = EW.game.quest;
      // the small notes only pick a writ; the big sheet carries the Accept button
      const list = h('div.notes', qs.map((q, i) => {
        const b = EW.data.bosses[q.boss];
        const el = h('button.note', { 'data-focus': true, type: 'button', style: { '--rot': ((i % 2 ? 1 : -1) * 1.4) + 'deg' } }, h('span.pin'), h('span.note-rank', stars(b.stars)), h('span.note-name', t('boss.' + q.boss + '.quest')), h('span.note-loc', t('area.' + q.field)), cur && cur.id === q.id ? h('span.note-taken', t('qb.accepted')) : null);
        el.__q = q; el.__activate = () => { this.show(q); this.focusAction(); };
        return el;
      }));
      this.detail = h('div.notice');
      this.action = h('button.qb-accept', { 'data-focus': true, type: 'button' });
      this.action.__activate = () => this.accept(this.sel);
      const body = h('div.board-body', list, h('div.notice-wrap', this.detail, h('div.qb-actions', this.action)));
      this.el.replaceChildren(h('div.scrim'),
        h('div.board', h('div.board-head', h('div.board-title', t('qb.title')), h('div.board-sub', t('qb.sub'))), body),
        hints([['confirm', 'qb.pick'], ['back', 'ui.back', () => this.back()]]));
      this.setNav(body, { onFocus: (el) => { if (el.__q) this.show(el.__q); } });
    }
    focusAction() { const i = this.nav.items().indexOf(this.action); if (i >= 0) this.nav.focus(i); }
    show(q) {
      this.sel = q; this.arm = false;
      const b = EW.data.bosses[q.boss], cur = EW.game.quest;
      const taken = cur && cur.id === q.id;
      this.action.textContent = taken ? t('qb.cancel') : t('qb.accept');
      this.action.classList.toggle('cancel', !!taken); this.action.classList.remove('armed');
      const portrait = icon('portrait:' + q.boss, () => A.bossPortrait(A.gravemaw(), 560, 300));
      portrait.className = 'portrait';
      const atks = ['swipe', 'stomp', 'tail', 'charge', 'breath', 'leap', 'vent', 'roar'];
      this.detail.replaceChildren(
        h('div.n-head', h('div.n-kicker', t('qb.target')), h('div.n-name', t('boss.' + q.boss)), h('div.n-epithet', t('boss.' + q.boss + '.title'))),
        h('div.n-art', portrait, h('div.n-size', h('span', t('size.' + b.size)), h('span', t('qb.height', { n: b.heightMul })))),
        h('div.n-cols',
          h('div.n-col', h('div.n-k', t('qb.desc')), h('p.n-p', t('boss.' + q.boss + '.desc')), h('div.n-k', t('qb.habitat')), h('p.n-p', t('area.' + q.field) + ' — ' + t('area.' + q.field + '.desc')),
            h('div.n-k', t('qb.conditions')), h('p.n-p', t('qb.cond', { m: Math.round(q.limit / 60), f: q.faints }))),
          h('div.n-col', h('div.n-k', t('qb.attacks')), h('ul.n-list', atks.map((a) => h('li', h('b', t('atk.' + a)), ' — ', t('atk.' + a + '.d')))))),
        h('div.n-row',
          h('div.n-block', h('div.n-k', t('qb.weak')), h('div.weak', b.weak.map(([p, n]) => h('div.weak-i', h('span', t('part.' + p)), stars(n, 3))))),
          h('div.n-block', h('div.n-k', t('qb.rewards')), h('div.rewards', h('div.rw', UI.matIcon('crowns'), h('span', q.crowns + ' ' + t('mat.crowns'))), ...['gm_hide', 'gm_plate', 'gm_horn', 'gm_core'].map((m) => h('div.rw', UI.matIcon(m), h('span', t('mat.' + m))))))),
        h('div.n-diff', h('span', t('qb.threat')), stars(b.stars)),
        taken ? h('div.n-stamp', t('qb.accepted')) : null);
    }
    // no full-screen confirm: accepting closes the board (the HUD notice + guildmaster line confirm it);
    // cancelling is a two-tap on the same button
    accept(q) {
      if (!q) return;
      const cur = EW.game.quest;
      if (cur && cur.id === q.id) {
        if (!this.arm) { this.arm = true; this.action.classList.add('armed'); this.action.textContent = t('qb.cancel.again'); EW.audio.sfx('uiMove'); clearTimeout(this.armT); this.armT = setTimeout(() => { if (this.sel === q) this.show(q); }, 2600); return; }
        EW.game.cancelQuest(); this.build(); return;
      }
      EW.game.acceptQuest(q); UI.close();
    }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
  }

  // =================================================================== WEAPON WORKSHOP
  class WeaponShop extends Screen {
    constructor() { super('weapons', 'shop-screen'); this.keepIndex = true; }
    build() {
      const PR = EW.progress;
      const list = h('div.shop-list', EW.weaponKinds.map((k) => {
        const lvl = PR.weaponLvl(k), eq = EW.save.game.weapon === k;
        const el = h('button.shop-item', { 'data-focus': true, type: 'button' }, icon('w:' + k + PR.weaponTier(k), () => A.weaponIcon(k, PR.weaponTier(k), 96)), h('span.si-name', t(this.wname(k))), h('span.si-lvl', t('ws.level', { n: lvl })), eq ? h('span.si-eq', t('ws.equipped')) : null);
        el.__k = k; el.__activate = () => this.act(k);
        return el;
      }));
      this.detail = h('div.shop-detail');
      this.el.replaceChildren(h('div.scrim'),
        h('div.workbench', h('div.wb-head', h('div.wb-title', t('ws.title')), h('div.wb-sub', t('ws.sub')), crownsEl()), h('div.wb-body', list, this.detail)),
        hints([['confirm', 'ws.equip'], ['alt', 'ws.upgrade', () => this.alt()], ['back', 'ui.back', () => this.back()]]));
      this.setNav(list, { onFocus: (el) => this.show(el.__k) });
    }
    wname(k) { return EW.progress.weaponLvl(k) >= 4 ? 'wpn.' + k + '.ember' : 'wpn.' + k; }
    show(k) {
      const PR = EW.progress, lvl = PR.weaponLvl(k), next = PR.nextWeaponCost(k), W = EW.WEAPONS[k];
      const big = icon('wbig:' + k + PR.weaponTier(k), () => { const w = A.weapon(k, PR.weaponTier(k)); const c = document.createElement('canvas'); c.width = 240; c.height = 420; const x = c.getContext('2d'); const s = Math.min(200 / w.canvas.width, 400 / w.canvas.height) * (k === 'dual' ? 0.9 : 1); if (k === 'dual') { [-1, 1].forEach((d) => { x.save(); x.translate(120 + d * 34, 210); x.rotate(d * 0.18); x.drawImage(w.canvas, (-w.canvas.width * s * 1.6) / 2, (-w.canvas.height * s * 1.6) / 2, w.canvas.width * s * 1.6, w.canvas.height * s * 1.6); x.restore(); }); } else x.drawImage(w.canvas, 120 - (w.canvas.width * s) / 2, 210 - (w.canvas.height * s) / 2, w.canvas.width * s, w.canvas.height * s); return c; });
      big.className = 'weapon-big';
      const atk = PR.weaponAttack(k), nextAtk = next ? Math.round({ greatsword: 160, spear: 120, dual: 110 }[k] * EW.data.weaponMult[lvl + 1]) : null;
      this.detail.replaceChildren(
        h('div.sd-art', big),
        h('div.sd-info',
          h('div.sd-name', t(this.wname(k))), h('div.sd-class', t('wpn.' + k + '.class')), h('div.divider.left'),
          h('p.sd-desc', t('wpn.' + k + '.desc')),
          h('div.stat-rows',
            h('div.stat', h('span', t('ws.attack')), h('b', atk), nextAtk ? h('span.up', '→ ' + nextAtk) : null),
            h('div.stat', h('span', t('ws.lvl')), h('b', `${lvl} / 4`)),
            h('div.stat', h('span', t('ws.speed')), h('b', t('wpn.' + k + '.speed'))),
            h('div.stat', h('span', t('ws.bonus')), h('b', t('wpn.' + k + '.bonus')))),
          h('div.sd-k', t('ws.moves')), h('p.sd-moves', t('wpn.' + k + '.controls')),
          next ? h('div.sd-up', h('div.sd-k', lvl === 3 ? t('ws.forge', { name: t('wpn.' + k + '.ember') }) : t('ws.upgradeTo', { n: lvl + 1 })), costList(next), h('div.sd-can' + (PR.canAfford(next) ? '' : '.no'), PR.canAfford(next) ? t('ws.ready') : t('ws.missing'))) : h('div.sd-max', t('ws.max'))));
    }
    act(k) { if (EW.save.game.weapon === k) { EW.audio.sfx('uiBack', { vol: 0.4 }); return; } EW.progress.equipWeapon(k); this.build(); const done = () => { UI.toast(t('ws.equippedT', { name: t(this.wname(k)) })); }; const job = EW.game.player.setWeapon(k); if (job) UI.forging(job, 'weapon').then(done); else { EW.audio.sfx('anvil', { vol: 0.5 }); done(); } }
    alt() {
      const el = this.nav.current(); if (!el) return; const k = el.__k, PR = EW.progress, c = PR.nextWeaponCost(k);
      if (!c) return;
      if (!PR.canAfford(c)) { EW.audio.sfx('fail', { vol: 0.5 }); UI.toast(t('ws.missing'), 'bad'); return; }
      UI.open('confirm', { title: t('ws.confirm', { name: t(this.wname(k)) }), body: t('ws.confirm.body'), yes: () => { if (PR.upgradeWeapon(k)) { EW.audio.sfx('anvil'); setTimeout(() => EW.audio.sfx('anvil'), 260); UI.toast(t('ws.done', { name: t(this.wname(k)), n: PR.weaponLvl(k) }), 'good'); if (EW.save.game.weapon === k) UI.forging(EW.game.player.setWeapon(k), 'weapon'); this.build(); } } });
    }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
  }

  // =================================================================== ARMOR WORKSHOP
  class ArmorShop extends Screen {
    constructor() { super('armor', 'shop-screen armor'); this.keepIndex = true; }
    build() {
      const PR = EW.progress, D = EW.data;
      const list = h('div.shop-list', Object.keys(D.armor).map((id) => {
        const a = D.armor[id], own = PR.owns(id), eq = EW.save.game.armor.equip[a.slot] === id;
        const el = h('button.shop-item' + (own ? '' : '.is-locked'), { 'data-focus': true, type: 'button' }, icon('a:' + id, () => A.armorIcon(a.slot, a.set, 96)), h('span.si-name', t('arm.' + id)), h('span.si-lvl', own ? t('as.def', { n: PR.armorDef(id) }) + (PR.armorLvl(id) ? ` +${PR.armorLvl(id)}` : '') : t('as.notOwned')), eq ? h('span.si-eq', t('ws.equipped')) : null);
        el.__id = id; el.__activate = () => this.act(id);
        return el;
      }));
      this.detail = h('div.shop-detail');
      this.el.replaceChildren(h('div.scrim'),
        h('div.workbench', h('div.wb-head', h('div.wb-title', t('as.title')), h('div.wb-sub', t('as.sub')), crownsEl()), h('div.wb-body', list, this.detail)),
        hints([['confirm', 'as.primary'], ['alt', 'ws.upgrade', () => this.alt()], ['back', 'ui.back', () => this.back()]]));
      this.setNav(list, { onFocus: (el) => this.show(el.__id) });
    }
    show(id) {
      const PR = EW.progress, D = EW.data, a = D.armor[id], own = PR.owns(id), lvl = PR.armorLvl(id);
      const big = icon('abig:' + id, () => A.armorIcon(a.slot, a.set, 200)); big.className = 'armor-big';
      const skills = PR.skills();
      this.detail.replaceChildren(
        h('div.sd-art', big),
        h('div.sd-info',
          h('div.sd-name', t('arm.' + id)), h('div.sd-class', t('slot.' + a.slot) + ' · ' + t('aset.' + a.set)), h('div.divider.left'),
          h('p.sd-desc', t('arm.' + id + '.d')),
          h('div.stat-rows',
            h('div.stat', h('span', t('as.defense')), h('b', a.def + lvl * 3), own && lvl < D.armorMax ? h('span.up', '→ ' + (a.def + (lvl + 1) * 3)) : null),
            h('div.stat', h('span', t('ws.lvl')), h('b', own ? `${lvl} / ${D.armorMax}` : '—')),
            h('div.stat', h('span', t('as.total')), h('b', PR.defense()))),
          a.set === 'gravemaw' ? h('div.setbonus', h('div.sd-k', t('as.setbonus')), h('div.sb' + (skills.includes('fireward') ? '.on' : ''), h('b', t('skill.fireward')), ' — ', t('skill.fireward.d')), h('div.sb' + (skills.includes('emberheart') ? '.on' : ''), h('b', t('skill.emberheart')), ' — ', t('skill.emberheart.d'))) : null,
          !own ? h('div.sd-up', h('div.sd-k', t('as.craft')), costList(a.cost), h('div.sd-can' + (PR.canAfford(a.cost) ? '' : '.no'), PR.canAfford(a.cost) ? t('ws.ready') : t('ws.missing')))
            : lvl < D.armorMax ? h('div.sd-up', h('div.sd-k', t('ws.upgradeTo', { n: lvl + 1 })), costList(D.armorUp(lvl)), h('div.sd-can' + (PR.canAfford(D.armorUp(lvl)) ? '' : '.no'), PR.canAfford(D.armorUp(lvl)) ? t('ws.ready') : t('ws.missing'))) : h('div.sd-max', t('ws.max'))));
    }
    act(id) {
      const PR = EW.progress, a = EW.data.armor[id];
      if (!PR.owns(id)) {
        if (!PR.canAfford(a.cost)) { EW.audio.sfx('fail', { vol: 0.5 }); UI.toast(t('ws.missing'), 'bad'); return; }
        UI.open('confirm', { title: t('as.craftQ', { name: t('arm.' + id) }), body: t('as.craftBody'), yes: () => { if (PR.craftArmor(id)) { PR.equipArmor(id); UI.forging(EW.game.player.setPalette(), 'armor'); EW.audio.sfx('anvil'); UI.toast(t('as.crafted', { name: t('arm.' + id) }), 'good'); this.build(); } } });
        return;
      }
      if (EW.save.game.armor.equip[a.slot] === id) return;
      PR.equipArmor(id); const job = EW.game.player.setPalette(); if (job) UI.forging(job, 'armor'); else EW.audio.sfx('guard', { vol: 0.5 }); this.build();
    }
    alt() {
      const el = this.nav.current(); if (!el) return; const id = el.__id, PR = EW.progress;
      if (!PR.owns(id) || PR.armorLvl(id) >= EW.data.armorMax) return;
      const c = EW.data.armorUp(PR.armorLvl(id));
      if (!PR.canAfford(c)) { EW.audio.sfx('fail', { vol: 0.5 }); UI.toast(t('ws.missing'), 'bad'); return; }
      if (PR.upgradeArmor(id)) { EW.audio.sfx('anvil'); UI.toast(t('ws.done', { name: t('arm.' + id), n: PR.armorLvl(id) }), 'good'); this.build(); }
    }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
  }

  // =================================================================== STORAGE / INVENTORY
  class Inventory extends Screen {
    constructor() { super('inventory', 'inv-screen'); this.keepIndex = true; }
    build() {
      const PR = EW.progress, G = EW.save.game;
      const mats = Object.keys(EW.data.materials);
      const grid = h('div.inv-grid', ['crowns', ...mats].map((id) => {
        const n = PR.count(id);
        const el = h('div.slot' + (n ? '' : '.empty'), { 'data-focus': true }, UI.matIcon(id), h('span.slot-n', id === 'crowns' ? '' : n ? '×' + n : ''));
        el.__id = id; return el;
      }));
      const info = h('div.inv-info');
      const eq = h('div.inv-equip',
        h('div.sd-k', t('inv.loadout')),
        h('div.eq-row', icon('w:' + G.weapon + PR.weaponTier(G.weapon), () => A.weaponIcon(G.weapon, PR.weaponTier(G.weapon), 96)), h('span', t(PR.weaponLvl(G.weapon) >= 4 ? 'wpn.' + G.weapon + '.ember' : 'wpn.' + G.weapon)), h('b', t('ws.attack') + ' ' + PR.weaponAttack(G.weapon))),
        ...['head', 'chest', 'legs'].map((s) => { const id = G.armor.equip[s], a = EW.data.armor[id]; return h('div.eq-row', icon('a:' + id, () => A.armorIcon(a.slot, a.set, 96)), h('span', t('arm.' + id)), h('b', t('as.def', { n: PR.armorDef(id) }))); }),
        h('div.eq-total', h('span', t('as.total')), h('b', PR.defense())),
        h('div.eq-total', h('span', t('inv.hunts')), h('b', G.hunts)));
      this.el.replaceChildren(h('div.scrim'),
        h('div.chest-panel', h('div.wb-head', h('div.wb-title', t('inv.title')), h('div.wb-sub', t('inv.sub')), crownsEl()), h('div.inv-body', h('div.inv-left', grid, info), eq)),
        hints([['move', 'ui.navigate'], ['back', 'ui.back', () => this.back()]]));
      this.setNav(grid, { cols: 3, onFocus: (el) => { const id = el.__id, n = PR.count(id); info.replaceChildren(h('div.ii-name', t('mat.' + id)), h('div.ii-r', id === 'crowns' ? '' : stars(EW.data.materials[id].rarity, 4)), h('p.ii-d', t('mat.' + id + '.d')), h('div.ii-n', id === 'crowns' ? n.toLocaleString() : t('inv.owned', { n }))); } });
    }
    back() { EW.audio.sfx('uiBack'); UI.close(); }
  }

  // =================================================================== RESULTS (scroll)
  class Results extends Screen {
    constructor() { super('results', 'results-screen'); }
    build(r) {
      const row = (id, extra) => h('div.r-item', UI.matIcon(id), h('span', t('mat.' + id)), extra ? h('em', extra) : null);
      const list = h('div.r-actions', menuItem(t('res.return'), () => { UI.reset(); EW.game.returnToGuild(true); }));
      this.el.replaceChildren(h('div.scrim'),
        h('div.scroll',
          h('div.scroll-rod.top'),
          h('div.scroll-paper',
            h('div.r-kicker', t('res.kicker')), h('div.r-title', t('res.title')), h('div.r-sub', t('boss.' + EW.hunt.quest.boss + '.quest')), h('div.divider'),
            h('div.r-stats', h('div', h('span', t('res.time')), h('b', fmtTime(r.time))), h('div', h('span', t('res.faints')), h('b', r.faints)), h('div', h('span', t('res.breaks')), h('b', r.breaks.length))),
            h('div.r-cols',
              h('div.r-col', h('div.n-k', t('res.reward')), h('div.r-item', UI.matIcon('crowns'), h('span', `${r.crowns} ${t('mat.crowns')}`)), r.items.map((id) => row(id)),
                h('div.n-k', t('res.carved')), r.carved.length ? r.carved.map((id) => row(id)) : h('p.n-p', t('res.none'))),
              h('div.r-col', h('div.n-k', t('res.breakReward')), r.breaks.length ? r.breaks.map((id, i) => row(id, t('part.' + EW.hunt.breaks[i]))) : h('p.n-p', t('res.none')))),
            list),
          h('div.scroll-rod.bottom')),
        hints([['confirm', 'res.return']]));
      this.setNav(list);
      EW.audio.sfx('paper');
    }
  }
  class Failed extends Screen {
    constructor() { super('failed', 'failed-screen'); }
    build(p) {
      const list = h('div.r-actions', menuItem(t('res.return'), () => { UI.reset(); EW.game.returnToGuild(false); }));
      this.el.replaceChildren(h('div.scrim.scrim-fail'), h('div.fail-block', h('div.fail-title', t('fail.title')), h('div.divider'), h('div.fail-sub', t('fail.' + (p.reason || 'faints'))), list), hints([['confirm', 'res.return']]));
      this.setNav(list);
      EW.audio.sfx('fail');
    }
  }
  class Farewell extends Screen {
    constructor() { super('farewell', 'farewell-screen'); }
    build() { this.el.replaceChildren(h('div.scrim.scrim-deep'), h('div.fw', h('div.crest'), h('div.fw-title', t('fw.title')), h('div.fw-sub', t('fw.sub')))); }
  }

  UI.init = () => {
    UI.initArt();
    new LangScreen(); new TitleScreen(); new ConfirmScreen(); new SettingsScreen(); new PauseScreen();
    new QuestBoard(); new WeaponShop(); new ArmorShop(); new Inventory(); new Results(); new Failed(); new Farewell();
  };
})();
