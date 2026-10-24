import { describe, expect, it } from "vitest";
import { LOBO, Matilha, Teste } from "./lobo";

const meio = () => 0.5;

describe("the wolf's test", () => {
  it("walks up, stays three seconds within one body and bites if she does nothing", () => {
    const t = new Teste();
    expect(t.update(0.5, 10)).toBeNull();
    expect(t.fase).toBe("indo");
    expect(t.update(0.5, 1.2)).toBeNull();
    expect(t.fase).toBe("perto");
    let fim = null;
    for (let i = 0; i < 100 && !fim; i++) fim = t.update(0.1, 0.9);
    expect(fim).toBe("mordeu");
    expect(t.perto).toBeGreaterThanOrEqual(LOBO.testaDura);
    expect(t.perto).toBeLessThan(LOBO.testaDura + 0.2);
  });

  it("goes back without biting when she keeps a bit more than a body away", () => {
    const t = new Teste();
    t.update(0.1, 1.1);
    let fim = null;
    for (let i = 0; i < 100 && !fim; i++) fim = t.update(0.1, 1.15);
    expect(fim).toBe("voltou");
  });

  it("gives up when he cannot reach her, and when she walks away while he is close", () => {
    const longe = new Teste();
    let fim = null;
    for (let i = 0; i < 200 && !fim; i++) fim = longe.update(0.1, 6);
    expect(fim).toBe("voltou");
    expect(longe.t).toBeGreaterThan(LOBO.desisteEm);
    const foge = new Teste();
    foge.update(0.1, 1.0);
    foge.update(1, 1.0);
    expect(foge.update(0.1, 3)).toBe("voltou");
  });
});

describe("the pack", () => {
  it("schedules the first test 20-40 s after the circling starts, one wolf at a time", () => {
    const m = new Matilha();
    expect(m.deveTestar(100, meio)).toBe(false);
    expect(m.proximoTeste).toBe(130);
    expect(m.deveTestar(129, meio)).toBe(false);
    expect(m.deveTestar(130, meio)).toBe(true);
    m.comecou(2);
    expect(m.testador).toBe(2);
    expect(m.deveTestar(200, meio)).toBe(false);
    m.terminou(200, () => 0);
    expect(m.testador).toBeNull();
    expect(m.proximoTeste).toBe(200 + LOBO.testaMin);
  });

  it("restarts the clock when nobody circles her any more", () => {
    const m = new Matilha();
    m.deveTestar(10, meio);
    m.semRonda();
    expect(m.proximoTeste).toBe(-1);
    m.comecou(0);
    m.semRonda(); // a running test is not interrupted
    expect(m.testador).toBe(0);
  });

  it("after a bite or a claw the pack keeps away for 30 s and only then counts down to the next test", () => {
    const m = new Matilha();
    m.comecou(1);
    m.afastar(50, () => 1);
    expect(m.testador).toBeNull();
    expect(m.afastada(79)).toBe(true);
    expect(m.afastada(80)).toBe(false);
    expect(m.proximoTeste).toBe(80 + LOBO.testaMax);
    expect(m.deveTestar(70, meio)).toBe(false);
    expect(m.deveTestar(80 + LOBO.testaMax, meio)).toBe(true);
  });
});
