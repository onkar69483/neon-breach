#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from '../src/main.js';

const HELP = `NEON BREACH - a first-person shooter for your terminal

Usage: neon-breach [options]

Options:
  --seed <n>        Use a fixed seed (same dungeons every run)
  --mode <m>        Sharpness: half | quad (default) | braille. Press G in-game to cycle
  --width <cols>    Max render width in columns   (default 160)
  --height <rows>   Max render height in rows     (default 48)
  --fps <n>         Target frame rate             (default 30)
  --256             Force 256-colour output
  --no-native-keys  Disable real held-key detection (Windows); use key-repeat emulation instead
  --truecolor       Force 24-bit colour output
  -v, --version     Print version
  -h, --help        Show this help

Tip: a modern terminal (Windows Terminal, iTerm2, WezTerm, kitty, VS Code)
with a monospace font gives the best picture. Make the window large!`;

const args = process.argv.slice(2);
const opts = {};
const num = (i, name) => {
  const v = Number(args[i + 1]);
  if (!Number.isFinite(v) || v <= 0) {
    console.error(`${name} needs a positive number`);
    process.exit(1);
  }
  return Math.floor(v);
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') {
    console.log(HELP);
    process.exit(0);
  } else if (a === '-v' || a === '--version') {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
    process.exit(0);
  } else if (a === '--seed') opts.seed = num(i++, '--seed');
  else if (a === '--mode') {
    const m = args[++i];
    if (!['half', 'quad', 'braille'].includes(m)) {
      console.error('--mode must be half, quad or braille');
      process.exit(1);
    }
    opts.glyphs = m;
  } else if (a === '--width') opts.width = num(i++, '--width');
  else if (a === '--height') opts.height = num(i++, '--height');
  else if (a === '--fps') opts.fps = num(i++, '--fps');
  else if (a === '--256') opts.colors = '256';
  else if (a === '--no-native-keys') opts.nativeKeys = false;
  else if (a === '--truecolor') opts.colors = 'truecolor';
  else {
    console.error(`Unknown option: ${a}\n\n${HELP}`);
    process.exit(1);
  }
}

run(opts);
