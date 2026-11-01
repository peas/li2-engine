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
