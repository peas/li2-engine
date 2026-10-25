import { describe, expect, it } from "vitest";
import { SEGUIDOR_PADRAO as P, Seguidor } from "./seguidor";

const DT = 1 / 60;
const casa = { x: 300, z: 400, yaw: 0.5, radius: 4 };
const novo = () => new Seguidor({ x: 0, z: 0, yaw: 0, radius: 6 }, casa);

describe("Seguidor (a companion that follows)", () => {
  it("waits where it is until called", () => {
    const s = novo();
    for (let i = 0; i < 600; i++) s.step(DT, { x: 5, z: 5, speed: 3 });
    expect([s.x, s.z, s.estado]).toEqual([0, 0, "esperando"]);
    expect(s.chamar()).toBe(true);
    expect(s.chamar()).toBe(false);
    expect(s.estado).toBe("seguindo");
  });

  it("follows at the leader's pace and keeps behind them", () => {
    for (const speed of [1.5, 6]) {
      const s = novo();
      s.chamar();
      const j = { x: 0, z: 2, speed };
      for (let i = 0; i < 60 * 20; i++) { j.z += speed * DT; s.step(DT, j); }
      expect(s.z).toBeLessThan(j.z);
      expect(s.distanciaDe(j)).toBeGreaterThan(P.perto - 0.1);
      expect(s.distanciaDe(j)).toBeLessThan(P.atras + P.freio + 0.3);
      expect(s.velocidade).toBeCloseTo(speed, 0);
      expect(s.andando).toBe(true);
    }
  });

  it("shows up `aparece` m behind the leader when left more than `longe` away", () => {
    const s = novo();
    s.chamar();
    s.step(DT, { x: 0, z: 2, speed: 0 });
    s.step(DT, { x: 0, z: 200, speed: 8 });
    expect(s.distanciaDe({ x: 0, z: 200 })).toBeCloseTo(P.aparece, 5);
    expect(s.z).toBeLessThan(200);
  });

  it("goes home when brought near it, arrives and stays; irParaCasa puts it there at once", () => {
    const s = novo();
    s.chamar();
    const j = { x: 0, z: 0, speed: 4 };
    const dir = { x: casa.x / 500, z: casa.z / 500 };
    for (let t = 0; t < 300 && s.estado === "seguindo"; t += DT) {
      if (Math.hypot(casa.x - j.x, casa.z - j.z) > 8) { j.x += dir.x * 4 * DT; j.z += dir.z * 4 * DT; }
      s.step(DT, j);
    }
    expect(s.estado).toBe("chegou");
    expect(s.faltaM()).toBeLessThanOrEqual(P.chegada);
    const [x, z] = [s.x, s.z];
    for (let i = 0; i < 300; i++) s.step(DT, { x: 0, z: 0, speed: 8 });
    expect([s.x, s.z]).toEqual([x, z]);
    const outro = novo();
    outro.irParaCasa();
    expect([outro.x, outro.z, outro.yaw, outro.estado, outro.andando]).toEqual([300, 400, 0.5, "chegou", false]);
  });

  it("params are its own and read live", () => {
    const params = { ...P, longe: 10, aparece: 3 };
    const s = new Seguidor({ x: 0, z: 0, yaw: 0, radius: 1 }, casa, params);
    s.chamar();
    s.step(DT, { x: 0, z: 1, speed: 0 });
    s.step(DT, { x: 0, z: 20, speed: 0 });
    expect(s.distanciaDe({ x: 0, z: 20 })).toBeCloseTo(3, 5);
    params.aparece = 5;
    s.step(DT, { x: 0, z: 40, speed: 0 });
    expect(s.distanciaDe({ x: 0, z: 40 })).toBeCloseTo(5, 5);
  });

  it("a calm follower at its own pace: waits until the leader is `parte` away, walks at a fixed speed, never pops up nor goes home", () => {
    const params = { ...P, atras: 6, perto: 7, parte: 10, fator: 0, minimo: 2.5, teto: 2.5, trote: 2.5, longe: Infinity, casa: 0 };
    const s = new Seguidor({ x: 0, z: 0, yaw: 0, radius: 1 }, { x: 0, z: 0, yaw: 0, radius: 1 }, params);
    s.chamar();
    const j = { x: 0, z: 9, speed: 0 };
    for (let i = 0; i < 120; i++) s.step(DT, j);
    expect([s.x, s.z, s.andando]).toEqual([0, 0, false]); // 9 m: inside parte, it waits
    j.z = 11;
    s.step(DT, j);
    expect(s.andando).toBe(true);
    expect(s.velocidade).toBeCloseTo(2.5, 5);
    for (let i = 0; i < 600 && s.andando; i++) s.step(DT, j);
    expect(s.distanciaDe(j)).toBeCloseTo(7, 1); // stopped at perto
    j.z += 2; // 9 m again: still waiting
    for (let i = 0; i < 60; i++) s.step(DT, j);
    expect(s.andando).toBe(false);
    j.speed = 9;
    for (let i = 0; i < 60 * 20; i++) { j.z += 9 * DT; s.step(DT, j); }
    expect(s.velocidade).toBeCloseTo(2.5, 5); // its own pace, however fast the leader goes
    expect(s.distanciaDe(j)).toBeGreaterThan(100); // left behind, no popping up
    expect(s.estado).toBe("seguindo"); // home's centre was its start: casa 0 never sends it in
  });
});
