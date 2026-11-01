/**
 * POST /diario: receives a play diary from a published game (li2-engine `criarDiario({ enviar })`) and writes it into
 * the private bucket as `<jogo>/<dispositivo>/<AAAA-MM-DD>.json` (one object per device per day, the latest wins: the
 * counters are cumulative). Nothing else: no GET, no listing, no other path. The bucket is reached by binding, so no
 * key exists for the browser to leak; reading is done from the owner's machine with an S3 token (scripts/diario.mjs --r2).
 * Refuses: another method or path (404), an Origin outside ORIGENS (403), too many posts from one IP (429), a body over
 * 64 KB (413), anything that is not a diary of a listed game with a uuid device id (400).
 */
import { chaveDoObjeto, listaDaVar, MAX_BYTES, validar } from "./validar";

interface Env {
  BUCKET: R2Bucket;
  /** Workers Rate Limiting binding; absent in some local runs. */
  LIMITE?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  ORIGENS?: string;
  JOGOS?: string;
}

const texto = (status: number, corpo: string, extra: HeadersInit = {}) =>
  new Response(corpo, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/diario") return texto(404, "não há nada aqui");

    const origem = req.headers.get("Origin") ?? "";
    if (!listaDaVar(env.ORIGENS).includes(origem)) return texto(403, "origem não permitida");
    const cors = { "access-control-allow-origin": origem, vary: "Origin" };

    const ip = req.headers.get("CF-Connecting-IP") ?? "sem-ip";
    if (env.LIMITE) {
      const { success } = await env.LIMITE.limit({ key: ip });
      if (!success) return texto(429, "devagar", { ...cors, "retry-after": "60" });
    }

    const tamanho = Number(req.headers.get("Content-Length") ?? 0);
    if (tamanho > MAX_BYTES) return texto(413, "grande demais", cors);
    const corpo = await req.text();
    const v = validar(corpo, listaDaVar(env.JOGOS));
    if (!v.ok) return texto(v.status, v.erro, cors);

    await env.BUCKET.put(chaveDoObjeto(v.jogo, v.dispositivo, new Date()), v.corpo, {
      httpMetadata: { contentType: "application/json" },
    });
    return new Response(null, { status: 204, headers: cors });
  },
};
