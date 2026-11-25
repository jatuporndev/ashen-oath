// Emberwild — procedural "hand-painted" 2D artwork.
// Every character, monster, prop and backdrop is painted onto a canvas with
// outlined shapes, gradient shading and hundreds of soft brush dabs.
(function () {
  const P = (window.Paint = {});
  let seed = 1337;
  P.seed = (s) => (seed = s);
  P.rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  P.r = (a, b) => a + (b - a) * P.rand();
  P.pick = (arr) => arr[Math.floor(P.rand() * arr.length)];
  P.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  function rgb(h) {
    if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number);
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  P.shade = (hex, amt) => {
    const [r, g, b] = rgb(hex);
    const f = amt < 0 ? (c) => c * (1 + amt) : (c) => c + (255 - c) * amt;
    return `rgb(${f(r) | 0},${f(g) | 0},${f(b) | 0})`;
  };
  P.rgba = (hex, a) => {
    const [r, g, b] = rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };

  // ---------- path builders ----------
  P.ell = (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  P.rrect = (x, y, w, h, r) => (c) => c.roundRect(x, y, w, h, r);
  P.poly = (pts) => (c) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  P.smooth = (pts) => (c) => {
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m = mid(pts[n - 1], pts[0]);
    c.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], mm = mid(p, q);
      c.quadraticCurveTo(p[0], p[1], mm[0], mm[1]);
    }
    c.closePath();
  };
  P.blobPts = (cx, cy, rx, ry, v = 0.15, n = 12) => {
    const a = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const k = 1 + P.r(-v, v);
      a.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    return a;
  };
  function bboxOf(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1 - x0, y1 - y0];
  }
  P.bbox = bboxOf;

  // ---------- the core painter ----------
  // outline -> flat base -> diagonal light/shadow gradient -> brush dabs
  P.paint = (ctx, path, o) => {
    const base = o.base, lw = o.lw ?? 4, outline = o.outline ?? '#2b1d14';
    ctx.save();
    ctx.beginPath();
    path(ctx);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (lw > 0) { ctx.strokeStyle = outline; ctx.lineWidth = lw; ctx.stroke(); }
    ctx.fillStyle = base;
    ctx.fill();
    ctx.clip();
    const [bx, by, bw, bh] = o.box || [0, 0, ctx.canvas.width, ctx.canvas.height];
    const g = ctx.createLinearGradient(bx, by, bx + bw * 0.7, by + bh);
    g.addColorStop(0, P.shade(base, o.hi ?? 0.35));
    g.addColorStop(0.5, P.shade(base, 0));
    g.addColorStop(1, P.shade(base, o.lo ?? -0.45));
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw, bh);
    const n = o.dabs ?? Math.min(500, Math.round((bw * bh) / 90));
    const ds = o.dab ?? Math.max(2.5, Math.min(bw, bh) / 9);
    for (let i = 0; i < n; i++) {
      const x = bx + P.rand() * bw, y = by + P.rand() * bh;
      const t = ((x - bx) / bw) * 0.4 + ((y - by) / bh) * 0.6 + P.r(-0.2, 0.2);
      ctx.fillStyle = t < 0.38 ? P.shade(base, P.r(0.15, 0.5)) : t > 0.62 ? P.shade(base, P.r(-0.55, -0.15)) : P.shade(base, P.r(-0.12, 0.12));
      ctx.globalAlpha = P.r(0.12, 0.38);
      ctx.beginPath();
      ctx.ellipse(x, y, ds * P.r(0.5, 1.2), ds * P.r(0.3, 0.7), P.r(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  // convenience: paint a point-list shape (smooth) with auto bbox
  P.shape = (ctx, pts, o) => P.paint(ctx, P.smooth(pts), Object.assign({ box: bboxOf(pts) }, o));
  P.polyShape = (ctx, pts, o) => P.paint(ctx, P.poly(pts), Object.assign({ box: bboxOf(pts) }, o));
  P.ellShape = (ctx, x, y, rx, ry, o, rot = 0) =>
    P.paint(ctx, P.ell(x, y, rx, ry, rot), Object.assign({ box: [x - rx, y - ry, rx * 2, ry * 2] }, o));
  P.rectShape = (ctx, x, y, w, h, r, o) => P.paint(ctx, P.rrect(x, y, w, h, r), Object.assign({ box: [x, y, w, h] }, o));

  function dot(ctx, x, y, r, col, a = 1) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function eye(ctx, x, y, rx, ry, col = '#22150f') {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + rx * 0.35, y - ry * 0.4, Math.max(1, rx * 0.45), 0, 7); ctx.fill(); ctx.restore();
  }
  function glow(ctx, x, y, r, col, a = 0.8) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, P.rgba(col, a)); g.addColorStop(1, P.rgba(col, 0));
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function sword(ctx, hx, hy, ang, len) {
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(ang);
    // blade along +x
    P.polyShape(ctx, [[8, -4], [len - 8, -4], [len, 0], [len - 8, 4], [8, 4]], { base: '#cfdbe8', lw: 3, outline: '#1e2430', dab: 3, hi: 0.6 });
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10, -1.5); ctx.lineTo(len - 10, -1.5); ctx.stroke();
    P.rectShape(ctx, 4, -10, 6, 20, 2, { base: '#e2b448', lw: 2.5, dabs: 6 });
    P.rectShape(ctx, -12, -3, 17, 6, 2, { base: '#6a3d22', lw: 2.5, dabs: 6 });
    dot(ctx, -13, 0, 4, '#e2b448');
    ctx.restore();
  }

  // ---------- characters ----------
  P.hero = (frame) => {
    P.seed(11);
    const c = P.canvas(128, 192), x = c.getContext('2d');
    const leg = frame === 'walk1' ? 1 : frame === 'walk2' ? -1 : 0;
    const atk = frame === 'attack';
    const cs = atk ? -14 : leg !== 0 ? -6 - leg * 4 : 0;
    // cape
    P.shape(x, [[54, 70], [72, 76], [66, 118], [56, 162], [32 + cs, 170], [24 + cs, 140], [38, 100]], { base: '#b0303e' });
    // back leg + boot
    P.rectShape(x, 58 - leg * 8, 128, 14, 46, 5, { base: '#4b3b5e' });
    P.rectShape(x, 54 - leg * 8, 166, 24, 17, 7, { base: '#5a3a22' });
    // back arm
    P.rectShape(x, 50, 80, 12, 38, 6, { base: '#2d5a8a' });
    // torso
    P.shape(x, [[50, 72], [82, 72], [90, 104], [92, 142], [42, 142], [44, 104]], { base: '#3b78b8' });
    // collar
    P.shape(x, [[52, 72], [80, 72], [74, 86], [58, 86]], { base: '#e8d6a8', lw: 3 });
    // belt
    P.rectShape(x, 42, 116, 50, 10, 3, { base: '#6b4424', lw: 3, dabs: 20 });
    P.rectShape(x, 70, 114, 10, 14, 2, { base: '#f0c850', lw: 2.5, dabs: 4 });
    // front leg + boot
    P.rectShape(x, 66 + leg * 8, 130, 15, 44, 5, { base: '#58466e' });
    P.rectShape(x, 64 + leg * 8, 166, 26, 17, 7, { base: '#6b4428' });
    // head
    P.ellShape(x, 68, 48, 22, 23, { base: '#f2c9a2' });
    // hair
    P.shape(x, [[44, 54], [42, 28], [56, 18], [80, 18], [92, 30], [88, 40], [72, 34], [62, 42], [56, 62], [48, 66]], { base: '#eba23a' });
    eye(x, 80, 50, 3.2, 5);
    dot(x, 81, 61, 5, '#e46a5e', 0.35);
    // front arm + sword
    if (atk) {
      P.rectShape(x, 68, 82, 36, 12, 6, { base: '#3b78b8' });
      dot(x, 104, 88, 7, '#f2c9a2'); x.strokeStyle = '#2b1d14'; x.lineWidth = 3; x.beginPath(); x.arc(104, 88, 7, 0, 7); x.stroke();
      sword(x, 104, 88, -1.25, 86);
    } else {
      P.rectShape(x, 64, 80, 12, 40, 6, { base: '#3b78b8' });
      dot(x, 70, 122, 7, '#f2c9a2'); x.strokeStyle = '#2b1d14'; x.lineWidth = 3; x.beginPath(); x.arc(70, 122, 7, 0, 7); x.stroke();
      sword(x, 70, 122, 1.15, 70);
    }
    return c;
  };

  P.goblin = (frame) => {
    P.seed(23);
    const c = P.canvas(128, 160), x = c.getContext('2d');
    const leg = frame === 'walk1' ? 1 : frame === 'walk2' ? -1 : 0;
    const atk = frame === 'attack';
    P.rectShape(x, 46 - leg * 7, 118, 14, 32, 5, { base: '#5e8a34' });
    P.rectShape(x, 42 - leg * 7, 142, 22, 13, 6, { base: '#4a3020' });
    // body (rag tunic)
    P.shape(x, [[40, 84], [84, 82], [92, 112], [88, 132], [36, 132], [32, 110]], { base: '#8a5a32' });
    P.polyShape(x, [[36, 126], [46, 138], [56, 126], [66, 140], [76, 126], [88, 136], [88, 124], [36, 120]], { base: '#7a4c28', lw: 3 });
    P.rectShape(x, 62 + leg * 7, 120, 14, 30, 5, { base: '#6d9a3c' });
    P.rectShape(x, 60 + leg * 7, 142, 24, 13, 6, { base: '#4a3020' });
    // back ear, head, front ear
    P.polyShape(x, [[46, 54], [10, 34], [44, 70]], { base: '#6d9a3c' });
    P.ellShape(x, 70, 60, 28, 24, { base: '#7fae48' });
    P.polyShape(x, [[88, 50], [124, 30], [94, 68]], { base: '#7fae48' });
    // nose & mouth
    P.shape(x, [[90, 60], [104, 70], [92, 74]], { base: '#6d9a3c', lw: 3 });
    x.strokeStyle = '#2b1d14'; x.lineWidth = 3; x.beginPath(); x.moveTo(74, 76); x.quadraticCurveTo(84, 82, 94, 76); x.stroke();
    x.fillStyle = '#fff8e0'; x.beginPath(); x.moveTo(80, 78); x.lineTo(83, 84); x.lineTo(86, 79); x.fill();
    eye(x, 82, 56, 5, 4.5, '#c8301e');
    x.strokeStyle = '#2b1d14'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(74, 46); x.lineTo(90, 51); x.stroke();
    // arm + club
    if (atk) {
      P.rectShape(x, 66, 72, 12, 30, 6, { base: '#7fae48' }, 0);
      x.save(); x.translate(72, 74); x.rotate(-0.5);
      P.shape(x, [[-6, 0], [6, 0], [12, -54], [0, -66], [-12, -54]], { base: '#8a6038' });
      x.restore();
    } else {
      P.rectShape(x, 70, 88, 12, 30, 6, { base: '#7fae48' });
      x.save(); x.translate(78, 116); x.rotate(0.9);
      P.shape(x, [[-6, 0], [6, 0], [12, -48], [0, -58], [-12, -48]], { base: '#8a6038' });
      x.restore();
    }
    return c;
  };

  P.slime = (hue = 'green') => {
    P.seed(5);
    const base = hue === 'green' ? '#5cc46a' : '#5aa0e8';
    const c = P.canvas(128, 112), x = c.getContext('2d');
    P.shape(x, [[8, 100], [12, 68], [32, 32], [64, 16], [96, 32], [116, 68], [120, 100], [64, 108]], { base, outline: '#1c3a22' });
    x.save(); x.globalAlpha = 0.55; x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(42, 42, 12, 7, -0.6, 0, 7); x.fill();
    x.beginPath(); x.arc(30, 58, 4, 0, 7); x.fill(); x.restore();
    eye(x, 66, 64, 5, 8); eye(x, 88, 64, 5, 8);
    x.strokeStyle = '#1c3a22'; x.lineWidth = 3; x.beginPath(); x.arc(78, 78, 6, 0.2, Math.PI - 0.2); x.stroke();
    dot(x, 56, 80, 6, '#ff8a8a', 0.4); dot(x, 100, 80, 6, '#ff8a8a', 0.4);
    return c;
  };

  P.wisp = () => {
    P.seed(9);
    const c = P.canvas(112, 144), x = c.getContext('2d');
    P.shape(x, [[56, 6], [68, 34], [90, 62], [92, 100], [72, 128], [40, 128], [20, 100], [22, 62], [44, 34]], { base: '#6fd2ff', outline: '#173a6a', hi: 0.6 });
    P.shape(x, [[56, 40], [70, 70], [72, 100], [56, 116], [40, 100], [42, 70]], { base: '#d6f6ff', lw: 0 });
    eye(x, 48, 88, 4.5, 7, '#173a6a'); eye(x, 68, 88, 4.5, 7, '#173a6a');
    return c;
  };

  P.elder = () => {
    P.seed(31);
    const c = P.canvas(128, 200), x = c.getContext('2d');
    // staff
    P.rectShape(x, 98, 22, 8, 176, 3, { base: '#7a5230', lw: 3 });
    glow(x, 102, 20, 22, '#9cff8a', 0.9);
    P.ellShape(x, 102, 20, 9, 11, { base: '#8cf08a', outline: '#1f4a24', lw: 3, hi: 0.7 });
    // robe
    P.shape(x, [[46, 66], [84, 66], [96, 130], [106, 196], [22, 196], [32, 130]], { base: '#6a4a9a' });
    P.rectShape(x, 30, 186, 72, 10, 3, { base: '#e0c060', lw: 3, dabs: 10 });
    // hood + face
    P.shape(x, [[36, 70], [38, 30], [62, 10], [88, 28], [94, 70]], { base: '#5a3e88' });
    P.ellShape(x, 68, 50, 18, 20, { base: '#eac0a0' });
    // beard
    P.shape(x, [[52, 58], [86, 58], [88, 90], [74, 124], [62, 128], [54, 100]], { base: '#f2f0ea', outline: '#5a5a66', lw: 3 });
    eye(x, 76, 46, 2.8, 3.6);
    x.strokeStyle = '#eee'; x.lineWidth = 4; x.beginPath(); x.moveTo(70, 38); x.lineTo(84, 38); x.stroke();
    // hand on staff
    P.ellShape(x, 100, 106, 8, 8, { base: '#eac0a0', lw: 3 });
    return c;
  };

  // ---------- nature props ----------
  P.oak = (variant = 0) => {
    P.seed(100 + variant * 7);
    const c = P.canvas(256, 320), x = c.getContext('2d');
    const pal = [
      ['#3a7038', '#4c8a3e', '#62a446'],
      ['#3f7a3a', '#5a943c', '#7ab04a'],
      ['#a8542a', '#d0803a', '#e8b048'],
    ][variant % 3];
    P.polyShape(x, [[106, 318], [116, 210], [96, 176], [120, 186], [128, 150], [136, 188], [160, 172], [142, 212], [152, 318], [170, 318], [88, 318]], { base: '#6b4a2e' });
    const blobs = [[78, 160, 58, 46], [178, 158, 60, 46], [128, 92, 82, 64], [84, 96, 52, 44], [172, 98, 54, 46], [128, 152, 72, 48], [128, 58, 54, 40]];
    blobs.forEach((b, i) => {
      const col = i < 2 ? pal[0] : i < 5 ? pal[1] : pal[2];
      P.shape(x, P.blobPts(b[0], b[1], b[2], b[3], 0.14, 14), { base: col, outline: '#1f3a1c', dab: 7 });
    });
    for (let i = 0; i < 60; i++) {
      const px = P.r(60, 196), py = P.r(30, 120);
      x.save(); x.globalAlpha = P.r(0.25, 0.5); x.fillStyle = P.shade(pal[2], P.r(0.2, 0.5));
      x.beginPath(); x.ellipse(px, py, P.r(4, 9), P.r(2, 5), P.r(0, 3), 0, 7); x.fill(); x.restore();
    }
    if (variant === 1) for (let i = 0; i < 10; i++) dot(x, P.r(70, 190), P.r(60, 170), 4, '#e2433a');
    return c;
  };

  P.pine = (variant = 0) => {
    P.seed(200 + variant * 5);
    const c = P.canvas(192, 320), x = c.getContext('2d');
    const base = variant ? '#2a5a48' : '#2f6440';
    P.rectShape(x, 86, 250, 20, 68, 4, { base: '#5a3c26' });
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const y1 = 270 - t * 46, y0 = y1 - 110 + t * 6, hw = 88 - t * 15;
      const pts = [[96, y0]];
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const px = 96 + hw - (i / n) * hw * 2;
        pts.push([px, y1 + (i % 2 ? -10 : 4)]);
      }
      // reorder to go right side down, along bottom, up left side
      const pp = [[96, y0], [96 + hw, y1 + 2]];
      for (let i = 1; i < n; i++) pp.push([96 + hw - (i / n) * hw * 2, y1 + (i % 2 ? -10 : 6)]);
      pp.push([96 - hw, y1 + 2]);
      P.polyShape(x, pp, { base: P.shade(base, t * 0.06).replace('rgb', 'rgb'), outline: '#14281c', dab: 6 });
    }
    return c;
  };

  P.bush = (berries) => {
    P.seed(300 + (berries ? 1 : 0));
    const c = P.canvas(160, 110), x = c.getContext('2d');
    [[48, 70, 42, 34, '#3f7a3a'], [112, 70, 42, 34, '#3f7a3a'], [80, 52, 50, 40, '#56943e']].forEach((b) =>
      P.shape(x, P.blobPts(b[0], b[1], b[2], b[3], 0.15, 12), { base: b[4], outline: '#1f3a1c', dab: 6 })
    );
    if (berries) for (let i = 0; i < 9; i++) dot(x, P.r(30, 130), P.r(40, 90), 4.5, '#7a3fc8');
    return c;
  };

  P.rock = (v = 0) => {
    P.seed(400 + v);
    const c = P.canvas(128, 96), x = c.getContext('2d');
    const pts = [[8, 92], [14, 56], [36, 26], [70, 14], [102, 30], [120, 62], [122, 92]];
    P.polyShape(x, pts, { base: v % 2 ? '#8f8a80' : '#8a93a0', outline: '#2a2a30', dab: 6 });
    for (let i = 0; i < 25; i++) dot(x, P.r(30, 100), P.r(20, 40), P.r(2, 5), '#6a9a48', 0.5);
    x.strokeStyle = 'rgba(30,30,40,.6)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(60, 30); x.lineTo(68, 52); x.lineTo(62, 70); x.stroke();
    return c;
  };

  P.grass = (flowers) => {
    P.seed(500 + (flowers || 0));
    const c = P.canvas(64, 56), x = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const bx = P.r(14, 50), lean = P.r(-16, 16), h = P.r(22, 50);
      x.strokeStyle = P.pick(['#4c8a3e', '#62a446', '#7ab84e', '#3a7038']);
      x.lineWidth = P.r(2, 3.5); x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx, 55); x.quadraticCurveTo(bx + lean * 0.3, 55 - h * 0.6, bx + lean, 55 - h); x.stroke();
    }
    if (flowers) {
      const col = ['#f4e04a', '#f08ab0', '#ffffff', '#a88af0'][flowers - 1];
      for (let i = 0; i < 6; i++) {
        const fx = P.r(10, 54), fy = P.r(8, 30);
        for (let k = 0; k < 5; k++) dot(x, fx + Math.cos(k * 1.26) * 3.2, fy + Math.sin(k * 1.26) * 3.2, 2.6, col);
        dot(x, fx, fy, 2, '#e8902a');
      }
    }
    return c;
  };

  P.mushroom = () => {
    P.seed(600);
    const c = P.canvas(64, 64), x = c.getContext('2d');
    P.rectShape(x, 26, 30, 12, 30, 4, { base: '#efe6d0', lw: 3 });
    P.shape(x, [[6, 34], [14, 14], [32, 6], [50, 14], [58, 34]], { base: '#d8402e', lw: 3 });
    [[22, 20], [38, 16], [46, 26], [16, 28]].forEach(([a, b]) => dot(x, a, b, 3.2, '#fff'));
    return c;
  };

  P.reed = () => {
    P.seed(650);
    const c = P.canvas(48, 96), x = c.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const bx = P.r(10, 38), h = P.r(50, 88), l = P.r(-8, 8);
      x.strokeStyle = P.pick(['#5a8a3e', '#6f9a44', '#4a7a36']); x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(bx, 95); x.quadraticCurveTo(bx, 95 - h / 2, bx + l, 95 - h); x.stroke();
      if (i % 2 === 0) P.rectShape(x, bx + l - 3, 95 - h, 6, 16, 3, { base: '#7a5030', lw: 2, dabs: 4 });
    }
    return c;
  };

  P.signpost = () => {
    P.seed(700);
    const c = P.canvas(96, 128), x = c.getContext('2d');
    P.rectShape(x, 42, 30, 12, 96, 3, { base: '#7a5230', lw: 3 });
    P.polyShape(x, [[10, 22], [80, 22], [92, 34], [80, 46], [10, 46]], { base: '#a87a48', lw: 3 });
    P.polyShape(x, [[16, 54], [84, 54], [84, 76], [16, 76], [4, 65]], { base: '#9a6e40', lw: 3 });
    x.strokeStyle = 'rgba(40,25,15,.8)'; x.lineWidth = 2;
    [[20, 34, 70], [24, 65, 74]].forEach(([a, b, e]) => { x.beginPath(); x.moveTo(a, b); x.lineTo(e, b); x.stroke(); });
    return c;
  };

  P.crystal = () => {
    P.seed(800);
    const c = P.canvas(112, 176), x = c.getContext('2d');
    glow(x, 56, 100, 56, '#ff9a3a', 0.6);
    P.polyShape(x, [[30, 170], [22, 110], [36, 80], [48, 118], [46, 170]], { base: '#e86a2a', outline: '#4a1a0a', hi: 0.7 });
    P.polyShape(x, [[66, 170], [70, 104], [88, 84], [92, 130], [82, 170]], { base: '#e86a2a', outline: '#4a1a0a', hi: 0.7 });
    P.polyShape(x, [[40, 172], [44, 60], [58, 14], [72, 60], [74, 172]], { base: '#ffa040', outline: '#4a1a0a', hi: 0.8 });
    x.strokeStyle = 'rgba(255,250,220,.9)'; x.lineWidth = 3; x.beginPath(); x.moveTo(56, 30); x.lineTo(52, 150); x.stroke();
    P.shape(x, [[14, 176], [20, 162], [56, 156], [96, 162], [100, 176]], { base: '#6a6870', lw: 3 });
    return c;
  };

  P.potion = () => {
    P.seed(900);
    const c = P.canvas(48, 64), x = c.getContext('2d');
    glow(x, 24, 40, 24, '#ff5a6a', 0.5);
    P.rectShape(x, 18, 6, 12, 16, 3, { base: '#c8a070', lw: 3, dabs: 4 });
    P.ellShape(x, 24, 40, 17, 18, { base: '#e8384a', outline: '#3a0a12', hi: 0.6 });
    dot(x, 17, 34, 4, '#fff', 0.7);
    return c;
  };

  P.coin = () => {
    P.seed(950);
    const c = P.canvas(40, 40), x = c.getContext('2d');
    P.ellShape(x, 20, 20, 15, 15, { base: '#f2c43a', outline: '#5a3a0a', hi: 0.6, lw: 3 });
    x.strokeStyle = '#a87a1a'; x.lineWidth = 2; x.beginPath(); x.arc(20, 20, 9, 0, 7); x.stroke();
    return c;
  };

  // ---------- effects ----------
  P.glowTex = (col = '#ffffff') => {
    const c = P.canvas(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, P.rgba(col, 0.8)); g.addColorStop(1, P.rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return c;
  };
  P.shadowTex = () => {
    const c = P.canvas(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(20,30,20,.75)'); g.addColorStop(0.6, 'rgba(20,30,20,.35)'); g.addColorStop(1, 'rgba(20,30,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return c;
  };
  P.slash = () => {
    const c = P.canvas(256, 256), x = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      x.strokeStyle = `rgba(${200 + i * 4},${235 + i},255,${0.06 + i * 0.05})`;
      x.lineWidth = 26 - i * 1.7; x.lineCap = 'round';
      x.beginPath(); x.arc(70, 128, 110 - i * 0.8, -1.15 + i * 0.02, 1.15 - i * 0.02); x.stroke();
    }
    return c;
  };

  // ---------- environment textures ----------
  function wrapDab(x, S, px, py, rx, ry, rot) {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      x.beginPath(); x.ellipse(px + ox, py + oy, rx, ry, rot, 0, 7); x.fill();
    }
  }
  P.groundDetail = () => {
    P.seed(1000);
    const S = 256, c = P.canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#909090'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2200; i++) {
      const v = P.r(60, 200) | 0;
      x.fillStyle = `rgb(${v},${v},${v})`; x.globalAlpha = P.r(0.15, 0.4);
      wrapDab(x, S, P.r(0, S), P.r(0, S), P.r(1, 2.2), P.r(3, 8), P.r(-0.5, 0.5));
    }
    return c;
  };
  P.water = () => {
    P.seed(1100);
    const S = 256, c = P.canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#3d7ea6'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = P.pick(['#2f6a92', '#4a90b8', '#5aa6c8', '#2a5a80']); x.globalAlpha = P.r(0.2, 0.5);
      wrapDab(x, S, P.r(0, S), P.r(0, S), P.r(6, 20), P.r(2, 5), P.r(-0.2, 0.2));
    }
    for (let i = 0; i < 60; i++) {
      x.fillStyle = '#e8f6ff'; x.globalAlpha = P.r(0.25, 0.6);
      wrapDab(x, S, P.r(0, S), P.r(0, S), P.r(4, 12), P.r(0.8, 1.6), P.r(-0.15, 0.15));
    }
    return c;
  };
  P.stone = () => {
    P.seed(1200);
    const c = P.canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#5c5a58'; x.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const bx = col * 64 + (row % 2) * 32 + 2, by = row * 32 + 2;
      P.rectShape(x, bx, by, 60, 28, 6, { base: P.pick(['#9a968c', '#8e8a84', '#a8a296', '#878a8e']), lw: 2, outline: '#3a3836', dab: 5, dabs: 30 });
    }
    for (let i = 0; i < 70; i++) dot(x, P.r(0, 256), P.r(0, 256), P.r(2, 6), '#5a8a3e', 0.45);
    return c;
  };
  P.wall = (door) => {
    P.seed(1300 + (door ? 1 : 0));
    const c = P.canvas(320, 208), x = c.getContext('2d');
    P.rectShape(x, 0, 0, 320, 208, 0, { base: '#e8dbbd', lw: 0, dab: 10 });
    x.fillStyle = '#5a3a22';
    const beam = (a, b, w, h) => P.rectShape(x, a, b, w, h, 2, { base: '#5e3c22', lw: 2, dabs: 12 });
    beam(0, 0, 320, 14); beam(0, 194, 320, 14); beam(0, 0, 14, 208); beam(306, 0, 14, 208); beam(0, 100, 320, 10);
    const win = (wx, wy) => {
      P.rectShape(x, wx, wy, 54, 48, 4, { base: '#3a4a66', lw: 4, dabs: 20 });
      glow(x, wx + 27, wy + 24, 28, '#ffd27a', 0.55);
      x.strokeStyle = '#5e3c22'; x.lineWidth = 5; x.beginPath(); x.moveTo(wx + 27, wy); x.lineTo(wx + 27, wy + 48); x.moveTo(wx, wy + 24); x.lineTo(wx + 54, wy + 24); x.stroke();
      P.rectShape(x, wx - 6, wy + 48, 66, 10, 2, { base: '#7a5232', lw: 2, dabs: 6 });
      for (let i = 0; i < 6; i++) dot(x, wx + P.r(0, 54), wy + 52, 4, P.pick(['#e8433a', '#f4d03a', '#f08ab0']));
    };
    if (door) {
      P.paint(x, (cx) => { cx.moveTo(128, 208); cx.lineTo(128, 140); cx.arc(160, 140, 32, Math.PI, 0); cx.lineTo(192, 208); cx.closePath(); }, { base: '#7a4a2a', box: [128, 108, 64, 100], lw: 4 });
      dot(x, 182, 168, 4, '#f0c850');
      win(36, 120); win(232, 120); win(60, 26); win(206, 26);
    } else {
      win(70, 26); win(196, 26); win(133, 122);
    }
    beam(0, 0, 14, 208);
    return c;
  };
  P.roof = (blue) => {
    P.seed(1400);
    const base = blue ? '#3f6090' : '#a8462e';
    const c = P.canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = P.shade(base, -0.4); x.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 10; row++) for (let col = -1; col < 9; col++) {
      const bx = col * 32 + (row % 2) * 16, by = row * 26;
      P.paint(x, (cx) => { cx.moveTo(bx, by); cx.lineTo(bx + 30, by); cx.lineTo(bx + 30, by + 26); cx.quadraticCurveTo(bx + 15, by + 34, bx, by + 26); cx.closePath(); },
        { base: P.shade(base, P.r(-0.15, 0.12)).replace(/rgb\((\d+),(\d+),(\d+)\)/, (m, r, g, b) => '#' + [r, g, b].map((v) => (+v).toString(16).padStart(2, '0')).join('')), box: [bx, by, 30, 34], lw: 2, outline: '#2a1410', dabs: 14, dab: 4 });
    }
    return c;
  };
  P.fence = () => {
    P.seed(1500);
    const c = P.canvas(256, 96), x = c.getContext('2d');
    P.rectShape(x, 0, 28, 256, 12, 3, { base: '#9a6e42', lw: 3, dabs: 30 });
    P.rectShape(x, 0, 58, 256, 12, 3, { base: '#8a6038', lw: 3, dabs: 30 });
    [6, 122, 238].forEach((px) => P.polyShape(x, [[px, 94], [px, 14], [px + 6, 6], [px + 12, 14], [px + 12, 94]], { base: '#7a5232', lw: 3 }));
    return c;
  };

  // ---------- backdrop layers ----------
  P.sky = (stops) => {
    const c = P.canvas(32, 512), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    (stops || [[0, '#3f78c4'], [0.35, '#86b6e2'], [0.49, '#f4dcbc'], [0.52, '#bfd4d8'], [1, '#bfd4d8']]).forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(0, 0, 32, 512);
    return c;
  };
  P.clouds = (tint = [255, 252, 245], dark = [225, 225, 235]) => {
    P.seed(1600);
    const W = 2048, H = 256, c = P.canvas(W, H), x = c.getContext('2d');
    // flat-bottomed cumulus: puffs stacked above a baseline, bottom cut with a soft fade
    for (let k = 0; k < 16; k++) {
      const cw = P.r(160, 360), ch = 140, tc = P.canvas(cw + 80, ch), t = tc.getContext('2d');
      const base = ch - 24;
      for (let i = 0; i < 26; i++) {
        const u = P.r(0.1, 0.9), px = 40 + u * cw, hump = Math.sin(u * Math.PI);
        const r = P.r(14, 26) + hump * P.r(10, 26), py = base - hump * P.r(10, 40) - r * 0.2;
        const g = t.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
        g.addColorStop(0, `rgba(${tint},.95)`); g.addColorStop(0.75, `rgba(${tint.map((v) => v * 0.95 | 0)},.8)`); g.addColorStop(1, `rgba(${dark},0)`);
        t.fillStyle = g; t.beginPath(); t.arc(px, py, r, 0, Math.PI * 2); t.fill();
      }
      t.globalCompositeOperation = 'destination-out';
      const fade = t.createLinearGradient(0, base - 10, 0, base + 6);
      fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      t.fillStyle = fade; t.fillRect(0, base - 10, tc.width, ch);
      const cx = P.r(0, W), cy = P.r(60, 130);
      x.globalAlpha = P.r(0.7, 0.95);
      for (const ox of [-W, 0, W]) x.drawImage(tc, cx + ox, cy);
    }
    return c;
  };
  // tileable panorama ridge: sum of integer-frequency sines
  function ridge(W, freqs, amp, base, seedv) {
    P.seed(seedv);
    const comps = freqs.map((f) => [f, P.r(0, Math.PI * 2), (amp / Math.pow(f, 0.95)) * P.r(0.7, 1.2)]);
    // 1-|sin| gives sharp peaks / rounded valleys like real ranges
    return (px) => base - comps.reduce((s, [f, ph, a]) => s + (1 - Math.abs(Math.sin((px / W) * Math.PI * f + ph))) * a, 0) + amp * 0.6;
  }
  const PANOS = {
    far: { col: '#8a9cc0', haze: '#bccfdc', freqs: [3, 5, 9, 14, 23], amp: 320, base: 190, snow: true },
    mid: { col: '#5f8c88', haze: '#b4cccc', freqs: [2, 4, 7, 11], amp: 130, base: 300 },
    near: { col: '#36604a', haze: '#bfd4d8', freqs: [3, 6, 9], amp: 30, base: 330, trees: true },
    // guild at dusk
    duskFar: { col: '#6a5a8a', haze: '#d8a088', freqs: [3, 5, 9, 14, 23], amp: 300, base: 200, snow: true, snowCol: '#f4d8c8' },
    duskMid: { col: '#4a4a6a', haze: '#c89080', freqs: [2, 4, 7, 11], amp: 120, base: 300 },
    duskNear: { col: '#2a3040', haze: '#a87868', freqs: [3, 6, 9], amp: 30, base: 330, trees: true },
    // ashen ravine: volcanic ranges with glowing seams
    ashFar: { col: '#4a3a3a', haze: '#8a6a5a', freqs: [2, 3, 7, 13], amp: 340, base: 190, lava: true },
    ashMid: { col: '#3a302e', haze: '#7a5e52', freqs: [3, 5, 8, 12], amp: 160, base: 290, lava: true },
    ashNear: { col: '#2a2422', haze: '#6e544a', freqs: [4, 7, 11], amp: 50, base: 330, deadTrees: true },
    // sunken causeway (second field): pale mist, cold cliffs
    mistFar: { col: '#7a8a9a', haze: '#c8d4dc', freqs: [2, 5, 9, 15], amp: 300, base: 200 },
    mistMid: { col: '#56687a', haze: '#b0c0cc', freqs: [3, 4, 7], amp: 140, base: 300 },
    mistNear: { col: '#334450', haze: '#a8b8c4', freqs: [3, 6, 9], amp: 40, base: 330, trees: true },
  };
  P.panorama = (layer) => {
    const W = 2048, H = 512, c = P.canvas(W, H), x = c.getContext('2d');
    const cfg = PANOS[layer];
    const h = ridge(W, cfg.freqs, cfg.amp, cfg.base, layer.length * 77);
    x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 4) x.lineTo(px, h(px));
    x.lineTo(W, H); x.closePath();
    const g = x.createLinearGradient(0, 120, 0, H);
    g.addColorStop(0, cfg.col); g.addColorStop(0.55, P.rgba(cfg.haze, 1)); g.addColorStop(1, cfg.haze);
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    P.seed(layer.length * 13);
    for (let i = 0; i < 1400; i++) {
      const px = P.r(0, W), py = h(px) + P.r(0, 160);
      x.fillStyle = P.shade(cfg.col, P.r(-0.25, 0.25)); x.globalAlpha = P.r(0.08, 0.22) * (1 - (py - 100) / H);
      x.beginPath(); x.ellipse(px, py, P.r(6, 22), P.r(3, 8), P.r(-0.6, 0.6), 0, 7); x.fill();
    }
    if (cfg.snow) {
      // snow cap: region between the ridge and a ragged snowline
      const line = (px) => cfg.base + 75 + Math.sin(px * 0.09) * 6 + Math.sin(px * 0.023 + 1) * 10;
      x.globalAlpha = 0.9; x.fillStyle = cfg.snowCol || '#f2f4fa';
      x.beginPath(); x.moveTo(0, h(0));
      for (let px = 0; px <= W; px += 3) x.lineTo(px, h(px));
      for (let px = W; px >= 0; px -= 3) x.lineTo(px, Math.max(h(px), line(px)));
      x.closePath(); x.fill();
      x.globalAlpha = 0.25; x.fillStyle = '#a8b4cc';
      for (let px = 0; px < W; px += 9) { const y = h(px); if (y < line(px) - 8) { x.beginPath(); x.moveTo(px, y + 4); x.lineTo(px + 7, line(px) - 2); x.lineTo(px - 2, line(px) - 2); x.fill(); } }
    }
    if (cfg.lava) {
      P.seed(layer.length * 31);
      for (let i = 0; i < 26; i++) {
        let px = P.r(0, W), py = h(px) + P.r(4, 30);
        x.save(); x.shadowColor = '#ff6a1a'; x.shadowBlur = 16; x.strokeStyle = 'rgba(255,120,40,.85)'; x.lineWidth = P.r(1.5, 3.5);
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 8; k++) { px += P.r(-10, 10); py += P.r(8, 22); x.lineTo(px, py); }
        x.stroke(); x.restore();
      }
      const g2 = x.createLinearGradient(0, H * 0.6, 0, H);
      g2.addColorStop(0, 'rgba(255,110,40,0)'); g2.addColorStop(1, 'rgba(255,110,40,.22)');
      x.fillStyle = g2; x.fillRect(0, 0, W, H);
    }
    x.restore();
    if (cfg.deadTrees) {
      P.seed(4343);
      for (let px = 0; px < W; px += P.r(14, 34)) {
        const y = h(px) + 4, th = P.r(30, 70);
        for (const ox of [-W, 0, W]) {
          x.strokeStyle = P.shade(cfg.col, P.r(-0.3, 0)); x.lineWidth = 3; x.globalAlpha = 1;
          x.beginPath(); x.moveTo(px + ox, y); x.lineTo(px + ox + P.r(-4, 4), y - th);
          x.moveTo(px + ox, y - th * 0.6); x.lineTo(px + ox + P.r(8, 16), y - th * 0.85);
          x.moveTo(px + ox, y - th * 0.45); x.lineTo(px + ox - P.r(8, 14), y - th * 0.7); x.stroke();
        }
      }
    }
    if (cfg.trees) {
      P.seed(4242);
      for (let px = 0; px < W; px += P.r(6, 14)) {
        const y = h(px) + 6, th = P.r(26, 60), tw = th * 0.35;
        for (const ox of [-W, 0, W]) {
          x.fillStyle = P.shade(cfg.col, P.r(-0.2, 0.1)); x.globalAlpha = 1;
          x.beginPath(); x.moveTo(px + ox, y - th); x.lineTo(px + ox + tw, y + 4); x.lineTo(px + ox - tw, y + 4); x.closePath(); x.fill();
        }
      }
    }
    return c;
  };
})();
