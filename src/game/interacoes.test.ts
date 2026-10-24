import { describe, expect, it, vi } from "vitest";
import { Interacoes, pontos } from "./interacoes";

describe("Interacoes", () => {
  it("picks the highest priority and runs it on E", () => {
    const i = new Interacoes();
    const falar = vi.fn(), dormir = vi.fn();
    i.registrar(() => ({ texto: "E · dormir", prioridade: 1, run: dormir }));
    const tirar = i.registrar(() => ({ texto: "E · falar", prioridade: 5, run: falar }));
    i.update(0.016, false, false);
    expect(i.texto()).toBe("E · falar");
    i.update(0.016, true, true);
    expect(falar).toHaveBeenCalledTimes(1);
    tirar();
    i.update(0.016, false, false);
    expect(i.atual()?.texto).toBe("E · dormir");
  });

  it("nothing around = no text", () => {
    const i = new Interacoes();
    i.registrar(() => null);
    i.update(0.016, true, true);
    expect(i.texto()).toBeNull();
  });

  it("a held action fills the dots and the bar, fires once, and needs E released", () => {
    const barra = { mostrar: vi.fn(), esconder: vi.fn() };
    const i = new Interacoes(barra);
    const pescar = vi.fn();
    i.registrar(() => ({ texto: "segure E · pescar", prioridade: 1, segurar: 2.5, barra: "pescando", run: pescar }));
    i.update(0.1, false, false);
    expect(i.texto()).toBe("segure E · pescar");
    for (let t = 0; t < 1.0; t += 0.1) i.update(0.1, true, false);
    expect(i.texto()).toBe("segure E · pescar ●●○○○");
    expect(barra.mostrar).toHaveBeenLastCalledWith("pescando", expect.closeTo(0.4, 1));
    for (let t = 0; t < 2; t += 0.1) i.update(0.1, true, false);
    expect(pescar).toHaveBeenCalledTimes(1);
    for (let t = 0; t < 5; t += 0.1) i.update(0.1, true, false);
    expect(pescar).toHaveBeenCalledTimes(1); // still holding: waits for release
    i.update(0.1, false, false);
    for (let t = 0; t < 2.6; t += 0.1) i.update(0.1, true, false);
    expect(pescar).toHaveBeenCalledTimes(2);
  });

  it("letting go resets the hold", () => {
    const i = new Interacoes();
    const run = vi.fn();
    i.registrar(() => ({ texto: "x", prioridade: 1, segurar: 1, run }));
    i.update(0.6, true, false);
    i.update(0.1, false, false);
    i.update(0.6, true, false);
    expect(run).not.toHaveBeenCalled();
  });

  it("dots", () => {
    expect(pontos(0)).toBe("○○○○○");
    expect(pontos(0.4)).toBe("●●○○○");
    expect(pontos(1)).toBe("●●●●●");
  });
});
