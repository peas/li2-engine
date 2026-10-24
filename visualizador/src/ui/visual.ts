/** Colour and icon of each node type (the legend, the chips, the graph and the panel all read these). */
import type { TipoNo } from "../carregador/tipos.ts";

export const COR: Record<TipoNo, string> = {
  missao: "#f4a261", pessoa: "#90be6d", lugar: "#8ecae6", item: "#ffd166", receita: "#f9c6d0", dialogo: "#cdb4db", poder: "#b8f2e6",
  colhivel: "#c5e1a5", cutscene: "#ffadad", regiao: "#d6ccc2", mundo: "#7fd8c8",
};
export const ICONE: Record<TipoNo, string> = {
  missao: "🎯", pessoa: "🧑", lugar: "📍", item: "🍎", receita: "🍲", dialogo: "💬", poder: "✨", colhivel: "🌱", cutscene: "🎬", regiao: "🗺️", mundo: "🌍",
};
export const NOME_TIPO: Record<TipoNo, string> = {
  missao: "missão", pessoa: "pessoa", lugar: "lugar", item: "item", receita: "receita", dialogo: "diálogo", poder: "poder",
  colhivel: "onde colher", cutscene: "cena", regiao: "região", mundo: "o mundo mudou",
};
export const PLURAL: Record<TipoNo, string> = {
  missao: "missões", pessoa: "pessoas", lugar: "lugares", item: "itens", receita: "receitas", dialogo: "diálogos", poder: "poderes",
  colhivel: "onde colher", cutscene: "cenas", regiao: "regiões", mundo: "o mundo mudou",
};
export const TIPOS: TipoNo[] = ["missao", "pessoa", "lugar", "item", "receita", "poder", "colhivel", "cutscene", "regiao", "mundo", "dialogo"];

/** `*assim*` is colour 1 (a place, a thing) and `_assim_` colour 2 (a key), as the game's dialogue box draws them. */
export function falaHtml(texto: string): string {
  return esc(texto).replace(/\*([^*]+)\*/g, '<span class="c1">$1</span>').replace(/_([^_]+)_/g, '<span class="c2">$1</span>').replace(/\n/g, "<br>");
}
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
