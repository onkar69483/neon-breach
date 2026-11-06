const ESC = '\x1b[';

function to256(c) {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 23);
  }
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

// Sub-pixels per character cell for each glyph mode.
export const GLYPH_MODES = {
  half: { sx: 1, sy: 2 }, // upper-half block: 1x2
  quad: { sx: 2, sy: 2 }, // quadrant blocks: 2x2
  braille: { sx: 2, sy: 4 }, // braille dots: 2x4
};

// Quadrant glyph by mask of "foreground" sub-pixels: bit0 TL, bit1 TR, bit2 BL, bit3 BR.
const QUAD = [
  ' ', '\u2598', '\u259D', '\u2580', '\u2596', '\u258C', '\u259E', '\u259B',
  '\u2597', '\u259A', '\u2590', '\u259C', '\u2584', '\u2599', '\u259F', '\u2588',
];
const QUAD_MASKS = [1, 2, 4, 8, 3, 5, 9];
const BRAILLE = Array.from({ length: 256 }, (_, i) => String.fromCharCode(0x2800 + i));
const BRAILLE_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

// Pixel buffer is (cols*sx) x (rows*sy). Each cell is drawn with the glyph that best fits its sub-pixels
// using two colours (foreground + background).
export class Screen {
  constructor(cols, rows, colorMode = 'truecolor', glyphMode = 'quad') {
    this.colorMode = colorMode;
    this.glyphMode = GLYPH_MODES[glyphMode] ? glyphMode : 'quad';
    this.sx = GLYPH_MODES[this.glyphMode].sx;
    this.sy = GLYPH_MODES[this.glyphMode].sy;
    // Width/height ratio of one pixel, assuming terminal cells are twice as tall as wide.
    this.pa = this.sy / (2 * this.sx);
    this.offX = 0;
    this.offY = 0;
    this.pr = new Int32Array(8);
    this.pg = new Int32Array(8);
    this.pb = new Int32Array(8);
    this.resize(cols, rows);
  }

  setGlyphMode(mode) {
    if (!GLYPH_MODES[mode]) return;
    this.glyphMode = mode;
    this.sx = GLYPH_MODES[mode].sx;
    this.sy = GLYPH_MODES[mode].sy;
    this.pa = this.sy / (2 * this.sx);
    this.resize(this.cols, this.rows);
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.pw = cols * this.sx;
    this.ph = rows * this.sy;
    this.px = new Uint8ClampedArray(this.pw * this.ph * 3);
    const n = cols * rows;
    this.ovCh = new Array(n).fill('');
    this.ovFg = new Int32Array(n);
    this.prevCh = new Array(n).fill(null);
    this.prevFg = new Int32Array(n).fill(-1);
    this.prevBg = new Int32Array(n).fill(-1);
  }

  invalidate() {
    this.prevCh.fill(null);
  }

  clearOverlay() {
    this.ovCh.fill('');
  }

  setPx(x, y, c) {
    if (x < 0 || y < 0 || x >= this.pw || y >= this.ph) return;
    const i = (y * this.pw + x) * 3;
    this.px[i] = (c >> 16) & 255;
    this.px[i + 1] = (c >> 8) & 255;
    this.px[i + 2] = c & 255;
  }

