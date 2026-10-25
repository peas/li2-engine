import { afterEach, describe, expect, it, vi } from "vitest";
import { Coracoes, preenchimento } from "./coracoes";
import { Avisos } from "./avisos";
import { Bussola } from "../bussola";
import { MissaoHud } from "../missoes/hud";
import { criarEventos } from "../eventos";
import { dicaUmaVez } from "./dica";
import { icone, registrarIcone, temIcone } from "./icones";
import { Carimbo } from "./carimbo";
import { Moedas } from "./moedas";
import { IndicadorSalvo } from "./salvo";
import { BarraTeclas } from "./teclas";

afterEach(() => { document.body.innerHTML = ""; });

describe("icones", () => {
  it("ships the generic drawings, valid SVG without the letter fallback", () => {
    for (const nome of ["estrela", "ajuda", "coracao", "peixe", "maca", "cogumelo", "coco", "tomate", "casa", "mapa", "moeda"]) {
      expect(temIcone(nome), nome).toBe(true);
      const svg = icone(nome, 32);
      expect(svg.querySelector("text"), nome).toBeNull();
      expect(svg.querySelectorAll("path, circle, rect").length, nome).toBeGreaterThan(0);
    }
  });
  it("the game registers its own; unknown names fall back to a letter", () => {
    expect(icone("xis", 20).textContent).toContain("X");
    registrarIcone("xis", `<circle cx="32" cy="32" r="10"/>`);
    expect(icone("xis", 20).querySelector("text")).toBeNull();
    expect(icone("xis", 20).getAttribute("width")).toBe("20");
  });
});

describe("Coracoes", () => {
  it("fills whole, half and quarter hearts", () => {
    expect(preenchimento(3, 3)).toEqual([1, 1, 1]);
    expect(preenchimento(2.5, 3)).toEqual([1, 1, 0.5]);
    expect(preenchimento(0.5, 3)).toEqual([0.5, 0, 0]);
    expect(preenchimento(0, 2)).toEqual([0, 0]);
    expect(preenchimento(9, 2)).toEqual([1, 1]);
    expect(preenchimento(1.7, 2)).toEqual([1, 0.5]);
    expect(preenchimento(0.25, 2)).toEqual([0.25, 0]);
    expect(preenchimento(1.75, 2)).toEqual([1, 0.75]);
    expect(preenchimento(0.1 + 0.2 + 0.45, 1)).toEqual([0.75]);
    expect(preenchimento(2.9, 3)).toEqual([1, 1, 0.75]);
  });
  it("clips a partial heart at 16/32/48 of 64", () => {
    const c = new Coracoes();
    c.set(2.75, 4);
    const larg = () => [...c.root.querySelectorAll("clipPath rect")].map((r) => r.getAttribute("width"));
    expect([...c.root.querySelectorAll("svg")].map((s) => (s as SVGElement).dataset.k)).toEqual(["1", "1", "0.75", "0"]);
    expect(larg()).toEqual(["48"]);
    c.set(0.25, 4);
    expect(larg()).toEqual(["16"]);
    c.set(1.5, 4);
    expect(larg()).toEqual(["32"]);
  });
  it("draws max hearts at ≥ 28 px and pulses when the value changes", () => {
    const c = new Coracoes(20);
    c.set(1.5, 3);
    const svgs = c.root.querySelectorAll("svg");
    expect(svgs.length).toBe(3);
    expect(svgs[0].getAttribute("width")).toBe("28");
    expect([...svgs].map((s) => (s as SVGElement).dataset.k)).toEqual(["1", "0.5", "0"]);
    expect(c.root.classList.contains("desce")).toBe(false);
    c.set(1, 3);
    expect(c.root.classList.contains("desce")).toBe(true);
    c.set(2, 3);
    expect(c.root.classList.contains("sobe")).toBe(true);
  });
});

