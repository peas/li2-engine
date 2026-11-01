/** Validation of a diary POST, pure (no Workers API) so it is unit-tested with plain vitest. */

/** Body size ceiling in bytes: a diary is a few KB (counters saturate at the catalogues, 40 sessions at most). */
export const MAX_BYTES = 64 * 1024;
/** uuid v4, lowercase, as `crypto.randomUUID()` makes it. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Validado =
  | { ok: true; jogo: string; dispositivo: string; corpo: string }
  | { ok: false; status: number; erro: string };

/** Checks the text is a diary (`versao: 1`, a listed `jogo`, a uuid `dispositivo`) and gives it back re-serialized. */
export function validar(texto: string, jogos: readonly string[]): Validado {
  if (new TextEncoder().encode(texto).byteLength > MAX_BYTES) return { ok: false, status: 413, erro: "grande demais" };
  let dados: unknown;
  try { dados = JSON.parse(texto); } catch { return { ok: false, status: 400, erro: "JSON inválido" }; }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return { ok: false, status: 400, erro: "não é um objeto" };
  const d = dados as Record<string, unknown>;
  if (d.versao !== 1) return { ok: false, status: 400, erro: "versao desconhecida" };
  if (typeof d.jogo !== "string" || !jogos.includes(d.jogo)) return { ok: false, status: 400, erro: "jogo desconhecido" };
  if (typeof d.dispositivo !== "string" || !UUID_V4.test(d.dispositivo)) return { ok: false, status: 400, erro: "dispositivo inválido" };
  for (const campo of ["criado", "atualizado", "segundos"]) {
    if (typeof d[campo] !== "number" || !Number.isFinite(d[campo])) return { ok: false, status: 400, erro: `${campo} inválido` };
  }
  if (!Array.isArray(d.sessoes)) return { ok: false, status: 400, erro: "sessoes inválido" };
  return { ok: true, jogo: d.jogo, dispositivo: d.dispositivo, corpo: JSON.stringify(d) };
}

/** Object key: made HERE from validated parts and the server's date, never from anything the client names. */
export function chaveDoObjeto(jogo: string, dispositivo: string, agora: Date): string {
  return `${jogo}/${dispositivo}/${agora.toISOString().slice(0, 10)}.json`;
}

export function listaDaVar(valor: string | undefined): string[] {
  return (valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