  fillRect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.pw, Math.ceil(x + w));
    const y1 = Math.min(this.ph, Math.ceil(y + h));
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * this.pw + x0) * 3;
      for (let xx = x0; xx < x1; xx++, i += 3) {
        this.px[i] = r;
        this.px[i + 1] = g;
        this.px[i + 2] = b;
      }
    }
  }

  dimRect(x, y, w, h, f) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.pw, Math.ceil(x + w));
    const y1 = Math.min(this.ph, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * this.pw + x0) * 3;
      for (let xx = x0; xx < x1; xx++, i += 3) {
        this.px[i] *= f;
        this.px[i + 1] *= f;
        this.px[i + 2] *= f;
      }
    }
  }

  text(x, y, str, fg = 0xffffff) {
    if (y < 0 || y >= this.rows) return;
    for (let i = 0; i < str.length; i++) {
      const cx = x + i;
      if (cx < 0 || cx >= this.cols) continue;
      const ch = str[i];
      if (ch === ' ') continue;
      this.ovCh[y * this.cols + cx] = ch;
      this.ovFg[y * this.cols + cx] = fg;
    }
  }

  textCenter(y, str, fg = 0xffffff) {
    this.text(Math.floor((this.cols - str.length) / 2), y, str, fg);
  }

  setCell(x, y, ch, fg) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.ovCh[y * this.cols + x] = ch;
    this.ovFg[y * this.cols + x] = fg;
  }

  colorSeq(prefix, c) {
    if (this.colorMode === 'truecolor') {
      return `${ESC}${prefix};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`;
    }
    return `${ESC}${prefix};5;${to256(c)}m`;
  }

  // Chooses glyph + colours for one cell; results land in this.cCh / cFg / cBg.
  buildCell(x, y) {
    const { px, pw, sx, sy, pr, pg, pb } = this;
    const q = this.colorMode === 'truecolor' ? 0xfc : 0xff;
    const n = sx * sy;
    let k = 0;
    let tr = 0;
    let tg = 0;
    let tb = 0;
    for (let r = 0; r < sy; r++) {
      let i = ((y * sy + r) * pw + x * sx) * 3;
      for (let c = 0; c < sx; c++, k++, i += 3) {
        pr[k] = px[i];
        pg[k] = px[i + 1];
        pb[k] = px[i + 2];
        tr += pr[k];
        tg += pg[k];
        tb += pb[k];
      }
    }
    const avg = (((tr / n) & q) << 16) | (((tg / n) & q) << 8) | ((tb / n) & q);
    const ci = y * this.cols + x;
    const ov = this.ovCh[ci];
    if (ov) {
      this.cCh = ov;
      this.cFg = this.ovFg[ci];
      this.cBg = (((tr / n / 2) & q) << 16) | (((tg / n / 2) & q) << 8) | ((tb / n / 2) & q);
      return;
    }
    const mean = (sr, sg, sb, cnt) =>
      (((sr / cnt) & q) << 16) | (((sg / cnt) & q) << 8) | ((sb / cnt) & q);

    if (n === 2) {
      this.cCh = '\u2580';
      this.cFg = mean(pr[0], pg[0], pb[0], 1);
      this.cBg = mean(pr[1], pg[1], pb[1], 1);
      return;
    }

    if (n === 4) {
      let best = 0;
      let bestScore = -1;
      for (let mi = 0; mi < QUAD_MASKS.length; mi++) {
        const m = QUAD_MASKS[mi];
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let cnt = 0;
        for (let j = 0; j < 4; j++) {
          if ((m >> j) & 1) { sr += pr[j]; sg += pg[j]; sb += pb[j]; cnt++; }
        }
        const or = tr - sr;
        const og = tg - sg;
        const ob = tb - sb;
        const score = (sr * sr + sg * sg + sb * sb) / cnt + (or * or + og * og + ob * ob) / (4 - cnt);
        if (score > bestScore) { bestScore = score; best = m; }
      }
      const flat = (tr * tr + tg * tg + tb * tb) / 4;
      if (bestScore - flat < 40) {
        this.cCh = ' ';
        this.cFg = 0;
        this.cBg = avg;
        return;
      }
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let j = 0; j < 4; j++) {
        if ((best >> j) & 1) { sr += pr[j]; sg += pg[j]; sb += pb[j]; cnt++; }
      }
      this.cCh = QUAD[best];
      this.cFg = mean(sr, sg, sb, cnt);
      this.cBg = mean(tr - sr, tg - sg, tb - sb, 4 - cnt);
      return;
    }

    // Braille: split the 8 sub-pixels into dark/bright groups by luminance (2-means).
    const lum = this.lum || (this.lum = new Float32Array(8));
    let lo = 1e9;
    let hi = -1;
    for (let j = 0; j < 8; j++) {
      const l = pr[j] * 0.3 + pg[j] * 0.59 + pb[j] * 0.11;
      lum[j] = l;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    if (hi - lo < 10) {
      this.cCh = ' ';
      this.cFg = 0;
      this.cBg = avg;
      return;
    }
    let thr = (lo + hi) / 2;
    for (let it = 0; it < 2; it++) {
      let a = 0;
      let na = 0;
      let b = 0;
      let nb = 0;
      for (let j = 0; j < 8; j++) {
        if (lum[j] > thr) { b += lum[j]; nb++; } else { a += lum[j]; na++; }
      }
      if (!na || !nb) break;
      thr = (a / na + b / nb) / 2;
    }
    let bits = 0;
    let fr = 0, fgc = 0, fb = 0, nf = 0;
    let br = 0, bg2 = 0, bb = 0, nbk = 0;
    for (let j = 0; j < 8; j++) {
      const col = j & 1;
      const row = j >> 1;
      if (lum[j] > thr) {
        bits |= BRAILLE_BITS[col][row];
        fr += pr[j]; fgc += pg[j]; fb += pb[j]; nf++;
      } else {
        br += pr[j]; bg2 += pg[j]; bb += pb[j]; nbk++;
      }
    }
    if (!nf || !nbk) {
      this.cCh = ' ';
      this.cFg = 0;
      this.cBg = avg;
      return;
    }
    this.cCh = BRAILLE[bits];
    this.cFg = mean(fr, fgc, fb, nf);
    this.cBg = mean(br, bg2, bb, nbk);
  }

  present() {
    const { cols, rows } = this;
    const out = [];
    let curFg = -2;
    let curBg = -2;
    let curX = -1;
    let curY = -1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.buildCell(x, y);
        const ch = this.cCh;
        const fg = this.cFg;
        const bg = this.cBg;
        const ci = y * cols + x;
        if (this.prevCh[ci] === ch && this.prevFg[ci] === fg && this.prevBg[ci] === bg) continue;
        this.prevCh[ci] = ch;
        this.prevFg[ci] = fg;
        this.prevBg[ci] = bg;
        if (curY !== y || curX !== x) out.push(`${ESC}${y + 1 + this.offY};${x + 1 + this.offX}H`);
        if (ch !== ' ' && fg !== curFg) { out.push(this.colorSeq(38, fg)); curFg = fg; }
        if (bg !== curBg) { out.push(this.colorSeq(48, bg)); curBg = bg; }
        out.push(ch);
        curX = x + 1;
        curY = y;
      }
    }
    return out.join('');
  }

  // Plain-text dump for tests and debugging.
  toAscii() {
    const ramp = ' .:-=+*#%@';
    let s = '';
    for (let y = 0; y < this.ph; y += this.sy) {
      for (let x = 0; x < this.pw; x += this.sx) {
        const i = (y * this.pw + x) * 3;
        const l = (this.px[i] * 0.3 + this.px[i + 1] * 0.59 + this.px[i + 2] * 0.11) / 256;
        s += ramp[Math.min(9, (l * 10) | 0)];
      }
      s += '\n';
    }
    return s;
  }
}
