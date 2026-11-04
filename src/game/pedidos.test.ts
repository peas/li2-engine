import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Npc } from "./npc";
import { SinalPedidos, npcsComPedido, opacidadeDoBrilho } from "./pedidos";

const npc = (id: string, x = 0, extra: Partial<Npc> = {}): Npc => {
  const group = new THREE.Group();
  group.position.set(x, 0, 0);
  return { id, nome: id, dialogo: id, group, position: group.position, update() {}, canTalk: () => false, ...extra };
};
const missoes = (quem: string[]) => ({ pedidoAgora: (id: string) => (quem.includes(id) ? { id: "q" } : null) });

describe("npcsComPedido", () => {
  it("only who has a quest now, never a sign or a board", () => {
    const lista = [npc("ana"), npc("beto"), npc("placa", 0, { semMissoes: true })];
    expect(npcsComPedido(lista, missoes(["ana", "placa"])).map((n) => n.id)).toEqual(["ana"]);
  });
});

describe("opacidadeDoBrilho", () => {
  it("nothing past the radius, fades in over its last 20%, breathes slowly without going out", () => {
    expect(opacidadeDoBrilho(40, 40, 0)).toBe(0);
    expect(opacidadeDoBrilho(100, 40, 0)).toBe(0);
    const longe = opacidadeDoBrilho(39, 40, 0), perto = opacidadeDoBrilho(5, 40, 0);
    expect(longe).toBeGreaterThan(0);
    expect(longe).toBeLessThan(perto);
    const fases = Array.from({ length: 32 }, (_, i) => opacidadeDoBrilho(5, 40, i / 10));
    expect(Math.min(...fases)).toBeGreaterThan(0.25);
    expect(Math.max(...fases)).toBeLessThanOrEqual(0.9);
  });
});

describe("SinalPedidos", () => {
  const eu = new THREE.Vector3(0, 0, 0);
  const sinal = (lista: Npc[], quem: string[], opcoes = {}) => new SinalPedidos(new THREE.Group(), lista, missoes(quem), opcoes);

  it("a glow near whoever has a quest, within the radius only, and none while hidden", () => {
    const lista = [npc("perto", 10), npc("longe", 60), npc("sem", 5)];
    const s = sinal(lista, ["perto", "longe"]);
    s.update(1, eu, 0);
    expect(s.estado()).toMatchObject({ comPedido: ["perto", "longe"], visiveis: ["perto"] });
    s.update(0.01, eu, 0, true);
    expect(s.estado().visiveis).toEqual([]);
    s.update(0.01, eu, 0);
    expect(s.estado().visiveis).toEqual(["perto"]);
  });

  it("nobody invisible gets one; the quests are asked a few times a second, not every frame", () => {
    const pedidoAgora = vi.fn(() => ({ id: "q" }));
    const n = npc("ana", 5);
    n.group.visible = false;
    const s = new SinalPedidos(new THREE.Group(), [n], { pedidoAgora });
    s.update(1, eu, 0);
    expect(s.estado().visiveis).toEqual([]);
    n.group.visible = true;
    for (let i = 0; i < 5; i++) s.update(1 / 60, eu, 0);
    expect(pedidoAgora).toHaveBeenCalledTimes(1);
    expect(s.estado().visiveis).toEqual(["ana"]);
  });

  it("the minimap gets the live points of who has a quest (any distance); the switch turns both off and is remembered", () => {
    const setPedidos = vi.fn();
    localStorage.removeItem("t.pedidos");
    const lista = [npc("ana", 200)];
    const s = sinal(lista, ["ana"], { minimapa: { setPedidos }, chave: "t.pedidos" });
    s.update(1, eu, 0);
    expect(setPedidos).toHaveBeenLastCalledWith([lista[0].position]);
    const pasta = { add: () => ({ name: () => ({ onChange: (f: () => void) => { s.params.enabled = false; f(); } }) }) };
    s.addGui(pasta as never);
    s.update(1, eu, 0);
    expect(setPedidos).toHaveBeenLastCalledWith([]);
    expect(s.estado()).toMatchObject({ enabled: false, comPedido: [], visiveis: [] });
    expect(sinal(lista, ["ana"], { chave: "t.pedidos" }).params.enabled).toBe(false);
  });
});
