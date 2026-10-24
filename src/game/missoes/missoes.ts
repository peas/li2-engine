import { load } from "js-yaml";
import { z } from "zod";
import type { MissaoEstado } from "../estado/base";
import type { Eventos } from "../eventos";
import type { FimDoDialogo } from "../dialogo/fala";
import { gerarRepetivel, numeroRepetivel, type Repetiveis } from "./repetiveis";
import { MissaoSchema, type MissaoDef, type Passo, type ResumoMissao } from "./schema";

/**
 * The quest interpreter. Quests are YAML (`schema.ts`), progress lives in the game's store (`missoes[id]`), this class
 * only decides what the current step needs and advances it. It knows nothing of three.js or the DOM: the game loop
 * feeds it the player's position, tells it who she talks to and what she picks up (through `pegouItem`), and asks it
 * what to show (HUD line, compass target, conversations to play). Everything else is injected: the places, the NPC
 * positions, where rewards go (`entregarRecompensa`), the game's own step types (`passosExtras`) and, optionally, the
 * repeatable quest templates (`repetiveis`, see `repetiveis.ts`).
 */

/** Every quest file, validated with `schema` (the game's `criarMissaoSchema(extras)`; default the base one). Throws on a bad file. */
export function carregarMissoes<T extends z.ZodType = typeof MissaoSchema>(files: Record<string, string>, schema?: T): z.infer<T>[] {
  const sc = (schema ?? MissaoSchema) as z.ZodType;
  return Object.entries(files).map(([path, raw]) => {
    const r = sc.safeParse(load(raw));
    if (!r.success) throw new Error(`missoes/${path.replace(/^.*\//, "")}: ${z.prettifyError(r.error)}`);
    return r.data as z.infer<T>;
  });
}

export interface Lugar { x: number; z: number }
export type Lugares = Record<string, Lugar>;

/** The places quests can name: every point-like entry of the game's PLACES (lists are skipped) plus `extras`. */
export function lugaresDe(places: Record<string, unknown>, extras: Lugares = {}): Lugares {
  const out: Lugares = {};
  for (const [k, v] of Object.entries(places)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as Lugar).x === "number") out[k] = { x: (v as Lugar).x, z: (v as Lugar).z };
  }
  return { ...out, ...extras };
}

/** Where the compass star points: a place and the step text. */
export interface Alvo extends Lugar { nome: string }

export interface MundoMissoes {
  /** Where an NPC is (for the compass); null if unknown. */
  npc(id: string): Lugar | null;
  /** Did she find `objeto`? Polled every step while an `achar` step waits for it (without it, `achar` never ends). */
  achou?(objeto: string): boolean;
  /** Did the world event `evento` happen (a quest's `oferecer_apos`)? Without it such a quest is never offered. */
  aconteceu?(evento: string): boolean;
}

/** What to play when she talks to an NPC, and what to do once the box closes. */
export interface Conversa {
  /** Dialogue names in order; empty = the NPC has nothing special, play their own line. */
  falas: string[];
  /** Runs after the last line; `fim` is "fim" or "pulado" (Esc). */
  depois?: (fim: FimDoDialogo) => void;
}

export type Status = "nova" | "ativa" | "feita" | "bloqueada";

/** The store actions the interpreter needs (a zustand store of `criarStore` fits, or `getState()` of one). */
export interface StoreMissoes {
  readonly missoes: Record<string, MissaoEstado>;
  readonly inventario: Record<string, number>;
  missao(id: string): MissaoEstado | undefined;
  missaoIniciar(id: string): void;
  missaoAtualizar(id: string, mudanca: Partial<MissaoEstado>): void;
  missaoZerar(id: string): void;
  tirarItem(id: string, qtd?: number): boolean;
}

