/**
 * Holds a choice against flicker at a border (the music of a region, the thing a head looks at): the first call takes
 * the target at once; after that, a different candidate must stay the target for `dwell` seconds in a row before it
 * replaces the current one, and switching candidate restarts the count. Pure, generic over the kind of choice.
 */
export class SeletorComHisterese<T> {
  /** The held choice (null before the first call or after `limpar`). */
  get atual(): T | null {
    return this._atual;
  }
  private _atual: T | null = null;
  private candidato: T | null = null;
  private tempo = 0;

  /** `dwell` may be changed at any time (seconds a candidate must hold). */
  constructor(public dwell: number) {}

  /** One step with this frame's target; returns the choice to use now. */
  escolher(dt: number, alvo: T): T {
    if (this._atual === null || alvo === this._atual) {
      this._atual = alvo;
      this.candidato = null;
      this.tempo = 0;
      return alvo;
    }
    if (alvo !== this.candidato) {
      this.candidato = alvo;
      this.tempo = 0;
    }
    this.tempo += dt;
    if (this.tempo >= this.dwell) {
      this._atual = alvo;
      this.candidato = null;
      this.tempo = 0;
    }
    return this._atual;
  }

  /** Forget the choice (the next call takes its target at once). */
  limpar() {
    this._atual = null;
    this.candidato = null;
    this.tempo = 0;
  }
}
