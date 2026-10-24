import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/math";
import { Fsm, arrive, flee, headingVelocity, separation, stayInside, steer, v2, wander } from "./steering";

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("steering", () => {
  it("fleeing moves away from the threat", () => {
    const pos = v2(3, 4), threat = v2(0, 0), out = v2();
    const d0 = dist(pos, threat);
    for (let i = 0; i < 60; i++) {
      flee(pos, threat, 5, out);
      pos.x += out.x / 60;
      pos.z += out.z / 60;
    }
    expect(dist(pos, threat)).toBeCloseTo(d0 + 5, 3);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(5);
  });

  it("arrive stops within its radius and slows down near the target", () => {
    const pos = v2(0, 0), target = v2(30, -10), vel = v2(), want = v2();
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 20; i++) {
      arrive(pos, target, 6, 5, want, 0.3);
      steer(vel, want, 20, dt);
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
    }
    expect(dist(pos, target)).toBeLessThan(0.5);
    expect(Math.hypot(vel.x, vel.z)).toBeLessThan(0.5);
    arrive(v2(27, -10), target, 6, 5, want);
    expect(Math.hypot(want.x, want.z)).toBeCloseTo(6 * 3 / 5);
  });

  it("wander plus stayInside never leaves the region", () => {
    const rand = mulberry32(42), center = v2(100, -50), radius = 40;
    const pos = v2(100, -50), vel = v2(), want = v2(), back = v2();
    let heading = 0, maxD = 0;
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 600; i++) {
      heading = wander(heading, rand, 1.5, dt);
      headingVelocity(heading, 2, want);
      stayInside(pos, center, radius, 2, back);
      want.x += back.x;
      want.z += back.z;
      steer(vel, want, 4, dt);
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
      if (back.x || back.z) heading = Math.atan2(vel.x, vel.z);
      maxD = Math.max(maxD, dist(pos, center));
    }
    expect(maxD).toBeLessThan(radius * 1.15);
    expect(maxD).toBeGreaterThan(radius * 0.5); // it did wander
  });

  it("separation pushes neighbours apart", () => {
    const a = v2(0, 0), b = v2(1, 0), c = v2(50, 50), out = v2();
    const all = [a, b, c];
    separation(a, all, 4, 3, out);
    expect(out.x).toBeLessThan(0);
    expect(out.z).toBeCloseTo(0);
    separation(b, all, 4, 3, out);
    expect(out.x).toBeGreaterThan(0);
    separation(c, all, 4, 3, out);
    expect(out.x).toBe(0);
    separation(a, all, 4, 3, out, (i) => i === 1);
    expect(out.x).toBe(0);
  });

  it("the state machine reports when a state's time is up", () => {
    const f = new Fsm<"a" | "b">("a");
    f.set("b", 1);
    expect(f.tick(0.6)).toBe(false);
    expect(f.tick(0.6)).toBe(true);
    expect(f.state).toBe("b");
  });
});
