import * as THREE from "three";
import type { Collider, HeightAt } from "./types";
import { clamp, smoothDamp, smoothDampAngle, type DampState } from "./math";

/**
 * Every distance is in metres: each actor passes its own (a 1.6 m person and a 9 m mount need different numbers; a
 * creature that grows rescales them).
 */
export interface CameraParams {
  /** Distance behind the target (m), at cruise speed and zero pitch. */
  distance: number;
  /** Height of the camera above the target's position (m), at zero pitch. */
  height: number;
  /** Height above the target's position the camera aims at and orbits around (m): the chest of a person. */
  lookHeight: number;
  /** Seconds for the camera heading (and the orbit pitch) to catch up with the target's (critically damped spring). */
  yawSmooth: number;
  /** Seconds for the distance (speed zoom, walls) and the terrain lift to settle. */
  distSmooth: number;
  /** How far ahead of the target the camera looks (m). */
  lookAhead: number;
  /** Extra distance per unit of speed above cruise (fraction); 0 = no speed zoom. */
  speedZoom: number;
  fov: number;
  /** Extra FOV degrees at max speed. */
  fovSpeed: number;
  /** Minimum clearance above the terrain (m). */
  groundClearance: number;
  /** Orbit pitch limits (rad; positive = camera above, looking down). */
  minPitch: number;
  maxPitch: number;
  /** Radius of the camera when pushed out of obstacles (m). */
  radius: number;
  /** Points tested on the segment target → camera for walls and hills (0 = no occlusion test). */
  samples: number;
}

/** A person of ~1.6 m walking (the speed zoom is mild: running pulls the camera back a little). */
export const DEFAULT_CAMERA: CameraParams = {
  distance: 5,
  height: 1.9,
  lookHeight: 1.3,
  yawSmooth: 0.1,
  distSmooth: 0.3,
  lookAhead: 1,
  speedZoom: 0.15,
  fov: 65,
  fovSpeed: 8,
  groundClearance: 0.4,
  minPitch: -0.35,
  maxPitch: 1.2,
  radius: 0.3,
  samples: 8,
};

export interface FollowTarget {
  position: THREE.Vector3;
  /** Heading the camera sits behind: a flier's yaw in the air, the orbit yaw on foot. */
  yaw: number;
  /** Orbit pitch (rad, positive = camera higher looking down); clamped to the params' limits. Omitted = 0. */
  pitch?: number;
  /** Speed (m/s) and the two references of the speed zoom and FOV. */
  speed: number;
  cruiseSpeed: number;
  maxSpeed: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Keeps the camera out of solid scenery (e.g. inside a cave): moves `pos` to a free spot. */
export type CameraLimit = (pos: THREE.Vector3) => void;

/**
 * Third-person camera locked to the target (the first game's docs/ENGINES.md §3, fix A): its position is the target
 * plus an offset built from a *smoothed heading*, a *smoothed orbit pitch* and a *smoothed distance* (second-order
 * springs, no overshoot), so the lag never depends on speed × frame time. It looks at the target (plus look-ahead);
 * the horizon stays level.
 *
 * Order: offset → terrain lift (at once when the ground comes up, a spring back down) → occlusion (if a hill or an
 * obstacle sits between the target and the camera, the camera comes in to the last free point at once, and springs
 * back out) → pushed out of obstacle spheres → the `limit` hook.
 */
export class FollowCamera {
  private yaw = 0;
  private pitch = 0;
  private dist = 0;
  private lift = 0;
  private fov = 0;
  /** 0..1 of the arm that is free of walls. */
  private free = 1;
  private yawV: DampState = { v: 0 };
  private pitchV: DampState = { v: 0 };
  private distV: DampState = { v: 0 };
  private liftV: DampState = { v: 0 };
  private fovV: DampState = { v: 0 };
  private freeV: DampState = { v: 0 };
  private forward = new THREE.Vector3();
  private pivot = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private probe = new THREE.Vector3();
  private initialized = false;
  private presets = new Map<string, Partial<CameraParams>>();
  private _preset: string | null = null;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly params: CameraParams,
    private heightAt: HeightAt,
    /** Optional: called with the camera spot before it is applied (e.g. keep it inside a cave). */
    public limit?: CameraLimit,
    /** Optional: trees, rocks, houses. The camera stays out of them and comes in when one blocks the view. */
    public obstaculos?: Collider,
  ) {}

  /** Names a set of params (on foot, mounted, indoors...) for `preset`. Re-registering a name replaces it. */
  registrarPreset(nome: string, params: Partial<CameraParams>) {
    this.presets.set(nome, { ...params });
  }

