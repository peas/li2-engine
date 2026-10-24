/**
 * Pre-rendered voice lines: the mapping from a dialogue line to its audio file. Shared by the game (`voz.ts`) and by
 * the game's `scripts/gerar-vozes.mjs` (Node imports this .ts directly, so it imports nothing), so both sides normalise
 * the text the same way.
 *
 * The index (`<audio>/falas/index.json`) is keyed by portrait, then by the normalised text; the value is the file
 * name inside `falas/<retrato>/`. File names are content hashes (text + voice settings), so a changed line or a
 * changed voice gets a new file and the old one is dropped by the script.
 */
export interface IndiceDeFalas {
  versao: 1;
  falas: Record<string, Record<string, string>>;
}

/** The text as the index stores it: no colour markers, inner line breaks and runs of spaces become one space. */
export function normalizarTexto(texto: string): string {
  // same pairing as texto.ts `segmentar` (a marker with its next twin, non-empty inside)
  return texto.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/\s+/g, " ").trim();
}

/** Portrait keys are lower-case, as `criarDialogos` derives them. */
export function chaveDoRetrato(retrato: string): string {
  return retrato.trim().toLowerCase();
}

/** The file path (relative to `falas/`) of a line, or null when it was not rendered. */
export function acharArquivo(indice: IndiceDeFalas | null | undefined, retrato: string, texto: string): string | null {
  const nome = indice?.falas?.[chaveDoRetrato(retrato)]?.[normalizarTexto(texto)];
  return nome ? `${chaveDoRetrato(retrato)}/${nome}` : null;
}