/** What a step handler can do with its quest. */
export interface CtxPasso {
  /** The quest. */
  def: MissaoDef<any>;
  lugares: Lugares;
  mundo: MundoMissoes;
  store: StoreMissoes;
  eventos: Eventos<any>;
  /** Write counters of the current step (merged); emits missaoAvancou(id, chave) for each key. */
  contar(contadores: Record<string, number>): void;
  /** Queue a dialogue to play when the box is free. */
  fila(dialogo: string): void;
  /** The step is done. `semDialogo`: its `dialogo` already played (it was a conversation), do not queue it. */
  avancar(opcoes?: { semDialogo?: boolean }): void;
  /** The place `k` as a compass target named after the step. */
  lugar(k: string, nome: string): Alvo | null;
  /** The NPC `id` as a compass target. */
  npcAlvo(id: string, nome: string): Alvo | null;
}

/** A step type: what the compass points at, what advances it each frame and what talking does during it. */
export interface PassoHandler<P = any> {
  alvo?(passo: P, estado: MissaoEstado, ctx: CtxPasso): Alvo | null;
  /** Every simulation step while it is current; true = the step is done (advance, queueing its `dialogo`). */
  update?(passo: P, estado: MissaoEstado, ctx: CtxPasso, pos: Lugar, grounded: boolean): boolean;
  /** She talks to `npcId` while this step is current: a conversation, or null when it is not about this step. */
  aoFalar?(passo: P, estado: MissaoEstado, ctx: CtxPasso, npcId: string): Conversa | null;
  /** "2/3" for the HUD; "" when not counted. */
  progresso?(passo: P, estado: MissaoEstado): string;
}

const lugaresDoPasso = (p: { lugar?: unknown }): string[] =>
  typeof p.lugar === "string" ? [p.lugar] : Array.isArray(p.lugar) ? (p.lugar as string[]) : [];

type PassoDe<T extends Passo["tipo"]> = Extract<Passo, { tipo: T }>;

/** The counter that records a found object (`achar`): kept in the quest's state, so it survives a reload. */
const chaveAchado = (objeto: string) => `achar:${objeto}`;

/** The built-in step types. */
const PASSOS_BASE: Record<string, PassoHandler> = {
  ir: {
    alvo(p: PassoDe<"ir">, e, ctx) {
      const k = lugaresDoPasso(p).find((l) => !e.contadores[`ir:${l}`]);
      return k && !p.sem_marco ? ctx.lugar(k, p.texto) : null;
    },
    update(p: PassoDe<"ir">, e, ctx, pos) {
      const keys = lugaresDoPasso(p);
      const feitos = new Set(keys.filter((k) => e.contadores[`ir:${k}`]));
      for (const k of keys) {
        if (feitos.has(k)) continue;
        const l = ctx.lugares[k];
        if (Math.hypot(pos.x - l.x, pos.z - l.z) > p.raio) continue;
        ctx.contar({ [`ir:${k}`]: 1 });
        feitos.add(k);
        const fala = p.dialogos?.[k];
        if (fala) ctx.fila(fala);
      }
      return feitos.size === keys.length;
    },
    progresso(p: PassoDe<"ir">, e) {
      return Array.isArray(p.lugar) ? `${p.lugar.filter((l) => e.contadores[`ir:${l}`]).length}/${p.lugar.length}` : "";
    },
  },
  falar: {
    alvo: (p: PassoDe<"falar">, _e, ctx) => ctx.npcAlvo(p.npc, p.texto),
    aoFalar: (p: PassoDe<"falar">, _e, ctx, npc) => (npc === p.npc ? { falas: [p.dialogo], depois: () => ctx.avancar({ semDialogo: true }) } : null),
  },
  coletar: {
    // counted by `aoPegarItem` (the pegouItem event)
    progresso: (p: PassoDe<"coletar">, e) => `${Math.min(p.qtd, e.contadores[`coletar:${e.passo}`] ?? 0)}/${p.qtd}`,
  },
  levar: {
    alvo: (p: PassoDe<"levar">, _e, ctx) => ctx.npcAlvo(p.npc, p.texto),
    aoFalar(p: PassoDe<"levar">, _e, ctx, npc) {
      if (npc !== p.npc) return null;
      if ((ctx.store.inventario[p.item] ?? 0) < p.qtd) return { falas: [p.dialogo_falta] };
      return {
        falas: [p.dialogo],
        depois: () => {
          if (!ctx.store.tirarItem(p.item, p.qtd)) return;
          ctx.eventos.emit("entregou", npc, p.item, p.qtd);
          ctx.avancar({ semDialogo: true });
        },
      };
    },
  },
  achar: {
    alvo: (p: PassoDe<"achar">, _e, ctx) => ctx.lugar(p.lugar, p.texto),
    update(p: PassoDe<"achar">, _e, ctx) {
      if (!ctx.mundo.achou?.(p.objeto)) return false;
      // written straight to the store (no missaoAvancou: the step ends in this same frame)
      ctx.store.missaoAtualizar(ctx.def.id, { contadores: { [chaveAchado(p.objeto)]: 1 } });
      ctx.eventos.emit("achou", p.objeto);
      return true;
    },
  },
};

