import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { criarAparencia } from "./aparencia";

const BICHO = criarAparencia({
  partes: { corpo: ["Corpo", "Main"], olhos: ["Olhos", "Eyes"] },
  slots: ["chapeu"] as const,
  padrao: { corpo: "#112233", olhos: "#ffffff", chapeu: null },
});

/** A fake model: two meshes, one with two materials, one material the game does not know. */
function modelo() {
  const root = new THREE.Group();
  const corpo = new THREE.MeshStandardMaterial({ name: "Main", color: "#000000" });
  const olhos = new THREE.MeshStandardMaterial({ name: "Eyes", color: "#000000" });
  const outro = new THREE.MeshStandardMaterial({ name: "Claws", color: "#000000" });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), [corpo, outro]));
  const cabeca = new THREE.Group();
  cabeca.add(new THREE.Mesh(new THREE.BoxGeometry(), olhos));
  root.add(cabeca);
  return { root, corpo, olhos, outro };
}

describe("criarAparencia (colours by material, slots by id)", () => {
  it("lists parts and slots, maps material names (canonical and aliases) to parts", () => {
    expect(BICHO.PARTES).toEqual(["corpo", "olhos"]);
    expect(BICHO.SLOTS).toEqual(["chapeu"]);
    expect(BICHO.parteDe("Corpo")).toBe("corpo");
    expect(BICHO.parteDe("Main")).toBe("corpo");
    expect(BICHO.parteDe("Eyes")).toBe("olhos");
    expect(BICHO.parteDe("Claws")).toBeUndefined();
  });

  it("aplicar recolours every known material, nested and multi-material, and leaves the others", () => {
    const m = modelo();
    BICHO.aplicar(m.root, { corpo: "#ff0000", olhos: "#00ff00" });
    expect(m.corpo.color.getHexString()).toBe("ff0000");
    expect(m.olhos.color.getHexString()).toBe("00ff00");
    expect(m.outro.color.getHexString()).toBe("000000");
  });

  it("completar fills what is missing from the default and drops junk", () => {
    expect(BICHO.completar(null)).toEqual({ corpo: "#112233", olhos: "#ffffff", chapeu: null });
    expect(BICHO.completar({ corpo: "#abcdef", olhos: 3, chapeu: "palha", asa: "#000" })).toEqual({ corpo: "#abcdef", olhos: "#ffffff", chapeu: "palha" });
  });

  it("refuses a material in two parts and a default without every key", () => {
    expect(() => criarAparencia({ partes: { a: ["X"], b: ["X"] }, padrao: { a: "#000", b: "#000" } })).toThrow(/duas partes/);
    expect(() => criarAparencia({ partes: { a: ["X"] }, slots: ["s"], padrao: { a: "#000" } as never })).toThrow(/falta "s"/);
  });
});
