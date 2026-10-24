import { cssUmaVez } from "./carimbo";

const css = cssUmaVez(`
.slv { position: fixed; right: 14px; top: 12px; z-index: 15; pointer-events: none; display: flex; gap: 6px; align-items: center;
  font: 600 15px system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); opacity: 0; transition: opacity .4s ease; }
.slv.on { opacity: .85; }
`);

/** Autosave: a small "💾 salvo" in the top-right corner for 1.5 s. */
export class IndicadorSalvo {
  readonly root = document.createElement("div");
  private timer = 0;
  constructor() {
    css();
    this.root.className = "slv";
    this.root.textContent = "💾 salvo";
    document.body.appendChild(this.root);
  }
  mostrar() {
    this.root.classList.add("on");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.root.classList.remove("on"), 1500);
  }
}
