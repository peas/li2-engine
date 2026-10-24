import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Climber, DEFAULT_CLIMBER, type SaidaEscalada } from "./climber";
import { DEFAULT_WALKER, Walker } from "./walker";
import type { Controls, Ground } from "../core/types";

const idle = (): Controls => ({ pitch: 0, roll: 0, throttle: 0, flap: false, brake: false, lookX: 0, lookY: 0 });
const DT = 1 / 60;
const S = Math.tan((60 * Math.PI) / 180); // a 60° ramp: gradient ≈ 1.73
/** Flat for z < 0, a 60° ramp up +z from z = 0 to z = 6 (10.4 m high), flat top beyond; water for z < -20. */
const rampa: Ground = {
  heightAt: (_x, z) => S * Math.min(6, Math.max(0, z)),
  isWaterAt: (_x, z) => z < -20,
};
const make = (g: Ground = rampa) => new Climber({ ...DEFAULT_CLIMBER }, g);
const run = (c: Climber, seconds: number, ctl: Partial<Controls> = {}) => {
  let saida: SaidaEscalada | null = null;
  for (let i = 0; i < Math.round(seconds / DT) && !saida; i++) saida = c.update(DT, { ...idle(), ...ctl });
  return saida;
};
const naParede = (z = 2) => {
  const c = make();
  c.entrar({ x: 0, y: 0, z });
  return c;
};

describe("Climber", () => {
  it("enters only pushing into a slope steeper than enterSlope", () => {
    const c = make();
    expect(c.podeEntrar({ x: 0, y: 0, z: -0.1 }, { x: 0, z: 1 }, true)).toBe(true);
    expect(c.podeEntrar({ x: 0, y: 0, z: -0.1 }, { x: 0, z: 1 }, false)).toBe(false); // not pushing
    expect(c.podeEntrar({ x: 0, y: 0, z: -0.1 }, { x: 0, z: -1 }, true)).toBe(false); // walking away
    expect(c.podeEntrar({ x: 0, y: 0, z: -0.1 }, { x: 1, z: 0 }, true)).toBe(false); // along the foot
    expect(c.podeEntrar({ x: 0, y: 0, z: -3 }, { x: 0, z: 1 }, true)).toBe(false); // still far
    const suave: Ground = { heightAt: (_x, z) => 0.6 * Math.max(0, z), isWaterAt: () => false };
    expect(make(suave).podeEntrar({ x: 0, y: 0, z: -0.1 }, { x: 0, z: 1 }, true)).toBe(false); // walkable slope
    let entrou = 0;
    c.on("enter", () => entrou++);
    c.entrar({ x: 0, y: 0, z: -0.1 });
    expect(c.escalando).toBe(true);
    expect(entrou).toBe(1);
    expect(c.yaw).toBeCloseTo(0, 3); // faces uphill (+z)
  });

  it("the body lies against the slope: pitched forward 30° on a 60° wall", () => {
    const c = naParede();
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
    expect(Math.atan2(v.y, v.z)).toBeCloseTo((60 * Math.PI) / 180, 2);
  });

  it("W climbs (y grows), S goes down, A/D go sideways keeping the height", () => {
    const c = naParede(2);
    const y0 = c.position.y;
    expect(run(c, 1, { throttle: 1 })).toBeNull();
    expect(c.position.y - y0).toBeGreaterThan(DEFAULT_CLIMBER.climbSpeed * Math.sin(Math.PI / 3) * 0.9);
    expect(c.speed).toBeCloseTo(DEFAULT_CLIMBER.climbSpeed, 1);
    const y1 = c.position.y;
    run(c, 0.5, { throttle: -1 });
    expect(c.position.y).toBeLessThan(y1);
    const { x, y } = c.position;
    run(c, 1, { roll: 1 });
    expect(Math.abs(c.position.x - x)).toBeGreaterThan(1.4);
    expect(c.position.y).toBeCloseTo(y, 3);
    expect(c.escalando).toBe(true);
  });

  it("climbs over the top where the ground flattens, standing past the edge", () => {
    const c = naParede(4);
    const saidas: string[] = [];
    c.on("exit", (m) => saidas.push(m));
    const s = run(c, 10, { throttle: 1 });
    expect(s?.motivo).toBe("topo");
    expect(s!.z).toBeGreaterThan(6); // on the flat top
    expect(c.escalando).toBe(false);
    expect(saidas).toEqual(["topo"]);
  });

  it("going down reaches the foot (chao)", () => {
    const c = naParede(1.5);
    const s = run(c, 10, { throttle: -1 });
    expect(s?.motivo).toBe("chao");
    expect(s!.z).toBeLessThan(0.5);
  });

  it("Space jumps off backwards (downhill, −gradient) and up", () => {
    const c = naParede(3);
    c.update(DT, idle());
    const s = c.update(DT, { ...idle(), flap: true });
    expect(s?.motivo).toBe("pulo");
    expect(s!.vz).toBeCloseTo(-DEFAULT_CLIMBER.jumpOffSpeed, 3);
    expect(Math.abs(s!.vx)).toBeLessThan(1e-6);
    expect(s!.vy).toBeGreaterThan(0);
    expect(c.escalando).toBe(false);
  });

  it("a Space held while grabbing the wall does not jump off at once", () => {
    const c = naParede(3);
    expect(c.update(DT, { ...idle(), flap: true })).toBeNull();
    c.update(DT, idle());
    expect(c.update(DT, { ...idle(), flap: true })?.motivo).toBe("pulo");
  });

  it("water stops the climb", () => {
    // a sea cliff: the slope goes down into water at z < 1
    const mar: Ground = { heightAt: (_x, z) => S * Math.max(0, z), isWaterAt: (_x, z) => z < 1 };
    const c = make(mar);
    c.entrar({ x: 0, y: 0, z: 2 });
    const s = run(c, 5, { throttle: -1 });
    expect(s?.motivo).toBe("agua");
    expect(s!.z).toBeGreaterThanOrEqual(1);
  });

  it("steps fire while climbing", () => {
    const c = naParede(1);
    let n = 0;
    c.on("step", () => n++);
    run(c, 2, { throttle: 1 });
    expect(n).toBeGreaterThanOrEqual(4);
  });
});

describe("Walker additions for the climb", () => {
  it("desiredMove is the WASD ask in m/s; aterrar keeps the orbit; lancar leaves the ground", () => {
    const flat: Ground = { heightAt: () => 0, isWaterAt: () => false };
    const w = new Walker({ ...DEFAULT_WALKER }, flat);
    w.placeOnGround(0, 0, 0);
    w.update(DT, { ...idle(), throttle: 1 });
    expect(w.desiredMove.z).toBeCloseTo(DEFAULT_WALKER.walkSpeed, 5);
    for (let i = 0; i < 30; i++) w.orbitar(DT, { ...idle(), lookX: -20 });
    const orbit = w.cameraYaw;
    expect(orbit).toBeGreaterThan(0.5);
    w.aterrar(5, 5, 1);
    expect(w.cameraYaw).toBe(orbit);
    expect(w.position.x).toBe(5);
    expect(w.yaw).toBe(1);
    w.lancar(0, -3, 4);
    expect(w.noAr).toBe(true);
    w.update(DT, idle());
    expect(w.position.z).toBeLessThan(5);
    expect(w.position.y).toBeGreaterThan(0);
    expect(w.gradientAt(0, 0).length()).toBe(0);
  });
});
