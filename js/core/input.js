// Input — keyboard / mouse / gamepad, device tracking and button glyphs.
// Raw presses are routed to EW.input.onRaw (set by the UI Manager), which decides
// whether a screen, the dialogue system or gameplay consumes them.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const GLYPH = {
    kb: { attack: 'LMB', dodge: 'Space', skill: 'F', interact: 'E', potion: 'R', lockon: 'Q', pause: 'Esc', confirm: 'Enter', back: 'Esc', camera: 'Mouse', move: 'W A S D', sprint: 'Shift', zoom: 'Wheel', adjust: '← →', advance: 'E', brace: 'Space', tabs: 'Q  E', alt: 'X' },
    pad: { attack: 'X', dodge: 'B', skill: 'Y', interact: 'A', potion: 'RB', lockon: 'LT', pause: 'Menu', confirm: 'A', back: 'B', camera: 'RS', move: 'LS', sprint: 'L3', zoom: 'D-Pad ↕', adjust: '◂ ▸', advance: 'A', brace: 'B', tabs: 'LB  RB', alt: 'X' },
  };
  const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

  const input = (EW.input = {
    PAD, GLYPH,
    device: 'kb', keys: new Set(), mouse: [false, false, false],
    lookX: 0, lookY: 0, zoom: 0, padIdx: -1, padBtn: [], padMove: { x: 0, y: 0 }, navHold: { dir: null, t: 0 },
    onRaw: null, onNav: null, deviceListeners: [], edges: new Set(),
    // press latches: a tap shorter than one frame still registers once
    takeEdge(a) { const had = this.edges.has(a); this.edges.delete(a); return had; },
    move() {
      let x = 0, y = 0; const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      const pm = this.padMove;
      if (Math.hypot(pm.x, pm.y) > 0.05) { x = pm.x; y = pm.y; }
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l, mag: 1 } : { x, y, mag: l };
    },
    held(action) {
      const k = this.keys, b = this.padBtn;
      switch (action) {
        case 'attack': return this.mouse[0] || b[PAD.X] || b[PAD.RT];
        case 'skill': return k.has('KeyF') || b[PAD.Y];
        case 'sprint': return k.has('ShiftLeft') || k.has('ShiftRight') || b[PAD.LS];
        case 'dodge': case 'brace': return k.has('Space') || b[PAD.B];
        case 'interact': return k.has('KeyE') || b[PAD.A];
        case 'potion': return k.has('KeyR') || b[PAD.RB];
        case 'lockon': return k.has('KeyQ') || b[PAD.LT];
        default: return false;
      }
    },
    consumeLook() { const r = { x: this.lookX, y: this.lookY, px: this.padLookX, py: this.padLookY }; this.lookX = this.lookY = this.padLookX = this.padLookY = 0; return r; },
    padLookX: 0, padLookY: 0,
    consumeZoom() { const z = this.zoom; this.zoom = 0; return z; },
    onDevice(fn) { this.deviceListeners.push(fn); },
    setDevice(d) { if (this.device === d) return; this.device = d; document.body.dataset.device = d; this.deviceListeners.forEach((f) => f(d)); },
    glyphText(action) { return GLYPH[this.device][action] || action; },
    poll(dt) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads[this.padIdx] || [...pads].find(Boolean);
      if (!p) { this.padMove = { x: 0, y: 0 }; this.padBtn = []; return; }
      this.padIdx = p.index;
      const btn = p.buttons.map((b) => b.pressed || b.value > 0.5);
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      if (btn.some(Boolean) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.3) this.setDevice('pad');
      this.padMove = { x: lx, y: -ly };
      this.padLookX += rx * dt * 900; this.padLookY += ry * dt * 600;
      if (btn[PAD.UP]) this.zoom -= dt * 4; if (btn[PAD.DOWN]) this.zoom += dt * 4;
      const PE = { [PAD.X]: 'attack', [PAD.RT]: 'attack', [PAD.B]: 'dodge', [PAD.Y]: 'skill', [PAD.RB]: 'potion' };
      for (let i = 0; i < btn.length; i++) if (btn[i] && !this.padBtn[i]) { if (PE[i]) this.edges.add(PE[i]); this.onRaw?.({ src: 'pad', btn: i }); }
      this.padBtn = btn;
      // menu navigation with stick / d-pad auto-repeat
      let dir = null;
      if (btn[PAD.UP] || ly < -0.5) dir = 'up'; else if (btn[PAD.DOWN] || ly > 0.5) dir = 'down';
      else if (btn[PAD.LEFT] || lx < -0.5) dir = 'left'; else if (btn[PAD.RIGHT] || lx > 0.5) dir = 'right';
      const nh = this.navHold;
      if (dir !== nh.dir) { nh.dir = dir; nh.t = 0.38; if (dir) this.onNav?.(dir); }
      else if (dir) { nh.t -= dt; if (nh.t <= 0) { nh.t = 0.11; this.onNav?.(dir); } }
    },
  });

  // ---- third-person mouse look: the cursor is captured during play and the camera follows the mouse.
  // input.canLock() is supplied by the game (true while walking around with no menu open).
  input.canLock = () => false;
  input.onLockLost = null;
  input.lockLostAt = -1e9;
  input.locked = () => !!document.pointerLockElement;
  input.lock = () => {
    if (document.pointerLockElement || !input.canLock()) return;
    const c = document.querySelector('canvas'); if (!c || !c.requestPointerLock) return;
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { const r2 = c.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => {}); } catch (e) { /* not allowed yet */ } });
    } catch (e) { /* not allowed yet */ }
  };
  input.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  document.addEventListener('pointerlockchange', () => {
    document.body.classList.toggle('mouse-locked', !!document.pointerLockElement);
    if (!document.pointerLockElement) { input.lockLostAt = performance.now(); input.mouse = [false, false, false]; input.onLockLost?.(); }
  });

  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    input.setDevice('kb'); input.keys.add(e.code);
    // the Esc that released the cursor already opened the pause menu — don't let it close it again
    if (e.code === 'Escape' && performance.now() - input.lockLostAt < 300) return;
    if (!e.repeat) { const a = { Space: 'dodge', KeyF: 'skill', KeyR: 'potion' }[e.code]; if (a) input.edges.add(a); }
    input.onRaw?.({ src: 'kb', code: e.code, repeat: e.repeat });
    if (e.code !== 'Escape') input.lock();
  });
  addEventListener('click', () => input.lock());
  addEventListener('keyup', (e) => { input.keys.delete(e.code); input.onRaw?.({ src: 'kb', code: e.code, up: true }); });
  addEventListener('blur', () => { input.keys.clear(); input.mouse = [false, false, false]; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousedown', (e) => {
    input.setDevice('kb'); input.mouse[e.button] = true;
    if (e.button === 0) input.edges.add('attack');
    input.onRaw?.({ src: 'mouse', button: e.button, target: e.target });
  });
  addEventListener('mouseup', (e) => { input.mouse[e.button] = false; input.onRaw?.({ src: 'mouse', button: e.button, up: true }); });
  addEventListener('mousemove', (e) => {
    if (input.device !== 'kb' && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) input.setDevice('kb');
    // captured cursor: every movement turns the camera; otherwise RMB-drag still works as a fallback
    if (document.pointerLockElement || input.mouse[2]) {
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) < 400 && Math.abs(my) < 400) { input.lookX += mx; input.lookY += my; } // drop the odd spike browsers emit
    }
  });
  addEventListener('wheel', (e) => { input.zoom += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('gamepadconnected', (e) => { input.padIdx = e.gamepad.index; EW.bus?.emit('pad', true); });
  addEventListener('gamepaddisconnected', () => { input.padIdx = -1; input.padMove = { x: 0, y: 0 }; });
})();
