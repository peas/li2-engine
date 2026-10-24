import * as THREE from "three";
import type { Controls, Ground } from "../core/types";
import { clamp, damp } from "../core/math";

/** Speeds in m/s, distances in m, rates in 1/s. Defaults: a person of ~1.6 m. */
export interface WalkerParams {
  walkSpeed: number;
  runSpeed: number;
  /** How fast the feet reach the asked speed (1/s). */
  walkAccel: number;
  /** Fraction of `walkAccel` while in the air (steering a jump). */
  airControl: number;
  /** How fast the body turns toward the walking direction (1/s). */
  walkTurnResponse: number;
  /** Radians of orbit per mouse pixel. */
  mouseSens: number;
  /** How fast the camera orbit follows the mouse (1/s; filters the per-event steps). */
  orbitResponse: number;
  /** Mouse up looks up (camera goes down, true) or the inverse (false). */
  mouseUpIsUp: boolean;
  /** Orbit pitch limits (rad; positive = camera above looking down) and where it starts. */
  minPitch: number;
  maxPitch: number;
  startPitch: number;
  jumpHeight: number;
  gravity: number;
  /** Seconds after walking off an edge in which a jump still works. */
  coyoteTime: number;
  /** Seconds a jump pressed just before landing is kept and fires on touchdown. */
  jumpBuffer: number;
  /** Walking down a drop steeper than this (rise over run) leaves the ground (an edge) instead of following it. */
  snapSlope: number;
  /** Terrain gradient (rise over run) above which the feet slide downhill. */
  slideSlope: number;
  /** Slide speed (m/s) per unit of gradient above `slideSlope`. */
  slideSpeed: number;
  /** m/s the shore pushes back when a step would enter deep water. */
  shorePush: number;
  /** How much the body leans with the slope under the feet (0 = always upright, 1 = parallel to the ground). */
  slopeTilt: number;
}

export const DEFAULT_WALKER: WalkerParams = {
  walkSpeed: 3.5,
  runSpeed: 7,
  walkAccel: 10,
  airControl: 0.4,
  walkTurnResponse: 12,
  mouseSens: 0.0022,
  orbitResponse: 20,
  mouseUpIsUp: true,
  minPitch: -0.35,
  maxPitch: 1.2,
  startPitch: 0.15,
  jumpHeight: 1.2,
  gravity: 22,
  coyoteTime: 0.12,
  jumpBuffer: 0.12,
  snapSlope: 1.5,
  slideSlope: 0.9,
  slideSpeed: 6,
  shorePush: 3,
  slopeTilt: 0.15,
};

export interface WalkerEvents {
  jump: () => void;
  /** Touched down after a jump or a fall; `fallSpeed` = downward speed at touchdown (m/s, ≥ 0). */
  land: (fallSpeed: number) => void;
  /** Every `stepLength` metres walked on the ground (footsteps); `distance` = total metres walked. */
  step: (distance: number) => void;
}

const dampAngle = (a: number, target: number, lambda: number, dt: number) => {
  const d = Math.atan2(Math.sin(target - a), Math.cos(target - a));
  return a + d * (1 - Math.exp(-lambda * dt));
};

/**
 * On-foot controller (Zelda style), only maths: the mouse orbits the camera (yaw and pitch), WASD walks relative to
 * it, Shift runs (`controls.brake`), Space jumps (`controls.flap`) with coyote time and a jump buffer. Steep slopes
 * slide downhill, deep water pushes back, obstacles push out. The body faces where it walks.
 *
 * `position` is the pivot: feet + `groundOffset` (0 for a model whose pivot is at the feet). Local frame: forward =
 * +Z, yaw 0 faces +z. Mapping of `Controls`: throttle = forward/back, roll = strafe, flap = jump, brake = run.
 */
export class Walker {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly forward = new THREE.Vector3(0, 0, 1);
  yaw = 0;
  pitch = 0;
  roll = 0;
  /** Camera orbit (rad): yaw follows `orbitTarget` with a fast damp; pitch is clamped to the params. */
  orbitYaw = 0;
  orbitTarget = 0;
  orbitPitch = 0;
  /** Horizontal speed (m/s), same as `groundSpeed` (kept for code shared with the flight model). */
  speed = 0;
  /** Vertical speed (m/s, positive = up) while in the air. */
  vy = 0;
  /** In the air (jumping or falling). */
  noAr = false;
  /** Yaw change (rad/s), for leaning a head or a tail. */
  yawRate = 0;
  /** Metres walked on the ground, for the gait. */
  gaitDistance = 0;
  /** Distance between footstep events (m). */
  stepLength = 0.75;
  /** Body radius for collisions (m). */
  bodyRadius = 0.35;
  /** Set when it bumped into an obstacle this step. */
  bumped = false;
  /** 0.5..1: scales the walking speeds (tired, hungry...). */
  vigor = 1;
  /** Movement asked by WASD this step, before the acceleration (m/s, horizontal; zero without input). */
  readonly desiredMove = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private grad = new THREE.Vector2();
  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private flapWas = false;
  private coyoteLeft = 0;
  private bufferLeft = 0;
  private nextStep = 0;
  private listeners: { [K in keyof WalkerEvents]?: WalkerEvents[K][] } = {};

