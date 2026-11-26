// Co-op transport — a tiny realtime-tree API with two backends:
//   • Emu      — built-in emulator: a shared JSON tree replicated between tabs of the same browser over
//                BroadcastChannel (with a little fake latency). Used in development: costs nothing, needs nothing.
//   • Firebase — Realtime Database (compat SDK, loaded only when co-op is actually used).
// API (both): ready() · get(path) · update(path, obj) · remove(path) · watch(path, cb) · watchKids(path, cb)
//             onDisconnectRemove(path) · close()
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const split = (p) => p.split('/').filter(Boolean);
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const getAt = (tree, path) => { let n = tree; for (const k of split(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n; };
  function setAt(tree, path, val) {
    const ks = split(path); let n = tree;
    for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') { if (val == null) return; n[ks[i]] = {}; } n = n[ks[i]]; }
    const last = ks[ks.length - 1];
    if (val == null) delete n[last]; else n[last] = val;
    // prune empty parents (like the real database)
    for (let i = ks.length - 1; i > 0; i--) { const p = getAt(tree, ks.slice(0, i).join('/')); if (p && typeof p === 'object' && !Object.keys(p).length) setAt(tree, ks.slice(0, i).join('/'), null); else break; }
  }
  const related = (a, b) => { const A = split(a), B = split(b), n = Math.min(A.length, B.length); for (let i = 0; i < n; i++) if (A[i] !== B[i]) return false; return true; };

  // ------------------------------------------------------------------ built-in emulator
  class Emu {
    constructor({ lag = 45 } = {}) {
      this.kind = 'emu'; this.lag = lag; this.tree = {}; this.watchers = new Set(); this.onDc = new Set();
      this.ch = new BroadcastChannel('emberwild-net-emu');
      this.ch.onmessage = (e) => setTimeout(() => this.recv(e.data), this.lag);
      this.got = false;
      this.ch.postMessage({ op: 'hello' });
      this.bye = () => this.dropDisconnects();
      addEventListener('pagehide', this.bye);
    }
    ready() { return new Promise((r) => setTimeout(r, 220)); } // give other tabs time to hand over the tree
    recv(m) {
      if (m.op === 'hello') { this.ch.postMessage({ op: 'state', tree: this.tree }); return; }
      if (m.op === 'state') { if (!this.got) { this.got = true; this.tree = Object.assign(m.tree || {}, this.tree); this.fire('/'); } return; }
      this.apply(m, false);
    }
    apply(m, local) {
      if (m.op === 'update') for (const [k, v] of Object.entries(m.obj)) setAt(this.tree, m.path + '/' + k, clone(v));
      else if (m.op === 'remove') setAt(this.tree, m.path, null);
      if (local) this.ch.postMessage(m);
      this.fire(m.path);
    }
    fire(path) { for (const w of this.watchers) if (related(w.path, path)) w.check(); }
    get(path) { return Promise.resolve(clone(getAt(this.tree, path))); }
    update(path, obj) { this.apply({ op: 'update', path, obj }, true); return Promise.resolve(); }
    remove(path) { this.apply({ op: 'remove', path }, true); return Promise.resolve(); }
    watch(path, cb) {
      let last;
      const w = { path, check: () => { const v = getAt(this.tree, path), s = JSON.stringify(v); if (s !== last) { last = s; cb(clone(v)); } } };
      this.watchers.add(w); w.check();
      return () => this.watchers.delete(w);
    }
    watchKids(path, cb) {
      const last = new Map();
      const w = { path, check: () => {
        const v = getAt(this.tree, path) || {};
        for (const [k, c] of Object.entries(v)) { const s = JSON.stringify(c); if (last.get(k) !== s) { last.set(k, s); cb(k, clone(c)); } }
        for (const k of [...last.keys()]) if (!(k in v)) { last.delete(k); cb(k, null); }
      } };
      this.watchers.add(w); w.check();
      return () => this.watchers.delete(w);
    }
    onDisconnectRemove(path) { this.onDc.add(path); }
    dropDisconnects() { for (const p of this.onDc) this.remove(p); this.onDc.clear(); }
    close() { this.dropDisconnects(); this.watchers.clear(); removeEventListener('pagehide', this.bye); this.ch.close(); }
  }

  // ------------------------------------------------------------------ Firebase Realtime Database
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); });
  let sdk = null;
  const loadSdk = () => sdk || (sdk = loadScript(SDK + 'firebase-app-compat.js').then(() => loadScript(SDK + 'firebase-database-compat.js')));
  class Fire {
    constructor({ emulator = false } = {}) {
      this.kind = emulator ? 'fire-emu' : 'firebase'; this.offs = new Set(); this.dcRefs = [];
      const cfg = emulator ? { projectId: 'demo-emberwild', databaseURL: 'http://127.0.0.1:9000?ns=demo-emberwild' } : EW.FIREBASE_CONFIG;
      this.boot = loadSdk().then(() => {
        const app = firebase.apps.find((a) => a.name === 'ew') || firebase.initializeApp(cfg, 'ew');
        this.db = app.database();
        if (emulator && !Fire.emuSet) { Fire.emuSet = true; this.db.useEmulator('127.0.0.1', 9000); }
      });
    }
    ready() { return this.boot; }
    ref(p) { return this.db.ref(p); }
    get(path) { return this.ref(path).get().then((s) => s.val()); }
    update(path, obj) { return this.ref(path).update(obj); }
    remove(path) { return this.ref(path).remove(); }
    watch(path, cb) { const r = this.ref(path), f = (s) => cb(s.val()); r.on('value', f); const off = () => r.off('value', f); this.offs.add(off); return off; }
    watchKids(path, cb) {
      const r = this.ref(path), a = (s) => cb(s.key, s.val()), d = (s) => cb(s.key, null);
      r.on('child_added', a); r.on('child_changed', a); r.on('child_removed', d);
      const off = () => { r.off('child_added', a); r.off('child_changed', a); r.off('child_removed', d); }; this.offs.add(off); return off;
    }
    onDisconnectRemove(path) { const od = this.ref(path).onDisconnect(); od.remove(); this.dcRefs.push(od); }
    close() { for (const off of this.offs) off(); this.offs.clear(); for (const od of this.dcRefs) od.cancel(); this.dcRefs = []; }
  }

  // which backend this page uses (see js/net/firebase-config.js)
  EW.netBackend = () => {
    const q = new URLSearchParams(location.search).get('net');
    if (q === 'emu') return 'fire-emu';
    if (q === 'firebase') return EW.FIREBASE_CONFIG ? 'firebase' : 'none';
    if (q === 'local') return 'local';
    const dev = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');
    if (dev) return 'local';
    return EW.FIREBASE_CONFIG ? 'firebase' : 'none';
  };
  EW.makeTransport = () => {
    const b = EW.netBackend();
    if (b === 'local') return new Emu();
    if (b === 'fire-emu') return new Fire({ emulator: true });
    if (b === 'firebase') return new Fire();
    return null;
  };
  EW.NetEmu = Emu;
})();
