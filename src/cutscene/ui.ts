import { animar, type CtxTempo, type NomeEase } from "./animar";
import { lerp } from "../core/math";

/** Texts of the skip prompt (Portuguese by default; the game may replace them). */
export interface TextosPular {
  segurar: string;
  tocar: string;
  proxima: string;
}
export const TEXTOS_PULAR: TextosPular = {
  segurar: "segure Esc para pular",
  tocar: "Esc para pular",
  proxima: "→ próxima parte",
};

const CSS = `
.cs-raiz { position: fixed; inset: 0; pointer-events: none; z-index: 15; overflow: hidden; --abertura: 1; }
.cs-raiz > div { position: absolute; pointer-events: none; }
.cs-fade { inset: 0; opacity: 0; background: #000; }
.cs-barra { left: 0; right: 0; height: 0; background: #000; }
.cs-barra.cima { top: 0; } .cs-barra.baixo { bottom: 0; }
.cs-palpebra { left: -15%; width: 130%; background: #000; height: calc((1 - var(--abertura)) * 56%); }
.cs-palpebra.cima { top: 0; border-radius: 0 0 50% 50%; }
.cs-palpebra.baixo { bottom: 0; border-radius: 50% 50% 0 0; }
.cs-pular { right: 28px; bottom: 28px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; font-size: 20px;
  text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.cs-aviso { display: flex; align-items: center; gap: 10px; opacity: 0; transition: opacity 200ms ease; }
.cs-aviso.on { opacity: 1; }
.cs-aviso svg { width: 34px; height: 34px; transform: rotate(-90deg); }
.cs-aviso circle { fill: none; stroke-width: 4; }
.cs-aviso .fundo { stroke: rgba(255,255,255,.3); }
.cs-aviso .anel { stroke: #fff; stroke-linecap: round; }
.cs-proxima { opacity: 0; transition: opacity 200ms ease; }
.cs-proxima.on { opacity: .7; }
`;
const R = 14;
const CIRC = 2 * Math.PI * R;

type Prop = "fade" | "letterbox" | "abertura" | "desfoque";

/** What the effects show now (tests and the game can read it). */
export interface EstadoUi {
  /** colour of the fade layer */
  cor: "preto" | "branco";
  /** 0 = clear, 1 = covered */
  fade: number;
  /** 0 = no bars, 1 = bars at 12% */
  letterbox: number;
  /** eyelids: 0 = closed, 1 = open */
  abertura: number;
  /** canvas blur in px */
  desfoque: number;
}

/**
 * Cutscene screen effects in CSS over the canvas (fade, letterbox, eyelids, blur) and the skip prompt. Every effect
 * takes `(valor, dur, ctx)` and runs on the scene clock, so a skip lands it on its final value.
 */
export class UiCena {
  readonly estado: EstadoUi = { cor: "preto", fade: 0, letterbox: 0, abertura: 1, desfoque: 0 };
  private raiz: HTMLDivElement;
  private elFade: HTMLDivElement;
  private barras: HTMLDivElement[];
  private aviso: HTMLDivElement;
  private avisoTexto: HTMLSpanElement;
  private anelEl: SVGCircleElement;
  private proximaEl: HTMLDivElement;
  private seq: Record<Prop, number> = { fade: 0, letterbox: 0, abertura: 0, desfoque: 0 };

