import { WALL_TEXTURES, TEX } from './textures.js';
import { SAMPLERS } from './sprites.js';

export const PLANE_LEN = 0.9;
const scratch = {};
let zbuf = new Float32Array(0);

const light = (d, flash) => {
  const base = 1 / (1 + d * d * 0.025);
  return base + (flash > 0 ? (flash * 0.8) / (1 + d * 0.3) : 0);
};

// cam: { x, y, a, horizon, flash }
export function renderScene(scr, world, cam, time) {
  const { pw, ph, px } = scr;
  if (zbuf.length !== pw) zbuf = new Float32Array(pw);
  const dirX = Math.cos(cam.a);
  const dirY = Math.sin(cam.a);
  const planeX = -dirY * PLANE_LEN;
  const planeY = dirX * PLANE_LEN;
  const f = pw / (2 * PLANE_LEN);
  // Vertical focal length: corrects for sub-pixels that are not square in the chosen glyph mode.
  const fv = f * scr.pa;
  const horizon = cam.horizon;
  const flash = cam.flash || 0;

  // Floor and ceiling, one perspective row at a time.
  const rdx0 = dirX - planeX;
  const rdy0 = dirY - planeY;
  const rdxStep = (2 * planeX) / pw;
  const rdyStep = (2 * planeY) / pw;
  for (let y = 0; y < ph; y++) {
    const p = y - horizon;
    const isFloor = p > 0;
    const ap = Math.abs(p);
    let rowI = y * pw * 3;
    if (ap < 0.6) {
      for (let x = 0; x < pw; x++, rowI += 3) { px[rowI] = 0; px[rowI + 1] = 0; px[rowI + 2] = 0; }
      continue;
    }
    const rowDist = (0.5 * fv) / ap;
    const lt = light(rowDist, flash);
    const foot = Math.min(0.3, Math.max(rowDist / f, (rowDist * rowDist) / (0.5 * fv)));
    let fx = cam.x + rowDist * rdx0;
    let fy = cam.y + rowDist * rdy0;
    const sx = rowDist * rdxStep;
    const sy = rowDist * rdyStep;
    for (let x = 0; x < pw; x++, rowI += 3, fx += sx, fy += sy) {
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      const tx = fx - cx;
      const ty = fy - cy;
      let r, g, b, k = lt;
      if (isFloor) {
        if (((cx + cy) & 1) === 0) { r = 46; g = 50; b = 66; }
        else { r = 38; g = 42; b = 56; }
        // Anti-aliased neon grid line along tile borders.
        const e = tx < ty ? tx : ty;
        let cov = (0.045 + foot * 0.5 - e) / foot;
        if (cov > 0) {
          if (cov > 1) cov = 1;
          r += (30 - r) * cov;
          g += (150 - g) * cov;
          b += (190 - b) * cov;
          k = lt * (1 + 0.3 * cov);
        }
      } else {
        const lamp = ((cx + cy * 2) % 5 === 0) && tx > 0.25 && tx < 0.75 && ty > 0.25 && ty < 0.75;
        if (lamp) { r = 255; g = 245; b = 220; k = Math.min(1, lt * 2.2 + 0.25); }
        else if (tx < 0.03 || ty < 0.03) { r = 40; g = 44; b = 64; }
        else { r = 24; g = 26; b = 38; }
      }
      px[rowI] = r * k;
      px[rowI + 1] = g * k;
      px[rowI + 2] = b * k;
    }
  }

  // Walls, with bilinear texture filtering.
  for (let x = 0; x < pw; x++) {
    const camX = (2 * x) / pw - 1;
    const rdx = dirX + planeX * camX;
    const rdy = dirY + planeY * camX;
    world.cast(cam.x, cam.y, rdx, rdy, scratch);
    const dist = Math.max(scratch.dist, 0.05);
    zbuf[x] = dist;
    const lineH = fv / dist;
    const top = horizon - lineH / 2;
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(ph - 1, Math.floor(top + lineH));
    const tex = WALL_TEXTURES[(scratch.type - 1) & 3];
    let tu = scratch.wallX * TEX;
    if ((scratch.side === 0 && rdx > 0) || (scratch.side === 1 && rdy < 0)) tu = TEX - tu;
    tu -= 0.5;
    const tu0 = Math.floor(tu);
    const fu = tu - tu0;
    const xa = ((tu0 % TEX) + TEX) % TEX;
    const xb = (xa + 1) % TEX;
    const k = light(dist, flash) * (scratch.side === 1 ? 0.72 : 1);
    const stepT = TEX / lineH;
    let texPos = (y0 - top + 0.5) * stepT - 0.5;
    let i = (y0 * pw + x) * 3;
    for (let y = y0; y <= y1; y++, i += pw * 3, texPos += stepT) {
      let tv0 = Math.floor(texPos);
      const fvv = texPos - tv0;
      let ya = tv0 < 0 ? 0 : tv0 > TEX - 1 ? TEX - 1 : tv0;
      let yb = tv0 + 1 < 0 ? 0 : tv0 + 1 > TEX - 1 ? TEX - 1 : tv0 + 1;
      const a00 = (ya * TEX + xa) * 3;
      const a10 = (ya * TEX + xb) * 3;
      const a01 = (yb * TEX + xa) * 3;
      const a11 = (yb * TEX + xb) * 3;
      const w00 = (1 - fu) * (1 - fvv);
      const w10 = fu * (1 - fvv);
      const w01 = (1 - fu) * fvv;
      const w11 = fu * fvv;
      px[i] = (tex[a00] * w00 + tex[a10] * w10 + tex[a01] * w01 + tex[a11] * w11) * k;
      px[i + 1] = (tex[a00 + 1] * w00 + tex[a10 + 1] * w10 + tex[a01 + 1] * w01 + tex[a11 + 1] * w11) * k;
      px[i + 2] = (tex[a00 + 2] * w00 + tex[a10 + 2] * w10 + tex[a01 + 2] * w01 + tex[a11 + 2] * w11) * k;
    }
  }

  drawSprites(scr, world, cam, time, dirX, dirY, planeX, planeY, f, fv);
}

