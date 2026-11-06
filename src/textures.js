import { hash2 } from './util.js';

export const TEX = 32;

function make(fn) {
  const d = new Uint8Array(TEX * TEX * 3);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const c = fn(x, y);
      const i = (y * TEX + x) * 3;
      for (let k = 0; k < 3; k++) d[i + k] = c[k] < 0 ? 0 : c[k] > 255 ? 255 : c[k];
    }
  }
  return d;
}

const noise = (x, y, s) => hash2(x, y, s) - 0.5;

const brick = make((x, y) => {
  const row = (y / 8) | 0;
  const bx = (x + (row % 2) * 8) % 16;
  if (y % 8 === 0 || bx === 0) return [38, 24, 24];
  const id = hash2(((x + (row % 2) * 8) / 16) | 0, row, 7);
  const n = noise(x, y, 1) * 28;
  const hi = y % 8 === 1 ? 18 : 0;
  return [150 + id * 40 + n + hi, 55 + id * 20 + n * 0.5, 42 + id * 10 + n * 0.4];
});

const tech = make((x, y) => {
  const n = noise(x, y, 2) * 10;
  let c = [48 + n, 68 + n, 98 + n];
  if (x % 16 === 0 || y % 16 === 0) c = [20, 28, 42];
  else if (x % 16 === 1 || y % 16 === 1) c = [78, 100, 135];
  if ((x % 16 === 3 || x % 16 === 12) && (y % 16 === 3 || y % 16 === 12)) c = [150, 165, 190];
  if (y >= 14 && y <= 16) c = [20, 220 + (x % 2) * 20, 255];
  return c;
});

const moss = make((x, y) => {
  const n = noise(x, y, 3) * 26;
  const m = hash2((x / 3) | 0, (y / 3) | 0, 9);
  const off = (((y / 16) | 0) % 2) * 8;
  if (y % 16 === 0 || (x + off) % 16 === 0) return [34, 38, 34];
  if (m > 0.62 && y > 6) return [52 + n, 120 + n, 60 + n];
  return [92 + n, 98 + n, 90 + n];
});

const metal = make((x, y) => {
  const n = noise(x, y, 5) * 12;
  let c = [110 + n, 112 + n, 120 + n];
  if (y < 2 || y > 29) c = [60, 62, 70];
  if (y >= 22 && y < 30) c = ((x + y) >> 2) % 2 === 0 ? [235, 170, 20] : [30, 30, 34];
  if (y >= 4 && y <= 8 && x >= 6 && x <= 25) c = [30 + n, 34 + n, 40 + n];
  if (y === 6 && x >= 8 && x <= 23) c = [255, 60, 120];
  return c;
});

export const WALL_TEXTURES = [brick, tech, moss, metal];
