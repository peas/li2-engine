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

/**
 * A wish a player wrote inside a game ("I wish the shop sold X"): two short free-text fields and where it was asked.
 * It is the only free text this Worker stores, so it is small, trimmed and capped; the key never uses client text.
 */
export const MAX_BYTES_PEDIDO = 2 * 1024;
const MAX_NOME = 60, MAX_DESCRICAO = 300, MAX_LUGAR = 30;
/** Collapses whitespace and control characters; returns null if empty or too long. */
function limpo(valor: unknown, max: number, obrigatorio: boolean): string | null {
  if (valor === undefined || valor === null) return obrigatorio ? null : "";
  if (typeof valor !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = valor.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if ((obrigatorio && !t) || [...t].length > max) return null;
  return t;
}

export type PedidoValidado =
  | { ok: true; jogo: string; dispositivo: string; corpo: string }
  | { ok: false; status: number; erro: string };

/** Checks the text is a wish (`versao: "pedido-1"`, a listed `jogo`, a uuid `dispositivo`, `nome`) and re-serializes it. */
export function validarPedido(texto: string, jogos: readonly string[], agora: Date): PedidoValidado {
  if (new TextEncoder().encode(texto).byteLength > MAX_BYTES_PEDIDO) return { ok: false, status: 413, erro: "grande demais" };
  let dados: unknown;
  try { dados = JSON.parse(texto); } catch { return { ok: false, status: 400, erro: "JSON inválido" }; }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return { ok: false, status: 400, erro: "não é um objeto" };
  const d = dados as Record<string, unknown>;
  if (d.versao !== "pedido-1") return { ok: false, status: 400, erro: "versao desconhecida" };
  if (typeof d.jogo !== "string" || !jogos.includes(d.jogo)) return { ok: false, status: 400, erro: "jogo desconhecido" };
  if (typeof d.dispositivo !== "string" || !UUID_V4.test(d.dispositivo)) return { ok: false, status: 400, erro: "dispositivo inválido" };
  const nome = limpo(d.nome, MAX_NOME, true), descricao = limpo(d.descricao, MAX_DESCRICAO, false), lugar = limpo(d.lugar, MAX_LUGAR, false);
  if (nome === null) return { ok: false, status: 400, erro: "nome inválido" };
  if (descricao === null) return { ok: false, status: 400, erro: "descricao inválida" };
  if (lugar === null) return { ok: false, status: 400, erro: "lugar inválido" };
  // only the known fields are stored, with the server's clock
  const corpo = JSON.stringify({ versao: "pedido-1", jogo: d.jogo, dispositivo: d.dispositivo, lugar, nome, descricao, recebido: agora.toISOString() });
  return { ok: true, jogo: d.jogo, dispositivo: d.dispositivo, corpo };
}

/** Wishes live under their own top-level prefix, so a sync of the diaries never mistakes them for a device folder. */
export function chaveDoPedido(jogo: string, dispositivo: string, agora: Date): string {
  return `pedidos/${jogo}/${agora.toISOString().slice(0, 10)}/${agora.getTime()}-${dispositivo.slice(0, 8)}.json`;
}
