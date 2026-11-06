import { NATIVE_ACTIONS, maskToActions } from './keyhelper.js';

// Without native key state, terminals only report key presses (plus OS auto-repeat), never releases.
// A key then counts as "held" until a short deadline that every repeat event pushes forward.
const FIRST_HOLD = 0.17;
const REPEAT_HOLD = 0.11;

const ALIASES = {
  up: 'fwd', w: 'fwd',
  down: 'back', s: 'back',
  left: 'turnL', q: 'turnL',
  right: 'turnR', e: 'turnR',
  a: 'strafeL', d: 'strafeR',
  space: 'fire', x: 'fire',
  escape: 'pause', p: 'pause',
  return: 'enter', enter: 'enter',
};

const OPPOSITE = {
  fwd: 'back', back: 'fwd', turnL: 'turnR', turnR: 'turnL', strafeL: 'strafeR', strafeR: 'strafeL',
};

export class Input {
  constructor(clock = () => performance.now() / 1000) {
    this.clock = clock;
    this.until = new Map();
    this.pressed = new Set();
    this.keys = new Set();
    // Native mode: real key-down state supplied by the OS (see keyhelper.js).
    this.native = false;
    this.focused = true;
    this.nativeHeld = new Set();
    this.latch = new Set();
  }

  setNative(on) {
    this.native = on;
    if (!on) {
      this.nativeHeld.clear();
      this.latch.clear();
    }
  }

  setFocused(focused) {
    this.focused = focused;
    if (!focused) {
      this.latch.clear();
      this.until.clear();
    }
  }

  // mask: bit i set = KEYS[i] currently down.
  setNativeMask(mask) {
    const next = maskToActions(mask);
    for (const a of next) if (!this.nativeHeld.has(a)) this.latch.add(a);
    this.nativeHeld = next;
  }

  // Accepts the (str, key) pair emitted by readline's 'keypress' event.
  handleKey(str, key) {
    let name = key && key.name ? key.name : str;
    if (!name) return;
    if (key && key.ctrl && name === 'c') name = 'ctrl-c';
    name = String(name).toLowerCase();
    this.keys.add(name);
    this.press(ALIASES[name] || name);
  }

  press(action) {
    this.pressed.add(action);
    if (this.native && NATIVE_ACTIONS.has(action)) {
      this.latch.add(action);
      return;
    }
    const now = this.clock();
    const cur = this.until.get(action) || 0;
    this.until.set(action, now + (cur > now ? REPEAT_HOLD : FIRST_HOLD));
    const opp = OPPOSITE[action];
    if (opp) this.until.delete(opp);
  }

  held(action) {
    if (!this.focused) return false;
    if (this.native && NATIVE_ACTIONS.has(action)) {
      return this.nativeHeld.has(action) || this.latch.has(action);
    }
    return (this.until.get(action) || 0) > this.clock();
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  // Raw key name (e.g. 'q', '1', 'tab'), ignoring the action aliases.
  wasKey(name) {
    return this.keys.has(name);
  }

  endFrame() {
    this.pressed.clear();
    this.keys.clear();
    this.latch.clear();
  }
}
