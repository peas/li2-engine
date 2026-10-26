/**
 * The editing state of the page: the original content (what the repo has), her ops (engine `game/edicoes`), undo/redo
 * as snapshots of the op list, and the derived views the page draws (the edited content, its graph, which nodes and
 * edges are edited, the conflicts). Pure except for the storage calls (`armazem.ts`); the DOM is main.ts/painel.ts.
 *
 * Every op's `de` is the ORIGINAL value (the repo's), never the previous edit: one op per target, so "back to the
 * original" is just dropping the op. Step indices in ops count the original order; the page shows the edited order, so
 * the helpers here take the displayed index and translate it.
 */
import {
  aplicarEdicoes, alvoDaOp, chaveDaOp, DocumentoEdicoesSchema, juntarOp, VERSAO_EDICOES,
  type Conflito, type ConteudoEditavel, type DocumentoEdicoes, type Op,
} from "../../../src/game/edicoes/edicoes.ts";
import { montarGrafo } from "../carregador/grafo.ts";
import type { Conteudo, Dialogo, Grafo, Missao } from "../carregador/tipos.ts";
import { apagarDocumento, gravarDocumento, lerDocumento } from "./armazem.ts";

/** Sensible limits for a child's edits (the panel shows them). */
export const LIMITES = {
  coracoes: { min: 0, max: 5 },
  moedas: { min: 0, max: 100 },
  qtd: { min: 1, max: 20 },
  /** The game's dialogue box: 2 lines × 38 visible letters (the game's dialogos.test enforces it). */
  fala: { linhas: 2, letras: 38 },
  titulo: 40,
  descricao: 160,
};

/** The visible letters of a line, without the `*cor*` / `_cor_` markers (engine `dialogo/texto.ts` rule, simplified). */
export function textoVisivel(texto: string): string {
  return texto.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1");
}
/** Does a line fit the game's box? `linhas` = the visible length of each line. */
export function medirFala(texto: string): { linhas: number[]; cabe: boolean } {
  const linhas = textoVisivel(texto).split("\n").map((l) => [...l].length);
  return { linhas, cabe: linhas.length <= LIMITES.fala.linhas && linhas.every((n) => n <= LIMITES.fala.letras) };
}

const MAX_HISTORICO = 200;

export class Editor {
  ops: Op[] = [];
  autor = "";
  private historico: Op[][] = [];
  private futuro: Op[][] = [];
  /** Derived from `ops` (recomputed by `recalcular`). */
  conteudo: Conteudo;
  grafo: Grafo;
  conflitos: Conflito[] = [];
  /** Node ids (`missao:x`, `dialogo:y`) with at least one applied op. */
  editados = new Set<string>();
  /** Edge ids of the current graph that come from an edited field. */
  arestasEditadas = new Set<string>();
  /** Fires after every change (main.ts redraws). */
  aoMudar: () => void = () => {};

  constructor(readonly original: Conteudo) {
    const doc = lerDocumento(original.jogo.nome);
    if (doc) { this.ops = doc.ops; this.autor = doc.autor; }
    this.conteudo = original;
    this.grafo = montarGrafo(original);
    this.recalcular();
  }

  get jogo() { return this.original.jogo.nome; }
  get podeDesfazer() { return this.historico.length > 0; }
  get podeRefazer() { return this.futuro.length > 0; }

  // ---- derived views ----

  private editavel(c: Conteudo): ConteudoEditavel {
    return {
      missoes: Object.fromEntries(c.missoes.map((m) => [m.id, m as unknown as Record<string, unknown>])),
      dialogos: Object.fromEntries(c.dialogos.map((d) => [d.id, d as unknown as Record<string, unknown>])),
    };
  }

  recalcular() {
    const r = aplicarEdicoes(this.editavel(this.original), this.ops);
    this.conflitos = r.conflitos;
    this.conteudo = {
      ...this.original,
      missoes: this.original.missoes.map((m) => r.conteudo.missoes[m.id] as unknown as Missao),
      dialogos: this.original.dialogos.map((d) => r.conteudo.dialogos[d.id] as unknown as Dialogo),
    };
    this.grafo = montarGrafo(this.conteudo);
    this.editados = new Set(r.aplicadas.map(alvoDaOp));
    const chaves = new Set(r.aplicadas.map(chaveDaOp));
    this.arestasEditadas = new Set(this.grafo.arestas.filter((a) => {
      if (a.tipo === "da" && a.missao) return chaves.has(`missao.quem:${a.missao}`);
      if (a.missao !== undefined && a.passo !== undefined && a.campo) return chaves.has(`passo.alvo:${a.missao}:${this.indiceOriginal(a.missao, a.passo)}:${a.campo}`);
      return false;
    }).map((a) => a.id));
  }

