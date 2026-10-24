import * as THREE from "three";
import type { Controls, Ground, Phase } from "../core/types";
import { smoothDamp, smoothDampAngle, type DampState } from "../core/math";

export interface FlightParams {
  minSpeed: number;
  cruiseSpeed: number;
  maxSpeed: number;
  /** Radians of heading per mouse pixel. */
  mouseSens: number;
  /** Mouse up = climb (true) or nose down like a flight sim (false). */
  mouseUpIsClimb: boolean;
  /** rad/s while arrows / A-D are held (secondary to the mouse). */
  pitchRate: number;
  turnRate: number;
  maxPitch: number;
  maxBank: number;
  /** How fast the heading follows the mouse target (1/s): the spring's settle time is ≈ 1/turnResponse. */
  turnResponse: number;
  pitchResponse: number;
  /** Bank angle per rad/s of turn: the roll is a consequence of turning, not an input. */
  bankGain: number;
  rollResponse: number;
  /** How fast the nose returns to level once the mouse stops (1/s). A child never ends up upside down. */
  autoLevel: number;
  /** Seconds of mouse stillness before the auto-level kicks in (a slow, deliberate push has empty frames). */
  autoLevelDelay: number;
  /** m/s² gained per unit of downward slope (dive accelerates, climb brakes). */
  diveGain: number;
  /** Pull toward cruise speed (1/s). Low = long glides. */
  drag: number;
  /** m/s² while W is held. */
  accel: number;
  /** m/s² while flapping (space). Flapping also holds the nose. */
  flapAccel: number;
  /** 1/s toward minSpeed while braking (shift or S). */
  brakeRate: number;
  /** Below cruise speed she sinks gently instead of stalling: m/s of sink at zero speed (flapping cancels it). */
  sinkRate: number;
  /** Below this speed, touching the ground is a landing instead of a bounce. */
  landSpeed: number;
  /** Feet height (m) under which a slow flier gets into the landing pose. */
  landingHeight: number;
  walkSpeed: number;
  runSpeed: number;
  /** 1/s: how fast the feet reach the asked walking speed (also how fast the landing run-off dies). */
  walkAccel: number;
  /** 1/s: how fast the body turns toward the walking direction. */
  walkTurnResponse: number;
  /** 1/s: how fast the ground camera orbit follows the mouse (filters the per-event steps). */
  orbitResponse: number;
  /** Jump height (m) for a tap of space on the ground. */
  jumpHeight: number;
  gravity: number;
  /** Holding space longer than this (s) turns the jump into a take-off. */
  takeoffHold: number;
  /** How long (s) the wings beat on their own after leaving the ground. */
  takeoffTime: number;
  /** Terrain gradient (rise over run) above which the feet slide downhill. */
  slideSlope: number;
  /** Slide speed (m/s) per unit of gradient above `slideSlope`. */
  slideSpeed: number;
  /** m/s the shore pushes her back when a step would enter the water. */
  shorePush: number;
}

export const DEFAULT_FLIGHT: FlightParams = {
  minSpeed: 14,
  cruiseSpeed: 38,
  maxSpeed: 95,
  mouseSens: 0.0022,
  mouseUpIsClimb: true,
  pitchRate: 1.3,
  turnRate: 1.6,
  maxPitch: Math.PI / 3, // 60°
  maxBank: 1.15,
  turnResponse: 4,
  pitchResponse: 5,
  bankGain: 0.9,
  rollResponse: 5,
  autoLevel: 0.9,
  autoLevelDelay: 0.3,
  diveGain: 22,
  drag: 0.35,
  accel: 16,
  flapAccel: 24,
  brakeRate: 1.6,
  sinkRate: 9,
  landSpeed: 24,
  landingHeight: 14,
  walkSpeed: 9,
  runSpeed: 18,
  walkAccel: 5,
  walkTurnResponse: 8,
  orbitResponse: 20,
  jumpHeight: 3,
  gravity: 25,
  takeoffHold: 0.25,
  takeoffTime: 1.0,
  slideSlope: 0.7,
  slideSpeed: 14,
  shorePush: 5,
};

export interface FlightEvents {
  /** Touched down; `speed` is the touchdown speed (m/s). */
  land: (speed: number) => void;
  takeoff: () => void;
  jump: () => void;
}

const dampAngle = (a: number, target: number, lambda: number, dt: number) => {
  const d = Math.atan2(Math.sin(target - a), Math.cos(target - a));
  return a + d * (1 - Math.exp(-lambda * dt));
};
const { damp, clamp } = THREE.MathUtils;

