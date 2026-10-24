import type { HeightAt } from "../core/types";

/**
 * What covers the ground. The terrain palette, the minimap colours and the vegetation rules are keyed by this, so a
 * game that needs a new biome adds it here (and a colour in the terrain's palette option) rather than in the mesh code.
 */
export type Biome = "water" | "sand" | "field" | "forest" | "rock" | "snow" | "village" | "path" | "lava" | "ash" | "mud";

/**
 * A map by composition (the first game's lesson: "a cave closer to the lake" is a constant to edit, never a heightmap
 * image). Each island of each game implements this; the engine's terrain, vegetation, water, minimap and compass only
 * ever read it. `heightAt` is a property (not a method) so it can be passed around unbound.
 */
export interface WorldMap {
  /** Side of the square the map lives in (m), centred on the origin. */
  readonly size: number;
  /** Absolute y of the water surface. */
  readonly waterLevel: number;
  /** Terrain height at (x, z) in metres (absolute y). The single source of collision. */
  readonly heightAt: HeightAt;
  isWaterAt(x: number, z: number): boolean;
  /** Terrain gradient magnitude (rise over run) at (x, z). */
  slopeAt(x: number, z: number, e?: number): number;
  /** What covers the ground here. `h` and `slope` may be passed when already known (mesh building). */
  biomeAt(x: number, z: number, h?: number, slope?: number): Biome;
  /** 0..1: how deep inside the woods (0 = open country). */
  forestAt(x: number, z: number): number;
  /** Distance to the nearest path centreline (m); Infinity when the map has no paths. */
  pathDistance(x: number, z: number): number;
  /** Is (x, z) inside dry land? Cheap test for placing things. */
  onLand(x: number, z: number): boolean;
}

/** Clamp a coordinate to the map square. */
export const inMap = (v: number, size: number) => Math.min(Math.max(v, -size / 2), size / 2);
