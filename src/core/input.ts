import type { Controls } from "./types";

const DEADZONE = 0.15;
const dz = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v);
/** Right-stick deflection → equivalent mouse pixels per frame. */
const STICK_LOOK = 9;
/** Time constant of the mouse low-pass (s): a 125 Hz mouse on a 60 Hz screen delivers 1-3 events per frame, so the raw
 * per-frame delta flickers by ±20 %; filtering the *rate* keeps the total travel and removes the flicker (the first game's docs/ENGINES.md §3 B). */
const MOUSE_TAU = 0.02;

/**
 * Mouse + keyboard first, gamepad second. The mouse only counts while the pointer is locked on the canvas (click to
 * lock, Esc to release); deltas accumulate between reads. Edges (`justPressed`, `justReleased`, `clicked`) last until
 * `endFrame()`.
 */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private clicks = 0;
  private leftDown = false;
  private dx = 0;
  private dy = 0;
  /** Total mouse travel since load, for debugging sensitivity. */
  readonly travel = { x: 0, y: 0 };
  /** Filtered mouse rate (px/s). */
  private rate = { x: 0, y: 0 };
  /** Mouse events seen since the last `read()` (for the smoothness measurements). */
  mouseEvents = 0;

  constructor(private canvas: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => {
      if (this.keys.delete(e.code)) this.released.add(e.code);
    });
    addEventListener("blur", () => {
      for (const k of this.keys) this.released.add(k);
      this.keys.clear();
    });
    canvas.addEventListener("click", () => {
      if (this.locked) return;
      // raw deltas without the OS acceleration where supported (Chrome); plain lock elsewhere.
      // Chromium rejects the lock when the window isn't focused yet; the next click will do
      const plain = () => (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch(() => {});
      try {
        const p = (canvas.requestPointerLock as (o?: { unadjustedMovement: boolean }) => Promise<void> | undefined)({ unadjustedMovement: true });
        if (p && typeof p.catch === "function") p.catch(() => plain()); else if (!document.pointerLockElement) plain();
      } catch {
        plain();
      }
    });
    canvas.addEventListener("mousedown", (e) => { if (e.button === 0) { this.clicks++; this.leftDown = true; } });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.leftDown = false; });
    addEventListener("blur", () => { this.leftDown = false; });
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
      this.mouseEvents++;
      this.travel.x += e.movementX;
      this.travel.y += e.movementY;
    });
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  private key(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Is the key down right now? (level) */
  held(code: string) {
    return this.keys.has(code);
  }

  /** Was the key pressed since the last `endFrame()`? (edge, not level) */
  justPressed(code: string) {
    return this.pressed.has(code);
  }

  /** Was the key released since the last `endFrame()`? (edge; losing the window focus releases every key) */
  justReleased(code: string) {
    return this.released.has(code);
  }

  /** Left button is held down. */
  get leftHeld() {
    return this.leftDown;
  }

  /** Left button went down on the canvas since the last `endFrame()`. */
  get clicked() {
    return this.clicks > 0;
  }

  /** The first connected gamepad, if any. */
  gamepad(): Gamepad | undefined {
    return navigator.getGamepads?.().find((p): p is Gamepad => !!p);
  }

  /** Forget this frame's edges; call at the end of the frame (after everyone asked `justPressed`). */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.clicks = 0;
  }

  /** `dt` = seconds since the last read: the mouse delta is low-passed over time before it is handed out. */
  read(dt = 1 / 60): Controls {
    const axis = (pos: boolean, neg: boolean) => (pos ? 1 : 0) - (neg ? 1 : 0);
    let pitch = axis(this.key("ArrowUp"), this.key("ArrowDown"));
    let roll = axis(this.key("ArrowRight", "KeyD"), this.key("ArrowLeft", "KeyA"));
    let throttle = axis(this.key("KeyW"), this.key("KeyS"));
    let flap = this.key("Space");
    let brake = this.key("ShiftLeft", "ShiftRight");
    const step = Math.max(1e-3, dt);
    const k = 1 - Math.exp(-step / MOUSE_TAU);
    this.rate.x += (this.dx / step - this.rate.x) * k;
    this.rate.y += (this.dy / step - this.rate.y) * k;
    if (Math.abs(this.rate.x) < 0.5) this.rate.x = 0;
    if (Math.abs(this.rate.y) < 0.5) this.rate.y = 0;
    let lookX = this.rate.x * step, lookY = this.rate.y * step;
    this.dx = this.dy = 0;
    this.mouseEvents = 0;

    const pad = this.gamepad();
    if (pad) {
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
      if (lx) roll = lx;
      if (ly) pitch = -ly; // stick forward = nose up
      if (rx) lookX += rx * STICK_LOOK;
      if (ry) lookY += ry * STICK_LOOK;
      const rt = pad.buttons[7]?.value ?? 0, lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.1) throttle = rt;
      flap ||= !!pad.buttons[0]?.pressed; // A / cross
      brake ||= !!pad.buttons[1]?.pressed || lt > 0.5; // B / left trigger
    }
    return { pitch, roll, throttle, flap, brake, lookX, lookY };
  }
}
