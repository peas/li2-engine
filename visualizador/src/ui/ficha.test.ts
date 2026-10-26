import { describe, expect, it } from "vitest";
import { camposDoPasso } from "../carregador/esquema.ts";
import { montarGrafo } from "../carregador/grafo.ts";
import type { Conteudo, Missao } from "../carregador/tipos.ts";
import { passoInicial, problemasDaMissao } from "./ficha.ts";

const missao = (passos: Missao["passos"]): Missao => ({
  id: "bolo", titulo: "O bolo", descricao: "Um bolo.", quem: "nina", dificuldade: "facil", requer: [],
  dialogo_oferta: "o", dialogo_andamento: "a", dialogo_feito: "f", passos, ao_concluir: {}, arquivo: "missoes/bolo.yaml", avisos: [],
} as Missao);
const conteudo = (m: Missao): Conteudo => ({
  jogo: { nome: "teste", pasta: "teste", titulo: "Teste" }, missoes: [m],
  dialogos: [{ id: "nina-oi", personagem: "Nina", falas: [], arquivo: "d.yaml" }] as unknown as Conteudo["dialogos"],
  pessoas: [{ id: "nina", nome: "Nina" }], lugares: [{ id: "lago" }], itens: [{ id: "maca", nome: "maçã" }],
  receitas: [], poderes: [], novidades: [], ajuda: [], colhiveis: [], cutscenes: [], regioes: [],
  passosExtras: { domar: { descricao: "domar" } }, lidos: {}, avisos: [],
} as unknown as Conteudo);

describe("the ficha's helpers", () => {
  it("lists a step's fields in reading order: the text, the targets, the dialogues last", () => {
    expect(camposDoPasso("levar", {}).map((c) => c.campo)).toEqual(["texto", "npc", "item", "qtd", "dialogo", "dialogo_falta"]);
    expect(camposDoPasso("falar", {}).map((c) => `${c.campo}:${c.tipo}:${c.obrigatorio}`)).toEqual(["texto:texto:true", "npc:pessoa:true", "dialogo:dialogo:true"]);
    expect(camposDoPasso("domar", { domar: { descricao: "domar" } }).map((c) => c.campo)).toEqual(["texto", "dialogo"]);
  });

  it("a new step starts with something valid wherever it can, and an empty required dialogue is a 'falta'", () => {
    const m = missao([{ tipo: "coletar", texto: "colha", item: "maca", qtd: 3 }]);
    const g = montarGrafo(conteudo(m));
    const novo = passoInicial("falar", m, g);
    expect(novo).toEqual({ tipo: "falar", texto: "um passo novo", npc: "nina", dialogo: "" });
    const com = missao([...m.passos, novo as Missao["passos"][number]]);
    expect(problemasDaMissao(com, montarGrafo(conteudo(com)))).toEqual([{ missao: "bolo", passo: 1, campo: "dialogo", motivo: "falta" }]);
  });

  it("an id nothing in the game has is 'não existe no jogo'", () => {
    const m = missao([{ tipo: "levar", texto: "leve", npc: "ninguem", item: "maca", qtd: 1, dialogo: "nina-oi", dialogo_falta: "nina-oi" }]);
    expect(problemasDaMissao(m, montarGrafo(conteudo(m)))).toEqual([{ missao: "bolo", passo: 0, campo: "npc", motivo: "não existe no jogo" }]);
  });
});
