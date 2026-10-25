import { load } from "js-yaml";
import { z } from "zod";

/**
 * A game's manifest (`jogo.yaml` at the root of its repo): what it is called, where each kind of content lives and how
 * its own quest step types read in Portuguese. The content viewer (`visualizador/`) reads it instead of fixed paths;
 * the game's tests check that every path exists and that `passos_extras` matches the step types it registers.
 *
 * ```yaml
 * nome: As Três Ilhas
 * conteudo: { missoes: src/game/missoes/*.yaml, itens: src/game/itens.yaml, lugares: src/world/lugares.ts }
 * passos_extras:
 *   domar: { icone: "🐉", descricao: "fazer amizade com a dragoa", campos: {} }
 * ```
 */

/** How a step field reads: `lugar`/`pessoa`/`item` are shown by name (and linked), the others raw (`textos`: a list of
 * strings, like the accepted answers of a riddle; `sim_nao`: true or false). */
export const TIPOS_DE_CAMPO = ["id", "lugar", "pessoa", "item", "numero", "texto", "textos", "sim_nao"] as const;
export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number];

export const PassoExtraSchema = z.object({
  icone: z.string().optional(),
  /** `{campo}` placeholders; a field typed lugar/pessoa/item is shown by name. */
  descricao: z.string().min(1),
  /** The step's own fields (besides `tipo`, `texto` and the optional `dialogo`) and how each one reads. */
  campos: z.record(z.string(), z.enum(TIPOS_DE_CAMPO)).optional(),
});
export type PassoExtra = z.infer<typeof PassoExtraSchema>;

export const ManifestoSchema = z.object({
  nome: z.string().min(1),
  /**
   * Kind of content → path or glob (`dir/*.yaml`), relative to the manifest. Kinds the engine's own scripts read:
   * `dialogos`, `novidades` and the optional `vozes` (the voice table, game/dialogo/vozes.ts; `scripts/gerar-vozes.mjs`
   * defaults it to `src/game/dialogo/vozes.yaml`).
   */
  conteudo: z.record(z.string(), z.string().min(1)),
  /** Quest step types beyond the engine's ir/falar/coletar/levar. */
  passos_extras: z.record(z.string(), PassoExtraSchema).default({}),
  /**
   * People and places that live in the game's code, not in its `moradores`/`lugares` files (a character built by its own
   * class, a place added at run time), so the viewer knows them when a quest names them.
   */
  extras: z.object({
    pessoas: z.array(z.object({ id: z.string().min(1), nome: z.string().min(1), papel: z.string().optional() })).default([]),
    lugares: z.array(z.object({ id: z.string().min(1), descricao: z.string().optional() })).default([]),
  }).optional(),
});
export type Manifesto = z.infer<typeof ManifestoSchema>;

/** Parses and validates a manifest; a readable error (with the file name) when it is wrong. */
export function lerManifesto(raw: string, arquivo = "jogo.yaml"): Manifesto {
  let doc: unknown;
  try { doc = load(raw); } catch (e) { throw new Error(`${arquivo}: YAML inválido: ${(e as Error).message}`); }
  const r = ManifestoSchema.safeParse(doc);
  if (!r.success) throw new Error(`${arquivo}: ${z.prettifyError(r.error)}`);
  return r.data;
}

/**
 * Fills a step description: `{campo}` → the step's value, through `nome(tipo, valor)` for fields typed
 * lugar/pessoa/item (a list of places is joined with ", "). A missing value reads "?".
 */
export function preencherDescricao(
  extra: PassoExtra, passo: Record<string, unknown>, nome: (tipo: "lugar" | "pessoa" | "item", chave: string) => string,
): string {
  return extra.descricao.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, campo: string) => {
    const v = passo[campo];
    if (v === undefined || v === null || v === "") return "?";
    const tipo = extra.campos?.[campo];
    const lista = Array.isArray(v) ? v.map(String) : [String(v)];
    return (tipo === "lugar" || tipo === "pessoa" || tipo === "item" ? lista.map((x) => nome(tipo, x)) : lista).join(", ");
  });
}
