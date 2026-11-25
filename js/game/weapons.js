// Weapon System — move sets for the three weapon classes. Each move is a timed sequence
// (windup → active → recovery) with procedural weapon-pivot angles (radians in the sprite
// plane; 0 = weapon pointing up, negative = rotated toward the facing direction).
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const deg = Math.PI / 180;
  const WEAPONS = (EW.WEAPONS = {
    greatsword: {
      speed: 0.82, dodge: 'roll', dodgeCost: 22, idle: { main: 0.22, off: 0 }, twoHand: true, px: 92,
      bonus: { break: 1.4, stagger: 1.6 },
      moves: {
        slash: { wind: 0.5, act: 0.12, rec: 0.55, a: [0.55, 2.5, -2.35], dmg: 48, kind: 'impact', range: 4.6, arc: 120 * deg, h: [-0.5, 4.8], stagger: 34, lunge: 1.4, stam: 0, next: 'sweep', chargeable: true, trail: { radius: 3.4, width: 1.6, tilt: 1.25 } },
        sweep: { wind: 0.34, act: 0.14, rec: 0.6, a: [-2.35, -2.9, 1.2], dmg: 40, kind: 'cut', range: 4.8, arc: 170 * deg, h: [-0.5, 3.6], stagger: 22, lunge: 0.8, next: 'slash', trail: { radius: 3.8, width: 1.4, tilt: 0.15 } },
        // charged release (mult by charge level)
        charged: { wind: 0, act: 0.12, rec: 0.7, a: [2.6, 2.6, -2.45], dmg: 48, kind: 'impact', range: 4.8, arc: 110 * deg, h: [-0.5, 5.2], stagger: 50, lunge: 1.8, trail: { radius: 3.6, width: 2.1, tilt: 1.25 } },
      },
      chargeLv: [0.6, 1.2, 1.8], chargeMul: [1, 1.6, 2.3, 3.2],
      skill: 'guard',
    },
    spear: {
      speed: 1, dodge: 'hop', dodgeCost: 20, idle: { main: -0.35, off: 0 }, px: 92,
      bonus: { break: 1.0, stagger: 1.0, pierce: { forelegs: 1.4, hindlegs: 1.3, core: 1.3, horns: 1.2 } },
      moves: {
        thrust1: { wind: 0.18, act: 0.08, rec: 0.3, a: [-0.9, -1.15, -1.57], dmg: 22, kind: 'pierce', range: 5.8, arc: 40 * deg, h: [0, 5.2], stagger: 8, lunge: 0.7, next: 'thrust2', thrust: true },
        thrust2: { wind: 0.18, act: 0.08, rec: 0.3, a: [-1.2, -1.2, -1.57], dmg: 24, kind: 'pierce', range: 5.8, arc: 40 * deg, h: [0, 5.2], stagger: 8, lunge: 0.7, next: 'thrust3', thrust: true },
        thrust3: { wind: 0.26, act: 0.1, rec: 0.45, a: [-1.0, -0.9, -1.62], dmg: 32, kind: 'pierce', range: 6.4, arc: 36 * deg, h: [0, 5.4], stagger: 14, lunge: 2.2, thrust: true },
        high: { wind: 0.3, act: 0.1, rec: 0.45, a: [-0.9, -1.4, -0.42], dmg: 34, kind: 'pierce', range: 5.4, arc: 50 * deg, h: [3, 13.5], stagger: 6, lunge: 0.5, thrust: true, high: true, stam: 10 },
        counter: { wind: 0.05, act: 0.1, rec: 0.4, a: [-1.0, -1.2, -1.57], dmg: 52, kind: 'pierce', range: 6.4, arc: 50 * deg, h: [0, 6], stagger: 30, lunge: 1.2, thrust: true },
      },
      skill: 'counter',
    },
    dual: {
      speed: 1.25, dodge: 'dash', dodgeCost: 14, idle: { main: -0.9, off: -0.6 }, px: 92,
      bonus: { break: 0.9, stagger: 0.7, small: 1.25 },
      moves: {
        d1: { wind: 0.07, act: 0.06, rec: 0.16, a: [0.9, 1.4, -2.2], hand: 'main', dmg: 12, kind: 'cut', range: 3.4, arc: 140 * deg, h: [-0.5, 3.9], stagger: 3, lunge: 0.5, next: 'd2', trail: { radius: 2.4, width: 0.6, tilt: 1.1 } },
        d2: { wind: 0.07, act: 0.06, rec: 0.16, a: [-2.2, -2.5, 0.9], hand: 'off', dmg: 12, kind: 'cut', range: 3.4, arc: 140 * deg, h: [-0.5, 3.9], stagger: 3, lunge: 0.5, next: 'd3', trail: { radius: 2.4, width: 0.6, tilt: -0.9 } },
        d3: { wind: 0.07, act: 0.06, rec: 0.16, a: [1.2, 1.6, -2.4], hand: 'both', dmg: 14, kind: 'cut', range: 3.4, arc: 160 * deg, h: [-0.5, 3.9], stagger: 4, lunge: 0.6, next: 'd4', trail: { radius: 2.6, width: 0.7, tilt: 0.2 } },
        d4: { wind: 0.12, act: 0.1, rec: 0.32, a: [2.2, 2.6, -2.6], hand: 'both', dmg: 22, kind: 'cut', range: 3.6, arc: 180 * deg, h: [-0.5, 4.2], stagger: 8, lunge: 1.2, hits: 2, trail: { radius: 2.8, width: 0.9, tilt: 1.3 } },
        dance: { wind: 0, act: 0.06, rec: 0.04, a: [2.4, 2.4, -2.4], hand: 'both', dmg: 9, kind: 'cut', range: 3.4, arc: 360 * deg, h: [-0.5, 4.2], stagger: 2, lunge: 0, trail: { radius: 2.6, width: 0.6, tilt: 0.6 } },
      },
      skill: 'dance',
    },
  });
  EW.weaponKinds = ['greatsword', 'spear', 'dual'];
  // damage formula shared by all weapons
  EW.weaponDamage = (kind, move, part, hitzone, opts = {}) => {
    const W = WEAPONS[kind], mult = EW.progress.weaponMult(kind);
    let d = move.dmg * mult * (opts.charge || 1) * hitzone;
    if (W.bonus.pierce && W.bonus.pierce[part]) d *= W.bonus.pierce[part];
    if (W.bonus.small && (part === 'core' || part === 'horns' || part === 'head')) d *= W.bonus.small;
    if (opts.emberheart) d *= 1.15;
    return Math.max(1, Math.round(d * (0.92 + Math.random() * 0.16)));
  };
})();
