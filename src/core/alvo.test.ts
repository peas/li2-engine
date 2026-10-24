import { describe, expect, it } from "vitest";
import { SeletorDeAlvo } from "./alvo";

const DT = 1 / 60;
const roda = (s: SeletorDeAlvo, frames: number, cand: () => { id: string; score: number; prioridade?: number }[]) => {
  const ids: (string | null)[] = [];
  for (let i = 0; i < frames; i++) ids.push(s.update(DT, cand()));
  return ids;
};
const trocas = (ids: (string | null)[]) => ids.filter((id, i) => i > 0 && id !== ids[i - 1]).length;

describe("SeletorDeAlvo", () => {
  it("two candidates at about the same distance never make it flicker", () => {
    const s = new SeletorDeAlvo();
    let f = 0;
    // the sign and the dragon swap who is nearer every frame, by a hair
    const ids = roda(s, 300, () => { f++; return [{ id: "placa", score: 2 + 0.1 * (f % 2) }, { id: "dragao", score: 2 + 0.1 * ((f + 1) % 2) }]; });
    expect(ids[0]).not.toBeNull();
    expect(trocas(ids)).toBe(0);
  });

  it("a clearly closer challenger takes over, but only after trocarApos", () => {
    const s = new SeletorDeAlvo({ trocarApos: 0.4 });
    roda(s, 10, () => [{ id: "a", score: 3 }]);
    expect(s.atual).toBe("a");
    const ids = roda(s, 60, () => [{ id: "a", score: 3 }, { id: "b", score: 1 }]);
    expect(ids[10]).toBe("a");
    expect(ids[59]).toBe("b");
    expect(trocas(ids)).toBe(1);
  });

  it("a challenger that is only a little closer never wins", () => {
    const s = new SeletorDeAlvo();
    roda(s, 10, () => [{ id: "a", score: 3 }]);
    roda(s, 120, () => [{ id: "a", score: 3 }, { id: "b", score: 2.5 }]);
    expect(s.atual).toBe("a");
  });

  it("higher priority wins regardless of distance", () => {
    const s = new SeletorDeAlvo({ trocarApos: 0.1 });
    roda(s, 10, () => [{ id: "a", score: 1 }]);
    roda(s, 10, () => [{ id: "a", score: 1 }, { id: "b", score: 5, prioridade: 1 }]);
    expect(s.atual).toBe("b");
  });

  it("a blink of ineligibility keeps the target; a long one drops it", () => {
    const s = new SeletorDeAlvo({ perderApos: 0.3 });
    roda(s, 10, () => [{ id: "a", score: 1 }]);
    roda(s, 5, () => [{ id: "a", score: Infinity }]);
    expect(s.atual).toBe("a");
    roda(s, 30, () => [{ id: "a", score: Infinity }]);
    expect(s.atual).toBeNull();
  });

  it("when the current goes ineligible and another is there, it moves on after perderApos (never sooner)", () => {
    const s = new SeletorDeAlvo({ perderApos: 0.3 });
    roda(s, 10, () => [{ id: "a", score: 1 }, { id: "b", score: 2 }]);
    roda(s, 10, () => [{ id: "a", score: Infinity }, { id: "b", score: 2 }]);
    expect(s.atual).toBe("a");
    roda(s, 10, () => [{ id: "a", score: Infinity }, { id: "b", score: 2 }]);
    expect(s.atual).toBe("b");
  });

  it("limpar forgets everything", () => {
    const s = new SeletorDeAlvo();
    roda(s, 10, () => [{ id: "a", score: 1 }]);
    s.limpar();
    expect(s.atual).toBeNull();
  });
});
