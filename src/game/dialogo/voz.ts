import type GUI from "lil-gui";
import { acharArquivo, normalizarTexto, type IndiceDeFalas } from "./arquivos";

/** Pitch/rate per portrait for the system voice; `null` = this character does not speak aloud (thoughts, signs). */
export interface PresetVoz {
  pitch: number;
  rate: number;
}

export interface OpcoesVoz {
  /** Full URL of an audio path ("falas/index.json" → ".../audio/falas/index.json"). Default: `<BASE_URL>audio/<path>`. */
  urlAudio?: (path: string) => string;
  /** Preset of a portrait not in the table. Default pitch 1, rate 1. */
  padrao?: PresetVoz;
  /** System voices that sound decent in pt-BR, best first. Default Luciana, Felipe (macOS). */
  preferidas?: string[];
}

const urlPadrao = (path: string) => `${import.meta.env?.BASE_URL ?? "/"}audio/${path}`;
const AUTO = "(automática)";
/** "arquivo": the pre-rendered mp3 when there is one, else the system voice; "sistema": always Web Speech; "mudo". */
export type ModoDeVoz = "arquivo" | "sistema" | "mudo";
export type OrigemDaVoz = "arquivo" | "sistema" | "nenhuma";
const MODOS: Record<string, ModoDeVoz> = { "arquivos gravados": "arquivo", "voz do sistema": "sistema", mudo: "mudo" };
/** Where gerar-vozes writes the files and the index, under `urlAudio` (public/audio/ or the R2 bucket). */
const PASTA = "falas/";

const isPtBr = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase() === "pt-br";

/**
 * NPC voices. Two sources: the mp3 pre-rendered per line by the game's `scripts/gerar-vozes.mjs` (index in
 * `audio/falas/index.json`, played through an `<audio>` element), and the Web Speech API (`speechSynthesis`,
 * the system's own TTS: no files, no network on macOS) when the line has no file, the file fails, or the panel says
 * "voz do sistema". One line at a time: a new line stops the previous one. `rate` in the GUI speeds both up;
 * `pitch` multiplies the character's preset for the system voice only (the files carry their pitch already).
 * Does nothing when neither source is available (headless browsers have no pt-BR voice; the files still play).
 */
export class Voz {
  readonly params = { modo: "arquivo" as ModoDeVoz, volume: 0.9, rate: 1, pitch: 1, voice: AUTO };
  /** What the last `speak` did (for the console and the browser test scripts). */
  ultima: { origem: OrigemDaVoz; arquivo?: string } = { origem: "nenhuma" };
  private voices: SpeechSynthesisVoice[] = [];
  private voiceCtrl: ReturnType<GUI["add"]> | null = null;
  /** Kept alive until it ends: Chrome may garbage-collect a playing utterance and cut it. */
  private current: SpeechSynthesisUtterance | null = null;
  private audio: HTMLAudioElement | null = null;
  private indice: Promise<IndiceDeFalas | null> | null = null;
  /** Grows at every `speak`: an async step that finds a newer request gives up. */
  private pedido = 0;

  private readonly urlAudio: (path: string) => string;
  private readonly padrao: PresetVoz;
  private readonly preferidas: string[];

  /**
   * `presets`: portrait key (lower case) → pitch/rate, or null for a character who never speaks aloud. The table may be
   * changed while the game runs (a panel switch that lets the protagonist's thoughts be read aloud: `presets.heroi = {...}`).
   */
  constructor(readonly presets: Record<string, PresetVoz | null> = {}, opcoes: OpcoesVoz = {}) {
    this.urlAudio = opcoes.urlAudio ?? urlPadrao;
    this.padrao = opcoes.padrao ?? { pitch: 1, rate: 1 };
    this.preferidas = opcoes.preferidas ?? ["Luciana", "Felipe"];
    if (!this.sistemaDisponivel) return;
    this.loadVoices();
    speechSynthesis.addEventListener("voiceschanged", () => this.loadVoices());
  }

  get sistemaDisponivel(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  }

  /** Kept for callers that only know the old name. */
  get available(): boolean {
    return this.sistemaDisponivel || typeof Audio !== "undefined";
  }

  /** True while a file or the system voice is playing. */
  get tocando(): boolean {
    if (this.audio && !this.audio.paused && !this.audio.ended) return true;
    return this.sistemaDisponivel && speechSynthesis.speaking && this.current !== null;
  }

  speak(texto: string, quem: string) {
    this.stop();
    const id = ++this.pedido;
    if (this.params.modo === "mudo") return;
    const key = quem.toLowerCase();
    const p = key in this.presets ? this.presets[key] : this.padrao;
    if (!p) return;
    if (this.params.modo === "arquivo" && typeof Audio !== "undefined") void this.tocarArquivo(id, texto, key, p);
    else this.falarSistema(texto, p);
  }