  constructor(
    readonly params: WalkerParams,
    private ground: Ground,
    /** Distance from the pivot down to the feet (m). */
    public groundOffset = 0,
  ) {
    this.orbitPitch = params.startPitch;
    this.nextStep = this.stepLength;
  }

  on<K extends keyof WalkerEvents>(type: K, fn: WalkerEvents[K]) {
    ((this.listeners[type] ??= []) as WalkerEvents[K][]).push(fn);
    return () => {
      const l = this.listeners[type] as WalkerEvents[K][];
      l.splice(l.indexOf(fn), 1);
    };
  }
  private emit<K extends keyof WalkerEvents>(type: K, ...args: Parameters<WalkerEvents[K]>) {
    const fns = (this.listeners[type] ?? []) as unknown as ((...a: unknown[]) => void)[];
    for (const fn of fns) fn(...args);
  }

  /** Feet on the floor (false only while jumping or falling). */
  get grounded() {
    return !this.noAr;
  }

  /** Height of the feet above the floor (m; 0 standing). */
  get hop() {
    return Math.max(0, this.position.y - this.groundOffset - this.ground.heightAt(this.position.x, this.position.z));
  }

  get cameraYaw() {
    return this.orbitYaw;
  }

  get cameraPitch() {
    return this.orbitPitch;
  }

  /** Horizontal speed over the ground (m/s): walking and sliding. */
  get groundSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Terrain gradient (rise over run) at (x, z): x = d/dx, y = d/dz. Returns a shared vector (copy it to keep it). */
  gradientAt(x: number, z: number) {
    const e = 0.75, h = this.ground.heightAt;
    return this.grad.set((h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e));
  }

  update(dt: number, c: Controls) {
    const p = this.params;
    const flapPressed = c.flap && !this.flapWas;
    this.flapWas = c.flap;

    this.orbitar(dt, c);

    // walk relative to the camera: W away from it, A/D sideways; shift runs
    const sin = Math.sin(this.orbitYaw), cos = Math.cos(this.orbitYaw);
    this.desiredMove.set(sin * c.throttle - cos * c.roll, 0, cos * c.throttle + sin * c.roll);
    const len = Math.min(1, this.desiredMove.length());
    if (len > 0) this.desiredMove.normalize().multiplyScalar(len * (c.brake ? p.runSpeed : p.walkSpeed) * this.vigor);
    const accel = this.noAr ? p.walkAccel * p.airControl : p.walkAccel;
    this.vel.x = damp(this.vel.x, this.desiredMove.x, accel, dt);
    this.vel.z = damp(this.vel.z, this.desiredMove.z, accel, dt);

    // steep slopes: slide downhill (only with the feet on them)
    const g = this.gradientAt(this.position.x, this.position.z);
    const slope = g.length();
    let sx = 0, sz = 0;
    if (!this.noAr && slope > p.slideSlope) {
      const k = (slope - p.slideSlope) * p.slideSpeed / slope;
      sx = -g.x * k; sz = -g.y * k;
    }

    // the body faces where it goes; only input turns it
    const prevYaw = this.yaw;
    if (len > 0) this.yaw = dampAngle(this.yaw, Math.atan2(this.desiredMove.x, this.desiredMove.z), p.walkTurnResponse, dt);
    this.yawRate = Math.atan2(Math.sin(this.yaw - prevYaw), Math.cos(this.yaw - prevYaw)) / dt;

    // jump: buffered press, allowed on the ground or within the coyote time after leaving it
    this.coyoteLeft = this.noAr ? Math.max(0, this.coyoteLeft - dt) : p.coyoteTime;
    this.bufferLeft = flapPressed ? p.jumpBuffer : Math.max(0, this.bufferLeft - dt);
    this.tryJump();

    // step, but never into deep water: the shore pushes back
    const x0 = this.position.x, z0 = this.position.z;
    let nx = x0 + (this.vel.x + sx) * dt, nz = z0 + (this.vel.z + sz) * dt;
    if (this.ground.isWaterAt(nx, nz)) {
      const n = Math.max(slope, 1e-3);
      nx = x0 + (g.x / n) * p.shorePush * dt;
      nz = z0 + (g.y / n) * p.shorePush * dt;
      this.vel.set(0, 0, 0);
    }
    this.position.x = nx;
    this.position.z = nz;
    this.bumped = false;
    if (this.ground.obstacles && this.ground.obstacles.resolve(this.position, this.bodyRadius) > 0) {
      // walked into a tree: stay out of it, lose the momentum
      this.bumped = true;
      this.vel.multiplyScalar(0.2);
    }

    // vertical: follow the floor, or fly ballistic
    const floor = this.ground.heightAt(this.position.x, this.position.z) + this.groundOffset;
    const moved = Math.hypot(this.position.x - x0, this.position.z - z0);
    if (!this.noAr) {
      const drop = this.position.y - floor;
      if (drop > Math.max(0.05, moved * p.snapSlope)) {
        // walked off an edge: start falling (the coyote time counts from here)
        this.noAr = true;
        this.vy = 0;
      } else {
        this.position.y = floor;
      }
    }
    if (this.noAr) {
      this.vy -= p.gravity * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= floor) {
        this.position.y = floor;
        const fall = Math.max(0, -this.vy);
        this.noAr = false;
        this.vy = 0;
        this.coyoteLeft = p.coyoteTime;
        this.emit("land", fall);
        this.tryJump(); // a buffered press fires on touchdown
      }
    }

