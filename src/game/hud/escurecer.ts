/**
 * Full-screen fade to black (sleeping, a transition): `await fechar()` (eyes close), change things, `await abrir()`
 * (eyes open). An optional line in the middle ("zzz... Dia 2"). Blocks clicks while dark.
 */
const CSS = `
.esc { position: fixed; inset: 0; z-index: 40; background: #05030c; opacity: 0; pointer-events: none;
  display: grid; place-items: center; transition-property: opacity; transition-timing-function: ease-in-out; }
.esc.on { pointer-events: auto; }
.esc-texto { font: 700 34px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff1a8; letter-spacing: .04em;
  text-shadow: 0 0 18px rgba(255, 241, 168, .4); text-align: center; white-space: pre-line; }
`;

export class Escurecer {
  private root = document.createElement("div");
  private linha = document.createElement("div");
  private _escuro = false;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = "esc";
    this.linha.className = "esc-texto";
    this.root.appendChild(this.linha);
    document.body.appendChild(this.root);
  }

  get escuro() {
    return this._escuro;
  }

  /** Text in the middle of the dark screen ("" hides it). */
  texto(s: string) {
    this.linha.textContent = s;
  }

  /** Fades to black over `ms`. */
  fechar(ms = 900) {
    this._escuro = true;
    this.root.classList.add("on");
    return this.fade(1, ms);
  }

  /** Fades back to the game over `ms`; clears the text when done. */
  async abrir(ms = 900) {
    await this.fade(0, ms);
    this._escuro = false;
    this.root.classList.remove("on");
    this.texto("");
  }

  private fade(alvo: number, ms: number) {
    this.root.style.transitionDuration = `${ms}ms`;
    // force the start value to be committed so the transition runs even right after construction
    void this.root.offsetWidth;
    this.root.style.opacity = String(alvo);
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }
}