  /** The op on `chave`, if any (its `de` is the original value). */
  opDe(chave: string): Op | undefined { return this.ops.find((o) => chaveDaOp(o) === chave); }
  opsDoNo(noId: string): Op[] { return this.ops.filter((o) => alvoDaOp(o) === noId); }
  conflitosDoNo(noId: string): Conflito[] { return this.conflitos.filter((c) => alvoDaOp(c.op) === noId); }
  missaoOriginal(id: string): Missao | undefined { return this.original.missoes.find((m) => m.id === id); }

  /** The steps a quest has now, in the engine's numbering: originals not deleted, then new ones (`originais + n`). */
  private numeracao(missao: string, ops = this.ops): number[] {
    const n = this.missaoOriginal(missao)?.passos.length ?? 0;
    const fora = new Set(ops.filter((o) => o.tipo === "passo.apagar" && o.missao === missao).map((o) => (o as { passo: number }).passo));
    const novos = ops.filter((o): o is Op & { tipo: "passo.novo" } => o.tipo === "passo.novo" && o.missao === missao).map((o) => n + o.n).sort((a, b) => a - b);
    return [...Array.from({ length: n }, (_, i) => i).filter((i) => !fora.has(i)), ...novos];
  }
  /** The current displayed order of a quest's steps, in the engine's numbering (`numeracao` without a `passo.ordem` op). */
  ordemDe(missao: string, ops = this.ops): number[] {
    const base = this.numeracao(missao, ops);
    const op = ops.find((o) => o.tipo === "passo.ordem" && o.missao === missao) as (Op & { tipo: "passo.ordem" }) | undefined;
    const igual = op && op.para.length === base.length && [...op.para].sort((a, b) => a - b).every((v, k) => v === [...base].sort((a, b) => a - b)[k]);
    return igual ? op.para : base;
  }
  /** The `passo.novo` op of a step shown at `exibido`, when it is a new one. */
  private novoEm(missao: string, exibido: number): (Op & { tipo: "passo.novo" }) | undefined {
    const n = this.missaoOriginal(missao)?.passos.length ?? 0;
    const num = this.indiceOriginal(missao, exibido);
    return num >= n ? (this.ops.find((o) => o.tipo === "passo.novo" && o.missao === missao && o.n === num - n) as Op & { tipo: "passo.novo" }) : undefined;
  }
  /** `ops` with the quest's order op rebuilt for `ordem` (dropped when it is the natural order). */
  private comOrdem(ops: Op[], missao: string, ordem: number[]): Op[] {
    const m = this.missaoOriginal(missao)!;
    const sem = ops.filter((o) => !(o.tipo === "passo.ordem" && o.missao === missao));
    const natural = this.numeracao(missao, sem);
    if (ordem.length === natural.length && ordem.every((v, k) => v === natural[k])) return sem;
    return [...sem, { tipo: "passo.ordem", missao, de: m.passos.map((p) => p.texto), para: ordem, ...this.carimbo() }];
  }
  /** Displayed step position → original index. */
  indiceOriginal(missao: string, exibido: number): number { return this.ordemDe(missao)[exibido] ?? exibido; }

  // ---- changes (each one is a history step) ----

  private carimbo() { return { quando: new Date().toISOString(), autor: this.autor || undefined }; }

  private trocar(ops: Op[]) {
    this.historico.push(this.ops);
    if (this.historico.length > MAX_HISTORICO) this.historico.shift();
    this.futuro = [];
    this.ops = ops;
    this.salvar();
  }

  private salvar() {
    gravarDocumento(this.documento());
    this.recalcular();
    this.aoMudar();
  }

  aplicar(op: Op) { this.trocar(juntarOp(this.ops, { ...op, ...this.carimbo() } as Op)); }

  /** `de` for a new op on `chave`: the original value kept by an earlier op, else the current (= original) value. */
  private de<T>(chave: string, atual: T): T {
    const op = this.opDe(chave);
    return op ? (op as unknown as { de: T }).de : atual;
  }