    if (!this.noAr && moved > 0) {
      this.gaitDistance += moved;
      if (this.gaitDistance >= this.nextStep) {
        this.nextStep = this.gaitDistance + this.stepLength;
        this.emit("step", this.gaitDistance);
      }
    }
    this.speed = this.groundSpeed;

    // a little lean with the slope under the feet (nose up going uphill, bank with the side slope)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const along = g.x * fx + g.y * fz, across = g.x * -fz + g.y * fx;
    const tilt = this.noAr ? 0 : p.slopeTilt;
    this.pitch = damp(this.pitch, Math.atan(along) * tilt, 6, dt);
    this.roll = damp(this.roll, -Math.atan(across) * tilt, 6, dt);
    this.updateQuaternion();
  }

  /** Only the camera orbit (mouse X turns, Y tilts): for when something else moves the body (climbing). */
  orbitar(dt: number, c: Controls) {
    const p = this.params;
    this.orbitTarget -= c.lookX * p.mouseSens;
    this.orbitYaw = dampAngle(this.orbitYaw, this.orbitTarget, p.orbitResponse, dt);
    this.orbitPitch = clamp(this.orbitPitch + (p.mouseUpIsUp ? c.lookY : -c.lookY) * p.mouseSens, p.minPitch, p.maxPitch);
  }

  private tryJump() {
    if (this.bufferLeft <= 0 || (this.noAr && this.coyoteLeft <= 0) || this.vy > 0) return;
    this.vy = Math.sqrt(2 * this.params.gravity * this.params.jumpHeight);
    this.noAr = true;
    this.bufferLeft = this.coyoteLeft = 0;
    this.emit("jump");
  }

  private updateQuaternion() {
    this.euler.set(-this.pitch, this.yaw, this.roll);
    this.quaternion.setFromEuler(this.euler);
    this.forward.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  /** A knock back: a little hop away from (x, z) at `speed` m/s (the run-off dies with walkAccel). */
  recuar(x: number, z: number, speed = 4) {
    const dx = this.position.x - x, dz = this.position.z - z, l = Math.hypot(dx, dz) || 1;
    this.vel.set((dx / l) * speed, 0, (dz / l) * speed);
    this.vy = Math.sqrt(2 * this.params.gravity * this.params.jumpHeight * 0.4);
    this.noAr = true;
    this.coyoteLeft = 0;
  }

  /** Stand on the floor at (x, z), still, facing `yaw` (default: as now); unlike `placeOnGround` the camera orbit stays. */
  aterrar(x: number, z: number, yaw = this.yaw) {
    this.position.set(x, this.ground.heightAt(x, z) + this.groundOffset, z);
    this.yaw = yaw;
    this.pitch = this.roll = this.yawRate = 0;
    this.vel.set(0, 0, 0);
    this.vy = this.speed = 0;
    this.noAr = false;
    this.coyoteLeft = this.bufferLeft = 0;
    this.flapWas = true; // a Space still held (the one that jumped off a wall) is not a new jump
    this.updateQuaternion();
  }

  /** Leave the ground with this velocity (m/s; vy up): the backward hop off a wall. No coyote jump after it. */
  lancar(vx: number, vz: number, vy: number) {
    this.vel.set(vx, 0, vz);
    this.vy = vy;
    this.noAr = true;
    this.coyoteLeft = this.bufferLeft = 0;
  }

  /** Stand on the floor at (x, z) facing `yaw`, still; the camera orbit goes behind. */
  placeOnGround(x: number, z: number, yaw = 0) {
    this.position.set(x, this.ground.heightAt(x, z) + this.groundOffset, z);
    this.yaw = this.orbitYaw = this.orbitTarget = yaw;
    this.orbitPitch = this.params.startPitch;
    this.pitch = this.roll = this.yawRate = 0;
    this.vel.set(0, 0, 0);
    this.vy = this.speed = 0;
    this.noAr = false;
    this.coyoteLeft = this.bufferLeft = 0;
    this.updateQuaternion();
  }
}
