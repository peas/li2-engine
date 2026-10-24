import type GUI from "lil-gui";
import { ZZFX } from "zzfx";

/**
 * Short cosy sound effects with ZzFX. Each sound is a ZzFX parameter list (volume, randomness, frequency, attack,
 * sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
 * bitCrush, delay, sustainVolume, decay, tremolo) or a short sequence of them. Soft shapes (0 sine / 1 triangle), short
 * envelopes, little noise: nothing harsh.
 *
 * The engine plays; the game decides when (it subscribes its own events and calls `tocar`). zzfx creates its
 * AudioContext (suspended) when the module loads; `start()`, called from the first user gesture, resumes it. Before
 * that, `tocar` is silent and nothing throws.
 */
export type SomParams = (number | undefined)[];
/** One sound: a ZzFX parameter list, or a sequence of them with a delay (ms) each. */
export type Som = SomParams | { seq: [atrasoMs: number, p: SomParams][] };

/** Surfaces with their own footsteps (`passo-<superficie>-<1..4>`). */
export type Superficie = "grama" | "areia" | "pedra";

/** Four slightly different steps on a surface, so walking does not sound like a metronome. */
const passos = (s: Superficie, freqs: number[], p: (f: number) => SomParams) =>
  Object.fromEntries(freqs.map((f, i) => [`passo-${s}-${i + 1}`, p(f)])) as Record<string, SomParams>;

/**
 * Generic sounds every game can use (the first eight come from the first game; the rest were designed for the second
 * and are still to be tuned by ear). A game spreads them into its own table: `new Sfx({ ...SONS_BASE, ...meus })`.
 */
export const SONS_BASE: Record<string, Som> = {
  pegar: [0.5, 0.05, 620, 0, 0.01, 0.08, 0, 1, 18, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.02],
  comer: [0.7, 0.1, 190, 0, 0.02, 0.05, 1, 1.5, -12, 0, 0, 0, 0.08, 0.2, 0, 0, 0, 0.7, 0.02],
  abrirMenu: [0.3, 0, 880, 0, 0.01, 0.04, 1, 1, 0, 0, 330, 0.02],
  fecharMenu: [0.3, 0, 1210, 0, 0.01, 0.04, 1, 1, 0, 0, -330, 0.02],
  missao: [0.5, 0, 659, 0.01, 0.15, 0.5, 1, 1, 0, 0, 221, 0.14, 0, 0, 0, 0, 0.1, 0.7, 0.1],
  dormir: [0.45, 0, 520, 0.08, 0.3, 0.7, 0, 1, -1.5, 0, 0, 0, 0, 0, 0, 0, 0.12, 0.6, 0.2, 0.15],
  acordar: [0.45, 0, 392, 0.06, 0.2, 0.45, 0, 1, 1.5, 0, 131, 0.18, 0, 0, 0, 0, 0.1, 0.7, 0.1],
  /** A soft rising boop. */
  pulo: [0.35, 0.05, 260, 0.01, 0.04, 0.12, 0, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02],
  /** A low muffled thud. */
  pouso: [0.4, 0.1, 110, 0, 0.03, 0.12, 0, 2, -6, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.6, 0.04],
  // footsteps: very quiet; grass rustles, sand is softer and lower, stone a small dry click
  ...passos("grama", [300, 340, 280, 360], (f) => [0.1, 0.3, f, 0, 0.01, 0.04, 0, 1, -20, 0, 0, 0, 0, 2.5, 0, 0, 0, 0.5, 0.02]),
  ...passos("areia", [190, 210, 175, 225], (f) => [0.09, 0.3, f, 0.005, 0.02, 0.06, 0, 1, -10, 0, 0, 0, 0, 3, 0, 0, 0, 0.5, 0.03]),
  ...passos("pedra", [520, 580, 480, 610], (f) => [0.12, 0.1, f, 0, 0.005, 0.03, 1, 1, -30, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.6, 0.01]),
  /** The float goes in the water: a falling "bloop" and a tiny high drop after it. */
  pescar: { seq: [[0, [0.4, 0.05, 520, 0, 0.03, 0.15, 0, 1, -25, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02]], [120, [0.2, 0.1, 1400, 0, 0.01, 0.06, 0, 1, -40, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.01]]] },
  /** Far thunder: a long low rumble, never a crack. */
  trovao: [0.5, 0.2, 40, 0.15, 0.6, 1.8, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0.2, 0.5, 0.3, 0.4],
  /** A wave washing the beach. */
  onda: [0.25, 0.1, 140, 0.6, 0.4, 1.2, 4, 1, -0.3, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0.3],
  /** Knock on wood (a door, a chest, chopping). */
  madeira: [0.35, 0.05, 330, 0, 0.01, 0.08, 1, 2, -12, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.6, 0.01],
  /** A soft bonk (bumped into something, a push): no pain. */
  pancada: [0.45, 0.05, 160, 0, 0.03, 0.15, 0, 1.5, -10, 0, 0, 0, 0, 0.4, 0, 0, 0, 0.7, 0.05],
  /** A breath (tired, out of the water, waking up). */
  respiracao: [0.12, 0.1, 600, 0.2, 0.15, 0.35, 4, 1, -1, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.4, 0.2],
};

/** Name of the footstep `i` (any integer: it cycles 1..4) on `superficie`. */
export const passo = (superficie: Superficie, i: number) => `passo-${superficie}-${(((i % 4) + 4) % 4) + 1}`;

export interface SfxParams {
  enabled: boolean;
  volume: number;
}

export class Sfx {
  readonly params: SfxParams = { enabled: true, volume: 0.35 };
  private z = ZZFX;
  private pronto = false;

  /** `sons` = the game's table (usually `{ ...SONS_BASE, ...its own }`). */
  constructor(readonly sons: Record<string, Som> = SONS_BASE) {}

  /** Call from the first user gesture: resumes zzfx's AudioContext. Sounds play only after this. */
  start() {
    this.pronto = true;
    try {
      if (this.z.audioContext.state === "suspended") void this.z.audioContext.resume();
    } catch { /* no audio */ }
  }

  /** Plays a named sound; unknown names and calls before `start()` are silently ignored. */
  tocar(nome: string) {
    const som = this.sons[nome];
    const z = this.z;
    if (!som || !this.pronto || !this.params.enabled || this.params.volume <= 0) return;
    try {
      z.volume = this.params.volume;
      if (Array.isArray(som)) z.play(...som);
      else for (const [ms, p] of som.seq) window.setTimeout(() => { try { z.play(...p); } catch { /* ignore */ } }, ms);
    } catch {
      // audio blocked or not available
    }
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("efeitos sonoros");
    folder.add(this.params, "volume", 0, 1, 0.05).name("volume dos efeitos");
  }
}
