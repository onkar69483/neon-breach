import { World } from './world.js';
import { renderScene } from './raycaster.js';
import {
  WEAPONS, WEAPON_ORDER, drawWeapon, drawCrosshair, drawMinimap, drawStatusBar, drawLogo, applyScreenEffects,
} from './hud.js';
import { mulberry32 } from './util.js';
import { GLYPH_MODES } from './screen.js';

const MOVE_SPEED = 3.4;
const TURN_SPEED = 2.7;
const PLAYER_R = 0.22;
const MAX_AMMO = { shells: 40, cells: 150 };

export class Game {
  constructor({ screen, input, seed = Date.now() & 0xffffff, storage = null }) {
    this.screen = screen;
    this.input = input;
    this.seed = seed;
    this.storage = storage;
    this.high = storage ? storage.load() : 0;
    this.state = 'title';
    this.time = 0;
    this.quit = false;
    this.showMap = true;
    this.message = { text: '', t: 0 };
    this.hurt = 0;
    this.pickFlash = 0;
    this.fade = 0;
    this.shake = 0;
    this.seenTimer = 0;
    this.demo = new World(1, mulberry32(seed ^ 0x5bd1e995));
    this.resetPlayer();
    this.level = 1;
    this.score = 0;
    this.world = this.demo;
  }

  resetPlayer() {
    this.player = {
      x: 0, y: 0, a: 0, vF: 0, vS: 0, vT: 0, hp: 100, weapon: 'pistol',
      owned: new Set(['pistol']), ammo: { shells: 0, cells: 0 },
      cool: 0, flash: 0, kick: 0, bob: 0, autofire: false, kills: 0,
    };
  }

  startRun() {
    this.resetPlayer();
    this.score = 0;
    this.runKills = 0;
    this.loadLevel(1);
    this.state = 'play';
  }

