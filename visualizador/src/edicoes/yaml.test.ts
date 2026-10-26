import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { Op } from "../../../src/game/edicoes/edicoes.ts";
import { aplicarNoYaml, diffLinhas } from "./yaml.ts";

/** The lines that differ between two texts (only "-" and "+" lines of the diff). */
const mudou = (a: string, b: string) => diffLinhas(a, b).filter((l) => !l.startsWith("  "));

const MISSAO = `# Missão da Nina (fala da Olivia).
id: bolo-de-macas
titulo: "O bolo de maçãs"
descricao: "A Nina quer fazer um bolo."
quem: nina            # quem oferece
dificuldade: facil
passos:
  - tipo: coletar
    texto: "colha 3 maçãs na floresta"
    item: maca
    qtd: 3
  # a entrega
  - tipo: levar
    texto: "leve as 3 maçãs para a Nina"
    npc: nina
    item: maca
    qtd: 3
ao_concluir:
  coracoes: 1
  moedas: 4
`;
const DIALOGO = `# A oferta.
personagem: Nina
retrato: nina
falas:
  - texto: "Eu queria fazer um *bolo*.\\nMas estou sem frutas."
  - texto: "Você pega umas *3 maçãs* pra mim?"
`;

describe("aplicarNoYaml", () => {
  it("rewrites the quest touching only what changed: comments keep their alignment, order and quotes stay, the reorder carries the step comment along", () => {
    const r = aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [
      { tipo: "missao.quem", missao: "bolo-de-macas", de: "nina", para: "vovo" },
      { tipo: "missao.texto", missao: "bolo-de-macas", campo: "titulo", de: "O bolo de maçãs", para: "O bolo gigante" },
      { tipo: "passo.alvo", missao: "bolo-de-macas", passo: 1, campo: "npc", de: "nina", para: "vovo" },
      { tipo: "passo.qtd", missao: "bolo-de-macas", passo: 0, de: 3, para: 5 },
      { tipo: "missao.recompensa", missao: "bolo-de-macas", campo: "moedas", de: 4, para: 0 },
      { tipo: "missao.recompensa", missao: "bolo-de-macas", campo: "coracoes", de: 1, para: 2 },
      { tipo: "passo.ordem", missao: "bolo-de-macas", de: ["colha 3 maçãs na floresta", "leve as 3 maçãs para a Nina"], para: [1, 0] },
    ]);
    expect(r.conflitos).toEqual([]);
    expect(r.fonte).toBe(`# Missão da Nina (fala da Olivia).
id: bolo-de-macas
titulo: "O bolo gigante"
descricao: "A Nina quer fazer um bolo."
quem: vovo            # quem oferece
dificuldade: facil
passos:
  # a entrega
  - tipo: levar
    texto: "leve as 3 maçãs para a Nina"
    npc: vovo
    item: maca
    qtd: 3
  - tipo: coletar
    texto: "colha 3 maçãs na floresta"
    item: maca
    qtd: 5
ao_concluir:
  coracoes: 2
`);
  });

  it("writes a two-line speech double-quoted with \\n, like the games do, and leaves a conflicting op out", () => {
    const r = aplicarNoYaml(DIALOGO, "dialogo", "bolo-de-macas-oferta", [
      { tipo: "fala.texto", dialogo: "bolo-de-macas-oferta", indice: 0, de: "Eu queria fazer um *bolo*.\nMas estou sem frutas.", para: "Eu queria um *bolo* enorme!\nMe ajuda?" },
      { tipo: "fala.texto", dialogo: "bolo-de-macas-oferta", indice: 1, de: "outra coisa", para: "x" },
    ]);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.conflitos).toHaveLength(1);
    expect(r.fonte).toBe(`# A oferta.
personagem: Nina
retrato: nina
falas:
  - texto: "Eu queria um *bolo* enorme!\\nMe ajuda?"
  - texto: "Você pega umas *3 maçãs* pra mim?"
`);
  });

  it("returns the source untouched when nothing applies", () => {
    const r = aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [{ tipo: "missao.quem", missao: "bolo-de-macas", de: "marcel", para: "vovo" }]);
    expect(r.fonte).toBe(MISSAO);
  });

  it("diffLinhas shows only the changed lines with context", () => {
    const d = diffLinhas("a\nb\nc\nd\ne\nf\ng\nh", "a\nb\nc\nX\ne\nf\ng\nh");
    expect(d).toEqual(["  b", "  c", "- d", "+ X", "  e", "  f"]);
  });
});

