import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { criarEventos } from "../eventos";
import type { SaveDasFatias } from "./base";
import { FATIAS_BASE } from "./fatiasBase";
import { criarFatiaMundo, linhasDoMundo, sanearMundo, valorDoMundo, type AcoesMundo, type CamposMundo, type RegistroMundo } from "./mundo";
import { criarStore } from "./store";

/** A made-up game's world: eggs per visit (a quest raises it), a picture on the wall, a hint the world gives. */
const REGISTRO: RegistroMundo = {
  ovos_por_vez: { schema: z.number().int().min(0).max(5), padrao: 2, conta: (v) => (v === 3 ? "o galinheiro dá 3 ovos" : null) },
  quadro_na_parede: { schema: z.boolean(), padrao: false, conta: (v) => (v ? "o quadro está na parede" : null) },
  ovo_acabou: { schema: z.boolean(), padrao: false },
};
type Save = SaveDasFatias<1, CamposMundo>;
const ev = criarEventos<{ mundoMudou: (chave: string, valor: unknown, motivo?: string) => void }>();
const jogo = criarStore<Save, AcoesMundo>({ chave: "teste.mundo", versao: 1, fatias: [...FATIAS_BASE, criarFatiaMundo(REGISTRO)] }, ev);
const s = () => jogo.store.getState();

describe("a fatia mundo", () => {
  beforeEach(() => {
    localStorage.clear();
    s().zerar();
  });

  it("reads the default until something changes it, and keeps only what differs from the default", () => {
    expect(s().mundo).toEqual({});
    expect(s().lerMundo("ovos_por_vez")).toBe(2);
    s().mudarMundo("ovos_por_vez", 3, "as-galinhas");
    expect(s().lerMundo("ovos_por_vez")).toBe(3);
    expect(s().mundo).toEqual({ ovos_por_vez: 3 });
    s().mudarMundo("ovos_por_vez", 2);
    expect(s().mundo).toEqual({});
  });

  it("emits mundoMudou only when the value changes, with the reason", () => {
    const fn = vi.fn();
    const off = ev.on("mundoMudou", fn);
    s().mudarMundo("quadro_na_parede", true, "a-tinta");
    s().mudarMundo("quadro_na_parede", true, "a-tinta");
    s().mudarMundo("ovos_por_vez", 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("quadro_na_parede", true, "a-tinta");
    off();
  });

  it("refuses an unregistered key and an invalid value", () => {
    expect(() => s().mudarMundo("lua_cheia", true)).toThrow(/não registrada/);
    expect(() => s().lerMundo("lua_cheia")).toThrow(/não registrada/);
    expect(() => s().mudarMundo("ovos_por_vez", 9)).toThrow(/inválido/);
    expect(() => s().mudarMundo("ovos_por_vez", "três")).toThrow(/inválido/);
    expect(s().mundo).toEqual({});
  });

  it("sanear drops unknown keys and invalid values; a load keeps the rest", () => {
    expect(sanearMundo({ ovos_por_vez: 3, lua_cheia: true, quadro_na_parede: "sim" }, REGISTRO)).toEqual({ ovos_por_vez: 3 });
    jogo.importarJSON(JSON.stringify({ ...JSON.parse(jogo.exportarJSON()), mundo: { ovos_por_vez: 3, lua_cheia: true } }));
    expect(s().mundo).toEqual({ ovos_por_vez: 3 });
    expect(s().lerMundo("ovos_por_vez")).toBe(3);
  });

  it("linhasDoMundo tells only what changed and has a line", () => {
    expect(linhasDoMundo({}, REGISTRO)).toEqual([]);
    expect(linhasDoMundo({ ovos_por_vez: 3, quadro_na_parede: true, ovo_acabou: true }, REGISTRO)).toEqual(["o galinheiro dá 3 ovos", "o quadro está na parede"]);
    expect(linhasDoMundo({ ovos_por_vez: 4 }, REGISTRO)).toEqual([]);
    expect(valorDoMundo({}, REGISTRO, "quadro_na_parede")).toBe(false);
  });
});
