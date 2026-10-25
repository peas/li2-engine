import type GUI from "lil-gui";
import type { Contextos } from "../../core/contextos";
import type { Fala, FimDoDialogo } from "./fala";
import { retrato as retratoPadrao } from "./retratos";
import { cortar, pausaDepois, segmentar, type Segmento } from "./texto";
import type { Voz } from "./voz";

const FADE_MS = 180;
/** Portrait on screen (px); drawn at twice that for 2× screens. */
const RETRATO_PX = 110;

/*
 * Sizes for a child reading from the sofa (polish checklist): text ≥ 46 px at 1080p (4.3vh), at most 38 letters per
 * line (the text column is 38ch of its own font), the line never advances by itself.
 */
const CSS = `
.dlg-box, .dlg-prompt { position: fixed; left: 50%; transform: translateX(-50%); pointer-events: none;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; z-index: 20; }
.dlg-box { bottom: 4vh; max-width: 96vw; box-sizing: border-box; display: flex; gap: 22px; align-items: flex-start;
  padding: 20px 28px 26px 20px; background: rgba(26, 20, 48, .88); border: 3px solid rgba(255, 255, 255, .85);
  border-radius: 22px; box-shadow: 0 6px 24px rgba(0, 0, 0, .35), inset 0 0 0 4px rgba(255, 255, 255, .06);
  opacity: 0; transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease; transform: translate(-50%, 10px); }
.dlg-box.on { opacity: 1; transform: translate(-50%, 0); }
.dlg-face { flex: none; width: ${RETRATO_PX}px; height: ${RETRATO_PX}px; border-radius: 50%; border: 4px solid #fff;
  box-sizing: border-box; overflow: hidden; background: #2a2148; }
.dlg-face canvas { width: 100%; height: 100%; display: block; }
.dlg-body { flex: none; min-width: 0; }
.dlg-name { font-weight: 800; font-size: clamp(18px, 2.8vh, 34px); color: #ffd23f; margin: 0 0 6px; letter-spacing: .02em; }
.dlg-text { font-size: clamp(22px, 4.3vh, 54px); line-height: 1.3; white-space: pre-line; min-height: 2.6em;
  width: min(38ch, calc(96vw - ${RETRATO_PX + 100}px)); overflow-wrap: break-word; }
.dlg-k1 { color: #ffd23f; font-weight: 800; }
.dlg-k2 { color: #8fd8ff; font-weight: 800; }
.dlg-more { position: absolute; right: 18px; bottom: 8px; font-size: clamp(14px, 2vh, 24px); opacity: 0; }
.dlg-box.done .dlg-more { animation: dlg-blink .9s steps(2, start) infinite; }
@keyframes dlg-blink { to { opacity: 1; } }
.dlg-prompt { bottom: calc(4vh + 13.5vh + 70px); padding: 8px 20px; border-radius: 999px; font-size: clamp(18px, 2.6vh, 30px);
  font-weight: 700; background: rgba(26, 20, 48, .8); border: 2px solid rgba(255, 255, 255, .7); opacity: 0;
  transition: opacity 150ms ease; white-space: nowrap; }
.dlg-prompt.on { opacity: 1; }
@media (max-width: 620px) {
  .dlg-box { gap: 12px; padding: 14px 14px 20px 12px; }
  .dlg-face { width: 64px; height: 64px; }
  .dlg-text { width: calc(92vw - 110px); }
}
`;

export interface OpcoesDialogo {
  /** A running conversation is the "dialogo" layer: Esc closes it through the stack. */
  contextos?: Contextos;
  /** Portrait canvas for a key (default: `retratos.ts`, registered drawings or a letter). */
  retrato?: (key: string, size: number) => HTMLCanvasElement;
  /** Each visible letter as it is typed (the game plays a blip with the speaker's own pitch). */
  onLetra?: (quem: string, char: string) => void;
  /** Spoken lines (mp3 or the system voice). None = silent. */
  voz?: Voz;
  /** Portrait size on screen (px, default 110); the canvas is drawn at twice that for 2× screens. */
  retratoPx?: number;
  /** CSS appended after the box's own: a game with another look (smaller text, a fixed width) overrides the rules here. */
  css?: string;
}

/**
 * RPG dialogue box: portrait, name, text typed letter by letter, key words in colour (`*cor 1*`, `_cor 2_`), short
 * pauses after punctuation. Space or a click: the first finishes the line, the second goes to the next one; Esc skips
 * the whole conversation; the line never advances by itself. The box owns its DOM and its listeners; the game only
 * calls `update(dt)` every frame and stops feeding the controls while `active` is true.
 */
export class Dialogo {
  /** `speed` letters per second; pauses in ms after , ; : and after . ! ? (only before a space). */
  readonly params = { speed: 40, pausaVirgula: 120, pausaPonto: 350 };
  readonly voz?: Voz;
  private box: HTMLDivElement;
  private face: HTMLDivElement;
  private name: HTMLDivElement;
  private text: HTMLDivElement;
  private pill: HTMLDivElement;
  private falas: Fala[] = [];
  private index = 0;
  /** The current line split into coloured segments, and its visible letters. */
  private segs: Segmento[] = [];
  private letras = "";
  /** Letters shown of the current line (fractional, grows with dt × speed). */
  private shown = 0;
  /** Seconds still to wait (a punctuation pause). */
  private espera = 0;
  private renderizado = -1;
  private resolve: ((r: FimDoDialogo) => void) | null = null;
  private closing = false;
  private fadeTimer = 0;
  private readonly opcoes: OpcoesDialogo;

