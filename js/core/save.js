// Save System — profile (language + settings) and hunter progression, in localStorage.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const KEY_PROFILE = 'emberwild.hunter.profile';
  const KEY_GAME = 'emberwild.hunter.save';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  const DEFAULT_SETTINGS = {
    sens: 5, padSens: 5, filter: true, invertY: false, fov: 50, lockAssist: true,
    master: 80, music: 60, sfx: 80,
    subtitles: true, subSize: 'medium', dmgNums: true, shake: true,
  };
  function freshGame() {
    return {
      v: 1,
      crowns: 400,
      materials: {},
      weapon: 'greatsword',
      weapons: { greatsword: { lvl: 1 }, spear: { lvl: 1 }, dual: { lvl: 1 } },
      armor: {
        owned: ['leather_head', 'leather_chest', 'leather_legs'],
        equip: { head: 'leather_head', chest: 'leather_chest', legs: 'leather_legs' },
        lvl: {},
      },
      cleared: {},
      hunts: 0,
      playtime: 0,
      lastQuest: null,
    };
  }

  const Save = (EW.save = {
    profile: Object.assign({ lang: null, settings: {} }, read(KEY_PROFILE) || {}),
    game: null,
    init() {
      this.profile.settings = Object.assign({}, DEFAULT_SETTINGS, this.profile.settings || {});
      const g = read(KEY_GAME);
      this.stored = g && g.v === 1 ? g : null;
    },
    setting(k) { return this.profile.settings[k]; },
    setSetting(k, v) { this.profile.settings[k] = v; this.saveProfile(); EW.bus?.emit('settings', { key: k, value: v }); },
    setLang(l) { this.profile.lang = l; this.saveProfile(); },
    saveProfile() { write(KEY_PROFILE, this.profile); },
    hasGame() { return !!this.stored; },
    newGame() { this.game = freshGame(); this.commit(); return this.game; },
    loadGame() { this.game = JSON.parse(JSON.stringify(this.stored || freshGame())); return this.game; },
    commit() { if (!this.game) return false; this.stored = JSON.parse(JSON.stringify(this.game)); return write(KEY_GAME, this.stored); },
    wipe() { try { localStorage.removeItem(KEY_GAME); localStorage.removeItem(KEY_PROFILE); } catch (e) { /* ignore */ } },
  });
  Save.init();

  // tiny event bus shared by all systems
  const handlers = {};
  EW.bus = {
    on(n, f) { (handlers[n] = handlers[n] || []).push(f); },
    emit(n, d) { (handlers[n] || []).forEach((f) => f(d)); },
  };
})();
