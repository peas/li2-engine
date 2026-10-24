import { describe, expect, it } from "vitest";
import { headingTo, naFrente, naPraca, spot } from "./types";

describe("naFrente / naPraca", () => {
  it("in front of a door: afastar m past the footprint, along the door's heading", () => {
    const f = naFrente(spot(10, 20, 4, Math.PI / 2));
    expect(f.x).toBeCloseTo(17, 9);
    expect(f.z).toBeCloseTo(20, 9);
    expect(f.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(f.radius).toBe(1);
    expect(naFrente(spot(0, 0, 2), 1)).toMatchObject({ x: 0, z: 3 });
  });

  it("around a square: raio m from the centre, spread by index, each facing the centre", () => {
    const centro = { x: 100, z: -50 };
    const n = 4;
    const ps = [0, 1, 2, 3].map((i) => naPraca(centro, i, n));
    for (const p of ps) {
      expect(Math.hypot(p.x - centro.x, p.z - centro.z)).toBeCloseTo(12, 9);
      expect(p.yaw).toBeCloseTo(headingTo(p, centro), 9);
    }
    expect(ps[0].x - centro.x).toBeCloseTo(Math.sin(Math.PI / 4) * 12, 9);
    expect(Math.hypot(ps[0].x - ps[2].x, ps[0].z - ps[2].z)).toBeCloseTo(24, 9); // opposite sides
    expect(Math.hypot(naPraca(centro, 0, 0, 5).x - centro.x, naPraca(centro, 0, 0, 5).z - centro.z)).toBeCloseTo(5, 9);
  });
});
