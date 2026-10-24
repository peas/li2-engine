/**
 * Small 2D steering over the ground plane (x, z), hand-rolled on purpose. Every function writes into `out` and returns it, so the per-frame loop allocates nothing.
 * Anything with `x` and `z` works as a point, a THREE.Vector3 included. Desired velocities are in m/s.
 */
export interface V2 { x: number; z: number }

export const v2 = (x = 0, z = 0): V2 => ({ x, z });

export function setLength(v: V2, len: number) {
  const l = Math.hypot(v.x, v.z);
  if (l > 1e-9) { v.x *= len / l; v.z *= len / l; } else { v.x = 0; v.z = 0; }
  return v;
}

export function clampLength(v: V2, max: number) {
  const l = Math.hypot(v.x, v.z);
  if (l > max) { v.x *= max / l; v.z *= max / l; }
  return v;
}

/** Full speed straight at `target`. */
export function seek(pos: V2, target: V2, speed: number, out: V2) {
  out.x = target.x - pos.x;
  out.z = target.z - pos.z;
  return setLength(out, speed);
}

/** Full speed straight away from `threat`. */
export function flee(pos: V2, threat: V2, speed: number, out: V2) {
  out.x = pos.x - threat.x;
  out.z = pos.z - threat.z;
  if (out.x === 0 && out.z === 0) out.x = 1;
  return setLength(out, speed);
}

/** Seek that slows down linearly inside `slowRadius` and stops inside `stopRadius`. */
export function arrive(pos: V2, target: V2, speed: number, slowRadius: number, out: V2, stopRadius = 0.3) {
  const d = Math.hypot(target.x - pos.x, target.z - pos.z);
  if (d < stopRadius) { out.x = 0; out.z = 0; return out; }
  return seek(pos, target, speed * Math.min(1, d / slowRadius), out);
}

/** Velocity along a heading (0 = +z, like the flight yaw). */
export function headingVelocity(heading: number, speed: number, out: V2) {
  out.x = Math.sin(heading) * speed;
  out.z = Math.cos(heading) * speed;
  return out;
}

/** Random drift of a heading: a small random turn per second (`jitter` in rad/s, roughly). */
export function wander(heading: number, rand: () => number, jitter: number, dt: number) {
  return heading + (rand() - 0.5) * 2 * jitter * Math.sqrt(dt);
}

/** Push away from neighbours closer than `radius`, stronger the closer they are (magnitude up to `speed`). */
export function separation(self: V2, others: readonly V2[], radius: number, speed: number, out: V2, skip?: (i: number) => boolean) {
  out.x = 0;
  out.z = 0;
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    if (o === self || skip?.(i)) continue;
    const dx = self.x - o.x, dz = self.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= radius) continue;
    const w = (1 - d / radius) * speed;
    if (d < 1e-6) { out.x += w; continue; }
    out.x += (dx / d) * w;
    out.z += (dz / d) * w;
  }
  return clampLength(out, speed);
}

/** Zero inside `soft` × radius; beyond it, a pull toward the centre that reaches `speed` at the radius. */
export function stayInside(pos: V2, center: V2, radius: number, speed: number, out: V2, soft = 0.8) {
  const d = Math.hypot(pos.x - center.x, pos.z - center.z);
  const k = (d - radius * soft) / (radius * (1 - soft));
  if (k <= 0) { out.x = 0; out.z = 0; return out; }
  return seek(pos, center, speed * Math.min(k, 2), out);
}

/** Turn `vel` toward `desired` with at most `maxAccel` m/s² (the inertia of a body). */
export function steer(vel: V2, desired: V2, maxAccel: number, dt: number) {
  let ax = desired.x - vel.x, az = desired.z - vel.z;
  const a = Math.hypot(ax, az), max = maxAccel * dt;
  if (a > max) { ax *= max / a; az *= max / a; }
  vel.x += ax;
  vel.z += az;
  return vel;
}

/** Shortest signed difference b - a between two angles, in (-π, π]. */
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Frame-rate independent turn of angle `a` toward `b` (rate in 1/s). */
export const dampAngle = (a: number, b: number, rate: number, dt: number) => a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));

/** A tiny finite-state machine: current state, time in it, and an optional duration after which `tick` says so. */
export class Fsm<S extends string> {
  t = 0;
  dur = Infinity;
  constructor(public state: S) {}
  set(state: S, dur = Infinity) {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }
  /** Advance; true when the state's duration ran out (the caller picks the next state). */
  tick(dt: number) {
    this.t += dt;
    return this.t >= this.dur;
  }
}