/**
 * Mouse-aimed arcade flight: the mouse moves the heading target (yaw and pitch), the body follows it,
 * and the bank angle comes from the turn rate. W/S accelerate/brake, space flaps, shift brakes.
 * On the ground the mouse orbits the camera and WASD walks relative to it (Zelda style), shift runs,
 * a tap of space hops, holding space takes off. Slow and low over land she lands and runs off a few steps.
 * Local frame: forward = +Z, right = -X. Positive pitch = nose up, positive roll = bank right.
 */
export class DragonFlight {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly forward = new THREE.Vector3(0, 0, 1);
  yaw = Math.PI;
  pitch = 0;
  roll = 0;
  targetYaw = Math.PI;
  targetPitch = 0;
  /** Camera heading while on the ground (mouse orbit); equals yaw in the air. Follows `orbitTarget` with a fast damp. */
  orbitYaw = Math.PI;
  orbitTarget = Math.PI;
  speed: number;
  phase: Phase = "air";
  /** Feet height above the floor during a hop (m). */
  hop = 0;
  /** Seconds left of the automatic wing beat after leaving the ground (0 = not taking off). */
  takeoffLeft = 0;
  /** Slow and low over land: wings open, legs out. */
  landing = false;
  /** Yaw change this frame (rad/s), for leaning the head and the tail. */
  yawRate = 0;
  /** Metres walked, for the gait. */
  gaitDistance = 0;
  /** Body radius for collisions (m), as a fraction of the length set by `setLength`. */
  bodyRadius = 1;
  /** Set when she bumped into an obstacle this frame (for sound and dust). */
  bumped = false;
  /** 0.5..1: scales cruise/max/walk/run speeds; main lowers it when she is very hungry or tired. */
  vigor = 1;
  private vy = 0;
  /** Spring velocities of the heading and the pitch in the air (second order: no frame-time noise in the roll). */
  private yawV: DampState = { v: 0 };
  private pitchV: DampState = { v: 0 };
  private flapHeld = 0;
  private flapWas = false;
  private steerIdle = 0;
  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private move = new THREE.Vector3();
  /** Horizontal ground velocity (m/s): walking + landing run-off. */
  private vel = new THREE.Vector3();
  private grad = new THREE.Vector2();
  private listeners: { [K in keyof FlightEvents]?: FlightEvents[K][] } = {};

  constructor(
    readonly params: FlightParams,
    private ground: Ground,
    /** Distance from the pivot to the feet (m), so the body rests on the ground. Set from the model. */
    public groundOffset: number,
  ) {
    this.speed = params.cruiseSpeed;
  }

  on<K extends keyof FlightEvents>(type: K, fn: FlightEvents[K]) {
    ((this.listeners[type] ??= []) as FlightEvents[K][]).push(fn);
  }
  private emit<K extends keyof FlightEvents>(type: K, ...args: Parameters<FlightEvents[K]>) {
    const fns = (this.listeners[type] ?? []) as unknown as ((...a: unknown[]) => void)[];
    for (const fn of fns) fn(...args);
  }


  get grounded() {
    return this.phase === "ground";
  }

  /** Height of the feet above the floor (0 when standing). */
  get altitude() {
    return this.position.y - this.groundOffset - this.ground.heightAt(this.position.x, this.position.z);
  }

  /** The heading the camera should sit behind. */
  get cameraYaw() {
    return this.grounded ? this.orbitYaw : this.yaw;
  }

  /** Horizontal speed over the ground (m/s): walking, run-off and sliding. */
  get groundSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Terrain gradient (dh/dx, dh/dz) under a point. */
  private gradientAt(x: number, z: number) {
    const e = 1.5, h = this.ground.heightAt;
    return this.grad.set((h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e));
  }

