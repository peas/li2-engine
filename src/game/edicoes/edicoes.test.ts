import { describe, expect, it } from "vitest";
import { DocumentoEdicoesSchema, aplicarEdicoes, chaveDaOp, descreverOp, juntarOp, opVazia, type ConteudoEditavel, type Op } from "./edicoes";

const conteudo = (): ConteudoEditavel => ({
  missoes: {
    bolo: {
      id: "bolo", titulo: "O bolo", descricao: "A Nina quer um bolo.", quem: "nina",
      passos: [
        { tipo: "coletar", texto: "colha 3 maçãs", item: "maca", qtd: 3 },
        { tipo: "levar", texto: "leve para a Nina", npc: "nina", item: "maca", qtd: 3 },
        { tipo: "ir", texto: "vá aos dois lugares", lugar: ["lago", "vila"], raio: 5 },
      ],
      ao_concluir: { coracoes: 1, moedas: 4 },
    },
  },
  dialogos: { oferta: { personagem: "Nina", falas: [{ texto: "Eu queria um *bolo*." }, { texto: "Me ajuda?" }] } },
});

describe("aplicarEdicoes", () => {
  it("applies every kind of op when `de` matches, without touching the input", () => {
    const c = conteudo();
    const ops: Op[] = [
      { tipo: "missao.quem", missao: "bolo", de: "nina", para: "vovo" },
      { tipo: "missao.texto", missao: "bolo", campo: "titulo", de: "O bolo", para: "O bolo da vovó" },
      { tipo: "missao.recompensa", missao: "bolo", campo: "moedas", de: 4, para: 10 },
      { tipo: "passo.alvo", missao: "bolo", passo: 1, campo: "npc", de: "nina", para: "vovo" },
      { tipo: "passo.alvo", missao: "bolo", passo: 2, campo: "lugar", de: "vila", para: "caverna" },
      { tipo: "passo.qtd", missao: "bolo", passo: 0, de: 3, para: 5 },
      { tipo: "fala.texto", dialogo: "oferta", indice: 0, de: "Eu queria um *bolo*.", para: "Eu queria um *bolo* grande." },
      { tipo: "passo.ordem", missao: "bolo", de: ["colha 3 maçãs", "leve para a Nina", "vá aos dois lugares"], para: [2, 0, 1] },
    ];
    const r = aplicarEdicoes(c, ops);
    expect(r.conflitos).toEqual([]);
    expect(r.aplicadas).toHaveLength(ops.length);
    const m = r.conteudo.missoes.bolo;
    expect(m.quem).toBe("vovo");
    expect(m.titulo).toBe("O bolo da vovó");
    expect(m.ao_concluir).toEqual({ coracoes: 1, moedas: 10 });
    // indices count the original order; the reorder runs last
    expect(m.passos!.map((p) => p.texto)).toEqual(["vá aos dois lugares", "colha 3 maçãs", "leve para a Nina"]);
    expect(m.passos![0].lugar).toEqual(["lago", "caverna"]);
    expect(m.passos![1].qtd).toBe(5);
    expect(m.passos![2].npc).toBe("vovo");
    expect(r.conteudo.dialogos.oferta.falas![0].texto).toBe("Eu queria um *bolo* grande.");
    // pure
    expect(conteudo()).toEqual(c);
    expect(r.conteudo.dialogos.oferta).not.toBe(c.dialogos.oferta);
  });

  it("is idempotent: applying the result of the ops to the edited content gives conflicts, not double edits", () => {
    const ops: Op[] = [{ tipo: "passo.qtd", missao: "bolo", passo: 0, de: 3, para: 5 }];
    const uma = aplicarEdicoes(conteudo(), ops);
    const duas = aplicarEdicoes(uma.conteudo, ops);
    expect(duas.conteudo.missoes.bolo.passos![0].qtd).toBe(5);
    expect(duas.conflitos).toHaveLength(1);
  });

  it("turns a changed repo value, a missing quest, step or line into a conflict in Portuguese", () => {
    const r = aplicarEdicoes(conteudo(), [
      { tipo: "missao.quem", missao: "bolo", de: "marcel", para: "vovo" },
      { tipo: "missao.quem", missao: "sumiu", de: "nina", para: "vovo" },
      { tipo: "passo.qtd", missao: "bolo", passo: 7, de: 3, para: 5 },
      { tipo: "fala.texto", dialogo: "oferta", indice: 5, de: "x", para: "y" },
      { tipo: "passo.ordem", missao: "bolo", de: ["outro", "texto"], para: [1, 0] },
      { tipo: "passo.alvo", missao: "bolo", passo: 2, campo: "lugar", de: "praia", para: "caverna" },
    ]);
    expect(r.aplicadas).toEqual([]);
    expect(r.conflitos.map((c) => c.motivo)).toEqual([
      '"quem" da missão "bolo" mudou no jogo: agora é "nina"',
      'a missão "sumiu" não existe mais',
      'a missão "bolo" não tem mais o passo 8',
      'a conversa "oferta" não tem mais a fala 6',
      'o passo 3 de "bolo" não tem mais "praia" em lugar',
      // the reorder runs last
      'os passos da missão "bolo" mudaram no jogo (a ordem nova não bate mais)',
    ]);
    expect(r.conteudo.missoes.bolo).toEqual(conteudo().missoes.bolo);
  });

  it("removes a reward field set to 0 and accepts an absent one (de undefined)", () => {
    const r = aplicarEdicoes(conteudo(), [
      { tipo: "missao.recompensa", missao: "bolo", campo: "moedas", de: 4, para: 0 },
      { tipo: "missao.recompensa", missao: "bolo", campo: "coracoes", de: 1, para: 2 },
    ]);
    expect(r.conteudo.missoes.bolo.ao_concluir).toEqual({ coracoes: 2 });
    const sem = aplicarEdicoes({ missoes: { x: { passos: [] } }, dialogos: {} }, [{ tipo: "missao.recompensa", missao: "x", campo: "moedas", de: undefined, para: 3 }]);
    expect(sem.conteudo.missoes.x.ao_concluir).toEqual({ moedas: 3 });
  });
});

