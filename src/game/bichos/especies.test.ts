import { describe, expect, it } from "vitest";
import { carregarEspecies, type LugarDe } from "./especies";

// Made-up places and items (the same shape as the first game's bichos.yaml: eight kinds, lists of regions)
const LUGARES: Record<string, { x: number; z: number; raio: number }> = {
  campoA: { x: 0, z: 0, raio: 80 }, campoB: { x: 200, z: 0, raio: 60 }, bosque: { x: -200, z: 50, raio: 50 },
  quintal: { x: 50, z: 300, raio: 20 }, morro: { x: -300, z: -300, raio: 120 }, torre: { x: 10, z: 10, raio: 30 },
  aldeia: { x: 400, z: 400, raio: 90 }, arvore: { x: -400, z: 400, raio: 40 }, poco: { x: 0, z: -500, raio: 15 },
  ilha: { x: 500, z: -500, raio: 25 }, ilhota: { x: 600, z: -600, raio: 20 },
};
const lugar: LugarDe = (k) => LUGARES[k] ?? null;
const ITENS = new Set(["carne-a", "carne-b", "carne-c", "carne-d", "carne-e", "carne-f", "carne-g", "carne-h", "peixe-x"]);
const itemExiste = (id: string) => ITENS.has(id);

const YAML = `
especies:
  - { id: veado, nome: veado, comportamento: pasta, regiao: campoA, quantidade: 8, velocidade: 1.4, velocidadeFuga: 9, foge: 22, item: carne-a, marco: { nome: campo, icone: "🦌" }, cores: ["#a0703f"] }
  - { id: ovelha, nome: ovelha, comportamento: pasta, regiao: campoB, quantidade: 6, velocidade: 0.8, velocidadeFuga: 4.5, foge: 12, item: carne-b, marco: null, cores: ["#f2efe6", "#2b2622"] }
  - { id: coelho, nome: coelho, comportamento: pasta, regiao: campoB, quantidade: 8, velocidade: 1.2, velocidadeFuga: 7, foge: 10, item: carne-c, marco: null, cores: ["#b08a64"] }
  - { id: javali, nome: javali, comportamento: pasta, regiao: bosque, quantidade: 6, velocidade: 1.3, velocidadeFuga: 8, foge: 14, item: carne-d, cores: ["#4a3326"] }
  - { id: galinha, nome: galinha, comportamento: pasta, regiao: quintal, quantidade: 7, velocidade: 0.7, velocidadeFuga: 4, foge: 9, item: carne-e, cores: ["#f4f0e6"] }
  - { id: lobo, nome: lobo, comportamento: bando, regiao: morro, quantidade: 5, velocidade: 2.2, velocidadeFuga: 11, foge: 25, item: carne-f, caca: toque, cores: ["#8a8d92"] }
  - { id: passaro, nome: pássaro, comportamento: voa, regiao: [torre, aldeia, arvore], quantidade: [5, 5, 5], velocidade: 9, velocidadeFuga: 15, foge: 14, item: carne-g, cores: ["#3a3a48"] }
  - { id: peixe, nome: peixe, comportamento: pula, regiao: [poco, ilha, ilhota], quantidade: [6, 4, 4], velocidade: 1, velocidadeFuga: 1, foge: 0, item: peixe-x, cores: ["#c9d3dc"] }
`;

describe("bichos.yaml", () => {
  it("loads the eight species with their regions resolved", () => {
    const ESPECIES = carregarEspecies(YAML, { lugar, itemExiste });
    expect(ESPECIES.map((e) => e.id).sort()).toEqual(["coelho", "galinha", "javali", "lobo", "ovelha", "passaro", "peixe", "veado"]);
    const n = (id: string) => ESPECIES.find((e) => e.id === id)!.grupos.reduce((s, g) => s + g.quantidade, 0);
    expect(n("passaro")).toBe(15);
    expect(n("peixe")).toBe(14);
    // the pack animal: one tap of E; everyone else is hunted by holding E; a pack tests by default
    expect(ESPECIES.find((e) => e.id === "lobo")).toMatchObject({ item: "carne-f", caca: "toque", testa: true });
    expect(ESPECIES.find((e) => e.id === "veado")!.caca).toBe("segurar");
    for (const [id, item, l] of [["javali", "carne-d", "bosque"], ["galinha", "carne-e", "quintal"]]) {
      const e = ESPECIES.find((x) => x.id === id)!;
      expect(e).toMatchObject({ item, caca: "segurar", comportamento: "pasta" });
      expect(e.grupos[0].regiao.chave).toBe(l);
      expect(e.grupos[0].regiao.raio).toBeGreaterThan(0);
      expect(itemExiste(item)).toBe(true);
    }
  });

  it("rejects an unknown region or item", () => {
    const base = "especies:\n  - { id: x, nome: x, comportamento: pasta, regiao: %R, quantidade: 1, velocidade: 1, velocidadeFuga: 2, foge: 1, item: %I, cores: ['#ffffff'] }";
    expect(() => carregarEspecies(base.replace("%R", "nowhere").replace("%I", "null"), { lugar, itemExiste })).toThrow(/regiao/);
    expect(() => carregarEspecies(base.replace("%R", "campoA").replace("%I", "carne-z"), { lugar, itemExiste })).toThrow(/item/);
    expect(carregarEspecies(base.replace("%R", "campoA").replace("%I", "peixe-x"), { lugar, itemExiste })[0].grupos[0].regiao.raio).toBeGreaterThan(0);
    // without `itemExiste` the items are not checked
    expect(carregarEspecies(base.replace("%R", "campoA").replace("%I", "carne-z"), { lugar })[0].item).toBe("carne-z");
  });

  it("a pack that does not test, and a follower with its home", () => {
    const y = `especies:
  - { id: lobo, nome: lobo, comportamento: bando, regiao: morro, quantidade: 5, velocidade: 2.2, velocidadeFuga: 11, foge: 25, item: null, testa: false, cores: ["#8a8d92"] }
  - { id: ovelha, nome: ovelha, comportamento: segue, regiao: campoA, quantidade: 1, velocidade: 1, velocidadeFuga: 3, foge: 0, item: null, casa: quintal, seguidor: { atras: 2.5 }, cores: ["#ffffff"] }`;
    const [lobo, ovelha] = carregarEspecies(y, { lugar });
    expect(lobo.testa).toBe(false);
    expect(ovelha.casa).toEqual({ chave: "quintal", x: 50, z: 300, raio: 20 });
    expect(ovelha.seguidor).toEqual({ atras: 2.5 });
    expect(() => carregarEspecies(y.replace("casa: quintal, ", ""), { lugar })).toThrow(/casa/);
    expect(() => carregarEspecies(y.replace("casa: quintal", "casa: nowhere"), { lugar })).toThrow(/regiao "nowhere"/);
  });
});
