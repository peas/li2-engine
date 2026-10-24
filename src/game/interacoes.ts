/**
 * What E does right here (the Dragão had it as a long if/else in its main): every system registers a source that
 * says what it offers at the player's position (talk, pick, sleep, cook, fish, ride...), with a priority; the highest
 * wins and its text goes on the prompt pill. Press E runs it; an action with `segurar` (seconds) needs E held that
 * long: the text shows the dots filling (●●○○○) and an optional bar fills, and it fires once when complete (E must be
 * released before it can fire again).
 */
export interface Interacao {
  /** On the pill: "E · falar com a vizinha". */
  texto: string;
  /** Higher wins (ties: the first registered). */
  prioridade: number;
  run(): void;
  /** Hold E this many seconds (fishing). */
  segurar?: number;
  /** Label of the progress bar while holding ("pescando"). */
  barra?: string;
  /** Stable key (default: `texto`): holding resets when the offered action changes. */
  id?: string;
}

export type FonteInteracao = () => Interacao | null;

/** The bar shown while holding (the engine's `BarraAcao` fits). */
export interface BarraProgresso {
  mostrar(label: string, k: number): void;
  esconder(): void;
}

const PONTOS = 5;
/** ●●○○○ for `k` in 0..1. */
export const pontos = (k: number) => {
  const n = Math.max(0, Math.min(PONTOS, Math.floor(k * PONTOS + 1e-9)));
  return "●".repeat(n) + "○".repeat(PONTOS - n);
};

export class Interacoes {
  private fontes: FonteInteracao[] = [];
  private escolhida: Interacao | null = null;
  private segurado = 0;
  private chave = "";
  /** After a hold fired, E must be released before another one starts. */
  private esperaSoltar = false;

  constructor(private readonly barra?: BarraProgresso) {}

  /** Adds a source; returns the function that removes it. */
  registrar(fonte: FonteInteracao): () => void {
    this.fontes.push(fonte);
    return () => { this.fontes = this.fontes.filter((f) => f !== fonte); };
  }

  /** The action E would do now (as of the last `update`). */
  atual(): Interacao | null {
    return this.escolhida;
  }

  /** 0..1 while holding a `segurar` action. */
  get progresso(): number {
    const s = this.escolhida?.segurar;
    return s ? Math.min(1, this.segurado / s) : 0;
  }

  /** The pill text: the action's text, with the dots when it is held. Null = nothing to do here. */
  texto(): string | null {
    const a = this.escolhida;
    if (!a) return null;
    return a.segurar && this.segurado > 0 ? `${a.texto} ${pontos(this.progresso)}` : a.texto;
  }

  /**
   * Every simulation step: asks the sources, picks the best, and runs it on `apertouE` (pressed this step) or after
   * holding `segurandoE` for its `segurar` seconds. Pass both false while a dialogue, menu or cutscene is on.
   */
  update(dt: number, segurandoE: boolean, apertouE: boolean) {
    let melhor: Interacao | null = null;
    for (const f of this.fontes) {
      const i = f();
      if (i && (!melhor || i.prioridade > melhor.prioridade)) melhor = i;
    }
    const chave = melhor ? (melhor.id ?? melhor.texto) : "";
    if (chave !== this.chave) {
      this.chave = chave;
      this.segurado = 0;
    }
    this.escolhida = melhor;
    if (!segurandoE) this.esperaSoltar = false;

    if (!melhor) return this.barra?.esconder();
    if (!melhor.segurar) {
      this.barra?.esconder();
      if (apertouE) melhor.run();
      return;
    }
    if (!segurandoE || this.esperaSoltar) {
      this.segurado = 0;
      this.barra?.esconder();
      return;
    }
    this.segurado += dt;
    if (melhor.barra) this.barra?.mostrar(melhor.barra, this.progresso);
    if (this.segurado >= melhor.segurar) {
      this.segurado = 0;
      this.esperaSoltar = true;
      this.barra?.esconder();
      melhor.run();
    }
  }
}
