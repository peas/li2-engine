import { describe, expect, it, vi } from "vitest";
import { Contextos } from "./contextos";

const esc = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", cancelable: true }));

describe("Contextos", () => {
  it("starts in the game; Esc there does nothing", () => {
    const c = new Contextos();
    expect(c.topo).toBe("jogo");
    expect(c.jogando).toBe(true);
    esc();
    expect(c.topo).toBe("jogo");
  });

  it("only the top counts; Esc closes the top layer through its fechar", () => {
    const c = new Contextos();
    const fecharMenu = vi.fn(() => c.pop("menu"));
    c.push("dialogo", () => c.pop("dialogo"));
    c.push("menu", fecharMenu);
    expect(c.topo).toBe("menu");
    expect(c.ativo("dialogo")).toBe(false);
    esc();
    expect(fecharMenu).toHaveBeenCalledOnce();
    expect(c.topo).toBe("dialogo");
    esc();
    expect(c.topo).toBe("jogo");
  });

  it("pop by name removes that layer wherever it is; the game layer never pops", () => {
    const c = new Contextos();
    c.push("dialogo");
    c.push("menu");
    c.pop("dialogo");
    expect(c.topo).toBe("menu");
    c.pop();
    c.pop();
    expect(c.topo).toBe("jogo");
  });

  it("notifies listeners on every change", () => {
    const c = new Contextos();
    const fn = vi.fn();
    c.onChange(fn);
    c.push("menu");
    c.pop();
    expect(fn.mock.calls.map((a) => a[0])).toEqual(["menu", "jogo"]);
  });
});
