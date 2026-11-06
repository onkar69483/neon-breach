import { shade, mix } from './util.js';

const C = (r, g, b) => (r << 16) | (g << 8) | b;
const circ = (u, v, cx, cy, r) => (u - cx) * (u - cx) + (v - cy) * (v - cy) < r * r;
const box = (u, v, x0, y0, x1, y1) => u >= x0 && u < x1 && v >= y0 && v < y1;
const roundShade = (u, w = 1) => 0.72 + 0.4 * (1 - Math.min(1, Math.abs(u - 0.5) * 2 * w));

// Each sampler maps (u, v) in [0,1) to a packed colour or -1 for transparent.
function drone(u, v, e, t) {
  const sway = e.moving ? Math.sin(t * 9 + e.phase) * 0.035 : 0;
  if (circ(u, v, 0.5, 0.2, 0.125)) {
    if (circ(u, v, 0.445, 0.19, 0.03) || circ(u, v, 0.555, 0.19, 0.03)) return C(255, 235, 70);
    if (box(u, v, 0.42, 0.26, 0.58, 0.28)) return C(40, 10, 10);
    return shade(C(210, 72, 56), roundShade(u, 1.4) + (0.3 - v) * 0.5);
  }
  if (box(u, v, 0.34, 0.33, 0.66, 0.66)) {
    if (box(u, v, 0.46, 0.4, 0.54, 0.5)) return C(60, 240, 255);
    return shade(C(125, 38, 40), roundShade(u, 1.6));
  }
  if (box(u, v, 0.2, 0.35, 0.34, 0.62) || box(u, v, 0.66, 0.35, 0.8, 0.62)) return shade(C(160, 52, 44), 0.8);
  if (box(u, v, 0.36, 0.66, 0.48, 0.97 - Math.max(0, sway)) || box(u, v, 0.52, 0.66, 0.64, 0.97 - Math.max(0, -sway))) {
    return shade(C(80, 28, 30), 0.9);
  }
  return -1;
}

function sentinel(u, v, e, t) {
  const bob = Math.sin(t * 3 + e.phase) * 0.02;
  const vv = v - bob;
  const dx = u - 0.5;
  const dy = vv - 0.45;
  const d2 = dx * dx + dy * dy;
  if (d2 < 0.2 * 0.2) {
    const light = 1.15 - (dx + dy) * 0.9;
    if (d2 < 0.2 * 0.2 * 0.36) {
      if (d2 < 0.05 * 0.05) return C(10, 0, 20);
      if (d2 < 0.095 * 0.095) return C(40, 240, 255);
      return C(240, 240, 255);
    }
    return shade(C(135, 45, 175), light);
  }
  if (d2 < 0.23 * 0.23) return C(255, 90, 255);
  for (let i = 0; i < 3; i++) {
    const cx = 0.3 + i * 0.2 + Math.sin(t * 4 + i + e.phase) * 0.02;
    if (box(u, vv, cx - 0.025, 0.66, cx + 0.025, 0.9 - (i === 1 ? 0 : 0.08))) return shade(C(130, 40, 170), 0.8);
  }
  return -1;
}

function titan(u, v, e, t) {
  const sway = e.moving ? Math.sin(t * 6 + e.phase) * 0.03 : 0;
  if (circ(u, v, 0.5, 0.17, 0.12)) {
    if (box(u, v, 0.4, 0.15, 0.6, 0.2)) return C(255, 40, 30);
    return shade(C(120, 124, 140), roundShade(u, 1.4));
  }
  if (box(u, v, 0.22, 0.28, 0.78, 0.68)) {
    if (circ(u, v, 0.5, 0.46, 0.075)) return mix(C(255, 150, 30), C(255, 255, 160), 0.5 + 0.5 * Math.sin(t * 6));
    return shade(C(95, 98, 115), roundShade(u, 1.2));
  }
  if (box(u, v, 0.06, 0.3, 0.22, 0.64) || box(u, v, 0.78, 0.3, 0.94, 0.64)) return shade(C(135, 70, 60), 0.85);
  if (box(u, v, 0.28, 0.68, 0.47, 0.98 - Math.max(0, sway)) || box(u, v, 0.53, 0.68, 0.72, 0.98 - Math.max(0, -sway))) {
    return shade(C(70, 72, 88), 0.95);
  }
  return -1;
}

function pickup(u, v, e) {
  const k = e.kind;
  if (k === 'health') {
    if (!box(u, v, 0.12, 0.2, 0.88, 0.88)) return -1;
    if (box(u, v, 0.42, 0.32, 0.58, 0.76) || box(u, v, 0.26, 0.47, 0.74, 0.62)) return C(235, 40, 60);
    return box(u, v, 0.16, 0.24, 0.84, 0.84) ? C(240, 245, 250) : C(120, 130, 140);
  }
  if (k === 'shells') {
    if (!box(u, v, 0.12, 0.3, 0.88, 0.88)) return -1;
    const stripe = Math.floor(u * 6) % 2 === 0;
    return v < 0.5 ? C(210, 40, 40) : stripe ? C(230, 190, 60) : C(180, 140, 40);
  }
  if (k === 'cells') {
    if (!box(u, v, 0.25, 0.15, 0.75, 0.9)) return -1;
    if (box(u, v, 0.4, 0.08, 0.6, 0.15)) return C(160, 170, 180);
    return v > 0.35 && v < 0.8 ? C(60, 230, 255) : C(40, 50, 70);
  }
  if (k === 'shotgun') {
    if (box(u, v, 0.05, 0.4, 0.75, 0.52)) return C(150, 155, 170);
    if (box(u, v, 0.05, 0.54, 0.75, 0.62)) return C(120, 125, 140);
    if (box(u, v, 0.7, 0.45, 0.95, 0.75)) return C(130, 80, 40);
    return -1;
  }
  if (k === 'plasma') {
    if (box(u, v, 0.1, 0.35, 0.9, 0.65)) return box(u, v, 0.3, 0.42, 0.7, 0.58) ? C(80, 240, 255) : C(60, 70, 100);
    if (box(u, v, 0.35, 0.65, 0.5, 0.9)) return C(50, 55, 80);
    return -1;
  }
  return -1;
}

function projectile(u, v, e) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const d = Math.sqrt(dx * dx + dy * dy) * 2;
  if (d > 1) return -1;
  const core = e.color;
  if (d < 0.35) return C(255, 255, 255);
  return shade(core, 1.3 - d * 0.9);
}

function particle(u, v, e) {
  if (!circ(u, v, 0.5, 0.5, 0.5)) return -1;
  return shade(e.color, Math.max(0.3, e.life / e.max + 0.3));
}

function portal(u, v, e, t) {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.55) * 1.8;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0.95) return -1;
  if (!e.open) {
    const ring = Math.abs(d - 0.85) < 0.08;
    return ring ? C(150, 40, 60) : d < 0.8 ? shade(C(70, 20, 35), 0.6 + 0.4 * Math.sin(d * 14 - t * 2)) : -1;
  }
  const ang = Math.atan2(dy, dx) + d * 7 - t * 3;
  const band = 0.5 + 0.5 * Math.sin(ang * 3);
  const base = mix(C(30, 60, 255), C(255, 40, 220), band);
  if (Math.abs(d - 0.88) < 0.07) return C(120, 255, 255);
  return d < 0.2 ? C(255, 255, 255) : shade(base, 0.6 + 0.6 * (1 - d));
}

export const SAMPLERS = { drone, sentinel, titan, pickup, projectile, particle, portal };