  loadLevel(n) {
    this.level = n;
    this.world = new World(n, mulberry32(this.seed + n * 7919));
    this.world.placeWeapons(this.player.owned);
    const p = this.player;
    p.x = this.world.start.x;
    p.y = this.world.start.y;
    let best = -1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = this.world.cast(p.x, p.y, Math.cos(a), Math.sin(a), {}, 30);
      if (d > best) { best = d; p.a = a; }
    }
    p.vF = p.vS = p.vT = 0;
    this.fade = 1;
    this.levelStart = this.time;
    this.say(`LEVEL ${n} - ELIMINATE ALL HOSTILES`, 3.5);
  }

  say(text, secs = 2.5) {
    this.message = { text, t: secs };
  }

  damagePlayer(n) {
    const p = this.player;
    if (p.hp <= 0 || this.state !== 'play') return;
    p.hp -= n;
    this.hurt = Math.min(1, this.hurt + 0.45 + n / 50);
    this.shake = 0.35;
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dead';
      this.deadAt = this.time;
      if (this.score > this.high) {
        this.high = this.score;
        if (this.storage) this.storage.save(this.high);
      }
    }
  }

  onKill(e) {
    this.score += e.def.score;
    this.runKills = (this.runKills || 0) + 1;
    if (this.world.aliveEnemies() === 0) {
      this.world.exit.open = true;
      this.say('ALL HOSTILES DOWN - PORTAL OPEN. REACH THE EXIT!', 4);
    }
  }

  setWeapon(id) {
    const p = this.player;
    if (!p.owned.has(id) || p.weapon === id) return;
    p.weapon = id;
    p.cool = Math.max(p.cool, 0.15);
  }

  cycleWeapon() {
    const p = this.player;
    const owned = WEAPON_ORDER.filter((w) => p.owned.has(w));
    this.setWeapon(owned[(owned.indexOf(p.weapon) + 1) % owned.length]);
  }

  tryFire() {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    const world = this.world;
    if (w.ammo) {
      if (p.ammo[w.ammo] <= 0) {
        this.say(`OUT OF ${w.ammo.toUpperCase()}`, 1.2);
        p.weapon = 'pistol';
        p.cool = 0.3;
        return;
      }
      p.ammo[w.ammo]--;
    }
    p.cool = w.cd;
    p.flash = 0.08;
    p.kick = 1;
    world.alertNear(p.x, p.y, w.noise);
    if (w.projectile) {
      const a = p.a + (world.rng() - 0.5) * w.spread * 2;
      world.fireProjectile('player', p.x + Math.cos(a) * 0.3, p.y + Math.sin(a) * 0.3, a, 15, w.dmg, 0x40e0ff, 0.12);
      return;
    }
    for (let i = 0; i < w.pellets; i++) {
      const a = p.a + (world.rng() - 0.5) * 2 * w.spread;
      const hit = world.hitscan(p.x, p.y, a, 40);
      if (hit.enemy) {
        const falloff = w.pellets > 1 ? 1 - Math.min(0.7, hit.dist / 14) : 1;
        world.damageEnemy(hit.enemy, w.dmg * falloff, this);
      } else {
        world.burst(hit.hx - Math.cos(a) * 0.05, hit.hy - Math.sin(a) * 0.05, 0.5, 0xffd060, 2, 1.5, 0.25);
      }
    }
  }

  collectPickups() {
    const p = this.player;
    const world = this.world;
    world.pickups = world.pickups.filter((pk) => {
      if (Math.hypot(pk.x - p.x, pk.y - p.y) > 0.6) return true;
      switch (pk.kind) {
        case 'health':
          if (p.hp >= 100) return true;
          p.hp = Math.min(100, p.hp + 30);
          break;
        case 'shells':
          p.ammo.shells = Math.min(MAX_AMMO.shells, p.ammo.shells + 8);
          break;
        case 'cells':
          p.ammo.cells = Math.min(MAX_AMMO.cells, p.ammo.cells + 30);
          break;
        case 'shotgun':
          p.owned.add('shotgun');
          p.ammo.shells = Math.min(MAX_AMMO.shells, p.ammo.shells + 8);
          p.weapon = 'shotgun';
          break;
        case 'plasma':
          p.owned.add('plasma');
          p.ammo.cells = Math.min(MAX_AMMO.cells, p.ammo.cells + 30);
          p.weapon = 'plasma';
          break;
      }
      this.pickFlash = 0.6;
      this.say(world.pickupMessage(pk.kind), 1.8);
      return false;
    });
  }

  markSeen() {
    const { world, player: p } = this;
    const out = {};
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = Math.min(world.cast(p.x, p.y, dx, dy, out, 14), 14);
      for (let t = 0; t < d; t += 0.4) world.seen[Math.floor(p.y + dy * t) * world.w + Math.floor(p.x + dx * t)] = 1;
      if (d < 14) world.seen[out.my * world.w + out.mx] = 1;
    }
  }

  update(dt) {
    this.time += dt;
    const inp = this.input;
    this.message.t -= dt;
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    this.pickFlash = Math.max(0, this.pickFlash - dt * 2);
    this.fade = Math.max(0, this.fade - dt * 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.5);

    if (inp.wasKey('ctrl-c')) this.quit = true;
    if (inp.wasKey('g')) {
      const modes = Object.keys(GLYPH_MODES);
      const next = modes[(modes.indexOf(this.screen.glyphMode) + 1) % modes.length];
      this.screen.setGlyphMode(next);
      this.say(`RENDER MODE: ${next.toUpperCase()}`, 1.5);
    }

    switch (this.state) {
      case 'title':
        if (inp.wasPressed('enter')) this.startRun();
        else if (inp.wasKey('q')) this.quit = true;
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'pause':
        if (inp.wasPressed('pause')) this.state = 'play';
        else if (inp.wasKey('q')) this.state = 'title';
        break;
      case 'dead':
        this.world.update(dt, this.player, this);
        if (this.time - this.deadAt > 0.8) {
          if (inp.wasPressed('enter')) this.startRun();
          else if (inp.wasKey('q')) this.state = 'title';
        }
        break;
      case 'clear':
        if (inp.wasPressed('enter')) {
          const p = this.player;
          p.hp = Math.min(100, p.hp + 25);
          p.ammo.shells = Math.min(MAX_AMMO.shells, p.ammo.shells + 4);
          p.ammo.cells = Math.min(MAX_AMMO.cells, p.ammo.cells + 15);
          this.loadLevel(this.level + 1);
          this.state = 'play';
        }
        break;
    }
  }

  updatePlay(dt) {
    const inp = this.input;
    const p = this.player;
    const world = this.world;

    if (inp.wasPressed('pause')) { this.state = 'pause'; return; }
    if (inp.wasKey('1')) this.setWeapon('pistol');
    if (inp.wasKey('2')) this.setWeapon('shotgun');
    if (inp.wasKey('3')) this.setWeapon('plasma');
    if (inp.wasKey('tab')) this.cycleWeapon();
    if (inp.wasKey('f')) { p.autofire = !p.autofire; this.say(p.autofire ? 'AUTOFIRE ON' : 'AUTOFIRE OFF', 1.2); }
    if (inp.wasKey('m')) this.showMap = !this.showMap;

    const axis = (pos, neg) => (inp.held(pos) ? 1 : 0) - (inp.held(neg) ? 1 : 0);
    const ka = 1 - Math.exp(-dt * 16);
    p.vF += (axis('fwd', 'back') - p.vF) * ka;
    p.vS += (axis('strafeR', 'strafeL') - p.vS) * ka;
    p.vT += (axis('turnR', 'turnL') - p.vT) * (1 - Math.exp(-dt * 20));
    p.a += p.vT * TURN_SPEED * dt;

    const dx = Math.cos(p.a);
    const dy = Math.sin(p.a);
    let mx = dx * p.vF - dy * p.vS;
    let my = dy * p.vF + dx * p.vS;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    world.tryMove(p, mx * MOVE_SPEED * dt, my * MOVE_SPEED * dt, PLAYER_R);
    const speed = Math.min(1, ml);
    p.bob += dt * (5 + speed * 6) * (speed > 0.05 ? 1 : 0);

    p.cool -= dt;
    p.flash = Math.max(0, p.flash - dt);
    p.kick = Math.max(0, p.kick - dt * 7);

    const aim = world.hitscan(p.x, p.y, p.a, 30, 0.1);
    this.onTarget = !!aim.enemy;
    const wantFire = inp.held('fire') || (p.autofire && this.onTarget);
    if (wantFire && p.cool <= 0) this.tryFire();

    world.update(dt, p, this);
    if (this.state !== 'play') return;
    this.collectPickups();

    this.seenTimer -= dt;
    if (this.seenTimer <= 0) { this.seenTimer = 0.1; this.markSeen(); }

    if (world.exit.open && Math.hypot(world.exit.x - p.x, world.exit.y - p.y) < 0.8) {
      const bonus = 500 * this.level + Math.round(p.hp) * 5;
      this.levelBonus = bonus;
      this.score += bonus;
      if (this.score > this.high) {
        this.high = this.score;
        if (this.storage) this.storage.save(this.high);
      }
      this.state = 'clear';
    }
  }

  panel(lines, color = 0xffffff, dim = 0.45) {
    const s = this.screen;
    const w = Math.max(...lines.map((l) => l.text.length)) + 6;
    const h = lines.length + 2;
    const x0 = Math.floor((s.cols - w) / 2);
    const y0 = Math.floor((s.rows - h) / 2);
    s.dimRect(x0 * s.sx, y0 * s.sy, w * s.sx, h * s.sy, dim);
    lines.forEach((l, i) => s.textCenter(y0 + 1 + i, l.text, l.color || color));
  }

  render() {
    const s = this.screen;
    s.clearOverlay();
    const p = this.player;
    const time = this.time;

    if (this.state === 'title') {
      const room = this.demo.rooms[0];
      const cam = { x: room.cx + 0.5, y: room.cy + 0.5, a: time * 0.35, horizon: s.ph / 2, flash: 0 };
      renderScene(s, this.demo, cam, time);
      s.dimRect(0, 0, s.pw, s.ph, 0.7);
      this.renderTitle();
      return;
    }

    const shake = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 4 : 0;
    const horizon = s.ph / 2 + Math.sin(p.bob * 2) * 0.8 * Math.min(1, Math.hypot(p.vF, p.vS)) + shake;
    const cam = { x: p.x, y: p.y, a: p.a, horizon, flash: p.flash > 0 ? p.flash / 0.08 : 0 };
    renderScene(s, this.world, cam, time);

    if (this.state !== 'dead') {
      const mv = Math.min(1, Math.hypot(p.vF, p.vS));
      drawWeapon(s, p.weapon, {
        swayX: Math.sin(p.bob) * 2.2 * mv,
        swayY: Math.abs(Math.cos(p.bob)) * 1.4 * mv,
        kick: p.kick, flash: p.flash, time,
      });
    }
    applyScreenEffects(s, this);
    if (this.showMap) drawMinimap(s, this.world, p);
    if (this.state === 'play' || this.state === 'pause') drawCrosshair(s, this.onTarget);
    drawStatusBar(s, this);

    if (this.message.t > 0 && this.state === 'play') {
      s.textCenter(2, ` ${this.message.text} `, 0xfff0a0);
    }

    if (this.state === 'pause') {
      this.panel([
        { text: 'PAUSED', color: 0x60e0ff },
        { text: '' },
        { text: 'ESC / P  resume' },
        { text: 'Q  quit to title' },
      ]);
    } else if (this.state === 'dead') {
      s.dimRect(0, 0, s.pw, s.ph, 0.6);
      const ready = this.time - this.deadAt > 0.8;
      this.panel([
        { text: 'YOU DIED', color: 0xff4050 },
        { text: '' },
        { text: `LEVEL ${this.level}   SCORE ${this.score}` },
        { text: `BEST ${this.high}`, color: 0xffd070 },
        { text: '' },
        { text: ready ? 'ENTER  try again     Q  title' : '', color: 0xa0a8c0 },
      ], 0xffffff, 0.3);
    } else if (this.state === 'clear') {
      this.panel([
        { text: `LEVEL ${this.level} CLEARED`, color: 0x60ffa0 },
        { text: '' },
        { text: `BONUS +${this.levelBonus}` },
        { text: `SCORE ${this.score}   BEST ${this.high}` },
        { text: '' },
        { text: 'ENTER  next level', color: 0xa0a8c0 },
      ]);
    }
  }

  renderTitle() {
    const s = this.screen;
    const top = Math.max(1, Math.floor(s.rows / 2) - 9);
    drawLogo(s, top, 'NEON BREACH', this.time);
    s.textCenter(top + 6, 'A TERMINAL FIRST-PERSON SHOOTER', 0xa0a8c0);
    if (Math.floor(this.time * 2) % 2 === 0) s.textCenter(top + 8, '[ PRESS ENTER TO START ]', 0xfff0a0);
    const help = [
      'W/S or UP/DOWN  move      A/D  strafe      LEFT/RIGHT or Q/E  turn',
      'SPACE or X  fire      1 2 3 / TAB  weapons      F  autofire      M  map',
      'P or ESC  pause      G  sharpness mode      CTRL+C  quit',
    ];
    help.forEach((l, i) => s.textCenter(top + 11 + i, l, 0x8890b0));
    if (this.message.t > 0) s.textCenter(top + 16, this.message.text, 0xfff0a0);
    if (this.high > 0) s.textCenter(top + 15, `BEST SCORE ${this.high}`, 0xffd070);
  }
}
