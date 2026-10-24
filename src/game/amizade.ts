/**
 * Befriending a creature over N visits. Two modes:
 *
 * - `"todos"` (default): each visit is a list of steps done in order (feed it, then pat it), and a visit counts only
 *   when all its steps are done and she walks away (`fecharVisita`).
 * - `"um"`: every step counts by itself, at once, as one encounter (calm it down **or** feed it), each step at most once
 *   per visit, in any order; `visitas` counts encounters and `fecharVisita` (she walked away) only clears the steps so
 *   they count again next visit. Two steps in the same visit = two encounters (the Dragão's rare dragons: the calming
 *   bar, then a food, 3 encounters to tame).
 *
 * Pure rules over a plain state object that the game keeps in its save, read and returned **with the key names the
 * game passes** (the "ready" flag may be called `amiga`, `mansa`...), so an existing save shape stays as it is.
 */
export type EstadoAmizade<P extends string, K extends string = "pronta"> = Record<K, boolean> & { visitas: number } & Record<P, boolean>;

export type ModoAmizade = "todos" | "um";

export interface OpcoesAmizade<P extends string, K extends string> {
  /** The steps of one visit, in order (each a boolean key of the state). */
  passos: readonly P[];
  /** Visits needed (`"todos"`: a visit = every step done, then `fecharVisita`; `"um"`: encounters = steps done). */
  visitas: number;
  /** `"todos"` (default): all steps, in order, make one visit; `"um"`: any one step is an encounter by itself. */
  modo?: ModoAmizade;
  /** Key of the "ready" flag (default "pronta"). */
  chavePronta?: K;
}

export class Amizade<P extends string, K extends string = "pronta"> {
  readonly passos: readonly P[];
  readonly visitas: number;
  readonly chavePronta: K;
  readonly modo: ModoAmizade;

  constructor(o: OpcoesAmizade<P, K>) {
    this.passos = o.passos;
    this.visitas = o.visitas;
    this.chavePronta = (o.chavePronta ?? "pronta") as K;
    this.modo = o.modo ?? "todos";
  }

  /**
   * The next step of this visit; "sair" when the visit's steps are done (walk away to close it); null when ready.
   * In `"um"` mode: the first step not done yet this visit (any of them may be done: `pode`), "sair" when all are.
   */
  proximo(e: EstadoAmizade<P, K>): P | "sair" | null {
    if (e[this.chavePronta]) return null;
    return this.passos.find((p) => !e[p]) ?? "sair";
  }

  /** Would `fazer(e, passo)` count? `"todos"`: only the next step; `"um"`: any step not done yet this visit. */
  pode(e: EstadoAmizade<P, K>, passo: P): boolean {
    if (e[this.chavePronta]) return false;
    return this.modo === "um" ? !e[passo] : this.proximo(e) === passo;
  }

  /**
   * Marks `passo` done (anything that `pode` refuses returns `e` unchanged). In `"um"` mode it is also an encounter:
   * visitas + 1, ready at `visitas`.
   */
  fazer<E extends EstadoAmizade<P, K>>(e: E, passo: P): E {
    if (!this.pode(e, passo)) return e;
    if (this.modo === "todos") return { ...e, [passo]: true };
    const visitas = e.visitas + 1;
    return { ...e, [passo]: true, visitas, [this.chavePronta]: visitas >= this.visitas };
  }

  /**
   * She walked away. `"todos"`: ends a visit only when all its steps are done (visitas + 1, steps cleared, ready at
   * `visitas`; else `e` unchanged). `"um"`: the steps are cleared (they count again next visit) when any was done.
   */
  fecharVisita<E extends EstadoAmizade<P, K>>(e: E): E {
    const limpos = Object.fromEntries(this.passos.map((p) => [p, false]));
    if (this.modo === "um") return this.passos.some((p) => e[p]) ? { ...e, ...limpos } : e;
    if (this.proximo(e) !== "sair") return e;
    const visitas = e.visitas + 1;
    return { ...e, ...limpos, visitas, [this.chavePronta]: visitas >= this.visitas };
  }
}
