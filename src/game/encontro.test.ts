import { describe, expect, it } from "vitest";
import { Encontro, type ParamsEncontro } from "./encontro";

// The Dragão's numbers are in body lengths (its ACALMAR: roars at 5 bodies, bar within 2, ends at 10); the engine takes
// metres, so the test multiplies by a made-up body of 3 m (the Dragão will pass ACALMAR × model.length).
const CORPO = 3;
const EM_CORPOS = { rugeA: 5, recua: 6, barraA: 2, toque: 0.08, decai: 0.15, longeA: 10 };
const PARAMS: ParamsEncontro = { ...EM_CORPOS, rugeA: EM_CORPOS.rugeA * CORPO, barraA: EM_CORPOS.barraA * CORPO, longeA: EM_CORPOS.longeA * CORPO };
const m = (corpos: number) => corpos * CORPO;

describe("Encontro (calming a wild creature)", () => {
  it("roars once when she comes close, shows the bar within two bodies, and taps of E fill it", () => {
    const e = new Encontro(PARAMS);
    expect(e.update(0.1, m(20))).toBeNull();
    expect(e.update(0.1, m(4))).toBe("rugiu");
    expect(e.fase).toBe("arisco");
    expect(e.update(0.1, m(4))).toBeNull(); // only once
    expect(e.mostraBarra).toBe(false);
    expect(e.apertar()).toBe(false); // too far: taps do nothing
    e.update(0.1, m(1.5));
    expect(e.mostraBarra).toBe(true);
    let cheia = false, toques = 0;
    while (!cheia && toques < 100) { cheia = e.apertar(); toques++; }
    expect(toques).toBe(Math.ceil(1 / PARAMS.toque));
    expect(e.fase).toBe("calmo");
    expect(e.mostraBarra).toBe(false);
    expect(e.apertar()).toBe(false); // already calm
  });

  it("the bar leaks 15 % per second without taps, never below zero", () => {
    const e = new Encontro(PARAMS);
    e.update(0.1, m(4));
    e.update(0.1, m(1));
    for (let i = 0; i < 5; i++) e.apertar();
    expect(e.barra).toBeCloseTo(0.4);
    e.update(1, m(1));
    expect(e.barra).toBeCloseTo(0.25);
    e.update(10, m(1));
    expect(e.barra).toBe(0);
  });

  it("going ten bodies away ends the visit: the bar, the calm and the food reset", () => {
    const e = new Encontro(PARAMS);
    e.update(0.1, m(4));
    e.update(0.1, m(1));
    e.apertar();
    e.comeu = true;
    e.update(0.1, m(11));
    expect(e).toMatchObject({ fase: "longe", barra: 0, comeu: false });
    expect(e.update(0.1, m(4))).toBe("rugiu"); // wild again next visit
  });

  it("the reaches are metres: the same distance is near for a small body and far for a big one", () => {
    const pequeno = new Encontro({ ...PARAMS, rugeA: 5 * 1, barraA: 2 * 1, longeA: 10 * 1 });
    expect(pequeno.update(0.1, 6)).toBeNull(); // 6 m > 5 bodies of 1 m
    expect(new Encontro(PARAMS).update(0.1, 6)).toBe("rugiu"); // 6 m < 5 bodies of 3 m
  });
});
