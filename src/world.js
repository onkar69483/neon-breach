import { generateLevel, bfs } from './level.js';

export const ENEMY_TYPES = {
  drone: { name: 'DRONE', hp: 32, speed: 2.1, r: 0.3, size: 0.85, melee: 9, cd: 0.9, score: 100, sight: 12 },
  sentinel: {
    name: 'SENTINEL', hp: 48, speed: 1.3, r: 0.34, size: 0.8, ranged: true, dmg: 10, cd: 1.7,
    pspeed: 5.5, score: 200, sight: 14, hover: 0.22,
  },
  titan: {
    name: 'TITAN', hp: 150, speed: 1.5, r: 0.42, size: 1.25, melee: 24, cd: 1.1, ranged: true,
    dmg: 16, pspeed: 4, pcd: 3, score: 500, sight: 14,
  },
};

const PICKUPS = {
  health: { msg: '+30 HEALTH' },
  shells: { msg: '+8 SHELLS' },
  cells: { msg: '+30 CELLS' },
  shotgun: { msg: 'SCATTER GUN ACQUIRED  [2]' },
  plasma: { msg: 'PLASMA RIFLE ACQUIRED  [3]' },
};

export class World {
  constructor(level, rng) {
    const L = generateLevel(level, rng);
    this.level = level;
    this.rng = rng;
    this.w = L.w;
    this.h = L.h;
    this.cells = L.cells;
    this.rooms = L.rooms;
    this.start = L.start;
    this.exit = { x: L.exit.x, y: L.exit.y, open: false };
    this.enemies = [];
    this.pickups = [];
    this.projs = [];
    this.fx = [];
    this.seen = new Uint8Array(this.w * this.h);
    this.flow = new Int16Array(this.w * this.h);
    this.flowQueue = new Int32Array(this.w * this.h);
    this.flowTile = -1;
    this.scratch = {};
    this.time = 0;
    this.totalEnemies = 0;
    this.populate(L);
  }

  populate(L) {
    const rng = this.rng;
    const lvl = this.level;
    const count = Math.min(22, 4 + lvl * 2);
    const rooms = this.rooms.slice(1);
    for (let i = 0; i < count; i++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      const x = room.x + 0.5 + rng() * (room.w - 1);
      const y = room.y + 0.5 + rng() * (room.h - 1);
      if (this.solid(x, y) || Math.hypot(x - this.start.x, y - this.start.y) < 7) continue;
      const roll = rng();
      let type = 'drone';
      if (lvl >= 3 && roll < 0.14 + lvl * 0.01) type = 'titan';
      else if (lvl >= 2 && roll < 0.5) type = 'sentinel';
      this.spawnEnemy(type, x, y);
    }
    if (this.enemies.length === 0) {
      const room = rooms[rooms.length - 1];
      this.spawnEnemy('drone', room.cx + 0.5, room.cy + 0.5);
    }
    this.totalEnemies = this.enemies.length;

    for (const room of rooms) {
      const roll = rng();
      const kind = roll < 0.4 ? 'health' : roll < 0.7 ? 'shells' : roll < 0.9 ? 'cells' : null;
      if (kind) this.addPickup(kind, room.x + 1 + rng() * (room.w - 2), room.y + 1 + rng() * (room.h - 2));
    }
    if (rooms.length > 0) {
      const r0 = rooms[0];
      this.addPickup('health', r0.x + 1 + rng() * (r0.w - 2), r0.y + 1 + rng() * (r0.h - 2));
    }
    this.guaranteed = { shotgun: lvl >= 1, plasma: lvl >= 2 };
  }

  placeWeapons(owned) {
    const rooms = this.rooms.slice(1);
    const rng = this.rng;
    for (const kind of ['shotgun', 'plasma']) {
      if (!this.guaranteed[kind] || owned.has(kind)) continue;
      const room = rooms[Math.floor(rng() * rooms.length)];
      this.addPickup(kind, room.cx + 0.5, room.cy + 0.5);
    }
  }

  addPickup(kind, x, y) {
    if (this.solid(x, y)) return;
    this.pickups.push({ kind, x, y, t: this.rng() * 6 });
  }

  spawnEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    const scale = 1 + (this.level - 1) * 0.08;
    this.enemies.push({
      type, def, x, y, hp: def.hp * scale, maxHp: def.hp * scale,
      alerted: false, cool: 0.5 + this.rng(), hurt: 0, dead: false, deadT: 0,
      phase: this.rng() * 6.28, strafe: this.rng() < 0.5 ? -1 : 1, strafeT: 0, moving: false,
    });
  }

  solid(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return true;
    return this.cells[iy * this.w + ix] !== 0;
  }

  blocked(x, y, r) {
    return this.solid(x - r, y - r) || this.solid(x + r, y - r) || this.solid(x - r, y + r) || this.solid(x + r, y + r);
  }

  tryMove(e, dx, dy, r) {
    if (!this.blocked(e.x + dx, e.y, r)) e.x += dx;
    if (!this.blocked(e.x, e.y + dy, r)) e.y += dy;
  }

  // DDA grid traversal. (rdx, rdy) need not be normalised; out.dist is in units of the ray parameter.
  cast(ox, oy, rdx, rdy, out, maxDist = 64) {
    let mx = Math.floor(ox);
    let my = Math.floor(oy);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
    const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX, stepY, sideX, sideY;
    if (rdx < 0) { stepX = -1; sideX = (ox - mx) * ddx; } else { stepX = 1; sideX = (mx + 1 - ox) * ddx; }
    if (rdy < 0) { stepY = -1; sideY = (oy - my) * ddy; } else { stepY = 1; sideY = (my + 1 - oy) * ddy; }
    const { w, h, cells } = this;
    let side = 0;
    let t = 0;
    let type = 1;
    for (let i = 0; i < 160; i++) {
      if (sideX < sideY) { t = sideX; sideX += ddx; mx += stepX; side = 0; }
      else { t = sideY; sideY += ddy; my += stepY; side = 1; }
      if (mx < 0 || my < 0 || mx >= w || my >= h) { type = 1; break; }
      const c = cells[my * w + mx];
      if (c) { type = c; break; }
      if (t > maxDist) break;
    }
    out.dist = t;
    out.side = side;
    out.type = type;
    let wx = side === 0 ? oy + t * rdy : ox + t * rdx;
    out.wallX = wx - Math.floor(wx);
    out.mx = mx;
    out.my = my;
    return t;
  }

  los(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    this.cast(x0, y0, dx / d, dy / d, this.scratch, d + 1);
    return this.scratch.dist >= d - 0.05;
  }

  hitscan(ox, oy, angle, maxDist = 40, aimPad = 0) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const wall = this.cast(ox, oy, dx, dy, this.scratch, maxDist);
    let best = null;
    let bestT = wall;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.x - ox;
      const ey = e.y - oy;
      const t = ex * dx + ey * dy;
      if (t <= 0 || t > bestT) continue;
      const perp = Math.abs(ex * dy - ey * dx);
      if (perp < e.def.r + aimPad) {
        best = e;
        bestT = t;
      }
    }
    return { enemy: best, dist: bestT, wall, hx: ox + dx * bestT, hy: oy + dy * bestT };
  }

  updateFlow(px, py) {
    const tile = Math.floor(py) * this.w + Math.floor(px);
    if (tile === this.flowTile) return;
    this.flowTile = tile;
    bfs(this.cells, this.w, this.h, Math.floor(px), Math.floor(py), this.flow, this.flowQueue);
  }

  flowTarget(e) {
    const { w, flow } = this;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    let best = flow[cy * w + cx];
    let bx = -1;
    let by = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (this.solid(nx, ny)) continue;
        if (dx && dy && (this.solid(cx + dx, cy) || this.solid(cx, cy + dy))) continue;
        const v = flow[ny * w + nx];
        if (v < best) { best = v; bx = nx; by = ny; }
      }
    }
    return bx < 0 ? null : { x: bx + 0.5, y: by + 0.5 };
  }

  burst(x, y, z, color, n, speed = 2, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * 6.283;
      const s = (0.3 + this.rng()) * speed;
      this.fx.push({
        x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + this.rng() * 2,
        life: life * (0.6 + this.rng() * 0.6), max: life, color, size: 0.05 + this.rng() * 0.06,
      });
    }
  }

  alertNear(x, y, radius) {
    for (const e of this.enemies) {
      if (!e.dead && !e.alerted && Math.hypot(e.x - x, e.y - y) < radius) e.alerted = true;
    }
  }

  damageEnemy(e, dmg, game) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hurt = 0.18;
    e.alerted = true;
    this.burst(e.x, e.y, e.def.size * 0.5, 0xff3050, 3, 1.5, 0.35);
    if (e.hp <= 0) {
      e.dead = true;
      e.deadT = 0;
      this.burst(e.x, e.y, e.def.size * 0.5, 0xff8030, 14, 3, 0.7);
      game.onKill(e);
      if (this.rng() < 0.3) {
        const kinds = ['health', 'shells', 'cells'];
        this.addPickup(kinds[Math.floor(this.rng() * 3)], e.x, e.y);
      }
    }
  }

  fireProjectile(from, x, y, angle, speed, dmg, color, radius = 0.15) {
    this.projs.push({
      from, x, y, dx: Math.cos(angle), dy: Math.sin(angle), speed, dmg, color, r: radius, life: 4,
    });
  }

  aliveEnemies() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  update(dt, player, game) {
    this.time += dt;
    this.updateFlow(player.x, player.y);

    for (const e of this.enemies) this.updateEnemy(e, dt, player, game);
    this.enemies = this.enemies.filter((e) => !e.dead || e.deadT < 0.7);

    for (const p of this.projs) {
      p.life -= dt;
      const step = p.speed * dt;
      const nx = p.x + p.dx * step;
      const ny = p.y + p.dy * step;
      if (this.solid(nx, ny)) {
        p.life = 0;
        this.burst(p.x, p.y, 0.5, p.color, 6, 1.5, 0.3);
        if (p.from === 'player') this.splash(p.x, p.y, 0.9, p.dmg * 0.5, game);
        continue;
      }
      p.x = nx;
      p.y = ny;
      if (p.from === 'enemy') {
        if (Math.hypot(p.x - player.x, p.y - player.y) < 0.35) {
          p.life = 0;
          game.damagePlayer(p.dmg);
          this.burst(p.x, p.y, 0.5, p.color, 6, 1.5, 0.3);
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(p.x - e.x, p.y - e.y) < e.def.r + p.r) {
            p.life = 0;
            this.damageEnemy(e, p.dmg, game);
            this.burst(p.x, p.y, 0.5, 0x40e0ff, 8, 2, 0.35);
            this.splash(p.x, p.y, 0.9, p.dmg * 0.5, game, e);
            break;
          }
        }
      }
    }
    this.projs = this.projs.filter((p) => p.life > 0);

    for (const f of this.fx) {
      f.life -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      f.vz -= 6 * dt;
      if (f.z < 0) { f.z = 0; f.vz *= -0.3; f.vx *= 0.6; f.vy *= 0.6; }
    }
    this.fx = this.fx.filter((f) => f.life > 0);

    for (const pk of this.pickups) pk.t += dt;
  }

  splash(x, y, radius, dmg, game, skip) {
    for (const e of this.enemies) {
      if (e.dead || e === skip) continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) this.damageEnemy(e, dmg, game);
    }
  }

  updateEnemy(e, dt, player, game) {
    if (e.dead) { e.deadT += dt; return; }
    const def = e.def;
    e.hurt = Math.max(0, e.hurt - dt);
    e.cool -= dt;
    e.strafeT -= dt;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const sees = d < def.sight + 8 && this.los(e.x, e.y, player.x, player.y);
    if (!e.alerted && sees && d < def.sight) e.alerted = true;
    e.moving = false;
    if (!e.alerted) return;

    let mx = 0;
    let my = 0;
    const ux = dx / d;
    const uy = dy / d;
    if (def.ranged && def.type !== 'titan' && def.melee === undefined) {
      // Sentinels hold a firing distance and strafe.
      if (sees && d < 4.5) { mx = -ux; my = -uy; }
      else if (sees && d < 8) {
        if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = 0.8 + this.rng() * 1.2; }
        mx = -uy * e.strafe;
        my = ux * e.strafe;
      } else if (sees) { mx = ux; my = uy; }
    } else if (d > 0.8) {
      mx = ux;
      my = uy;
    }
    if (!sees && d > 0.8) {
      const t = this.flowTarget(e);
      if (t) {
        const tx = t.x - e.x;
        const ty = t.y - e.y;
        const tl = Math.hypot(tx, ty) || 1;
        mx = tx / tl;
        my = ty / tl;
      }
    }

    for (const o of this.enemies) {
      if (o === e || o.dead) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const od = Math.hypot(ox, oy);
      if (od < 0.7 && od > 1e-4) { mx += (ox / od) * 0.6; my += (oy / od) * 0.6; }
    }

    const ml = Math.hypot(mx, my);
    if (ml > 0.01) {
      const sp = def.speed * dt;
      this.tryMove(e, (mx / ml) * sp, (my / ml) * sp, def.r);
      e.moving = true;
    }

    if (e.cool > 0) return;
    if (def.melee && d < 0.95) {
      game.damagePlayer(def.melee);
      e.cool = def.cd;
    } else if (def.ranged && sees && d < 14) {
      const a = Math.atan2(dy, dx) + (this.rng() - 0.5) * 0.12;
      const color = e.type === 'titan' ? 0xff5020 : 0xd040ff;
      this.fireProjectile('enemy', e.x, e.y, a, def.pspeed, def.dmg, color);
      e.cool = (def.pcd || def.cd) + this.rng() * 0.6;
    }
  }

  pickupMessage(kind) {
    return PICKUPS[kind].msg;
  }
}

for (const [k, v] of Object.entries(ENEMY_TYPES)) v.type = k;