  update(dt: number, c: Controls) {
    const flapPressed = c.flap && !this.flapWas;
    this.flapWas = c.flap;
    this.flapHeld = c.flap ? this.flapHeld + dt : 0;

    if (this.grounded) this.updateGround(dt, c, flapPressed);
    else this.updateAir(dt, c);

    this.euler.set(-this.pitch, this.yaw, this.roll);
    this.quaternion.setFromEuler(this.euler);
    this.forward.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  private updateAir(dt: number, c: Controls) {
    const p = this.params;
    this.takeoffLeft = Math.max(0, this.takeoffLeft - dt);
    const flap = c.flap || this.takeoffLeft > 0;

    this.targetYaw -= c.lookX * p.mouseSens + c.roll * p.turnRate * dt;
    this.targetPitch += (p.mouseUpIsClimb ? -c.lookY : c.lookY) * p.mouseSens + c.pitch * p.pitchRate * dt;
    this.steerIdle = c.lookY !== 0 || c.pitch !== 0 ? 0 : this.steerIdle + dt;
    if (this.steerIdle > p.autoLevelDelay && !flap) this.targetPitch = damp(this.targetPitch, 0, p.autoLevel, dt);
    if (c.brake) this.targetPitch = damp(this.targetPitch, 0.25, 3, dt);
    this.targetPitch = clamp(this.targetPitch, -p.maxPitch, p.maxPitch);

    // critically damped springs (the first game's docs/ENGINES.md §3, fix B2): the turn starts and ends smoothly and the bank comes from the
    // spring's own velocity, not from a frame-to-frame difference
    this.yaw = smoothDampAngle(this.yaw, this.targetYaw, this.yawV, 1 / p.turnResponse, dt);
    this.pitch = smoothDamp(this.pitch, this.targetPitch, this.pitchV, 1 / p.pitchResponse, dt);
    this.yawRate = this.yawV.v;
    const rollTarget = clamp(-this.yawRate * p.bankGain, -p.maxBank, p.maxBank);
    this.roll = damp(this.roll, rollTarget, p.rollResponse, dt);
    this.orbitYaw = this.orbitTarget = this.yaw;

    const cruise = p.cruiseSpeed * this.vigor, max = p.maxSpeed * this.vigor;
    this.speed += -Math.sin(this.pitch) * p.diveGain * dt;
    // landing flare: slow and low, the wings brake instead of the glide pulling her back to cruise
    if (this.landing && !flap && c.throttle <= 0) this.speed += (p.minSpeed - this.speed) * p.brakeRate * 0.6 * dt;
    else this.speed += (cruise - this.speed) * p.drag * dt;
    if (c.throttle > 0) this.speed += p.accel * c.throttle * dt;
    if (flap) this.speed += p.flapAccel * dt;
    if (c.brake || c.throttle < 0) this.speed += (p.minSpeed - this.speed) * p.brakeRate * dt;
    this.speed = clamp(this.speed, p.minSpeed, max);

    this.euler.set(-this.pitch, this.yaw, this.roll);
    this.quaternion.setFromEuler(this.euler);
    this.forward.set(0, 0, 1).applyQuaternion(this.quaternion);
    this.position.addScaledVector(this.forward, this.speed * dt);
    if (!flap && this.speed < cruise) this.position.y -= p.sinkRate * (1 - this.speed / cruise) * dt;

    const x = this.position.x, z = this.position.z;
    const water = this.ground.isWaterAt(x, z);
    const floor = this.ground.heightAt(x, z) + this.groundOffset;
    const slow = this.speed <= p.landSpeed && this.pitch < 0.35;
    this.landing = !water && slow && this.takeoffLeft === 0 && this.position.y - floor < p.landingHeight && this.forward.y < 0.1;
    // trees and rocks: pushed out, and the bump costs speed
    this.bumped = false;
    if (this.ground.obstacles && this.ground.obstacles.resolve(this.position, this.bodyRadius) > 0) {
      this.bumped = true;
      this.speed = Math.max(p.minSpeed, this.speed * 0.9);
    }

    if (this.position.y < floor) {
      this.position.y = floor;
      if (!water && this.speed <= p.landSpeed * 1.15 && this.pitch < 0.35) this.touchDown();
      else {
        // skim: never crash, never sink. Nose up and lose some speed.
        this.targetPitch = Math.max(this.targetPitch, 0.25);
        this.pitch = Math.max(this.pitch, 0.2);
        this.speed = Math.max(p.minSpeed, this.speed * 0.985);
      }
    }
  }

  private touchDown() {
    const p = this.params;
    this.phase = "ground";
    this.landing = false;
    this.hop = this.vy = 0;
    this.orbitYaw = this.orbitTarget = this.yaw;
    // run off a few steps: the touchdown speed dies with walkAccel
    this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(Math.min(this.speed, p.runSpeed));
    this.emit("land", this.speed);
    this.speed = 0;
  }

  private updateGround(dt: number, c: Controls, flapPressed: boolean) {
    const p = this.params;
    this.orbitTarget -= c.lookX * p.mouseSens;
    this.orbitYaw = dampAngle(this.orbitYaw, this.orbitTarget, p.orbitResponse, dt);

    // walk relative to the camera: W away from it, A/D sideways; shift runs
    const sin = Math.sin(this.orbitYaw), cos = Math.cos(this.orbitYaw);
    this.move.set(sin * c.throttle - cos * c.roll, 0, cos * c.throttle + sin * c.roll);
    const len = Math.min(1, this.move.length());
    if (len > 0) this.move.normalize().multiplyScalar(len * (c.brake ? p.runSpeed : p.walkSpeed) * this.vigor);
    this.vel.x = damp(this.vel.x, this.move.x, p.walkAccel, dt);
    this.vel.z = damp(this.vel.z, this.move.z, p.walkAccel, dt);

    // steep slopes: slide downhill
    const g = this.gradientAt(this.position.x, this.position.z);
    const slope = g.length();
    let sx = 0, sz = 0;
    if (slope > p.slideSlope) {
      const k = (slope - p.slideSlope) * p.slideSpeed / slope;
      sx = -g.x * k; sz = -g.y * k;
    }

    // the body faces where it goes; only input turns it (the run-off and the slide don't)
    const prevYaw = this.yaw;
    if (len > 0) this.yaw = dampAngle(this.yaw, Math.atan2(this.move.x, this.move.z), p.walkTurnResponse, dt);
    this.yawRate = (this.yaw - prevYaw) / dt;

    // hop: a tap of space; holding it beats the wings and takes off
    if (flapPressed && this.hop <= 0) {
      this.vy = Math.sqrt(2 * p.gravity * p.jumpHeight);
      this.emit("jump");
    }
    if (this.hop > 0 || this.vy > 0) {
      this.vy -= p.gravity * dt;
      this.hop = Math.max(0, this.hop + this.vy * dt);
      if (this.hop === 0) this.vy = 0;
    }
    if (c.flap && this.flapHeld >= p.takeoffHold) {
      this.takeOff();
      return;
    }

    // step, but never into the water: the shore pushes back
    let nx = this.position.x + (this.vel.x + sx) * dt, nz = this.position.z + (this.vel.z + sz) * dt;
    if (this.ground.isWaterAt(nx, nz)) {
      const n = Math.max(slope, 1e-3);
      nx = this.position.x + (g.x / n) * p.shorePush * dt;
      nz = this.position.z + (g.y / n) * p.shorePush * dt;
      this.vel.set(0, 0, 0);
    }
    this.gaitDistance += Math.hypot(nx - this.position.x, nz - this.position.z);
    this.position.x = nx;
    this.position.z = nz;
    this.position.y = this.ground.heightAt(nx, nz) + this.groundOffset + this.hop;
    this.bumped = false;
    if (this.ground.obstacles && this.ground.obstacles.resolve(this.position, this.bodyRadius) > 0) {
      // walked into a tree: stay out of it, keep the feet on the ground, lose the momentum
      this.bumped = true;
      this.position.y = this.ground.heightAt(this.position.x, this.position.z) + this.groundOffset + this.hop;
      this.vel.multiplyScalar(0.2);
    }
    this.speed = this.groundSpeed;

    // the body follows the slope under the feet (nose up going uphill, bank with the side slope)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const along = g.x * fx + g.y * fz, across = g.x * -fz + g.y * fx; // across > 0 = higher on the right
    const tilt = this.hop > 0 ? 0 : 0.6;
    this.pitch = damp(this.pitch, Math.atan(along) * tilt, 6, dt);
    this.roll = damp(this.roll, -Math.atan(across) * tilt, 6, dt);
  }

  /** A knock back (a bite, a bump): a little hop back, away from (x, z). Ground only; the run-off dies with walkAccel. */
  recuar(x: number, z: number, speed = 7) {
    if (this.phase !== "ground") return;
    const dx = this.position.x - x, dz = this.position.z - z, l = Math.hypot(dx, dz) || 1;
    this.vel.set((dx / l) * speed, 0, (dz / l) * speed);
    this.vy = Math.sqrt(2 * this.params.gravity * this.params.jumpHeight * 0.4);
  }

  private takeOff() {
    const p = this.params;
    this.phase = "air";
    this.takeoffLeft = p.takeoffTime;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch = 0.45;
    this.roll = 0;
    this.yawV.v = this.pitchV.v = 0;
    this.speed = Math.max(p.minSpeed, this.groundSpeed + 6);
    this.position.y += this.hop;
    this.hop = this.vy = 0;
    this.vel.set(0, 0, 0);
    this.emit("takeoff");
  }

  /** Put her standing on the ground at (x, z), facing `yaw`. */
  placeOnGround(x: number, z: number, yaw = Math.PI) {
    this.place(x, z, 0, yaw);
    this.phase = "ground";
    this.speed = 0;
  }

  /** Teleport to (x, z) at `altitude` over the floor, level, at cruise speed. */
  place(x: number, z: number, altitude: number, yaw = Math.PI) {
    this.position.set(x, this.ground.heightAt(x, z) + this.groundOffset + altitude, z);
    this.yaw = this.targetYaw = this.orbitYaw = this.orbitTarget = yaw;
    this.pitch = this.targetPitch = this.roll = 0;
    this.yawV.v = this.pitchV.v = 0;
    this.phase = "air";
    this.landing = false;
    this.takeoffLeft = this.hop = this.vy = 0;
    this.vel.set(0, 0, 0);
    this.speed = this.params.cruiseSpeed;
  }
}
