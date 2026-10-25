import type GUI from "lil-gui";
import { audioUrl } from "./base";
import type { MusicParams } from "./music";

export interface FaixaDeMusica {
  /** File under `audioUrl` (or an absolute URL). A replaced track needs a NEW file name (long cache). */
  arquivo: string;
  /** Shown in the debug panel and in `state`. */
  titulo?: string;
}

export interface OpcoesMusicaPorLugar {
  faixas: Record<string, FaixaDeMusica>;
  /** Crossfade between two tracks, and the fade-in of the first one (s). Default 3. */
  crossfade?: number;
  /** Start enabled? Default false (a loop that never stops gets in the way; the panel or a setting turns it on). */
  enabled?: boolean;
  volume?: number;
}

/** Time constant for volume changes and the enable toggle (s). */
const RAMP = 0.3;

/** A track among `servem` (the ones that fit the place), never `ultima` when there is another one. `rand` in [0, 1). */
export function escolherFaixa(servem: readonly string[], ultima?: string, rand: () => number = Math.random): string {
  const outras = servem.filter((f) => f !== ultima);
  const lista = outras.length ? outras : servem;
  return lista[Math.min(lista.length - 1, Math.floor(rand() * lista.length))];
}

/** One of the two players: a streamed <audio> routed through its own gain. */
interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  faixa?: string;
  /** Context time when its fade-out ends (then it is paused); Infinity while it is the one playing. */
  fimFade: number;
}

/**
 * Background music as a playlist per place (the first game's music, 22/10/2026: "música repetitiva"). The game says,
 * every frame, where the player is (`lugar`, any key: a region, a region and the time of day...) and which tracks fit
 * there (`servem`); this plays. Tracks are STREAMED by two <audio> elements (MediaElementAudioSourceNode into the shared
 * AudioContext), so only the playing track and the incoming one are in memory, not every decoded track. A track plays
 * once: near its end the next one that fits comes in (never the same one twice in a row when there is another). A
 * change of place swaps the track only when the current one does not fit the new place, with a crossfade.
 * `start()` (first gesture) only gets the context; nothing is fetched or played until `params.enabled`. Disabling ramps
 * the master to 0 and then pauses the players. Silent without WebAudio. Hysteresis on the place is the game's
 * (`SeletorComHisterese`), so walking along a border does not swap the music back and forth.
 *
 * `Music` (music.ts) is the other model: every track looped and decoded, crossfaded by name; good for a few short loops.
 */
export class MusicaPorLugar {
  readonly params: MusicParams;
  private ctx?: AudioContext;
  private master?: GainNode;
  private decks?: [Deck, Deck];
  /** Index of the deck that is playing (the other one is fading out or idle). */
  private cur = 0;
  /** The place the current track was chosen for. */
  private aplicado?: string;
  private lugar?: string;
  private trocas = 0;
  private error?: string;
  private readonly cross: number;
  private readonly gui = { tocando: "—" };

  constructor(readonly opcoes: OpcoesMusicaPorLugar) {
    this.cross = opcoes.crossfade ?? 3;
    this.params = { enabled: opcoes.enabled ?? false, volume: opcoes.volume ?? 0.35 };
  }

  setContext(ctx: AudioContext) {
    if (!this.ctx) this.ctx = ctx;
  }

  start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC() as AudioContext;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    } catch (e) {
      this.error = String(e);
    }
  }

  /** The graph, built the first time the music is enabled (so a player who never turns it on downloads nothing). */
  private montar(ctx: AudioContext): [Deck, Deck] {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const deck = (): Deck => {
      const el = new Audio();
      el.crossOrigin = "anonymous"; // audio served from a bucket: without CORS the source would be muted
      el.preload = "auto";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain);
      gain.connect(master);
      el.addEventListener("error", () => { this.error = `${el.src}: media error ${el.error?.code}`; });
      return { el, gain, fimFade: 0 };
    };
    this.master = master;
    return (this.decks = [deck(), deck()]);
  }

  private url(faixa: string) {
    const f = this.opcoes.faixas[faixa].arquivo;
    return /^(https?:)?\/\//.test(f) || f.startsWith("/") ? f : audioUrl(f);
  }

  /** Crossfade from the current deck to `faixa` on the other one. */
  private tocar(faixa: string, t: number) {
    const decks = this.decks!;
    const sai = decks[this.cur];
    this.cur = 1 - this.cur;
    const entra = decks[this.cur];
    entra.faixa = faixa;
    entra.fimFade = Infinity;
    entra.el.src = this.url(faixa);
    entra.el.play().catch((e) => { this.error = String(e); });
    this.rampa(entra.gain, 1, t);
    if (sai.faixa) {
      this.rampa(sai.gain, 0, t);
      sai.fimFade = t + this.cross;
    }
    this.aplicado = this.lugar;
    this.trocas++;
    this.gui.tocando = `${this.opcoes.faixas[faixa].titulo ?? faixa} (${this.lugar})`;
  }

  /** Per frame: `lugar` = where the player is now (after the game's hysteresis), `servem` = the tracks that fit there. */
  update(_dt: number, lugar: string, servem: readonly string[]) {
    this.lugar = lugar;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!this.params.enabled) {
      if (!this.master || !this.decks) return;
      this.master.gain.setTargetAtTime(0, t, RAMP);
      if (this.master.gain.value < 0.002) for (const d of this.decks) if (!d.el.paused) d.el.pause();
      return;
    }
    const decks = this.decks ?? this.montar(ctx);
    this.master!.gain.setTargetAtTime(this.params.volume, t, RAMP);
    for (const d of decks) if (d.fimFade <= t && d.faixa && !d.el.paused) d.el.pause();
    const atual = decks[this.cur];
    if (!atual.faixa) {
      this.tocar(escolherFaixa(servem), t);
    } else if (this.aplicado !== lugar && !servem.includes(atual.faixa)) {
      this.tocar(escolherFaixa(servem, atual.faixa), t);
    } else if (atual.el.ended || (atual.el.duration - atual.el.currentTime < this.cross && !atual.el.paused)) {
      this.tocar(escolherFaixa(servem, atual.faixa), t); // the track is ending: the next one that fits comes in
    } else {
      this.aplicado = lugar; // the track also fits the new place: keep it
      if (atual.el.paused) atual.el.play().catch((e) => { this.error = String(e); }); // enabled again
    }
  }

  /** Current values, for tests and the console. */
  get state() {
    if (!this.ctx) return null;
    const deck = (d: Deck) => ({ faixa: d.faixa ?? null, gain: d.gain.gain.value, tempo: d.el.currentTime, tocando: !d.el.paused });
    const atual = this.decks?.[this.cur];
    return {
      context: this.ctx.state,
      enabled: this.params.enabled,
      lugar: this.lugar ?? null,
      faixa: atual?.faixa ?? null,
      titulo: atual?.faixa ? (this.opcoes.faixas[atual.faixa].titulo ?? atual.faixa) : null,
      volume: this.master?.gain.value ?? 0,
      trocas: this.trocas,
      decks: this.decks?.map(deck) ?? [],
      error: this.error,
    };
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("música");
    folder.add(this.params, "volume", 0, 0.6, 0.05).name("volume da música");
    folder.add(this.gui, "tocando").name("tocando").listen().disable();
  }

  /** Linear ramp of a gain from where it is to `alvo` in `crossfade` seconds. */
  private rampa(g: GainNode, alvo: number, t: number) {
    const v = g.gain.value;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(alvo, t + this.cross);
  }
}