describe("BarraTeclas", () => {
  it("draws key caps and rewrites only when the list changes", () => {
    const b = new BarraTeclas();
    b.set([{ tecla: "W / Espaço", texto: "voa" }, { tecla: "E", texto: "falar" }]);
    expect([...b.root.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["W", "Espaço", "E"]);
    const primeiro = b.root.firstChild;
    b.set([{ tecla: "W / Espaço", texto: "voa" }, { tecla: "E", texto: "falar" }]);
    expect(b.root.firstChild).toBe(primeiro);
    b.set([]);
    expect(b.root.children.length).toBe(0);
  });
});

describe("dicaUmaVez", () => {
  it("shows a hint once per save", () => {
    const vistas = new Set<string>();
    const store = { getState: () => ({ dicaNova: (id: string) => (vistas.has(id) ? false : (vistas.add(id), true)) }) };
    const avisos = { mostrar: vi.fn() };
    const dica = dicaUmaVez(store, avisos);
    dica("a", "texto", "maca");
    dica("a", "texto", "maca");
    expect(avisos.mostrar).toHaveBeenCalledTimes(1);
    expect(avisos.mostrar).toHaveBeenCalledWith("texto", "maca", 6000);
  });
});

describe("Carimbo, Moedas, IndicadorSalvo", () => {
  it("the stamp shows its text and restarts its animation", () => {
    const c = new Carimbo();
    c.mostrar("✓ feito");
    expect(c.root.textContent).toBe("✓ feito");
    expect(c.root.classList.contains("on")).toBe(true);
    expect(c.root.className).toContain("crb");
    expect(document.body.contains(c.root)).toBe(true);
  });

  it("coins: the coin icon (or the game's) and the number, bumping up or down after the first value", () => {
    const m = new Moedas();
    expect(m.root.querySelector("svg text")).toBeNull(); // the engine draws "moeda"
    m.set(3);
    expect(m.root.textContent?.trim()).toBe("3");
    expect(m.root.classList.contains("sobe")).toBe(false);
    m.set(5);
    expect(m.root.classList.contains("sobe")).toBe(true);
    m.set(1);
    expect(m.root.classList.contains("desce")).toBe(true);
    const outra = new Moedas({ icone: "estrela" });
    expect(outra.root.querySelector("svg")).not.toBeNull();
    expect(outra.root.getAttribute("aria-label")).toBe("moedas");
  });

  it("the saved indicator shows for 1.5 s", () => {
    vi.useFakeTimers();
    const s = new IndicadorSalvo();
    expect(s.root.textContent).toBe("💾 salvo");
    s.mostrar();
    expect(s.root.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(1600);
    expect(s.root.classList.contains("on")).toBe(false);
    vi.useRealTimers();
  });
});

describe("Avisos.destaque", () => {
  it("one big toast at a time, gone after its time", () => {
    vi.useFakeTimers();
    const a = new Avisos();
    a.destaque("um dia passou", "☀️");
    a.destaque("dois dias passaram", "🕰️", 1000);
    expect(document.querySelectorAll(".avs-destaque")).toHaveLength(1);
    expect(document.querySelector(".avs-destaque")!.textContent).toBe("🕰️dois dias passaram");
    vi.advanceTimersByTime(2000);
    expect(document.querySelectorAll(".avs-destaque")).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe("Bussola: hidden landmarks", () => {
  it("a landmark with oculto never shows, and shows once it is not hidden any more", () => {
    const segredo = { nome: "segredo", icone: "❓", x: 20, z: 20, oculto: true };
    const b = new Bussola([{ nome: "casa", icone: "🏠", x: 0, z: 0 }, segredo]);
    b.update(0, 0, Math.PI);
    const visivel = () => [...document.querySelectorAll<HTMLElement>(".bus-m")].some((e) => e.textContent?.includes("segredo") && e.style.display !== "none");
    expect(visivel()).toBe(false);
    segredo.oculto = false;
    b.update(0, 0, Math.PI);
    expect(visivel()).toBe(true);
  });
});

describe("MissaoHud: a quest that disappears", () => {
  it("forgets a followed quest the interpreter no longer has (a reset, a load)", () => {
    let existe = true;
    const resumo = { id: "rep-1", titulo: "Pedido", descricao: "d", quem: "x", status: "ativa" as const, passo: 0, passos: [{ texto: "faça", feito: false, progresso: "" }] };
    const missoes = {
      ativa: () => (existe ? { id: "rep-1" } : null), status: () => (existe ? "ativa" : "nova"), existe: () => existe,
      resumo: () => resumo, def: () => ({ id: "rep-1", titulo: "Pedido" }),
    };
    const hud = new MissaoHud(missoes as never, criarEventos());
    hud.update();
    expect(document.querySelector<HTMLElement>(".msh")!.style.display).not.toBe("none");
    existe = false;
    hud.update();
    expect(document.querySelector<HTMLElement>(".msh")!.style.display).toBe("none");
  });
});

describe("a game's own look on the HUD pieces", () => {
  it("Avisos takes the icon size and CSS appended after its own", () => {
    const a = new Avisos(undefined, { iconePx: 26, css: ".avs { font-size: 16px; }" });
    a.mostrar("+1 peixe", "peixe");
    expect(document.querySelector(".avs-item svg")!.getAttribute("width")).toBe("26");
    expect(getComputedStyle(a.root).fontSize).toBe("16px");
  });
});