  /**
   * Assigns the preset's keys onto `params` (only the keys it has; the rest stay). No-op when `nome` is the current
   * one, so it can be called every frame. Does not snap.
   */
  preset(nome: string) {
    if (nome === this._preset) return;
    const p = this.presets.get(nome);
    if (!p) throw new Error(`FollowCamera: preset "${nome}" não registrado (tem: ${[...this.presets.keys()].join(", ")})`);
    Object.assign(this.params, p);
    this._preset = nome;
  }

  /** The last preset applied, or null. */
  get presetAtual() {
    return this._preset;
  }

  /** Forget the springs (after a teleport the camera should not swing round). */
  snap() {
    this.initialized = false;
  }

  /** Current distance from the orbit pivot to the camera (m), walls included. */
  get distanciaAtual() {
    return this.dist * this.free;
  }

  update(dt: number, t: FollowTarget) {
    const p = this.params;
    const speedRatio = t.cruiseSpeed > 0 ? t.speed / t.cruiseSpeed : 0;
    const distTarget = p.distance * (1 + p.speedZoom * Math.max(0, speedRatio - 1));
    const fovRange = t.maxSpeed - t.cruiseSpeed;
    const fovTarget = p.fov + (fovRange > 0 ? p.fovSpeed * clamp((t.speed - t.cruiseSpeed) / fovRange, 0, 1) : 0);
    const pitchTarget = clamp(t.pitch ?? 0, p.minPitch, p.maxPitch);

    if (!this.initialized) {
      this.yaw = t.yaw; this.pitch = pitchTarget; this.dist = distTarget; this.lift = 0; this.fov = fovTarget; this.free = 1;
      this.yawV.v = this.pitchV.v = this.distV.v = this.liftV.v = this.fovV.v = this.freeV.v = 0;
      this.initialized = true;
    }
    this.yaw = smoothDampAngle(this.yaw, t.yaw, this.yawV, p.yawSmooth, dt);
    this.pitch = smoothDamp(this.pitch, pitchTarget, this.pitchV, p.yawSmooth, dt);
    this.dist = smoothDamp(this.dist, distTarget, this.distV, p.distSmooth, dt);
    this.forward.set(0, 0, 1).applyAxisAngle(UP, this.yaw);

    // orbit round the pivot (at pitch 0 this is exactly "distance back, height up")
    this.pivot.copy(t.position);
    this.pivot.y += p.lookHeight;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.pos.copy(this.pivot).addScaledVector(this.forward, -this.dist * cp);
    this.pos.y += this.dist * sp + (p.height - p.lookHeight);

    // terrain: lift at once when the ground comes up, settle back down with the spring
    const floor = this.heightAt(this.pos.x, this.pos.z) + p.groundClearance;
    const liftTarget = Math.max(0, floor - this.pos.y);
    this.lift = smoothDamp(this.lift, liftTarget, this.liftV, p.distSmooth, dt);
    if (this.lift < liftTarget) { this.lift = liftTarget; this.liftV.v = 0; }
    this.pos.y += this.lift;

    // occlusion: walk the arm from the pivot out; the first blocked sample sets how much of it is free
    const freeTarget = this.freeFraction();
    this.free = smoothDamp(this.free, freeTarget, this.freeV, p.distSmooth, dt);
    if (this.free > freeTarget) { this.free = freeTarget; this.freeV.v = 0; }
    if (this.free < 1) this.pos.lerpVectors(this.pivot, this.pos, this.free);
    this.obstaculos?.resolve(this.pos, p.radius);
    this.limit?.(this.pos);
    this.camera.position.copy(this.pos);

    this.look.copy(this.pivot).addScaledVector(this.forward, p.lookAhead);
    this.camera.lookAt(this.look);

    this.fov = smoothDamp(this.fov, fovTarget, this.fovV, p.distSmooth, dt);
    if (Math.abs(this.fov - this.camera.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Fraction (0..1) of the segment pivot → `pos` before the first sample under the terrain or inside an obstacle. */
  private freeFraction() {
    const p = this.params, n = p.samples;
    if (n <= 0) return 1;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      this.probe.lerpVectors(this.pivot, this.pos, f);
      const underground = this.probe.y < this.heightAt(this.probe.x, this.probe.z) + p.groundClearance * 0.5;
      const inside = !!this.obstaculos && this.obstaculos.resolve(this.probe, p.radius) > 0;
      if (underground || inside) return Math.max(0.05, (i - 1) / n);
    }
    return 1;
  }
}
