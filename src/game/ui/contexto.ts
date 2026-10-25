import { createContext, type ComponentChildren } from "preact";
import type { Contextos } from "../../core/contextos";
import type { SaveBase } from "../estado/base";
import type { ResumoMissao } from "../missoes/schema";
import type { Novidade } from "../novidades";
import type { ConteudoAjuda } from "./ajuda";
import type { LeitorStore } from "./hooks";

/** One thing in the backpack, as the game describes it (the engine never reads the game's item catalogue). */
export interface ItemMochila {
  id: string;
  nome: string;
  /** Icon name (hud/icones.ts, registered by the game). */
  icone: string;
  qtd: number;
  /** What it is / does: the line under the grid when focused. */
  descricao: string;
  /** What Enter does with it ("come uma", "cura 1 coração"); none = nothing to do. */
  acao?: string;
  /** A small green line on the card ("+1 ❤"). */
  mais?: string;
}

/**
 * What the screens need from the game, injected by its main (all optional). A game's own screens read their own
 * extra fields (`Deps` is open: cast or extend it).
 */
export interface Deps {
  /** Sound effects ("abrirMenu" when a screen key opens one, the game's screens play their own). Silent when absent. */
  sfx?: { tocar(nome: string): void };
  /** The game's store: the screens re-render when its inventory or quests change. */
  store?: LeitorStore<SaveBase>;
  /** Chips on the right of the titles (coins, day). */
  cabecalho?: () => ComponentChildren;
  /** The quest list (the interpreter builds it: `missoes.resumos()`). */
  missoes?: () => ResumoMissao[];
  /** NPC id → how the quest list names them ("a Dona Rosa"). Default: the id. */
  nomeNpc?: (id: string) => string;
  /** The quests screen when there is none yet ("Fale com o Vovô Bento (E)"). */
  textoVazio?: string;
  /** "Como jogar" content (`criarAjuda(raw, extras)`). */
  ajuda?: ConteudoAjuda;
  /** The backpack. */
  mochila?: {
    itens(): ItemMochila[];
    /** Enter / click on an item with `acao`: true = it worked (the card bumps), false = it shakes. */
    usar(id: string): boolean | void;
    /** Text of an empty backpack. */
    vazio?: string;
  };
  /** The news (newest first: `criarNovidades(raw).NOVIDADES`). */
  novidades?: readonly Novidade[];
  [extra: string]: unknown;
}

export interface Ctx {
  contextos: Contextos;
  deps: Deps;
  fechar(): void;
  /** Swap to another screen (a list that opens a detail and back); absent when a screen is rendered alone. */
  abrir?(nome: string, props?: object): void;
}

export const CtxTelas = createContext<Ctx>(null as unknown as Ctx);
