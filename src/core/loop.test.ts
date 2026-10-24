import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Interpolado, Loop } from "./loop";
import { CONTROLS_ZERO, type Controls } from "./types";

/** A fake clock and frame scheduler: `frame(ms)` advances the clock and runs the pending frame. */
function fakeLoop(look = { x: 0, y: 0 }) {
  let now = 0;
  let pending: (() => void) | null = null;
  const steps: Controls[] = [];
  const renders: { dt: number; alpha: number }[] = [];
  const loop = new Loop({
    agora: () => now,
    agendar: (cb) => { pending = cb; return 1; },
    cancelar: () => { pending = null; },
    lerControles: () => ({ ...CONTROLS_ZERO, lookX: look.x, lookY: look.y }),
    simular: (_step, c) => steps.push(c),
    renderizar: (dt, alpha) => renders.push({ dt, alpha }),
  });
  const frame = (ms: number) => {
    now += ms;
    const cb = pending!;
    pending = null;
    cb();
  };
  return { loop, steps, renders, frame };
}

describe("Loop", () => {
  it("a 50 ms frame runs 3 steps of 1/60", () => {
    const { loop, steps, frame } = fakeLoop();
    loop.start();
    frame(0); // first frame: dt 0
    expect(steps.length).toBe(0);
    frame(50);
    expect(steps.length).toBe(3);
    expect(loop.simTime).toBeCloseTo(0.05, 6);
  });

  it("a 1 s stall runs only maxSteps (4) and drops the rest", () => {
    const { loop, steps, renders, frame } = fakeLoop();
    loop.start();
    frame(0);
    frame(1000);
    expect(steps.length).toBe(4);
    expect(renders.at(-1)!.alpha).toBeCloseTo(0, 6); // nothing left over to catch up
    frame(1000 / 60);
    expect(steps.length).toBe(5); // back to one step per 60 Hz frame, no slow-motion catch-up
  });

  it("a short frame runs no step, interpolates, and carries the mouse to the next step", () => {
    const look = { x: 6, y: -3 };
    const { loop, steps, renders, frame } = fakeLoop(look);
    loop.start();
    frame(0); // 6 px read with no step: carried over
    frame(8);
    expect(steps.length).toBe(0);
    expect(renders.at(-1)!.alpha).toBeCloseTo(0.48, 2);
    frame(26); // acc 34 ms: 2 steps
    const total = steps.reduce((s, c) => s + c.lookX, 0);
    expect(steps.length).toBe(2);
    expect(total).toBeCloseTo(18, 6); // 3 frames × 6 px, none lost
    expect(steps[0].lookY).toBeCloseTo(-4.5, 6);
  });

  it("stop() stops scheduling; fps is measured every 0.5 s", () => {
    const { loop, frame } = fakeLoop();
    loop.start();
    frame(0);
    for (let i = 0; i < 40; i++) frame(1000 / 60);
    expect(Math.abs(loop.fps - 60)).toBeLessThanOrEqual(2);
    loop.stop();
    expect(loop.rodando).toBe(false);
  });
});

describe("Interpolado", () => {
  it("interpolates between steps but not across a teleport", () => {
    const body = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const vis = new Interpolado(body, 30);
    vis.antesDoPasso();
    body.position.set(1, 0, 0);
    vis.depoisDoPasso();
    expect(vis.interpolar(0.5).position.x).toBeCloseTo(0.5);
    vis.antesDoPasso();
    body.position.set(500, 0, 0);
    vis.depoisDoPasso();
    expect(vis.interpolar(0.5).position.x).toBe(500);
  });
});
