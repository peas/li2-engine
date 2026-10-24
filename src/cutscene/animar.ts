/**
 * Interpolation on the scene clock (research `cutscenes-threejs.md` §7): `animar` calls `upd(ease(k))` every tick of
 * the clock the game drives (its sim time: pausing the game freezes the scene) and, when the scene's `corte` is
 * aborted (skip), jumps straight to k = 1 and resolves. Everything timed in a cutscene goes through here, so skipping
 * always lands on the final values.
 */

/** The scene clock: `agora()` in seconds, `on`/`off` = called once per frame after the clock advanced. */
export interface Relogio {
  agora(): number;
  on(f: () => void): void;
  off(f: () => void): void;
}

/** The part of the scene context `animar` needs. */
export interface CtxTempo {
  relogio: Relogio;
  corte: AbortController;
}

export type EaseFn = (t: number) => number;
export type NomeEase = "linear" | "suave" | "entra" | "sai" | "back-out";

const C1 = 1.70158;
export const EASES: Record<NomeEase, EaseFn> = {
  linear: (t) => t,
  /** ease-in-out cubic */
  suave: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  entra: (t) => t * t * t,
  sai: (t) => 1 - (1 - t) ** 3,
  /** overshoots a little and comes back (a sudden "sit up") */
  "back-out": (t) => 1 + (C1 + 1) * (t - 1) ** 3 + C1 * (t - 1) ** 2,
};

export const ease = (nome: NomeEase | string | undefined): EaseFn => EASES[(nome ?? "suave") as NomeEase] ?? EASES.suave;

/** Interpolates k 0 → 1 over `dur` seconds of the scene clock; abort (skip) jumps to k = 1. */
export function animar(c: CtxTempo, dur: number, e: EaseFn | NomeEase, upd: (k: number) => void): Promise<void> {
  const f = typeof e === "function" ? e : ease(e);
  return new Promise<void>((ok) => {
    let feito = false;
    const t0 = c.relogio.agora();
    const sinal = c.corte.signal;
    const acabar = () => {
      if (feito) return;
      feito = true;
      c.relogio.off(tick);
      sinal.removeEventListener("abort", acabar);
      upd(1);
      ok();
    };
    const tick = () => {
      const t = (c.relogio.agora() - t0) / dur;
      if (t >= 1) acabar();
      else upd(f(Math.max(0, t)));
    };
    if (dur <= 0 || sinal.aborted) return acabar();
    sinal.addEventListener("abort", acabar);
    c.relogio.on(tick);
  });
}

/** Waits `s` seconds of the scene clock (abort = done now). */
export const esperar = (c: CtxTempo, s: number) => animar(c, s, EASES.linear, () => {});

/** Resolves when `p` resolves or the scene is aborted, whichever comes first. */
export function ateAbortar(c: CtxTempo, p: Promise<unknown>): Promise<void> {
  const sinal = c.corte.signal;
  if (sinal.aborted) return Promise.resolve();
  return new Promise<void>((ok) => {
    const fim = () => { sinal.removeEventListener("abort", fim); ok(); };
    sinal.addEventListener("abort", fim);
    p.then(fim, (e) => { console.error(e); fim(); });
  });
}
