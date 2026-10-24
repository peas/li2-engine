import { describe, expect, it } from "vitest";
import { z } from "zod";
import { criarCatalogo } from "./catalogo";
import { criarNovidades, dataCurta } from "./novidades";

const YAML = `novidades:
  - { versao: 1, data: 2026-10-20, titulo: Primeira, falas: ["oi"] }
  - { versao: 3, data: 2026-10-22, titulo: Terceira, falas: ["a", "b"] }
  - { versao: 2, data: 2026-10-21, titulo: Segunda, falas: ["c"] }
`;

describe("criarNovidades", () => {
  it("sorts newest first; the newest is the current version", () => {
    const n = criarNovidades(YAML);
    expect(n.NOVIDADES.map((x) => x.versao)).toEqual([3, 2, 1]);
    expect(n.VERSAO).toBe(3);
    expect(dataCurta(n.NOVIDADES[0].data)).toBe("22/10/2026");
  });
  it("pending = newer than what the save saw", () => {
    const n = criarNovidades(YAML);
    expect(n.pendentes(0).map((x) => x.versao)).toEqual([3, 2, 1]);
    expect(n.pendentes(2).map((x) => x.versao)).toEqual([3]);
    expect(n.pendentes(3)).toEqual([]);
  });
  it("a repeated version or a malformed file throws", () => {
    expect(() => criarNovidades(YAML.replace("versao: 2", "versao: 3"))).toThrow(/repetida/);
    expect(() => criarNovidades("novidades: []")).toThrow();
  });
});

describe("criarCatalogo", () => {
  const Item = z.object({ id: z.string().regex(/^[a-z-]+$/), nome: z.string() });
  it("reads the list under the key, finds by id", () => {
    const c = criarCatalogo("itens:\n  - { id: maca, nome: maçã }\n  - { id: peixe, nome: peixe }\n", Item, "itens.yaml", "itens");
    expect(c.lista.map((i) => i.id)).toEqual(["maca", "peixe"]);
    expect(c.por("maca").nome).toBe("maçã");
    expect(c.is("peixe")).toBe(true);
    expect(c.is("bolo")).toBe(false);
    expect(() => c.por("bolo")).toThrow(/"bolo" não existe em itens\.yaml \(há: maca, peixe\)/);
  });
  it("readable errors: bad entry, repeated id, missing list", () => {
    expect(() => criarCatalogo("itens:\n  - { id: Maca, nome: x }\n", Item, "itens.yaml", "itens")).toThrow(/itens\.yaml/);
    expect(() => criarCatalogo("itens:\n  - { id: a, nome: x }\n  - { id: a, nome: y }\n", Item, "itens.yaml", "itens")).toThrow(/repetido "a"/);
    expect(() => criarCatalogo("coisas: []\n", Item, "itens.yaml", "itens")).toThrow(/itens\.yaml/);
  });
});
