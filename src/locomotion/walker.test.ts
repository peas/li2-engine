import { describe, expect, it } from "vitest";
import { DEFAULT_WALKER, Walker } from "./walker";
import type { Controls, Ground } from "../core/types";

/** Pure maths over simple floors; numbers are loose on purpose (they pin the behaviour, not the curves). */
const idle = (): Controls => ({ pitch: 0, roll: 0, throttle: 0, flap: false, brake: false, lookX: 0, lookY: 0 });
const DT = 1 / 60;
const flat: Ground = { heightAt: () => 10, isWaterAt: (x) => x > 1000 };
/** A 10 m ledge: floor 10 for x < 0, 0 beyond. */
const ledge: Ground = { heightAt: (x) => (x < 0 ? 10 : 0), isWaterAt: () => false };
const make = (g: Ground = flat) => new Walker({ ...DEFAULT_WALKER }, g);
const frames = (s: number) => Math.round(s / DT);
const run = (w: Walker, seconds: number, c: Partial<Controls> = {}) => {
  for (let i = 0; i < frames(seconds); i++) w.update(DT, { ...idle(), ...c });
};

/** Walk +x off the ledge, then press space `delay` s after leaving the ground. Returns the jumps seen. */
function jumpAfterEdge(delay: number) {
  const w = make(ledge);
  w.placeOnGround(-1, 0, Math.PI / 2); // orbit yaw π/2: W walks toward +x
  let jumps = 0;
  w.on("jump", () => jumps++);
  for (let i = 0; i < 120 && w.grounded; i++) w.update(DT, { ...idle(), throttle: 1 });
  expect(w.noAr).toBe(true);
  run(w, delay, { throttle: 1 });
  w.update(DT, { ...idle(), throttle: 1, flap: true });
  run(w, 0.3, { throttle: 1 });
  return { jumps, w };
}

