// Audio Manager — synthesized SFX, generative scene music and ambience (Web Audio, no files).
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  let ac = null, master, musicBus, sfxBus, ambBus, noiseBuf;
  const vol = () => {
    const s = EW.save.profile.settings;
    if (!ac) return;
    master.gain.value = s.master / 100;
    musicBus.gain.value = (s.music / 100) * 0.55;
    sfxBus.gain.value = s.sfx / 100;
    ambBus.gain.value = (s.sfx / 100) * 0.8;
  };
  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.connect(ac.destination);
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
        musicBus = ac.createGain(); sfxBus = ac.createGain(); ambBus = ac.createGain();
        // simple shared reverb (feedback delay network-ish)
        const rev = ac.createConvolver(); rev.buffer = impulse(2.6, 2.2);
        const revGain = ac.createGain(); revGain.gain.value = 0.32; rev.connect(revGain); revGain.connect(comp);
        [musicBus, sfxBus, ambBus].forEach((b) => { b.connect(comp); b.connect(rev); });
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        vol();
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function impulse(sec, decay) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- voices
  function osc(bus, f, t, dur, { type = 'sine', gain = 0.1, attack = 0.005, release = null, slide = 0, detune = 0, filter = 0, q = 0.7 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    if (release) { g.gain.setValueAtTime(gain, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = filter; f2.Q.value = q; o.connect(f2); node = f2; }
    node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + (release || 0) + 0.05);
  }
  function noise(bus, t, dur, { gain = 0.2, freq = 1200, q = 0.8, type = 'bandpass', sweep = 0, attack = 0.005 } = {}) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    f.Q.value = q; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const pluck = (bus, m, t, g = 0.06, dur = 0.9) => { osc(bus, mtof(m), t, dur, { type: 'triangle', gain: g, attack: 0.003, filter: 2600 }); osc(bus, mtof(m + 12), t, dur * 0.4, { type: 'sine', gain: g * 0.3 }); };
  const pad = (bus, ms, t, dur, g = 0.03, cut = 900) => ms.forEach((m) => { osc(bus, mtof(m), t, dur, { type: 'sawtooth', gain: g, attack: dur * 0.35, release: 0.8, detune: -7, filter: cut }); osc(bus, mtof(m), t, dur, { type: 'sawtooth', gain: g, attack: dur * 0.35, release: 0.8, detune: 7, filter: cut }); });
  const kick = (bus, t, g = 0.5) => { osc(bus, 120, t, 0.45, { gain: g, slide: 0.32 }); noise(bus, t, 0.05, { gain: g * 0.3, freq: 3000 }); };
  const taiko = (bus, t, g = 0.45) => { osc(bus, 80, t, 0.7, { gain: g, slide: 0.55 }); noise(bus, t, 0.25, { gain: g * 0.35, freq: 400, type: 'lowpass' }); };
  const snare = (bus, t, g = 0.15) => { noise(bus, t, 0.18, { gain: g, freq: 2200, q: 0.6 }); osc(bus, 190, t, 0.1, { gain: g * 0.6, slide: 0.6 }); };
  const bell = (bus, m, t, g = 0.04) => { osc(bus, mtof(m), t, 2.2, { gain: g }); osc(bus, mtof(m) * 2.76, t, 1.0, { gain: g * 0.35 }); osc(bus, mtof(m) * 5.4, t, 0.5, { gain: g * 0.15 }); };
  const brass = (bus, ms, t, dur, g = 0.05) => ms.forEach((m) => osc(bus, mtof(m), t, dur, { type: 'sawtooth', gain: g, attack: 0.06, release: 0.3, filter: 1400, q: 2 }));
  const bassNote = (bus, m, t, dur, g = 0.12) => osc(bus, mtof(m), t, dur, { type: 'sawtooth', gain: g, attack: 0.01, release: 0.1, filter: 380 });

  // ---------- generative music
  const TRACKS = {
    menu: { bpm: 56, bar(t, i, beat) {
      const ch = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 64]][i % 4];
      pad(this.bus, ch, t, beat * 4, 0.018, 700);
      bassNote(this.bus, ch[0] - 12, t, beat * 4, 0.05);
      const mel = [74, 72, 69, 77, 76, 74, 72, 69];
      if (i % 2 === 0) bell(this.bus, mel[(i / 2) % 8 | 0], t + beat * 1, 0.025);
      if (i % 4 === 3) bell(this.bus, 81, t + beat * 3, 0.015);
    } },
    hub: { bpm: 86, bar(t, i, beat) {
      const prog = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]];
      const ch = prog[i % 4];
      pad(this.bus, ch.map((m) => m - 12), t, beat * 4, 0.012, 600);
      bassNote(this.bus, ch[0] - 24, t, beat * 2, 0.06); bassNote(this.bus, ch[0] - 24, t + beat * 2, beat * 2, 0.05);
      const arp = [0, 1, 2, 1, 2, 1, 0, 2];
      for (let k = 0; k < 8; k++) pluck(this.bus, ch[arp[k]] + (k === 6 && i % 2 ? 12 : 0), t + k * beat / 2, 0.035 + (k % 2 ? 0 : 0.012), 0.7);
      for (let k = 0; k < 4; k++) noise(this.bus, t + k * beat + beat / 2, 0.06, { gain: 0.03, freq: 5000, q: 1 });
      if (i % 2 === 0) osc(this.bus, 90, t, 0.3, { gain: 0.1, slide: 0.5 });
      if (i % 8 === 7) [76, 74, 72, 71].forEach((m, k) => pluck(this.bus, m, t + k * beat, 0.03, 1.4));
    } },
    field: { bpm: 64, bar(t, i, beat) {
      pad(this.bus, [38, 45], t, beat * 4, 0.02, 420);
      if (i % 2 === 0) taiko(this.bus, t, 0.18);
      if (i % 4 === 2) taiko(this.bus, t + beat * 2.5, 0.12);
      const ph = [62, 63, 60, 58, 57];
      if (Math.random() < 0.7) pluck(this.bus, ph[(Math.random() * ph.length) | 0], t + beat * (1 + ((Math.random() * 3) | 0)), 0.025, 1.6);
      if (i % 8 === 4) bell(this.bus, 74, t + beat, 0.012);
    } },
    battle: { bpm: 132, bar(t, i, beat) {
      const hot = this.intensity || 0;
      const roots = [38, 38, 34, 36];
      const r = roots[i % 4];
      for (let k = 0; k < 8; k++) bassNote(this.bus, r + (k % 4 === 3 ? 7 : 0), t + k * beat / 2, beat / 2 * 0.9, 0.09);
      [0, 1.5, 2, 3.5].forEach((b) => taiko(this.bus, t + b * beat, 0.32));
      if (hot) [0.75, 2.75].forEach((b) => taiko(this.bus, t + b * beat, 0.2));
      [1, 3].forEach((b) => snare(this.bus, t + b * beat, 0.08 + hot * 0.05));
      const ost = [62, 65, 64, 65, 62, 65, 67, 65].map((m) => m + (r - 38));
      for (let k = 0; k < 8; k++) osc(this.bus, mtof(ost[k] + (hot ? 12 : 0)), t + k * beat / 2, beat / 2, { type: 'sawtooth', gain: 0.022, filter: 1800, attack: 0.01 });
      if (i % 2 === 0) brass(this.bus, [r + 12, r + 19, r + 24], t, beat * 1.5, 0.03 + hot * 0.02);
      if (i % 4 === 3) brass(this.bus, [r + 14, r + 21, r + 26], t + beat * 2, beat * 2, 0.035);
      pad(this.bus, [r + 24, r + 27, r + 31], t, beat * 4, 0.008 + hot * 0.006, 1200);
    } },
  };
  let current = null, nextBarT = 0, barIdx = 0, schedTimer = null;
  function startScheduler() {
    if (schedTimer) return;
    schedTimer = setInterval(() => {
      if (!ac || !current) return;
      const tr = TRACKS[current.name], beat = 60 / tr.bpm;
      while (nextBarT < ac.currentTime + 0.6) {
        tr.bus = current.gain; tr.intensity = current.intensity;
        try { tr.bar(nextBarT, barIdx, beat); } catch (e) { /* ignore */ }
        nextBarT += beat * 4; barIdx++;
      }
    }, 120);
  }

  const Audio = (EW.audio = {
    unlock() { ctx(); },
    music(name, { intensity = 0 } = {}) {
      if (!ctx()) { this.pending = name; return; }
      if (current && current.name === name) { current.intensity = intensity; return; }
      if (current) { const g = current.gain; g.gain.setTargetAtTime(0, ac.currentTime, 0.6); setTimeout(() => g.disconnect(), 4000); }
      if (!name) { current = null; return; }
      const gain = ac.createGain(); gain.gain.value = 0; gain.connect(musicBus); gain.gain.setTargetAtTime(1, ac.currentTime + 0.1, 0.8);
      current = { name, gain, intensity };
      nextBarT = ac.currentTime + 0.15; barIdx = 0; startScheduler();
    },
    intensity(v) { if (current) current.intensity = v; },
    fanfare() {
      if (!ctx()) return;
      const t = ac.currentTime + 0.05, b = 0.16;
      [[62, 0, 1], [62, 1, 1], [62, 2, 1], [67, 3, 4], [69, 7, 2], [71, 9, 2], [74, 11, 6]].forEach(([m, s, d]) => brass(musicBus, [m, m + 4, m + 7], t + s * b, d * b, 0.05));
      [0, 3, 7, 11].forEach((s) => taiko(musicBus, t + s * b, 0.3));
      bell(musicBus, 86, t + 11 * b, 0.04);
    },
    ambience(kind) {
      if (!ctx()) return;
      if (this.amb) { const a = this.amb; a.g.gain.setTargetAtTime(0, ac.currentTime, 0.5); setTimeout(() => { try { a.src.stop(); } catch (e) { /* */ } }, 3000); this.amb = null; }
      if (!kind) return;
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'field' ? 520 : 340; f.Q.value = 0.5;
      const g = ac.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(kind === 'field' ? 0.09 : 0.04, ac.currentTime, 1);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.06; lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      src.connect(f); f.connect(g); g.connect(ambBus); src.start();
      this.amb = { src, g, kind };
    },
    sfx(name, opts = {}) {
      if (!ctx()) return;
      const t = ac.currentTime + (opts.delay || 0), B = sfxBus, v = opts.vol ?? 1;
      const S = {
        uiMove: () => osc(B, 1500, t, 0.05, { gain: 0.02 * v, type: 'triangle' }),
        uiConfirm: () => { osc(B, 660, t, 0.2, { gain: 0.045, type: 'triangle' }); osc(B, 990, t + 0.07, 0.3, { gain: 0.03, type: 'triangle' }); },
        uiBack: () => osc(B, 560, t, 0.18, { gain: 0.04, type: 'triangle', slide: 0.7 }),
        uiAdjust: () => osc(B, 1180, t, 0.045, { gain: 0.025, type: 'triangle' }),
        uiOpen: () => { noise(B, t, 0.35, { gain: 0.05, freq: 900, sweep: 0.4, q: 0.5 }); osc(B, 220, t, 0.4, { gain: 0.03, type: 'triangle' }); },
        paper: () => noise(B, t, 0.25, { gain: 0.05, freq: 3500, sweep: 0.5, q: 0.6 }),
        swingHeavy: () => noise(B, t, 0.42, { gain: 0.22 * v, freq: 300, sweep: 5, q: 1.2, attack: 0.08 }),
        swingLight: () => noise(B, t, 0.14, { gain: 0.12 * v, freq: 1400, sweep: 3, q: 1.6 }),
        thrust: () => noise(B, t, 0.16, { gain: 0.15 * v, freq: 900, sweep: 4, q: 2 }),
        hit: () => { noise(B, t, 0.14, { gain: 0.3 * v, freq: 700, type: 'lowpass' }); osc(B, 140, t, 0.16, { gain: 0.18 * v, slide: 0.5 }); },
        hitHeavy: () => { noise(B, t, 0.3, { gain: 0.45 * v, freq: 500, type: 'lowpass' }); osc(B, 90, t, 0.35, { gain: 0.32 * v, slide: 0.45 }); },
        hitArmor: () => { osc(B, 1800, t, 0.18, { gain: 0.05 * v, type: 'square', slide: 0.8 }); osc(B, 2600, t, 0.12, { gain: 0.03 * v, type: 'square' }); noise(B, t, 0.08, { gain: 0.15 * v, freq: 3000 }); },
        hitWeak: () => { noise(B, t, 0.2, { gain: 0.35 * v, freq: 900, type: 'lowpass' }); osc(B, 220, t, 0.28, { gain: 0.14 * v, slide: 0.4, type: 'triangle' }); osc(B, 1760, t, 0.25, { gain: 0.03 * v, type: 'triangle' }); },
        partBreak: () => { noise(B, t, 0.7, { gain: 0.45, freq: 1200, sweep: 0.15, q: 0.6 }); osc(B, 70, t, 0.8, { gain: 0.35, slide: 0.5 }); [880, 1320].forEach((f, i) => osc(B, f, t + 0.1 + i * 0.08, 0.6, { gain: 0.03, type: 'triangle' })); },
        roar: () => { [0, 0.07, 0.15].forEach((d, i) => osc(B, 70 + i * 17, t + d, 2.0, { type: 'sawtooth', gain: 0.14, attack: 0.25, slide: 0.7, filter: 700, q: 3 })); noise(B, t, 2.2, { gain: 0.25, freq: 500, sweep: 0.6, q: 0.8, attack: 0.3 }); },
        growl: () => { osc(B, 60, t, 0.9, { type: 'sawtooth', gain: 0.08, attack: 0.15, filter: 400, q: 4 }); noise(B, t, 0.9, { gain: 0.08, freq: 260, q: 1 }); },
        stomp: () => { osc(B, 55, t, 0.9, { gain: 0.6 * v, slide: 0.4 }); noise(B, t, 0.7, { gain: 0.4 * v, freq: 220, type: 'lowpass' }); },
        step: () => { osc(B, 48, t, 0.35, { gain: 0.25 * v, slide: 0.6 }); noise(B, t, 0.25, { gain: 0.12 * v, freq: 180, type: 'lowpass' }); },
        breath: () => { noise(B, t, 1.7, { gain: 0.3, freq: 700, sweep: 1.8, q: 0.4, attack: 0.15 }); noise(B, t, 1.7, { gain: 0.15, freq: 2600, q: 0.3, attack: 0.3 }); },
        explosion: () => { noise(B, t, 1.2, { gain: 0.6, freq: 900, sweep: 0.1, q: 0.4 }); osc(B, 60, t, 1.0, { gain: 0.5, slide: 0.35 }); },
        dodge: () => noise(B, t, 0.25, { gain: 0.09, freq: 600, sweep: 0.5, q: 0.7 }),
        hurt: () => { osc(B, 130, t, 0.3, { gain: 0.2, type: 'sawtooth', slide: 0.5, filter: 900 }); noise(B, t, 0.22, { gain: 0.2, freq: 400, type: 'lowpass' }); },
        guard: () => { osc(B, 900, t, 0.3, { gain: 0.07, type: 'square', slide: 0.9 }); noise(B, t, 0.2, { gain: 0.25, freq: 2500, q: 0.8 }); },
        potion: () => { for (let i = 0; i < 5; i++) osc(B, 380 + i * 120, t + i * 0.07, 0.12, { gain: 0.04, slide: 1.6 }); },
        herb: () => { osc(B, 880, t, 0.2, { gain: 0.04, type: 'triangle' }); osc(B, 1175, t + 0.08, 0.3, { gain: 0.03, type: 'triangle' }); },
        charge: () => osc(B, 600 + (opts.level || 1) * 220, t, 0.25, { gain: 0.06, type: 'triangle' }),
        gate: () => { osc(B, 48, t, 4.0, { type: 'sawtooth', gain: 0.08, attack: 0.5, filter: 160 }); noise(B, t, 4.2, { gain: 0.12, freq: 160, q: 2, attack: 0.6 }); [0.4, 1.3, 2.4].forEach((d) => noise(B, t + d, 0.5, { gain: 0.08, freq: 900, q: 4 })); },
        anvil: () => { [0, 0.35, 0.7].forEach((d) => { osc(B, 1250, t + d, 0.8, { gain: 0.06, type: 'triangle' }); osc(B, 3150, t + d, 0.5, { gain: 0.02 }); noise(B, t + d, 0.05, { gain: 0.15, freq: 4000 }); }); },
        mount: () => { noise(B, t, 0.3, { gain: 0.15, freq: 500, type: 'lowpass' }); osc(B, 300, t, 0.3, { gain: 0.05, type: 'triangle', slide: 1.5 }); },
        thrash: () => { noise(B, t, 0.9, { gain: 0.25, freq: 300, q: 0.5 }); osc(B, 65, t, 0.8, { type: 'sawtooth', gain: 0.08, filter: 300 }); },
        coin: () => { osc(B, 1568, t, 0.09, { gain: 0.025, type: 'square' }); osc(B, 2093, t + 0.045, 0.16, { gain: 0.02, type: 'square' }); },
        fail: () => [62, 58, 55, 50].forEach((m, i) => osc(B, mtof(m), t + i * 0.35, 1.0, { gain: 0.05, type: 'triangle' })),
        crumble: () => { noise(B, t, 1.4, { gain: 0.4, freq: 400, sweep: 0.3, q: 0.5 }); [0.1, 0.4, 0.7].forEach((d) => osc(B, 70, t + d, 0.4, { gain: 0.2, slide: 0.5 })); },
        whisper: () => noise(B, t, 0.3, { gain: 0.015, freq: 3200, q: 3 }),
      };
      try { S[name] && S[name](); } catch (e) { /* audio unavailable */ }
    },
  });
  EW.bus.on('settings', ({ key }) => { if (['master', 'music', 'sfx'].includes(key)) vol(); });
  const unlock = () => { Audio.unlock(); if (Audio.pending) { const p = Audio.pending; Audio.pending = null; Audio.music(p); } };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
})();
