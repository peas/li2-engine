import * as THREE from "three";
import type { Controls, Ground } from "../core/types";

/** Speeds in m/s, distances in m. Defaults: a person of ~1.6 m on the Walker's terrain. */
export interface ClimberParams {
  /** Gradient (rise/run) of the ground ahead above which walking into it starts climbing. Default 1.0 (the Walker slides from 0.9). */
  enterSlope: number;
  /** Gradient below which the climb ends (she stands up on the top, or reaches the foot). Default 0.65. */
  exitSlope: number;
  /** Speed along the surface (m/s). Default 1.6; Shift does not run. */
  climbSpeed: number;
  /** Jump off (Space): backward hop speed (m/s) and height (m). Default 3.5 and 0.6. */
  jumpOffSpeed: number;
  jumpOffHeight: number;
  /** How far ahead (m) the ground is sampled to decide "a wall ahead". Default 0.7. */
  lookAhead: number;
  /** Gravity for the jump-off speed (m/s², same as the Walker's). */
  gravity: number;
}

export const DEFAULT_CLIMBER: ClimberParams = {
  enterSlope: 1.0,
  exitSlope: 0.65,
  climbSpeed: 1.6,
  jumpOffSpeed: 3.5,
  jumpOffHeight: 0.6,
  lookAhead: 0.7,
  gravity: 22,
};

export type MotivoSaida = "topo" | "pulo" | "chao" | "agua";

export interface ClimberEvents {
  enter: () => void;
  exit: (motivo: MotivoSaida) => void;
  /** Every `stepLength` metres climbed; `distance` = total metres climbed. */
  step: (distance: number) => void;
}

/** How the climb ended: stand at (x, z) (topo/chao/agua), or launch from there with (vx, vy, vz) (pulo). */
export interface SaidaEscalada { motivo: MotivoSaida; x: number; z: number; vx: number; vz: number; vy: number }

const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _q = new THREE.Quaternion();

/**
 * Wall climbing (Zelda style) on a height field, only maths: walking into a slope steeper than `enterSlope` grabs it;
 * W/S go up/down the slope, A/D sideways along it, Space hops off backwards; where the ground ahead flattens she
 * climbs over the top, where the ground behind flattens (going down) she is at the foot.
 *
 * `position` = the feet, on the surface. `quaternion` = yaw facing uphill, pitched forward so the body's up lies
 * along the slope (upright against a vertical wall, flat on a gentle one). Local frame like the `Walker`: forward +Z.
 */
export class Climber {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  yaw = 0;
  /** Gradient under the feet. */
  slope = 0;
  escalando = false;
  /** Speed along the surface this step (m/s), for the pose. */
  speed = 0;
  /** Metres climbed (for the gait) and between step events. */
  distancia = 0;
  stepLength = 0.6;
  bodyRadius = 0.35;
  /** Uphill horizontal direction (unit), kept from the last steep enough sample. */
  private up = new THREE.Vector2(0, 1);
  private grad = new THREE.Vector2();
  private flapWas = true;
  private nextStep = 0;
  private listeners: { [K in keyof ClimberEvents]?: ClimberEvents[K][] } = {};

  constructor(readonly params: ClimberParams, private ground: Ground) {}

  on<K extends keyof ClimberEvents>(type: K, fn: ClimberEvents[K]) {
    ((this.listeners[type] ??= []) as ClimberEvents[K][]).push(fn);
    return () => {
      const l = this.listeners[type] as ClimberEvents[K][];
      l.splice(l.indexOf(fn), 1);
    };
  }
  private emit<K extends keyof ClimberEvents>(type: K, ...args: Parameters<ClimberEvents[K]>) {
    for (const fn of (this.listeners[type] ?? []) as unknown as ((...a: unknown[]) => void)[]) fn(...args);
  }

  /** Gradient at (x, z) over ±0.5 m (shared vector). */
  gradientAt(x: number, z: number) {
    const e = 0.5, h = this.ground.heightAt;
    return this.grad.set((h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e));
  }

  /** Rise over run from (x, z) to `dist` m along (dx, dz). */
  private riseAlong(x: number, z: number, dx: number, dz: number, dist: number) {
    const h = this.ground.heightAt;
    return (h(x + dx * dist, z + dz * dist) - h(x, z)) / dist;
  }

  /** Walking (or falling onto) a wall: a wall ahead in `dir` (xz unit vector) steeper than enterSlope and the player pushing into it. */
  podeEntrar(pos: { x: number; y: number; z: number }, dir: { x: number; z: number }, pushing: boolean) {
    if (!pushing || this.escalando) return false;
    const p = this.params, h = this.ground.heightAt;
    const l = Math.hypot(dir.x, dir.z);
    if (l < 1e-6) return false;
    const dx = dir.x / l, dz = dir.z / l;
    if (pos.y - h(pos.x, pos.z) > 1) return false; // too far above the ground (high in a jump)
    if (this.ground.isWaterAt(pos.x + dx * p.lookAhead, pos.z + dz * p.lookAhead)) return false;
    const g = this.gradientAt(pos.x, pos.z);
    const sob = g.x * dx + g.y * dz; // the slope under the feet, along the push
    return Math.max(this.riseAlong(pos.x, pos.z, dx, dz, p.lookAhead), sob) > p.enterSlope;
  }

