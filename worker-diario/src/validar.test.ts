import { describe, expect, it } from "vitest";
import { chaveDoObjeto, listaDaVar, MAX_BYTES, validar } from "./validar";

const jogos = ["dragao", "tresilhas"];
const id = "3f2b1c4e-9a7d-4b6e-8c1f-0a2b3c4d5e6f";
const base = { versao: 1, jogo: "dragao", dispositivo: id, criado: 1, atualizado: 2, segundos: 3, sessoes: [], itens: {} };
const ok = (extra = {}) => validar(JSON.stringify({ ...base, ...extra }), jogos);

describe("validar", () => {
  it("accepts a diary of a listed game with a uuid device and re-serializes it", () => {
    const v = ok();
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.jogo).toBe("dragao");
      expect(v.dispositivo).toBe(id);
      expect(JSON.parse(v.corpo)).toEqual(base);
    }
  });

  it.each([
    ["not JSON", "{oops", 400],
    ["an array", "[]", 400],
    ["another versao", JSON.stringify({ ...base, versao: 2 }), 400],
    ["an unlisted game", JSON.stringify({ ...base, jogo: "outro" }), 400],
    ["a game with a path in it", JSON.stringify({ ...base, jogo: "../dragao" }), 400],
    ["a device that is not a uuid v4", JSON.stringify({ ...base, dispositivo: "../../x" }), 400],
    ["an uppercase uuid", JSON.stringify({ ...base, dispositivo: id.toUpperCase() }), 400],
    ["no sessions", JSON.stringify({ ...base, sessoes: undefined }), 400],
    ["a non-numeric criado", JSON.stringify({ ...base, criado: "ontem" }), 400],
    ["a body over the ceiling", JSON.stringify({ ...base, recursos: { x: "a".repeat(MAX_BYTES) } }), 413],
  ])("refuses %s", (_nome, texto, status) => {
    const v = validar(texto, jogos);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.status).toBe(status);
  });

  it("builds the object key from the validated parts and the server date only", () => {
    expect(chaveDoObjeto("dragao", id, new Date("2026-11-01T23:59:00Z"))).toBe(`dragao/${id}/2026-11-01.json`);
  });

  it("reads comma-separated vars", () => {
    expect(listaDaVar(" https://paulo.com.br, http://localhost:5173 ")).toEqual(["https://paulo.com.br", "http://localhost:5173"]);
    expect(listaDaVar(undefined)).toEqual([]);
  });
});

import { chaveDoPedido, MAX_BYTES_PEDIDO, validarPedido } from "./validar";

describe("validarPedido", () => {
  const agora = new Date("2026-11-23T12:00:00Z");
  const pedido = (extra = {}) => validarPedido(JSON.stringify({ versao: "pedido-1", jogo: "dragao", dispositivo: id, lugar: "mercado", nome: "  pelúcia de\n dragão ", descricao: "bem grande", ...extra }), jogos, agora);
  it("accepts a wish, trims the text, keeps only the known fields and stamps the server's clock", () => {
    const p = pedido({ intruso: "x".repeat(50) });
    expect(p.ok).toBe(true);
    if (p.ok) expect(JSON.parse(p.corpo)).toEqual({ versao: "pedido-1", jogo: "dragao", dispositivo: id, lugar: "mercado", nome: "pelúcia de dragão", descricao: "bem grande", recebido: "2026-11-23T12:00:00.000Z" });
  });
  it("the description and the place are optional; the name is not", () => {
    expect(pedido({ descricao: undefined, lugar: undefined }).ok).toBe(true);
    expect(pedido({ nome: "   " })).toMatchObject({ ok: false, status: 400 });
    expect(pedido({ nome: 7 })).toMatchObject({ ok: false, status: 400 });
  });
  it("refuses long text, another game, a made-up device and a diary sent to the wrong door", () => {
    expect(pedido({ nome: "a".repeat(61) })).toMatchObject({ ok: false, status: 400 });
    expect(pedido({ descricao: "a".repeat(301) })).toMatchObject({ ok: false, status: 400 });
    expect(pedido({ jogo: "outro" })).toMatchObject({ ok: false, status: 400 });
    expect(pedido({ dispositivo: "../x" })).toMatchObject({ ok: false, status: 400 });
    expect(pedido({ versao: 1 })).toMatchObject({ ok: false, status: 400 });
    expect(validarPedido("x".repeat(MAX_BYTES_PEDIDO + 1), jogos, agora)).toMatchObject({ ok: false, status: 413 });
  });
  it("the key is built from validated parts and the date, under its own prefix", () => {
    expect(chaveDoPedido("dragao", id, agora)).toBe(`pedidos/dragao/2026-11-23/${agora.getTime()}-3f2b1c4e.json`);
  });
});
