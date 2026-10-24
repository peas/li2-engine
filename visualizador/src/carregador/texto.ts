/** One line in Portuguese for a step and for a reward; shared by the page (panel, list, story mode) and MISSOES.md. */
import { preencherDescricao } from "../../../src/game/manifesto.ts";
import type { PassoBruto, PassoExtra, Recompensa } from "./tipos.ts";

export type Nomear = (tipo: "pessoa" | "lugar" | "item" | "poder" | "missao", chave: string) => string;

/** The engine's step types; a game's own come from its manifest (`passos_extras[tipo].icone`). */
export const ICONE_PASSO: Record<string, string> = { ir: "🧭", falar: "💬", coletar: "🧺", levar: "🎁", achar: "🔍" };

export function iconePasso(tipo: string, extras: Record<string, PassoExtra> = {}): string {
  return extras[tipo]?.icone ?? ICONE_PASSO[tipo] ?? "▫️";
}

/** The engine's types by their fields; a game's own by its manifest `descricao` (`{campo}` filled); else `tipo em lugares`. */
export function descreverPasso(p: PassoBruto, nome: Nomear, extras: Record<string, PassoExtra> = {}): string {
  const lugares = (Array.isArray(p.lugar) ? p.lugar : p.lugar ? [p.lugar] : []).map((l) => nome("lugar", l));
  const qtd = p.qtd ? `${p.qtd} ` : "";
  switch (p.tipo) {
    case "ir": return `ir a ${lugares.join(", ")}`;
    case "falar": return `falar com ${nome("pessoa", p.npc ?? "?")}`;
    case "coletar": return `coletar ${qtd}${nome("item", p.item ?? "?")}`;
    case "levar": return `levar ${qtd}${nome("item", p.item ?? "?")} para ${nome("pessoa", p.npc ?? "?")}`;
    case "achar": return `achar ${p.objeto ?? "?"} em ${lugares.join(", ")}`;
  }
  const extra = extras[p.tipo];
  if (extra) return preencherDescricao(extra, p, nome);
  return `${p.tipo}${lugares.length ? " em " + lugares.join(", ") : ""}`;
}

export function descreverRecompensa(r: Recompensa | undefined, nome: Nomear): string {
  if (!r) return "";
  const partes: string[] = [];
  if (r.coracoes) partes.push(`${r.coracoes} ❤️`);
  if (r.moedas) partes.push(`${r.moedas} 🪙`);
  for (const [k, v] of Object.entries(r.itens ?? {})) partes.push(`${v}× ${nome("item", k)}`);
  if (typeof r.poder === "string") partes.push(`poder ${nome("poder", r.poder)} ✨`);
  for (const [k, v] of Object.entries(r.mundo ?? {})) partes.push(`🌍 ${k}=${valorMundo(v)}`);
  return partes.join(", ");
}

/** A world value in short JSON (`true`, `3`, `"x"`). */
export const valorMundo = (v: unknown) => JSON.stringify(v) ?? String(v);
