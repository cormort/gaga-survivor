# Warhammer 40K Expansion Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Follow bite-sized tasks with continuous testing and verification.

**Goal:** Implement the full Warhammer 40K expansion for Gaga Survivor, including 2 new heroes (Astartes Duck & Tech-Priest Goose), 4 new weapons (Bolter, Chainsword, Storm Bolter, Power Sword), 6 new defense facilities (Barracks spawning Guardsmen, Manufactorum building Leman Russ tanks, Heavy Bolter, Plasma Battery, Aquila Shrine, Aegis Line), 7 new enemies + 3 bosses, and the dedicated Forge World Tower Defense map (`td_forgeworld`).

**Architecture:**
- Declarative configuration in `js/config.js` and `js/characters.js`.
- Procedural Canvas baking in `js/sprites.js` and Retina badge generation in `js/weapons/WeaponSprites.js`.
- Facility & unit spawning state machine in `js/entities/Turret.js` and `js/systems/Facilities.js`.
- Convergent path & wave choreography in `js/tdlevels.js`.
- Automated headless visual and state verification using `ego-browser`.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML5 Canvas 2D, ego-browser Node.js automation.

---

### Task 1: Weapons & Super-Weapon Evolution (`bolter`, `chainsword`, `storm_bolter`, `power_sword`)
**Files:**
- Modify: `js/config.js` (add WEAPONS definitions, RECIPES pairs)
- Modify: `js/weapons/WeaponSprites.js` (draw 2x Retina icon badges)
- Modify: `js/weapons/WeaponArt.js` (render firing flash & slash trails)
- Modify: `js/weapons/WeaponManager.js` (implement explosive bolter rounds and sweeping chainsword teeth)
- Test: `tools/check-refactor-refs.mjs`

### Task 2: 40K Characters (`astartes_duck` & `techpriest_goose`)
**Files:**
- Modify: `js/config.js` & `js/characters.js` (register character stats, traits, dialogue scripts)
- Modify: `js/sprites.js` (bake procedural sprites for Power Armour Duck and Mechanicus Goose)
- Test: Verify character selection DOM & stats

### Task 3: Enemies & Bosses (Tyranids, Orks, Chaos)
**Files:**
- Modify: `js/config.js` (add enemy types and boss specs)
- Modify: `js/sprites.js` (draw pixel sprites for Hormagaunt, Termagant, Spore Mine, Genestealer, Ork Boy, Squig, Poxwalker, Warboss, Broodlord, Carnifex)
- Modify: `js/entities/Enemy.js` (implement zigzag leaps, self-destruct poison clouds, and boss shockwaves)
- Test: Unit check enemy stats & sprites

### Task 4: Defense Facilities & Production (Barracks, Tanks & Advanced Turrets)
**Files:**
- Modify: `js/entities/Turret.js` (add `barracks`, `manufactorum`, `heavy_bolter`, `plasma_battery`, `holy_shrine`, `aegis_barricade`)
- Modify: `js/entities/Turret.js` (implement Guardsman squad and Leman Russ tank classes/update logic)
- Modify: `js/systems/Facilities.js` (build menu HUD buttons and costs)
- Modify: `js/sprites.js` (bake sprites for facilities and spawned units)
- Test: Verify facility creation, unit path-blocking, and tank shell explosions

### Task 5: Tower Defense Map: Cadia / Forge World (`td_forgeworld`)
**Files:**
- Modify: `js/tdlevels.js` (register `td_forgeworld` with dual convergent paths, Titan Reactor Core, 12 waves)
- Modify: `js/systems/Terrain.js` / `js/levels.js` (add industrial hazard stripes, steam vents, and metal plate rendering)
- Modify: `js/systems/Menu.js` / level selection UI
- Test: Verify level loading and path calculations

### Task 6: PWA Integration & `ego-browser` E2E Automated Verification
**Files:**
- Modify: `sw.js` (precache consistency)
- Create: `tools/ego-test-warhammer.js`
- Test: Run `ego-browser nodejs < tools/ego-test-warhammer.js` to verify:
  1. Character selection (Astartes Duck & Tech-Priest Goose).
  2. Codex recipes (Bolter & Chainsword evolutions).
  3. Starting `td_forgeworld`, building Barracks and Manufactorum.
  4. Guardsmen blocking Hormagaunts and Leman Russ firing cannons.
  5. Capture in-game screenshots and verify clean exit.
