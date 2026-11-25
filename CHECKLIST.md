# EMBERWILD — Hunter's Oath · Build Checklist

Fantasy boss-hunting RPG · Three.js · free-roaming 2.5D · hand-painted 2D art (procedural canvas painting, no 3D models).
Runs by double-clicking `index.html` (classic scripts, vendored three.js, no build step).

## Architecture (separate systems, `js/`)
- [ ] `core/i18n.js` Localization (EN / TH)
- [ ] `core/save.js` Save System + settings
- [ ] `core/audio.js` Audio Manager (synth SFX + generative music per scene)
- [ ] `core/input.js` Input (keyboard / mouse / gamepad, device glyphs)
- [ ] `art/paint.js` painter + `art/sprites.js` Sprite Animation System (directional sprite sheets)
- [ ] `engine/world.js` Scene Manager (Guild Hub, Hunting Field, terrain, backdrops)
- [ ] `engine/camera.js` Camera Controller (RMB rotate, wheel zoom, boss-aware framing, lock-on)
- [ ] `game/player.js` Player Controller + `game/weapons.js` Weapon System
- [ ] `game/boss.js` Boss AI + Body Part Damage System
- [ ] `game/combat.js` Combat System (hitboxes, damage, stagger, i-frames)
- [ ] `game/progress.js` Quest, Inventory, Crafting systems
- [ ] `ui/ui.js` UI Manager (screens) + `ui/hud.js`
- [ ] `main.js` Game State Manager

## Phase 1 — Playable foundation
- [ ] First launch: full-screen Language Selection (ไทย / English), saved, never shown again
- [ ] Main Menu: Continue · New Game · Settings · Exit (fantasy, atmospheric, not web)
- [ ] Settings incl. language switch, camera, audio, subtitles; all text translated
- [ ] Guild Hub: Weapon Workshop, Armor Workshop, Storage/Inventory, Quest Board, large Guild Gate, NPCs, lanterns/braziers, atmospheric lighting
- [ ] Player: 360° movement incl. diagonals, sprint, stamina, dodge roll with i-frames
- [ ] Directional sprites: front / back / side (mirrored) views + walk / idle / attack / dodge / hurt frames
- [ ] Camera: perspective, RMB+drag free rotation, wheel zoom, dynamic framing keeps player + boss visible, lock-on
- [ ] Quest Board: boss artwork, name, description, behaviour/attacks, weaknesses, difficulty, rewards, accept
- [ ] Guild Gate opens with animation → player walks through → transition → Hunting Field
- [ ] Hunting Field: large terrain with cliffs, ruins, forest, cave, ledge; only ONE boss, no other enemies/NPCs
- [ ] Environmental interactions: breakable pillars (lure charge), ember crystals (detonate), elevated ledge, healing herbs
- [ ] Boss: Gravemaw (Large, ~6.5× player height) — intro, movement patterns, 6+ attacks, 2 phases, exhaustion/stagger/topple
- [ ] Body parts: head, horns, forelegs, back plates, tail, exposed core — durability, armor, visible breaks, attacks disabled by breaks, break rewards
- [ ] Climb/mount the toppled boss to strike the elevated core
- [ ] Weapons: Greatsword (charge, guard), Spear (long reach, high thrust, counter), Dual Blades (fast combos, dash, blade dance) — distinct animations/mechanics, all able to win
- [ ] Victory → rewards (carves + break bonuses) → Return to Guild; faint system (3 faints = failed)

## Phase 2 — Progression
- [ ] Weapon upgrades (levels) + craft new weapon tier from boss materials
- [ ] Armor crafting/upgrades with stats & bonuses; equip
- [ ] Inventory of materials; rewards display
- [ ] Save/load progression (Continue)
- [ ] Second boss + second hunting field (different size class & mechanics)

## Phase 3 — Polish
- [ ] Game-world UI: parchment, wood, metal ornaments, engraved type; no web cards/dashboards
- [ ] Generative music (hub / hunt / victory) + SFX
- [ ] VFX: trails, impacts, dust, embers, screen shake, hit-stop
- [ ] Headless test run: menus, hub, gate, hunt, combat with each weapon, victory, crafting, TH layout
- [ ] README
