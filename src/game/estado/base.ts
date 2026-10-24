import { z } from "zod";

/**
 * The part of the save every game has (the engine's quests, hints, news and day logic read these), as the fields of
 * the base slices (`FATIAS_BASE`, fatiasBase.ts, gives them their actions). A game lists `FATIAS_BASE` before its own
 * slices (`criarStore({ versao, fatias })`), or, the older way, extends `SaveBaseSchema` (zod `.extend`) and spreads
 * `SAVE_BASE_INICIAL`; both are these fields merged, in this order.
 */
export const MissaoEstadoSchema = z.object({
  passo: z.number().int().min(0),
  contadores: z.record(z.string(), z.number().int().min(0)),
  concluida: z.boolean(),
});
export type MissaoEstado = z.infer<typeof MissaoEstadoSchema>;

export const Qtd = z.record(z.string(), z.number().int().min(0));

/**
 * Fields and initial values of each base slice, in save order. The day is two slices (`dia` first, the clock
 * `relogio` last) because the saves already in a browser keep `dia` right after `versao` and the clock at the end.
 */
export const CAMPOS_BASE = {
  dia: {
    schema: {
      /** Game day, +1 each time she sleeps (when the day counts). */
      dia: z.number().int().min(1),
    },
    inicial: { dia: 1 },
  },
  inventario: {
    schema: {
      /** Items she carries: item id → quantity. */
      inventario: Qtd,
    },
    inicial: { inventario: {} },
  },
  missoes: {
    schema: {
      /** Quest progress by quest id (a key present = started). */
      missoes: z.record(z.string(), MissaoEstadoSchema),
    },
    inicial: { missoes: {} },
  },
  dicas: {
    schema: {
      /** First-time hints already shown. */
      dicas: z.array(z.string()),
    },
    inicial: { dicas: [] as string[] },
  },
  cenas: {
    schema: {
      /** Cutscenes already watched (ids): the second time a tap skips. */
      cenasVistas: z.array(z.string()),
    },
    inicial: { cenasVistas: [] as string[] },
  },
  novidades: {
    schema: {
      /** Newest `versao` of novidades.yaml already told. */
      ultimaNovidadeVista: z.number().int().min(0),
    },
    inicial: { ultimaNovidadeVista: 0 },
  },
  relogio: {
    schema: {
      /** Seconds of play since the current day began. */
      segundosHoje: z.number().min(0),
      /** Wall-clock (ms since epoch) of the last save; 0 = never. */
      ultimaVez: z.number().min(0),
    },
    inicial: { segundosHoje: 0, ultimaVez: 0 },
  },
};

const C = CAMPOS_BASE;

export const SaveBaseSchema = z.object({
  versao: z.number().int().positive(),
  ...C.dia.schema,
  ...C.inventario.schema,
  ...C.missoes.schema,
  ...C.dicas.schema,
  ...C.cenas.schema,
  ...C.novidades.schema,
  ...C.relogio.schema,
});
export type SaveBase = z.infer<typeof SaveBaseSchema>;

export const SAVE_BASE_INICIAL: Omit<SaveBase, "versao"> = structuredClone({
  ...C.dia.inicial,
  ...C.inventario.inicial,
  ...C.missoes.inicial,
  ...C.dicas.inicial,
  ...C.cenas.inicial,
  ...C.novidades.inicial,
  ...C.relogio.inicial,
});

/** The save type of a game built from slices: the base fields with `versao: V`, plus the fields of the raw shape `Sh`. */
export type SaveDasFatias<V extends number, Sh extends z.ZodRawShape> = Omit<SaveBase, "versao"> & { versao: V } & z.infer<z.ZodObject<Sh>>;
