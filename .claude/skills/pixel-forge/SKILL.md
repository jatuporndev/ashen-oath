---
name: pixel-forge
description: How Emberwild makes good-looking pixel-art characters and monsters — build a low-poly 3D rig, toon-shade it with hand-picked hue-shifted ramps, and pixelize it (bake for heroes, live pixel layer for bosses). Use whenever adding or changing a character, NPC, monster, weapon, pose or animation, or when any sprite "looks off".
---

# Pixel Forge — the Emberwild pixel-art method

Characters and monsters are **not painted**. They are low-poly 3D puppets that are rendered and then
turned into pixel art with strict rules. That's why the hero and Gravemaw look coherent from every angle:
the shape is real 3D, but every pixel obeys a pixel-art palette.

- Heroes: `js/art/forge.js` (pre-baked atlas, 8 facings, every move). Preview: `tools/forge.html?weapon=greatsword&anim=mv_slash&zoom=4`
- Bosses: `js/art/beast.js` (same look, rendered live each frame into a low-res colour + depth buffer — boss poses are continuous, so they can't be baked)

## 1. Shape first (the rig)

- Build from **chunky primitives**: boxes, short cylinders, squashed spheres. Few, big parts read better than many small ones at 24 px per unit.
- **Exaggerate proportions** for the read at game distance: big head/hands/feet on the hero, huge greatsword (bigger than the hero is fine), heavy brow, horns, claws, plates on the boss.
- Every visible feature must be ≥ 2 px at the target size (`ppu` 24). If a detail is smaller, cut it or make it bigger.
- Each part has a **material key** (`skin`, `cloth`, `blade`, `hide`, `plate`…) — the colour comes from the palette, never from a texture.
- Weapons are **joints of the rig** (child of the hand), so they stay in the hand and swing in real 3D.

## 2. Colour (the ramps)

- One base colour per material, expanded into a **4-tone ramp** with `F.ramp(base, { contrast, lift })`:
  - shadows a bit cooler (toward blue/purple) and darker, lights a bit warmer (toward yellow)
  - **hue drift capped (~0.035 of the wheel)**; more than that makes faces turn red/green patches
- Hero: `contrast 1`, `lift: true` (dark cloth/hair lifted so bands stay readable).
- Monsters: `contrast ≈ 1.7`, `lift: false`, a **dark, desaturated base** (`#57483f` hide, `#2a2324` plates) plus **one hot accent** (ember `#ff8a2a`) on cracks, eyes, mouth, core. Pale bases look like clay.
- Toon shading in **hard bands** with a light fixed relative to the camera (upper-left-front). Metals get a highlight band; cloth doesn't.
- Glow parts are flat-coloured (`cFlat`, no shading) so they pop.
- Keep the whole cast inside the warm Emberwild palette; check against the world and HUD before committing.

## 3. Pixelize (what makes it pixel art)

1. Render at **4× supersample** with an orthographic camera at the game pitch (24°).
2. Each output pixel = the **most common colour** of its 4×4 block (mode filter, no blending → crisp edges, one colour per pixel).
3. Coverage threshold (~40 %) decides if a pixel is on — kills fringe noise.
4. **1 px ink outline** (`F.INK #1c1418`) around the silhouette.
5. **Inner lines** where one part passes in front of another (id + depth pass) — this is what separates an arm from the torso.
6. Bosses: the same rules in a shader — nearest sampling, `gl_FragDepth` written so the world occludes correctly, 1-texel outline, darkened depth steps; texel size picked so the boss stays ≈ 24 px/unit at its distance.

## 4. Pose & animation

- Poses are **hand targets + blade direction** (`_ik: { R: { g, d, f }, L: { g } }`) solved with two-bone IK — not raw joint angles. Swings come from weapons.js angle `a` through `swing(a, { roll, side, style })`.
- Attacks are **wind / act / rec** frames (`nW/nA/nR`) driven by the move's real timing.
- **Readability from behind**: the camera is mostly behind the player, so blades lean out to their hand's side; check d=4 (back view) every time.
- Strong silhouettes per key pose: anticipation (wind) and follow-through (rec) must look different from idle.
- Few frames, big changes: 3–8 frames per action. Smears are not needed; the slash trail FX does that.
- Boss legs: IK with feet kept level and planted; body reacts through bob/pitch/topple params, not new meshes.
- Part breaks swap geometry (`hornsOk` → `hornsBroken`, plates → cracked + core visible): breaks must be visible in silhouette.

## 5. Workflow (always)

1. Change the rig/pose/palette.
2. Look at it: `tools/forge.html` for heroes; for bosses screenshot in-game with a puppeteer script and stitch a **contact sheet** (PIL) of all 8 facings or key states.
3. Check at **1× game size**, not only zoomed — muddy at 1× means simplify the shape or raise contrast.
4. Show the user a sample before a big visual change (project rule).
5. Run the hunt regression after touching boss rendering.

## Pitfalls we already hit

- All 8 facings identical → the pose reset overwrote the root rotation (`apply` must skip `root`).
- Red patch on faces → hue shift too strong; keep the drift clamp.
- Blades vanish from the back view → add outward lean / side offset.
- Weapon looks raised instead of carried → lower the blade direction (`d`), check the shoulder pose.
- Boss looked pale/clay → darker base, higher contrast, no lift, ember accents.
- GLSL: `flat` is reserved → use `cFlat`.
- Baking is expensive. Boot / game start uses the sync `F.bake`; any swap during play uses `F.bakeAsync` (sliced, ~22 ms per slice) behind `EW.ui.forging(job)` (smith-at-the-anvil overlay). Never bake on a gameplay frame without that cover.
- Every new animation adds `frames × 8` cells: keep the atlas under ~8192 px tall (greatsword: 20 columns of 128×120).
- Sheathed weapons: `F.SHEATH[weapon]` (grip position, blade direction, face normal in rest character space, carried on the chest). Poses with `_sheath: 1` put the weapon there; `'_s'` twins of everyday animations are generated by `unarm()`.

## Performance rules (from the profile)

- The JS thread is mostly idle; cost is draw calls and fill. One mesh per material per joint: `mergeStatic()` in beast.js merges plain child meshes (≈100 → 40 calls). Toggle visibility on groups, not on individual meshes, so merging stays possible.
- Purely visual scenery (rubble, spires) is merged per area (`flushRocks` in dressing.js); only solid rocks that fade as occluders stay separate.
- World boxes put per-face shade in vertex colours and tiling in UVs: 1 draw per box, one shared texture per canvas.
