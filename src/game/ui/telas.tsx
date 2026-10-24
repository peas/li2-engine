import { render, type FunctionComponent } from "preact";
import type { Contextos } from "../../core/contextos";
import { TelaAparencia } from "./Aparencia";
import { TelaAjuda } from "./ComoJogar";
import { CtxTelas, type Ctx, type Deps } from "./contexto";
import { CSS } from "./estilo";
import { TelaMissoes } from "./Missoes";
import { TelaMochila } from "./Mochila";
import { TelaNovidades } from "./Novidades";

/**
 * The screens (preact): one root on document.body, one screen at a time, from a registry the game passes
 * (`{ ...TELAS_PADRAO, loja: MinhaLoja }`). Opening pushes the `menu` input layer (Esc, handled by Contextos, closes
 * it; so do B on a gamepad and a click on the backdrop), closing pops it and calls `onFechar(nome)` (the game saves
 * there: a safe moment). `abrir` while another screen is open swaps it (the layer stays pushed).
 */
export interface Telas {
  /** Open `nome` with optional props for its component. */
  abrir(nome: string, props?: object): void;
  fechar(): void;
  /** Open `nome`, or close it when it is the one open. */
  toggle(nome: string): void;
  readonly aberta: string | null;
  onFechar?: (nome: string) => void;
}

/**
 * The engine's generic screens; spread it into the registry and add the game's own. `aparencia` (TelaAparencia) is
 * added by `montarTelas` only when `deps.aparencia` exists (a game without it never gets the screen).
 */
export const TELAS_PADRAO: Record<string, FunctionComponent<any>> = {
  mochila: TelaMochila, missoes: TelaMissoes, ajuda: TelaAjuda, novidades: TelaNovidades,
};

let cssPosto = false;

export function montarTelas(contextos: Contextos, deps: Deps, telas: Record<string, FunctionComponent<any>>): Telas {
  if (!cssPosto) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    cssPosto = true;
  }
  const raiz = document.createElement("div");
  raiz.className = "tl-raiz";
  document.body.appendChild(raiz);

  let aberta: string | null = null;
  if (deps.aparencia && !telas.aparencia) telas = { ...telas, aparencia: TelaAparencia };

  const api: Telas = {
    get aberta() { return aberta; },
    abrir(nome, props) {
      const Comp = telas[nome];
      if (!Comp) throw new Error(`tela "${nome}" não registrada (há: ${Object.keys(telas).join(", ")})`);
      if (!aberta) contextos.push("menu", () => api.fechar());
      aberta = nome;
      render(<CtxTelas.Provider value={ctx}><Comp key={nome} {...(props ?? {})} /></CtxTelas.Provider>, raiz);
    },
    fechar() {
      if (!aberta) return;
      const nome = aberta;
      aberta = null;
      render(null, raiz);
      (document.activeElement as HTMLElement | null)?.blur?.();
      contextos.pop("menu");
      api.onFechar?.(nome);
    },
    toggle(nome) {
      if (aberta === nome) api.fechar();
      else api.abrir(nome);
    },
  };

  const ctx: Ctx = { contextos, deps, fechar: () => api.fechar() };
  return api;
}

/**
 * Screen keys (`{ KeyI: "mochila", KeyM: "missoes", KeyH: "ajuda", Slash: "ajuda" }`): a key opens its screen, closes
 * it when it is the one open, or swaps the open one. Ignored while typing in a text box, on key repeat, and whenever
 * `podeAbrir()` says no (a conversation, a cutscene, sleeping). `aoAbrir` runs when a key opens a screen (a sound).
 * Returns the unsubscribe.
 */
export function ligarTeclas(telas: Telas, mapa: Record<string, string>, podeAbrir: () => boolean, aoAbrir?: (nome: string) => void) {
  const onKey = (e: KeyboardEvent) => {
    const tela = mapa[e.code];
    if (!tela || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!telas.aberta && !podeAbrir()) return;
    e.preventDefault();
    if (telas.aberta !== tela) aoAbrir?.(tela);
    telas.toggle(tela);
  };
  addEventListener("keydown", onKey);
  return () => removeEventListener("keydown", onKey);
}