  constructor(opcoes: OpcoesDialogo = {}) {
    this.opcoes = opcoes;
    this.voz = opcoes.voz;
    const style = document.createElement("style");
    style.textContent = CSS + (opcoes.css ?? "");
    document.head.appendChild(style);
    this.pill = el("dlg-prompt");
    this.box = el("dlg-box");
    this.face = el("dlg-face");
    this.name = el("dlg-name");
    this.text = el("dlg-text");
    const body = el("dlg-body");
    body.append(this.name, this.text);
    const more = el("dlg-more");
    more.textContent = "▼";
    this.box.append(this.face, body, more);
    this.box.style.display = "none";
    document.body.append(this.pill, this.box);
  }

  get active() {
    return this.resolve !== null;
  }

  /** Is the current line fully typed? */
  get completa() {
    return this.shown >= this.letras.length;
  }

  /** Plays a conversation; resolves when the box has faded out: "fim" after the last line, "pulado" on Esc. */
  play(falas: Fala[]): Promise<FimDoDialogo> {
    if (this.resolve) this.close("pulado", true); // a new conversation replaces a running one
    this.falas = falas;
    this.prompt(null);
    return new Promise((resolve) => {
      if (falas.length === 0) return resolve("fim");
      this.resolve = resolve;
      this.opcoes.contextos?.push("dialogo", () => this.close("pulado"));
      this.box.style.display = "";
      void this.box.offsetWidth; // let the fade-in start from opacity 0
      this.box.classList.add("on");
      addEventListener("keydown", this.onKey, true);
      addEventListener("mousedown", this.onClick, true);
      this.show(0);
    });
  }

  /** The typewriter: call every frame. Letters are revealed one by one so each blips and punctuation can pause. */
  update(dt: number) {
    if (!this.resolve || this.closing || this.completa) return;
    let t = dt;
    if (this.espera > 0) {
      const usado = Math.min(this.espera, t);
      this.espera -= usado;
      t -= usado;
      if (this.espera > 0) return;
    }
    const alvo = Math.min(this.letras.length, this.shown + t * this.params.speed);
    while (Math.floor(this.shown) < Math.floor(alvo)) {
      const i = Math.floor(this.shown);
      const c = this.letras[i];
      this.shown = i + 1;
      if (!/\s/.test(c)) this.opcoes.onLetra?.(this.falas[this.index].quem, c);
      const pausa = pausaDepois(c, this.letras[i + 1], this.params.pausaVirgula, this.params.pausaPonto);
      if (pausa > 0) {
        this.espera = pausa / 1000;
        break;
      }
    }
    if (this.espera <= 0) this.shown = Math.max(this.shown, alvo);
    this.render();
  }

  /** A small hint pill above where the box appears ("E · falar com a Dona Rosa"); null hides it. */
  prompt(text: string | null) {
    if (text === null || this.active) {
      this.pill.classList.remove("on");
      return;
    }
    if (this.pill.textContent !== text) this.pill.textContent = text;
    this.pill.classList.add("on");
  }

  addGui(folder: GUI) {
    folder.add(this.params, "speed", 5, 200, 1).name("letras por segundo");
    folder.add(this.params, "pausaVirgula", 0, 1000, 10).name("pausa na vírgula (ms)");
    folder.add(this.params, "pausaPonto", 0, 1500, 10).name("pausa no ponto (ms)");
  }

  /** Space / click: finish the line, or go to the next one (or end). */
  avancar() {
    if (!this.resolve || this.closing) return;
    if (!this.completa) {
      this.shown = this.letras.length;
      this.espera = 0;
      this.render();
    } else if (this.index + 1 < this.falas.length) this.show(this.index + 1);
    else this.close("fim");
  }

  /** Esc: skip the whole conversation. */
  pular() {
    this.close("pulado");
  }

  private show(i: number) {
    this.index = i;
    this.shown = 0;
    this.espera = 0;
    this.renderizado = -1;
    const f = this.falas[i];
    this.segs = segmentar(f.texto);
    this.letras = this.segs.map((s) => s.texto).join("");
    this.name.textContent = f.quem;
    this.face.replaceChildren((this.opcoes.retrato ?? retratoPadrao)(f.retrato, (this.opcoes.retratoPx ?? RETRATO_PX) * 2));
    this.render();
    this.voz?.speak(f.texto, f.retrato || f.quem);
  }

  private render() {
    const n = Math.floor(this.shown);
    if (n === this.renderizado) return;
    this.renderizado = n;
    this.text.replaceChildren(...cortar(this.segs, n).map((s) => {
      if (!s.cor) return document.createTextNode(s.texto);
      const b = document.createElement("b");
      b.className = `dlg-k${s.cor}`;
      b.textContent = s.texto;
      return b;
    }));
    this.box.classList.toggle("done", n >= this.letras.length);
  }

  /** Fades the box out and resolves; `now` skips the fade (a new conversation took over). */
  private close(result: FimDoDialogo, now = false) {
    const resolve = this.resolve;
    if (!resolve || (this.closing && !now)) return;
    this.closing = true;
    this.opcoes.contextos?.pop("dialogo");
    this.voz?.stop();
    removeEventListener("keydown", this.onKey, true);
    removeEventListener("mousedown", this.onClick, true);
    this.box.classList.remove("on");
    clearTimeout(this.fadeTimer);
    const done = () => {
      this.box.style.display = "none";
      this.box.classList.remove("done");
      this.closing = false;
      this.resolve = null;
      resolve(result);
    };
    if (now) done();
    else this.fadeTimer = window.setTimeout(done, FADE_MS);
  }

  // capture phase + stopImmediatePropagation: the keys that drive the dialogue never reach the game's input
  private onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.avancar();
    } else if (e.code === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.pular();
    }
  };

  private onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element | null)?.closest?.(".lil-gui")) return; // clicks on the settings panel are not "next"
    this.avancar();
  };
}

function el(className: string) {
  const d = document.createElement("div");
  d.className = className;
  return d;
}
