/**
 * A pack's "test" (born in the first game: the child asked for a wolf that comes close, and a claw to send it away).
 * Every `testaMin..testaMax` s while the pack circles the protagonist, one wolf walks up to one body length of them,
 * growls and stays `testaDura` s; if they do nothing and he is still within `mordeA` bodies when the time is up, he
 * bites (the game decides what a bite costs; never a death) and the pack keeps away for `afastaTempo` s. A hit on the
 * testing wolf (`Bichos.cacar`) also sends the pack away. Pure numbers and timers here, so vitest can drive it;
 * `bicho.ts` moves the wolf. Distances are in the protagonist's body lengths (`corpo`, metres, given by the game).
 */
export const LOBO = {
  /** Seconds between two tests while the pack circles the protagonist (min, max). */
  testaMin: 20,
  testaMax: 40,
  /** Seconds the testing wolf stays close before biting or going back. */
  testaDura: 3,
  /** He is "close" (the stay timer runs) within this many bodies, and bites only within `mordeA`. */
  pertoA: 1.3,
  mordeA: 1.0,
  /** If he could not get close in this many seconds (the protagonist got away), he gives up. */
  desisteEm: 8,
  /** If the protagonist gets this many bodies away while he is close, the test is over. */
  longeA: 2.5,
  /** Seconds the pack runs from her after a bite or a claw. */
  afastaTempo: 30,
  /** What a bite costs (the game reads it: energy, hearts...). */
  mordidaEnergia: 10,
  /** Reach of the claw (bodies): the game offers the hit within this distance of a testing wolf. */
  garraAlcance: 1.6,
};
export type LoboParams = typeof LOBO;

/** What the pack shares: when the next test is due, until when it keeps away, who is testing now. */
export class Matilha {
  proximoTeste = -1;
  afastadoAte = -1;
  testador: number | null = null;

  constructor(private params: LoboParams = LOBO) {}

  /** The pack is running from her (after a bite or a claw). */
  afastada(time: number) {
    return time < this.afastadoAte;
  }

  /** Called every frame while at least one wolf circles her: true when a wolf should start testing now. */
  deveTestar(time: number, rand: () => number) {
    if (this.testador !== null || this.afastada(time)) return false;
    if (this.proximoTeste < 0) { this.agendar(time, rand); return false; }
    return time >= this.proximoTeste;
  }

  /** Nobody circles the protagonist: the clock restarts when they do (the first test comes 20-40 s after they arrive). */
  semRonda() {
    if (this.testador === null) this.proximoTeste = -1;
  }

  comecou(indice: number) {
    this.testador = indice;
  }

  terminou(time: number, rand: () => number) {
    this.testador = null;
    this.agendar(time, rand);
  }

  /** A bite or a claw: everyone runs for `afastaTempo` s, and the next test waits until after that. */
  afastar(time: number, rand: () => number) {
    this.testador = null;
    this.afastadoAte = time + this.params.afastaTempo;
    this.agendar(this.afastadoAte, rand);
  }

  private agendar(time: number, rand: () => number) {
    const p = this.params;
    this.proximoTeste = time + p.testaMin + rand() * (p.testaMax - p.testaMin);
  }
}

export type FaseTeste = "indo" | "perto";
export type FimDoTeste = "mordeu" | "voltou";

/** One wolf's test: walk up, stay close for `testaDura` s, then bite or go back. */
export class Teste {
  fase: FaseTeste = "indo";
  /** Seconds since the test began, and seconds spent close to them. */
  t = 0;
  perto = 0;

  constructor(private params: LoboParams = LOBO) {}

  /** `dist` in body lengths of the protagonist. Returns how the test ended, or null while it goes on. */
  update(dt: number, dist: number): FimDoTeste | null {
    const p = this.params;
    this.t += dt;
    if (this.fase === "indo") {
      if (dist < p.pertoA) this.fase = "perto";
      else if (this.t > p.desisteEm) return "voltou";
      return null;
    }
    if (dist > p.longeA) return "voltou";
    this.perto += dt;
    if (this.perto < p.testaDura) return null;
    return dist < p.mordeA ? "mordeu" : "voltou";
  }
}