describe("ops as a list", () => {
  it("juntarOp replaces the op on the same target and drops an empty one", () => {
    const a: Op = { tipo: "fala.texto", dialogo: "oferta", indice: 0, de: "a", para: "b" };
    const b: Op = { tipo: "fala.texto", dialogo: "oferta", indice: 0, de: "a", para: "c" };
    const outra: Op = { tipo: "missao.quem", missao: "bolo", de: "nina", para: "vovo" };
    expect(chaveDaOp(a)).toBe(chaveDaOp(b));
    expect(juntarOp([a, outra], b)).toEqual([outra, b]);
    expect(juntarOp([a, outra], { ...b, para: "a" })).toEqual([outra]);
    expect(opVazia({ tipo: "passo.ordem", missao: "bolo", de: [], para: [0, 1] })).toBe(true);
    expect(opVazia({ tipo: "missao.recompensa", missao: "bolo", campo: "moedas", de: undefined, para: 0 })).toBe(true);
  });

  it("the document schema accepts an export and refuses an unknown op", () => {
    const doc = { versao: 1, jogo: "tresilhas", autor: "Olivia", ops: [{ tipo: "missao.quem", missao: "bolo", de: "nina", para: "vovo", quando: "2026-10-23T10:00:00Z", autor: "Olivia" }] };
    expect(DocumentoEdicoesSchema.parse(doc).ops).toHaveLength(1);
    expect(DocumentoEdicoesSchema.safeParse({ ...doc, ops: [{ tipo: "missao.apagar", missao: "bolo" }] }).success).toBe(false);
    expect(DocumentoEdicoesSchema.safeParse({ ...doc, ops: [{ tipo: "missao.texto", missao: "bolo", campo: "titulo", de: "x", para: "   " }] }).success).toBe(false);
  });

  it("descreverOp reads in Portuguese with names", () => {
    const nome = (_: string, id: string) => ({ bolo: "O bolo", nina: "Nina", vovo: "Vovô Bento" } as Record<string, string>)[id] ?? id;
    expect(descreverOp({ tipo: "missao.quem", missao: "bolo", de: "nina", para: "vovo" }, nome)).toBe("a missão «O bolo» agora é dada por Vovô Bento (antes: Nina)");
    expect(descreverOp({ tipo: "passo.ordem", missao: "bolo", de: [], para: [1, 0] }, nome)).toBe("a missão «O bolo»: passos na ordem 2, 1");
  });
});

