import { afterEach, describe, expect, it } from "vitest";
import { Contextos } from "../../core/contextos";
import type { DepsAparencia, SecaoAparencia } from "./Aparencia";
import { TELAS_PADRAO, montarTelas, type Telas } from "./telas";

const espera = () => new Promise((r) => setTimeout(r, 0));
const tecla = (code: string, alvo: EventTarget = window) => alvo.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** A made-up creature and person (the engine never knows the game's ones). */
function jogo() {
  const estado = { nome: "Fofo", corpo: "#111111" as string | null, roupa: null as string | null, chapeu: null as string | null };
  const secoes = (): SecaoAparencia[] => [
    {
      titulo: "Bicho", icone: "estrela",
      nome: { valor: estado.nome, mudar: (v) => { if (!v) return false; estado.nome = v; } },
      cores: [{ parte: "corpo", nome: "corpo", cores: ["#111111", "#ff0000"], atual: estado.corpo, mudar: (c) => { estado.corpo = c; } }],
      slots: [{ slot: "chapeu", nome: "Chapéu", atual: estado.chapeu, mudar: (id) => { estado.chapeu = id; },
        variantes: [{ id: null, nome: "nenhum" }, { id: "palha", nome: "palha" }, { id: "ouro", nome: "ouro", trancada: true, motivo: "ganhe numa missão" }] }],
    },
    { titulo: "Pessoa", cores: [{ parte: "roupa", nome: "roupa", cores: ["#00ff00"], atual: estado.roupa, semCor: "a de agora", livre: false, mudar: (c) => { estado.roupa = c; } }] },
  ];
  const aparencia: DepsAparencia = { titulo: "Aparência", secoes };
  return { estado, aparencia };
}

const abertas: Telas[] = [];
afterEach(() => { for (const t of abertas.splice(0)) t.fechar(); document.body.innerHTML = ""; });

describe("TelaAparencia", () => {
  it("is registered only when deps.aparencia exists", () => {
    const sem = montarTelas(new Contextos(), {}, TELAS_PADRAO);
    abertas.push(sem);
    expect(() => sem.abrir("aparencia")).toThrow(/não registrada/);
    const com = montarTelas(new Contextos(), { aparencia: jogo().aparencia }, TELAS_PADRAO);
    abertas.push(com);
    com.abrir("aparencia");
    expect(q('[aria-label="Aparência"]')).not.toBeNull();
    expect(TELAS_PADRAO.aparencia).toBeUndefined();
  });

  it("colours, the null button and slots call the game and re-render with the new choice; a locked variant does nothing", async () => {
    const { estado, aparencia } = jogo();
    const t = montarTelas(new Contextos(), { aparencia }, TELAS_PADRAO);
    abertas.push(t);
    t.abrir("aparencia");
    expect([...document.querySelectorAll(".tl-secao")].map((e) => e.textContent!.trim())).toEqual(["Bicho", "Pessoa"]);
    q('[data-parte="corpo"][data-cor="#ff0000"]').click();
    await espera();
    expect(estado.corpo).toBe("#ff0000");
    expect(q('[data-parte="corpo"][data-cor="#ff0000"]').classList.contains("tl-on")).toBe(true);
    expect(q('[data-parte="roupa"][data-cor=""]').classList.contains("tl-on")).toBe(true); // null = the "a de agora" button
    expect(document.querySelector('input[type=color][data-parte="roupa"]')).toBeNull(); // livre: false
    q('[data-parte="roupa"][data-cor="#00ff00"]').click();
    await espera();
    expect(estado.roupa).toBe("#00ff00");
    q('[data-slot="chapeu"][data-variante="ouro"]').click();
    expect(estado.chapeu).toBeNull();
    expect(q('[data-slot="chapeu"][data-variante="ouro"]').dataset.desc).toBe("ouro: ganhe numa missão");
    q('[data-slot="chapeu"][data-variante="palha"]').click();
    await espera();
    expect(estado.chapeu).toBe("palha");
    expect(q('[data-slot="chapeu"][data-variante="palha"]').classList.contains("tl-on")).toBe(true);
  });

  it("the pencil renames: Enter keeps, an empty name is refused, Esc gives up", async () => {
    const { estado, aparencia } = jogo();
    const t = montarTelas(new Contextos(), { aparencia }, TELAS_PADRAO);
    abertas.push(t);
    t.abrir("aparencia");
    q('[data-nome="Bicho"]').click();
    await espera();
    const input = q<HTMLInputElement>("input.tl-nome-input");
    expect(document.activeElement).toBe(input);
    input.value = "";
    tecla("Enter", input);
    await espera();
    expect(document.querySelector("input.tl-nome-input")).not.toBeNull(); // refused: still editing
    input.value = "Faísca";
    tecla("Enter", input);
    await espera();
    expect(estado.nome).toBe("Faísca");
    expect(q(".tl-ap-nome-valor").textContent).toBe("Faísca");
    q('[data-nome="Bicho"]').click();
    await espera();
    q<HTMLInputElement>("input.tl-nome-input").value = "Outro";
    tecla("Escape", q("input.tl-nome-input"));
    await espera();
    expect(estado.nome).toBe("Faísca");
    expect(t.aberta).toBe("aparencia");
  });
});