export interface OpcoesMissoes {
  defs: MissaoDef<any>[];
  lugares: Lugares;
  /** The game's store: an object with the actions, or a zustand store (read through `getState()` every time). */
  store: StoreMissoes | { getState(): StoreMissoes };
  eventos: Eventos<any>;
  mundo: MundoMissoes;
  /** The quest ended: hand out `ao_concluir` (opaque to the engine). Called before the quest is marked done (and saved). */
  entregarRecompensa?: (r: Record<string, unknown>, def: MissaoDef<any>) => void;
  /** The game's step types (their YAML shape goes in `criarMissaoSchema(extras)`). */
  passosExtras?: Record<string, PassoHandler>;
  /**
   * Repeatable quest templates (`carregarRepetiveis`): their giver (`quem`) never runs out. With nothing written left
   * to offer and no quest running she offers the next `rep-<n>`; while another quest runs she says `dialogo_espera`.
   * Generated quests follow the save (registered on construct and on `carregou`, forgotten on a reset).
   */
  repetiveis?: Repetiveis;
}

export class Missoes {
  readonly defs: MissaoDef<any>[] = [];
  private byId = new Map<string, MissaoDef<any>>();
  private passos: Record<string, PassoHandler>;
  /** Dialogues earned by arriving/completing, played when the box is free (`proximoDialogo`). */
  private fila: string[] = [];
  /** The repeatable quest offered next (generated, registered only when it starts). */
  private proximaRep: MissaoDef<any> | null = null;

  constructor(private readonly o: OpcoesMissoes) {
    this.passos = { ...PASSOS_BASE, ...(o.passosExtras ?? {}) };
    for (const d of o.defs) this.registrar(d);
    for (const k of Object.keys(o.repetiveis?.lugares ?? {})) if (!(k in o.lugares)) throw new Error(`repetiveis.yaml: lugar "${k}" não existe`);
    this.sincronizarRepetiveis();
  }

  private get st(): StoreMissoes {
    const s = this.o.store;
    return "getState" in s && typeof s.getState === "function" ? s.getState() : (s as StoreMissoes);
  }

  /** Listen to `pegouItem` (counts `coletar` steps) and, with repeatables, to `carregou`. Returns the unsubscribe. */
  ligar() {
    const offs = [this.o.eventos.on("pegouItem", (item: string, qtd: number) => this.aoPegarItem(item, qtd))];
    if (this.o.repetiveis) offs.push(this.o.eventos.on("carregou", () => this.sincronizarRepetiveis()));
    return () => { for (const off of offs) off(); };
  }