function collect(world, cam, items, time) {
  const add = (o) => {
    const dx = o.x - cam.x;
    const dy = o.y - cam.y;
    o.d2 = dx * dx + dy * dy;
    items.push(o);
  };
  const ex = world.exit;
  add({ x: ex.x, y: ex.y, size: 1.15, z: 0, scaleY: 1, sampler: SAMPLERS.portal, emissive: ex.open, ent: ex, hurt: 0, alpha: 1 });
  for (const p of world.pickups) {
    add({
      x: p.x, y: p.y, size: 0.38, z: 0.12 + Math.sin(p.t * 3) * 0.05, scaleY: 1,
      sampler: SAMPLERS.pickup, emissive: false, ent: p, hurt: 0, boost: 1.4,
    });
  }
  for (const e of world.enemies) {
    const def = e.def;
    let scaleY = 1;
    let hurt = e.hurt > 0 ? 0.7 : 0;
    if (e.dead) {
      scaleY = Math.max(0.05, 1 - e.deadT / 0.5);
      hurt = Math.min(1, e.deadT * 2);
    }
    add({
      x: e.x, y: e.y, size: def.size, z: def.hover || 0, scaleY, sampler: SAMPLERS[e.type],
      emissive: false, ent: e, hurt, fade: e.dead ? 1 - e.deadT / 0.7 : 1,
    });
  }
  for (const p of world.projs) {
    if (p.from === 'player' && (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 < 1) continue;
    add({ x: p.x, y: p.y, size: 0.32, z: 0.3, scaleY: 1, sampler: SAMPLERS.projectile, emissive: true, ent: p, hurt: 0 });
  }
  for (const f of world.fx) {
    add({ x: f.x, y: f.y, size: f.size, z: f.z, scaleY: 1, sampler: SAMPLERS.particle, emissive: true, ent: f, hurt: 0 });
  }
}

function drawSprites(scr, world, cam, time, dirX, dirY, planeX, planeY, f, fv) {
  const { pw, ph, px } = scr;
  const items = [];
  collect(world, cam, items, time);
  items.sort((a, b) => b.d2 - a.d2);
  const inv = 1 / (planeX * dirY - dirX * planeY);
  const flash = cam.flash || 0;

  for (const it of items) {
    const sx = it.x - cam.x;
    const sy = it.y - cam.y;
    const tx = inv * (dirY * sx - dirX * sy);
    const ty = inv * (-planeY * sx + planeX * sy);
    if (ty < 0.12) continue;
    const unit = f / ty;
    const unitV = fv / ty;
    const sw = it.size * unit;
    const sh = it.size * unitV * it.scaleY;
    const screenX = (pw / 2) * (1 + tx / ty);
    const bottom = cam.horizon + 0.5 * unitV - it.z * unitV;
    const top = bottom - sh;
    const left = screenX - sw / 2;
    const xa = Math.max(0, Math.floor(left));
    const xb = Math.min(pw - 1, Math.floor(left + sw));
    const ya = Math.max(0, Math.floor(top));
    const yb = Math.min(ph - 1, Math.floor(bottom));
    if (xa > xb || ya > yb) continue;
    const k = it.emissive ? 1 : light(ty, flash) * (it.boost || 1);
    const fade = it.fade === undefined ? 1 : it.fade;
    const sampler = it.sampler;
    for (let x = xa; x <= xb; x++) {
      if (ty >= zbuf[x]) continue;
      const u = (x + 0.5 - left) / sw;
      for (let y = ya; y <= yb; y++) {
        const c = sampler(u, (y + 0.5 - top) / sh, it.ent, time);
        if (c < 0) continue;
        let r = ((c >> 16) & 255) * k;
        let g = ((c >> 8) & 255) * k;
        let b = (c & 255) * k;
        if (it.hurt > 0) {
          r += (255 - r) * it.hurt * 0.7;
          g += (255 - g) * it.hurt * 0.7;
          b += (255 - b) * it.hurt * 0.7;
        }
        const i = (y * pw + x) * 3;
        if (fade < 1) {
          px[i] = px[i] * (1 - fade) + r * fade;
          px[i + 1] = px[i + 1] * (1 - fade) + g * fade;
          px[i + 2] = px[i + 2] * (1 - fade) + b * fade;
        } else {
          px[i] = r;
          px[i + 1] = g;
          px[i + 2] = b;
        }
      }
    }
  }
}

export function getZBuffer() {
  return zbuf;
}
