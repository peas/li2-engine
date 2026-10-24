/**
 * What the loader reads from a game folder (`Conteudo`) and what the page draws (`Grafo`). Everything is plain data
 * (JSON-serialisable): the loader runs in Node (Vite plugin, scripts, tests) and the page only receives the result.
 */

export type TipoNo = "missao" | "pessoa" | "lugar" | "item" | "receita" | "dialogo" | "poder" | "colhivel" | "cutscene" | "regiao" | "mundo";

/** A quest step type the game adds, as its manifest (`jogo.yaml`, `passos_extras`) describes it. */
export interface PassoExtra {
  icone?: string;
  /** `{campo}` placeholders. */
  descricao: string;
  campos?: Record<string, "id" | "lugar" | "pessoa" | "item" | "numero" | "texto">;
}

export interface Fala { quem: string; texto: string }

export interface Dialogo { id: string; personagem: string; retrato: string; falas: Fala[]; arquivo: string }

/** A quest step as written in the YAML; `tipo` decides which other keys exist (ir, falar, coletar, levar, achar, domar...). */
export interface PassoBruto {
  tipo: string;
  texto: string;
  lugar?: string | string[];
  npc?: string;
  item?: string;
  objeto?: string;
  qtd?: number;
  raio?: number;
  dialogo?: string;
  dialogo_falta?: string;
  dialogo_monta?: string;
  dialogos?: Record<string, string>;
  [outra: string]: unknown;
}

export interface Recompensa {
  coracoes?: number;
  moedas?: number;
  itens?: Record<string, number>;
  poder?: string;
  /** "O mundo mudou": permanent changes the quest makes (`{ ovos_por_vez: 3 }`); the game validates the keys. */
  mundo?: Record<string, unknown>;
  [outra: string]: unknown;
}

export interface Missao {
  id: string;
  titulo: string;
  descricao: string;
  quem: string;
  dificuldade: "facil" | "media" | "dificil";
  requer: string[];
  /** A world event (a `mundo` key that became true) that must have happened before the quest is offered. */
  oferecer_apos?: string;
  dialogo_oferta: string;
  dialogo_andamento: string;
  dialogo_feito: string;
  passos: PassoBruto[];
  ao_concluir: Recompensa;
  arquivo: string;
  /** Problems the engine schema found (the quest is still shown). */
  avisos: string[];
}

export interface Pessoa { id: string; nome: string; papel?: string; lugar?: string; dialogo?: string }
export interface Lugar { id: string; descricao?: string; lista?: boolean }
export interface Item { id: string; nome: string; tipo?: string; descricao?: string; coracoes?: number; fome?: number; preco?: number }
export interface Receita { id: string; nome: string; ingredientes: Record<string, number>; resultado: string; descricao?: string }
export interface Poder { id: string; nome: string; descricao?: string; cor?: string }
/** Where something grows (colhiveis.yaml): item, place, how it is drawn and how many. */
export interface Colhivel {
  /** `${item}-${onde}` (unique: a suffix when an item grows twice in one place). */
  id: string;
  item: string;
  onde: string;
  arranjo: string;
  quantos: number | number[];
  semente?: number;
  em?: number[];
  regrow?: number;
}
/** A cutscene (cutscenes/<id>.yaml): its size and, when it has them, the trigger and the ritual (lote 2). */
export interface Cutscene {
  id: string;
  pulavel?: string;
  passos: number;
  cameras: number;
  /** `{ tipo: inicio | lugar | missao | evento, ... }`. */
  gatilho?: { tipo: string; lugar?: string; missao?: string; passo?: string; nome?: string; raio?: number; hora?: number[] };
  ritual?: Record<string, boolean>;
  /** The comment block at the top of the file. */
  descricao?: string;
  arquivo: string;
}
/** A region (regioes.yaml): tried in order for the music; `quando` is any of its conditions. */
export interface Regiao {
  id: string;
  nome: string;
  quando: Record<string, unknown>[];
  padrao?: boolean;
}
export interface Novidade { versao: number; data: string; titulo: string; falas: string[] }
export interface SecaoAjuda { titulo: string; linhas: { tecla?: string; titulo?: string; texto: string }[] }

export interface Conteudo {
  /** `nome` is the folder (file names: dist-<nome>, MISSOES-<nome>.md); `titulo` is what the page shows (jogo.yaml `nome`). */
  jogo: { nome: string; pasta: string; titulo: string };
  missoes: Missao[];
  dialogos: Dialogo[];
  pessoas: Pessoa[];
  lugares: Lugar[];
  itens: Item[];
  receitas: Receita[];
  poderes: Poder[];
  novidades: Novidade[];
  ajuda: SecaoAjuda[];
  colhiveis: Colhivel[];
  cutscenes: Cutscene[];
  regioes: Regiao[];
  /** The game's own step types (jogo.yaml); empty without a manifest. */
  passosExtras: Record<string, PassoExtra>;
  /** Which file answered each kind of content ("missoes" → "src/game/missoes/*.yaml"), for the page and the README. */
  lidos: Record<string, string>;
  /** Files looked for and not found, files that did not parse: shown on the page, never fatal. */
  avisos: string[];
}

export type TipoAresta =
  | "da" | "destrava" | "conversa" | "vai_a" | "fala_com" | "coleta" | "leva" | "leva_para" | "procura_em"
  | "recompensa" | "ensina" | "usa" | "faz" | "mora_em" | "fala" | "colhe" | "colhe_em" | "dispara" | "cobre" | "muda" | "espera";

export interface No {
  /** `${tipo}:${idNoJogo}` so a place and an item may share a name. */
  id: string;
  tipo: TipoNo;
  /** The id as the YAML writes it. */
  chave: string;
  nome: string;
  /** The full content, for the side panel (a Missao, a Dialogo, an Item...). */
  dados: unknown;
  /** Referenced somewhere but defined nowhere we read: drawn dashed, listed in the warnings. */
  desconhecido?: boolean;
}

export interface Aresta {
  id: string;
  de: string;
  para: string;
  tipo: TipoAresta;
  rotulo: string;
  /** Quest id and step index (0-based) when the edge comes from a step; the story mode walks these. */
  missao?: string;
  passo?: number;
  /** The YAML key the edge comes from (`quem`, `npc`, `lugar`, `item`, a game's own field): the editor re-targets it. */
  campo?: string;
}

export interface Grafo {
  jogo: Conteudo["jogo"];
  nos: No[];
  arestas: Aresta[];
  avisos: string[];
  lidos: Record<string, string>;
  passosExtras: Record<string, PassoExtra>;
}