  private registrar(d: MissaoDef<any>) {
    if (this.byId.has(d.id)) throw new Error(`missão repetida: ${d.id}`);
    d.passos.forEach((p: Passo, i: number) => {
      if (!this.passos[p.tipo]) throw new Error(`missoes/${d.id}.yaml, passo ${i + 1}: tipo "${p.tipo}" não registrado`);
      for (const k of lugaresDoPasso(p as { lugar?: unknown })) if (!(k in this.o.lugares)) throw new Error(`missoes/${d.id}.yaml, passo ${i + 1}: lugar "${k}" não existe`);
      if (p.tipo === "achar" && !this.o.mundo.achou) console.warn(`missoes/${d.id}.yaml, passo ${i + 1}: achar sem mundo.achou (nunca conclui)`);
    });
    if (d.oferecer_apos && !this.o.mundo.aconteceu) console.warn(`missoes/${d.id}.yaml: oferecer_apos sem mundo.aconteceu (nunca é oferecida)`);
    this.byId.set(d.id, d);
    this.defs.push(d);
  }

  private esquecer(id: string) {
    this.byId.delete(id);
    const i = this.defs.findIndex((d) => d.id === id);
    if (i >= 0) this.defs.splice(i, 1);
  }

  /** Is `id` a known quest now (a repeatable one is forgotten on a reset)? */
  existe(id: string) {
    return this.byId.has(id);
  }

  /** Repeatable quests follow the save: register every "rep-<n>" it has, forget the ones it has not (a load, a reset). */
  sincronizarRepetiveis() {
    const cfg = this.o.repetiveis;
    if (!cfg) return;
    const salvas = this.st.missoes;
    for (const d of this.repetiveis()) if (!salvas[d.id]) this.esquecer(d.id);
    for (const id of Object.keys(salvas)) {
      const n = numeroRepetivel(id);
      if (n !== null && !this.byId.has(id)) this.registrar(gerarRepetivel(n, cfg));
    }
    this.proximaRep = null;
  }

  /** Registered repeatable quests, in the order of n. */
  repetiveis(): MissaoDef<any>[] {
    return this.defs.filter((d) => d.repetivel).sort((a, b) => numeroRepetivel(a.id)! - numeroRepetivel(b.id)!);
  }

  /** The next repeatable quest (n = largest registered + 1), the same object until it starts or a save loads. */
  private proximaRepetivel(cfg: Repetiveis): MissaoDef<any> {
    const n = Math.max(0, ...this.repetiveis().map((d) => numeroRepetivel(d.id)!)) + 1;
    if (this.proximaRep?.id !== `rep-${n}`) this.proximaRep = gerarRepetivel(n, cfg);
    return this.proximaRep;
  }

  // ---- queries ----

  def(id: string): MissaoDef<any> {
    const d = this.byId.get(id);
    if (!d) throw new Error(`missão "${id}" não existe (há: ${[...this.byId.keys()].join(", ")})`);
    return d;
  }

  estado(id: string): MissaoEstado | undefined {
    return this.st.missao(id);
  }

  status(id: string): Status {
    const e = this.estado(id);
    if (e) return e.concluida ? "feita" : "ativa";
    const d = this.def(id), req = d.requer ?? [];
    const apos = !d.oferecer_apos || !!this.o.mundo.aconteceu?.(d.oferecer_apos);
    return apos && req.every((r) => this.estado(r)?.concluida) ? "nova" : "bloqueada";
  }

  passoAtivo(id: string): Passo | null {
    const e = this.estado(id);
    if (!e || e.concluida) return null;
    return this.def(id).passos[e.passo] ?? null;
  }

  /** Active quests, in the order they were started. */
  ativas(): MissaoDef<any>[] {
    return Object.keys(this.st.missoes).filter((id) => this.byId.has(id) && this.status(id) === "ativa").map((id) => this.def(id));
  }

  /** The quest the HUD and the compass follow: the most recently started active one. */
  ativa(): MissaoDef<any> | null {
    return this.ativas().at(-1) ?? null;
  }

  /** "2/3" for counted steps, "" otherwise. */
  progresso(id: string, i: number): string {
    const e = this.estado(id);
    const p = this.def(id).passos[i];
    if (!e || !p) return "";
    return this.passos[p.tipo]?.progresso?.(p, e) ?? "";
  }

