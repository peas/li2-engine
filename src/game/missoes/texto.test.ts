import { describe, expect, it } from "vitest";
import type { ResumoMissao } from "./schema";
import { linhasMissoes, textoRecompensa } from "./texto";

const resumo = (id: string, status: ResumoMissao["status"], passos: ResumoMissao["passos"] = []): ResumoMissao =>
  ({ id, titulo: id.toUpperCase(), descricao: "", quem: "rosa", status, passo: 0, passos });

describe("textos das missões", () => {
  it("textoRecompensa: hearts, coins, then items", () => {
    expect(textoRecompensa(0, {}, (id) => id)).toBe("✓ missão feita!");
    expect(textoRecompensa(1, {}, (id) => id)).toBe("✓ missão feita! +1 coração");
    expect(textoRecompensa(1, {}, (id) => id, 6)).toBe("✓ missão feita! +1 coração, +6 moedas");
    expect(textoRecompensa(2, { pera: 2 }, () => "pera", 1)).toBe("✓ missão feita! +2 corações, +1 moeda, +2 pera");
  });

  it("linhasMissoes: new, active (step and progress), done, and the hidden ones", () => {
    let resumos = [
      resumo("a", "nova"),
      resumo("b", "ativa", [{ texto: "colha 3 peras", feito: false, progresso: "1/3" }]),
      resumo("c", "ativa", [{ texto: "x", feito: true, progresso: "" }]),
      resumo("d", "feita"),
    ];
    const defs = new Array(6).fill(null) as never[];
    const m = { resumos: () => resumos, defs };
    const nome = (id: string) => (id === "rosa" ? "Rosa" : id);
    expect(linhasMissoes(m, nome).map((l) => l.texto)).toEqual([
      "nova: Rosa quer falar com você", "ativa: colha 3 peras (1/3)", "ativa: quase lá", "feita! ✓", "mais 2 missões escondidas",
    ]);
    resumos = resumos.slice(0, 3).concat(resumo("e", "nova"), resumo("f", "nova"));
    expect(linhasMissoes(m, nome).at(-1)).toEqual({ titulo: "???", icone: "estrela", texto: "mais uma missão escondida" });
    expect(linhasMissoes(m, nome, { escondida: (n) => `+${n}` }).at(-1)!.texto).toBe("+1");
    resumos = resumos.concat(resumo("g", "nova"));
    expect(linhasMissoes(m, nome).some((l) => l.titulo === "???")).toBe(false);
  });
});