  mudarQuem(missao: string, para: string) {
    const m = this.missaoOriginal(missao);
    if (m) this.aplicar({ tipo: "missao.quem", missao, de: m.quem, para });
  }
  mudarTexto(missao: string, campo: "titulo" | "descricao", para: string) {
    const m = this.missaoOriginal(missao);
    if (m && para.trim()) this.aplicar({ tipo: "missao.texto", missao, campo, de: m[campo], para: para.trim() });
  }
  mudarRecompensa(missao: string, campo: "coracoes" | "moedas", para: number) {
    const m = this.missaoOriginal(missao);
    const lim = LIMITES[campo];
    if (!m || !Number.isFinite(para)) return;
    const v = Math.max(lim.min, Math.min(lim.max, Math.round(para)));
    const de = typeof m.ao_concluir?.[campo] === "number" ? (m.ao_concluir[campo] as number) : undefined;
    this.aplicar({ tipo: "missao.recompensa", missao, campo, de, para: v });
  }
  /** Re-targets a step field; `exibido` is the step's position on screen, `atual` the value shown now. */
  mudarAlvo(missao: string, exibido: number, campo: string, atual: string, para: string) {
    if (this.novoEm(missao, exibido)) return this.mudarCampoPasso(missao, exibido, campo, para);
    const passo = this.indiceOriginal(missao, exibido);
    const original = this.missaoOriginal(missao)?.passos[passo];
    if (!original) return;
    const chave = `passo.alvo:${missao}:${passo}:${campo}`;
    const v = original[campo];
    const de = this.de(chave, Array.isArray(v) ? (v.includes(atual) ? atual : String(v[0])) : String(v ?? atual));
    this.aplicar({ tipo: "passo.alvo", missao, passo, campo, de, para });
  }
  mudarQtd(missao: string, exibido: number, para: number) {
    if (this.novoEm(missao, exibido)) return this.mudarCampoPasso(missao, exibido, "qtd", Math.max(LIMITES.qtd.min, Math.min(LIMITES.qtd.max, Math.round(para))));
    const passo = this.indiceOriginal(missao, exibido);
    const original = this.missaoOriginal(missao)?.passos[passo];
    if (!original || typeof original.qtd !== "number" || !Number.isFinite(para)) return;
    this.aplicar({ tipo: "passo.qtd", missao, passo, de: original.qtd, para: Math.max(LIMITES.qtd.min, Math.min(LIMITES.qtd.max, Math.round(para))) });
  }
  /** Moves the step shown at `exibido` by `delta` (-1 up, +1 down). */
  moverPasso(missao: string, exibido: number, delta: number) {
    if (!this.missaoOriginal(missao)) return;
    const ordem = [...this.ordemDe(missao)];
    const j = exibido + delta;
    if (j < 0 || j >= ordem.length) return;
    [ordem[exibido], ordem[j]] = [ordem[j], ordem[exibido]];
    this.trocar(this.comOrdem(this.ops, missao, ordem));
  }
  /** Any simple field of the step shown at `exibido` (`texto`, `raio`, `dialogo`, a single `lugar`...). */
  mudarCampoPasso(missao: string, exibido: number, campo: string, para: string | number | boolean) {
    if (campo === "tipo") return;
    const novo = this.novoEm(missao, exibido);
    if (novo) { this.aplicar({ ...novo, para: { ...novo.para, [campo]: para } }); return; }
    const passo = this.indiceOriginal(missao, exibido);
    const original = this.missaoOriginal(missao)?.passos[passo] as Record<string, unknown> | undefined;
    if (!original) return;
    const atual = original[campo] as string | number | boolean | undefined;
    this.aplicar({ tipo: "passo.campo", missao, passo, campo, de: this.de(`passo.campo:${missao}:${passo}:${campo}`, atual), para });
  }
  /** A step field that names a person, item, place or dialogue (the ficha's choices): re-targets when the file had it, sets it otherwise. */
  mudarReferencia(missao: string, exibido: number, campo: string, para: string) {
    if (this.novoEm(missao, exibido)) return this.mudarCampoPasso(missao, exibido, campo, para);
    if (!para) return; // the ficha does not take a field out (yet)
    const original = this.missaoOriginal(missao)?.passos[this.indiceOriginal(missao, exibido)] as Record<string, unknown> | undefined;
    const atual = original?.[campo];
    if (typeof atual === "string" && ["npc", "item", "lugar"].includes(campo)) this.mudarAlvo(missao, exibido, campo, atual, para);
    else this.mudarCampoPasso(missao, exibido, campo, para);
  }
  mudarDificuldade(missao: string, para: "facil" | "media" | "dificil") {
    const m = this.missaoOriginal(missao);
    if (m) this.aplicar({ tipo: "missao.dificuldade", missao, de: (m as { dificuldade?: string }).dificuldade, para });
  }
  /** An item of the reward: `qtd` 0 takes it out. */
  mudarItemPremio(missao: string, item: string, qtd: number) {
    const m = this.missaoOriginal(missao);
    if (!m || !Number.isFinite(qtd)) return;
    const itens = (m.ao_concluir?.itens ?? {}) as Record<string, unknown>;
    const de = typeof itens[item] === "number" ? (itens[item] as number) : undefined;
    this.aplicar({ tipo: "missao.item", missao, item, de, para: Math.max(0, Math.min(20, Math.round(qtd))) });
  }
  /** A new step of type `tipo` at the end (`campos` are its starting values); one history step with the order. */
  novoPasso(missao: string, campos: Record<string, string | number | boolean>) {
    const m = this.missaoOriginal(missao);
    if (!m) return;
    const usados = this.ops.filter((o) => o.tipo === "passo.novo" && o.missao === missao).map((o) => (o as { n: number }).n);
    const n = usados.length ? Math.max(...usados) + 1 : 0;
    const ordem = [...this.ordemDe(missao), m.passos.length + n];
    const ops = [...this.ops, { tipo: "passo.novo", missao, n, de: m.passos.length, para: campos, ...this.carimbo() } as Op];
    this.trocar(this.comOrdem(ops, missao, ordem));
  }
  /** Takes out the step shown at `exibido` (a new one just disappears; an original becomes a `passo.apagar`). */
  apagarPasso(missao: string, exibido: number) {
    const m = this.missaoOriginal(missao);
    if (!m) return;
    const num = this.indiceOriginal(missao, exibido);
    const ordem = this.ordemDe(missao).filter((v) => v !== num);
    const novo = this.novoEm(missao, exibido);
    const doPasso = (o: Op) => "passo" in o && o.missao === missao && (o as { passo: number }).passo === num;
    const ops = novo
      ? this.ops.filter((o) => o !== novo)
      : [...this.ops.filter((o) => !doPasso(o)), { tipo: "passo.apagar", missao, passo: num, de: m.passos[num].texto, ...this.carimbo() } as Op];
    this.trocar(this.comOrdem(ops, missao, ordem));
  }
  mudarFala(dialogo: string, indice: number, para: string) {
    const d = this.original.dialogos.find((x) => x.id === dialogo);
    const f = d?.falas[indice];
    if (!f || !para.trim()) return;
    this.aplicar({ tipo: "fala.texto", dialogo, indice, de: f.texto, para: para.trim() });
  }