  /** Enter at `pos` (snaps to the surface, faces uphill); emits enter. */
  entrar(pos: { x: number; y: number; z: number }) {
    this.position.set(pos.x, this.ground.heightAt(pos.x, pos.z), pos.z);
    // uphill: from a wider sample, the feet may still be on the flat at the foot of the wall
    const h = this.ground.heightAt, e = this.params.lookAhead;
    const gx = h(pos.x + e, pos.z) - h(pos.x - e, pos.z), gz = h(pos.x, pos.z + e) - h(pos.x, pos.z - e);
    if (Math.hypot(gx, gz) > 1e-6) this.up.set(gx, gz).normalize();
    this.yaw = Math.atan2(this.up.x, this.up.y);
    this.slope = this.gradientAt(pos.x, pos.z).length();
    this.escalando = true;
    this.speed = 0;
    this.flapWas = true; // the Space of a jump into the wall does not jump off at once
    this.nextStep = this.distancia + this.stepLength;
    this.alvoQuaternion(this.quaternion);
    this.emit("enter");
  }

  /** Let go without an exit (teleport, mounting): no event. */
  soltar() {
    this.escalando = false;
    this.speed = 0;
  }

  /** The body pose for the current uphill direction and slope: yaw uphill, pitched forward by 90° − slope angle. */
  private alvoQuaternion(out: THREE.Quaternion) {
    const tilt = Math.PI / 2 - Math.atan(Math.max(this.slope, this.params.exitSlope));
    return out.setFromEuler(_e.set(tilt, this.yaw, 0));
  }

  /**
   * One fixed step on the wall. `c.throttle` = up/down the slope, `c.roll` = sideways along it, `c.flap` = jump off.
   * Moves along the tangent plane at `climbSpeed`, y follows heightAt, obstacles push out, water stops.
   * Returns null while climbing, or the exit: { motivo, x, z, vx, vz, vy } (topo/chao: stand at x,z; pulo: launch).
   */
  update(dt: number, c: Controls): SaidaEscalada | null {
    if (!this.escalando) return null;
    const p = this.params, h = this.ground.heightAt, pos = this.position;
    const flapPressed = c.flap && !this.flapWas;
    this.flapWas = c.flap;

    if (flapPressed) {
      const vy = Math.sqrt(2 * p.gravity * p.jumpOffHeight);
      return this.sair({ motivo: "pulo", x: pos.x, z: pos.z, vx: -this.up.x * p.jumpOffSpeed, vz: -this.up.y * p.jumpOffSpeed, vy });
    }

    // input in the wall's frame: W up the slope, D to her right (she faces uphill)
    let t = c.throttle, r = c.roll;
    const len = Math.hypot(t, r);
    if (len > 1) { t /= len; r /= len; }
    const ux = this.up.x, uz = this.up.y, rx = -uz, rz = ux;
    const s = Math.max(this.slope, 0.1);
    // horizontal run of one metre along the surface uphill = 1/√(1+s²)
    const k = p.climbSpeed * dt, kUp = k / Math.sqrt(1 + s * s);
    const x0 = pos.x, y0 = pos.y, z0 = pos.z;
    let nx = x0 + ux * t * kUp + rx * r * k, nz = z0 + uz * t * kUp + rz * r * k;
    if (this.ground.isWaterAt(nx, nz)) return this.sair({ motivo: "agua", x: x0, z: z0, vx: 0, vz: 0, vy: 0 });
    pos.set(nx, y0, nz);
    if (this.ground.obstacles) this.ground.obstacles.resolve(pos, this.bodyRadius);
    nx = pos.x; nz = pos.z;
    pos.y = h(nx, nz);

    const d = Math.hypot(nx - x0, pos.y - y0, nz - z0);
    this.speed = d / dt;
    this.distancia += d;
    if (this.distancia >= this.nextStep) {
      this.nextStep = this.distancia + this.stepLength;
      this.emit("step", this.distancia);
    }

    // the uphill direction follows the wall where it is steep enough to tell
    const g = this.gradientAt(nx, nz);
    this.slope = g.length();
    if (this.slope > 0.3) {
      const a = Math.atan2(g.x, g.y);
      const da = Math.atan2(Math.sin(a - this.yaw), Math.cos(a - this.yaw));
      this.yaw += da * (1 - Math.exp(-10 * dt));
      this.up.set(Math.sin(this.yaw), Math.cos(this.yaw));
    }
    this.quaternion.slerp(this.alvoQuaternion(_q), 1 - Math.exp(-12 * dt));

    // the top: the ground ahead (uphill) flattens → step over the edge; the foot: going down and the ground behind is flat
    const L = p.lookAhead;
    const dy = pos.y - y0;
    if (dy > 0 && this.riseAlong(nx, nz, this.up.x, this.up.y, L) < p.exitSlope)
      return this.sair({ motivo: "topo", x: nx + this.up.x * L, z: nz + this.up.y * L, vx: 0, vz: 0, vy: 0 });
    if (dy < 0 && -this.riseAlong(nx, nz, -this.up.x, -this.up.y, L) < p.exitSlope)
      return this.sair({ motivo: "chao", x: nx - this.up.x * 0.4, z: nz - this.up.y * 0.4, vx: 0, vz: 0, vy: 0 });
    return null;
  }

  private sair(s: SaidaEscalada) {
    this.escalando = false;
    this.speed = 0;
    this.emit("exit", s.motivo);
    return s;
  }
}
