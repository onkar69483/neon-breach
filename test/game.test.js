import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, bfs } from '../src/level.js';
import { World } from '../src/world.js';
import { Screen } from '../src/screen.js';
import { Input } from '../src/input.js';
import { Game } from '../src/game.js';
import { mulberry32 } from '../src/util.js';

function makeGame(seed = 42, cols = 100, rows = 30) {
  let clock = 0;
  const input = new Input(() => clock);
  const screen = new Screen(cols, rows, 'truecolor');
  const game = new Game({ screen, input, seed });
  return { game, input, screen, advance: (dt) => { clock += dt; } };
}

function step(ctx, dt = 1 / 30) {
  ctx.advance(dt);
  ctx.game.update(dt);
  ctx.input.endFrame();
  ctx.game.render();
}

test('levels are fully connected and sane for many seeds', () => {
  for (let level = 1; level <= 12; level++) {
    for (let seed = 1; seed <= 15; seed++) {
      const L = generateLevel(level, mulberry32(seed * 977 + level));
      const dist = bfs(L.cells, L.w, L.h, Math.floor(L.start.x), Math.floor(L.start.y));
      for (const r of L.rooms) assert.ok(dist[r.cy * L.w + r.cx] < 32767, `room unreachable L${level} s${seed}`);
      assert.equal(L.cells[Math.floor(L.start.y) * L.w + Math.floor(L.start.x)], 0);
      for (let x = 0; x < L.w; x++) {
        assert.notEqual(L.cells[x], 0);
        assert.notEqual(L.cells[(L.h - 1) * L.w + x], 0);
      }
    }
  }
});

test('world spawns enemies away from the player and all are reachable', () => {
  for (let level = 1; level <= 8; level++) {
    const w = new World(level, mulberry32(level * 31));
    assert.ok(w.enemies.length > 0);
    const dist = bfs(w.cells, w.w, w.h, Math.floor(w.start.x), Math.floor(w.start.y));
    for (const e of w.enemies) {
      assert.ok(!w.solid(e.x, e.y));
      assert.ok(dist[Math.floor(e.y) * w.w + Math.floor(e.x)] < 32767);
    }
  }
});

test('cast hits the wall at the expected distance', () => {
  const w = new World(1, mulberry32(1));
  const out = {};
  const x = Math.floor(w.start.x) + 0.5;
  const y = Math.floor(w.start.y) + 0.5;
  w.cast(x, y, 1, 0, out);
  let cx = Math.floor(x);
  while (!w.solid(cx, y)) cx++;
  assert.ok(Math.abs(out.dist - (cx - x)) < 1e-9);
});

test('hitscan hits an enemy in front of the player and respects walls', () => {
  const w = new World(1, mulberry32(3));
  w.enemies = [];
  const x = w.start.x;
  const y = w.start.y;
  const out = {};
  w.cast(x, y, 1, 0, out);
  w.spawnEnemy('drone', x + Math.min(1.2, out.dist - 0.5), y);
  assert.ok(w.hitscan(x, y, 0).enemy);
  assert.equal(w.hitscan(x, y, Math.PI).enemy, null);
});

test('native input: hold/release is exact, taps latch one frame, multiple keys, focus loss', () => {
  const input = new Input(() => 0);
  input.setNative(true);
  // bit 0 = up (fwd), bit 3 = right (turnR), bit 10 = space (fire)
  input.setNativeMask(0b1);
  assert.ok(input.held('fwd'));
  input.endFrame();
  assert.ok(input.held('fwd'), 'stays held while the key is down, however long');
  input.setNativeMask(0b1 | 0b1000 | (1 << 10));
  assert.ok(input.held('fwd') && input.held('turnR') && input.held('fire'), 'simultaneous keys');
  input.setNativeMask(0b1000);
  input.endFrame();
  assert.ok(!input.held('fwd') && input.held('turnR'), 'release stops immediately');
  // A tap that is pressed and released between two frames still moves for one frame.
  input.setNativeMask(0);
  input.endFrame();
  input.setNativeMask(0b1);
  input.setNativeMask(0);
  assert.ok(input.held('fwd'));
  input.endFrame();
  assert.ok(!input.held('fwd'));
  input.setNativeMask(0b1);
  input.setFocused(false);
  assert.ok(!input.held('fwd'), 'ignored while the window is unfocused');
  input.setFocused(true);
  assert.ok(input.held('fwd'));
  input.setNative(false);
  assert.ok(!input.held('fwd'));
});

test('native input: non-movement keys still work through key events', () => {
  const input = new Input(() => 0);
  input.setNative(true);
  input.handleKey('', { name: 'return' });
  assert.ok(input.wasPressed('enter'));
  input.handleKey('2', { name: '2' });
  assert.ok(input.wasKey('2'));
  input.endFrame();
  input.handleKey('', { name: 'up' });
  assert.ok(input.held('fwd'), 'key event also registers as a one-frame tap');
  input.endFrame();
  assert.ok(!input.held('fwd'));
});

test('native key helper script embeds the key codes and parent pid', async () => {
  const { buildScript, maskToActions, KEYS } = await import('../src/keyhelper.js');
  const s = buildScript(KEYS, 4242);
  assert.ok(s.includes('0x26') === false && s.includes('38,40,37,39,87'));
  assert.ok(s.includes('Get-Process -Id 4242'));
  assert.deepEqual([...maskToActions(0b100000000001)].sort(), ['fire', 'fwd']);
});

