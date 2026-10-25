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

  it("pinhal turns the trees there into pines without spending a draw (pinheiros draws)", () => {
    const plain = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [] });
    const zone = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [], pinhal: (x) => x < 0 });
    const drawn = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [], pinheiros: (x) => (x < 0 ? 1 : 0) });
    const at = (v: Vegetation, x: number, z: number) => v.items.find((i) => i.x === x && i.z === z)!;
    const west = plain.items.filter((i) => i.kind === "tree" && i.x < 0);
    expect(west.length).toBeGreaterThan(50);
    expect(zone.items).toHaveLength(plain.items.length);
    for (const t of west) {
      expect(at(zone, t.x, t.z).kind).toBe("pine");
      expect(at(zone, t.x, t.z).yaw).toBe(t.yaw); // same draws as the round tree it replaces
    }
    expect(west.some((t) => at(drawn, t.x, t.z).yaw !== t.yaw)).toBe(true);
    for (const t of zone.items.filter((i) => i.x >= 0)) expect(at(plain, t.x, t.z)).toEqual(t);
  });

  it("bosquetes adds round trees on green ground where it says, and nothing else moves", () => {
    const plain = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [] });
    const none = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [], bosquetes: () => 0 });
    const clumps = new Vegetation(fakeMap(), new Obstacles(), {}, { clareiras: [], bosquetes: (x, z) => (x > 100 && z < 0 ? 0.8 : 0) });
    expect(none.items).toEqual(plain.items);
    expect(clumps.counts.pines).toBe(plain.counts.pines);
    const extra = clumps.counts.trees - plain.counts.trees;
    expect(extra).toBeGreaterThan(20);
    const added = clumps.items.filter((i) => !plain.items.some((p) => p.x === i.x && p.z === i.z && p.kind === i.kind));
    expect(added).toHaveLength(extra);
    for (const t of added) expect(t.kind === "tree" && t.x > 100 && t.z < 0).toBe(true);
  });

  it("floresNasClareiras lets flowers into the clearings, never where manterLivre says", () => {
    const glade = { x: 100, z: 0, r: 80 };
    const inGlade = (v: Vegetation) => v.items.filter((i) => i.kind === "flower" && Math.hypot(i.x - glade.x, i.z - glade.z) < glade.r);
    const base: VegetationRules = { clareiras: [glade], manterLivre: (x, z) => x > 100 && z > 0 };
    const kept = new Vegetation(fakeMap(), new Obstacles(), {}, base);
    const open = new Vegetation(fakeMap(), new Obstacles(), {}, { ...base, floresNasClareiras: true });
    expect(inGlade(kept)).toHaveLength(0);
    expect(inGlade(open).length).toBeGreaterThan(0);
    for (const f of open.items.filter((i) => i.kind === "flower")) expect(f.x > 100 && f.z > 0).toBe(false);
    // everything else is the same
    expect(open.items.filter((i) => i.kind !== "flower")).toEqual(kept.items.filter((i) => i.kind !== "flower"));
  });
});
