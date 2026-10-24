import { load } from "js-yaml";
import { z } from "zod";

/** The "Como jogar" screen's content (the game's ajuda.yaml), validated at load. */
const LinhaSchema = z.object({
  /** Keys to draw as key caps; several separated by " / ". */
  tecla: z.string().min(1).optional(),
  /** A bold label before the text (a place, a bar). */
  titulo: z.string().min(1).optional(),
  /** An icon name (hud/icones.ts) before the text. */
  icone: z.string().min(1).optional(),
  texto: z.string().min(1),
  /** A page the text links to (opens in a new tab); relative to the game's URL when it has no scheme. */
  link: z.string().min(1).optional(),
});
const SecaoSchema = z.object({
  titulo: z.string().min(1),
  linhas: z.array(LinhaSchema),
});
const AbaSchema = z.object({
  titulo: z.string().min(1),
  /** Titles of the sections shown in this tab, in order (a section in no tab goes in the first one). */
  secoes: z.array(z.string().min(1)),
});
export const AjudaSchema = z.object({
  secoes: z.array(SecaoSchema).min(1),
  /** Optional tabs at the top of the screen; without them every section is stacked (as before). */
  abas: z.array(AbaSchema).min(1).optional(),
});
export type ConteudoAjuda = z.infer<typeof AjudaSchema>;
export type LinhaAjuda = z.infer<typeof LinhaSchema>;
export type AbaAjuda = z.infer<typeof AbaSchema>;
export type SecaoAjuda = z.infer<typeof SecaoSchema>;

/**
 * The sections of tab `i`: the ones it names, in its order (missing titles skipped), and in the first tab also every
 * section no tab names. Without `abas`, every section.
 */
export function secoesDaAba(c: ConteudoAjuda, i: number): SecaoAjuda[] {
  if (!c.abas?.length) return c.secoes;
  const aba = c.abas[Math.max(0, Math.min(i, c.abas.length - 1))];
  const nomeadas = aba.secoes.map((t) => c.secoes.find((s) => s.titulo === t)).filter((s): s is SecaoAjuda => !!s);
  if (aba !== c.abas[0]) return nomeadas;
  const emAlguma = new Set(c.abas.flatMap((a) => a.secoes));
  return [...nomeadas, ...c.secoes.filter((s) => !emAlguma.has(s.titulo))];
}

/** Lines the game adds from its own catalogues (one per power, per recipe...) to the section titled `secao`. */
export interface ExtraAjuda {
  secao: string;
  linhas: LinhaAjuda[];
}

/**
 * Parses and validates `raw` (YAML) and appends the `extras` to their sections (a section that does not exist is
 * created at the end, in the order given). Throws with the field path on a malformed file.
 */
export function criarAjuda(raw: string, extras: ExtraAjuda[] = []): ConteudoAjuda {
  const r = AjudaSchema.safeParse(load(raw));
  if (!r.success) throw new Error(`ajuda.yaml: ${z.prettifyError(r.error)}`);
  const secoes = r.data.secoes.map((s) => ({ ...s, linhas: [...s.linhas] }));
  for (const e of extras) {
    const alvo = secoes.find((s) => s.titulo === e.secao);
    if (alvo) alvo.linhas.push(...e.linhas);
    else secoes.push({ titulo: e.secao, linhas: [...e.linhas] });
  }
  return r.data.abas ? { secoes, abas: r.data.abas } : { secoes };
}
