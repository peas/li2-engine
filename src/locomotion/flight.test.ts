import { describe, expect, it } from "vitest";
import { DEFAULT_FLIGHT, DragonFlight } from "./flight";
import type { Controls, Ground } from "../core/types";

/**
 * Fixes the flight behaviour before the smoothness pass (the first game's docs/ENGINES.md §3): straight cruise, mouse turn, auto-level,
 * landing, take-off, walking, running, hop, water. Pure maths over a flat ground; no renderer. Numbers are loose on
 * purpose: they pin the behaviour, not the exact curves.
 */
const flat: Ground = { heightAt: () => 10, isWaterAt: (x) => x > 1000 };
const idle = (): Controls => ({ pitch: 0, roll: 0, throttle: 0, flap: false, brake: false, lookX: 0, lookY: 0 });
const DT = 1 / 60;
const run = (f: DragonFlight, seconds: number, c: Partial<Controls> | ((t: number) => Partial<Controls>) = {}) => {
  for (let t = 0; t < seconds; t += DT) f.update(DT, { ...idle(), ...(typeof c === "function" ? c(t) : c) });
};
const make = () => new DragonFlight({ ...DEFAULT_FLIGHT }, flat, 2);

describe("DragonFlight", () => {
  it("cruises straight and level: heading and height hold, speed stays at cruise", () => {
    const f = make();
    f.place(0, 0, 100, Math.PI);
    run(f, 3);
    expect(Math.abs(f.yaw - Math.PI)).toBeLessThan(0.01);
    expect(Math.abs(f.pitch)).toBeLessThan(0.02);
    expect(f.speed).toBeCloseTo(DEFAULT_FLIGHT.cruiseSpeed, 0);
    expect(f.position.z).toBeLessThan(-100); // flew north (-z)
    expect(Math.abs(f.position.y - 112)).toBeLessThan(3); // sinks a little below cruise only; at cruise it holds
  });

  it("the mouse turns her: 400 px to the right changes the heading by about 400 × mouseSens, banking on the way", () => {
    const f = make();
    f.place(0, 0, 100, Math.PI);
    let maxRoll = 0;
    run(f, 1.5, (t) => { const c = t < 0.5 ? { lookX: 400 / 30 } : {}; return c; });
    for (let t = 0; t < 0.5; t += DT) { f.update(DT, idle()); maxRoll = Math.max(maxRoll, Math.abs(f.roll)); }
    expect(Math.abs(f.yaw - (Math.PI - 400 * DEFAULT_FLIGHT.mouseSens))).toBeLessThan(0.05);
    expect(Math.abs(f.roll)).toBeLessThan(0.1); // level again once the turn is over
  });

  it("banks while turning", () => {
    const f = make();
    f.place(0, 0, 100, Math.PI);
    let maxRoll = 0;
    run(f, 0.6, () => ({ lookX: 10 }));
    for (let t = 0; t < 0.3; t += DT) { f.update(DT, { ...idle(), lookX: 10 }); maxRoll = Math.max(maxRoll, Math.abs(f.roll)); }
    expect(maxRoll).toBeGreaterThan(0.15);
  });

  it("auto-levels after a dive once the mouse stops", () => {
    const f = make();
    f.place(0, 0, 300, Math.PI);
    run(f, 0.4, { lookY: 8 }); // mouse down = dive (mouseUpIsClimb)
    const dive = f.pitch;
    expect(dive).toBeLessThan(-0.2);
    run(f, 2.5);
    expect(Math.abs(f.pitch)).toBeLessThan(Math.abs(dive) * 0.3);
  });

  it("lands when slow and low over land, then runs off and stops", () => {
    const f = make();
    f.place(0, 0, 8, Math.PI);
    f.speed = 18; f.targetPitch = f.pitch = -0.15;
    let landing = false, landed = 0;
    f.on("land", () => landed++);
    for (let t = 0; t < 5 && !f.grounded; t += DT) { f.update(DT, idle()); landing ||= f.landing; }
    expect(landing).toBe(true);
    expect(f.grounded).toBe(true);
    expect(landed).toBe(1);
    run(f, 2);
    expect(f.groundSpeed).toBeLessThan(0.5);
    expect(f.position.y).toBeCloseTo(12, 1); // floor 10 + groundOffset 2
  });

  it("never lands on water: skims nose-up instead", () => {
    const f = make();
    f.place(2000, 0, 2, Math.PI);
    f.speed = 15; f.targetPitch = f.pitch = -0.2;
    run(f, 3);
    expect(f.grounded).toBe(false);
    expect(f.position.y).toBeGreaterThanOrEqual(12 - 0.01);
  });

  it("walks with W at walkSpeed, runs with shift, the body faces the way it goes", () => {
    const f = make();
    f.placeOnGround(0, 0, 0);
    run(f, 1, { throttle: 1 });
    const d1 = Math.hypot(f.position.x, f.position.z);
    expect(d1).toBeGreaterThan(DEFAULT_FLIGHT.walkSpeed * 0.5);
    expect(d1).toBeLessThan(DEFAULT_FLIGHT.walkSpeed * 1.05);
    expect(f.grounded).toBe(true);
    const z0 = f.position.z;
    run(f, 1, { throttle: 1, brake: true });
    expect(f.position.z - z0).toBeGreaterThan(d1 * 1.4);
    expect(Math.abs(f.yaw)).toBeLessThan(0.05); // facing +z, where it walks (camera yaw 0)
  });

  it("a tap of space hops about jumpHeight and comes down; holding it takes off", () => {
    const f = make();
    f.placeOnGround(0, 0, 0);
    let top = 0, jumps = 0;
    f.on("jump", () => jumps++);
    for (let t = 0; t < 1.5; t += DT) { f.update(DT, { ...idle(), flap: t < 0.1 }); top = Math.max(top, f.hop); }
    expect(jumps).toBe(1);
    expect(top).toBeGreaterThan(DEFAULT_FLIGHT.jumpHeight * 0.8);
    expect(f.hop).toBe(0);
    expect(f.grounded).toBe(true);
    let takeoffs = 0;
    f.on("takeoff", () => takeoffs++);
    run(f, 0.6, { flap: true });
    expect(takeoffs).toBe(1);
    expect(f.grounded).toBe(false);
    expect(f.takeoffLeft).toBeGreaterThan(0);
    run(f, 2, { flap: true });
    expect(f.position.y).toBeGreaterThan(20);
  });

  it("walking never enters the water: the shore pushes back", () => {
    const f = make();
    f.placeOnGround(995, 0, Math.PI / 2); // facing +x, water from x > 1000
    run(f, 3, { throttle: 1 });
    expect(f.position.x).toBeLessThanOrEqual(1000.01);
  });

  it("vigor scales the speeds", () => {
    const f = make();
    f.vigor = 0.5;
    f.placeOnGround(0, 0, 0);
    run(f, 1, { throttle: 1 });
    expect(Math.hypot(f.position.x, f.position.z)).toBeLessThan(DEFAULT_FLIGHT.walkSpeed * 0.6);
  });
});
