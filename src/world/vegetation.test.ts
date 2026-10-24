import { describe, expect, it } from "vitest";
import type { Biome, WorldMap } from "./map";
import { Obstacles } from "./obstacles";
import { keptClear, ruleDensity, Vegetation, type VegetationRules } from "./vegetation";

/** A flat 400 m square: forest everywhere west of x = 0, field east, sand south of z = 150. */
function fakeMap(): WorldMap {
  const heightAt = () => 10;
  return {
    size: 400,
    waterLevel: 0,
    heightAt,
    isWaterAt: () => false,
    slopeAt: () => 0,
    biomeAt: (x: number, z: number): Biome => (z > 150 ? "sand" : x < 0 ? "forest" : "field"),
    forestAt: (x: number) => (x < 0 ? 1 : 0),
    pathDistance: () => Infinity,
    onLand: () => true,
  };
}

const clareira = { x: -100, z: 0, r: 40 };
const rules: VegetationRules = {
  clareiras: [clareira],
  manterLivre: (x, z) => x > 100 && z < -100,
  palmeiras: (_x, z) => (z > 150 ? 1 : 0),
};

describe("Vegetation rules", () => {
  it("keptClear and ruleDensity read the clearings, manterLivre and the density", () => {
    const map = fakeMap();
    expect(keptClear(map, rules, -100, 10)).toBe(true);
    expect(keptClear(map, rules, 150, -150)).toBe(true);
    expect(keptClear(map, rules, 0, 0)).toBe(false);
    expect(ruleDensity(map, rules, -100, 10)).toBe(0);
    expect(ruleDensity(map, { ...rules, densidade: () => 0.5 }, 0, 0)).toBe(0.5);
  });

  it("grows nothing in a clearing nor where manterLivre says, and palms on the beach", () => {
    const veg = new Vegetation(fakeMap(), new Obstacles(), {}, rules);
    expect(veg.counts.trees + veg.counts.pines).toBeGreaterThan(50);
    expect(veg.counts.palms).toBeGreaterThan(5);
    for (const it of veg.items) {
      expect(Math.hypot(it.x - clareira.x, it.z - clareira.z)).toBeGreaterThanOrEqual(clareira.r);
      expect(it.x > 100 && it.z < -100).toBe(false);
      if (it.kind === "palm") expect(it.z).toBeGreaterThan(150);
    }
  });

  it("pinheiros = 1 turns every tree in the woods into a pine; densidade 0 leaves the map bare", () => {
    const pines = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [], pinheiros: (x) => (x < 0 ? 1 : 0) });
    expect(pines.items.filter((i) => i.kind === "tree" && i.x < 0)).toHaveLength(0);
    expect(pines.counts.pines).toBeGreaterThan(50);
    const bare = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [], densidade: () => 0 });
    expect(bare.items).toHaveLength(0);
  });
});
