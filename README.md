# NEON BREACH

A fast, true-colour, first-person shooter that runs entirely inside your terminal. No install, no GPU, no assets.

```bash
npx neon-breach
```

or install it globally:

```bash
npm install -g neon-breach
neon-breach
```

Requires **Node.js 18+** and a modern terminal (Windows Terminal, iTerm2, WezTerm, kitty, VS Code, GNOME Terminal...). Make the window big: it adapts up to 120x36 cells by default.

## What's in it

- Raycast 3D engine with bilinear-filtered textures, perspective floor and ceiling with anti-aliased neon grid, distance fog and neon lighting
- Sub-character rendering in 24-bit colour: **quadrant blocks** (2x2 pixels per cell, default) or **braille** (2x4 pixels per cell) for a much sharper image than plain half-blocks, with diff-based output for smooth frame rates. Falls back to 256 colours automatically
- Procedurally generated levels (rooms, corridors, pillars) that get bigger and harder every level
- Three enemy types with different AI: **Drones** (melee rushers), **Sentinels** (hover, strafe and shoot) and **Titans** (armoured brutes with fireballs). They path-find to you around corners and hear gunshots
- Three weapons: **Blaster** (infinite ammo), **Scatter** shotgun, **Plasma** rifle (projectiles with splash damage)
- Pickups, minimap with fog of war, hit particles, damage vignette, weapon bob and recoil
- Kill every hostile to open the exit portal, then reach it. Scores and your best score are saved to `~/.neon-breach.json`

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` or `Up` / `Down` | Move forward / back |
| `A` / `D` | Strafe |
| `Left` / `Right` or `Q` / `E` | Turn |
| `Space` or `X` | Fire |
| `1` `2` `3` / `Tab` | Choose weapon / cycle weapons |
| `F` | Toggle autofire (fires while an enemy is under the crosshair) |
| `M` | Toggle minimap |
| `G` | Cycle render sharpness: quad / braille / half |
| `P` / `Esc` | Pause |
| `Ctrl+C` | Quit |

### Controls feel

On **Windows**, Neon Breach reads the real keyboard state (like a native game), so it behaves the traditional way: **hold to move, release to stop**, and you can combine keys freely (e.g. move + turn + fire at once). You'll see `HOLD-TO-MOVE CONTROLS ACTIVE` a second after launch. The key state is ignored while the window is unfocused (in terminals that report focus). Use `--no-native-keys` to turn this off.

On **macOS / Linux**, terminals only report key *presses* (plus the OS key-repeat), never releases, so the game emulates holding:

- There's a brief pause between the first press and key repeat kicking in
- Only the most recently pressed key repeats, so moving while firing is awkward. That's what **autofire (`F`)** is for
- Pressing the opposite direction stops you instantly

## Making it sharper

The picture is built from terminal characters, so the size of a "pixel" depends on your font. Two things help most:

1. **Shrink your terminal font** (`Ctrl` + `-` or `Ctrl` + mouse wheel in most terminals) and maximise the window. The game fills the window up to 160x48 cells by default. Use `--width` / `--height` to go larger.
2. **Pick a render mode** with `--mode` or press `G` in-game:
   - `quad` (default): 2x2 pixels per cell, clean and widely supported
   - `braille`: 2x4 pixels per cell, finest detail, slightly stippled look
   - `half`: 1x2 pixels per cell, chunkiest but the most compatible

## Options

```
neon-breach --seed 123      same dungeons every run
neon-breach --mode braille  sharpest rendering (also: quad, half)
neon-breach --width 200 --height 60   bigger picture (needs a big window)
neon-breach --fps 20        lighter on slow terminals
neon-breach --256           force 256-colour mode
```

## Development

```bash
npm start      # run from source
npm test       # headless tests: level connectivity, combat, AI, rendering, input
```

Layout: `src/world.js` (collision, raycasting, AI, projectiles), `src/raycaster.js` (renderer), `src/sprites.js` (procedural enemy art), `src/screen.js` (framebuffer + ANSI diffing), `src/game.js` (state machine, player, weapons), `src/hud.js` (weapon models, minimap, status bar).

Inspired by the classic console raycaster demos, including the C++ `ConFPS`.

## License

MIT
