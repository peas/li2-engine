import type GUI from "lil-gui";
import { audioUrl } from "./base";

export interface MusicParams {
  enabled: boolean;
  volume: number;
}

export interface MusicOptions {
  /** Track name → file under `audioUrl` (or an absolute URL). A replaced track needs a NEW file name (long cache). */
  faixas: Record<string, string>;
  /** Crossfade between tracks (s, ~95 % of the way). Default 3. */
  crossfade?: number;
  /** Fade-in after the buffers load (s). Default 4. */
  fadeIn?: number;
  /** Start enabled? Default false (in the first game the loop got in the way; the panel turns it on). */
  enabled?: boolean;
  volume?: number;
}

/** Time constant for volume changes and the enable toggle (s). */
const RAMP = 0.3;

/**
 * Background music: looped tracks that all play all the time, only their gains change (crossfade by name).
 * `start()` from a user gesture creates the AudioContext (or uses the one given by `setContext`), fetches and decodes
 * every track and fades in. Disabling ramps the master to 0 and leaves everything running (no teardown, and the context
 * is never suspended here because it may be shared). A missing file only silences the music. Silent without WebAudio.
 */
export class Music {
  readonly params: MusicParams;
  private readonly faixas: Record<string, string>;
  private readonly cross: number;
  private readonly fadeIn: number;
  private ctx?: AudioContext;
  private master?: GainNode;
  private gains?: Record<string, GainNode>;
  private faixa: string;
  private loaded = false;
  private error?: string;
  private starting = false;
  /** Context time when the fade-in ends; until then `update` doesn't touch the master. */
  private fadeEnd = Infinity;

  constructor(opts: MusicOptions) {
    this.faixas = opts.faixas;
    this.cross = (opts.crossfade ?? 3) / 3; // setTargetAtTime reaches ~95 % in 3 τ
    this.fadeIn = opts.fadeIn ?? 4;
    this.params = { enabled: opts.enabled ?? false, volume: opts.volume ?? 0.35 };
    this.faixa = Object.keys(opts.faixas)[0] ?? "";
  }

  setContext(ctx: AudioContext) {
    if (!this.ctx) this.ctx = ctx;
  }

  setVolume(volume: number) {
    this.params.volume = Math.max(0, volume);
  }

  start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC() as AudioContext;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      if (!this.starting) {
        this.starting = true;
        void this.load(this.ctx);
      }
    } catch (e) {
      this.error = String(e);
    }
  }

  private async load(ctx: AudioContext) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const gains: Record<string, GainNode> = {};
    for (const nome of Object.keys(this.faixas)) {
      gains[nome] = ctx.createGain();
      gains[nome].gain.value = nome === this.faixa ? 1 : 0;
      gains[nome].connect(master);
    }
    Object.assign(this, { master, gains });
    try {
      const buffers = await Promise.all(
        Object.entries(this.faixas).map(async ([nome, file]) => {
          const url = /^(https?:)?\/\//.test(file) || file.startsWith("/") ? file : audioUrl(file);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
          return [nome, await ctx.decodeAudioData(await res.arrayBuffer())] as const;
        }),
      );
      for (const [nome, buffer] of buffers) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gains[nome]);
        src.start();
      }
      this.loaded = true;
      const t = ctx.currentTime;
      master.gain.setValueAtTime(0, t);
      master.gain.linearRampToValueAtTime(this.params.enabled ? this.params.volume : 0, t + this.fadeIn);
      this.fadeEnd = t + this.fadeIn;
    } catch (e) {
      this.error = String(e); // music missing: the game goes on without it
    }
  }

  /** Per frame: `faixa` = the track that should be playing (the game decides by place, time of day, danger). */
  update(_dt: number, faixa: string) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.gains || !this.loaded) return;
    const t = ctx.currentTime;
    if (faixa !== this.faixa && faixa in this.gains) {
      this.faixa = faixa;
      for (const [nome, g] of Object.entries(this.gains)) g.gain.setTargetAtTime(nome === faixa ? 1 : 0, t, this.cross);
    }
    if (!this.params.enabled) {
      if (this.fadeEnd > t) {
        // a toggle during the fade-in cancels the ramp, holding the current value
        const v = this.master.gain.value;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(v, t);
        this.fadeEnd = 0;
      }
      this.master.gain.setTargetAtTime(0, t, RAMP);
    } else if (t >= this.fadeEnd) {
      this.master.gain.setTargetAtTime(this.params.volume, t, RAMP);
    }
  }

  /** Current values, for tests and the console. */
  get state() {
    return this.ctx
      ? {
          context: this.ctx.state,
          playing: this.faixa,
          volume: this.master?.gain.value ?? 0,
          loaded: this.loaded,
          gains: Object.fromEntries(Object.entries(this.gains ?? {}).map(([n, g]) => [n, g.gain.value])),
          error: this.error,
        }
      : null;
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("música");
    folder.add(this.params, "volume", 0, 0.6, 0.05).name("volume da música");
  }
}
