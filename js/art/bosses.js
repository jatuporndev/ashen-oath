// Boss art — every boss is a layered 2D puppet: painted body parts per view
// (side / front / back) with intact + broken variants, animated by pivots.
(function () {
  'use strict';
  const P = window.Paint;
  const A = (window.Art = window.Art || {});
  const PXU = 40; // pixels per world unit for boss art
  A.BOSS_PXU = PXU;
  const HIDE = '#5c544e', HIDE_D = '#3e3834', PLATE = '#2c2828', BONE = '#ddd0b2', EMBER = '#ff8a2a';

  function crack(x, pts, w = 3, col = EMBER) {
    x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
    x.shadowColor = col; x.shadowBlur = 14; x.strokeStyle = col; x.lineWidth = w;
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.stroke();
    x.shadowBlur = 0; x.strokeStyle = '#fff2c0'; x.lineWidth = w * 0.35; x.stroke();
    x.restore();
  }
  function jag(x0, y0, x1, y1, n, amp) { const a = []; for (let i = 0; i <= n; i++) { const t = i / n; a.push([x0 + (x1 - x0) * t + P.r(-amp, amp), y0 + (y1 - y0) * t + P.r(-amp, amp)]); } return a; }
  function glowDot(x, cx, cy, r, col = EMBER, a = 0.9) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,250,220,' + a + ')'); g.addColorStop(0.3, P.rgba(col, a)); g.addColorStop(1, P.rgba(col, 0));
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  function wrinkles(x, box, n, col = 'rgba(20,14,10,.35)') {
    x.save(); x.strokeStyle = col; x.lineWidth = 2.5; x.lineCap = 'round';
    for (let i = 0; i < n; i++) { const px = box[0] + P.rand() * box[2], py = box[1] + P.rand() * box[3]; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + P.r(-14, 14), py + P.r(4, 12), px + P.r(-10, 10), py + P.r(14, 26)); x.stroke(); }
    x.restore();
  }
  const part = (w, h, pivot, draw) => { const c = P.canvas(w, h), x = c.getContext('2d'); draw(x); return { canvas: c, pivot, w: w / PXU, h: h / PXU }; };

  // ------------------------------------------------------------ GRAVEMAW — side view (faces +x)
  function gmTorsoSide() {
    P.seed(9001);
    return part(880, 480, [440, 260], (x) => {
      const body = [[60, 250], [110, 140], [260, 92], [470, 56], [640, 50], [760, 96], [840, 190], [860, 300], [800, 380], [640, 420], [420, 436], [220, 410], [100, 372]];
      P.shape(x, body, { base: HIDE, dab: 18, dabs: 520 });
      P.shape(x, [[200, 360], [420, 400], [640, 384], [760, 330], [700, 420], [420, 436], [220, 410]], { base: '#7a6e64', lw: 0, dab: 14 });
      wrinkles(x, [140, 160, 640, 220], 46);
      crack(x, jag(180, 300, 380, 240, 6, 10), 4); crack(x, jag(520, 330, 700, 250, 6, 10), 3.5); crack(x, jag(300, 380, 460, 330, 5, 8), 3);
      for (let i = 0; i < 26; i++) P.ellShape(x, P.r(160, 760), P.r(110, 220), P.r(8, 18), P.r(5, 10), { base: '#4a4440', lw: 2, dabs: 4 });
    });
  }
  function gmPlatesSide(broken) {
    P.seed(9002 + (broken ? 1 : 0));
    return part(760, 260, [380, 230], (x) => {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const cx = 70 + i * 100, hgt = broken ? P.r(30, 60) : 110 + Math.sin((i / (n - 1)) * Math.PI) * 90;
        if (broken && i % 2 === 1) continue;
        const pts = [[cx - 52, 236], [cx - 34, 236 - hgt * 0.6], [cx + 6, 236 - hgt], [cx + 30, 236 - hgt * 0.5], [cx + 54, 236]];
        if (broken) pts.splice(2, 1, [cx - 10, 236 - hgt], [cx + 4, 236 - hgt * 0.7], [cx + 14, 236 - hgt * 0.95]);
        P.polyShape(x, pts, { base: PLATE, outline: '#120e0c', hi: 0.5, dab: 8 });
        crack(x, [[cx - 30, 230], [cx - 8, 236 - hgt * 0.55], [cx + 4, 236 - hgt * 0.85]], 2.5);
      }
      if (broken) for (let i = 0; i < 4; i++) glowDot(x, 140 + i * 160, 230, 60, EMBER, 0.55);
    });
  }
  function gmCore() {
    return part(240, 240, [120, 120], (x) => {
      glowDot(x, 120, 120, 120, EMBER, 0.9);
      P.ellShape(x, 120, 120, 46, 42, { base: '#ffb050', outline: '#5a1a08', hi: 0.8, lw: 4 });
      crack(x, [[90, 110], [118, 126], [150, 100]], 4, '#fff0a0');
    });
  }
  function gmHeadSide(open, scarred) {
    P.seed(9003 + (open ? 1 : 0));
    return part(460, 340, [40, 180], (x) => {
      // neck
      P.shape(x, [[0, 120], [120, 90], [210, 110], [230, 240], [120, 270], [0, 250]], { base: HIDE_D, dab: 14 });
      wrinkles(x, [20, 110, 180, 140], 14);
      if (open) {
        P.shape(x, [[200, 200], [330, 210], [440, 250], [430, 300], [330, 320], [220, 290]], { base: '#4a3e38' });
        glowDot(x, 330, 230, 90, EMBER, 0.9);
        x.fillStyle = '#fff0d0'; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(260 + i * 24, 214); x.lineTo(270 + i * 24, 240); x.lineTo(280 + i * 24, 214); x.fill(); }
      }
      // skull + upper jaw
      const skull = open
        ? [[170, 90], [270, 50], [360, 80], [450, 150], [440, 196], [330, 206], [230, 220], [180, 180]]
        : [[170, 90], [270, 50], [360, 80], [450, 170], [440, 230], [350, 250], [240, 250], [180, 200]];
      P.shape(x, skull, { base: HIDE, dab: 12 });
      P.shape(x, open ? [[240, 120], [330, 100], [420, 150], [330, 160]] : [[240, 130], [330, 110], [430, 170], [330, 175]], { base: '#6a5e56', lw: 0 });
      // brow ridge + eye
      P.shape(x, [[260, 96], [330, 84], [372, 112], [300, 118]], { base: '#2e2826', lw: 3 });
      glowDot(x, 336, 116, 34, EMBER, 1);
      P.ellShape(x, 336, 116, 12, 8, { base: '#ffc060', outline: '#3a0e04', lw: 3, hi: 0.8 });
      if (!open) { x.strokeStyle = '#1a1210'; x.lineWidth = 4; x.beginPath(); x.moveTo(250, 214); x.quadraticCurveTo(340, 226, 440, 214); x.stroke(); x.fillStyle = '#fff0d0'; [300, 360, 410].forEach((tx) => { x.beginPath(); x.moveTo(tx, 216); x.lineTo(tx + 6, 236); x.lineTo(tx + 12, 216); x.fill(); }); }
      x.fillStyle = '#1a1210'; x.beginPath(); x.ellipse(430, 170, 7, 5, 0.4, 0, 7); x.fill();
      if (scarred) { crack(x, [[230, 70], [300, 150], [380, 190]], 5); x.strokeStyle = 'rgba(30,10,5,.8)'; x.lineWidth = 3; x.beginPath(); x.moveTo(250, 90); x.lineTo(320, 160); x.stroke(); }
    });
  }
  function gmHornsSide(broken) {
    P.seed(9004 + (broken ? 1 : 0));
    return part(320, 280, [80, 250], (x) => {
      if (broken) {
        [[60, 250], [130, 240]].forEach(([bx, by], i) => {
          P.polyShape(x, [[bx - 26, by], [bx - 18, by - 50 - i * 6], [bx - 4, by - 34], [bx + 6, by - 62], [bx + 22, by]], { base: BONE, outline: '#3a2e20' });
          glowDot(x, bx, by - 46, 22, EMBER, 0.6);
        });
        return;
      }
      [[150, 250, 0.82, '#bfb296'], [80, 250, 1, BONE]].forEach(([bx, by, s, col]) => {
        x.save(); x.translate(bx, by); x.scale(s, s);
        P.shape(x, [[-30, 0], [-34, -80], [-70, -170], [-40, -230], [10, -250], [70, -236], [40, -222], [-6, -200], [0, -150], [26, -80], [30, 0]], { base: col, outline: '#3a2e20', dab: 8 });
        for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(60,44,30,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-30 + i * 2, -20 - i * 34); x.lineTo(24 - i * 4, -10 - i * 34); x.stroke(); }
        x.restore();
      });
    });
  }
  function gmForeleg(broken, far) {
    P.seed(9005 + (broken ? 1 : 0));
    return part(180, 380, [90, 30], (x) => {
      P.shape(x, [[30, 10], [150, 10], [160, 120], [130, 200], [126, 280], [140, 330], [40, 330], [52, 280], [44, 200], [20, 120]], { base: far ? HIDE_D : HIDE, dab: 12 });
      wrinkles(x, [40, 60, 100, 220], 14);
      P.shape(x, [[24, 316], [160, 316], [176, 366], [4, 366]], { base: '#3a3430', dab: 8 });
      [20, 62, 104, 146].forEach((cx) => P.polyShape(x, [[cx, 360], [cx + 12, 378], [cx + 26, 360]], { base: BONE, lw: 2.5, dabs: 3 }));
      if (broken) { crack(x, jag(60, 120, 120, 230, 5, 10), 5); crack(x, jag(110, 150, 70, 260, 4, 8), 3.5); glowDot(x, 90, 190, 50, EMBER, 0.55); }
      else crack(x, jag(70, 220, 110, 300, 4, 6), 2.5);
    });
  }
  function gmHindleg(far) {
    P.seed(9006);
    return part(200, 360, [100, 30], (x) => {
      P.shape(x, [[20, 10], [180, 10], [190, 120], [150, 180], [110, 230], [130, 320], [40, 320], [56, 230], [24, 150]], { base: far ? HIDE_D : HIDE, dab: 12 });
      wrinkles(x, [40, 40, 120, 200], 12);
      P.shape(x, [[30, 306], [150, 306], [166, 352], [16, 352]], { base: '#3a3430', dab: 8 });
      [24, 66, 108, 140].forEach((cx) => P.polyShape(x, [[cx, 346], [cx + 12, 360], [cx + 24, 346]], { base: BONE, lw: 2.5, dabs: 3 }));
    });
  }
  function gmTail1(severed) {
    P.seed(9007 + (severed ? 1 : 0));
    return part(340, 160, [320, 80], (x) => {
      if (severed) {
        P.shape(x, [[330, 30], [200, 44], [150, 60], [150, 110], [200, 124], [330, 130]], { base: HIDE });
        P.ellShape(x, 152, 85, 18, 30, { base: '#a83a1c', outline: '#3a0e04', hi: 0.6 });
        glowDot(x, 150, 85, 50, EMBER, 0.7);
        return;
      }
      P.shape(x, [[330, 26], [180, 44], [20, 62], [10, 96], [180, 120], [330, 134]], { base: HIDE, dab: 10 });
      wrinkles(x, [60, 60, 240, 50], 14);
      for (let i = 0; i < 5; i++) P.polyShape(x, [[60 + i * 52, 56 - i * 3], [78 + i * 52, 20 - i * 4], [96 + i * 52, 52 - i * 3]], { base: PLATE, lw: 3, dabs: 6 });
      crack(x, jag(40, 80, 300, 90, 6, 4), 2.5);
    });
  }
  function gmTail2() {
    P.seed(9008);
    return part(340, 200, [320, 100], (x) => {
      P.shape(x, [[330, 78], [120, 84], [80, 90], [80, 112], [120, 116], [330, 122]], { base: HIDE });
      P.shape(x, P.blobPts(80, 100, 72, 60, 0.12, 12), { base: PLATE, outline: '#120e0c', dab: 10 });
      [[20, 60], [40, 20], [90, 30], [130, 40], [30, 150], [80, 180], [130, 160], [6, 104]].forEach(([sx, sy]) => P.polyShape(x, [[80 + (sx - 80) * 0.45, 100 + (sy - 100) * 0.45], [sx, sy], [80 + (sx - 80) * 0.45 + 12, 100 + (sy - 100) * 0.45 + 8]], { base: BONE, lw: 2.5, dabs: 3 }));
      crack(x, [[40, 100], [80, 90], [120, 104]], 3.5);
    });
  }
  // ------------------------------------------------------------ front view
  function gmTorsoFront() {
    P.seed(9101);
    return part(540, 460, [270, 270], (x) => {
      P.shape(x, [[40, 300], [60, 140], [170, 60], [270, 40], [370, 60], [480, 140], [500, 300], [430, 420], [270, 450], [110, 420]], { base: HIDE, dab: 16 });
      P.shape(x, [[150, 300], [270, 260], [390, 300], [360, 420], [270, 440], [180, 420]], { base: '#7a6e64', lw: 0 });
      wrinkles(x, [100, 120, 340, 160], 30);
      crack(x, jag(150, 200, 230, 320, 5, 8), 3.5); crack(x, jag(390, 200, 320, 330, 5, 8), 3.5);
    });
  }
  function gmPlatesFront(broken) {
    P.seed(9102 + (broken ? 1 : 0));
    return part(540, 220, [270, 200], (x) => {
      [[-190, 70], [-110, 120], [-30, 150], [50, 150], [130, 120], [200, 70]].forEach(([dx, hgt], i) => {
        if (broken && i % 2) return;
        const h2 = broken ? hgt * 0.35 : hgt, cx = 270 + dx;
        P.polyShape(x, [[cx - 40, 210], [cx - 8, 210 - h2], [cx + 10, 210 - h2 * 0.8], [cx + 40, 210]], { base: PLATE, outline: '#120e0c', hi: 0.5 });
        crack(x, [[cx - 18, 204], [cx, 210 - h2 * 0.6]], 2.5);
      });
      if (broken) glowDot(x, 270, 200, 120, EMBER, 0.5);
    });
  }
  function gmHeadFront(open, scarred) {
    P.seed(9103 + (open ? 1 : 0));
    return part(380, 340, [190, 60], (x) => {
      P.shape(x, [[110, 20], [270, 20], [320, 120], [300, 230], [250, 300], [130, 300], [80, 230], [60, 120]], { base: HIDE, dab: 12 });
      P.shape(x, [[120, 70], [190, 60], [260, 70], [240, 110], [140, 110]], { base: '#2e2826', lw: 3 });
      [[140, 118], [240, 118]].forEach(([ex, ey]) => { glowDot(x, ex, ey, 30, EMBER, 1); P.ellShape(x, ex, ey, 13, 8, { base: '#ffc060', outline: '#3a0e04', lw: 3, hi: 0.8 }); });
      if (open) {
        P.shape(x, [[120, 200], [260, 200], [250, 320], [190, 336], [130, 320]], { base: '#2a1a16' });
        glowDot(x, 190, 250, 80, EMBER, 0.95);
        x.fillStyle = '#fff0d0'; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(130 + i * 22, 200); x.lineTo(140 + i * 22, 224); x.lineTo(150 + i * 22, 200); x.fill(); }
      } else {
        x.strokeStyle = '#1a1210'; x.lineWidth = 4; x.beginPath(); x.moveTo(110, 240); x.quadraticCurveTo(190, 262, 270, 240); x.stroke();
        x.fillStyle = '#1a1210'; [[170, 200], [210, 200]].forEach(([nx, ny]) => { x.beginPath(); x.ellipse(nx, ny, 8, 5, 0, 0, 7); x.fill(); });
      }
      if (scarred) crack(x, [[100, 60], [180, 150], [250, 210]], 5);
    });
  }
  function gmHornsFront(broken) {
    P.seed(9104 + (broken ? 1 : 0));
    return part(520, 260, [260, 230], (x) => {
      [-1, 1].forEach((s) => {
        x.save(); x.translate(260 + s * 70, 230); x.scale(s, 1);
        if (broken) { P.polyShape(x, [[-24, 0], [-10, -58], [6, -40], [18, -66], [28, 0]], { base: BONE, outline: '#3a2e20' }); glowDot(x, 6, -50, 24, EMBER, 0.6); }
        else {
          P.shape(x, [[-24, 0], [-10, -90], [40, -170], [120, -210], [190, -190], [150, -170], [90, -150], [40, -90], [28, 0]], { base: BONE, outline: '#3a2e20', dab: 8 });
          for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(60,44,30,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-16 + i * 22, -20 - i * 34); x.lineTo(24 + i * 26, -14 - i * 30); x.stroke(); }
        }
        x.restore();
      });
    });
  }
  // ------------------------------------------------------------ back view
  function gmTorsoBack() {
    P.seed(9201);
    return part(540, 460, [270, 270], (x) => {
      P.shape(x, [[40, 320], [70, 150], [170, 70], [270, 50], [370, 70], [470, 150], [500, 320], [420, 420], [270, 440], [120, 420]], { base: HIDE, dab: 16 });
      wrinkles(x, [100, 120, 340, 220], 34);
      crack(x, jag(120, 200, 220, 360, 6, 8), 3.5); crack(x, jag(420, 200, 330, 370, 6, 8), 3.5);
    });
  }
  function gmTailBack(severed) {
    P.seed(9202 + (severed ? 1 : 0));
    return part(240, 440, [120, 30], (x) => {
      if (severed) { P.shape(x, [[60, 10], [180, 10], [170, 120], [70, 120]], { base: HIDE }); P.ellShape(x, 120, 124, 50, 20, { base: '#a83a1c', outline: '#3a0e04' }); glowDot(x, 120, 124, 60, EMBER, 0.7); return; }
      P.shape(x, [[60, 10], [180, 10], [170, 160], [150, 280], [90, 280], [70, 160]], { base: HIDE, dab: 10 });
      for (let i = 0; i < 4; i++) P.polyShape(x, [[100, 40 + i * 60], [120, 20 + i * 60], [140, 40 + i * 60], [120, 60 + i * 60]], { base: PLATE, lw: 3, dabs: 5 });
      P.shape(x, P.blobPts(120, 340, 90, 80, 0.12, 12), { base: PLATE, outline: '#120e0c', dab: 10 });
      [[40, 300], [200, 300], [60, 410], [180, 410], [120, 250], [120, 430]].forEach(([sx, sy]) => P.polyShape(x, [[120 + (sx - 120) * 0.5 - 8, 340 + (sy - 340) * 0.5], [sx, sy], [120 + (sx - 120) * 0.5 + 8, 340 + (sy - 340) * 0.5]], { base: BONE, lw: 2.5, dabs: 3 }));
    });
  }

  A.gravemaw = () => ({
    side: {
      torso: gmTorsoSide(), plates: gmPlatesSide(false), platesBroken: gmPlatesSide(true), core: gmCore(),
      head: gmHeadSide(false, false), headOpen: gmHeadSide(true, false), headScar: gmHeadSide(false, true), headScarOpen: gmHeadSide(true, true),
      horns: gmHornsSide(false), hornsBroken: gmHornsSide(true),
      foreleg: gmForeleg(false, false), forelegBroken: gmForeleg(true, false), forelegFar: gmForeleg(false, true), forelegFarBroken: gmForeleg(true, true),
      hindleg: gmHindleg(false), hindlegFar: gmHindleg(true),
      tail1: gmTail1(false), tail1Severed: gmTail1(true), tail2: gmTail2(),
    },
    front: {
      torso: gmTorsoFront(), plates: gmPlatesFront(false), platesBroken: gmPlatesFront(true),
      head: gmHeadFront(false, false), headOpen: gmHeadFront(true, false), headScar: gmHeadFront(false, true), headScarOpen: gmHeadFront(true, true),
      horns: gmHornsFront(false), hornsBroken: gmHornsFront(true),
    },
    back: { torso: gmTorsoBack(), tail: gmTailBack(false), tailSevered: gmTailBack(true) },
  });

  // ink-on-parchment portrait for the quest board, composed from the side-view parts
  A.bossPortrait = (art, w = 560, h = 340, ink = true) => {
    const c = P.canvas(w, h), x = c.getContext('2d');
    const s = art.side, sc = Math.min(w / 1500, h / 700);
    const place = (pt, ux, uy, ang = 0) => {
      x.save(); x.translate(w * 0.5 + ux * PXU * sc, h * 0.92 - uy * PXU * sc); x.rotate(ang);
      x.drawImage(pt.canvas, -pt.pivot[0] * sc, -pt.pivot[1] * sc, pt.canvas.width * sc, pt.canvas.height * sc); x.restore();
    };
    if (ink) x.filter = 'grayscale(1) sepia(0.9) contrast(1.35) brightness(0.85)';
    place(s.hindlegFar, -7, 7.5); place(s.forelegFar, 8, 8); place(s.tail2, -16.5, 8.4, 0.12); place(s.tail1, -9.5, 8.5, 0.05);
    place(s.torso, 0, 8.5); place(s.plates, -0.5, 12.2); place(s.head, 9, 9.5, 0);
    place(s.horns, 15.2, 11.9); place(s.hindleg, -7.5, 7.5); place(s.foreleg, 7, 8);
    x.filter = 'none';
    return c;
  };
})();
