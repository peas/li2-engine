import { load } from "js-yaml";
import { z } from "zod";

const PistasSchema = z.object({
  /** Place key (where a person stands) → how the quest list says it ("beira do lago"). Vague on purpose. */
  pistas: z.record(z.string(), z.string().min(1)),
});

/**
 * The hint of a veiled quest line, from the game's data: a YAML of place → words and `lugarDe`, where the game keeps each
 * person. Gives `Missoes.quadro` its `pista`; null when the person or the place has none. Throws on a bad file.
 */
export function criarPistas(raw: string, lugarDe: (quem: string) => string | undefined) {
  const r = PistasSchema.safeParse(load(raw));
  if (!r.success) throw new Error(`pistas: ${z.prettifyError(r.error)}`);
  const { pistas } = r.data;
  const pista = (quem: string): string | null => pistas[lugarDe(quem) ?? ""] ?? null;
  return Object.assign(pista, { lugares: Object.keys(pistas) });
}
