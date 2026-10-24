import { load } from "js-yaml";
import { z } from "zod";
import type { ParamsSeguidor } from "../seguidor";

/**
 * The species of a game's world live in its own `bichos.yaml` (content in data). The game passes the text and how to
 * resolve a place key (`lugar`) and, optionally, whether an item id exists (`itemExiste`): every `regiao` (and `casa`)
 * must be a place with a centre and a radius, every `item` a catalogue item id. Validated with zod.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Optional `Seguidor` tuning of a `segue` species (any field of `ParamsSeguidor`; the rest from `SEGUIDOR_PADRAO`). */
const SeguidorSchema = z.object({
  atras: z.number(), perto: z.number(), fator: z.number(), minimo: z.number(), teto: z.number(), trote: z.number(),
  alcancar: z.number(), freio: z.number(), longe: z.number(), aparece: z.number(), casa: z.number(), chegada: z.number(), giro: z.number(),
}).partial() satisfies z.ZodType<Partial<ParamsSeguidor>>;

export const EspecieSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    nome: z.string().min(1),
    /** pasta: grazes and flees; bando: a pack that circles at `foge` m; voa: a flock in the sky; pula: fish that jump;
     * segue: waits where it was born until the game calls it (`Bicho.chamar`), then follows the protagonist home. */
    comportamento: z.enum(["pasta", "bando", "voa", "pula", "segue"]),
    regiao: z.union([z.string(), z.array(z.string()).min(1)]),
    quantidade: z.union([z.number().int().min(0), z.array(z.number().int().min(0)).min(1)]),
    velocidade: z.number().positive(),
    velocidadeFuga: z.number().positive(),
    foge: z.number().min(0),
    item: z.string().nullable(),
    /** How it is hunted: hold E (default), or one tap of E (a pack animal that comes to test). */
    caca: z.enum(["segurar", "toque"]).default("segurar"),
    /** `bando` only: one of the pack comes to test the protagonist up close now and then (lobo.ts). False = it only circles and flees. */
    testa: z.boolean().default(true),
    /** `segue` only: the place key of its home, and optional `Seguidor` tuning. */
    casa: z.string().optional(),
    seguidor: SeguidorSchema.optional(),
    /** Drawn this many times its real size (default `ESCALA_BICHOS`, modelos.ts). */
    escala: z.number().positive().optional(),
    marco: z.object({ nome: z.string().min(1), icone: z.string().min(1) }).nullable().optional(),
    cores: z.array(hex).min(1),
  })
  .refine((e) => !Array.isArray(e.quantidade) || (Array.isArray(e.regiao) && e.regiao.length === e.quantidade.length), {
    message: "`quantidade` em lista precisa ter o mesmo tamanho de `regiao`",
  })
  .refine((e) => e.comportamento !== "segue" || !!e.casa, { message: "`segue` precisa de `casa` (o lugar para onde ele vai)" });

export type EspecieYaml = z.infer<typeof EspecieSchema>;
export type Comportamento = EspecieYaml["comportamento"];

/** A region resolved against the map: centre and radius (m). */
export interface Regiao { chave: string; x: number; z: number; raio: number }

/** A species with its regions resolved; speeds and flee distance are mutable (lil-gui tunes them live). */
export interface Especie extends Omit<EspecieYaml, "regiao" | "quantidade" | "casa"> {
  grupos: { regiao: Regiao; quantidade: number }[];
  /** `segue`: home, resolved. */
  casa?: Regiao;
}

/** A place of the game, by key: centre and radius (m), or null when there is no such place. */
export type LugarDe = (chave: string) => { x: number; z: number; raio: number } | null;

export interface OpcoesEspecies {
  lugar: LugarDe;
  /** Does this item id exist in the game's catalogue? Without it items are not checked. */
  itemExiste?: (id: string) => boolean;
}

export function regiaoDe(chave: string, lugar: LugarDe): Regiao {
  const p = lugar(chave);
  if (!p || typeof p.x !== "number" || typeof p.z !== "number" || typeof p.raio !== "number")
    throw new Error(`bichos.yaml: regiao "${chave}" não é um lugar de PLACES`);
  return { chave, x: p.x, z: p.z, raio: p.raio };
}

export function carregarEspecies(text: string, opts: OpcoesEspecies): Especie[] {
  const doc = z.object({ especies: z.array(EspecieSchema).min(1) }).parse(load(text));
  const seen = new Set<string>();
  return doc.especies.map((e) => {
    if (seen.has(e.id)) throw new Error(`bichos.yaml: id repetido "${e.id}"`);
    seen.add(e.id);
    if (e.item !== null && opts.itemExiste && !opts.itemExiste(e.item)) throw new Error(`bichos.yaml: item "${e.item}" de "${e.id}" não existe em itens.yaml`);
    const regioes = Array.isArray(e.regiao) ? e.regiao : [e.regiao];
    const grupos = regioes.map((r, i) => ({
      regiao: regiaoDe(r, opts.lugar),
      quantidade: Array.isArray(e.quantidade) ? e.quantidade[i] : e.quantidade,
    }));
    const { regiao: _r, quantidade: _q, casa, ...rest } = e;
    return casa ? { ...rest, grupos, casa: regiaoDe(casa, opts.lugar) } : { ...rest, grupos };
  });
}
