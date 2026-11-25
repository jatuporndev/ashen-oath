// Pixel-art pipeline — every painted canvas is resampled to a fixed texel density, snapped to a
// shared hue-shifted palette (shadows lean violet, highlights lean gold), alpha is made binary and
// sprites get a 1-px ink outline. Also builds the pixel UI kit (9-slice frames, panels, cursor).
(function () {
  'use strict';
  const PX = (window.Pixel = {});
  // ---------------------------------------------------------------- palette (12 ramps × 8 shades)
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  const RAMPS = [[28, 0.1], [220, 0.1], [26, 0.42], [28, 0.55], [20, 0.88], [2, 0.66], [44, 0.75], [100, 0.38], [170, 0.32], [212, 0.5], [275, 0.32], [42, 0.32]];
  const L = [0.07, 0.14, 0.23, 0.34, 0.47, 0.61, 0.76, 0.9];
  const PAL = [[10, 8, 12], [250, 246, 236]];
  for (const [h, s] of RAMPS) L.forEach((l, i) => {
    const shift = (i - 3.5) / 3.5; // −1 shadow … +1 highlight
    const hh = h + (shift < 0 ? -shift * ((h > 60 && h < 240) ? 18 : -26) : shift * (h < 60 || h > 300 ? 10 : -14));
    PAL.push(hsl(hh, s * (1 - Math.abs(shift) * 0.25), l));
  });
  PX.palette = PAL;
  const cache = new Map();
  function nearest(r, g, b) {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = cache.get(key); if (v !== undefined) return v;
    let best = 0, bd = 1e9;
    for (let i = 0; i < PAL.length; i++) { const c = PAL[i], dr = c[0] - r, dg = c[1] - g, db = c[2] - b; const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (d < bd) { bd = d; best = i; } }
    cache.set(key, best); return best;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 18);
  const ink = [22, 14, 18];

  // ---------------------------------------------------------------- resample + quantize + outline
  // opts: { w, h } target size, outline, dither, alpha:'cut'|'keep', snap (palette)
  PX.process = (src, { w, h, outline = true, dither = false, alpha = 'cut', snap = true, sx = 0, sy = 0, sw, sh } = {}) => {
    sw = sw || src.width; sh = sh || src.height;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const img = x.getImageData(0, 0, w, h), d = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      let a = d[k + 3];
      if (alpha === 'cut') { a = a < 100 ? 0 : 255; d[k + 3] = a; }
      if (!a) continue;
      // un-premultiply edge colours so edges don't go muddy
      let r = d[k], g = d[k + 1], b = d[k + 2];
      if (dither) { const o = BAYER[(j & 3) * 4 + (i & 3)]; r += o; g += o; b += o; }
      if (snap) { const p = PAL[nearest(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)))]; d[k] = p[0]; d[k + 1] = p[1]; d[k + 2] = p[2]; }
    }
    if (outline && alpha === 'cut') {
      const solid = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 0;
      const mark = new Uint8Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        if (d[(j * w + i) * 4 + 3]) continue;
        if (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1)) mark[j * w + i] = 1;
      }
      for (let n = 0; n < mark.length; n++) if (mark[n]) { const k = n * 4; d[k] = ink[0]; d[k + 1] = ink[1]; d[k + 2] = ink[2]; d[k + 3] = 255; }
    }
    x.putImageData(img, 0, 0);
    return c;
  };
  // density-based: canvas representing `units` world-units tall → `tpu` texels per unit
  const memo = new WeakMap();
  PX.sprite = (canvas, heightUnits, tpu = 14, opts = {}) => {
    let m = memo.get(canvas); if (!m) { m = new Map(); memo.set(canvas, m); }
    const key = heightUnits.toFixed(2) + '|' + tpu + '|' + (opts.outline === false ? 0 : 1);
    if (m.has(key)) return m.get(key);
    const h = Math.max(4, heightUnits * tpu), w = h * (canvas.width / canvas.height);
    const out = PX.process(canvas, Object.assign({ w, h }, opts));
    m.set(key, out); return out;
  };
  PX.scaled = (canvas, factor, opts = {}) => PX.process(canvas, Object.assign({ w: canvas.width / factor, h: canvas.height / factor }, opts));
  // sprite sheet: resample frame-by-frame so frames stay perfectly aligned
  PX.sheet = (canvas, cols, rows, fw, fh, opts = {}) => {
    const c = document.createElement('canvas'); c.width = cols * fw; c.height = rows * fh;
    const x = c.getContext('2d'); const sw = canvas.width / cols, sh = canvas.height / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) x.drawImage(PX.process(canvas, Object.assign({ w: fw, h: fh, sx: k * sw, sy: r * sh, sw, sh }, opts)), k * fw, r * fh);
    return c;
  };
  PX.texParams = (t) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 1; return t; };

  // ---------------------------------------------------------------- pixel UI kit (drawn at 1×, shown at 3–4×)
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const fill = (x, col, X, Y, W, H) => { x.fillStyle = col; x.fillRect(X, Y, W, H); };
  // ornate frame: 16-px corners, 1-px pixel lines; colors: dark wood/iron with gold trim
  PX.frame = (kind = 'iron') => {
    const S = 24, c = cv(S, S), x = c.getContext('2d');
    const C = kind === 'parch' ? { o: '#2a160e', a: '#7a4a24', b: '#c08a3c', hi: '#f2d68a', in: '#e8d3a2' }
      : kind === 'ember' ? { o: '#140a08', a: '#5a2410', b: '#e0762a', hi: '#ffd27a', in: '#1c1210' }
        : { o: '#0c0a0e', a: '#3a3644', b: '#b08a44', hi: '#f0d488', in: '#17121a' };
    fill(x, C.in, 0, 0, S, S);
    // outer ink, iron band, gold trim line, inner shadow
    fill(x, C.o, 0, 0, S, 1); fill(x, C.o, 0, S - 1, S, 1); fill(x, C.o, 0, 0, 1, S); fill(x, C.o, S - 1, 0, 1, S);
    fill(x, C.a, 1, 1, S - 2, 2); fill(x, C.a, 1, S - 3, S - 2, 2); fill(x, C.a, 1, 1, 2, S - 2); fill(x, C.a, S - 3, 1, 2, S - 2);
    fill(x, C.b, 3, 3, S - 6, 1); fill(x, C.b, 3, S - 4, S - 6, 1); fill(x, C.b, 3, 3, 1, S - 6); fill(x, C.b, S - 4, 3, 1, S - 6);
    fill(x, C.o, 4, 4, S - 8, 1); fill(x, C.o, 4, 4, 1, S - 8);
    // corner studs
    [[1, 1], [S - 7, 1], [1, S - 7], [S - 7, S - 7]].forEach(([cx, cy]) => { fill(x, C.o, cx, cy, 6, 6); fill(x, C.b, cx + 1, cy + 1, 4, 4); fill(x, C.hi, cx + 1, cy + 1, 2, 2); fill(x, C.a, cx + 3, cy + 3, 2, 2); });
    return c;
  };
  PX.panel = (kind = 'dark', w = 64, h = 64) => {
    const c = cv(w, h), x = c.getContext('2d');
    const base = kind === 'parch' ? ['#e8d3a2', '#dcc290', '#f0e0b8', '#cdb07c'] : kind === 'wood' ? ['#3a2416', '#4a2e1c', '#2e1c10', '#563620'] : ['#17121a', '#1d1720', '#120e14', '#221a26'];
    fill(x, base[0], 0, 0, w, h);
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    if (kind === 'wood') for (let j = 0; j < h; j += 8) { fill(x, base[2], 0, j, w, 1); for (let i = 0; i < w; i++) if (rnd() < 0.18) fill(x, base[rnd() < 0.5 ? 1 : 3], i, j + 1 + Math.floor(rnd() * 6), Math.ceil(rnd() * 5), 1); }
    else for (let n = 0; n < (w * h) / 9; n++) fill(x, base[1 + Math.floor(rnd() * 3)], Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
    return c;
  };
  PX.cursor = () => { const c = cv(7, 9), x = c.getContext('2d'); const rows = ['1......', '121....', '12321..', '1233321', '12321..', '121....', '1......']; const col = { 1: '#1a0a06', 2: '#ff9a3a', 3: '#ffe08a' }; rows.forEach((r, j) => [...r].forEach((ch, i) => { if (col[ch]) fill(x, col[ch], i, j + 1, 1, 1); })); return c; };
  PX.divider = (w = 96) => { const c = cv(w, 7), x = c.getContext('2d'); fill(x, '#7a5a2a', 4, 3, w - 8, 1); fill(x, '#e0b866', 8, 3, w - 16, 1); const m = w / 2 | 0; [[m - 1, 1, 3, 5], [m - 2, 2, 5, 3]].forEach(([a, b, cw, ch]) => fill(x, '#e0b866', a, b, cw, ch)); fill(x, '#ff9a3a', m, 3, 1, 1); fill(x, '#e0b866', 2, 2, 2, 3); fill(x, '#e0b866', w - 4, 2, 2, 3); return c; };
  PX.dither = (col = '#ff9a3a') => { const c = cv(4, 4), x = c.getContext('2d'); [[0, 0], [2, 0], [1, 1], [3, 1], [0, 2], [2, 2], [1, 3], [3, 3]].forEach(([i, j]) => fill(x, col, i, j, 1, 1)); return c; };
})();
