/**
 * Key words in a line (polish item 1): `*palavra*` = colour 1, `_palavra_` = colour 2. A marker with no partner (or an
 * empty pair) is plain text. The typewriter counts only the visible letters, so the line is split into segments first.
 */
export interface Segmento {
  texto: string;
  /** 0 = plain, 1 = `*...*`, 2 = `_..._`. */
  cor: 0 | 1 | 2;
}

const COR: Record<string, 1 | 2> = { "*": 1, _: 2 };

export function segmentar(texto: string): Segmento[] {
  const out: Segmento[] = [];
  let plano = "";
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    const cor = COR[c];
    if (cor) {
      const fim = texto.indexOf(c, i + 1);
      if (fim > i + 1) {
        if (plano) out.push({ texto: plano, cor: 0 });
        plano = "";
        out.push({ texto: texto.slice(i + 1, fim), cor });
        i = fim + 1;
        continue;
      }
    }
    plano += c;
    i++;
  }
  if (plano) out.push({ texto: plano, cor: 0 });
  return out;
}

/** The line without the markers (what is typed, spoken and measured). */
export const textoVisivel = (texto: string) => segmentar(texto).map((s) => s.texto).join("");

/** The first `n` visible letters, still in segments (the typewriter renders this). */
export function cortar(segs: Segmento[], n: number): Segmento[] {
  const out: Segmento[] = [];
  let resta = n;
  for (const s of segs) {
    if (resta <= 0) break;
    out.push(s.texto.length <= resta ? s : { texto: s.texto.slice(0, resta), cor: s.cor });
    resta -= s.texto.length;
  }
  return out;
}

/**
 * Pause after the visible letter `c` (ms), when the next letter is a space or a line break (so "..." pauses once and
 * "3.5" not at all): `virgula` after , ; : and `ponto` after . ! ? …
 */
export function pausaDepois(c: string, proximo: string | undefined, virgula: number, ponto: number): number {
  if (proximo !== undefined && !/\s/.test(proximo)) return 0;
  if (/[.!?…]/.test(c)) return ponto;
  if (/[,;:]/.test(c)) return virgula;
  return 0;
}