  /** Drops every op of one node ("Voltar ao original" in the panel). */
  voltar(noId: string) { this.trocar(this.ops.filter((o) => alvoDaOp(o) !== noId)); }
  voltarTudo() { if (this.ops.length) this.trocar([]); }
  desfazer() { const a = this.historico.pop(); if (!a) return; this.futuro.push(this.ops); this.ops = a; this.salvar(); }
  refazer() { const a = this.futuro.pop(); if (!a) return; this.historico.push(this.ops); this.ops = a; this.salvar(); }
  /** After "Salvar no jogo": only `ops` stay (the ones the files did not take), history forgotten (the files changed under it). */
  manter(ops: Op[]) { this.ops = ops; this.historico = []; this.futuro = []; this.salvar(); }
  /** Forgets everything, history included, and clears the storage ("Apagar tudo", after the double confirmation). */
  apagarTudo() { this.ops = []; this.historico = []; this.futuro = []; apagarDocumento(this.jogo); this.recalcular(); this.aoMudar(); }

  mudarAutor(nome: string) { this.autor = nome.trim(); gravarDocumento(this.documento()); this.aoMudar(); }

  // ---- in and out ----

  documento(exportado = false): DocumentoEdicoes {
    return { versao: VERSAO_EDICOES, jogo: this.jogo, autor: this.autor, ...(exportado && { exportado: new Date().toISOString() }), ops: this.ops };
  }
  /** The JSON she sends ("Mandar para o papai"). */
  exportar(): { nome: string; json: string } {
    return { nome: `edicoes-${this.jogo}-${new Date().toLocaleDateString("sv")}.json`, json: JSON.stringify(this.documento(true), null, 1) };
  }
  /** Reads a JSON back ("Trazer de volta"): replaces the ops (undoable). Returns the problem in Portuguese, or null. */
  importar(texto: string): string | null {
    let doc: unknown;
    try { doc = JSON.parse(texto); } catch { return "esse arquivo não é um JSON"; }
    const r = DocumentoEdicoesSchema.safeParse(doc);
    if (!r.success) return "esse arquivo não é um arquivo de mudanças deste MDM";
    if (r.data.jogo !== this.jogo) return `esse arquivo é do jogo "${r.data.jogo}", e este MDM é de "${this.jogo}"`;
    if (r.data.autor && !this.autor) this.autor = r.data.autor;
    this.trocar(r.data.ops);
    return null;
  }
}
