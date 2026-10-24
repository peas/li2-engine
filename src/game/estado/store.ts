import type { z } from "zod";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Eventos } from "../eventos";
import { MINUTOS_POR_DIA } from "../tempo";
import type { MissaoEstado, SaveBase } from "./base";
import { juntarAcoes, montarFatias, type CtxFatia, type Fatia } from "./fatias";
import { FATIAS_BASE } from "./fatiasBase";

/**
 * The game store as a FACTORY (zustand/vanilla; one store per game, never a module singleton): the save is the state
 * itself, validated by the game's zod schema when loaded, written at safe moments (`salvar(motivo)`: slept, quest
 * done, menu closed), never every frame. The engine gives the base actions every game needs (inventory, hints,
 * cutscenes seen, news, quests, day and sleep: the slices `FATIAS_BASE`, fatiasBase.ts). Two ways to add the game's
 * own: slices (`{ chave, versao, fatias: [...FATIAS_BASE, ...mine] }`, fatias.ts: fields, initial values, actions and
 * `sanear` together; a name in two slices is an error), or the older `{ chave, inicial, schema, acoes, sanear }`
 * (the game's `acoes` are spread AFTER the base ones, so one with the same name replaces it: do it only on purpose).
 *
 * State says how things are; events say what just happened (`pegouItem`, `dormiu`, `missaoConcluida`...): the HUD
 * subscribes to the store, sound and toasts to the events.
 */
export interface AcoesBase<S extends SaveBase> {
  /** Add `qtd` of `id` to the inventory (emits pegouItem). */
  pegarItem(id: string, qtd?: number): void;
  /** Take `qtd` of `id` out; false (and nothing changes) when short. Silent: the caller says why it left. */
  tirarItem(id: string, qtd?: number): boolean;
  /** Take `qtd` of `id` out by use (eaten, cooked, handed over): emits usouItem. False when short. */
  usarItem(id: string, qtd?: number): boolean;
  /** True the first time `id` is asked (and remembers it in the save), false after: first-time hints. */
  dicaNova(id: string): boolean;
  /** Was the cutscene `id` watched already? (the second time a tap skips it) */
  cenaVista(id: string): boolean;
  /** Mark the cutscene `id` as watched. */
  verCena(id: string): void;
  /** The news up to `versao` were told: saves (nothing pending until a newer entry). */
  verNovidades(versao: number): void;
  /** Quest progress (undefined = never started). The interpreter (`Missoes`) drives these. */
  missao(id: string): MissaoEstado | undefined;
  /** Start a quest (no-op when started): emits missaoIniciada. */
  missaoIniciar(id: string): void;
  /** Merge a change (counters merge too); becoming `concluida` emits missaoConcluida and saves. */
  missaoAtualizar(id: string, mudanca: Partial<MissaoEstado>): void;
  /** Forget a quest (tests, the adults' panel). */
  missaoZerar(id: string): void;
  /** Seconds of play: counts toward the day (the game calls it once per simulation step). */
  tick(dt: number): void;
  /**
   * Sleep: the day turns only when `minutosPorDia` were played since it began. Emits dormiu and saves; returns whether
   * the day turned and, if not, the seconds still missing.
   */
  dormir(): { novoDia: boolean; faltam: number };
  /**
   * Back after being away: whole calendar days since the last save advance the day (the minutes of today reset).
   * Returns how many; 0 on the same day or the first time. `carregar()` calls it once; emits voltou.
   */
  voltar(agora?: number): number;
  /** Replace the whole save (import, load): emits carregou. */
  carregarSave(save: S): void;
  /** Back to the initial state: emits carregou. */
  zerar(): void;
}

export type Estado<S extends SaveBase> = S & AcoesBase<S>;

type Api<S extends SaveBase, A extends object> = StoreApi<Estado<S> & A>;

export interface ConfigStore<S extends SaveBase, A extends object> {
  /** localStorage key of the save ("tresilhas.save"); the corrupt copy goes to `<chave>.corrompido`. */
  chave: string;
  /** The fresh save (spread `SAVE_BASE_INICIAL`; `ultimaNovidadeVista` = the current news version). */
  inicial: S;
  /** The game's save schema (`SaveBaseSchema.extend({...})`); it decides which fields are saved. */
  schema: z.ZodType<S>;
  /** Old save shapes → current, BEFORE the schema (bump `versao` and add a step when a field changes shape). */
  migrar?: (raw: Record<string, unknown>) => Record<string, unknown>;
  /** AFTER the schema: drop ids that left the catalogues, fix references (a save never breaks the game). */
  sanear?: (save: S) => S;
  /**
   * The game's own actions. `set`/`get` see the whole state (base actions included). TypeScript cannot infer `A` from
   * an initializer that calls `get()`: declare it (`criarStore<Save, AcoesDoJogo>(...)`).
   */
  acoes?: (set: Api<S, NoInfer<A>>["setState"], get: () => Estado<S> & NoInfer<A>, api: Api<S, NoInfer<A>>) => A;
  /** Minutes of play a day needs before sleeping turns it (default `MINUTOS_POR_DIA`, 10). */
  minutosPorDia?: number;
}

/** The slices way: the save is `versao` plus every slice's fields, in order (the engine's `FATIAS_BASE` must be there). */
export interface ConfigFatias {
  /** localStorage key of the save; the corrupt copy goes to `<chave>.corrompido`. */
  chave: string;
  /** The save's version (`versao: z.literal(versao)` in the schema, and in the initial state). */
  versao: number;
  /** `[...FATIAS_BASE, ...the game's]`, in save order. */
  fatias: readonly Fatia[];
  /** Old save shapes → current, BEFORE the schema. */
  migrar?: (raw: Record<string, unknown>) => Record<string, unknown>;
  /** Minutes of play a day needs before sleeping turns it (default `MINUTOS_POR_DIA`, 10). */
  minutosPorDia?: number;
  /** Base action names a slice of the game replaces on purpose (`tick`, `pegarItem`...): the later slice wins instead of erroring. */
  substitui?: readonly string[];
}

