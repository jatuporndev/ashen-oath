# Emberwild

A free-roaming **2.5D fantasy RPG** for the browser. The world is a real 3D space
with a perspective orbit camera, but every character, monster, tree and flower is
**2D hand-painted artwork** (painted procedurally on canvas, with no 3D models).

## Play

Double-click `index.html`. No build step or server is needed, because three.js is
vendored in `vendor/`.

| Input | Action |
|---|---|
| W A S D / arrows | Move in any direction (360°, relative to the camera) |
| Right mouse + drag | Rotate the camera freely (yaw + pitch) |
| Mouse wheel | Zoom in / out |
| Left click / Space | Sword strike (auto-aims at the nearest enemy) |
| Shift | Sprint |
| E | Talk / interact / advance dialogue |
| F | Drink a potion |

## Visual direction (how the 2.5D look is built)

- **Billboard sprites**: characters, monsters and plants are painted textures on
  upright planes that turn to face the camera. They lean back slightly as the camera
  pitches up, which gives a painted-diorama look.
- **Facing in screen space**: sprites flip left/right according to movement relative
  to the camera, so they read correctly from any angle.
- **Layered depth**: a painted ground (world map × tiled brush-detail shader),
  three parallax backdrop rings (far snowy range → mid hills → near treeline), a
  rotating cloud band, a sky dome, distance fog and drifting fireflies in the
  foreground.
- **Painted structures**: houses, fences, the well and the ruin pillars are flat
  painted textures on simple planes and boxes. When they or trees block the hero,
  they fade out.

## Content

- The village of **Thornbrook**, where Elder Morrow gives a 3-part quest chain:
  Slime Trouble → Goblin Raiders → The Ember Ruins.
- Monsters: Slimes (they hop), Goblins (they chase), Wisps (they float and guard the
  ruins). All of them wander, aggro, wind up attacks and respawn.
- XP and leveling, gold drops, potions, death and respawn, minimap, damage numbers.

## Files

- `js/paint.js`: the procedural painter (brush dabs, outlines, shading) and all art.
- `js/game.js`: world, camera, combat, AI, quests, HUD.
- `CHECKLIST.md`: the build checklist.
