import { hash2 } from './util.js';

// Rooms-and-corridors generator. Cell value 0 = open, 1..4 = wall texture id.
export function generateLevel(level, rng) {
  const size = Math.min(48, 26 + level * 3);
  const w = size;
  const h = size;
  const open = new Uint8Array(w * h);
  const rooms = [];
  const target = Math.min(12, 5 + level);

  for (let attempt = 0; attempt < 300 && rooms.length < target; attempt++) {
    const rw = 4 + Math.floor(rng() * 5);
    const rh = 4 + Math.floor(rng() * 4);
    const rx = 2 + Math.floor(rng() * (w - rw - 4));
    const ry = 2 + Math.floor(rng() * (h - rh - 4));
    const clash = rooms.some(
      (r) => rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y
    );
    if (clash) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
  }
  if (rooms.length < 2) {
    rooms.length = 0;
    rooms.push({ x: 3, y: 3, w: 6, h: 6, cx: 6, cy: 6 });
    rooms.push({ x: w - 10, y: h - 10, w: 6, h: 6, cx: w - 7, cy: h - 7 });
  }

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) open[y * w + x] = 1;
  }

  const carve = (x, y) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) open[y * w + x] = 1;
  };
  const corridor = (a, b, wide) => {
    const horizFirst = rng() < 0.5;
    const hLine = (y, x0, x1) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        carve(x, y);
        if (wide) carve(x, y + 1);
      }
    };
    const vLine = (x, y0, y1) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        carve(x, y);
        if (wide) carve(x + 1, y);
      }
    };
    if (horizFirst) {
      hLine(a.cy, a.cx, b.cx);
      vLine(b.cx, a.cy, b.cy);
    } else {
      vLine(a.cx, a.cy, b.cy);
      hLine(b.cy, a.cx, b.cx);
    }
  };

  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i], rng() < 0.3);
  for (let i = 2; i < rooms.length; i++) if (rng() < 0.35) corridor(rooms[i - 2], rooms[i], false);

  // Pillars for cover in big rooms, kept off the centre lines so corridors stay clear.
  for (const r of rooms) {
    if (r.w < 6 || r.h < 6) continue;
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const px = r.x + 2 + Math.floor(rng() * (r.w - 4));
      const py = r.y + 2 + Math.floor(rng() * (r.h - 4));
      if (px === r.cx || py === r.cy) continue;
      open[py * w + px] = 0;
    }
  }

  const seed = Math.floor(rng() * 1e6);
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (open[y * w + x]) continue;
      const theme = Math.floor(hash2(Math.floor(x / 5), Math.floor(y / 5), seed) * 4);
      cells[y * w + x] = 1 + theme;
    }
  }

  const start = { x: rooms[0].cx + 0.5, y: rooms[0].cy + 0.5 };
  const dist = bfs(cells, w, h, rooms[0].cx, rooms[0].cy);
  let exitRoom = rooms[1];
  let best = -1;
  for (const r of rooms.slice(1)) {
    const d = dist[r.cy * w + r.cx];
    if (d > best && d < 32767) {
      best = d;
      exitRoom = r;
    }
  }
  const exit = { x: exitRoom.cx + 0.5, y: exitRoom.cy + 0.5 };
  return { w, h, cells, rooms, start, exit, exitRoom };
}

export function bfs(cells, w, h, sx, sy, out = new Int16Array(w * h), queue = new Int32Array(w * h)) {
  out.fill(32767);
  let head = 0;
  let tail = 0;
  out[sy * w + sx] = 0;
  queue[tail++] = sy * w + sx;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur / w) | 0;
    const nd = out[cur] + 1;
    if (cx > 0 && !cells[cur - 1] && out[cur - 1] > nd) ((out[cur - 1] = nd), (queue[tail++] = cur - 1));
    if (cx < w - 1 && !cells[cur + 1] && out[cur + 1] > nd) ((out[cur + 1] = nd), (queue[tail++] = cur + 1));
    if (cy > 0 && !cells[cur - w] && out[cur - w] > nd) ((out[cur - w] = nd), (queue[tail++] = cur - w));
    if (cy < h - 1 && !cells[cur + w] && out[cur + w] > nd) ((out[cur + w] = nd), (queue[tail++] = cur + w));
  }
  return out;
}