export interface StoreDoJogo<S extends SaveBase, A extends object> {
  store: Api<S, A>;
  /** Write the save now (a safe moment); emits salvou(motivo). Storage blocked = progress lives until reload. */
  salvar(motivo: string): void;
  /**
   * Load at start-up: the save under `chave` (migrated, validated, sanitised; then `voltar()`), else the initial state.
   * A corrupt save is kept under `<chave>.corrompido` and the game starts fresh.
   */
  carregar(): "carregou" | "novo" | "corrompido";
  /** The save as JSON text (file export, tests). */
  exportarJSON(): string;
  /** Validate and load a save from JSON text; throws with a readable message if it is not one. */
  importarJSON(texto: string): void;
  readonly CHAVE: string;
}

/** The saved field names: the schema's shape when it is an object schema, else every non-function field. */
function camposDoSave(schema: unknown, inicial: object): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape && typeof shape === "object" ? Object.keys(shape) : Object.keys(inicial);
}

export function criarStore<S extends SaveBase, A extends object = {}>(cfg: ConfigStore<S, A>, eventos: Eventos<any>): StoreDoJogo<S, A>;
export function criarStore<S extends SaveBase, A extends object = {}>(cfg: ConfigFatias, eventos: Eventos<any>): StoreDoJogo<S, A>;
export function criarStore<S extends SaveBase, A extends object = {}>(cfg: ConfigStore<S, A> | ConfigFatias, eventos: Eventos<any>): StoreDoJogo<S, A> {
  const CHAVE = cfg.chave;
  const montado = "fatias" in cfg ? montarFatiasDoStore<S, A>(cfg) : null;
  const legado = "fatias" in cfg ? null : cfg;
  const schema = montado?.schema ?? legado!.schema;
  const sanear = montado ? montado.sanear : legado!.sanear;
  const inicialCfg = montado?.inicial ?? legado!.inicial;
  const ctx: CtxFatia = { eventos, salvar: (motivo) => salvar(motivo), minutosPorDia: cfg.minutosPorDia ?? MINUTOS_POR_DIA };
  const campos = camposDoSave(schema, inicialCfg);
  const inicial = () => structuredClone(inicialCfg);

  const store = createStore<Estado<S> & A>()((set, get, api) => {
    const proprias: Pick<AcoesBase<S>, "carregarSave" | "zerar"> = {
      carregarSave(save) {
        set(structuredClone(save) as unknown as Partial<Estado<S> & A>);
        eventos.emit("carregou");
      },

      zerar() {
        set(inicial() as unknown as Partial<Estado<S> & A>);
        eventos.emit("carregou");
      },
    };
    if (montado) return { ...inicial(), ...montado.acoes(set, get, ctx), ...proprias } as Estado<S> & A;
    const base = juntarAcoes(FATIAS_BASE, set, get, ctx);
    return { ...inicial(), ...base, ...proprias, ...(legado!.acoes?.(set, get, api) ?? ({} as A)) } as Estado<S> & A;
  });

  function salvo(): Record<string, unknown> {
    const s = store.getState() as Record<string, unknown>;
    return Object.fromEntries(campos.filter((k) => typeof s[k] !== "function").map((k) => [k, s[k]]));
  }

  function validar(raw: unknown): S {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("save vazio ou inválido");
    const obj = cfg.migrar ? cfg.migrar({ ...(raw as Record<string, unknown>) }) : raw;
    const save = schema.parse(obj);
    return sanear ? sanear(save) : save;
  }

  function salvar(motivo: string) {
    try {
      store.setState({ ultimaVez: Date.now() } as Partial<Estado<S> & A>);
      localStorage.setItem(CHAVE, JSON.stringify(salvo()));
      eventos.emit("salvou", motivo);
    } catch {
      // storage blocked: progress lives until reload
    }
  }

  function carregar(): "carregou" | "novo" | "corrompido" {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(CHAVE);
    } catch {
      return "novo";
    }
    if (!raw) return "novo";
    try {
      store.getState().carregarSave(validar(JSON.parse(raw)));
      store.getState().voltar();
      return "carregou";
    } catch (e) {
      console.warn("save inválido, começando de novo:", e);
      try { localStorage.setItem(`${CHAVE}.corrompido`, raw); } catch { /* ignore */ }
      store.getState().zerar();
      return "corrompido";
    }
  }

  return {
    store,
    salvar,
    carregar,
    exportarJSON: () => JSON.stringify(salvo(), null, 2),
    importarJSON: (texto) => store.getState().carregarSave(validar(JSON.parse(texto))),
    CHAVE,
  };
}

/** `montarFatias` for the store: the engine's slices must be in the list (the base actions and fields live there). */
function montarFatiasDoStore<S, A>(cfg: ConfigFatias) {
  const faltam = FATIAS_BASE.filter((b) => !cfg.fatias.some((f) => f.nome === b.nome)).map((b) => b.nome);
  if (faltam.length) throw new Error(`criarStore: faltam as fatias do engine (${faltam.join(", ")}): use [...FATIAS_BASE, ...]`);
  return montarFatias<S, A>({ versao: cfg.versao, fatias: cfg.fatias, substitui: cfg.substitui });
}
