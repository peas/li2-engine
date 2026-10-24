import type * as THREE from "three";

/**
 * What the player is asking for this frame, whatever the device. The names come from the flight model (the first
 * game); on foot the same fields mean: `throttle` forward/back, `roll` strafe, `flap` jump, `brake` run.
 */
export interface Controls {
  /** -1..1 from arrows / left stick, positive = nose up (secondary to the mouse). */
  pitch: number;
  /** -1..1 from A/D / left stick, positive = turn right (in the air: adds to the mouse turn; on the ground: strafe). */
  roll: number;
  /** -1..1: W accelerates, S brakes (on the ground: walk forward / back). */
  throttle: number;
  /** Wing beat: speed boost in the air, take-off on the ground. On foot: jump. */
  flap: boolean;
  /** Air brake. On foot: run. */
  brake: boolean;
  /** Mouse (or right stick) movement this frame, in pixels. Positive x = right, positive y = down. */
  lookX: number;
  lookY: number;
}

export const CONTROLS_ZERO: Readonly<Controls> = { pitch: 0, roll: 0, throttle: 0, flap: false, brake: false, lookX: 0, lookY: 0 };

/** Terrain height sampler shared by the locomotion models and the camera. */
export type HeightAt = (x: number, z: number) => number;

/** Something that keeps an actor out of (or inside) solid scenery: trees, rocks, houses, cave walls. */
export interface Collider {
  /** Move `pos` (a sphere of `radius`) to a free spot; returns the push distance (0 = nothing hit). */
  resolve(pos: THREE.Vector3, radius: number): number;
}

/** The floor an actor stands on and the water it must not enter. The game composes it (terrain + ice + shallows...). */
export interface Ground {
  /** Floor height: terrain, or the water surface where the terrain is under it. */
  heightAt: HeightAt;
  /** Deep water is scenery: nobody walks into it (flying over it is fine). */
  isWaterAt: (x: number, z: number) => boolean;
  /** Wading: terrain under the water but walkable (rings at the feet, splashes). Optional. */
  rasaAt?: (x: number, z: number) => boolean;
  /** Trees, rocks, houses, cave walls (optional). */
  obstacles?: Collider;
}

/** "ground" = feet on the floor (walking, hopping); "air" = flying (take-off and landing are flags inside it). */
export type Phase = "ground" | "air";

/** A point on the map with a heading and a footprint (every `PLACES` entry of a game is at least this). */
export interface Spot {
  x: number;
  z: number;
  /** Heading it faces (rad, 0 = +z, like the flight yaw). */
  yaw: number;
  /** Footprint radius (m). */
  radius: number;
}

export const spot = (x: number, z: number, radius: number, yaw = 0): Spot => ({ x, z, yaw, radius });
export const headingTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);

/** In front of a building's door (`s.yaw` = where the door looks), `afastar` m past its footprint. */
export const naFrente = (s: Spot, afastar = 3): Spot => ({
  x: s.x + Math.sin(s.yaw) * (s.radius + afastar),
  z: s.z + Math.cos(s.yaw) * (s.radius + afastar),
  yaw: s.yaw,
  radius: 1,
});

/** The `i`-th of `n` people standing around a square, `raio` m from its centre, facing it (spread by index). */
export function naPraca(centro: { x: number; z: number }, i: number, n: number, raio = 12): Spot {
  const a = Math.PI * 0.25 + (i / Math.max(1, n)) * Math.PI * 2;
  const x = centro.x + Math.sin(a) * raio, z = centro.z + Math.cos(a) * raio;
  return { x, z, yaw: Math.atan2(centro.x - x, centro.z - z), radius: 1 };
}
