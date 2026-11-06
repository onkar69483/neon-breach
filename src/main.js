import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Screen } from './screen.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { startKeyHelper } from './keyhelper.js';

const ENTER_SEQ = '\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1004h\x1b[2J';
const LEAVE_SEQ = '\x1b[0m\x1b[?1004l\x1b[?7h\x1b[?25h\x1b[?1049l';

function makeStorage() {
  const file = path.join(os.homedir(), '.neon-breach.json');
  return {
    load() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')).high | 0;
      } catch {
        return 0;
      }
    },
    save(high) {
      try {
        fs.writeFileSync(file, JSON.stringify({ high }));
      } catch {
        /* best effort */
      }
    },
  };
}

function detectColorMode(opts) {
  if (opts.colors) return opts.colors;
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
  if (process.env.WT_SESSION || process.platform === 'win32') return 'truecolor';
  const tp = process.env.TERM_PROGRAM || '';
  if (['vscode', 'iTerm.app', 'WezTerm', 'ghostty'].includes(tp)) return 'truecolor';
  return '256';
}

export function run(opts = {}) {
  const out = process.stdout;
  const stdin = process.stdin;
  if (!out.isTTY || !stdin.isTTY) {
    console.error('Neon Breach needs an interactive terminal (TTY).');
    process.exit(1);
  }

  const maxCols = opts.width || 160;
  const maxRows = opts.height || 48;
  const MIN_COLS = 80;
  const MIN_ROWS = 24;
  const fps = opts.fps || 30;
  const mode = detectColorMode(opts);

  const fit = () => {
    const cols = Math.min(maxCols, out.columns);
    const rows = Math.min(maxRows, out.rows);
    return { cols, rows, offX: Math.floor((out.columns - cols) / 2), offY: Math.floor((out.rows - rows) / 2) };
  };

  let size = fit();
  const screen = new Screen(Math.max(1, size.cols), Math.max(1, size.rows), mode, opts.glyphs || 'quad');
  screen.offX = size.offX;
  screen.offY = size.offY;
  const input = new Input();
  const game = new Game({ screen, input, seed: opts.seed, storage: makeStorage() });

  let tooSmall = out.columns < MIN_COLS || out.rows < MIN_ROWS;
  let running = true;
  let timer = null;

  const cleanup = () => {
    if (!running) return;
    running = false;
    clearTimeout(timer);
    if (helper) helper.stop();
    try { stdin.setRawMode(false); } catch { /* not a TTY anymore */ }
    stdin.pause();
    out.write(LEAVE_SEQ);
  };

  const quit = (code = 0) => {
    cleanup();
    process.exit(code);
  };

  process.on('SIGINT', () => quit(0));
  process.on('SIGTERM', () => quit(0));
  process.on('exit', () => cleanup());
  process.on('uncaughtException', (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on('keypress', (str, key) => {
    const seq = key && key.sequence;
    if (seq === '\x1b[I') return input.setFocused(true);
    if (seq === '\x1b[O') return input.setFocused(false);
    input.handleKey(str, key);
  });

  // Real held-key detection (Windows): lets you hold to move and release to stop, with several keys at once.
  let helper = null;
  if (opts.nativeKeys !== false) {
    helper = startKeyHelper({
      onReady: () => {
        input.setNative(true);
        game.say('HOLD-TO-MOVE CONTROLS ACTIVE', 2.5);
      },
      onMask: (mask) => input.setNativeMask(mask),
      onExit: () => input.setNative(false),
    });
  }

  out.on('resize', () => {
    size = fit();
    tooSmall = out.columns < MIN_COLS || out.rows < MIN_ROWS;
    screen.resize(Math.max(1, size.cols), Math.max(1, size.rows));
    screen.offX = size.offX;
    screen.offY = size.offY;
    out.write('\x1b[0m\x1b[2J');
  });

  out.write(ENTER_SEQ);

  let last = performance.now();
  const frame = () => {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (tooSmall) {
      out.write(`\x1b[0m\x1b[2J\x1b[1;1HTerminal too small: need at least ${MIN_COLS}x${MIN_ROWS}, have ${out.columns}x${out.rows}.`);
      if (input.wasKey('ctrl-c')) quit(0);
      input.endFrame();
    } else {
      game.update(dt);
      input.endFrame();
      if (game.quit) return quit(0);
      game.render();
      if (out.writableLength < 512 * 1024) out.write(screen.present());
    }
    timer = setTimeout(frame, Math.max(0, 1000 / fps - (performance.now() - now)));
  };
  frame();
}