describe("Walker", () => {
  it("W for 1 s covers about walkSpeed metres, on the floor, facing the way it walks", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    run(w, 1, { throttle: 1 });
    const d = Math.hypot(w.position.x, w.position.z);
    expect(d).toBeGreaterThan(DEFAULT_WALKER.walkSpeed * 0.8);
    expect(d).toBeLessThan(DEFAULT_WALKER.walkSpeed * 1.02);
    expect(w.position.y).toBeCloseTo(10, 5);
    expect(w.grounded).toBe(true);
    expect(Math.abs(w.yaw)).toBeLessThan(0.05);
    expect(w.groundSpeed).toBeCloseTo(DEFAULT_WALKER.walkSpeed, 0);
  });

  it("shift (brake) runs at runSpeed", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    run(w, 0.5, { throttle: 1, brake: true });
    const z0 = w.position.z;
    run(w, 1, { throttle: 1, brake: true });
    expect(w.position.z - z0).toBeGreaterThan(DEFAULT_WALKER.runSpeed * 0.95);
  });

  it("walks relative to the camera orbit: the mouse turns the orbit, then W follows it", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    run(w, 0.3, { lookX: -(Math.PI / 2) / DEFAULT_WALKER.mouseSens / frames(0.3) }); // mouse left: orbit to +π/2
    run(w, 0.3); // the orbit damp catches up
    expect(w.orbitYaw).toBeCloseTo(Math.PI / 2, 1);
    run(w, 1, { throttle: 1 });
    expect(w.position.x).toBeGreaterThan(2.5);
    expect(Math.abs(w.position.z)).toBeLessThan(0.5);
  });

  it("the mouse Y tilts the orbit pitch within its limits", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    run(w, 0.2, { lookY: 20 });
    expect(w.cameraPitch).toBeGreaterThan(DEFAULT_WALKER.startPitch);
    run(w, 2, { lookY: 200 });
    expect(w.cameraPitch).toBe(DEFAULT_WALKER.maxPitch);
    run(w, 2, { lookY: -200 });
    expect(w.cameraPitch).toBe(DEFAULT_WALKER.minPitch);
  });

  it("space jumps about jumpHeight and lands back on the floor (jump and land events)", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    let top = 0, jumps = 0, lands = 0, fall = 0;
    w.on("jump", () => jumps++);
    w.on("land", (v) => { lands++; fall = v; });
    for (let i = 0; i < frames(1.5); i++) {
      w.update(DT, { ...idle(), flap: i < 6 });
      top = Math.max(top, w.hop);
    }
    expect(jumps).toBe(1); // holding space is one jump
    expect(lands).toBe(1);
    expect(top).toBeGreaterThan(DEFAULT_WALKER.jumpHeight * 0.9);
    expect(top).toBeLessThan(DEFAULT_WALKER.jumpHeight * 1.1);
    expect(fall).toBeGreaterThan(3);
    expect(w.grounded).toBe(true);
    expect(w.position.y).toBeCloseTo(10, 5);
  });

  it("coyote time: a jump 80 ms after walking off an edge still works", () => {
    const { jumps, w } = jumpAfterEdge(0.08);
    expect(jumps).toBe(1);
    expect(w.vy).toBeLessThan(10);
  });

  it("coyote time: 200 ms after the edge it is too late (and the buffer runs out before landing)", () => {
    const { jumps } = jumpAfterEdge(0.2);
    expect(jumps).toBe(0);
  });

  it("jump buffer: space 80 ms before touchdown jumps on touchdown", () => {
    // measure when the first jump lands
    const probe = make();
    probe.placeOnGround(0, 0, 0);
    let landFrame = -1;
    probe.on("land", () => { if (landFrame < 0) landFrame = i; });
    let i = 0;
    for (; i < 120 && landFrame < 0; i++) probe.update(DT, { ...idle(), flap: i === 0 });
    expect(landFrame).toBeGreaterThan(10);

    const w = make();
    w.placeOnGround(0, 0, 0);
    let jumps = 0, lands = 0;
    w.on("jump", () => jumps++);
    w.on("land", () => lands++);
    const pressAt = landFrame - frames(0.08);
    for (let k = 0; k <= landFrame + 2; k++) w.update(DT, { ...idle(), flap: k === 0 || k === pressAt });
    expect(lands).toBe(1);
    expect(jumps).toBe(2);
    expect(w.noAr).toBe(true); // already up again
    expect(w.vy).toBeGreaterThan(0);
  });

  it("a press too early (300 ms before touchdown) is forgotten", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    let jumps = 0;
    w.on("jump", () => jumps++);
    // airtime ≈ 2·sqrt(2h/g) ≈ 0.66 s; press again 0.36 s in (≈ 0.3 s before touchdown)
    for (let k = 0; k < frames(1.2); k++) w.update(DT, { ...idle(), flap: k === 0 || k === frames(0.36) });
    expect(jumps).toBe(1);
    expect(w.grounded).toBe(true);
  });

  it("never walks into deep water: the shore pushes back", () => {
    const w = make();
    w.placeOnGround(995, 0, Math.PI / 2);
    run(w, 4, { throttle: 1, brake: true });
    expect(w.position.x).toBeLessThanOrEqual(1000.01);
  });

  it("footstep events every stepLength metres", () => {
    const w = make();
    w.placeOnGround(0, 0, 0);
    const steps: number[] = [];
    w.on("step", (d) => steps.push(d));
    run(w, 2, { throttle: 1 });
    expect(steps.length).toBeGreaterThan(Math.floor(w.gaitDistance / w.stepLength) - 2);
    expect(steps.length).toBeLessThanOrEqual(Math.floor(w.gaitDistance / w.stepLength));
  });

  it("follows a gentle slope down without leaving the ground", () => {
    const slope: Ground = { heightAt: (_x, z) => -0.5 * z, isWaterAt: () => false };
    const w = make(slope);
    w.placeOnGround(0, 0, 0);
    run(w, 2, { throttle: 1, brake: true });
    expect(w.grounded).toBe(true);
    expect(w.position.y).toBeCloseTo(-0.5 * w.position.z, 3);
  });
});
