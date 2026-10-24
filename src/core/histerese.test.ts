import { describe, expect, it } from "vitest";
import { SeletorComHisterese } from "./histerese";

describe("SeletorComHisterese", () => {
  it("takes the first target at once, then a new one only after dwell seconds in a row", () => {
    const s = new SeletorComHisterese<string>(4);
    expect(s.atual).toBeNull();
    expect(s.escolher(0.1, "a")).toBe("a");
    expect(s.escolher(3, "b")).toBe("a");
    expect(s.escolher(0.5, "a")).toBe("a"); // back before the dwell: the count restarts
    expect(s.escolher(3, "b")).toBe("a");
    expect(s.escolher(0.9, "b")).toBe("a");
    expect(s.escolher(0.2, "b")).toBe("b");
    expect(s.atual).toBe("b");
  });

  it("switching candidate restarts the count", () => {
    const s = new SeletorComHisterese<number>(1);
    s.escolher(0, 1);
    expect(s.escolher(0.8, 2)).toBe(1);
    expect(s.escolher(0.8, 3)).toBe(1);
    expect(s.escolher(0.3, 3)).toBe(3);
  });

  it("limpar forgets: the next call takes its target at once; dwell can change live", () => {
    const s = new SeletorComHisterese<string>(5);
    s.escolher(0, "a");
    s.limpar();
    expect(s.atual).toBeNull();
    expect(s.escolher(0, "b")).toBe("b");
    s.dwell = 0.1;
    expect(s.escolher(0.1, "c")).toBe("c");
  });
});
