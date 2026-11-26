// Character art: directional hunter sprite sheets, weapons, guild NPCs.
// Sheet layout: rows = views (0 front, 1 side-right, 2 back), cols = poses.
(function () {
  'use strict';
  const P = window.Paint;
  const A = (window.Art = window.Art || {});
  const FW = 128, FH = 192;
  const POSES = ['idle', 'walk1', 'walk2', 'walk3', 'walk4', 'raise', 'strike', 'dodge', 'hurt'];
  const VIEWS = ['front', 'side', 'back'];
  A.HERO = { FW, FH, POSES, VIEWS, PX_PER_UNIT: FH / 2.2 };

  const OUT = '#2a1c14';
  function limb(x, x1, y1, x2, y2, w, col) {
    x.save(); x.lineCap = 'round';
    x.strokeStyle = OUT; x.lineWidth = w + 5; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    x.strokeStyle = P.shade(col, 0.3); x.lineWidth = w * 0.3; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(x1 - w * 0.2, y1); x.lineTo(x2 - w * 0.2, y2); x.stroke();
    x.restore();
  }
  function hand(x, hx, hy, col) { P.ellShape(x, hx, hy, 6.5, 6.5, { base: col, lw: 3, dabs: 6 }); }
  function eye(x, ex, ey) { x.fillStyle = '#21140e'; x.beginPath(); x.ellipse(ex, ey, 2.6, 4, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(ex + 0.8, ey - 1.4, 1.1, 0, 7); x.fill(); }

  // armour palettes (the sheet is repainted per equipped set)
  A.HERO_PALETTES = {
    leather: { skin: '#f0c6a0', hair: '#5a3424', cloth: '#6b4a32', leather: '#8a5c38', metal: '#a8b0b8', cape: '#2f5a5e', accent: '#c8a050', boot: '#4a3020', pants: '#4a4048' },
    gravemaw: { skin: '#f0c6a0', hair: '#5a3424', cloth: '#3a3434', leather: '#4a4040', metal: '#2e2a2c', cape: '#7a2a1e', accent: '#ff9a3a', boot: '#2a2224', pants: '#2e2a30', ember: true },
    cragjaw: { skin: '#f0c6a0', hair: '#5a3424', cloth: '#4e4c3a', leather: '#6a5c40', metal: '#7a7c70', cape: '#5a6a3e', accent: '#ffc04a', boot: '#3a3226', pants: '#3e3c30' },
  };

  function drawLegs(x, view, pose, pal, cx) {
    const w = pose === 'walk1' ? 1 : pose === 'walk3' ? -1 : 0;
    if (view === 'side') {
      P.rectShape(x, 58 - w * 9, 128, 14, 46, 5, { base: P.shade(pal.pants, -0.2) });
      P.rectShape(x, 54 - w * 9, 166, 24, 18, 7, { base: P.shade(pal.boot, -0.15) });
      P.rectShape(x, 64 + w * 9, 128, 15, 46, 5, { base: pal.pants });
      P.rectShape(x, 62 + w * 9, 166, 26, 18, 7, { base: pal.boot });
    } else {
      const lift = (k) => (w === k ? 10 : 0);
      P.rectShape(x, cx - 17, 128, 15, 46 - lift(1), 5, { base: pal.pants });
      P.rectShape(x, cx - 20, 166 - lift(1), 20, 19, 7, { base: pal.boot });
      P.rectShape(x, cx + 2, 128, 15, 46 - lift(-1), 5, { base: pal.pants });
      P.rectShape(x, cx, 166 - lift(-1), 20, 19, 7, { base: pal.boot });
    }
  }
  function torso(x, view, pal, cx) {
    if (view === 'side') {
      P.shape(x, [[50, 72], [80, 72], [88, 104], [90, 140], [44, 140], [46, 104]], { base: pal.leather });
      P.rectShape(x, 44, 116, 48, 10, 3, { base: pal.cloth, lw: 3, dabs: 18 });
      P.rectShape(x, 72, 114, 9, 14, 2, { base: pal.accent, lw: 2.5, dabs: 4 });
      P.ellShape(x, 66, 80, 16, 12, { base: pal.metal, hi: 0.6 });
    } else {
      P.shape(x, [[cx - 22, 72], [cx + 22, 72], [cx + 27, 106], [cx + 28, 142], [cx - 28, 142], [cx - 27, 106]], { base: pal.leather });
      if (view === 'front') {
        P.polyShape(x, [[cx - 8, 86], [cx + 8, 86], [cx + 10, 140], [cx - 10, 140]], { base: pal.cloth, lw: 3 });
        P.rectShape(x, cx - 28, 116, 56, 10, 3, { base: pal.cloth, lw: 3, dabs: 18 });
        P.rectShape(x, cx - 6, 114, 12, 14, 2, { base: pal.accent, lw: 2.5, dabs: 4 });
      }
      P.ellShape(x, cx - 24, 80, 13, 11, { base: pal.metal, hi: 0.6 });
      P.ellShape(x, cx + 24, 80, 13, 11, { base: pal.metal, hi: 0.6 });
    }
    if (pal.ember) { x.save(); x.strokeStyle = 'rgba(255,150,60,.85)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 10, 96); x.lineTo(cx - 2, 110); x.lineTo(cx + 8, 100); x.stroke(); x.restore(); }
  }
  function head(x, view, pal, cx) {
    if (view === 'side') {
      P.rectShape(x, 56, 62, 22, 16, 6, { base: pal.cape, lw: 3 });
      P.ellShape(x, 68, 46, 21, 22, { base: pal.skin });
      P.shape(x, [[46, 52], [44, 28], [58, 18], [80, 20], [90, 32], [84, 36], [70, 32], [62, 40], [56, 60], [48, 62]], { base: pal.hair });
      eye(x, 80, 48);
      x.fillStyle = 'rgba(220,110,90,.35)'; x.beginPath(); x.ellipse(80, 58, 5, 3, 0, 0, 7); x.fill();
    } else {
      P.rectShape(x, cx - 14, 62, 28, 16, 6, { base: pal.cape, lw: 3 });
      P.ellShape(x, cx, 46, 22, 23, { base: pal.skin });
      if (view === 'front') {
        P.shape(x, [[cx - 24, 50], [cx - 22, 26], [cx - 6, 16], [cx + 12, 18], [cx + 24, 30], [cx + 23, 48], [cx + 14, 34], [cx + 2, 30], [cx - 12, 34]], { base: pal.hair });
        eye(x, cx - 9, 50); eye(x, cx + 9, 50);
        x.fillStyle = 'rgba(220,110,90,.3)'; x.beginPath(); x.ellipse(cx - 13, 59, 4, 2.6, 0, 0, 7); x.ellipse(cx + 13, 59, 4, 2.6, 0, 0, 7); x.fill();
        x.strokeStyle = OUT; x.lineWidth = 2; x.beginPath(); x.arc(cx, 60, 4, 0.3, Math.PI - 0.3); x.stroke();
      } else {
        P.shape(x, [[cx - 24, 54], [cx - 22, 26], [cx - 6, 16], [cx + 12, 18], [cx + 24, 30], [cx + 24, 56], [cx + 10, 66], [cx - 10, 66]], { base: pal.hair });
      }
    }
  }
  // returns {main:[x,y], off:[x,y]}
  function arms(x, view, pose, pal, cx, layer) {
    const sleeve = pal.leather, skin = pal.skin;
    const swing = pose === 'walk1' ? 1 : pose === 'walk3' ? -1 : 0;
    if (view === 'side') {
      const back = { idle: [58, 120], walk1: [48, 116], walk2: [56, 120], walk3: [66, 118], walk4: [56, 120], raise: [62, 42], strike: [92, 110], dodge: [70, 146], hurt: [48, 104] }[pose];
      const main = { idle: [78, 122], walk1: [86, 118], walk2: [78, 122], walk3: [68, 120], walk4: [78, 122], raise: [60, 36], strike: [108, 100], dodge: [86, 142], hurt: [60, 100] }[pose];
      if (layer === 'back') { limb(x, 62, 84, back[0], back[1], 11, P.shade(sleeve, -0.2)); hand(x, back[0], back[1], P.shade(skin, -0.1)); }
      else { limb(x, 70, 84, main[0], main[1], 12, sleeve); hand(x, main[0], main[1], skin); }
      return { main, off: back };
    }
    // front/back: main hand is the hunter's right hand → screen-left from the front, screen-right from behind
    const s = view === 'front' ? -1 : 1;
    const M = { idle: [36, 124], walk1: [34, 120 - 6], walk2: [36, 124], walk3: [40, 128], walk4: [36, 124], raise: [44, 34], strike: [54, 100], dodge: [44, 146], hurt: [26, 100] }[pose];
    const O = { idle: [36, 124], walk1: [40, 128], walk2: [36, 124], walk3: [34, 114], walk4: [36, 124], raise: [40, 46], strike: [42, 112], dodge: [44, 146], hurt: [26, 104] }[pose];
    const main = [cx + s * (cx - M[0]), M[1]], off = [cx - s * (cx - O[0]), O[1]];
    if (layer === 'front') {
      limb(x, cx + s * 24, 84, main[0], main[1], 12, sleeve); hand(x, main[0], main[1], skin);
      limb(x, cx - s * 24, 84, off[0], off[1], 12, sleeve); hand(x, off[0], off[1], skin);
    }
    void swing;
    return { main, off };
  }

  function heroFrame(x, view, pose, pal) {
    const cx = 64;
    if (pose === 'dodge') {
      // curled roll: cloak ball + tucked head
      P.ellShape(x, 64, 146, 40, 36, { base: pal.cape });
      P.ellShape(x, 64, 150, 28, 24, { base: pal.leather });
      P.ellShape(x, view === 'side' ? 82 : 64, 120, 17, 17, { base: view === 'back' ? pal.hair : pal.skin });
      if (view !== 'back') P.shape(x, [[view === 'side' ? 66 : 48, 120], [view === 'side' ? 70 : 50, 104], [view === 'side' ? 90 : 78, 102], [view === 'side' ? 96 : 80, 114]], { base: pal.hair, lw: 3 });
      P.rectShape(x, 40, 170, 48, 15, 7, { base: pal.boot });
      return { main: view === 'back' ? [86, 142] : view === 'front' ? [42, 142] : [86, 142], off: [64, 150] };
    }
    if (pose === 'hurt') { x.translate(64, 186); x.rotate(view === 'side' ? -0.2 : 0.12); x.translate(-64, -186); }
    // cape behind (front/side); back view draws it on top later
    if (view === 'side') P.shape(x, [[54, 70], [72, 76], [66, 118], [56, 160], [30 - (pose.startsWith('walk') ? 6 : 0), 168], [24, 140], [38, 100]], { base: pal.cape });
    if (view === 'front') P.polyShape(x, [[cx - 26, 74], [cx + 26, 74], [cx + 36, 164], [cx - 36, 164]], { base: P.shade(pal.cape, -0.25) });
    let hands = arms(x, view, pose, pal, cx, 'back');
    drawLegs(x, view, pose, pal, cx);
    torso(x, view, pal, cx);
    if (view === 'back') {
      P.polyShape(x, [[cx - 25, 72], [cx + 25, 72], [cx + 34, 166], [cx + 12, 160], [cx, 168], [cx - 12, 160], [cx - 34, 166]], { base: pal.cape });
      if (pal.ember) { x.save(); x.strokeStyle = 'rgba(255,150,60,.7)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(cx - 10, 100); x.lineTo(cx, 120); x.lineTo(cx + 10, 100); x.stroke(); x.restore(); }
    }
    head(x, view, pal, cx);
    hands = arms(x, view, pose, pal, cx, 'front');
    if (pose === 'hurt') hands = { main: [hands.main[0] + 10, hands.main[1] - 6], off: hands.off };
    return hands;
  }

  // full sheet for a palette: canvas + hand table
  A.heroSheet = (palName = 'leather') => {
    const pal = A.HERO_PALETTES[palName];
    const c = P.canvas(FW * POSES.length, FH * VIEWS.length), x = c.getContext('2d');
    const hands = {};
    VIEWS.forEach((v, r) => {
      hands[v] = {};
      POSES.forEach((p, k) => {
        P.seed(1000 + r * 31 + k * 7);
        x.save(); x.translate(k * FW, r * FH);
        x.beginPath(); x.rect(0, 0, FW, FH); x.clip();
        hands[v][p] = heroFrame(x, v, p, pal);
        x.restore();
      });
    });
    return { canvas: c, hands };
  };

  // ---------------------------------------------------------------- weapons (drawn pointing up, grip given in px)
  A.weapon = (kind, tier = 0) => {
    const ember = tier >= 1;
    P.seed(77 + (kind.length * 3) + tier);
    if (kind === 'greatsword') {
      const c = P.canvas(84, 300), x = c.getContext('2d');
      const blade = ember ? '#3a3236' : '#c8d2dc';
      P.polyShape(x, [[20, 226], [16, 40], [42, 6], [68, 40], [64, 226]], { base: blade, outline: '#161a22', hi: 0.7, dab: 5 });
      x.strokeStyle = ember ? 'rgba(255,140,50,.95)' : 'rgba(255,255,255,.75)'; x.lineWidth = ember ? 3 : 2;
      x.beginPath(); x.moveTo(42, 16); x.lineTo(42, 218); x.stroke();
      if (ember) { x.strokeStyle = 'rgba(255,120,40,.9)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(17, 60); x.lineTo(22, 210); x.moveTo(67, 60); x.lineTo(62, 210); x.stroke(); }
      P.polyShape(x, ember ? [[2, 222], [24, 214], [42, 226], [60, 214], [82, 222], [70, 240], [14, 240]] : [[4, 224], [80, 224], [76, 240], [8, 240]], { base: ember ? '#d8ccb0' : '#b0893c', lw: 3 });
      P.rectShape(x, 33, 238, 18, 46, 4, { base: '#5a3420', lw: 3, dabs: 12 });
      for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(30,15,8,.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(33, 244 + i * 8); x.lineTo(51, 248 + i * 8); x.stroke(); }
      P.ellShape(x, 42, 290, 10, 8, { base: ember ? '#ff8a3a' : '#b0893c', lw: 3 });
      return { canvas: c, grip: [42, 262] };
    }
    if (kind === 'spear') {
      const c = P.canvas(48, 380), x = c.getContext('2d');
      P.rectShape(x, 19, 64, 10, 312, 4, { base: ember ? '#3a2a26' : '#8a6038', lw: 3, dabs: 40 });
      for (let i = 0; i < 4; i++) P.rectShape(x, 16, 220 + i * 12, 16, 7, 2, { base: '#4a2e1c', lw: 2, dabs: 4 });
      if (ember) {
        P.polyShape(x, [[24, 2], [36, 30], [34, 70], [24, 80], [14, 70], [12, 30]], { base: '#e0d2b4', outline: '#2a1c10', hi: 0.6 });
        x.strokeStyle = 'rgba(255,130,40,.95)'; x.lineWidth = 3; x.beginPath(); x.moveTo(24, 10); x.lineTo(24, 72); x.stroke();
      } else {
        P.polyShape(x, [[24, 2], [38, 40], [30, 72], [18, 72], [10, 40]], { base: '#c8d2dc', outline: '#161a22', hi: 0.7 });
        x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(24, 10); x.lineTo(24, 66); x.stroke();
      }
      P.rectShape(x, 12, 72, 24, 9, 3, { base: ember ? '#ff8a3a' : '#b0893c', lw: 2.5, dabs: 4 });
      return { canvas: c, grip: [24, 250] };
    }
    // dual blade
    const c = P.canvas(40, 116), x = c.getContext('2d');
    P.polyShape(x, ember ? [[14, 84], [8, 30], [22, 2], [30, 28], [28, 84]] : [[13, 84], [12, 16], [20, 2], [28, 16], [27, 84]], { base: ember ? '#3a3236' : '#d0dae4', outline: '#161a22', hi: 0.7, dab: 3 });
    x.strokeStyle = ember ? 'rgba(255,140,50,.95)' : 'rgba(255,255,255,.8)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(20, 10); x.lineTo(20, 80); x.stroke();
    P.rectShape(x, 4, 82, 32, 8, 3, { base: ember ? '#ff8a3a' : '#b0893c', lw: 2.5, dabs: 4 });
    P.rectShape(x, 15, 89, 10, 22, 3, { base: '#4a2a18', lw: 2.5, dabs: 6 });
    return { canvas: c, grip: [20, 100] };
  };
  A.weaponIcon = (kind, tier = 0, size = 96) => {
    const w = A.weapon(kind, tier), c = P.canvas(size, size), x = c.getContext('2d');
    const s = (size * 1.25) / Math.max(w.canvas.width, w.canvas.height);
    x.translate(size / 2, size / 2); x.rotate(Math.PI / 4);
    if (kind === 'dual') {
      const s2 = s * 2.2;
      [-1, 1].forEach((k) => { x.save(); x.rotate(k * 0.45); x.drawImage(w.canvas, (-w.canvas.width * s2) / 2, (-w.canvas.height * s2) / 2, w.canvas.width * s2, w.canvas.height * s2); x.restore(); });
    } else x.drawImage(w.canvas, (-w.canvas.width * s) / 2, (-w.canvas.height * s) / 2, w.canvas.width * s, w.canvas.height * s);
    return c;
  };

  // ---------------------------------------------------------------- guild NPCs (single painted billboards, 2 idle frames)
  A.npc = (who, frame = 0) => {
    P.seed(500 + who.length * 13);
    const c = P.canvas(140, 200), x = c.getContext('2d');
    const b = frame ? 2 : 0;
    if (who === 'master') {
      P.polyShape(x, [[34, 70 + b], [106, 70 + b], [118, 196], [22, 196]], { base: '#3a2e4a' });
      P.polyShape(x, [[60, 72 + b], [80, 72 + b], [86, 196], [54, 196]], { base: '#b8903c', lw: 3 });
      P.ellShape(x, 70, 46 + b, 22, 24, { base: '#e2b896' });
      P.shape(x, [[46, 52 + b], [48, 22 + b], [70, 12 + b], [92, 22 + b], [94, 52 + b], [86, 36 + b], [70, 30 + b], [54, 36 + b]], { base: '#d8d4cc' });
      P.rectShape(x, 54, 44 + b, 14, 9, 3, { base: '#201818', lw: 2, dabs: 2 });
      x.strokeStyle = '#201818'; x.lineWidth = 2; x.beginPath(); x.moveTo(48, 42 + b); x.lineTo(92, 38 + b); x.stroke();
      x.fillStyle = '#21140e'; x.beginPath(); x.ellipse(80, 48 + b, 2.6, 3.6, 0, 0, 7); x.fill();
      P.shape(x, [[56, 60 + b], [84, 60 + b], [80, 80 + b], [60, 80 + b]], { base: '#d8d4cc', lw: 3 });
      P.rectShape(x, 104, 30, 8, 166, 3, { base: '#6a4a2a', lw: 3 });
      P.ellShape(x, 108, 26, 10, 12, { base: '#ff9a3a', outline: '#4a1a0a', hi: 0.7 });
    } else if (who === 'smith') {
      P.polyShape(x, [[30, 70 + b], [110, 70 + b], [116, 150], [24, 150]], { base: '#8a5034' });
      P.polyShape(x, [[44, 86 + b], [96, 86 + b], [100, 172], [40, 172]], { base: '#4a3a30', lw: 3 });
      P.rectShape(x, 36, 148, 28, 48, 6, { base: '#3a2e2a' }); P.rectShape(x, 76, 148, 28, 48, 6, { base: '#3a2e2a' });
      P.ellShape(x, 70, 48 + b, 26, 24, { base: '#d8a07a' });
      P.shape(x, [[46, 52 + b], [94, 52 + b], [92, 86 + b], [70, 98 + b], [48, 86 + b]], { base: '#a8442a' });
      x.fillStyle = '#21140e'; [60, 80].forEach((ex) => { x.beginPath(); x.ellipse(ex, 46 + b, 2.8, 3.6, 0, 0, 7); x.fill(); });
      P.ellShape(x, 70, 30 + b, 24, 10, { base: '#5a5a62', lw: 3 });
      P.rectShape(x, 104, 70 + b, 10, 60, 3, { base: '#6a4a2a', lw: 3 });
      P.rectShape(x, 92, 56 + b, 34, 20, 4, { base: '#7a8088', lw: 3 });
    } else {
      P.polyShape(x, [[38, 70 + b], [102, 70 + b], [110, 196], [30, 196]], { base: '#2e5a4a' });
      P.polyShape(x, [[48, 92 + b], [92, 92 + b], [96, 180], [44, 180]], { base: '#8a6a48', lw: 3 });
      P.ellShape(x, 70, 46 + b, 21, 23, { base: '#efc8a4' });
      P.shape(x, [[46, 64 + b], [46, 26 + b], [70, 16 + b], [94, 26 + b], [96, 70 + b], [88, 44 + b], [52, 44 + b]], { base: '#c86a2a' });
      x.fillStyle = '#21140e'; [62, 78].forEach((ex) => { x.beginPath(); x.ellipse(ex, 50 + b, 2.6, 3.6, 0, 0, 7); x.fill(); });
      x.strokeStyle = '#e8d070'; x.lineWidth = 3; x.beginPath(); x.moveTo(40, 96 + b); x.quadraticCurveTo(70, 120 + b, 100, 96 + b); x.stroke();
    }
    return c;
  };
})();
