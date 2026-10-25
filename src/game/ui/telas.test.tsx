import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Contextos } from "../../core/contextos";
import { SAVE_BASE_INICIAL, SaveBaseSchema } from "../estado/base";
import { criarStore } from "../estado/store";
import { criarEventos } from "../eventos";
import { criarNovidades } from "../novidades";
import { criarAjuda } from "./ajuda";
import { CtxTelas, type Ctx, type Deps, type ItemMochila } from "./contexto";
import { mover } from "./hooks";
import { TelaMochila } from "./Mochila";
import { TelaMissoes } from "./Missoes";
import { useContext } from "preact/hooks";
import { Tela } from "./Tela";
import { TELAS_PADRAO, ligarTeclas, montarTelas as montarTelasReal, type Telas } from "./telas";

const { store } = criarStore({ chave: "telas.teste", inicial: { ...SAVE_BASE_INICIAL, versao: 1 }, schema: SaveBaseSchema }, criarEventos());
const s = () => store.getState();
const espera = () => new Promise((r) => setTimeout(r, 0));
const tecla = (code: string, init: KeyboardEventInit = {}) => dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, ...init }));
const navs = (el: ParentNode = document) => [...el.querySelectorAll<HTMLElement>("[data-nav]")];

const NOMES: Record<string, string> = { maca: "maçã", peixe: "peixe", pedra: "pedra" };
/** The game's backpack: apples heal (Enter eats one), stones do nothing. */
const mochila: Deps["mochila"] = {
  itens: (): ItemMochila[] => Object.entries(s().inventario).map(([id, qtd]) => ({
    id, nome: NOMES[id], icone: id, qtd, descricao: `um(a) ${NOMES[id]}`, ...(id === "pedra" ? {} : { acao: "come uma", mais: "+1 ❤" }),
  })),
  usar: (id) => s().usarItem(id),
  vazio: "Nada aqui: colha frutas!",
};
const AJUDA = criarAjuda("secoes:\n  - titulo: A pé\n    linhas:\n      - { tecla: W / A / S / D, texto: anda }\n  - titulo: Telas\n    linhas:\n      - { tecla: I, texto: mochila }\n",
  [{ secao: "Receitas", linhas: [{ texto: "peixe assado", icone: "peixe" }] }, { secao: "A pé", linhas: [{ tecla: "Espaço", texto: "pula" }] }]);

/** Renders one screen alone (no montarTelas) into a fresh div. */
function montar(vnode: preact.VNode, deps: Deps = {}) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const ctx: Ctx = { contextos: new Contextos(), deps, fechar() {} };
  render(<CtxTelas.Provider value={ctx}>{vnode}</CtxTelas.Provider>, div);
  return { div, desmontar: () => { render(null, div); div.remove(); } };
}

/** Every screen set made in a test is closed after it (a mounted screen keeps its key listeners). */
const abertas: Telas[] = [];
const montarTelas = (...a: Parameters<typeof montarTelasReal>) => { const t = montarTelasReal(...a); abertas.push(t); return t; };

beforeEach(() => s().zerar());
afterEach(() => {
  for (const t of abertas.splice(0)) t.fechar();
  document.body.innerHTML = "";
});