  constructor(private canvas: HTMLElement, readonly textos: TextosPular = TEXTOS_PULAR, pai: HTMLElement = document.body) {
    if (!document.getElementById("cs-css")) {
      const st = document.createElement("style");
      st.id = "cs-css";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const div = (cls: string, dentro: HTMLElement) => {
      const d = document.createElement("div");
      d.className = cls;
      dentro.appendChild(d);
      return d;
    };
    this.raiz = div("cs-raiz", pai);
    div("cs-palpebra cima", this.raiz);
    div("cs-palpebra baixo", this.raiz);
    this.barras = [div("cs-barra cima", this.raiz), div("cs-barra baixo", this.raiz)];
    this.elFade = div("cs-fade", this.raiz);
    const pular = div("cs-pular", this.raiz);
    this.proximaEl = div("cs-proxima", pular);
    this.proximaEl.textContent = textos.proxima;
    this.aviso = div("cs-aviso", pular);
    this.avisoTexto = document.createElement("span");
    this.aviso.appendChild(this.avisoTexto);
    this.aviso.insertAdjacentHTML("beforeend",
      `<svg viewBox="0 0 34 34"><circle class="fundo" cx="17" cy="17" r="${R}"/><circle class="anel" cx="17" cy="17" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>`);
    this.anelEl = this.aviso.querySelector(".anel") as SVGCircleElement;
    this.pintar();
  }

  private pintar() {
    const e = this.estado;
    this.elFade.style.background = e.cor === "branco" ? "#fff" : "#000";
    this.elFade.style.opacity = String(e.fade);
    for (const b of this.barras) b.style.height = `${e.letterbox * 12}%`;
    this.raiz.style.setProperty("--abertura", String(e.abertura));
    this.canvas.style.filter = e.desfoque > 0.01 ? `blur(${e.desfoque}px)` : "";
  }

  /** Tweens one property; a newer tween of the same property silences the older one. */
  private tween(prop: Prop, para: number, dur: number, c: CtxTempo, e: NomeEase = "suave") {
    const id = ++this.seq[prop];
    const de = this.estado[prop] as number;
    return animar(c, dur, e, (k) => {
      if (id !== this.seq[prop]) return;
      (this.estado[prop] as number) = lerp(de, para, k);
      this.pintar();
    });
  }

  /** Fade to black, to white or back to the picture (`nada`). */
  fade(para: "preto" | "branco" | "nada", dur: number, c: CtxTempo) {
    if (para !== "nada") {
      if (this.estado.cor !== para && this.estado.fade > 0) this.estado.fade = 0;
      this.estado.cor = para;
    }
    return this.tween("fade", para === "nada" ? 0 : 1, dur, c);
  }

  /** Cinema bars (12% top and bottom): "now it is a film, you are not in control". */
  letterbox(ligar: boolean, dur: number, c: CtxTempo) {
    return this.tween("letterbox", ligar ? 1 : 0, dur, c);
  }

  /** Eyelids: one opening (0 closed, 1 open) or a script of openings in equal times (a waking blink). */
  async palpebras(para: number | number[], dur: number, c: CtxTempo) {
    const alvos = Array.isArray(para) ? para : [para];
    if (!alvos.length) return;
    const passo = dur / alvos.length;
    for (const a of alvos) {
      if (c.corte.signal.aborted) {
        // skipped: straight to the last opening (no ticks left to spend)
        this.seq.abertura++;
        this.estado.abertura = alvos[alvos.length - 1];
        this.pintar();
        return;
      }
      await this.tween("abertura", a, passo, c, "suave");
    }
  }

  /** Canvas blur in px. */
  desfoque(para: number, dur: number, c: CtxTempo) {
    return this.tween("desfoque", para, dur, c);
  }

  /** Skip prompt: text (null hides it). */
  avisoPular(texto: string | null) {
    if (texto) this.avisoTexto.textContent = texto;
    this.aviso.classList.toggle("on", !!texto);
  }

  /** Progress ring of the held Esc (0..1). */
  anel(k: number) {
    this.anelEl.setAttribute("stroke-dashoffset", String(CIRC * (1 - Math.min(Math.max(k, 0), 1))));
  }

  /** "→ próxima parte" hint. */
  proximaParte(on: boolean) {
    this.proximaEl.classList.toggle("on", on);
  }

  get avisoVisivel() {
    return this.aviso.classList.contains("on");
  }

  get proximaVisivel() {
    return this.proximaEl.classList.contains("on");
  }

  /** Back to a clear screen at once (eyes open, no bars, no blur, no fade). */
  limpar() {
    for (const p of Object.keys(this.seq) as Prop[]) this.seq[p]++;
    Object.assign(this.estado, { fade: 0, letterbox: 0, abertura: 1, desfoque: 0 });
    this.pintar();
    this.avisoPular(null);
    this.anel(0);
    this.proximaParte(false);
  }

  /** Removes the layer from the page. */
  destruir() {
    this.raiz.remove();
    this.canvas.style.filter = "";
  }
}
