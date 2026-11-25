// Scenery art — the small and the far: a scatter atlas (grass, scrub, pebbles, bones, flowers),
// green trees and village clutter for the guild, and colossal silhouettes for the horizon.
(function () {
  'use strict';
  const P = window.Paint, A = (window.Art = window.Art || {});
  const INK = '#15100e';
  const stroke = (x, pts, w, col, ink = INK) => {
    x.lineCap = 'round'; x.lineJoin = 'round';
    const path = () => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); };
    if (ink) { x.strokeStyle = ink; x.lineWidth = w + 4; path(); x.stroke(); }
    x.strokeStyle = col; x.lineWidth = w; path(); x.stroke();
  };
  const blob = (x, cx, cy, rx, ry, col, ink = INK) => {
    if (ink) { x.fillStyle = ink; x.beginPath(); x.ellipse(cx, cy, rx + 2.5, ry + 2.5, 0, 0, 7); x.fill(); }
    x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill();
  };
  const poly = (x, pts, col, ink = INK) => {
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.closePath();
    if (ink) { x.strokeStyle = ink; x.lineWidth = 5; x.lineJoin = 'round'; x.stroke(); }
    x.fillStyle = col; x.fill();
  };

  // ---------------------------------------------------------------- scatter atlas: 4 × 4 cells of 72 px
  A.SCATTER = { cols: 4, rows: 4, cell: 72 };
  // cell ids
  A.SC = { dry: 0, dryTall: 1, scrub: 2, pebbles: 3, rock: 4, bones: 5, skull: 6, emberBloom: 7, shroom: 8, stump: 9, grass: 10, grassTall: 11, flowersY: 12, flowersW: 13, fern: 14, cinder: 15 };
  let atlas = null;
  A.scatterAtlas = () => {
    if (atlas) return atlas;
    P.seed(515);
    const S = 72, c = P.canvas(S * 4, S * 4), x = c.getContext('2d');
    const cell = (i, fn) => { x.save(); x.translate((i % 4) * S, Math.floor(i / 4) * S); fn(); x.restore(); };
    const tuft = (cols, n, hMin, hMax, spread) => { for (let i = 0; i < n; i++) { const bx = 36 + P.r(-spread, spread) * 0.5, lean = P.r(-1, 1), h = P.r(hMin, hMax); stroke(x, [[bx, 68], [bx + lean * h * 0.25, 68 - h * 0.6], [bx + lean * h * 0.55, 68 - h]], P.r(2.5, 4), P.pick(cols)); } };
    cell(0, () => tuft(['#8a7a5a', '#a08a62', '#6e6048'], 9, 22, 40, 26));
    cell(1, () => tuft(['#9a865e', '#b09868', '#7a6a4c'], 11, 36, 60, 22));
    cell(2, () => { for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + P.r(-0.9, 0.9), l = P.r(24, 44), mx = 36 + Math.cos(a) * l * 0.6, my = 66 + Math.sin(a) * l * 0.6; stroke(x, [[36, 67], [mx, my], [mx + Math.cos(a + P.r(-0.8, 0.8)) * l * 0.5, my + Math.sin(a + P.r(-0.8, 0.8)) * l * 0.5]], 3, P.pick(['#2e2420', '#3a2c26', '#241c1a'])); } });
    cell(3, () => { [[18, 62, 8, 5], [34, 64, 6, 4], [50, 61, 9, 6], [42, 55, 5, 4], [26, 56, 4, 3]].forEach(([a, b, rx, ry], i) => blob(x, a, b, rx, ry, i % 2 ? '#6a625a' : '#565049')); });
    cell(4, () => { poly(x, [[10, 68], [14, 44], [30, 26], [50, 30], [62, 50], [64, 68]], '#5a524b'); poly(x, [[30, 26], [50, 30], [44, 46], [28, 42]], '#766c62', null); stroke(x, [[34, 34], [30, 52], [38, 64]], 2, '#2a2420', null); });
    cell(5, () => { stroke(x, [[12, 64], [40, 52]], 6, '#d2c6a8'); stroke(x, [[30, 66], [60, 60]], 5, '#c2b698'); blob(x, 12, 64, 5, 5, '#ddd2b6'); blob(x, 60, 60, 4, 4, '#ddd2b6'); stroke(x, [[44, 50], [52, 34]], 4, '#c8bc9e'); });
    cell(6, () => { blob(x, 36, 48, 18, 16, '#d6caac'); poly(x, [[24, 56], [48, 56], [44, 68], [28, 68]], '#c4b89a'); blob(x, 29, 48, 4.5, 5.5, '#1c1410', null); blob(x, 43, 48, 4.5, 5.5, '#1c1410', null); poly(x, [[36, 54], [33, 60], [39, 60]], '#1c1410', null); });
    cell(7, () => { stroke(x, [[36, 68], [34, 46], [38, 30]], 3, '#3a2a22'); x.save(); x.shadowColor = '#ff8a2a'; x.shadowBlur = 12; [[38, 26], [28, 34], [48, 34], [36, 16]].forEach(([a, b]) => blob(x, a, b, 6, 6, '#ff9a3a', '#5a1c08')); x.restore(); blob(x, 38, 26, 3, 3, '#ffe9a0', null); });
    cell(8, () => { [[24, 56, 9], [40, 48, 12], [54, 58, 7]].forEach(([a, b, r]) => { stroke(x, [[a, 68], [a, b]], 4, '#cfc4aa'); x.fillStyle = INK; x.beginPath(); x.ellipse(a, b, r + 2.5, r * 0.6 + 2.5, 0, Math.PI, 0); x.fill(); x.fillStyle = '#9a5a3a'; x.beginPath(); x.ellipse(a, b, r, r * 0.6, 0, Math.PI, 0); x.fill(); }); });
    cell(9, () => { poly(x, [[18, 68], [20, 40], [26, 30], [34, 38], [42, 26], [50, 36], [54, 68]], '#2a211e'); stroke(x, [[30, 60], [32, 42]], 2, '#ff7a2a', null); stroke(x, [[44, 62], [43, 46]], 2, '#4a3a34', null); });
    cell(10, () => tuft(['#4e7a3a', '#628c44', '#3e6a34'], 10, 22, 40, 26));
    cell(11, () => tuft(['#5a8a40', '#74a04e', '#467436'], 12, 36, 60, 22));
    cell(12, () => { tuft(['#4e7a3a', '#628c44'], 6, 20, 34, 30); [[20, 34], [36, 24], [52, 36], [30, 44]].forEach(([a, b]) => { stroke(x, [[a, 66], [a, b]], 2, '#3e6a34', null); blob(x, a, b, 5.5, 5.5, '#f0c84a'); blob(x, a, b, 2, 2, '#b06a1a', null); }); });
    cell(13, () => { tuft(['#4e7a3a', '#628c44'], 6, 20, 34, 30); [[18, 38, '#f2ece0'], [34, 26, '#e06a5a'], [52, 34, '#f2ece0'], [44, 46, '#e06a5a']].forEach(([a, b, col]) => { stroke(x, [[a, 66], [a, b]], 2, '#3e6a34', null); blob(x, a, b, 5.5, 5.5, col); blob(x, a, b, 2, 2, '#e8b83a', null); }); });
    cell(14, () => { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.42, l = P.r(34, 48); const tip = [36 + Math.cos(a) * l, 68 + Math.sin(a) * l]; stroke(x, [[36, 68], [36 + Math.cos(a) * l * 0.5, 68 + Math.sin(a) * l * 0.55 - 4], tip], 5, i % 2 ? '#3f7040' : '#4f8448'); } });
    cell(15, () => { x.save(); x.shadowColor = '#ff7a1a'; x.shadowBlur = 10; poly(x, [[20, 68], [26, 44], [34, 68]], '#ff9a3a', '#4a1606'); poly(x, [[36, 68], [46, 34], [54, 68]], '#ffb85a', '#4a1606'); x.restore(); poly(x, [[8, 68], [14, 56], [22, 68]], '#3a302c'); });
    return (atlas = c);
  };

  // ---------------------------------------------------------------- guild greenery + clutter
  A.greenTree = (v = 0) => {
    P.seed(300 + v);
    const c = P.canvas(300, 400), x = c.getContext('2d');
    P.polyShape(x, [[132, 396], [138, 250], [128, 200], [150, 190], [172, 200], [162, 250], [170, 396]], { base: '#5a3e28', outline: INK, dab: 6 });
    const tones = v % 3 === 0 ? ['#3e6e38', '#4f8444', '#63984e'] : v % 3 === 1 ? ['#4a7032', '#62883c', '#7a9c48'] : ['#356450', '#44785c', '#588c68'];
    const puffs = [[150, 200, 96, 62], [86, 168, 70, 56], [214, 170, 72, 56], [150, 118, 92, 70], [104, 96, 62, 52], [198, 98, 62, 52], [150, 60, 66, 50]];
    puffs.forEach(([cx, cy, rx, ry]) => P.ellShape(x, cx + P.r(-6, 6), cy, rx, ry, { base: tones[0], outline: INK, dab: 9 }));
    puffs.forEach(([cx, cy, rx, ry]) => P.ellShape(x, cx - rx * 0.18, cy - ry * 0.22, rx * 0.66, ry * 0.6, { base: tones[1], lw: 0, dabs: 8 }));
    puffs.slice(3).forEach(([cx, cy, rx, ry]) => P.ellShape(x, cx - rx * 0.3, cy - ry * 0.38, rx * 0.36, ry * 0.32, { base: tones[2], lw: 0, dabs: 4 }));
    return c;
  };
  A.bush = (v = 0) => {
    P.seed(320 + v);
    const c = P.canvas(200, 130), x = c.getContext('2d');
    [[60, 86, 54, 40], [136, 88, 56, 38], [100, 62, 60, 46]].forEach(([cx, cy, rx, ry]) => P.ellShape(x, cx, cy, rx, ry, { base: v ? '#3a6644' : '#44703a', outline: INK, dab: 7 }));
    [[52, 72, 30, 20], [96, 46, 34, 22], [132, 74, 28, 18]].forEach(([cx, cy, rx, ry]) => P.ellShape(x, cx, cy, rx, ry, { base: v ? '#52845a' : '#5e8e48', lw: 0, dabs: 5 }));
    if (v) for (let i = 0; i < 9; i++) P.ellShape(x, P.r(30, 170), P.r(36, 100), 4, 4, { base: '#c8423a', lw: 1.5, dabs: 1 });
    return c;
  };
  A.well = () => {
    P.seed(330);
    const c = P.canvas(220, 280), x = c.getContext('2d');
    P.rectShape(x, 34, 60, 12, 150, 3, { base: '#5a3e28', lw: 3 }); P.rectShape(x, 174, 60, 12, 150, 3, { base: '#5a3e28', lw: 3 });
    P.polyShape(x, [[14, 70], [110, 8], [206, 70], [196, 82], [110, 30], [24, 82]], { base: '#8a3e2e', outline: INK, dab: 6 });
    P.rectShape(x, 40, 92, 140, 9, 3, { base: '#4a3220', lw: 3 });
    x.strokeStyle = '#c8b890'; x.lineWidth = 3; x.beginPath(); x.moveTo(110, 100); x.lineTo(110, 150); x.stroke();
    P.rectShape(x, 96, 148, 28, 26, 3, { base: '#7a5632', lw: 3 });
    P.rectShape(x, 22, 190, 176, 84, 10, { base: '#8a8478', outline: INK, dab: 8 });
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(30,24,20,.55)'; x.lineWidth = 2; x.strokeRect(26 + i * 29 + (r % 2) * 14, 196 + r * 26, 28, 24); }
    P.ellShape(x, 110, 192, 86, 14, { base: '#3a342e', outline: INK });
    return c;
  };
  A.cart = () => {
    P.seed(331);
    const c = P.canvas(320, 200), x = c.getContext('2d');
    P.polyShape(x, [[10, 96], [0, 86], [60, 100], [58, 110]], { base: '#5a3e28', lw: 3 });
    P.rectShape(x, 56, 60, 220, 70, 5, { base: '#7a5632', outline: INK, dab: 8 });
    for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(30,18,10,.6)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(60 + i * 54, 62); x.lineTo(60 + i * 54, 128); x.stroke(); }
    [[90, 40, 34, 26, '#b89a5a'], [150, 34, 40, 30, '#8a6a3a'], [214, 42, 34, 24, '#b89a5a']].forEach(([cx, cy, rx, ry, col]) => P.ellShape(x, cx, cy, rx, ry, { base: col, outline: INK, dab: 5 }));
    [[108, 148], [232, 148]].forEach(([cx, cy]) => { P.ellShape(x, cx, cy, 44, 44, { base: '#4a3220', outline: INK }); P.ellShape(x, cx, cy, 30, 30, { base: '#8a6a44', lw: 3 }); x.strokeStyle = '#2a1a10'; x.lineWidth = 4; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; x.beginPath(); x.moveTo(cx - Math.cos(a) * 30, cy - Math.sin(a) * 30); x.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); x.stroke(); } P.ellShape(x, cx, cy, 7, 7, { base: '#2a2a30', lw: 2 }); });
    return c;
  };
  A.stall = (col = '#8a2e26') => {
    P.seed(332);
    const c = P.canvas(340, 300), x = c.getContext('2d');
    P.rectShape(x, 30, 60, 12, 236, 3, { base: '#5a3e28', lw: 3 }); P.rectShape(x, 298, 60, 12, 236, 3, { base: '#5a3e28', lw: 3 });
    P.polyShape(x, [[6, 96], [40, 24], [300, 24], [334, 96]], { base: col, outline: INK, dab: 8 });
    for (let i = 0; i < 4; i++) P.polyShape(x, [[52 + i * 76, 26], [90 + i * 76, 26], [98 + i * 76, 94], [44 + i * 76, 94]], { base: '#e8dcc0', lw: 0, dabs: 4 });
    for (let i = 0; i < 6; i++) P.polyShape(x, [[6 + i * 55, 96], [61 + i * 55, 96], [33 + i * 55, 118]], { base: i % 2 ? '#e8dcc0' : col, lw: 2.5, dabs: 2 });
    P.rectShape(x, 24, 190, 292, 26, 4, { base: '#7a5632', outline: INK, dab: 6 });
    P.rectShape(x, 36, 216, 268, 80, 3, { base: '#5e4228', lw: 3, dabs: 10 });
    [[70, 176, '#c84a3a'], [104, 178, '#e0a83a'], [140, 174, '#6a9a4a'], [200, 172, '#8a6a44'], [246, 176, '#c84a3a'], [274, 178, '#e0a83a']].forEach(([cx, cy, cl]) => P.ellShape(x, cx, cy, 15, 13, { base: cl, lw: 2.5, dabs: 2 }));
    return c;
  };
  A.hay = () => { P.seed(333); const c = P.canvas(170, 130), x = c.getContext('2d'); P.rectShape(x, 6, 20, 158, 106, 16, { base: '#c8a850', outline: INK, dab: 9 }); x.strokeStyle = 'rgba(120,84,30,.7)'; x.lineWidth = 2; for (let i = 0; i < 40; i++) { const px = P.r(14, 156), py = P.r(28, 118); x.beginPath(); x.moveTo(px, py); x.lineTo(px + P.r(-14, 14), py + P.r(-4, 4)); x.stroke(); } [56, 114].forEach((px) => { x.strokeStyle = '#6a4a22'; x.lineWidth = 5; x.beginPath(); x.moveTo(px, 22); x.lineTo(px, 124); x.stroke(); }); return c; };
  A.woodpile = () => { P.seed(334); const c = P.canvas(220, 130), x = c.getContext('2d'); [[4, 0], [3, 1], [2, 2]].forEach(([n, row]) => { for (let i = 0; i < n; i++) { const cx = 38 + row * 24 + i * 48, cy = 104 - row * 38; P.ellShape(x, cx, cy, 24, 22, { base: '#6a4628', outline: INK }); P.ellShape(x, cx, cy, 15, 14, { base: '#c8a070', lw: 2 }); P.ellShape(x, cx, cy, 6, 5.5, { base: '#a07848', lw: 1.5 }); } }); return c; };
  A.ivy = (v = 0) => {
    P.seed(340 + v);
    const c = P.canvas(220, 300), x = c.getContext('2d');
    for (let s = 0; s < 5; s++) { let px = 30 + s * 40 + P.r(-10, 10), py = 0; const len = P.r(120, 280); while (py < len) { const nx = px + P.r(-12, 12), ny = py + P.r(10, 18); stroke(x, [[px, py], [nx, ny]], 3, '#2e4a28', null); for (let k = 0; k < 2; k++) blob(x, nx + P.r(-14, 14), ny + P.r(-8, 8), P.r(6, 10), P.r(5, 8), P.pick(['#3e6a34', '#4e7c3c', '#335a30']), '#16240f'); px = nx; py = ny; } }
    return c;
  };

  // ---------------------------------------------------------------- the far world
  // a burning mountain: hazy, already "fogged" in paint so it can ignore scene fog
  A.volcano = () => {
    P.seed(350);
    const W = 1024, H = 560, c = P.canvas(W, H), x = c.getContext('2d');
    // smoke plume
    for (let i = 0; i < 60; i++) { const t = i / 60, px = 512 + t * 240 + P.r(-40, 40) * (0.4 + t), py = 250 - t * 240 + P.r(-20, 20); x.globalAlpha = 0.9; x.fillStyle = P.pick(['#3a2c2e', '#463436', '#54403e']); x.beginPath(); x.ellipse(px, py, 40 + t * 70, 30 + t * 44, 0, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    const g0 = x.createRadialGradient(512, 250, 0, 512, 250, 170); g0.addColorStop(0, 'rgba(255,170,70,.95)'); g0.addColorStop(0.4, 'rgba(255,100,30,.5)'); g0.addColorStop(1, 'rgba(255,90,20,0)');
    x.fillStyle = g0; x.fillRect(300, 60, 430, 380);
    const pts = [[0, H], [60, 500], [190, 440], [300, 360], [396, 290], [452, 250], [484, 262], [520, 252], [556, 264], [586, 250], [660, 320], [760, 400], [880, 470], [1024, 520], [1024, H]];
    x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
    const g = x.createLinearGradient(0, 250, 0, H); g.addColorStop(0, '#4a3432'); g.addColorStop(0.5, '#5c423c'); g.addColorStop(1, '#6a5048'); x.fillStyle = g; x.fill();
    x.save(); x.clip();
    for (let i = 0; i < 70; i++) { x.globalAlpha = P.r(0.08, 0.2); x.fillStyle = P.pick(['#2e2224', '#7a5a4e']); const px = P.r(0, W), py = P.r(260, H); x.beginPath(); x.moveTo(px, py); x.lineTo(px + P.r(40, 120), py + P.r(50, 130)); x.lineTo(px - P.r(10, 60), py + P.r(60, 140)); x.fill(); }
    x.globalAlpha = 1; x.shadowColor = '#ff7a1a'; x.shadowBlur = 14; x.lineCap = 'round';
    [[500, 258], [540, 258], [470, 264], [566, 266]].forEach(([sx, sy], k) => { let px = sx, py = sy; x.strokeStyle = k < 2 ? '#ffb04a' : '#ff7a2a'; x.lineWidth = k < 2 ? 5 : 3; x.beginPath(); x.moveTo(px, py); for (let i = 0; i < 9; i++) { px += P.r(-26, 26) + (k % 2 ? 10 : -10); py += P.r(18, 34); x.lineTo(px, py); } x.stroke(); });
    x.restore();
    return c;
  };
  // the ribs of something far larger than any behemoth, arching over the ridge
  A.colossusRibs = (v = 0) => {
    P.seed(360 + v);
    const W = 760, H = 420, c = P.canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round';
    const n = 7;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      const bx = 90 + i * 92, top = 40 + Math.abs(i - 3) * 22 + (v ? i * 6 : 0), lean = (i - 3) * 14;
      if (v && (i === 2 || i === 5)) { // snapped ribs
        x.strokeStyle = pass ? '#8a7a6c' : '#1e1614'; x.lineWidth = pass ? 20 : 28; x.beginPath(); x.moveTo(bx, H); x.quadraticCurveTo(bx - 40 + lean, 300, bx - 30 + lean, 230); x.stroke(); continue;
      }
      x.strokeStyle = pass ? (i % 2 ? '#9a8a7a' : '#8a7a6c') : '#1e1614'; x.lineWidth = pass ? 22 - Math.abs(i - 3) * 2 : 30 - Math.abs(i - 3) * 2;
      x.beginPath(); x.moveTo(bx, H); x.bezierCurveTo(bx - 70 + lean, 260, bx - 50 + lean, top + 30, bx + 46 + lean, top); x.stroke();
    }
    x.strokeStyle = '#1e1614'; x.lineWidth = 34; x.beginPath(); x.moveTo(30, H - 6); x.quadraticCurveTo(W / 2, H - 46, W - 30, H - 6); x.stroke();
    x.strokeStyle = '#857567'; x.lineWidth = 24; x.stroke();
    return c;
  };
})();
