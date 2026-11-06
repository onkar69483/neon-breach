import { shade, mix } from './util.js';

const C = (r, g, b) => (r << 16) | (g << 8) | b;

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'BLASTER', key: '1', cd: 0.28, dmg: 16, pellets: 1, spread: 0.008, ammo: null, noise: 9 },
  shotgun: { id: 'shotgun', name: 'SCATTER', key: '2', cd: 0.85, dmg: 9, pellets: 9, spread: 0.1, ammo: 'shells', noise: 12 },
  plasma: { id: 'plasma', name: 'PLASMA', key: '3', cd: 0.11, dmg: 13, pellets: 1, spread: 0.02, ammo: 'cells', noise: 10, projectile: true },
};
export const WEAPON_ORDER = ['pistol', 'shotgun', 'plasma'];

// Draws the first-person weapon. Coordinates are in "gun units" (1 unit = ph/48 pixels), x centred, y up from the bottom.
export function drawWeapon(scr, weapon, t) {
  const u = scr.ph / 68;
  const ux = (u * 1.6) / scr.pa;
  const cx = scr.pw / 2 + t.swayX * ux;
  const base = scr.ph + (t.swayY + t.kick * 5) * u;
  const R = (x, y, w, h, c) => scr.fillRect(cx + x * ux, base - (y + h) * u, w * ux, h * u, c);
  const lit = (c) => (t.flash > 0 ? shade(c, 1.15) : c);
  const mz = (y, r, c) => muzzle(scr, cx, base - y * u, (r * u * (t.flash / 0.08 + 0.5)) / scr.pa, r * u * (t.flash / 0.08 + 0.5), c);

  if (weapon === 'pistol') {
    R(-2.5, 14, 5, 12, lit(C(105, 110, 125)));
    R(-1.5, 14, 1.5, 12, lit(C(165, 172, 190)));
    R(-5, 6, 10, 9, lit(C(70, 75, 90)));
    R(-5, 13, 10, 1.2, lit(C(130, 135, 150)));
    R(-3.5, 0, 7, 7, lit(C(52, 42, 40)));
    R(-4, 9.5, 8, 1, C(0, 230, 255));
    if (t.flash > 0) mz(28, 3.5, C(255, 200, 90));
  } else if (weapon === 'shotgun') {
    R(-5.5, 14, 4.5, 20, lit(C(95, 100, 112)));
    R(1, 14, 4.5, 20, lit(C(85, 90, 102)));
    R(-4.7, 14, 1.2, 20, lit(C(160, 166, 182)));
    R(-7, 3, 14, 12, lit(C(60, 64, 78)));
    R(-6, 16, 12, 3.5, lit(C(125, 78, 40)));
    R(-3, 0, 6, 4, lit(C(105, 66, 34)));
    R(-6, 10, 12, 1, C(255, 60, 120));
    if (t.flash > 0) mz(36, 5.5, C(255, 150, 60));
  } else {
    const pulse = 0.65 + 0.35 * Math.sin(t.time * 8);
    R(-6, 3, 12, 15, lit(C(55, 62, 88)));
    R(-7.5, 8, 2, 10, lit(C(40, 46, 70)));
    R(5.5, 8, 2, 10, lit(C(40, 46, 70)));
    R(-3, 18, 6, 11, lit(C(75, 82, 112)));
    R(-2, 19, 4, 9, shade(C(60, 235, 255), 0.6 + pulse * 0.6));
    R(-4, 0, 8, 4, lit(C(40, 44, 62)));
    R(-5, 12, 10, 1, shade(C(60, 235, 255), pulse));
    if (t.flash > 0) mz(31, 3.5, C(60, 200, 255));
  }
}

// Soft glowing ellipse (rx, ry in pixels).
function muzzle(scr, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const k = 1 - d;
      scr.setPx(x, y, mix(c, 0xffffff, k * k * 0.7));
    }
  }
}

export function drawCrosshair(scr, onTarget) {
  const col = onTarget ? 0xff3030 : 0x60ff90;
  const cx = Math.floor(scr.cols / 2);
  const cy = Math.floor(scr.rows / 2);
  scr.setCell(cx, cy, onTarget ? '\u2573' : '+', col);
}

export function drawMinimap(scr, world, player) {
  const R = 8;
  // One map tile is 2 columns wide and 1 row tall, which is square on screen.
  const tw = 2 * scr.sx;
  const th = scr.sy;
  const W = (R * 2 + 1) * tw;
  const H = (R * 2 + 1) * th;
  const ox = scr.pw - W - 2 * scr.sx;
  const oy = scr.sy;
  scr.dimRect(ox - tw / 2, oy - th / 2, W + tw, H + th, 0.35);
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const mx = px + dx;
      const my = py + dy;
      if (mx < 0 || my < 0 || mx >= world.w || my >= world.h) continue;
      if (!world.seen[my * world.w + mx]) continue;
      const wall = world.cells[my * world.w + mx];
      scr.fillRect(ox + (dx + R) * tw, oy + (dy + R) * th, tw, th, wall ? C(140, 150, 175) : C(34, 40, 60));
    }
  }
  // sz is in half-tiles.
  const dot = (x, y, c, sz = 2) => {
    const mx = (x - player.x) * tw + R * tw + tw / 2;
    const my = (y - player.y) * th + R * th + th / 2;
    if (mx < 0 || my < 0 || mx >= W || my >= H) return;
    const w = (sz * tw) / 2;
    const h = (sz * th) / 2;
    scr.fillRect(ox + mx - w / 2, oy + my - h / 2, w, h, c);
  };
  for (const p of world.pickups) dot(p.x, p.y, C(80, 255, 120), 1);
  const blink = Math.floor(world.time * 3) % 2 === 0;
  dot(world.exit.x, world.exit.y, world.exit.open ? (blink ? C(80, 255, 255) : C(255, 60, 220)) : C(150, 50, 70), 3);
  for (const e of world.enemies) if (!e.dead) dot(e.x, e.y, C(255, 50, 60), 2);
  dot(player.x, player.y, C(255, 255, 255), 2);
  dot(player.x + Math.cos(player.a) * 1.2, player.y + Math.sin(player.a) * 1.2, C(255, 255, 120), 1);
}

