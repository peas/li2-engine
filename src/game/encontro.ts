/**
 * A visit to a wild creature that is not a friend yet (the Dragão's rare dragons: "quanto mais você aperta, mais você
 * doma"):
 *
 *   longe ──(she comes within `rugeA` m)──▶ arisco: it roars and steps back `recua` m (the game moves it)
 *   arisco ──(she stands within `barraA` m)──▶ agitado: the bar shows; each tap of E adds `toque`, the bar leaks
 *            `decai` per second
 *   agitado ──(bar full)──▶ calmo: the encounter counts (the game's `Amizade`, mode "um"); now she can also feed it
 *            (one food per visit: `comeu`)
 *   any ──(she goes `longeA` m away)──▶ longe again (the bar, the calm and the food reset)
 *
 * Pure numbers, distances **in metres**: a game that thinks in body lengths passes `corpo × n` (the Dragão builds it
 * with its numbers × the dragon's length). The game draws the bar (`barra`, `mostraBarra`) and moves the creature.
 */
export interface ParamsEncontro {
  /** It roars and steps back when she first comes within this many metres. */
  rugeA: number;
  /** Metres it steps back at the roar (the game moves it). */
  recua: number;
  /** The bar shows (and E taps count) within this many metres. */
  barraA: number;
  /** Each tap of E fills this much (0..1). */
  toque: number;
  /** Without taps the bar leaks this much per second. */
  decai: number;
  /** The visit ends (everything resets) when she goes this many metres away. */
  longeA: number;
}

export type FaseEncontro = "longe" | "arisco" | "agitado" | "calmo";

export class Encontro {
  fase: FaseEncontro = "longe";
  /** 0..1, meaningful while `agitado`. */
  barra = 0;
  /** She already fed it this visit (one food per visit counts). */
  comeu = false;

  constructor(readonly params: ParamsEncontro) {}

  /** The bar is on screen. */
  get mostraBarra() {
    return this.fase === "agitado";
  }

  /** Call every step with her distance in metres; returns "rugiu" the moment it gets scared, else null. */
  update(dt: number, dist: number): "rugiu" | null {
    const p = this.params;
    if (this.fase !== "longe" && dist > p.longeA) { this.reset(); return null; }
    if (this.fase === "longe") {
      if (dist >= p.rugeA) return null;
      this.fase = "arisco";
      return "rugiu";
    }
    if (this.fase === "arisco" && dist < p.barraA) this.fase = "agitado";
    if (this.fase === "agitado") this.barra = Math.max(0, this.barra - p.decai * dt);
    return null;
  }

  /** A tap of E while agitated: true when this tap filled the bar (it is calm now). */
  apertar(): boolean {
    if (this.fase !== "agitado") return false;
    this.barra = Math.min(1, this.barra + this.params.toque);
    if (this.barra < 1) return false;
    this.fase = "calmo";
    return true;
  }

  reset() {
    this.fase = "longe";
    this.barra = 0;
    this.comeu = false;
  }
}
