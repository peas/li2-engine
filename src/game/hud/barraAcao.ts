/**
 * A small labelled progress bar above the prompt pill (hold E to fish, press E to calm): `mostrar(label, k)` every
 * frame while something fills, `esconder()` when it is over. Plain DOM; writes only when the value changes.
 */
const CSS = `
.bac { position: fixed; left: 50%; bottom: 248px; transform: translateX(-50%); z-index: 15; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: 0; transition: opacity .2s ease;
  font: 600 20px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); }
.bac.on { opacity: 1; }
.bac-barra { width: 260px; height: 20px; border-radius: 999px; background: rgba(26, 20, 48, .6);
  border: 2px solid rgba(255, 255, 255, .8); box-sizing: border-box; overflow: hidden; }
.bac-ench { height: 100%; border-radius: 999px; background: #a9e4ff; transition: width .08s linear; }
`;

export class BarraAcao {
  readonly root = document.createElement("div");
  private label = document.createElement("div");
  private ench = document.createElement("div");
  private shown = { label: "", k: -1, on: false };

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = "bac";
    const barra = document.createElement("div");
    barra.className = "bac-barra";
    this.ench.className = "bac-ench";
    barra.appendChild(this.ench);
    this.root.append(this.label, barra);
    document.body.appendChild(this.root);
  }

  /** Show the bar with `label` filled to `k` (0..1). */
  mostrar(label: string, k: number) {
    const s = this.shown;
    if (s.label !== label) { this.label.textContent = label; s.label = label; }
    const pct = Math.round(Math.max(0, Math.min(1, k)) * 100);
    if (s.k !== pct) { this.ench.style.width = `${pct}%`; s.k = pct; }
    if (!s.on) { this.root.classList.add("on"); s.on = true; }
  }

  esconder() {
    if (!this.shown.on) return;
    this.root.classList.remove("on");
    this.shown.on = false;
  }

  get visivel() {
    return this.shown.on;
  }
}
