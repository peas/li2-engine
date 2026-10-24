import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { WorldMap } from "../../world/map";
import { Bichos } from "./bichos";
import { carregarEspecies } from "./especies";
import type { Protagonista } from "./bicho";

// A made-up flat island: land at 5 m everywhere inside the square
const mapa: WorldMap = {
  size: 2000, waterLevel: 0, heightAt: () => 5, isWaterAt: () => false, slopeAt: () => 0, biomeAt: () => "field",
  forestAt: () => 0, pathDistance: () => Infinity, onLand: () => true,
};
const LUGARES: Record<string, { x: number; z: number; raio: number }> = {
  morro: { x: 0, z: 0, raio: 100 }, pasto: { x: 300, z: 0, raio: 20 }, curral: { x: 500, z: 0, raio: 10 },
};
const lugar = (k: string) => LUGARES[k] ?? null;
const lobos = (testa: boolean) => carregarEspecies(`especies:
  - { id: lobo, nome: lobo, comportamento: bando, regiao: morro, quantidade: 5, velocidade: 2.2, velocidadeFuga: 11, foge: 25, item: null, testa: ${testa}, cores: ["#8a8d92"] }`, { lugar });
const camera = new THREE.Vector3();

/** Steps the world `s` seconds at 60 Hz with the protagonist where `p` says. */
function rodar(b: Bichos, p: Protagonista, s: number, t0 = 0) {
  for (let i = 0; i < s * 60; i++) b.update(1 / 60, p, camera, t0 + i / 60);
  return t0 + s;
}

describe("Bichos", () => {
  it("a pack with `testa: false` only circles at its distance; with `testa` one wolf comes to test", () => {
    for (const testa of [false, true]) {
      let rosnou = 0;
      const b = new Bichos(new THREE.Scene(), mapa, lobos(testa), { corpo: 1.5, onRosnou: () => rosnou++ });
      expect(b.counts.lobo).toBe(5);
      const lider = b.todos[0].position;
      // she stands still 40 m from the leader for a minute (a test is due 20-40 s after the circling starts)
      const p: Protagonista = { x: lider.x + 40, y: 5, z: lider.z, grounded: true, speed: 0 };
      let minimo = Infinity;
      for (let t = 0; t < 60; t += 1) {
        rodar(b, p, 1, t);
        if (t >= 10) for (const w of b.todos) minimo = Math.min(minimo, Math.hypot(w.position.x - p.x, w.position.z - p.z));
      }
      if (testa) expect(rosnou).toBeGreaterThan(0);
      else {
        expect(rosnou).toBe(0);
        expect(b.loboTestando).toBeNull();
        expect(minimo).toBeGreaterThan(25 * 0.9);
      }
      expect(b.todos.every((w) => !w.sumido)).toBe(true);
    }
  });

  it("a `segue` animal waits where it was born, and once called follows the protagonist home", () => {
    const especies = carregarEspecies(`especies:
  - { id: ovelha, nome: ovelha, comportamento: segue, regiao: pasto, quantidade: 1, velocidade: 0.8, velocidadeFuga: 4, foge: 0, item: null, casa: curral, cores: ["#ffffff"] }`, { lugar });
    const b = new Bichos(new THREE.Scene(), mapa, especies);
    const o = b.todos[0], nasceu = o.position.clone();
    expect(Math.hypot(nasceu.x - 300, nasceu.z)).toBeLessThan(20);
    // she walks past: it stays put
    const p: Protagonista = { x: nasceu.x - 3, y: 5, z: nasceu.z, grounded: true, speed: 0 };
    rodar(b, p, 2);
    expect(o.position.distanceTo(nasceu)).toBeLessThan(1e-6);
    expect(o.estado).toBe("pastando");
    expect(o.chamar()).toBe(true);
    expect(o.chamar()).toBe(false);
    // she walks to the pen at 2 m/s; it trots behind and goes in
    p.speed = 2;
    let t = 2;
    while (p.x < 500 && t < 400) { p.x += 2 / 60; t = rodar(b, p, 1 / 60, t); if (o.estado === "seguindo") expect(o.seguidor!.estado).toBe("seguindo"); }
    rodar(b, p, 10, t);
    expect(o.seguidor!.estado).toBe("chegou");
    expect(Math.hypot(o.position.x - 500, o.position.z)).toBeLessThanOrEqual(2);
    expect(o.position.y).toBe(5);
  });

  it("keeps the ground animals out of a collider when the game gives one", () => {
    const especies = carregarEspecies(`especies:
  - { id: ovelha, nome: ovelha, comportamento: pasta, regiao: pasto, quantidade: 6, velocidade: 0.8, velocidadeFuga: 4.5, foge: 12, item: null, cores: ["#ffffff"] }`, { lugar });
    // a round house of 6 m in the middle of the field
    const casa = { x: 300, z: 0, r: 6 };
    const colisor = { resolve(pos: THREE.Vector3, raio: number) {
      const dx = pos.x - casa.x, dz = pos.z - casa.z, d = Math.hypot(dx, dz), min = casa.r + raio;
      if (d >= min || d === 0) return 0;
      pos.x = casa.x + (dx / d) * min; pos.z = casa.z + (dz / d) * min;
      return min - d;
    } };
    const b = new Bichos(new THREE.Scene(), mapa, especies, { colisor });
    // she chases them through the field for a while
    const p: Protagonista = { x: 300, y: 5, z: 0, grounded: true, speed: 3 };
    for (let t = 0; t < 60; t++) { p.x = 300 + Math.cos(t * 0.3) * 15; p.z = Math.sin(t * 0.3) * 15; rodar(b, p, 1, t); }
    for (const o of b.todos) expect(Math.hypot(o.position.x - casa.x, o.position.z - casa.z)).toBeGreaterThan(casa.r);
  });
});
