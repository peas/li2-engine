import { cssUmaVez } from "./carimbo";
import { icone as iconeSvg } from "./icones";

const css = cssUmaVez(`
.mds { position: fixed; left: 12px; top: 14px; z-index: 15; pointer-events: none; display: flex; gap: 6px; align-items: center;
  font: 800 26px system-ui, -apple-system, "Segoe UI", sans-serif; color: #ffd23f; text-shadow: 0 2px 2px rgba(0, 0, 0, .6);
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .45)); }
.mds svg { display: block; }
.mds.sobe { animation: mds-sobe .45s ease; }
.mds.desce { animation: mds-sobe .3s ease reverse; }
@keyframes mds-sobe { 40% { transform: scale(1.2); } }
`);

/**
 * Coins beside the hearts (top-left): the coin icon (`icone`, default the engine's "moeda") and the number, bumping
 * when it changes. `seguir(el)` places it just right of the hearts row (call after the hearts repaint).
 */
export class Moedas {
  readonly root = document.createElement("div");
  private readonly numero = document.createElement("span");
  private valor = -1;
  constructor(o: { icone?: string } = {}) {
    css();
    this.root.className = "mds";
    this.root.setAttribute("aria-label", "moedas");
    this.root.append(iconeSvg(o.icone ?? "moeda", 32), this.numero);
    document.body.appendChild(this.root);
  }
  set(n: number) {
    if (n === this.valor) return;
    const antes = this.valor;
    this.valor = n;
    this.numero.textContent = String(n);
    if (antes < 0) return;
    this.root.classList.remove("sobe", "desce");
    void this.root.offsetWidth;
    this.root.classList.add(n > antes ? "sobe" : "desce");
  }
  /** Sit right after `el` (the hearts row). */
  seguir(el: Element) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) this.root.style.left = `${Math.round(r.right + 12)}px`;
  }
}
