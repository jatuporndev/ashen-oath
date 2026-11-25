// Environment + interface art: guild props, hunting-field props, parchment / wood / iron
// textures for the game-world UI, material / armour icons, crests.
(function () {
  'use strict';
  const P = window.Paint;
  const A = (window.Art = window.Art || {});
  function glow(x, cx, cy, r, col, a = 0.8) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,250,225,' + a + ')'); g.addColorStop(0.3, P.rgba(col, a * 0.8)); g.addColorStop(1, P.rgba(col, 0)); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  function planks(x, w, h, n, base, vertical = true) {
    const pw = (vertical ? w : h) / n;
    for (let i = 0; i < n; i++) {
      const col = P.shade(base, P.r(-0.12, 0.1)).replace(/rgb\((\d+),(\d+),(\d+)\)/, (m, r, g, b) => '#' + [r, g, b].map((v) => (+v).toString(16).padStart(2, '0')).join(''));
      if (vertical) P.rectShape(x, i * pw + 1, 0, pw - 2, h, 3, { base: col, lw: 2.5, outline: '#20140c', dab: 6 });
      else P.rectShape(x, 0, i * pw + 1, w, pw - 2, 3, { base: col, lw: 2.5, outline: '#20140c', dab: 6 });
      x.save(); x.strokeStyle = 'rgba(40,22,10,.35)'; x.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) { x.beginPath(); if (vertical) { const gx = i * pw + P.r(6, pw - 6); x.moveTo(gx, 0); x.bezierCurveTo(gx + P.r(-6, 6), h * 0.3, gx + P.r(-6, 6), h * 0.7, gx, h); } else { const gy = i * pw + P.r(6, pw - 6); x.moveTo(0, gy); x.bezierCurveTo(w * 0.3, gy + P.r(-4, 4), w * 0.7, gy + P.r(-4, 4), w, gy); } x.stroke(); }
      x.restore();
    }
  }
  function nail(x, nx, ny, r = 5) { P.ellShape(x, nx, ny, r, r, { base: '#6a6e76', lw: 2, outline: '#1a1a1e', hi: 0.7, dabs: 2 }); }
  A.glow = glow;

  // ---------------------------------------------------------------- parchment / wood / leather / iron (UI + world)
  A.parchment = (w, h, { torn = true, seed = 3, tone = '#e8d6ac' } = {}) => {
    P.seed(seed);
    const c = P.canvas(w, h), x = c.getContext('2d');
    x.save();
    if (torn) {
      x.beginPath(); const j = () => P.r(-5, 5);
      x.moveTo(8 + j(), 8 + j());
      for (let px = 8; px < w - 8; px += 14) x.lineTo(px, 6 + j());
      for (let py = 8; py < h - 8; py += 14) x.lineTo(w - 6 + j(), py);
      for (let px = w - 8; px > 8; px -= 14) x.lineTo(px, h - 6 + j());
      for (let py = h - 8; py > 8; py -= 14) x.lineTo(6 + j(), py);
      x.closePath(); x.clip();
    }
    x.fillStyle = tone; x.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 900; i++) { x.globalAlpha = P.r(0.03, 0.1); x.fillStyle = P.pick(['#c8a870', '#b08850', '#f4e6c4', '#a07840']); x.beginPath(); x.ellipse(P.r(0, w), P.r(0, h), P.r(10, 60), P.r(6, 40), P.r(0, 3), 0, 7); x.fill(); }
    x.globalAlpha = 1;
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(120,80,30,0)'); g.addColorStop(1, 'rgba(110,64,20,.55)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { x.globalAlpha = 0.08; x.fillStyle = '#6a4418'; x.beginPath(); x.ellipse(P.r(0, w), P.r(0, h), P.r(20, 50), P.r(16, 40), 0, 0, 7); x.fill(); }
    x.restore();
    return c;
  };
  A.wood = (w, h, { seed = 5, base = '#5a3a22', vertical = false, n = 6 } = {}) => {
    P.seed(seed);
    const c = P.canvas(w, h), x = c.getContext('2d');
    planks(x, w, h, n, base, vertical);
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    return c;
  };
  A.leather = (w, h, { seed = 6, base = '#3a2618' } = {}) => {
    P.seed(seed);
    const c = P.canvas(w, h), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 300; i++) { x.globalAlpha = P.r(0.04, 0.12); x.fillStyle = P.pick(['#5a3a24', '#22140c', '#4a2e1c']); x.beginPath(); x.ellipse(P.r(0, w), P.r(0, h), P.r(3, 18), P.r(2, 10), P.r(0, 3), 0, 7); x.fill(); }
    x.globalAlpha = 0.5; x.strokeStyle = '#c8a070'; x.setLineDash([7, 6]); x.lineWidth = 2; x.strokeRect(12, 12, w - 24, h - 24);
    return c;
  };
  // ornate iron + brass 9-slice frame (corner filigree), used as CSS border-image
  A.ironFrame = (size = 120, { brass = '#b8903c' } = {}) => {
    P.seed(11);
    const c = P.canvas(size, size), x = c.getContext('2d'), e = 30;
    x.lineJoin = 'round';
    const band = (x0, y0, w, h) => { P.rectShape(x, x0, y0, w, h, 2, { base: '#3a3a40', outline: '#0c0c10', lw: 2.5, hi: 0.5, dabs: 10 }); };
    band(4, 4, size - 8, 12); band(4, size - 16, size - 8, 12); band(4, 4, 12, size - 8); band(size - 16, 4, 12, size - 8);
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([sx, sy]) => {
      x.save(); x.translate(sx ? size : 0, sy ? size : 0); x.scale(sx ? -1 : 1, sy ? -1 : 1);
      P.paint(x, (cx) => { cx.moveTo(0, 0); cx.lineTo(e + 10, 0); cx.quadraticCurveTo(e - 4, 6, 22, 22); cx.quadraticCurveTo(6, e - 4, 0, e + 10); cx.closePath(); }, { base: brass, outline: '#2a1a08', lw: 2.5, box: [0, 0, e + 10, e + 10], hi: 0.6, dabs: 20 });
      P.ellShape(x, 12, 12, 5, 5, { base: '#e8d090', outline: '#2a1a08', lw: 2, hi: 0.8, dabs: 2 });
      x.restore();
    });
    return c;
  };
  A.crest = (size = 160) => {
    P.seed(21);
    const c = P.canvas(size, size), x = c.getContext('2d'), s = size / 160;
    x.scale(s, s);
    glow(x, 80, 84, 70, '#ff8a2a', 0.35);
    P.paint(x, (cx) => { cx.moveTo(80, 10); cx.lineTo(140, 34); cx.quadraticCurveTo(140, 110, 80, 150); cx.quadraticCurveTo(20, 110, 20, 34); cx.closePath(); }, { base: '#3a2a26', outline: '#120a06', lw: 4, box: [20, 10, 120, 140], hi: 0.4 });
    x.strokeStyle = '#c8a050'; x.lineWidth = 3; x.beginPath(); x.moveTo(80, 22); x.lineTo(130, 40); x.quadraticCurveTo(128, 104, 80, 138); x.quadraticCurveTo(32, 104, 30, 40); x.closePath(); x.stroke();
    P.shape(x, [[80, 44], [96, 74], [92, 100], [80, 116], [68, 100], [64, 74]], { base: '#ff9a3a', outline: '#4a1a06', lw: 3, hi: 0.8 });
    P.shape(x, [[80, 66], [88, 86], [80, 104], [72, 86]], { base: '#fff0b0', lw: 0 });
    [[-1], [1]].forEach(([k]) => { x.save(); x.translate(80, 80); x.scale(k, 1); x.strokeStyle = '#c8a050'; x.lineWidth = 3; x.beginPath(); x.moveTo(24, 30); x.quadraticCurveTo(44, 0, 30, -30); x.stroke(); x.restore(); });
    return c;
  };
  A.divider = (w = 420, h = 28) => {
    const c = P.canvas(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(200,160,80,0)'); g.addColorStop(0.5, 'rgba(220,180,100,.95)'); g.addColorStop(1, 'rgba(200,160,80,0)');
    x.strokeStyle = g; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    x.fillStyle = '#e8c070'; x.save(); x.translate(w / 2, h / 2); x.rotate(Math.PI / 4); x.fillRect(-6, -6, 12, 12); x.restore();
    x.fillStyle = '#ff9a3a'; x.save(); x.translate(w / 2, h / 2); x.rotate(Math.PI / 4); x.fillRect(-2.5, -2.5, 5, 5); x.restore();
    [-1, 1].forEach((k) => { x.save(); x.translate(w / 2 + k * 26, h / 2); x.rotate(Math.PI / 4); x.strokeStyle = '#e8c070'; x.lineWidth = 1.5; x.strokeRect(-4, -4, 8, 8); x.restore(); });
    return c;
  };
  A.waxSeal = (size = 90, col = '#9a1e1a') => {
    P.seed(31);
    const c = P.canvas(size, size), x = c.getContext('2d'), s = size / 90;
    x.scale(s, s);
    P.shape(x, P.blobPts(45, 45, 38, 38, 0.1, 14), { base: col, outline: '#3a0606', lw: 3, hi: 0.5 });
    x.strokeStyle = 'rgba(255,200,180,.5)'; x.lineWidth = 2; x.beginPath(); x.arc(45, 45, 24, 0, 7); x.stroke();
    P.shape(x, [[45, 28], [54, 44], [45, 62], [36, 44]], { base: P.shade(col, -0.3), lw: 2 });
    return c;
  };

  // ---------------------------------------------------------------- icons
  A.materialIcon = (id, size = 96) => {
    P.seed(700 + id.length * 17);
    const c = P.canvas(96, 96), x = c.getContext('2d');
    switch (id) {
      case 'gm_hide': P.shape(x, [[14, 30], [44, 16], [80, 24], [86, 60], [70, 82], [30, 80], [12, 60]], { base: '#6a605a' }); x.strokeStyle = 'rgba(255,140,50,.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(30, 40); x.lineTo(50, 54); x.lineTo(68, 44); x.stroke(); break;
      case 'gm_fang': P.polyShape(x, [[30, 14], [66, 14], [56, 60], [46, 86], [40, 60]], { base: '#e6dcc2' }); break;
      case 'gm_bone': P.rectShape(x, 20, 40, 56, 16, 8, { base: '#3a3230' }); [[20, 40], [76, 40], [20, 56], [76, 56]].forEach(([bx, by]) => P.ellShape(x, bx, by, 10, 10, { base: '#4a4240' })); break;
      case 'gm_horn': glow(x, 48, 30, 30, '#ff8a2a', 0.5); P.shape(x, [[30, 88], [22, 50], [36, 18], [62, 8], [52, 26], [48, 52], [56, 88]], { base: '#ddd0b2' }); break;
      case 'gm_plate': P.polyShape(x, [[14, 80], [24, 36], [50, 10], [76, 34], [84, 80]], { base: '#2c2828', outline: '#0c0808' }); x.strokeStyle = 'rgba(255,140,50,.9)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(30, 74); x.lineTo(48, 30); x.stroke(); break;
      case 'gm_claw': [[22, 0], [46, 0], [70, 0]].forEach(([cx]) => P.polyShape(x, [[cx - 8, 30], [cx + 10, 24], [cx + 4, 76], [cx - 2, 86]], { base: '#d8ccb0' })); break;
      case 'gm_spike': P.shape(x, P.blobPts(48, 52, 26, 24, 0.1, 10), { base: '#2c2828' }); [[48, 10], [86, 48], [48, 92], [10, 52], [76, 20], [20, 22]].forEach(([sx, sy]) => P.polyShape(x, [[48 + (sx - 48) * 0.5 - 5, 52 + (sy - 52) * 0.5], [sx, sy], [48 + (sx - 48) * 0.5 + 5, 52 + (sy - 52) * 0.5]], { base: '#ddd0b2', lw: 2, dabs: 3 })); break;
      case 'gm_core': glow(x, 48, 48, 46, '#ff8a2a', 0.9); P.ellShape(x, 48, 48, 22, 20, { base: '#ffb050', outline: '#5a1a08', hi: 0.8 }); break;
      case 'sentinel_shard': glow(x, 48, 48, 44, '#7ad8ff', 0.7); P.polyShape(x, [[48, 8], [70, 40], [60, 88], [36, 88], [26, 40]], { base: '#9ad8f0', outline: '#0e2a3a', hi: 0.8 }); break;
      case 'sentinel_stone': P.polyShape(x, [[14, 70], [20, 30], [56, 14], [84, 36], [80, 78], [40, 86]], { base: '#8a8a80' }); x.strokeStyle = 'rgba(120,220,255,.85)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(30, 40); x.lineTo(50, 50); x.lineTo(46, 70); x.stroke(); break;
      case 'sentinel_moss': P.shape(x, P.blobPts(48, 52, 34, 26, 0.2, 12), { base: '#4a7a3a' }); for (let i = 0; i < 12; i++) P.ellShape(x, P.r(22, 74), P.r(32, 72), 3, 3, { base: '#9ac85a', lw: 0, dabs: 1 }); break;
      case 'sentinel_heart': glow(x, 48, 48, 46, '#7ad8ff', 0.95); P.shape(x, [[48, 82], [16, 46], [26, 20], [48, 30], [70, 20], [80, 46]], { base: '#c8f0ff', outline: '#0e2a3a', hi: 0.9 }); break;
      case 'crowns': glow(x, 48, 48, 40, '#ffd060', 0.4); P.ellShape(x, 48, 48, 26, 26, { base: '#e8b83a', outline: '#4a2e08', hi: 0.7 }); x.strokeStyle = '#8a5a10'; x.lineWidth = 3; x.beginPath(); x.moveTo(34, 56); x.lineTo(36, 38); x.lineTo(44, 48); x.lineTo(48, 34); x.lineTo(52, 48); x.lineTo(60, 38); x.lineTo(62, 56); x.closePath(); x.stroke(); break;
      case 'potion': glow(x, 48, 58, 34, '#ff5a6a', 0.45); P.rectShape(x, 40, 12, 16, 20, 3, { base: '#c8a070' }); P.ellShape(x, 48, 60, 24, 26, { base: '#d8384a', outline: '#3a0a12', hi: 0.6 }); break;
      default: P.ellShape(x, 48, 48, 30, 30, { base: '#888' });
    }
    if (size === 96) return c;
    const o = P.canvas(size, size); o.getContext('2d').drawImage(c, 0, 0, size, size); return o;
  };
  A.armorIcon = (slot, set = 'leather', size = 96) => {
    P.seed(800 + slot.length * 7 + set.length);
    const c = P.canvas(96, 96), x = c.getContext('2d');
    const base = set === 'gravemaw' ? '#3a3434' : '#8a5c38', trim = set === 'gravemaw' ? '#ff8a2a' : '#c8a050', metal = set === 'gravemaw' ? '#2c2828' : '#a8b0b8';
    if (slot === 'head') { P.shape(x, [[18, 70], [20, 34], [48, 14], [76, 34], [78, 70], [62, 62], [34, 62]], { base: metal }); x.fillStyle = '#120c0a'; x.fillRect(30, 42, 36, 8); if (set === 'gravemaw') { P.polyShape(x, [[22, 36], [6, 6], [30, 24]], { base: '#ddd0b2' }); P.polyShape(x, [[74, 36], [90, 6], [66, 24]], { base: '#ddd0b2' }); } }
    else if (slot === 'chest') { P.shape(x, [[16, 22], [36, 14], [60, 14], [80, 22], [76, 84], [20, 84]], { base: base }); P.ellShape(x, 22, 26, 14, 12, { base: metal }); P.ellShape(x, 74, 26, 14, 12, { base: metal }); x.strokeStyle = trim; x.lineWidth = 3; x.beginPath(); x.moveTo(48, 20); x.lineTo(48, 80); x.stroke(); }
    else { P.rectShape(x, 22, 12, 22, 70, 6, { base }); P.rectShape(x, 52, 12, 22, 70, 6, { base }); P.rectShape(x, 18, 70, 30, 16, 6, { base: metal }); P.rectShape(x, 48, 70, 30, 16, 6, { base: metal }); x.strokeStyle = trim; x.lineWidth = 2.5; x.beginPath(); x.moveTo(26, 40); x.lineTo(40, 40); x.moveTo(56, 40); x.lineTo(70, 40); x.stroke(); }
    if (size === 96) return c;
    const o = P.canvas(size, size); o.getContext('2d').drawImage(c, 0, 0, size, size); return o;
  };

  // ---------------------------------------------------------------- guild world props
  A.questBoardFace = () => {
    P.seed(41);
    const c = P.canvas(640, 420), x = c.getContext('2d');
    planks(x, 640, 420, 7, '#5a3a22', false);
    P.rectShape(x, 0, 0, 640, 26, 3, { base: '#3a2414', lw: 3 }); P.rectShape(x, 0, 394, 640, 26, 3, { base: '#3a2414', lw: 3 });
    const notes = [[40, 60, 150, 190, -0.06], [220, 46, 170, 220, 0.03], [420, 64, 160, 180, 0.07], [90, 270, 130, 110, 0.05], [380, 262, 190, 120, -0.04]];
    notes.forEach(([nx, ny, nw, nh, r], i) => {
      x.save(); x.translate(nx + nw / 2, ny + nh / 2); x.rotate(r);
      x.drawImage(A.parchment(nw, nh, { seed: 50 + i }), -nw / 2, -nh / 2);
      x.strokeStyle = 'rgba(40,24,10,.55)'; x.lineWidth = 2;
      for (let l = 0; l < 6; l++) { x.beginPath(); x.moveTo(-nw / 2 + 16, -nh / 2 + 30 + l * 18); x.lineTo(nw / 2 - 16 - P.r(0, 30), -nh / 2 + 30 + l * 18); x.stroke(); }
      if (i === 1) { x.drawImage(A.waxSeal(44), nw / 2 - 52, nh / 2 - 52); }
      nail(x, 0, -nh / 2 + 10, 5);
      x.restore();
    });
    return c;
  };
  A.gateDoor = () => {
    P.seed(42);
    const c = P.canvas(256, 512), x = c.getContext('2d');
    planks(x, 256, 512, 5, '#4a2e1a', true);
    [70, 250, 430].forEach((by) => { P.rectShape(x, 0, by, 256, 26, 3, { base: '#2e2e34', outline: '#0a0a0c', hi: 0.5, dabs: 20 }); for (let k = 0; k < 6; k++) nail(x, 20 + k * 43, by + 13, 5); });
    P.ellShape(x, 220, 300, 18, 18, { base: '#3a3a40', lw: 4 });
    x.strokeStyle = '#6a6e76'; x.lineWidth = 5; x.beginPath(); x.arc(220, 318, 16, 0, Math.PI); x.stroke();
    return c;
  };
  A.banner = (col = '#8a1e1a') => {
    P.seed(43);
    const c = P.canvas(140, 360), x = c.getContext('2d');
    P.rectShape(x, 0, 0, 140, 14, 4, { base: '#5a3a22', lw: 3 });
    P.polyShape(x, [[10, 12], [130, 12], [130, 320], [100, 300], [70, 350], [40, 300], [10, 320]], { base: col, dab: 10 });
    x.strokeStyle = '#d0a050'; x.lineWidth = 4; x.strokeRect(22, 26, 96, 250);
    x.drawImage(A.crest(100), 20, 90);
    return c;
  };
  A.anvil = () => { P.seed(44); const c = P.canvas(180, 120), x = c.getContext('2d'); P.rectShape(x, 60, 70, 60, 48, 6, { base: '#5a3a22' }); P.polyShape(x, [[10, 30], [150, 30], [174, 22], [170, 44], [130, 56], [120, 72], [60, 72], [50, 56], [20, 50]], { base: '#4a4e56', outline: '#0e0e12', hi: 0.6 }); return c; };
  A.forge = () => {
    P.seed(45);
    const c = P.canvas(300, 360), x = c.getContext('2d');
    P.rectShape(x, 110, 0, 80, 140, 6, { base: '#6a625a' });
    P.paint(x, (cx) => { cx.moveTo(20, 360); cx.lineTo(30, 140); cx.quadraticCurveTo(150, 80, 270, 140); cx.lineTo(280, 360); cx.closePath(); }, { base: '#7a7068', box: [20, 80, 260, 280], dab: 10 });
    for (let r = 0; r < 7; r++) for (let k = 0; k < 6; k++) P.rectShape(x, 30 + k * 42 + (r % 2) * 20, 160 + r * 28, 38, 24, 4, { base: P.pick(['#8a8078', '#7a7068', '#958a80']), lw: 2, dabs: 6 });
    P.paint(x, (cx) => { cx.moveTo(90, 330); cx.lineTo(90, 250); cx.quadraticCurveTo(150, 200, 210, 250); cx.lineTo(210, 330); cx.closePath(); }, { base: '#1a0e08', box: [90, 200, 120, 130], lw: 4 });
    glow(x, 150, 290, 90, '#ff8a2a', 0.95);
    for (let i = 0; i < 16; i++) P.ellShape(x, P.r(100, 200), P.r(290, 325), P.r(6, 12), P.r(4, 7), { base: P.pick(['#ffb040', '#ff7a20', '#ffe080']), lw: 0, dabs: 2 });
    return c;
  };
  A.weaponRack = () => {
    P.seed(46);
    const c = P.canvas(260, 240), x = c.getContext('2d');
    P.rectShape(x, 10, 40, 240, 16, 4, { base: '#6a4428' }); P.rectShape(x, 10, 190, 240, 16, 4, { base: '#6a4428' });
    P.rectShape(x, 14, 30, 14, 210, 4, { base: '#5a3a22' }); P.rectShape(x, 232, 30, 14, 210, 4, { base: '#5a3a22' });
    [['greatsword', 50, 0.0, 0.62], ['spear', 110, 0, 0.55], ['dual', 165, 0.1, 1.1], ['dual', 195, -0.1, 1.1]].forEach(([k, px, rot, s]) => {
      const w = A.weapon(k, 0); x.save(); x.translate(px, 200); x.rotate(rot); x.scale(s, s); x.drawImage(w.canvas, -w.grip[0], -w.canvas.height + 30); x.restore();
    });
    return c;
  };
  A.armorStand = (set = 'leather') => {
    P.seed(47);
    const c = P.canvas(150, 220), x = c.getContext('2d');
    P.rectShape(x, 70, 120, 10, 90, 3, { base: '#5a3a22' }); P.rectShape(x, 40, 204, 70, 12, 4, { base: '#4a2e1a' });
    x.drawImage(A.armorIcon('chest', set, 120), 15, 40);
    x.drawImage(A.armorIcon('head', set, 70), 40, 0);
    return c;
  };
  A.chest = () => {
    P.seed(48);
    const c = P.canvas(200, 150), x = c.getContext('2d');
    P.rectShape(x, 10, 60, 180, 86, 8, { base: '#6a4428' });
    P.paint(x, (cx) => { cx.moveTo(10, 66); cx.lineTo(10, 40); cx.quadraticCurveTo(100, -10, 190, 40); cx.lineTo(190, 66); cx.closePath(); }, { base: '#7a5030', box: [10, 10, 180, 56] });
    [30, 160].forEach((bx) => P.rectShape(x, bx, 20, 14, 126, 3, { base: '#3a3a40', hi: 0.5 }));
    P.rectShape(x, 88, 60, 24, 30, 4, { base: '#c8a050', hi: 0.6 });
    return c;
  };
  A.lantern = () => {
    P.seed(49);
    const c = P.canvas(80, 300), x = c.getContext('2d');
    P.rectShape(x, 36, 60, 10, 240, 3, { base: '#2e2a28' });
    P.rectShape(x, 18, 50, 48, 10, 3, { base: '#2e2a28' });
    glow(x, 40, 30, 34, '#ffb050', 0.95);
    P.polyShape(x, [[24, 50], [20, 14], [40, 2], [60, 14], [56, 50]], { base: '#3a3434', outline: '#0e0c0c' });
    x.fillStyle = 'rgba(255,210,120,.9)'; x.fillRect(28, 18, 24, 28);
    return c;
  };
  A.brazier = () => {
    P.seed(50);
    const c = P.canvas(140, 200), x = c.getContext('2d');
    P.polyShape(x, [[40, 196], [56, 110], [84, 110], [100, 196]], { base: '#3a3434' });
    P.paint(x, (cx) => { cx.moveTo(10, 90); cx.lineTo(130, 90); cx.quadraticCurveTo(120, 130, 70, 134); cx.quadraticCurveTo(20, 130, 10, 90); cx.closePath(); }, { base: '#4a4440', box: [10, 90, 120, 44] });
    glow(x, 70, 70, 64, '#ff8a2a', 0.9);
    for (let i = 0; i < 4; i++) P.shape(x, [[30 + i * 22, 92], [40 + i * 22, 40 - P.r(0, 30)], [50 + i * 22, 92]], { base: P.pick(['#ff8a2a', '#ffb040', '#ffd070']), lw: 0, dabs: 4 });
    return c;
  };
  A.tent = () => {
    P.seed(51);
    const c = P.canvas(360, 260), x = c.getContext('2d');
    P.polyShape(x, [[10, 250], [180, 20], [350, 250]], { base: '#a88a5a' });
    P.polyShape(x, [[140, 250], [180, 120], [220, 250]], { base: '#2a1a10' });
    P.polyShape(x, [[180, 20], [140, 250], [110, 250]], { base: '#c8a870', lw: 2 });
    P.rectShape(x, 176, 0, 8, 30, 2, { base: '#5a3a22' });
    return c;
  };
  A.barrel = () => { P.seed(52); const c = P.canvas(100, 130), x = c.getContext('2d'); P.paint(x, (cx) => { cx.moveTo(14, 6); cx.quadraticCurveTo(0, 65, 14, 124); cx.lineTo(86, 124); cx.quadraticCurveTo(100, 65, 86, 6); cx.closePath(); }, { base: '#7a5030', box: [0, 6, 100, 118] }); [20, 60, 104].forEach((by) => P.rectShape(x, 6, by, 88, 8, 2, { base: '#3a3a40', lw: 2 })); return c; };
  A.crate = () => { P.seed(53); const c = P.canvas(120, 110), x = c.getContext('2d'); P.rectShape(x, 4, 4, 112, 102, 4, { base: '#8a6038' }); x.strokeStyle = '#3a2210'; x.lineWidth = 5; x.beginPath(); x.moveTo(10, 10); x.lineTo(110, 100); x.moveTo(110, 10); x.lineTo(10, 100); x.stroke(); return c; };

  // ---------------------------------------------------------------- hunting-field props
  A.deadTree = (v = 0) => {
    P.seed(60 + v);
    const c = P.canvas(240, 380), x = c.getContext('2d');
    const branch = (x0, y0, ang, len, w, depth) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      x.strokeStyle = '#120c0a'; x.lineCap = 'round'; x.lineWidth = w + 4; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      x.strokeStyle = P.pick(['#2a2220', '#342a26', '#3a2e28']); x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      if (P.rand() < 0.4) { x.strokeStyle = 'rgba(255,120,40,.7)'; x.lineWidth = Math.max(1, w * 0.18); x.beginPath(); x.moveTo(x0, y0); x.lineTo((x0 + x1) / 2, (y0 + y1) / 2); x.stroke(); }
      if (depth > 0) { branch(x1, y1, ang - P.r(0.3, 0.7), len * 0.7, w * 0.62, depth - 1); branch(x1, y1, ang + P.r(0.3, 0.7), len * 0.68, w * 0.6, depth - 1); }
    };
    branch(120, 378, -Math.PI / 2 + P.r(-0.08, 0.08), 150, 26, 4);
    if (v % 2) for (let i = 0; i < 26; i++) P.ellShape(x, P.r(40, 200), P.r(30, 170), P.r(5, 10), P.r(3, 6), { base: P.pick(['#8a4a20', '#b06a2a', '#5a4a3a']), lw: 1.5, dabs: 2 });
    return c;
  };
  A.ashPine = (v = 0) => {
    P.seed(70 + v);
    const c = P.canvas(200, 340), x = c.getContext('2d');
    P.rectShape(x, 90, 270, 20, 70, 4, { base: '#3a2a20' });
    for (let t = 0; t < 5; t++) {
      const y1 = 290 - t * 50, y0 = y1 - 110 + t * 8, hw = 90 - t * 15;
      const pts = [[100, y0], [100 + hw, y1 + 2]];
      for (let i = 1; i < 7; i++) pts.push([100 + hw - (i / 7) * hw * 2, y1 + (i % 2 ? -10 : 6)]);
      pts.push([100 - hw, y1 + 2]);
      P.polyShape(x, pts, { base: v ? '#2e3e36' : '#34463a', outline: '#0e1410', dab: 6 });
      for (let i = 0; i < 10; i++) P.ellShape(x, 100 + P.r(-hw * 0.7, hw * 0.7), y1 - P.r(0, 30), P.r(4, 9), P.r(2, 4), { base: '#8a8a84', lw: 0, dabs: 1 });
    }
    return c;
  };
  A.boulder = (v = 0) => {
    P.seed(80 + v);
    const c = P.canvas(220, 160), x = c.getContext('2d');
    P.polyShape(x, [[8, 156], [16, 96], [50, 40], [110, 18], [170, 36], [206, 90], [214, 156]], { base: v % 2 ? '#4a4440' : '#57504a', outline: '#100c0a', dab: 9 });
    x.strokeStyle = 'rgba(16,12,10,.7)'; x.lineWidth = 3; x.beginPath(); x.moveTo(110, 24); x.lineTo(96, 80); x.lineTo(120, 130); x.stroke();
    if (v === 2) { x.save(); x.shadowColor = '#ff8a2a'; x.shadowBlur = 12; x.strokeStyle = '#ff8a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(40, 120); x.lineTo(80, 90); x.lineTo(70, 60); x.stroke(); x.restore(); }
    return c;
  };
  A.herb = () => {
    P.seed(90);
    const c = P.canvas(90, 90), x = c.getContext('2d');
    glow(x, 45, 50, 40, '#9aff8a', 0.45);
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + P.r(-1, 1); x.save(); x.translate(45, 86); x.rotate(a + Math.PI / 2); P.shape(x, [[0, 0], [-8, -26], [0, -50], [8, -26]], { base: P.pick(['#4a9a4a', '#5ab05a', '#3a8a4a']), lw: 2, dabs: 4 }); x.restore(); }
    [[34, 30], [56, 26], [46, 18]].forEach(([fx, fy]) => P.ellShape(x, fx, fy, 6, 6, { base: '#e0f0a0', lw: 2, dabs: 2 }));
    return c;
  };
  A.ribcage = () => {
    P.seed(91);
    const c = P.canvas(420, 260), x = c.getContext('2d');
    P.rectShape(x, 20, 210, 380, 22, 10, { base: '#c8bca0' });
    for (let i = 0; i < 7; i++) { const bx = 50 + i * 52; x.strokeStyle = '#2a2016'; x.lineWidth = 16; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, 214); x.quadraticCurveTo(bx - 40, 100, bx + 10, 20 + i * 8); x.stroke(); x.strokeStyle = '#d8ccb0'; x.lineWidth = 10; x.stroke(); }
    return c;
  };
  A.caveMouth = () => {
    P.seed(92);
    const c = P.canvas(640, 420), x = c.getContext('2d');
    P.paint(x, (cx) => { cx.moveTo(0, 420); cx.lineTo(20, 160); cx.quadraticCurveTo(100, 20, 320, 10); cx.quadraticCurveTo(540, 20, 620, 160); cx.lineTo(640, 420); cx.closePath(); }, { base: '#4a423c', box: [0, 10, 640, 410], dab: 14 });
    P.paint(x, (cx) => { cx.moveTo(110, 420); cx.lineTo(120, 260); cx.quadraticCurveTo(200, 110, 320, 104); cx.quadraticCurveTo(440, 110, 520, 260); cx.lineTo(530, 420); cx.closePath(); }, { base: '#0c0807', box: [110, 104, 420, 316], lw: 6, hi: 0.05, lo: -0.2 });
    glow(x, 320, 380, 160, '#ff6a1a', 0.45);
    for (let i = 0; i < 12; i++) P.polyShape(x, [[140 + i * 32, 104 + Math.abs(6 - i) * 14], [150 + i * 32, 150 + Math.abs(6 - i) * 14 + P.r(0, 40)], [160 + i * 32, 104 + Math.abs(6 - i) * 14]], { base: '#3a3430', lw: 2, dabs: 3 });
    return c;
  };
  A.cliffTex = () => {
    P.seed(93);
    const S = 256, c = P.canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#4e4640'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) { const px = P.r(0, S), py = P.r(0, S), w = P.r(20, 60), h = P.r(8, 20); for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.globalAlpha = P.r(0.25, 0.6); x.fillStyle = P.pick(['#3a3430', '#5e5650', '#6a625a', '#2e2a26']); x.fillRect(px + ox, py + oy, w, h); } }
    x.globalAlpha = 0.5; x.strokeStyle = '#1a1410'; x.lineWidth = 2;
    for (let i = 0; i < 30; i++) { const py = P.r(0, S); x.beginPath(); x.moveTo(0, py); for (let px = 0; px <= S; px += 16) x.lineTo(px, py + P.r(-4, 4)); x.stroke(); }
    return c;
  };
})();
