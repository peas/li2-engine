/**
 * Small Portuguese words for a child's HUD: hearts as fractions, the article of an item's name, the plural of a name.
 * Pure. (`plural(n, um, varios)` in `tempo.ts` is the counted form "3 dias"; `pluralDe` pluralises a name.)
 */

const FRACOES: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
/** Hearts for a child: 0.25 → "¼", 0.5 → "½", 1.5 → "1½", 2 → "2" (rounded to quarters). */
export function textoCoracoes(n: number): string {
  const q = Math.round(Math.max(0, n) * 4) / 4;
  const inteiro = Math.floor(q);
  const fracao = FRACOES[q - inteiro] ?? "";
  return inteiro === 0 && fracao ? fracao : `${inteiro}${fracao}`;
}

/** Feminine nouns that do not end in -a (the default of `comArtigo`; a game passes its own set). */
export const FEMININOS_PADRAO: ReadonlySet<string> = new Set(["carne"]);

/** "a maçã", "o peixe", "a carne assada": the article by the first word (ends in -a/-ã, or listed in `femininos`). */
export function comArtigo(nome: string, femininos: ReadonlySet<string> = FEMININOS_PADRAO): string {
  const p = nome.split(" ")[0];
  return `${/[aã]$/.test(p) || femininos.has(p) ? "a" : "o"} ${nome}`;
}

/** "maçã" → "maçãs", "peixe assado" → "peixes assados", "doce de coco" → "doces de coco" (n = 1: the name as is). */
export function pluralDe(nome: string, n: number): string {
  if (n === 1) return nome;
  const palavras = nome.split(" ");
  const fim = palavras.findIndex((p) => ["de", "do", "da"].includes(p));
  return palavras.map((p, i) => (fim >= 0 && i >= fim ? p : /[rzs]$/.test(p) ? `${p}es` : `${p}s`)).join(" ");
}
