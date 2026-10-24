import { describe, expect, it } from "vitest";
import { ALCANCE_ACIMA, CRESCER_S, Colheita } from "./colheita";

const v = (x: number, y: number, z: number) => ({ x, y, z });
type Fruta = "pera" | "uva" | "noz";

describe("Colheita (engine)", () => {
  const nova = () => {
    const c = new Colheita<Fruta>(10);
    c.add("pera", v(0, 3, 0));
    c.add("uva", v(5, 0.4, 0));
    c.add("noz", v(1.5, 0.1, 0));
    return c;
  };

  it("finds the nearest ripe one within the horizontal reach", () => {
    const c = nova();
    expect(c.colhivel(v(1, 0, 0), 2)?.item).toBe("noz");
    expect(c.colhivel(v(4.2, 0, 0), 1)?.item).toBe("uva");
    expect(c.colhivel(v(20, 0, 0), 2)).toBeNull();
  });

  it("respects the vertical window (default and per Colheita)", () => {
    const c = new Colheita<Fruta>();
    c.add("pera", v(0, ALCANCE_ACIMA + 0.5, 0));
    expect(c.colhivel(v(0, 0, 0), 2)).toBeNull();
    expect(c.colhivel(v(0, 1, 0), 2)?.item).toBe("pera");
    const baixa = new Colheita<Fruta>({ alcanceAcima: 1, alcanceAbaixo: 0.2 });
    baixa.add("uva", v(0, 1.5, 0));
    baixa.add("noz", v(3, -0.5, 0));
    expect(baixa.colhivel(v(0, 0, 0), 1)).toBeNull();
    expect(baixa.colhivel(v(3, 0, 0), 1)).toBeNull();
    expect(baixa.colhivel(v(3, -0.4, 0), 1)?.item).toBe("noz");
  });

  it("a picked one disappears, comes back after regrow, grows for crescerS, and bumps versao", () => {
    const c = nova();
    const pe = v(0, 0, 0.5);
    const v0 = c.versao;
    c.update(0.1);
    expect(c.versao).toBe(v0);
    expect(c.colher(pe, 1)).toBe("pera");
    expect(c.versao).toBeGreaterThan(v0);
    expect(c.colher(pe, 1)).toBeNull();
    expect(c.contar().pera).toEqual({ total: 1, prontas: 0 });
    for (let t = 0; t < 9.9; t += 0.1) c.update(0.1);
    expect(c.colhivel(pe, 1)).toBeNull();
    for (let t = 0; t < 0.3; t += 0.1) c.update(0.1);
    expect(c.pontos[0].colhidaHa).toBeNull();
    expect(c.colhivel(pe, 1)).toBeNull(); // still growing
    for (let t = 0; t < CRESCER_S + 0.2; t += 0.1) c.update(0.1);
    expect(c.colher(pe, 1)).toBe("pera");
  });

  it("regrow per item (the default of add), per point, and the live default", () => {
    const c = new Colheita<Fruta>({ regrow: 120, regrowPorItem: { noz: 240 } });
    c.add("pera", v(0, 0, 0));
    c.add("noz", v(10, 0, 0));
    c.add("uva", v(20, 0, 0), 5);
    expect(c.pontos.map((p) => p.regrow)).toEqual([undefined, 240, 5]);
    for (const x of [0, 10, 20]) c.colher(v(x, 0, 0), 1);
    for (let t = 0; t < 6; t += 0.5) c.update(0.5);
    expect(c.pontos.map((p) => p.colhidaHa === null)).toEqual([false, false, true]);
    for (let t = 0; t < 120; t += 0.5) c.update(0.5);
    expect(c.pontos.map((p) => p.colhidaHa === null)).toEqual([true, false, true]);
    c.regrow = 1;
    c.colher(v(0, 0, 0), 1);
    for (let t = 0; t < 1.5; t += 0.5) c.update(0.5);
    expect(c.pontos[0].colhidaHa).toBeNull();
  });

  it("limitar: only the first n points of an item stay on; off ones are not pickable nor counted; back on = ripe", () => {
    const c = new Colheita<Fruta>(10);
    for (let i = 0; i < 3; i++) c.add("uva", v(i * 2, 0, 0));
    c.add("noz", v(0, 0, 5));
    c.limitar("uva", 2);
    expect(c.pontos.map((p) => p.ativo !== false)).toEqual([true, true, false, true]);
    expect(c.contar().uva).toEqual({ total: 2, prontas: 2 });
    expect(c.colhivel(v(4, 0, 0), 0.5)).toBeNull();
    const versao = c.versao;
    c.limitar("uva", 2); // no change, no bump
    expect(c.versao).toBe(versao);
    c.limitar("uva", 0);
    expect(c.contar().uva).toEqual({ total: 0, prontas: 0 });
    expect(c.colher(v(0, 0, 0), 0.5)).toBeNull();
    expect(c.contar().noz).toEqual({ total: 1, prontas: 1 });
    c.limitar("uva", 3);
    expect(c.pontos.every((p) => p.ativo !== true && p.colhidaHa === null && p.cresceu === 1)).toBe(true);
    expect(c.colher(v(4, 0, 0), 0.5)).toBe("uva");
    c.limitar("uva", 1); // a picked, now off point: update leaves it alone
    c.update(100);
    expect(c.pontos[2].ativo).toBe(false);
    expect(c.pontos[2].colhidaHa).toBe(0);
  });

  it("contar: with a list, every item of it (zeros too, in order); without, the items it has", () => {
    const c = nova();
    expect(Object.keys(c.contar())).toEqual(["pera", "uva", "noz"]);
    const vazia = new Colheita<Fruta>();
    expect(vazia.contar()).toEqual({});
    expect(vazia.contar(["uva", "pera"])).toEqual({ uva: { total: 0, prontas: 0 }, pera: { total: 0, prontas: 0 } });
  });
});