describe("aplicarEdicoes: the panel's ops (26/10/2026)", () => {
  it("edits any simple field of a step, the difficulty and the reward items", () => {
    const r = aplicarEdicoes(conteudo(), [
      { tipo: "passo.campo", missao: "bolo", passo: 0, campo: "texto", de: "colha 3 maçãs", para: "colha 3 maçãs vermelhas" },
      { tipo: "passo.campo", missao: "bolo", passo: 2, campo: "raio", de: 5, para: 12 },
      { tipo: "passo.campo", missao: "bolo", passo: 1, campo: "dialogo", de: undefined, para: "nina-obrigada" },
      { tipo: "missao.dificuldade", missao: "bolo", de: undefined, para: "media" },
      { tipo: "missao.item", missao: "bolo", item: "chapeu", de: undefined, para: 1 },
    ]);
    expect(r.conflitos).toEqual([]);
    const m = r.conteudo.missoes.bolo;
    expect(m.passos![0].texto).toBe("colha 3 maçãs vermelhas");
    expect(m.passos![2].raio).toBe(12);
    expect(m.passos![1].dialogo).toBe("nina-obrigada");
    expect(m.dificuldade).toBe("media");
    expect(m.ao_concluir).toEqual({ coracoes: 1, moedas: 4, itens: { chapeu: 1 } });
    const sem = aplicarEdicoes(r.conteudo, [{ tipo: "missao.item", missao: "bolo", item: "chapeu", de: 1, para: 0 }]);
    expect(sem.conteudo.missoes.bolo.ao_concluir).toEqual({ coracoes: 1, moedas: 4 });
  });

  it("refuses to change a step's type and turns a changed field into a conflict", () => {
    const r = aplicarEdicoes(conteudo(), [
      { tipo: "passo.campo", missao: "bolo", passo: 0, campo: "tipo", de: "coletar", para: "ir" },
      { tipo: "passo.campo", missao: "bolo", passo: 2, campo: "raio", de: 9, para: 12 },
    ]);
    expect(r.aplicadas).toEqual([]);
    expect(r.conflitos.map((c) => c.motivo)).toEqual(["o tipo de um passo não muda: apague o passo e crie outro", '"raio" do passo 3 de "bolo" mudou no jogo: agora é 5']);
  });

  it("appends new steps after the originals, deletes, and orders what is left (new steps numbered after the originals)", () => {
    const novo: Op = { tipo: "passo.novo", missao: "bolo", n: 0, de: 3, para: { tipo: "falar", texto: "conte para o vovô", npc: "vovo", dialogo: "vovo-bolo" } };
    const r = aplicarEdicoes(conteudo(), [
      novo,
      { tipo: "passo.apagar", missao: "bolo", passo: 2, de: "vá aos dois lugares" },
      { tipo: "passo.ordem", missao: "bolo", de: ["colha 3 maçãs", "leve para a Nina", "vá aos dois lugares"], para: [3, 0, 1] },
      { tipo: "passo.qtd", missao: "bolo", passo: 1, de: 3, para: 4 },
    ]);
    expect(r.conflitos).toEqual([]);
    expect(r.conteudo.missoes.bolo.passos!.map((p) => p.texto)).toEqual(["conte para o vovô", "colha 3 maçãs", "leve para a Nina"]);
    expect(r.conteudo.missoes.bolo.passos![2].qtd).toBe(4);
    // replayed by the file writer in this order: field ops, new, deleted, order
    expect(r.aplicadas.map((o) => o.tipo)).toEqual(["passo.qtd", "passo.novo", "passo.apagar", "passo.ordem"]);
  });

  it("a new step made when the file had another number of steps, or an order that no longer fits, is a conflict", () => {
    const r = aplicarEdicoes(conteudo(), [
      { tipo: "passo.novo", missao: "bolo", n: 0, de: 2, para: { tipo: "ir", texto: "x", lugar: "lago", raio: 5 } },
      { tipo: "passo.apagar", missao: "bolo", passo: 0, de: "outro texto" },
      { tipo: "passo.ordem", missao: "bolo", de: ["colha 3 maçãs", "leve para a Nina", "vá aos dois lugares"], para: [3, 2, 1, 0] },
    ]);
    expect(r.aplicadas).toEqual([]);
    expect(r.conflitos).toHaveLength(3);
    expect(r.conteudo.missoes.bolo.passos!.map((p) => p.texto)).toEqual(["colha 3 maçãs", "leve para a Nina", "vá aos dois lugares"]);
  });

  it("keys, emptiness and Portuguese descriptions of the new ops", () => {
    const novo: Op = { tipo: "passo.novo", missao: "bolo", n: 1, de: 3, para: { tipo: "coletar", texto: "pegue um ovo" } };
    expect(chaveDaOp(novo)).toBe("passo.novo:bolo:1");
    expect(opVazia({ tipo: "missao.item", missao: "bolo", item: "x", de: undefined, para: 0 })).toBe(true);
    expect(opVazia(novo)).toBe(false);
    expect(descreverOp(novo)).toBe("passo novo na missão «bolo»: coletar «pegue um ovo»");
    expect(descreverOp({ tipo: "missao.dificuldade", missao: "bolo", de: "facil", para: "dificil" })).toBe("a missão «bolo» fica difícil (antes: facil)");
    expect(DocumentoEdicoesSchema.safeParse({ versao: 1, jogo: "t", ops: [novo, { tipo: "passo.apagar", missao: "bolo", passo: 0, de: "x" }] }).success).toBe(true);
  });
});

describe("aplicarEdicoes: her own edits never conflict with each other", () => {
  it("a step whose texto she changed can still be deleted or reordered (both check the file as it was)", () => {
    const r = aplicarEdicoes(conteudo(), [
      { tipo: "passo.campo", missao: "bolo", passo: 0, campo: "texto", de: "colha 3 maçãs", para: "colha 5 maçãs" },
      { tipo: "passo.campo", missao: "bolo", passo: 2, campo: "texto", de: "vá aos dois lugares", para: "vá lá" },
      { tipo: "passo.apagar", missao: "bolo", passo: 2, de: "vá aos dois lugares" },
      { tipo: "passo.ordem", missao: "bolo", de: ["colha 3 maçãs", "leve para a Nina", "vá aos dois lugares"], para: [1, 0] },
    ]);
    expect(r.conflitos).toEqual([]);
    expect(r.conteudo.missoes.bolo.passos!.map((p) => p.texto)).toEqual(["leve para a Nina", "colha 5 maçãs"]);
  });
});