describe("montarTelas", () => {
  it("opens and closes with the menu layer, one screen at a time, from the injected registry", () => {
    const ctx = new Contextos();
    const Loja = () => <Tela titulo="Loja"><button data-nav>x</button></Tela>;
    const telas = montarTelas(ctx, { mochila, ajuda: AJUDA }, { ...TELAS_PADRAO, loja: Loja });
    const fechou = vi.fn();
    telas.onFechar = fechou;
    telas.abrir("mochila");
    expect(telas.aberta).toBe("mochila");
    expect(ctx.topo).toBe("menu");
    expect(document.querySelector('[aria-label="Mochila"]')).not.toBeNull();
    telas.abrir("loja");
    expect(document.querySelectorAll(".tl-caixa").length).toBe(1);
    expect(document.querySelector('[aria-label="Loja"]')).not.toBeNull();
    telas.fechar();
    expect(telas.aberta).toBeNull();
    expect(ctx.topo).toBe("jogo");
    expect(fechou).toHaveBeenCalledWith("loja");
    expect(() => telas.abrir("estabulo")).toThrow(/não registrada/);
  });

  it("toggle opens and closes; Esc closes through Contextos", () => {
    const ctx = new Contextos();
    const telas = montarTelas(ctx, {}, TELAS_PADRAO);
    telas.toggle("missoes");
    expect(telas.aberta).toBe("missoes");
    expect(document.body.textContent).toContain("Nenhuma missão ainda");
    telas.toggle("missoes");
    expect(telas.aberta).toBeNull();
    telas.toggle("novidades");
    tecla("Escape");
    expect(telas.aberta).toBeNull();
    expect(ctx.topo).toBe("jogo");
  });

  it("the help screen has every section, with the extras appended", () => {
    const telas = montarTelas(new Contextos(), { ajuda: AJUDA }, TELAS_PADRAO);
    telas.abrir("ajuda");
    expect(navs().map((e) => e.querySelector("h3")!.textContent)).toEqual(["A pé", "Telas", "Receitas"]);
    expect([...document.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["W", "A", "S", "D", "Espaço", "I"]);
    telas.fechar();
  });

  it("help with tabs: chips, only the tab's sections, ←/→ and Tab switch (Tab does not reach the screen keys)", async () => {
    const raw = "abas:\n  - { titulo: Comandos, secoes: [A pé, Telas] }\n  - { titulo: Dicas, secoes: [Agora, Receitas] }\n"
      + "secoes:\n  - { titulo: A pé, linhas: [{ texto: anda }] }\n  - { titulo: Telas, linhas: [{ texto: mochila }] }\n"
      + "  - { titulo: Solta, linhas: [{ texto: sem aba }] }\n";
    const ajuda = criarAjuda(raw, [{ secao: "Receitas", linhas: [{ texto: "bolo" }] }]);
    const comAgora = { ...ajuda, secoes: [{ titulo: "Agora", linhas: [{ texto: "dia 1" }] }, ...ajuda.secoes] };
    const telas = montarTelas(new Contextos(), { ajuda: comAgora }, TELAS_PADRAO);
    ligarTeclas(telas, { Tab: "mochila", KeyH: "ajuda" }, () => true);
    const titulos = () => navs().map((e) => e.querySelector("h3")!.textContent);
    const aba = () => document.querySelector(".tl-caixa")!.getAttribute("data-aba");
    telas.abrir("ajuda");
    expect([...document.querySelectorAll(".tl-abas [role=tab]")].map((b) => b.textContent)).toEqual(["Comandos", "Dicas"]);
    expect(aba()).toBe("0");
    expect(titulos()).toEqual(["A pé", "Telas", "Solta"]); // a section in no tab goes in the first
    tecla("ArrowRight");
    await espera();
    expect(aba()).toBe("1");
    expect(titulos()).toEqual(["Agora", "Receitas"]);
    tecla("ArrowRight"); // wraps
    await espera();
    expect(aba()).toBe("0");
    tecla("Tab");
    await espera();
    expect(telas.aberta).toBe("ajuda");
    expect(aba()).toBe("1");
    tecla("Tab", { shiftKey: true });
    await espera();
    expect(aba()).toBe("0");
    (document.querySelectorAll<HTMLElement>(".tl-abas [role=tab]")[1]).click();
    await espera();
    expect(aba()).toBe("1");
    expect(document.querySelector(".tl-abas [aria-selected=true]")!.textContent).toBe("Dicas");
    telas.fechar();
    tecla("ArrowRight"); // closed: the listener is gone
    telas.abrir("ajuda");
    expect(aba()).toBe("0");
  });

  it("help without tabs: no chips, arrows still move between sections", () => {
    const telas = montarTelas(new Contextos(), { ajuda: AJUDA }, TELAS_PADRAO);
    telas.abrir("ajuda");
    expect(document.querySelector(".tl-abas")).toBeNull();
    expect(document.querySelector(".tl-caixa")!.hasAttribute("data-aba")).toBe(false);
    expect(document.activeElement).toBe(navs()[0]);
    tecla("ArrowRight");
    expect(document.activeElement).toBe(navs()[1]);
  });

  it("quests: the injected list, sorted, with the empty text from deps", () => {
    const resumos = [
      { id: "b", titulo: "Feita", descricao: "d", quem: "vovo", status: "feita" as const, passo: 1, passos: [{ texto: "t", feito: true, progresso: "" }] },
      { id: "a", titulo: "Ativa", descricao: "d", quem: "rosa", status: "ativa" as const, passo: 0, passos: [{ texto: "colha", feito: false, progresso: "1/3" }] },
    ];
    const telas = montarTelas(new Contextos(), { missoes: () => resumos, nomeNpc: (id) => `a ${id}`, store }, TELAS_PADRAO);
    telas.abrir("missoes");
    expect(navs().map((e) => e.dataset.id)).toEqual(["a", "b"]);
    expect(document.body.textContent).toContain("colha (1/3)");
    expect(document.body.textContent).toContain("pedido de: a rosa");
    telas.fechar();
    const vazia = montarTelas(new Contextos(), { missoes: () => [], textoVazio: "Fale com o vovô (E)." }, TELAS_PADRAO);
    vazia.abrir("missoes");
    expect(document.body.textContent).toContain("Fale com o vovô (E).");
  });

  it("quests: a 'repete' chip on repeatable ones only when the screen asks for it", () => {
    const resumos = [{ id: "rep-1", titulo: "Pedidinho", descricao: "d", quem: "vovo", status: "nova" as const, passo: 0, repetivel: true, passos: [] }];
    const sem = montar(<TelaMissoes />, { missoes: () => resumos });
    expect(sem.div.textContent).not.toContain("repete");
    sem.desmontar();
    const com = montar(<TelaMissoes repete="repete" />, { missoes: () => resumos });
    expect(com.div.querySelector(".tl-status-nova")?.textContent).toBe("repete");
    com.desmontar();
  });

  it("a screen can swap to another (ctx.abrir) keeping the menu layer", () => {
    const ctx = new Contextos();
    let abrir: ((n: string) => void) | undefined;
    const Lista = () => { abrir = useContext(CtxTelas).abrir; return <Tela titulo="Lista"><span /></Tela>; };
    const telas = montarTelas(ctx, {}, { ...TELAS_PADRAO, lista: Lista });
    telas.abrir("lista");
    abrir!("mochila");
    expect(telas.aberta).toBe("mochila");
    expect(ctx.topo).toBe("menu");
    telas.fechar();
    expect(ctx.topo).toBe("jogo");
  });

  it("news from deps, with the key words drawn in colour", () => {
    const n = criarNovidades("novidades:\n  - { versao: 1, data: 2026-10-22, titulo: Abertura, falas: [\"Aperte _N_ para\\nler de novo.\"] }\n");
    const telas = montarTelas(new Contextos(), { novidades: n.NOVIDADES }, TELAS_PADRAO);
    telas.abrir("novidades");
    expect(document.body.textContent).toContain("Aperte N para ler de novo.");
    expect(document.querySelector(".tl-k2")!.textContent).toBe("N");
  });
});

describe("ligarTeclas", () => {
  it("a key opens, closes and swaps; podeAbrir blocks opening; typing is ignored", () => {
    const telas = montarTelas(new Contextos(), {}, TELAS_PADRAO);
    let pode = true;
    const aoAbrir = vi.fn();
    const off = ligarTeclas(telas, { KeyI: "mochila", KeyM: "missoes" }, () => pode, aoAbrir);
    tecla("KeyI");
    expect(telas.aberta).toBe("mochila");
    expect(aoAbrir).toHaveBeenCalledWith("mochila");
    tecla("KeyM");
    expect(telas.aberta).toBe("missoes");
    tecla("KeyM");
    expect(telas.aberta).toBeNull();
    tecla("KeyI", { repeat: true });
    expect(telas.aberta).toBeNull();
    pode = false;
    tecla("KeyI");
    expect(telas.aberta).toBeNull();
    pode = true;
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI", bubbles: true }));
    expect(telas.aberta).toBeNull();
    off();
    tecla("KeyI");
    expect(telas.aberta).toBeNull();
  });
});

describe("Mochila", () => {
  it("lists what the game gives, uses with Enter and refreshes from the store", async () => {
    s().pegarItem("maca", 2);
    s().pegarItem("pedra");
    const { div, desmontar } = montar(<TelaMochila />, { mochila, store });
    expect(navs(div).map((e) => e.dataset.id)).toEqual(["maca", "pedra"]);
    expect(document.activeElement).toBe(navs(div)[0]);
    expect(div.textContent).toContain("+1 ❤");
    tecla("Enter");
    expect(s().inventario.maca).toBe(1);
    await espera();
    expect(div.textContent).toContain("×1");
    s().pegarItem("peixe");
    await espera();
    expect(navs(div).map((e) => e.dataset.id)).toEqual(["maca", "pedra", "peixe"]);
    // a stone has no action: Enter does nothing
    tecla("ArrowRight");
    tecla("Enter");
    expect(s().inventario.pedra).toBe(1);
    desmontar();
  });

  it("empty backpack says what to do", () => {
    const { div, desmontar } = montar(<TelaMochila />, { mochila, store });
    expect(div.textContent).toContain("Nada aqui: colha frutas!");
    desmontar();
  });
});

describe("navegação", () => {
  it("ArrowRight moves focus to the next [data-nav]", () => {
    s().pegarItem("maca");
    s().pegarItem("peixe");
    const { div, desmontar } = montar(<TelaMochila />, { mochila, store });
    const l = navs(div);
    expect(document.activeElement).toBe(l[0]);
    tecla("ArrowRight");
    expect(document.activeElement).toBe(l[1]);
    tecla("ArrowLeft");
    expect(document.activeElement).toBe(l[0]);
    desmontar();
  });

  it("with aoLado, ← → and Tab switch tabs instead of moving the focus (Tab does not reach the game)", () => {
    const lados: number[] = [];
    const jogo = vi.fn();
    addEventListener("keydown", jogo);
    const { div, desmontar } = montar(<Tela titulo="Abas" aoLado={(d) => lados.push(d)}><button data-nav>a</button><button data-nav>b</button></Tela>);
    tecla("ArrowRight");
    tecla("ArrowLeft");
    tecla("Tab");
    tecla("Tab", { shiftKey: true });
    expect(lados).toEqual([1, -1, 1, -1]);
    expect(document.activeElement).toBe(navs(div)[0]);
    expect(jogo).not.toHaveBeenCalled();
    tecla("ArrowDown");
    expect(document.activeElement).toBe(navs(div)[1]);
    removeEventListener("keydown", jogo);
    desmontar();
  });

  it("up/down jump a row inside a grid and leave it at the edges", () => {
    const div = document.createElement("div");
    div.innerHTML = `<button data-nav></button><div data-cols="3">${"<button data-nav></button>".repeat(5)}</div><button data-nav></button>`;
    const l = navs(div);
    expect(mover(l, 1, "baixo")).toBe(4);
    expect(mover(l, 3, "baixo")).toBe(5);
    expect(mover(l, 4, "baixo")).toBe(6);
    expect(mover(l, 2, "cima")).toBe(0);
    expect(mover(l, 5, "cima")).toBe(2);
  });
});
