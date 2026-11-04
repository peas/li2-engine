import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { criarModelo, ESCALA_BICHOS, type TipoModelo } from "./modelos";

/** Every model, with how many legs it has and its real height (m, top of the head, ears or tail, roughly). */
const TODOS: [TipoModelo, number, number | null][] = [
  ["veado", 4, 1.6], ["ovelha", 4, 1.0], ["coelho", 4, 0.4], ["lobo", 4, 0.9], ["javali", 4, 0.9], ["galinha", 2, 0.4],
  ["jumento", 4, 1.6], ["cachorro", 4, 0.65], ["gato", 4, 0.35],
  // birds and fish: origin at the body centre, no legs
  ["passaro", 0, null], ["peixe", 0, null],
];

describe("modelos", () => {
  it.each(TODOS)("%s builds with its legs, feet on the ground, a length", (tipo, pernas, altura) => {
    const m = criarModelo(tipo, ["#8a6a4a"], `teste-${tipo}`);
    expect(m.legs.length).toBe(pernas);
    expect(m.length).toBeGreaterThan(0);
    expect(m.stride).toBeGreaterThan(0);
    expect(m.gait.length).toBe(pernas);
    if (altura === null) return;
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    expect(Math.abs(box.min.y)).toBeLessThan(0.05 * ESCALA_BICHOS);
    // the body itself is above the ground, and the whole animal is about its real size
    expect(new THREE.Box3().setFromObject(m.body).min.y).toBeGreaterThan(-0.05 * ESCALA_BICHOS);
    expect(box.max.y / ESCALA_BICHOS).toBeGreaterThan(altura * 0.7);
    expect(box.max.y / ESCALA_BICHOS).toBeLessThan(altura * 1.3);
  });

  it("the three newcomers: donkey at 1.2 m withers, dog 0.6, cat 0.3, and facing +z", () => {
    for (const [tipo, cernelha] of [["jumento", 1.2], ["cachorro", 0.6], ["gato", 0.3]] as const) {
      const m = criarModelo(tipo, ["#7a7068", "#d8d0c4", "#2e2620"], `cernelha-${tipo}`, 1);
      // the top of the back above the front hips
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, m.legs[0].position.z), new THREE.Vector3(0, -1, 0));
      m.group.updateMatrixWorld(true);
      const hit = ray.intersectObject(m.body)[0];
      expect(hit.point.y).toBeGreaterThan(cernelha * 0.85);
      expect(hit.point.y).toBeLessThan(cernelha * 1.2);
      // the head is in front: the body reaches further along +z than along -z (tails hang behind, shorter)
      const box = new THREE.Box3().setFromObject(m.body);
      expect(box.max.z).toBeGreaterThan(m.legs[0].position.z);
    }
  });

  it("an unknown model is an error naming the ones there are", () => {
    expect(() => criarModelo("dragao" as TipoModelo, ["#ffffff"])).toThrow(/jumento, cachorro, gato/);
  });
});
