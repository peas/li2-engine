import { load } from "js-yaml";
import { z } from "zod";

/**
 * What changed in the game, told to the player once per version: the game's `novidades.yaml` holds one entry per
 * release (any order); the save remembers `ultimaNovidadeVista` and the game tells the newer ones (an NPC says the
 * lines, a key opens the screen). The version number lives only in the YAML: an entry with a bigger number IS a new
 * version. A fresh save starts at `VERSAO` (nothing to tell a new player).
 */
export const NovidadeSchema = z.object({
  versao: z.number().int().positive(),
  data: z.coerce.date(),
  titulo: z.string().min(1),
  falas: z.array(z.string().min(1)).min(1),
});
export type Novidade = z.infer<typeof NovidadeSchema>;

export interface Novidades {
  /** Newest first. */
  NOVIDADES: readonly Novidade[];
  /** The newest version in the file. */
  VERSAO: number;
  /** Entries newer than what the save has seen, newest first (empty = nothing to tell). */
  pendentes(ultimaVista: number): Novidade[];
}

export function criarNovidades(raw: string): Novidades {
  const doc = z.object({ novidades: z.array(NovidadeSchema).min(1) }).parse(load(raw));
  const NOVIDADES = [...doc.novidades].sort((a, b) => b.versao - a.versao);
  if (new Set(NOVIDADES.map((n) => n.versao)).size !== NOVIDADES.length) throw new Error("novidades.yaml: versão repetida");
  return {
    NOVIDADES,
    VERSAO: NOVIDADES[0].versao,
    pendentes: (ultimaVista) => NOVIDADES.filter((n) => n.versao > ultimaVista),
  };
}

/** "22/10/2026" for the screen. */
export const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
