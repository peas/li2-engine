import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Biome, WorldMap } from "./map";
import { Obstacles, type Obstacle } from "./obstacles";
import { Vegetation, type VegetationParams, type VegetationRules } from "./vegetation";

/**
 * Golden of what `Vegetation` places today, so a new option cannot move a forest that a game already uses. Two small
 * worlds on the same map: the default rules (only a clearing), and a rule set shaped like a real island (`manterLivre`,
 * pines by zone, palms, density, path clearance, smaller trees). Each pins the counts, the obstacle spheres and a hash of
 * every instance matrix and colour. If one changes on purpose, update the expected values in the same commit.
 */

/** A 900 m square with hills, a lake, a path, woods in bands, a rocky and an ashen corner. */
function hillyMap(): WorldMap {
  const heightAt = (x: number, z: number) => 30 + 55 * Math.sin(x / 95) * Math.cos(z / 120) + 20 * Math.sin((x + z) / 60) - (Math.hypot(x + 200, z - 150) < 90 ? 60 : 0);
  const slopeAt = (x: number, z: number, e = 1) => Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const forestAt = (x: number, z: number) => 0.5 + 0.5 * Math.sin(x / 70 + z / 50);
  return {
    size: 900,
    waterLevel: 0,
    heightAt,
    isWaterAt: (x, z) => heightAt(x, z) < 0,
    slopeAt,
    biomeAt(x, z, h = heightAt(x, z), s = slopeAt(x, z)): Biome {
      if (h < 0) return "water";
      if (h < 3) return "sand";
      if (h > 95) return "snow";
      if (s > 0.8) return "rock";
      if (x > 330) return "ash";
      return forestAt(x, z) > 0.55 ? "forest" : "field";
    },
    forestAt,
    pathDistance: (x, z) => Math.abs(z - 40 * Math.sin(x / 100)),
    onLand: (x, z) => heightAt(x, z) > 0,
  };
}

/** Obstacles that remember every sphere, in order. */
class Recorded extends Obstacles {
  list: Obstacle[] = [];
  override add(o: Obstacle) {
    this.list.push(o);
    super.add(o);
  }
}

/** 53-bit string hash (cyrb53): enough to notice any change, no node modules needed. */
function hash(s: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

function portrait(params: Partial<VegetationParams>, rules: VegetationRules) {
  const obstacles = new Recorded();
  const veg = new Vegetation(hillyMap(), obstacles, params, rules);
  const lines: string[] = [];
  for (const mesh of veg.group.children as THREE.InstancedMesh[]) {
    const m = mesh.instanceMatrix.array, c = mesh.instanceColor!.array;
    for (let i = 0; i < mesh.count; i++)
      lines.push(`${mesh.name}:${Array.from(m.slice(i * 16, i * 16 + 16), r5).join(",")}:${Array.from(c.slice(i * 3, i * 3 + 3), r5).join(",")}`);
  }
  return {
    counts: veg.counts,
    drawCalls: veg.drawCalls,
    obstacles: obstacles.count,
    hashObstacles: hash(obstacles.list.map((o) => [o.x, o.y, o.z, o.r].map(r5).join(",")).join(";")),
    hashInstances: hash(lines.join("\n")),
  };
}

const islandLike: VegetationRules = {
  clareiras: [{ x: 100, z: -100, r: 50 }, { x: -50, z: 300, r: 30 }],
  pathClearance: 8,
  manterLivre: (x, z) => x < -380 && z < -300,
  pinheiros: (x, z) => (Math.hypot(x - 200, z + 250) < 140 ? 1 : 0),
  palmeiras: (x, z) => (z > 250 ? 0.12 : 0.04),
  densidade: (x, z) => (Math.sin(x / 40) * Math.cos(z / 40) > 0.3 ? 1.3 : 0.6),
};

describe("Vegetation golden (the forest games already use must not move)", () => {
  it("default rules: only a clearing", () => {
    expect(portrait({}, { clareiras: [{ x: 0, z: 0, r: 60 }] })).toEqual({
      counts: { trees: 921, pines: 244, palms: 0, rocks: 106, bushes: 297, flowers: 556 },
      drawCalls: 242,
      obstacles: 8509,
      hashObstacles: "1e11f1d8171c",
      hashInstances: "56b00b553ab5e",
    });
  });

  it("an island's rules: kept free, pines by zone, palms, density, smaller trees", () => {
    expect(portrait({ treeHeight: [6, 13], palmHeight: [5, 9] }, islandLike)).toEqual({
      counts: { trees: 627, pines: 224, palms: 77, rocks: 94, bushes: 234, flowers: 482 },
      drawCalls: 279,
      obstacles: 5628,
      hashObstacles: "ec8f27b2d602a",
      hashInstances: "1f0190c92b23f3",
    });
  });
});