  resumo(id: string): ResumoMissao {
    const d = this.def(id);
    const e = this.estado(id);
    const status = this.status(id);
    const passo = e ? (e.concluida ? d.passos.length : e.passo) : 0;
    return {
      id, titulo: d.titulo, descricao: d.descricao, quem: d.quem,
      status: status === "bloqueada" ? "nova" : status, passo, ...(d.repetivel ? { repetivel: true } : {}),
      passos: d.passos.map((p: Passo, i: number) => ({ texto: p.texto, feito: i < passo, progresso: i === passo ? this.progresso(id, i) : "" })),
    };
  }

  /**
   * Every quest she can see: active, new (prerequisites met) and done. Blocked ones stay hidden. Of the repeatable
   * quests only the running one and the last one done show (the list would grow forever).
   */
  resumos(): ResumoMissao[] {
    const ultimaFeita = this.repetiveis().filter((d) => this.status(d.id) === "feita").at(-1);
    const visivel = (d: MissaoDef<any>) => (d.repetivel ? d === ultimaFeita || this.status(d.id) === "ativa" : this.status(d.id) !== "bloqueada");
    return this.defs.filter(visivel).map((d) => this.resumo(d.id));
  }

  /** Did she find `objeto` in any quest's `achar` step (the counter `achar:<objeto>` in the save)? */
  achou(objeto: string): boolean {
    return Object.values(this.st.missoes).some((e) => !!e.contadores[chaveAchado(objeto)]);
  }

  /** Where the compass star points for the followed quest (null: nothing to point at, e.g. a hidden object). */
  alvo(): Alvo | null {
    const d = this.ativa();
    if (!d) return null;
    const p = this.passoAtivo(d.id);
    if (!p) return null;
    return this.passos[p.tipo]?.alvo?.(p, this.estado(d.id)!, this.ctx(d)) ?? null;
  }

  /** Is some active step collecting `item`? (a hidden quest object appears only then) */
  coletando(item: string): boolean {
    return this.ativas().some((d) => { const p = this.passoAtivo(d.id); return p?.tipo === "coletar" && p.item === item; });
  }

  /** Next earned dialogue to play (the loop calls this when the box is free). */
  proximoDialogo(): string | null {
    return this.fila.shift() ?? null;
  }

  // ---- world hooks ----

  /** Call every simulation step with the player's position and whether she is on the ground. */
  update(pos: Lugar, grounded: boolean) {
    for (const d of this.ativas()) {
      const p = this.passoAtivo(d.id);
      const h = p && this.passos[p.tipo];
      if (!p || !h?.update) continue;
      if (h.update(p, this.estado(d.id)!, this.ctx(d), pos, grounded)) this.avancar(d.id);
    }
  }

  /** She picked `qtd` of `item` (wired by `ligar()`): counts toward an active coletar step. */
  aoPegarItem(item: string, qtd: number) {
    for (const d of this.ativas()) {
      const p = this.passoAtivo(d.id);
      if (p?.tipo !== "coletar" || p.item !== item) continue;
      const e = this.estado(d.id)!;
      const key = `coletar:${e.passo}`;
      const n = (e.contadores[key] ?? 0) + qtd;
      this.ctx(d).contar({ [key]: n });
      if (n >= p.qtd) this.avancar(d.id);
    }
  }

  /**
   * She talks to `npcId`. Priority: a step waiting for this NPC, then the running quest they gave (andamento), then a
   * quest to offer (oferta; it starts when the box closes normally, not on Esc), then the done line. Empty `falas` =
   * nothing special: the NPC's own dialogue plays. The giver of the repeatables never runs out: with nothing to offer
   * (another quest is running) she says `dialogo_espera`.
   */
  aoFalar(npcId: string): Conversa {
    for (const d of this.ativas()) {
      const p = this.passoAtivo(d.id);
      const h = p && this.passos[p.tipo];
      const c = h?.aoFalar?.(p, this.estado(d.id)!, this.ctx(d), npcId);
      if (c) return c;
    }
    const minhas = this.defs.filter((d) => d.quem === npcId);
    const andamento = minhas.find((d) => this.status(d.id) === "ativa");
    if (andamento) return { falas: [andamento.dialogo_andamento] };
    const nova = this.novaDe(npcId);
    if (nova) return { falas: [nova.dialogo_oferta], depois: (fim) => { if (fim === "fim") this.iniciar(nova.id); } };
    if (this.o.repetiveis && npcId === this.o.repetiveis.quem) return { falas: [this.o.repetiveis.dialogo_espera] };
    const feita = minhas.filter((d) => this.status(d.id) === "feita").at(-1);
    if (feita) return { falas: [feita.dialogo_feito] };
    return { falas: [] };
  }