describe("aplicarNoYaml: round-trip fidelity (25/10/2026)", () => {
  const FIEL = `id: passeio
titulo: "O passeio"     # o nome que aparece
descricao: 'Um passeio pela ilha.'
quem: nina              # quem oferece
passos:
  # primeiro, ir aos três lugares
  - tipo: ir
    lugar: [vila, lago, caverna]   # em qualquer ordem
    raio: 10
    texto: "visite a vila, o lago e a caverna"

  # depois, contar para a Nina
  - tipo: falar
    npc: nina
    dialogo: passeio-fim
    texto: "conte para a Nina"

ao_concluir: { moedas: 3 }
`;

  it("keeps aligned trailing comments, single quotes and flow lists exactly as they were", () => {
    const r = aplicarNoYaml(FIEL, "missao", "passeio", [
      { tipo: "missao.quem", missao: "passeio", de: "nina", para: "vovo" },
      { tipo: "missao.texto", missao: "passeio", campo: "descricao", de: "Um passeio pela ilha.", para: "Um passeio bem longo." },
      { tipo: "passo.alvo", missao: "passeio", passo: 0, campo: "lugar", de: "lago", para: "praia" },
    ]);
    expect(r.reescrito).toBeUndefined();
    expect(mudou(FIEL, r.fonte).sort()).toEqual([
      "- descricao: 'Um passeio pela ilha.'", "+ descricao: 'Um passeio bem longo.'",
      "- quem: nina              # quem oferece", "+ quem: vovo              # quem oferece",
      "-     lugar: [vila, lago, caverna]   # em qualquer ordem", "+     lugar: [vila, praia, caverna]   # em qualquer ordem",
    ].sort());
  });

  it("the reorder moves each step with the comment right above it, the first step's included, and keeps the blank lines", () => {
    const r = aplicarNoYaml(FIEL, "missao", "passeio", [
      { tipo: "passo.ordem", missao: "passeio", de: ["visite a vila, o lago e a caverna", "conte para a Nina"], para: [1, 0] },
    ]);
    expect(r.reescrito).toBeUndefined();
    expect(r.fonte).toBe(`id: passeio
titulo: "O passeio"     # o nome que aparece
descricao: 'Um passeio pela ilha.'
quem: nina              # quem oferece
passos:
  # depois, contar para a Nina
  - tipo: falar
    npc: nina
    dialogo: passeio-fim
    texto: "conte para a Nina"

  # primeiro, ir aos três lugares
  - tipo: ir
    lugar: [vila, lago, caverna]   # em qualquer ordem
    raio: 10
    texto: "visite a vila, o lago e a caverna"

ao_concluir: { moedas: 3 }
`);
    expect(parse(r.fonte).passos.map((p: { tipo: string }) => p.tipo)).toEqual(["falar", "ir"]);
  });

  it("a reward added to a flow map goes in after the last entry, keeping the braces' spacing", () => {
    const r = aplicarNoYaml(FIEL, "missao", "passeio", [{ tipo: "missao.recompensa", missao: "passeio", campo: "coracoes", de: undefined, para: 1 }]);
    expect(r.reescrito).toBeUndefined();
    expect(mudou(FIEL, r.fonte)).toEqual(["- ao_concluir: { moedas: 3 }", "+ ao_concluir: { moedas: 3, coracoes: 1 }"]);
  });

  it("removing from a flow map falls back to the Document rewrite, with no padding inside the brackets", () => {
    const r = aplicarNoYaml(FIEL, "missao", "passeio", [{ tipo: "missao.recompensa", missao: "passeio", campo: "moedas", de: 3, para: 0 }]);
    expect(r.reescrito).toBe(true);
    expect(r.fonte).toContain("lugar: [vila, lago, caverna]");
    expect(parse(r.fonte).ao_concluir).toBeUndefined();
  });

  it("adds a reward line to a block ao_concluir, or a new ao_concluir at the end, and removes the key when its last reward goes", () => {
    const comMoedas = aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [{ tipo: "missao.recompensa", missao: "bolo-de-macas", campo: "coracoes", de: 1, para: 0 }]);
    expect(mudou(MISSAO, comMoedas.fonte)).toEqual(["-   coracoes: 1"]);
    const sem = aplicarNoYaml(comMoedas.fonte, "missao", "bolo-de-macas", [{ tipo: "missao.recompensa", missao: "bolo-de-macas", campo: "moedas", de: 4, para: 0 }]);
    expect(sem.fonte.endsWith("    qtd: 3\n")).toBe(true);
    expect(parse(sem.fonte).ao_concluir).toBeUndefined();
    const volta = aplicarNoYaml(sem.fonte, "missao", "bolo-de-macas", [{ tipo: "missao.recompensa", missao: "bolo-de-macas", campo: "moedas", de: undefined, para: 2 }]);
    expect(volta.fonte.endsWith("ao_concluir:\n  moedas: 2\n")).toBe(true);
    const mais = aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [{ tipo: "missao.recompensa", missao: "bolo-de-macas", campo: "moedas", de: 4, para: 6 }]);
    expect(mudou(MISSAO, mais.fonte)).toEqual(["-   moedas: 4", "+   moedas: 6"]);
    expect([comMoedas, sem, volta, mais].every((r) => !r.reescrito)).toBe(true);
  });

  it("on the real example quests, changing who gives each one changes exactly one line", () => {
    const pasta = fileURLToPath(new URL("../../../exemplos/missoes-dos-jogos/missoes/", import.meta.url));
    for (const f of readdirSync(pasta).filter((x) => x.endsWith(".yaml"))) {
      const fonte = readFileSync(pasta + f, "utf8");
      const m = parse(fonte);
      const r = aplicarNoYaml(fonte, "missao", m.id, [{ tipo: "missao.quem", missao: m.id, de: m.quem, para: "outra-pessoa" }]);
      expect(r.reescrito, f).toBeUndefined();
      expect(mudou(fonte, r.fonte), f).toHaveLength(2);
      if (m.passos.length > 1) {
        const ordem = [...m.passos.keys()].reverse();
        const o = aplicarNoYaml(fonte, "missao", m.id, [{ tipo: "passo.ordem", missao: m.id, de: m.passos.map((p: { texto: string }) => p.texto), para: ordem }]);
        expect(o.reescrito, f).toBeUndefined();
        expect(parse(o.fonte).passos, f).toEqual(ordem.map((i) => m.passos[i]));
        expect(o.fonte.split("\n").sort(), f).toEqual(fonte.split("\n").sort());
      }
    }
  });
});

