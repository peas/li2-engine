import { describe, expect, it } from "vitest";
import { Amizade } from "./amizade";

describe("Amizade (befriending over visits)", () => {
  it("steps in order, a visit closes only with all of them, ready at the last visit", () => {
    const a = new Amizade({ passos: ["comeu", "carinho"] as const, visitas: 2 });
    let e = { pronta: false, visitas: 0, comeu: false, carinho: false };
    expect(a.proximo(e)).toBe("comeu");
    expect(a.fazer(e, "carinho")).toBe(e); // only the next step counts
    expect(a.fecharVisita(e)).toBe(e);
    e = a.fazer(e, "comeu");
    expect(a.proximo(e)).toBe("carinho");
    e = a.fazer(e, "carinho");
    expect(a.proximo(e)).toBe("sair");
    e = a.fecharVisita(e);
    expect(e).toEqual({ pronta: false, visitas: 1, comeu: false, carinho: false });
    e = a.fecharVisita(a.fazer(a.fazer(e, "comeu"), "carinho"));
    expect(e).toEqual({ pronta: true, visitas: 2, comeu: false, carinho: false });
    expect(a.proximo(e)).toBeNull();
    expect(a.fazer(e, "comeu")).toBe(e);
  });

  it("works on the game's own key names, keeping other fields and the key order", () => {
    const a = new Amizade({ passos: ["deu", "brincou", "ninou"] as const, visitas: 1, chavePronta: "amiga" });
    const e0 = { amiga: false, visitas: 0, deu: false, brincou: false, ninou: false, extra: "x" };
    const e = a.fecharVisita(a.fazer(a.fazer(a.fazer(e0, "deu"), "brincou"), "ninou"));
    expect(e).toEqual({ amiga: true, visitas: 1, deu: false, brincou: false, ninou: false, extra: "x" });
    expect(Object.keys(e)).toEqual(Object.keys(e0));
    expect(a.proximo(e)).toBeNull();
  });

  it("\"um\" mode (the Dragão's rare dragons): calming or a food is an encounter each, once per visit, tamed at 3", () => {
    const a = new Amizade({ passos: ["acalmou", "comida"] as const, visitas: 3, modo: "um", chavePronta: "domado" });
    let e = { domado: false, visitas: 0, acalmou: false, comida: false };
    expect(a.modo).toBe("um");
    // visit 1: the bar filled (encounter 1), then a food (encounter 2: the same visit still counts)
    e = a.fazer(e, "acalmou");
    expect(e).toEqual({ domado: false, visitas: 1, acalmou: true, comida: false });
    expect(a.pode(e, "acalmou")).toBe(false); // once per visit
    expect(a.fazer(e, "acalmou")).toBe(e);
    e = a.fazer(e, "comida");
    expect(e).toMatchObject({ domado: false, visitas: 2 });
    expect(a.fazer(e, "comida")).toBe(e); // a second food this visit does not count
    expect(a.proximo(e)).toBe("sair");
    // she flies away: the steps count again; visit 2: food first (any order), encounter 3 tames him
    e = a.fecharVisita(e);
    expect(e).toEqual({ domado: false, visitas: 2, acalmou: false, comida: false });
    expect(a.fecharVisita(e)).toBe(e); // nothing done: nothing to clear
    e = a.fazer(e, "comida");
    expect(e).toEqual({ domado: true, visitas: 3, acalmou: false, comida: true });
    expect(a.proximo(e)).toBeNull();
    expect(a.pode(e, "acalmou")).toBe(false);
    expect(a.fazer(e, "acalmou")).toBe(e);
  });

  it("\"todos\" stays the default: \"pode\" is only the next step", () => {
    const a = new Amizade({ passos: ["comeu", "carinho"] as const, visitas: 2 });
    const e = { pronta: false, visitas: 0, comeu: false, carinho: false };
    expect(a.modo).toBe("todos");
    expect(a.pode(e, "comeu")).toBe(true);
    expect(a.pode(e, "carinho")).toBe(false);
  });
});
