import { z } from "zod";
import type { Eventos } from "../eventos";

/**
 * Slices of the save: each concern (inventory, quests, the day, a game's hearts...) brings its own fields, initial
 * values, actions and clean-up, and `montarFatias` merges them into the one schema, initial state, actions and
 * `sanear` chain that `criarStore` needs. The save's key order is the slices' order and, inside a slice, the order of
 * its `schema` (saves already in a browser keep that order: list the slices to reproduce it).
 */

/** zustand's `setState` as a slice sees it (a partial object, or a function of the state). */
export type SetState<E> = (parcial: Partial<E> | ((s: E) => Partial<E>)) => void;

/** What the store gives every slice's actions. */
export interface CtxFatia {
  /** The store's events (the game narrows the type in its own slices). */
  eventos: Eventos<any>;
  /** Write the save now (a safe moment). */
  salvar(motivo: string): void;
  /** Minutes of play a day needs before sleeping turns it. */
  minutosPorDia: number;
}

/**
 * One concern of the save. `S` is the saved part this slice reads in `sanear`, `A` its actions, `E` the whole state
 * its actions see through `get` (other slices' actions included; default: just this slice).
 */
export interface Fatia<S extends object = any, A extends object = {}, E extends object = S & A> {
  nome: string;
  /** The fields this slice adds at the top level of the save (a zod raw shape, in save order). */
  schema: z.ZodRawShape;
  /** A value for every field of `schema`. */
  inicial: Partial<S>;
  /** Actions; `set`/`get` see the whole state, `ctx` gives the events, `salvar` and the minutes per day. */
  acoes?(set: SetState<E>, get: () => E, ctx: CtxFatia): A;
  /** After the schema: drop what left the catalogues, fix references (a save never breaks the game). */
  sanear?(save: S): S;
}

export interface FatiasMontadas<S, A> {
  /** `z.object({ versao: z.literal(versao), ...every slice's schema })`. */
  schema: z.ZodType<S>;
  /** `versao` and every slice's initial values (a fresh copy). */
  inicial: S;
  /** Every slice's actions, merged (a name in two slices is an error). */
  acoes(set: SetState<any>, get: () => any, ctx: CtxFatia): A;
  /** Every slice's `sanear`, in slice order. */
  sanear(save: S): S;
}

/**
 * Merges the slices' actions; a name defined by two slices is an error (never a silent override), except the names in
 * `substitui`: there the LATER slice replaces the earlier one's action on purpose (a game whose `tick` also drains its
 * bars, or whose `pegarItem` routes coins and clothes elsewhere, lists them so the engine's base action steps aside).
 */
export function juntarAcoes(fatias: readonly Fatia[], set: SetState<any>, get: () => any, ctx: CtxFatia, substitui: readonly string[] = []): Record<string, unknown> {
  const acoes: Record<string, unknown> = {};
  const dono: Record<string, string> = {};
  for (const f of fatias) {
    for (const [nome, fn] of Object.entries(f.acoes?.(set, get, ctx) ?? {})) {
      if (nome in acoes && !substitui.includes(nome)) throw new Error(`ação "${nome}" em duas fatias: ${dono[nome]} e ${f.nome}`);
      acoes[nome] = fn;
      dono[nome] = f.nome;
    }
  }
  return acoes;
}

/**
 * Merges slices into one save: the schema (`versao` first, then each slice's fields in order), the initial state, the
 * actions and the `sanear` chain. Two slices with the same name or the same field, or a field without an initial
 * value, are errors.
 */
export function montarFatias<S, A = {}>(o: { versao: number; fatias: readonly Fatia[]; substitui?: readonly string[] }): FatiasMontadas<S, A> {
  const shape: Record<string, z.ZodRawShape[string]> = { versao: z.literal(o.versao) };
  const inicial: Record<string, unknown> = { versao: o.versao };
  const nomes = new Set<string>();
  for (const f of o.fatias) {
    if (nomes.has(f.nome)) throw new Error(`fatia "${f.nome}" duas vezes`);
    nomes.add(f.nome);
    for (const campo of Object.keys(f.schema)) {
      if (campo in shape) throw new Error(`campo "${campo}" em duas fatias (a segunda é ${f.nome})`);
      if (!(campo in f.inicial)) throw new Error(`fatia ${f.nome}: falta o valor inicial de "${campo}"`);
      shape[campo] = f.schema[campo];
      inicial[campo] = structuredClone((f.inicial as Record<string, unknown>)[campo]);
    }
    for (const campo of Object.keys(f.inicial))
      if (!(campo in f.schema)) throw new Error(`fatia ${f.nome}: "${campo}" tem valor inicial mas não está no schema`);
  }
  const saneadores = o.fatias.flatMap((f) => (f.sanear ? [f.sanear.bind(f)] : []));
  return {
    schema: z.object(shape) as unknown as z.ZodType<S>,
    inicial: inicial as S,
    acoes: (set, get, ctx) => juntarAcoes(o.fatias, set, get, ctx, o.substitui) as A,
    sanear: (save) => saneadores.reduce((s, f) => f(s), save),
  };
}
