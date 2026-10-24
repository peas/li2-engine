import { SeletorComHisterese } from "./histerese";

/**
 * Picks ONE point of interest among candidates (what a head looks at, what a prompt points to) and holds it with
 * hysteresis, so two things at about the same distance never make the choice flicker (the head "turning and turning"
 * a child saw between a sign and a dragon). Pure maths, no scene objects: the caller gives candidates with a score
 * (lower = better, usually the distance; `Infinity` = not eligible right now) and an optional priority.
 *
 * Rules: the current target stays while it is eligible; a challenger replaces it only when it is better by `folga`
 * (score < folga × current score) or has a higher priority, and stays so for `trocarApos` seconds in a row; a target
 * that becomes ineligible is dropped after `perderApos` seconds (a blink of ineligibility does not reset the head, and
 * two changes are never closer than that); with no target, the best eligible candidate is taken at once.
 */
export interface CandidatoAlvo {
  id: string;
  /** Lower is better; Infinity = not eligible (behind, out of reach...). */
  score: number;
  /** Higher wins over score (default 0). */
  prioridade?: number;
}

export interface ParamsSeletor {
  /** The challenger must score below this fraction of the current target's score (0.7 = clearly closer). */
  folga: number;
  /** Seconds the same challenger must stay better before it takes over. */
  trocarApos: number;
  /** Seconds the current target may be ineligible before it is dropped. */
  perderApos: number;
}

export const DEFAULT_SELETOR: ParamsSeletor = { folga: 0.7, trocarApos: 0.4, perderApos: 0.3 };

export class SeletorDeAlvo {
  readonly params: ParamsSeletor;
  /** The challenge (a better candidate must hold for `trocarApos`) is a `SeletorComHisterese` over the ids. */
  private readonly desafio: SeletorComHisterese<string>;
  private perdidoT = 0;

  constructor(params: Partial<ParamsSeletor> = {}) {
    this.params = { ...DEFAULT_SELETOR, ...params };
    this.desafio = new SeletorComHisterese<string>(this.params.trocarApos);
  }

  /** Id of the current target (null = none). */
  get atual(): string | null {
    return this.desafio.atual;
  }

  /** One frame: feed every candidate (eligible or not); returns the id chosen for this frame (or null). */
  update(dt: number, candidatos: readonly CandidatoAlvo[]): string | null {
    const p = this.params;
    this.desafio.dwell = p.trocarApos;
    const atual = this.atual ? candidatos.find((c) => c.id === this.atual) : undefined;
    const atualOk = !!atual && Number.isFinite(atual.score);
    if (atualOk) this.perdidoT = 0;
    else if (this.atual) {
      // lost: hold it for `perderApos` (a blink does not move the head), then let go; never two changes in a row faster than that
      this.perdidoT += dt;
      if (this.perdidoT < p.perderApos) return this.atual;
      this.desafio.limpar();
      this.perdidoT = 0;
    }
    const melhor = this.melhor(candidatos);
    if (!this.atual) {
      // no target: the best eligible one at once (the hysteresis takes its first target immediately)
      this.desafio.limpar();
      if (melhor) this.desafio.escolher(0, melhor.id);
      return this.atual;
    }
    // a challenger: better priority, or clearly better score, for `trocarApos` in a row
    const a = atual!;
    const desafiante = melhor && melhor.id !== a.id && this.ganha(melhor, a) ? melhor.id : a.id;
    return this.desafio.escolher(dt, desafiante);
  }

  /** Forget the current target (a scene change, a teleport). */
  limpar() {
    this.desafio.limpar();
    this.perdidoT = 0;
  }

  private ganha(c: CandidatoAlvo, sobre: CandidatoAlvo) {
    const pc = c.prioridade ?? 0, ps = sobre.prioridade ?? 0;
    if (pc !== ps) return pc > ps;
    return c.score < sobre.score * this.params.folga;
  }

  private melhor(candidatos: readonly CandidatoAlvo[]): CandidatoAlvo | null {
    let best: CandidatoAlvo | null = null;
    for (const c of candidatos) {
      if (!Number.isFinite(c.score)) continue;
      if (!best || (c.prioridade ?? 0) > (best.prioridade ?? 0) || ((c.prioridade ?? 0) === (best.prioridade ?? 0) && c.score < best.score)) best = c;
    }
    return best;
  }
}