  /** The quest this NPC would offer right now (the game may play their own greeting before it), or null. */
  ofertaPara(npcId: string): MissaoDef<any> | null {
    for (const d of this.ativas()) {
      const p = this.passoAtivo(d.id);
      if (p && "npc" in p && p.npc === npcId) return null;
    }
    if (this.defs.some((d) => d.quem === npcId && this.status(d.id) === "ativa")) return null;
    return this.novaDe(npcId);
  }

  /**
   * The quest `npcId` would offer: their first written one that is new; for the giver of the repeatables, when they
   * have none and no quest at all is running, the next repeatable quest.
   */
  private novaDe(npcId: string): MissaoDef<any> | null {
    const escrita = this.defs.find((d) => d.quem === npcId && !d.repetivel && this.status(d.id) === "nova");
    if (escrita) return escrita;
    const cfg = this.o.repetiveis;
    if (cfg && npcId === cfg.quem && this.ativas().length === 0) return this.proximaRepetivel(cfg);
    return null;
  }

  iniciar(id: string) {
    const n = numeroRepetivel(id), cfg = this.o.repetiveis;
    if (cfg && n !== null && !this.byId.has(id)) { this.registrar(this.proximaRep?.id === id ? this.proximaRep : gerarRepetivel(n, cfg)); this.proximaRep = null; }
    this.def(id);
    this.st.missaoIniciar(id);
    this.o.eventos.emit("missaoPasso", id, 0);
  }

  zerar(id: string) {
    this.fila = [];
    this.st.missaoZerar(id);
    if (this.byId.get(id)?.repetivel) this.esquecer(id);
  }

  /** Current step done: queue its dialogue, go to the next one or finish (reward handed out, then marked done). */
  private avancar(id: string, semDialogo = false) {
    const d = this.def(id);
    const e = this.estado(id);
    if (!e || e.concluida) return;
    const p = d.passos[e.passo];
    if (p?.dialogo && !semDialogo) this.fila.push(p.dialogo);
    const passo = e.passo + 1;
    if (passo < d.passos.length) {
      this.st.missaoAtualizar(id, { passo });
      this.o.eventos.emit("missaoPasso", id, passo);
      return;
    }
    if (d.ao_concluir) this.o.entregarRecompensa?.(d.ao_concluir, d);
    this.st.missaoAtualizar(id, { passo, concluida: true });
  }

  private ctx(d: MissaoDef<any>): CtxPasso {
    return {
      def: d,
      lugares: this.o.lugares,
      mundo: this.o.mundo,
      store: this.st,
      eventos: this.o.eventos,
      contar: (contadores) => {
        this.st.missaoAtualizar(d.id, { contadores });
        for (const k of Object.keys(contadores)) this.o.eventos.emit("missaoAvancou", d.id, k.replace(/^ir:/, ""));
      },
      fila: (dialogo) => { this.fila.push(dialogo); },
      avancar: (opcoes) => this.avancar(d.id, opcoes?.semDialogo),
      lugar: (k, nome) => (this.o.lugares[k] ? { ...this.o.lugares[k], nome } : null),
      npcAlvo: (id, nome) => {
        const l = this.o.mundo.npc(id);
        return l ? { x: l.x, z: l.z, nome } : null;
      },
    };
  }
}
