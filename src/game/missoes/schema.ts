import { z } from "zod";

/**
 * A quest is data: `src/game/missoes/<id>.yaml` in the game, validated here when it loads. The interpreter
 * (`missoes.ts`) runs the `passos` in order; the saved progress is only `{passo, contadores, concluida}`.
 * Quest givers are NPC ids (`quem`); the conversations are dialogue ids of the game.
 *
 * Built-in step types:
 * - ir: be within `raio` m of a place (`lugar` = key of the game's places, or a list to visit in any order).
 * - falar: talk to `npc` (the step's `dialogo` is what they say; done after it).
 * - coletar: pick up `qtd` of `item` (counted from the moment the step starts).
 * - levar: talk to `npc` carrying `qtd` of `item`; the items are handed over (`dialogo_falta` plays when short).
 * - achar: the compass points at `lugar`; done when the world says she found `objeto` (`MundoMissoes.achou`).
 * A quest is offered once its `requer` quests are done and, with `oferecer_apos`, once that world event happened.
 * A game registers more types with `registrarPasso` (missoes.ts) and extends the schema with `criarMissaoSchema`.
 * `ao_concluir` is opaque to the engine: the game validates it and hands it out (`entregarRecompensa`).
 */
export const Id = z.string().regex(/^[a-z0-9-]+$/);
/** A place: a key of the game's places (camelCase allowed) or an extra the game adds. */
export const LugarId = z.string().regex(/^[a-zA-Z0-9-]+$/);

export const PassoBase = z.object({
  /** One line for the HUD, the compass and the quest list ("leve 3 maçãs para a dona da mercearia"). */
  texto: z.string().min(1),
  /** Played when the step is completed (optional). */
  dialogo: Id.optional(),
});

export const PASSOS_BASE = [
  PassoBase.extend({
    tipo: z.literal("ir"), lugar: z.union([LugarId, z.array(LugarId).min(1)]), raio: z.number().positive(),
    /** Per-place arrival dialogue when `lugar` is a list. */
    dialogos: z.record(LugarId, Id).optional(),
    /** A hidden place: the compass does not point at it (the step text gives the hint). */
    sem_marco: z.boolean().optional(),
  }),
  PassoBase.extend({ tipo: z.literal("falar"), npc: Id, dialogo: Id }),
  PassoBase.extend({ tipo: z.literal("coletar"), item: Id, qtd: z.number().int().positive() }),
  PassoBase.extend({ tipo: z.literal("levar"), npc: Id, item: Id, qtd: z.number().int().positive(), dialogo: Id, dialogo_falta: Id }),
  PassoBase.extend({ tipo: z.literal("achar"), objeto: Id, lugar: LugarId, raio: z.number().positive() }),
] as const;

export const PassoSchema = z.discriminatedUnion("tipo", [...PASSOS_BASE]);
export type Passo = z.infer<typeof PassoSchema>;
export type TipoPasso = Passo["tipo"];

/** Builds the quest schema, with the game's extra step shapes added to the union. */
export function criarMissaoSchema<T extends z.ZodObject<any>>(extras: readonly T[] = []) {
  const passo = z.discriminatedUnion("tipo", [...PASSOS_BASE, ...extras] as any);
  return z.object({
    id: Id,
    titulo: z.string().min(1),
    /** One or two lines for the quest list: who asked, what for. */
    descricao: z.string().min(1),
    /** NPC id of the giver. */
    quem: Id,
    /** The giver's conversations: offering it (it starts after), while it runs, after it is done. */
    dialogo_oferta: Id,
    dialogo_andamento: Id,
    dialogo_feito: Id,
    /** Generated from the game's repeatable templates (id "rep-<n>", `repetiveis.ts`), never written as a file. */
    repetivel: z.boolean().optional(),
    /** Quests that must be done before this one is offered. */
    requer: z.array(Id).optional(),
    /**
     * A world event that must have happened before this one is offered (the hint: "the eggs ran out"): the game answers
     * `MundoMissoes.aconteceu(evento)`, usually from a boolean key of its `mundo` slice. Extends `requer`, same status.
     */
    oferecer_apos: z.string().regex(/^[a-z0-9_-]+$/).optional(),
    dificuldade: z.enum(["facil", "media", "dificil"]).default("facil"),
    passos: z.array(passo).min(1),
    /** Opaque to the engine: the game validates and delivers it. */
    ao_concluir: z.record(z.string(), z.unknown()).optional(),
  });
}

export const MissaoSchema = criarMissaoSchema();
export type MissaoDef<P = Passo> = Omit<z.infer<typeof MissaoSchema>, "passos"> & { passos: P[] };

/** What the screens show about a quest (the interpreter builds it; the preact list only renders it). */
export interface ResumoMissao {
  id: string;
  titulo: string;
  descricao: string;
  quem: string;
  status: "nova" | "ativa" | "feita";
  /** A generated repeatable quest (the list may mark it). */
  repetivel?: boolean;
  /** Index of the current step (ativa) or passos.length (feita). */
  passo: number;
  passos: { texto: string; feito: boolean; /** "2/3" for counted steps, else "". */ progresso: string }[];
}