  stop() {
    this.pedido++;
    this.ultima = { origem: "nenhuma" };
    if (this.audio) {
      const a = this.audio;
      this.audio = null;
      a.onended = a.onerror = null;
      a.pause();
      a.removeAttribute("src");
    }
    if (!this.sistemaDisponivel) return;
    this.current = null;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  }

  addGui(folder: GUI) {
    const f = folder.addFolder("Vozes dos personagens");
    f.add(this.params, "modo", MODOS).name("vozes").onChange(() => this.stop());
    f.add(this.params, "volume", 0, 1, 0.05).name("volume das vozes");
    f.add(this.params, "rate", 0.5, 1.6, 0.05).name("velocidade da fala");
    f.add(this.params, "pitch", 0.5, 1.5, 0.05).name("tom (voz do sistema)");
    this.voiceCtrl = f.add(this.params, "voice", this.voiceNames()).name("voz do sistema");
  }

  /** The index, fetched once; null when the files were never generated (then everything is the system voice). */
  private carregarIndice(): Promise<IndiceDeFalas | null> {
    this.indice ??= fetch(this.urlAudio(PASTA + "index.json"))
      .then((r) => (r.ok ? (r.json() as Promise<IndiceDeFalas>) : null))
      .catch(() => null);
    return this.indice;
  }

  private async tocarArquivo(id: number, texto: string, key: string, p: PresetVoz) {
    const indice = await this.carregarIndice();
    if (id !== this.pedido) return; // another line (or stop) came while the index loaded
    const arquivo = acharArquivo(indice, key, texto);
    if (!arquivo) return this.falarSistema(texto, p);
    const a = new Audio(this.urlAudio(PASTA + arquivo));
    a.volume = this.params.volume;
    a.playbackRate = clamp(this.params.rate, 0.5, 2);
    const fallback = () => {
      if (this.audio !== a) return;
      this.audio = null;
      this.falarSistema(texto, p);
    };
    a.onerror = fallback;
    a.onended = () => {
      if (this.audio === a) this.audio = null;
    };
    this.audio = a;
    this.ultima = { origem: "arquivo", arquivo };
    try {
      await a.play();
    } catch {
      fallback();
    }
  }

  private falarSistema(texto: string, p: PresetVoz) {
    if (!this.sistemaDisponivel) return;
    // Chrome fills getVoices() asynchronously: a voice object taken before `voiceschanged` is stale and Chrome
    // then falls back to its default (English) voice, reading Portuguese with an English accent. So pick from a
    // fresh list every time, and if the list is still empty, wait once for it (2026-10-18).
    const voice = this.pickVoice();
    if (!voice) {
      if (!this.voices.length) {
        const id = this.pedido;
        const retry = () => {
          speechSynthesis.removeEventListener("voiceschanged", retry);
          if (id === this.pedido && !this.current) this.falarSistema(texto, p);
        };
        speechSynthesis.addEventListener("voiceschanged", retry);
      }
      return;
    }
    const u = new SpeechSynthesisUtterance(normalizarTexto(texto));
    u.lang = voice.lang;
    u.voice = voice;
    u.volume = this.params.volume;
    u.pitch = clamp(p.pitch * this.params.pitch, 0, 2);
    u.rate = clamp(p.rate * this.params.rate, 0.1, 2); // Chrome's network voices go silent above 2
    u.onend = u.onerror = () => {
      if (this.current === u) this.current = null;
    };
    this.current = u;
    this.ultima = { origem: "sistema" };
    speechSynthesis.speak(u);
  }

  private loadVoices() {
    this.voices = speechSynthesis.getVoices().filter(isPtBr);
    this.voiceCtrl = this.voiceCtrl?.options(this.voiceNames()).name("voz do sistema") ?? null;
  }

  private voiceNames() {
    return [AUTO, ...this.voices.map((v) => v.name)];
  }

  /** The chosen voice, else a preferred local one, else any local pt-BR, else any pt-BR (e.g. Chrome's Google voice). */
  private pickVoice(): SpeechSynthesisVoice | null {
    this.voices = speechSynthesis.getVoices().filter(isPtBr);
    const v = this.voices;
    return (
      v.find((x) => x.name === this.params.voice) ??
      this.preferidas.map((n) => v.find((x) => x.localService && x.name.startsWith(n))).find(Boolean) ??
      v.find((x) => x.localService) ??
      v[0] ??
      null
    );
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
