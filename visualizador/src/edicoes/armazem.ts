/**
 * Where the edits live in her browser: localStorage, one key per game (`edicoes:<jogo>`), the same document the game
 * reads at start-up (same origin: the MDM is at /tresilhas/mdm/, the game at /tresilhas/). localStorage and not
 * IndexedDB on purpose: the game's content modules load synchronously (import.meta.glob at module evaluation), so the
 * edits must be readable synchronously too; the document is a few kilobytes.
 */
import { DocumentoEdicoesSchema, type DocumentoEdicoes } from "../../../src/game/edicoes/edicoes.ts";

export const chaveDoJogo = (jogo: string) => `edicoes:${jogo}`;
const chaveDicas = (jogo: string) => `edicoes:${jogo}:dicas-vistas`;

function guardado(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function lerDocumento(jogo: string): DocumentoEdicoes | null {
  const raw = guardado()?.getItem(chaveDoJogo(jogo));
  if (!raw) return null;
  try {
    const r = DocumentoEdicoesSchema.safeParse(JSON.parse(raw));
    return r.success && r.data.jogo === jogo ? r.data : null;
  } catch { return null; }
}

export function gravarDocumento(doc: DocumentoEdicoes) {
  const s = guardado();
  if (!s) return;
  if (doc.ops.length === 0 && !doc.autor) s.removeItem(chaveDoJogo(doc.jogo));
  else s.setItem(chaveDoJogo(doc.jogo), JSON.stringify(doc));
}

export function apagarDocumento(jogo: string) { guardado()?.removeItem(chaveDoJogo(jogo)); }

export const dicasVistas = (jogo: string) => guardado()?.getItem(chaveDicas(jogo)) === "1";
export const marcarDicasVistas = (jogo: string) => guardado()?.setItem(chaveDicas(jogo), "1");
