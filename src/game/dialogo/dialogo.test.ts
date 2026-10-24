import { afterEach, describe, expect, it, vi } from "vitest";
import { Contextos } from "../../core/contextos";
import { acharArquivo, chaveDoRetrato, normalizarTexto, type IndiceDeFalas } from "./arquivos";
import { criarDialogos } from "./carregar";
import { Dialogo } from "./dialogo";
import { cortar, pausaDepois, segmentar, textoVisivel } from "./texto";

const tecla = (code: string) => dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
const caixa = () => document.querySelector<HTMLElement>(".dlg-text")!;

/** Every box made in a test is closed after it (a live one keeps its capture listeners and would eat the keys). */
const vivos: Dialogo[] = [];
const novo = (...a: ConstructorParameters<typeof Dialogo>) => { const d = new Dialogo(...a); vivos.push(d); return d; };
afterEach(() => {
  for (const d of vivos.splice(0)) d.pular();
  document.body.innerHTML = "";
});

describe("texto: key words", () => {
  it("splits *colour 1* and _colour 2_, leaves lone markers as text", () => {
    expect(segmentar("Leve *3 maçãs* e aperte _E_!")).toEqual([
      { texto: "Leve ", cor: 0 }, { texto: "3 maçãs", cor: 1 }, { texto: " e aperte ", cor: 0 }, { texto: "E", cor: 2 }, { texto: "!", cor: 0 },
    ]);
    expect(segmentar("2 * 3 = 6")).toEqual([{ texto: "2 * 3 = 6", cor: 0 }]);
    expect(segmentar("**")).toEqual([{ texto: "**", cor: 0 }]);
    expect(textoVisivel("A *vila*\nfica a _oeste_.")).toBe("A vila\nfica a oeste.");
  });

  it("cuts by visible letters, keeping the colours", () => {
    const segs = segmentar("Oi *Rosa*!");
    expect(cortar(segs, 5)).toEqual([{ texto: "Oi ", cor: 0 }, { texto: "Ro", cor: 1 }]);
    expect(cortar(segs, 99).map((s) => s.texto).join("")).toBe("Oi Rosa!");
  });

  it("pauses after punctuation only before a space", () => {
    expect(pausaDepois(",", " ", 120, 350)).toBe(120);
    expect(pausaDepois("!", "\n", 120, 350)).toBe(350);
    expect(pausaDepois(".", ".", 120, 350)).toBe(0);
    expect(pausaDepois(".", "5", 120, 350)).toBe(0);
    expect(pausaDepois("a", " ", 120, 350)).toBe(0);
  });
});

describe("Dialogo", () => {
  it("types only the visible letters, colours the key words, blips each letter", async () => {
    const onLetra = vi.fn();
    const d = novo({ onLetra });
    const fim = d.play([{ quem: "Rosa", retrato: "rosa", texto: "Oi *Ana*" }]);
    expect(d.active).toBe(true);
    d.update(0.05); // 2 letters at 40/s
    expect(caixa().textContent).toBe("Oi");
    d.update(1);
    expect(caixa().textContent).toBe("Oi Ana");
    expect(caixa().querySelector(".dlg-k1")?.textContent).toBe("Ana");
    expect(onLetra.mock.calls.map((c) => c[1]).join("")).toBe("OiAna");
    expect(onLetra).toHaveBeenCalledWith("Rosa", "O");
    // finished: it waits forever for the player
    d.update(100);
    expect(d.active).toBe(true);
    tecla("Space");
    await expect(fim).resolves.toBe("fim");
    expect(d.active).toBe(false);
  });

  it("pauses after a comma and a full stop", () => {
    const d = novo();
    d.params.speed = 100;
    void d.play([{ quem: "A", retrato: "a", texto: "a, b. c" }]);
    d.update(0.02); // "a," then the comma pause starts
    expect(caixa().textContent).toBe("a,");
    d.update(0.1); // still pausing (120 ms)
    expect(caixa().textContent).toBe("a,");
    d.update(0.05); // pause over, then " b."
    expect(caixa().textContent).toBe("a, b.");
    d.update(0.3);
    expect(caixa().textContent).toBe("a, b.");
    d.update(0.1);
    expect(caixa().textContent).toBe("a, b. c");
  });

  it("Space: the first finishes the line, the second goes on; Esc skips through the context stack", async () => {
    const contextos = new Contextos();
    const d = novo({ contextos });
    const fim = d.play([{ quem: "A", retrato: "a", texto: "uma fala longa" }, { quem: "B", retrato: "b", texto: "outra" }]);
    expect(contextos.topo).toBe("dialogo");
    tecla("Space");
    expect(caixa().textContent).toBe("uma fala longa");
    tecla("Space");
    expect(document.querySelector(".dlg-name")!.textContent).toBe("B");
    expect(caixa().textContent).toBe("");
    tecla("Escape");
    await expect(fim).resolves.toBe("pulado");
    expect(contextos.topo).toBe("jogo");
  });

  it("an empty conversation ends at once; the prompt hides while talking", async () => {
    const d = novo();
    await expect(d.play([])).resolves.toBe("fim");
    d.prompt("E · falar");
    expect(document.querySelector(".dlg-prompt")!.classList.contains("on")).toBe(true);
    void d.play([{ quem: "A", retrato: "a", texto: "x" }]);
    expect(document.querySelector(".dlg-prompt")!.classList.contains("on")).toBe(false);
  });
});

describe("criarDialogos", () => {
  const d = criarDialogos({
    "./dialogos/oi.yaml": "personagem: Dona Rosa\nretrato: mercearia\nfalas:\n  - texto: Oi!\n  - quem: Você\n    retrato: heroi\n    texto: Olá\n",
    "./dialogos/ruim.yaml": "falas:\n  - quem: X\n",
    "./dialogos/sem.yaml": "personagem: X\n",
  });
  it("loads by file name with the defaults", () => {
    expect(d.listar()).toEqual(["oi", "ruim", "sem"]);
    expect(d.carregar("oi")).toEqual([
      { quem: "Dona Rosa", retrato: "mercearia", texto: "Oi!" },
      { quem: "Você", retrato: "heroi", texto: "Olá" },
    ]);
  });
  it("readable errors", () => {
    expect(() => d.carregar("nada")).toThrow(/não existe/);
    expect(() => d.carregar("ruim")).toThrow(/fala 1/);
    expect(() => d.carregar("sem")).toThrow(/falas/);
  });
});

describe("fala → arquivo", () => {
  it("normalises markers, line breaks and runs of spaces", () => {
    expect(normalizarTexto("A *vila*\nfica   a _oeste_. ")).toBe("A vila fica a oeste.");
    expect(chaveDoRetrato(" Vovo ")).toBe("vovo");
  });
  it("finds the file by portrait and text", () => {
    const indice: IndiceDeFalas = { versao: 1, falas: { vovo: { "Olá, amiga!": "abc.mp3" } } };
    expect(acharArquivo(indice, "Vovo", "Olá,\n*amiga*!")).toBe("vovo/abc.mp3");
    expect(acharArquivo(indice, "vovo", "Tchau")).toBeNull();
    expect(acharArquivo(null, "vovo", "Olá, amiga!")).toBeNull();
  });
});
