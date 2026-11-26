// Co-op session — up to 4 hunters. The host opens their guild to friends (a 5-letter code); guests join
// from the title screen. The HOST is the authority for the boss (AI, hp, parts, mount, crystals, pillars,
// faints, quest timer); every hunter simulates their own body and sends a compact state ~10×/s.
//
// Cheap on the free Firebase plan by design:
//   • one node per hunter  rooms/{code}/p/{id} = { n, k, pl, tr, w, s:[state], e:[recent events] }
//   • one node for the host rooms/{code}/h      = { open, ph, q, t, fc, b:[boss snapshot] }
//   • writes are diffed per key (unchanged keys are not sent), idle hunters send nothing,
//     events ride along with the state write (kept ~1.2 s, receivers de-duplicate by seq) — no extra writes.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const E = EW.engine;
  const r2 = (v) => Math.round(v * 100) / 100;
  const RATE = 0.1;                 // state writes / s = 10
  const EVENT_KEEP = 1.2;           // seconds an event stays in the outbox
  const MAX = 4;
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PART_KEYS = ['head', 'horns', 'body', 'plates', 'core', 'forelegs', 'hindlegs', 'tail'];
  const DECALS = ['circle', 'ring', 'cone', 'lane'];

  const N = (EW.net = {
    active: false, role: null, code: null, T: null,
    id: Math.random().toString(36).slice(2, 10),
    peers: new Map(),   // id → { id, n, k, pl, tr, w, s, lastSeq, hunter }
    meta: null,         // host node as last seen (guests)
    out: [], seq: 0, sent: {}, acc: 0,
    get isHost() { return this.active && this.role === 'host'; },
    get isGuest() { return this.active && this.role === 'guest'; },
  });
  N.available = () => EW.netBackend() !== 'none';
  N.name = () => (EW.save.profile.name || (EW.save.profile.name = 'Hunter ' + Math.floor(100 + Math.random() * 900)));
  N.setName = (s) => { EW.save.profile.name = String(s || '').trim().slice(0, 16) || N.name(); EW.save.saveProfile(); };

  // ------------------------------------------------------------------ room lifecycle
  const room = (p = '') => 'rooms/' + N.code + (p ? '/' + p : '');
  function begin(role, code) {
    N.active = true; N.role = role; N.code = code; N.out = []; N.seq = 0; N.sent = {}; N.peers.clear(); N.meta = null; N.acc = 0;
    N.offKids = N.T.watchKids(room('p'), onPeer);
  }
  N.host = async () => {
    if (N.active) return N.code;
    N.T = EW.makeTransport(); if (!N.T) throw new Error('offline');
    await N.T.ready();
    let code = '';
    for (let i = 0; i < 6; i++) { code = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); if (!(await N.T.get('rooms/' + code + '/h'))) break; }
    begin('host', code);
    N.T.onDisconnectRemove(room());
    await N.T.update(room('h'), { v: 1, open: 1, ph: 'hub', q: null, hn: N.name(), host: N.id, at: Date.now() });
    writeSelf(true);
    EW.bus.emit('net', 'open');
    return code;
  };
  // → 'ok' | 'nf' (no such room) | 'full' | 'busy' (on a hunt) | 'offline'
  N.join = async (code) => {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return 'nf';
    if (N.active) N.leave();
    N.T = EW.makeTransport(); if (!N.T) return 'offline';
    try { await N.T.ready(); } catch (e) { N.T = null; return 'offline'; }
    const h = await N.T.get('rooms/' + code + '/h');
    if (!h || !h.open) { N.T.close(); N.T = null; return 'nf'; }
    if (h.ph !== 'hub') { N.T.close(); N.T = null; return 'busy'; }
    const ps = (await N.T.get('rooms/' + code + '/p')) || {};
    if (Object.keys(ps).length >= MAX) { N.T.close(); N.T = null; return 'full'; }
    begin('guest', code);
    N.T.onDisconnectRemove(room('p/' + N.id));
    N.offMeta = N.T.watch(room('h'), onMeta);
    writeSelf(true);
    EW.bus.emit('net', 'join');
    return 'ok';
  };
  N.leave = (why) => {
    if (!N.active) return;
    const T = N.T;
    try { if (N.isHost) T.remove(room()); else T.remove(room('p/' + N.id)); } catch (e) { /* offline */ }
    N.offKids && N.offKids(); N.offMeta && N.offMeta();
    for (const pr of N.peers.values()) pr.hunter && pr.hunter.dispose();
    N.peers.clear();
    N.active = false; N.role = null; N.code = null; N.meta = null;
    setTimeout(() => T.close(), 300);
    EW.bus.emit('net', why || 'left');
  };
  N.count = () => (N.active ? 1 + N.peers.size : 1);
  N.members = () => [{ id: N.id, n: N.name(), me: true, host: N.isHost, hp: EW.game.player ? EW.game.player.hp / EW.game.player.maxHp : 1, w: where() }]
    .concat([...N.peers.values()].map((p) => ({ id: p.id, n: p.n, host: N.meta ? N.meta.host === p.id : false, hp: p.s ? p.s[13] / 150 : 1, w: p.w })));
  N.setMeta = (o) => { if (N.isHost) N.T.update(room('h'), o); };
  N.partyReady = () => [...N.peers.values()].every((p) => p.w === 'hub');
  // hunters taking part in this hunt (host side): me + guests in the field
  N.hunters = (local) => {
    const out = [local];
    for (const p of N.peers.values()) if (p.w === 'field' && p.hunter && p.hunter.ready) out.push(p.hunter);
    return out;
  };
  N.party = () => N.isHost && [...N.peers.values()].some((p) => p.w === 'field');

  // ------------------------------------------------------------------ events
  // to: peer id, 'host', or '*'
  N.send = (msg, to = '*') => { if (!N.active) return; msg = JSON.parse(JSON.stringify(msg)); msg.q = ++N.seq; msg.to = to; msg.at = E.time; N.out.push(msg); N.dirty = true; };
  function onPeer(id, v) {
    if (id === N.id) return;
    let pr = N.peers.get(id);
    if (!v) { if (pr) { dropPeer(pr); N.peers.delete(id); EW.bus.emit('net', 'peers'); } return; }
    if (!pr) { pr = { id, lastSeq: 0 }; N.peers.set(id, pr); EW.bus.emit('net', 'peers'); EW.hud && EW.hud.notice('coop.joined', 'good', { name: v.n }); }
    const lookChanged = pr.k !== v.k || pr.pl !== v.pl || pr.tr !== v.tr;
    Object.assign(pr, { n: v.n, k: v.k, pl: v.pl, tr: v.tr, w: v.w });
    if (v.s) pr.s = v.s;
    if (!pr.hunter) pr.hunter = new EW.RemoteHunter(pr);
    if (lookChanged) pr.hunter.look(v.k, v.pl, v.tr);
    if (v.s) pr.hunter.apply(v.s);
    for (const m of v.e || []) {
      if (m.q <= pr.lastSeq) continue;
      pr.lastSeq = m.q;
      if (m.to === '*' || m.to === N.id || (m.to === 'host' && N.isHost)) { try { handle(m, pr); } catch (e) { console.error('net event', m, e); } }
    }
  }
  function dropPeer(pr) {
    const b = EW.hunt && EW.hunt.boss;
    if (N.isHost && b && b.mount && b.mount.rider === pr.hunter) { b.mount = null; b.thrashing = false; b.mountCd = E.time + 10; if (b.state === 'mounted') b.enter('stalk'); }
    pr.hunter && pr.hunter.dispose();
    EW.hud && EW.hud.notice('coop.left', 'warn', { name: pr.n || '?' });
  }
  function onMeta(h) {
    if (!h) { if (N.active) { N.leave('closed'); EW.game.onRoomClosed && EW.game.onRoomClosed(); } return; }
    const prev = N.meta; N.meta = h;
    const G = EW.game;
    if (G.state === 'hub' && (!prev || prev.q !== h.q)) G.setCoopQuest(h.q);
    if (EW.hunt && h.b && EW.hunt.boss.replica) EW.hunt.boss.applySnap(h.b);
    if (EW.hunt && h.t != null) { EW.hunt.time = h.t; EW.hunt.faints = h.fc || 0; }
  }

  function handle(m, pr) {
    const G = EW.game, hunt = EW.hunt, p = G.player, b = hunt && hunt.boss;
    switch (m.t) {
      // ---- host → guests
      case 'fx': replayFx(m.l, b); break;
      case 'hurt': if (hunt && p && where() === 'field') p.receive(m.h); break;
      case 'mt': if (b && p) { b.confirmMount(); if (p.state !== 'mounted') { p.setState('mounted'); p.vy = 0; } hunt.onMount(p); } break;
      case 'dm': if (b && p) b.dismountLocal(m); break;
      case 'cry': { const cr = EW.world.crystals[m.i]; if (cr) { N.applying = true; EW.world.igniteCrystal(cr); N.applying = false; } if (N.isHost) N.send({ t: 'cry', i: m.i }); break; }
      case 'pa': if (b && b.replica) b.addPatch(m.x, m.z); break;
      case 'depart': if (G.state === 'hub') G.coopDepart(m.qid); break;
      case 'fail': if (hunt && where() === 'field') hunt.fail(m.r); break;
      case 'abandon': if (hunt && where() === 'field') { EW.ui.reset(); G.returnToGuild(false); } break;
      // ---- guests → host
      case 'hit': if (N.isHost && b && b.state !== 'dead' && !(b.mount && b.mount.rider !== pr.hunter)) { b.flash = 0.09; b.takeHit(m.part, m.d, { breakMul: m.bm, stagger: m.sg }); if (hunt.stats) hunt.stats.dealt += m.d; } break;
      case 'plunge': case 'climb': if (N.isHost && b) b.remoteMount(pr.hunter, m.t, m.d); break;
      case 'stab': if (N.isHost && b && b.mount && b.mount.rider === pr.hunter) b.mountStab(pr.hunter); break;
      case 'faint': if (N.isHost && hunt) hunt.countFaint(); break;
    }
  }

  // ------------------------------------------------------------------ host: effect capture → guests
  // Boss sounds / shakes / dust / notices produced on the host are recorded and replayed on guests.
  let cap = null, depth = 0, paused = 0;
  const push = (e) => { if (cap && !paused) cap.push(e); };
  N.capture = (fn) => {
    if (!N.isHost) return fn();
    if (depth++ === 0) cap = [];
    try { return fn(); } finally {
      if (--depth === 0) { const l = cap; cap = null; if (l.length && N.party()) N.send({ t: 'fx', l: l.slice(0, 24) }); }
    }
  };
  N.quiet = (fn) => { paused++; try { return fn(); } finally { paused--; } };
  function installCapture() {
    const A = EW.audio, C = EW.cam, H = EW.hud;
    const sfx = A.sfx.bind(A); A.sfx = (n, o) => { push(['s', n, o && o.vol != null ? r2(o.vol) : 1, o && o.level != null ? o.level : 0]); return sfx(n, o); };
    const shake = C.shake.bind(C); C.shake = (k) => { push(['k', r2(k)]); return shake(k); };
    const dust = E.dust; E.dust = (x, y, z, n, s) => { push(['d', r2(x), r2(y), r2(z), n, s]); return dust(x, y, z, n, s); };
    const ring = E.ring; E.ring = (x, z, y, a, b, d, c) => { push(['r', r2(x), r2(z), r2(y), a, b, d, c]); return ring(x, z, y, a, b, d, c); };
    const notice = H.notice; H.notice = (k, kind, v) => { if (!/^mount\./.test(k)) push(['n', k, kind || '', v || null]); return notice(k, kind, v); };
    // crystals: whoever lights one tells the others (host re-broadcasts)
    const ign = EW.world.igniteCrystal;
    EW.world.igniteCrystal = (cr) => { const was = cr.state; ign(cr); if (N.active && !N.applying && was === 'idle' && cr.state !== 'idle') N.send({ t: 'cry', i: EW.world.crystals.indexOf(cr) }, N.isHost ? '*' : 'host'); };
  }
  function replayFx(list, b) {
    if (where() !== 'field') return;
    const p = EW.game.player, far = b && p ? Math.max(0.15, Math.min(1, 1 - (Math.hypot(p.x - b.x, p.z - b.z) - 25) / 60)) : 1;
    for (const e of list) {
      if (e[0] === 's') EW.audio.sfx(e[1], { vol: e[2] * (0.4 + far * 0.6), level: e[3] });
      else if (e[0] === 'k') EW.cam.shake(e[1] * far);
      else if (e[0] === 'd') E.dust(e[1], e[2], e[3], e[4], e[5]);
      else if (e[0] === 'r') E.ring(e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
      else if (e[0] === 'n') EW.hud.notice(e[1], e[2], e[3] || undefined);
    }
  }

  // ------------------------------------------------------------------ boss snapshot (host) / replica (guests)
  N.bossSnap = (b) => {
    const a = b.a, m = b.mount;
    let pb = 0; PART_KEYS.forEach((k, i) => { if (b.parts[k].broken) pb |= 1 << i; });
    let pl = 0; EW.world.pillars.forEach((q, i) => { if (q.broken) pl |= 1 << i; });
    const dc = DECALS.map((k) => { const d = b.decals[k], o = d.material.opacity; return o > 0.01 ? [r2(o), r2(d.position.x), r2(d.position.y), r2(d.position.z), r2(d.scale.x), r2(d.scale.z), r2(d.rotation.y)] : 0; });
    return {
      p: [r2(b.x), r2(b.y), r2(b.z), r2(b.yaw), r2(b.air)],
      a: [a.bodyY, a.pitch, a.headDrop, a.jaw, a.tail, a.topple, a.plateOpen, a.glow, a.walk, a.fore[0], a.fore[1], a.hind[0], a.hind[1]].map(r2),
      s: b.state, hp: Math.round(b.hp), mx: b.maxHp, ph: b.phase, pb, pl, en: b.engaged ? 1 : 0, fl: b.flash > 0 ? 1 : 0,
      k: b.attack ? b.attack.name : '', kt: b.attack ? r2(b.attack.t) : 0, dc, g: [r2(b.mouthGlow.material.opacity), r2(b.coreGlow.material.opacity)],
      m: m ? [m.rider === EW.game.player ? N.id : m.rider.id, Math.round(m.meter), m.tele > 0 ? 1 : 0, m.thrash > 0 ? 1 : 0] : 0,
      mc: b.canMount() ? 1 : 0, dn: b.den && EW.world.dens ? EW.world.dens.indexOf(b.den) : -1,
    };
  };
  N.PART_KEYS = PART_KEYS; N.DECALS = DECALS;

  // ------------------------------------------------------------------ my state → room
  const where = () => { const s = EW.game && EW.game.state; return s === 'field' ? 'field' : s === 'hub' || s === 'depart' ? 'hub' : 'menu'; };
  N.where = where;
  function selfState() {
    const p = EW.game.player;
    if (!p) return null;
    const S = p.sprite, fl = (p.iframe ? 1 : 0) | (p.braced ? 2 : 0);
    return [r2(p.x), r2(p.y), r2(p.z), r2(p.fx), r2(p.fz), p.lastAnim || 'idle', p.lastF | 0, r2(S.wob.position.x), r2(S.wob.position.y), r2(S.wob.rotation.z), p.state, fl, p.kind, Math.max(0, Math.round(p.hp))];
  }
  function writeSelf(force) {
    const p = EW.game.player, now = E.time;
    while (N.out.length && now - N.out[0].at > EVENT_KEEP) { N.out.shift(); N.dirty = true; }
    const node = {
      n: N.name(), k: p ? p.kind : EW.save.game ? EW.save.game.weapon : 'greatsword',
      pl: EW.save.game ? EW.progress.palette() : 'leather', tr: EW.save.game && p ? EW.progress.weaponTier(p.kind) : 0,
      w: where(), s: selfState(), e: N.out.map(({ at, ...m }) => m),
    };
    const diff = {};
    for (const [k, v] of Object.entries(node)) { const j = JSON.stringify(v); if (force || N.sent[k] !== j) { N.sent[k] = j; diff[k] = v; } }
    if (Object.keys(diff).length) N.T.update(room('p/' + N.id), diff);
    if (N.isHost) {
      const hunt = EW.hunt, h = {};
      if (hunt && where() === 'field' && N.party()) { h.b = N.bossSnap(hunt.boss); h.t = Math.round(hunt.time); h.fc = hunt.faints; }
      const hj = JSON.stringify(h.b || 0) + (h.t || 0) + (h.fc || 0);
      if (h.b && N.sentHost !== hj) { N.sentHost = hj; N.T.update(room('h'), h); }
    }
  }
  N.tick = (dt) => {
    if (!N.active) return;
    N.acc += dt;
    if (N.acc >= RATE) { N.acc = 0; writeSelf(false); }
    const show = where();
    for (const pr of N.peers.values()) if (pr.hunter) pr.hunter.update(dt, pr.w === show && show !== 'menu');
  };

  // ------------------------------------------------------------------ remote hunter (render + host-side proxy)
  const tagCanvas = (name) => {
    const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 256; c.height = 48;
    g.font = 'bold 26px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = '#1c1418'; g.strokeText(name, 128, 24); g.fillStyle = '#ffe2b0'; g.fillText(name, 128, 24);
    return c;
  };
  class RemoteHunter {
    constructor(pr) {
      this.pr = pr; this.id = pr.id; this.remote = true; this.ready = false;
      this.x = 0; this.y = 0; this.z = 0; this.fx = 0; this.fz = -1; this.state = 'move'; this.hp = 150; this.maxHp = 150; this.kind = pr.k || 'greatsword';
      this.t = { x: 0, y: 0, z: 0 }; this.iframe = false; this.braced = false;
      this.root = new THREE.Group(); this.root.visible = false; E.scene.add(this.root);
      this.shadow = E.shadow(0.75); this.root.add(this.shadow);
      this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tagCanvas(pr.n || '')), transparent: true, depthWrite: false }));
      this.tag.scale.set(2.6, 0.49, 1); this.tag.position.y = 3.3; this.root.add(this.tag); this.tagName = pr.n;
    }
    // the sheet is resolved lazily (after our own hunter exists, so an identical look reuses our sheet)
    look(kind, pal, tier) { this.kind = kind; this.want = { kind, pal, tier }; }
    resolve() {
      const { kind, pal, tier } = this.want; this.want = null;
      const res = EW.Player.sheetFor({ kind, pal, tier });
      const use = (S) => { if (this.disposed) return; if (!this.sprite) { this.sprite = new EW.Forge.Sprite(S); this.root.add(this.sprite.root); } else if (this.sprite.S !== S) this.sprite.setSheet(S); };
      if (res.sheet) use(res.sheet); else res.job.promise.then(use).catch((e) => console.error(e));
    }
    apply(s) {
      this.t.x = s[0]; this.t.y = s[1]; this.t.z = s[2]; this.fx = s[3]; this.fz = s[4];
      this.anim = s[5]; this.f = s[6]; this.wob = [s[7], s[8], s[9]]; this.state = s[10];
      this.iframe = !!(s[11] & 1); this.braced = !!(s[11] & 2); this.kind = s[12]; this.hp = s[13];
      if (!this.ready) { this.x = s[0]; this.y = s[1]; this.z = s[2]; this.ready = true; }
    }
    update(dt, visible) {
      if (this.pr.n !== this.tagName) { this.tagName = this.pr.n; this.tag.material.map.dispose(); this.tag.material.map = new THREE.CanvasTexture(tagCanvas(this.pr.n || '')); }
      if (this.want && EW.game.player) this.resolve();
      const on = visible && this.ready && !!this.sprite;
      this.root.visible = on;
      if (!on) { this.x = this.t.x; this.y = this.t.y; this.z = this.t.z; return; }
      const k = Math.min(1, dt * 14), far = Math.hypot(this.t.x - this.x, this.t.z - this.z) > 8;
      this.x = far ? this.t.x : this.x + (this.t.x - this.x) * k; this.z = far ? this.t.z : this.z + (this.t.z - this.z) * k; this.y = far ? this.t.y : this.y + (this.t.y - this.y) * k;
      const S = this.sprite, cam = EW.cam.billboardAngles();
      S.face(this.fx, this.fz, cam.yaw); S.billboard(cam.yaw, -cam.pitch * 0.35);
      this.root.position.set(this.x, this.y, this.z);
      this.shadow.position.y = EW.world.heightAt(this.x, this.z) - this.y + 0.06;
      if (this.wob) { S.wob.position.set(this.wob[0], this.wob[1], 0); S.wob.rotation.z = this.wob[2]; }
      S.show(S.has(this.anim) ? this.anim : 'idle', this.f || 0);
      this.tag.visible = this.state !== 'faint';
    }
    // ---- host-side proxy: the boss hits this like a player; the real hit is applied on the guest's machine
    receive(hit) {
      if (this.state === 'faint' || this.state === 'cine' || this.state === 'mounted') return 'none';
      if (this.iframe) return 'dodged';
      N.send({ t: 'hurt', h: hit }, this.id);
      return 'hit';
    }
    setState() {}
    place() {}
    dispose() { this.disposed = true; E.scene.remove(this.root); this.tag.material.map.dispose(); this.tag.material.dispose(); }
  }
  EW.RemoteHunter = RemoteHunter;

  installCapture();
})();
