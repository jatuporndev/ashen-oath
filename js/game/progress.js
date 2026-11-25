// Quest, Inventory and Crafting systems — static game data + operations on the save.
(function () {
  'use strict';
  const EW = (window.EW = window.EW || {});
  const D = (EW.data = {});

  D.materials = {
    gm_hide: { rarity: 1 }, gm_fang: { rarity: 1 }, gm_bone: { rarity: 1 }, gm_claw: { rarity: 2 },
    gm_plate: { rarity: 2 }, gm_spike: { rarity: 2 }, gm_horn: { rarity: 3 }, gm_core: { rarity: 4 },
  };
  D.bosses = {
    gravemaw: {
      size: 'large', heightMul: 6.5, hp: 3000, stars: 4, threat: ['fire', 'charge', 'aoe'],
      weak: [['core', 3], ['head', 2], ['forelegs', 2]],
      breaks: { horns: 'gm_horn', plates: 'gm_plate', tail: 'gm_spike', forelegs: 'gm_claw', head: 'gm_fang' },
      carve: [['gm_hide', 34], ['gm_bone', 24], ['gm_fang', 16], ['gm_plate', 12], ['gm_claw', 9], ['gm_horn', 3], ['gm_core', 2]],
      reward: [['gm_hide', 30], ['gm_bone', 25], ['gm_plate', 18], ['gm_claw', 12], ['gm_fang', 10], ['gm_core', 5]],
      tailCarve: [['gm_spike', 70], ['gm_hide', 30]],
    },
  };
  D.quests = [
    { id: 'q_gravemaw', boss: 'gravemaw', field: 'ravine', crowns: 600, limit: 30 * 60, faints: 3 },
  ];
  // weapon upgrade ladder: level 2, 3, 4 (4 = Gravemaw-forged ember tier)
  D.weaponMult = [1, 1, 1.15, 1.3, 1.5];
  D.weaponCost = {
    greatsword: { 2: { crowns: 250, gm_hide: 2, gm_bone: 2 }, 3: { crowns: 450, gm_plate: 2, gm_bone: 3 }, 4: { crowns: 800, gm_horn: 1, gm_plate: 3, gm_core: 1 } },
    spear: { 2: { crowns: 250, gm_hide: 2, gm_fang: 2 }, 3: { crowns: 450, gm_claw: 2, gm_fang: 2 }, 4: { crowns: 800, gm_horn: 1, gm_claw: 2, gm_core: 1 } },
    dual: { 2: { crowns: 250, gm_hide: 2, gm_fang: 2 }, 3: { crowns: 450, gm_spike: 1, gm_bone: 3 }, 4: { crowns: 800, gm_spike: 2, gm_plate: 2, gm_core: 1 } },
  };
  D.armor = {
    leather_head: { slot: 'head', set: 'leather', def: 6 },
    leather_chest: { slot: 'chest', set: 'leather', def: 10 },
    leather_legs: { slot: 'legs', set: 'leather', def: 8 },
    gm_head: { slot: 'head', set: 'gravemaw', def: 14, cost: { crowns: 300, gm_hide: 3, gm_horn: 1 } },
    gm_chest: { slot: 'chest', set: 'gravemaw', def: 22, cost: { crowns: 450, gm_hide: 4, gm_plate: 2, gm_bone: 2 } },
    gm_legs: { slot: 'legs', set: 'gravemaw', def: 18, cost: { crowns: 350, gm_hide: 3, gm_claw: 1, gm_bone: 2 } },
  };
  D.armorUp = (lvl) => ({ crowns: 120 + lvl * 80, gm_hide: 1 + lvl, gm_bone: lvl });
  D.armorMax = 3;

  const G = () => EW.save.game;
  const PR = (EW.progress = {});
  PR.count = (id) => (id === 'crowns' ? G().crowns : G().materials[id] || 0);
  PR.give = (id, n = 1) => { if (id === 'crowns') G().crowns += n; else G().materials[id] = (G().materials[id] || 0) + n; };
  PR.canAfford = (cost) => Object.entries(cost).every(([k, v]) => PR.count(k) >= v);
  PR.pay = (cost) => { if (!PR.canAfford(cost)) return false; for (const [k, v] of Object.entries(cost)) { if (k === 'crowns') G().crowns -= v; else G().materials[k] -= v; } return true; };

  PR.weaponLvl = (k) => G().weapons[k].lvl;
  PR.weaponTier = (k) => (PR.weaponLvl(k) >= 4 ? 1 : 0);
  PR.weaponMult = (k) => D.weaponMult[PR.weaponLvl(k)];
  PR.weaponAttack = (k) => Math.round({ greatsword: 160, spear: 120, dual: 110 }[k] * PR.weaponMult(k));
  PR.nextWeaponCost = (k) => D.weaponCost[k][PR.weaponLvl(k) + 1] || null;
  PR.upgradeWeapon = (k) => { const c = PR.nextWeaponCost(k); if (!c || !PR.pay(c)) return false; G().weapons[k].lvl++; EW.save.commit(); return true; };
  PR.equipWeapon = (k) => { G().weapon = k; EW.save.commit(); };

  PR.armorLvl = (id) => G().armor.lvl[id] || 0;
  PR.armorDef = (id) => D.armor[id].def + PR.armorLvl(id) * 3;
  PR.owns = (id) => G().armor.owned.includes(id);
  PR.craftArmor = (id) => { const a = D.armor[id]; if (PR.owns(id) || !a.cost || !PR.pay(a.cost)) return false; G().armor.owned.push(id); EW.save.commit(); return true; };
  PR.upgradeArmor = (id) => { const l = PR.armorLvl(id); if (l >= D.armorMax || !PR.owns(id) || !PR.pay(D.armorUp(l))) return false; G().armor.lvl[id] = l + 1; EW.save.commit(); return true; };
  PR.equipArmor = (id) => { if (!PR.owns(id)) return false; G().armor.equip[D.armor[id].slot] = id; EW.save.commit(); EW.bus.emit('armor'); return true; };
  PR.defense = () => Object.values(G().armor.equip).reduce((s, id) => s + PR.armorDef(id), 0);
  PR.setPieces = (set) => Object.values(G().armor.equip).filter((id) => D.armor[id].set === set).length;
  PR.skills = () => { const n = PR.setPieces('gravemaw'); const s = []; if (n >= 2) s.push('fireward'); if (n >= 3) s.push('emberheart'); return s; };
  // sprite palette: gravemaw look once the chest piece is gravemaw
  PR.palette = () => (D.armor[G().armor.equip.chest].set === 'gravemaw' ? 'gravemaw' : 'leather');

  PR.roll = (table) => { const tot = table.reduce((s, [, w]) => s + w, 0); let r = Math.random() * tot; for (const [id, w] of table) { r -= w; if (r <= 0) return id; } return table[0][0]; };
  PR.questById = (id) => D.quests.find((q) => q.id === id);
})();
