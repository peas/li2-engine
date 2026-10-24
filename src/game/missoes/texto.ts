import type { LinhaAjuda } from "../ui/ajuda";
import type { Missoes } from "./missoes";

/** "✓ missão feita! +1 coração, +6 moedas" (and the items, named by `nomeItem`), for the reward toast. */
export function textoRecompensa(coracoes: number, itens: Record<string, number>, nomeItem: (id: string) => string, moedas = 0): string {
  const partes = [
    coracoes > 0 ? `+${coracoes} ${coracoes === 1 ? "coração" : "corações"}` : "",
    moedas > 0 ? `+${moedas} ${moedas === 1 ? "moeda" : "moedas"}` : "",
    ...Object.entries(itens).map(([id, n]) => `+${n} ${nomeItem(id)}`),
  ].filter(Boolean);
  return `✓ missão feita!${partes.length ? ` ${partes.join(", ")}` : ""}`;
}

/** Replaceable texts of `linhasMissoes`. */
export interface TextosMissoes {
  /** The mysterious line while `n` quests are still hidden (their prerequisites not done). */
  escondida(n: number): string;
}

export const TEXTOS_MISSOES_PADRAO: TextosMissoes = {
  escondida: (n) => (n === 1 ? "mais uma missão escondida" : `mais ${n} missões escondidas`),
};

/**
 * The "Missões" section of a help screen: one line per quest she can see (new: who wants to talk to her, named by
 * `nome`; active: the current step and its progress; done), and one mysterious line while some are still hidden.
 */
export function linhasMissoes(
  missoes: Pick<Missoes, "resumos" | "defs">,
  nome: (id: string) => string,
  textos: Partial<TextosMissoes> = {},
): LinhaAjuda[] {
  const t = { ...TEXTOS_MISSOES_PADRAO, ...textos };
  const resumos = missoes.resumos();
  const linhas: LinhaAjuda[] = resumos.map((r) => {
    if (r.status === "feita") return { titulo: r.titulo, icone: "estrela", texto: "feita! ✓" };
    if (r.status === "nova") return { titulo: r.titulo, icone: "estrela", texto: `nova: ${nome(r.quem)} quer falar com você` };
    const p = r.passos.find((x) => !x.feito);
    return { titulo: r.titulo, icone: "estrela", texto: `ativa: ${p ? `${p.texto}${p.progresso ? ` (${p.progresso})` : ""}` : "quase lá"}` };
  });
  const escondidas = missoes.defs.length - resumos.length;
  if (escondidas > 0) linhas.push({ titulo: "???", icone: "estrela", texto: t.escondida(escondidas) });
  return linhas;
}
