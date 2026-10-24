/** Small numeric helpers shared by the world, the effects and the game. */

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent approach of `current` to `target` (rate in 1/s). */
export const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

/** Seeded PRNG (deterministic: the same seed gives the same world). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of two integers (and a salt) to 0..1: lets a chunk place its plants the same way every time. */
export function hash2(ix: number, iz: number, salt = 0) {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Distance from (x, z) to the segment a-b, in the plane. */
export function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Velocity state of a `smoothDamp` (one per smoothed value). */
export interface DampState {
  v: number;
}

/**
 * Critically damped spring toward `target` (Unity's SmoothDamp, Game Programming Gems 4): second order, so the value
 * arrives without overshoot and its velocity is continuous; `smoothTime` ≈ seconds to get most of the way there.
 * Unlike the first-order `damp`, the lag does not depend on the frame time, which is what the camera and the heading
 * need to stop jittering (docs/ENGINES.md §3). `maxSpeed` caps the rate (Infinity = none).
 */
export function smoothDamp(current: number, target: number, state: DampState, smoothTime: number, dt: number, maxSpeed = Infinity) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * Math.max(1e-4, smoothTime);
  change = clamp(change, -maxChange, maxChange);
  const goal = current - change;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  let out = goal + (change + temp) * exp;
  // never overshoot the target
  if (target - current > 0 === out > target) {
    out = target;
    state.v = (out - goal) / Math.max(1e-6, dt);
  }
  return out;
}

/** `smoothDamp` for an angle (rad): takes the short way round. */
export function smoothDampAngle(current: number, target: number, state: DampState, smoothTime: number, dt: number, maxSpeed = Infinity) {
  const d = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return smoothDamp(current, current + d, state, smoothTime, dt, maxSpeed);
}