test('input: taps count as held briefly, repeats extend, opposite cancels', () => {
  let t = 0;
  const input = new Input(() => t);
  input.handleKey('w', { name: 'w' });
  assert.ok(input.held('fwd'));
  t = 0.1;
  assert.ok(input.held('fwd'));
  t = 0.3;
  assert.ok(!input.held('fwd'));
  input.handleKey('', { name: 'up' });
  input.handleKey('', { name: 'down' });
  assert.ok(!input.held('fwd') && input.held('back'));
  input.handleKey('\x03', { name: 'c', ctrl: true });
  assert.ok(input.wasKey('ctrl-c'));
});

test('title -> play -> frames render without throwing, output is valid', () => {
  const ctx = makeGame();
  step(ctx);
  assert.equal(ctx.game.state, 'title');
  let frame = ctx.screen.present();
  assert.ok(frame.length > 0);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  assert.equal(ctx.game.state, 'play');
  for (let i = 0; i < 300; i++) {
    if (i % 3 === 0) ctx.input.handleKey('', { name: i % 90 < 45 ? 'up' : 'right' });
    if (i % 5 === 0) ctx.input.handleKey('', { name: 'space' });
    step(ctx);
    const s = ctx.screen.present();
    assert.equal(typeof s, 'string');
  }
  assert.ok(ctx.game.player.hp > 0 || ctx.game.state === 'dead');
});

test('shooting kills an enemy, scores, and opens the portal when all are dead', () => {
  const ctx = makeGame(7);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  const g = ctx.game;
  g.world.enemies = [];
  const p = g.player;
  const out = {};
  g.world.cast(p.x, p.y, Math.cos(p.a), Math.sin(p.a), out);
  g.world.spawnEnemy('drone', p.x + Math.cos(p.a) * Math.min(2, out.dist - 0.6), p.y + Math.sin(p.a) * Math.min(2, out.dist - 0.6));
  g.world.enemies[0].alerted = false;
  g.world.enemies[0].def = { ...g.world.enemies[0].def, speed: 0, melee: 0 };
  for (let i = 0; i < 90 && !g.world.exit.open; i++) {
    ctx.input.handleKey('', { name: 'space' });
    step(ctx);
  }
  assert.ok(g.score >= 100, 'score should increase');
  assert.ok(g.world.exit.open, 'portal should open');
});

test('ranged weapons consume ammo; empty falls back to blaster', () => {
  const ctx = makeGame(9);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  const g = ctx.game;
  g.player.owned.add('shotgun');
  g.player.ammo.shells = 1;
  ctx.input.handleKey('2', { name: '2' });
  step(ctx);
  assert.equal(g.player.weapon, 'shotgun');
  g.tryFire();
  assert.equal(g.player.ammo.shells, 0);
  g.player.cool = 0;
  g.tryFire();
  assert.equal(g.player.weapon, 'pistol');
});

test('player dies, high score logic and restart work', () => {
  const ctx = makeGame(11);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  const g = ctx.game;
  g.score = 1234;
  g.damagePlayer(500);
  assert.equal(g.state, 'dead');
  assert.equal(g.high, 1234);
  for (let i = 0; i < 40; i++) step(ctx);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  assert.equal(g.state, 'play');
  assert.equal(g.player.hp, 100);
});

test('long soak: auto-play across levels never throws and keeps the player in bounds', () => {
  const ctx = makeGame(5, 80, 24);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  const g = ctx.game;
  g.player.autofire = true;
  for (let i = 0; i < 2500; i++) {
    g.player.hp = 100;
    if (i % 4 === 0) ctx.input.handleKey('', { name: ['up', 'left', 'up', 'right', 'a'][(i >> 2) % 5] });
    if (g.state === 'clear') ctx.input.handleKey('', { name: 'return' });
    step(ctx);
    ctx.screen.present();
    assert.ok(!g.world.solid(g.player.x, g.player.y), 'player inside wall');
  }
});

test('every glyph mode renders, G cycles modes, and glyphs match the mode', () => {
  const allowed = {
    half: /^[\u2580 ]$/,
    quad: /^[\u2580-\u259f ]$/,
    braille: /^[\u2800-\u28ff ]$/,
  };
  const ctx = makeGame(21, 90, 26);
  ctx.input.handleKey('', { name: 'return' });
  step(ctx);
  const seen = [];
  for (let i = 0; i < 3; i++) {
    ctx.input.handleKey('g', { name: 'g' });
    step(ctx);
    const mode = ctx.screen.glyphMode;
    seen.push(mode);
    assert.equal(ctx.screen.pw, 90 * ctx.screen.sx);
    assert.equal(ctx.screen.ph, 26 * ctx.screen.sy);
    for (let k = 0; k < 5; k++) step(ctx);
    ctx.screen.buildCell(10, 10);
    assert.ok(ctx.screen.present().length > 0);
    for (let x = 0; x < 90; x += 7) {
      ctx.screen.buildCell(x, 5);
      const ch = ctx.screen.cCh;
      assert.ok(ch.length === 1);
      if (!ctx.screen.ovCh[5 * 90 + x]) assert.match(ch, allowed[mode]);
    }
  }
  assert.deepEqual(new Set(seen), new Set(['half', 'quad', 'braille']));
});

test('256-colour mode emits 48;5 sequences', () => {
  const screen = new Screen(10, 4, '256');
  screen.fillRect(0, 0, 10, 8, 0xff8000);
  const s = screen.present();
  assert.ok(s.includes('48;5;') && !s.includes('48;2;'));
});

test('present only re-emits changed cells', () => {
  const screen = new Screen(10, 4, 'truecolor');
  screen.fillRect(0, 0, 10, 8, 0x336699);
  assert.ok(screen.present().length > 0);
  assert.equal(screen.present(), '');
  screen.setPx(0, 0, 0xffffff);
  assert.ok(screen.present().length > 0);
});
