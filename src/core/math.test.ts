import { describe, expect, it } from "vitest";
import { smoothDamp, smoothDampAngle } from "./math";

const DT = 1 / 60;

describe("smoothDamp", () => {
  it("reaches the target without overshoot, with a continuous velocity", () => {
    const s = { v: 0 };
    let x = 0, maxV = 0, prevV = 0, maxJerk = 0;
    for (let t = 0; t < 1; t += DT) {
      x = smoothDamp(x, 10, s, 0.15, DT);
      expect(x).toBeLessThanOrEqual(10);
      maxV = Math.max(maxV, s.v);
      maxJerk = Math.max(maxJerk, Math.abs(s.v - prevV));
      prevV = s.v;
    }
    expect(x).toBeCloseTo(10, 2);
    expect(maxV).toBeGreaterThan(20);
    expect(maxJerk).toBeLessThan(maxV); // no single-frame jump in the velocity
  });

  it("is roughly frame-rate independent: 30 and 120 fps land in the same place after 0.3 s", () => {
    const at = (dt: number) => { const s = { v: 0 }; let x = 0; for (let t = 0; t < 0.3 - 1e-9; t += dt) x = smoothDamp(x, 1, s, 0.2, dt); return x; };
    expect(Math.abs(at(1 / 30) - at(1 / 120))).toBeLessThan(0.05);
  });

  it("caps the speed", () => {
    const s = { v: 0 };
    let x = 0;
    for (let t = 0; t < 0.5; t += DT) { const prev = x; x = smoothDamp(x, 100, s, 0.05, DT, 10); expect((x - prev) / DT).toBeLessThanOrEqual(10.01); }
  });

  it("angles take the short way round", () => {
    const s = { v: 0 };
    let a = 3.0;
    for (let t = 0; t < 1; t += DT) a = smoothDampAngle(a, -3.0, s, 0.1, DT);
    expect(Math.abs(Math.atan2(Math.sin(a + 3), Math.cos(a + 3)))).toBeLessThan(0.01);
    expect(a).toBeGreaterThan(3); // went up through π, not down through 0
  });
});
