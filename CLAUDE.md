# Graveyard Shift

Ryan's hobby game: a 3D top-down endless-survival zombie shooter, built with AI. Browser prototype (Three.js + Vite) for fast iteration and phone testing. The plan is to port to a full engine once the core loop is proven fun.

## Direction (from Ryan)
- **Core:** endless survival. Waves get harder, gear is found and kept, day/night cycle (nights are longer and more dangerous).
- **Look and feel target:** Minigore's camera and chunky readability, with Gears of War grit. Awesome lighting, punchy and varied gun sounds and visuals, customisable characters later.
- **Budget:** about £100 for assets, spent only once the loop is fun. Free/placeholder art until then. Keep one coherent art style and never mix asset families.
- **Future ideas, not built yet:** per-level task lists that unlock new areas (as a mode, not the core), choose-1-of-3 upgrade cards, real weapon models.

## Commands
- `npm install` once
- `npm run dev`: local dev server (also reachable from a phone on the same Wi-Fi)
- `npm run build`: single self-contained `dist/index.html`
- `npm run build:artifact`: also writes `dist/artifact.html` (no outer html/head/body) for publishing as a claude.ai artifact. The play link is https://claude.ai/artifact/QmVzYjPRjHUZczRyoABztR; republish to that same URL.

## Code map
- `src/config.js`: **all tuning numbers** (weapons, zombies, waves, drops, day/night timings, camera). Change balance here first.
- `src/main.js`: game state, rules, waves, combat, pickups, main loop.
- `src/scene.js`: renderer, bloom, lights, ground/graves/trees/fence/lamps, day/night lighting, camera, adaptive quality.
- `src/models.js`: placeholder low-poly models (player, zombies, guns, pickups). Swap for glTF models later; every model faces +X.
- `src/fx.js`: particles (blood, gibs, casings, sparks, motes), blood decals, tracers, muzzle flash, rings.
- `src/audio.js`: synthesised, layered sound with per-shot variation.
- `src/ui.js`, `src/input.js`, `src/icons.js`: HUD and overlay, mouse/keyboard/twin-stick touch, item icons (SVG paths shared by HUD and 3D pickups).
- `legacy/graveyard-shift-2d.html`: the original 2D version, kept for reference.

## Conventions
- Units are metres and seconds. The world is the XZ plane, with Y up.
- Keep the light count constant; toggle intensity instead, since adding/removing lights recompiles shaders.
- Test on a phone-sized viewport too; touch controls are first-class.
- `window.__gs` exposes game state plus `spawnZombie` and `spawnPickup` for debugging and headless tests.
