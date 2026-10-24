import type { Fala, FimDoDialogo } from "./dialogo/fala";
import type { Missoes } from "./missoes/missoes";
import type { Npc } from "./npc";

export interface DepsConversa {
  dialogo: { play(falas: Fala[]): Promise<FimDoDialogo> };
  missoes: Pick<Missoes, "aoFalar" | "ofertaPara">;
  /** Dialogue name → lines (the game's dialogues). */
  falas(nome: string): Fala[];
}

/**
 * Talk to an NPC (E or click). An NPC that carries its own `conversar()` runs it instead of any of this; one marked
 * `semMissoes` (a sign) plays only its own dialogue; anyone else gets a quest conversation if one is due (the giver
 * greets with their own line first, then offers; a step waiting for them; the reminder; the thanks), else their own
 * dialogue. Resolves when the box closes ("fim" or "pulado"); Esc during a quest conversation stops it there.
 */
export async function conversar(npc: Npc, deps: DepsConversa): Promise<FimDoDialogo> {
  if (typeof npc.conversar === "function") return npc.conversar();
  if (npc.semMissoes) return deps.dialogo.play(deps.falas(npc.dialogo));
  const conv = deps.missoes.aoFalar(npc.id);
  if (!conv.falas.length) return deps.dialogo.play(deps.falas(npc.dialogo));
  const nomes = deps.missoes.ofertaPara(npc.id) ? [npc.dialogo, ...conv.falas] : conv.falas;
  let fim: FimDoDialogo = "fim";
  for (const n of nomes) {
    fim = await deps.dialogo.play(deps.falas(n));
    if (fim === "pulado") break;
  }
  conv.depois?.(fim);
  return fim;
}
