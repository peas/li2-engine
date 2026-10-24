import { describe, expect, it } from "vitest";
import { aplicarNoYaml, diffLinhas } from "./yaml.ts";

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
  it("rewrites the quest keeping comments (a trailing one loses its alignment), order and quotes; the reorder carries the step comment along", () => {
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
quem: vovo # quem oferece
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