describe("aplicarNoYaml: the panel's ops (26/10/2026)", () => {
  it("sets any step field in place, or adds it as a new line in that step; difficulty and reward items too", () => {
    const r = aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [
      { tipo: "passo.campo", missao: "bolo-de-macas", passo: 0, campo: "texto", de: "colha 3 maçãs na floresta", para: "colha 3 maçãs vermelhas" },
      { tipo: "passo.campo", missao: "bolo-de-macas", passo: 1, campo: "dialogo", de: undefined, para: "nina-obrigada" },
      { tipo: "missao.dificuldade", missao: "bolo-de-macas", de: "facil", para: "media" },
      { tipo: "missao.item", missao: "bolo-de-macas", item: "chapeu", de: undefined, para: 1 },
    ]);
    expect(r.reescrito).toBeUndefined();
    expect(mudou(MISSAO, r.fonte)).toEqual([
      "- dificuldade: facil", "+ dificuldade: media",
      '-     texto: "colha 3 maçãs na floresta"', '+     texto: "colha 3 maçãs vermelhas"',
      "+     dialogo: nina-obrigada",
      "+   itens:", "+     chapeu: 1",
    ]);
    const sem = aplicarNoYaml(r.fonte, "missao", "bolo-de-macas", [{ tipo: "missao.item", missao: "bolo-de-macas", item: "chapeu", de: 1, para: 0 }]);
    expect(sem.fonte).toBe(aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [
      { tipo: "passo.campo", missao: "bolo-de-macas", passo: 0, campo: "texto", de: "colha 3 maçãs na floresta", para: "colha 3 maçãs vermelhas" },
      { tipo: "passo.campo", missao: "bolo-de-macas", passo: 1, campo: "dialogo", de: undefined, para: "nina-obrigada" },
      { tipo: "missao.dificuldade", missao: "bolo-de-macas", de: "facil", para: "media" },
    ]).fonte);
  });

  it("a new step is written like the others at the end; a deleted one leaves with its comment; the order places the new one", () => {
    const r = aplicarNoYaml(MISSAO, "missao", "bolo-de-macas", [
      { tipo: "passo.novo", missao: "bolo-de-macas", n: 0, de: 2, para: { tipo: "falar", texto: "conte para o vovô", npc: "vovo", dialogo: "vovo-bolo" } },
      { tipo: "passo.apagar", missao: "bolo-de-macas", passo: 1, de: "leve as 3 maçãs para a Nina" },
      { tipo: "passo.ordem", missao: "bolo-de-macas", de: ["colha 3 maçãs na floresta", "leve as 3 maçãs para a Nina"], para: [2, 0] },
    ]);
    expect(r.conflitos).toEqual([]);
    expect(r.reescrito).toBeUndefined();
    expect(r.fonte).toContain(`passos:
  - tipo: falar
    texto: conte para o vovô
    npc: vovo
    dialogo: vovo-bolo
  - tipo: coletar
    texto: "colha 3 maçãs na floresta"
    item: maca
    qtd: 3
ao_concluir:`);
    expect(r.fonte).not.toContain("# a entrega");
  });

  it("on the real example quests: a new step, a deleted step, a field and an item, with no fallback where the shapes are plain", () => {
    const pasta = fileURLToPath(new URL("../../../exemplos/missoes-dos-jogos/missoes/", import.meta.url));
    for (const f of readdirSync(pasta).filter((x) => x.endsWith(".yaml"))) {
      const fonte = readFileSync(pasta + f, "utf8");
      const m = parse(fonte);
      const ops: Op[] = [
        { tipo: "passo.campo", missao: m.id, passo: 0, campo: "texto", de: m.passos[0].texto, para: "um texto novo" },
        { tipo: "passo.novo", missao: m.id, n: 0, de: m.passos.length, para: { tipo: "falar", texto: "fale com alguém", npc: "alguem", dialogo: "alguem-fala" } },
      ];
      if (m.passos.length > 1) ops.push({ tipo: "passo.apagar", missao: m.id, passo: 1, de: m.passos[1].texto });
      const r = aplicarNoYaml(fonte, "missao", m.id, ops);
      expect(r.conflitos, f).toEqual([]);
      expect(r.reescrito, f).toBeUndefined();
      const passos = parse(r.fonte).passos;
      expect(passos[0].texto, f).toBe("um texto novo");
      expect(passos[passos.length - 1], f).toEqual({ tipo: "falar", texto: "fale com alguém", npc: "alguem", dialogo: "alguem-fala" });
      expect(passos.length, f).toBe(m.passos.length + 1 - (m.passos.length > 1 ? 1 : 0));
    }
  });
});