function bar(value, max, width) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

export function drawStatusBar(scr, g) {
  const p = g.player;
  const rows = scr.rows;
  scr.dimRect(0, (rows - 2) * scr.sy, scr.pw, 2 * scr.sy, 0.28);
  const hpCol = p.hp > 60 ? 0x50ff80 : p.hp > 30 ? 0xffd040 : 0xff4050;
  scr.text(1, rows - 2, 'HEALTH', 0xa0a8c0);
  scr.text(8, rows - 2, bar(p.hp, 100, 16), hpCol);
  scr.text(25, rows - 2, String(Math.ceil(p.hp)).padStart(3, ' '), hpCol);

  const w = WEAPONS[p.weapon];
  const ammo = w.ammo ? String(p.ammo[w.ammo]).padStart(3, '0') : ' \u221e ';
  scr.text(31, rows - 2, w.name, 0xffffff);
  scr.text(39, rows - 2, w.ammo ? `${w.ammo.toUpperCase()} ${ammo}` : 'ENERGY \u221e', w.ammo ? 0xffd070 : 0x60e0ff);

  let x = 1;
  for (const id of WEAPON_ORDER) {
    const wp = WEAPONS[id];
    const owned = p.owned.has(id);
    const label = `[${wp.key}]${wp.name}`;
    scr.text(x, rows - 1, label, id === p.weapon ? 0x60ffa0 : owned ? 0x9098b0 : 0x464b5c);
    x += label.length + 2;
  }
  const info = `LEVEL ${g.level}   SCORE ${String(g.score).padStart(6, '0')}   FOES ${g.world.aliveEnemies()}/${g.world.totalEnemies}${p.autofire ? '   AUTOFIRE' : ''}`;
  scr.text(scr.cols - info.length - 1, rows - 1, info, 0xc0c8e0);
}

const GLYPHS = {
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #'],
  E: ['#####', '#    ', '#### ', '#    ', '#####'],
  O: [' ### ', '#   #', '#   #', '#   #', ' ### '],
  B: ['#### ', '#   #', '#### ', '#   #', '#### '],
  R: ['#### ', '#   #', '#### ', '#  # ', '#   #'],
  A: [' ### ', '#   #', '#####', '#   #', '#   #'],
  C: [' ####', '#    ', '#    ', '#    ', ' ####'],
  H: ['#   #', '#   #', '#####', '#   #', '#   #'],
  ' ': ['   ', '   ', '   ', '   ', '   '],
};

export function drawLogo(scr, y, text, time) {
  const rows = ['', '', '', '', ''];
  for (const ch of text) {
    const g = GLYPHS[ch];
    for (let i = 0; i < 5; i++) rows[i] += g[i] + ' ';
  }
  const width = rows[0].length;
  const x0 = Math.floor((scr.cols - width) / 2);
  scr.dimRect((x0 - 2) * scr.sx, y * scr.sy - scr.sy / 2, (width + 4) * scr.sx, 6 * scr.sy, 0.35);
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < width; i++) {
      if (rows[r][i] !== '#') continue;
      const t = (i / width + time * 0.15) % 1;
      const c = mix(C(40, 230, 255), C(255, 60, 200), 0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      scr.setCell(x0 + i, y + r, '\u2588', c);
    }
  }
}

export function applyScreenEffects(scr, g) {
  const { pw, ph, px } = scr;
  const hurt = g.hurt;
  const pick = g.pickFlash;
  const fade = g.fade;
  if (hurt <= 0 && pick <= 0 && fade <= 0) return;
  for (let y = 0; y < ph; y++) {
    const ny = (y / ph - 0.5) * 2;
    for (let x = 0; x < pw; x++) {
      const nx = (x / pw - 0.5) * 2;
      const i = (y * pw + x) * 3;
      if (hurt > 0) {
        const edge = Math.min(1, 0.35 + (nx * nx + ny * ny) * 0.6) * hurt;
        px[i] += (255 - px[i]) * edge * 0.85;
        px[i + 1] *= 1 - edge * 0.8;
        px[i + 2] *= 1 - edge * 0.8;
      }
      if (pick > 0) {
        px[i] += (120 - px[i]) * pick * 0.25;
        px[i + 1] += (255 - px[i + 1]) * pick * 0.25;
        px[i + 2] += (160 - px[i + 2]) * pick * 0.25;
      }
      if (fade > 0) {
        px[i] *= 1 - fade;
        px[i + 1] *= 1 - fade;
        px[i + 2] *= 1 - fade;
      }
    }
  }
}
