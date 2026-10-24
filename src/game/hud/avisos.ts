import { icone } from "./icones";

/**
 * Small toasts stacked bottom-right: "+1 maçã", "Dia 2 ☀️", first-time hints. The game wires them to its events
 * (state vs event: toasts answer events, never the store) and calls `mostrar`. At most 4 at once, 2.5 s each.
 */
const MAX = 4;
const MOSTRA_MS = 2500;
const FADE_MS = 250;

const CSS = `
.avs { position: fixed; right: 12px; bottom: 110px; z-index: 16; pointer-events: none; display: flex;
  flex-direction: column; align-items: flex-end; gap: 6px; transform-origin: bottom right;
  font: 600 20px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); }
.avs-item { display: flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 999px;
  background: rgba(26, 20, 48, .75); border: 2px solid rgba(255, 255, 255, .6); white-space: nowrap; max-width: 70vw;
  white-space: normal; text-align: left;
  opacity: 0; transform: translateX(16px); transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease; }
.avs-item.on { opacity: 1; transform: none; }
.avs-item .ico { flex: none; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .4)); }
`;

export class Avisos {
  readonly root = document.createElement("div");

  /** `acima`: the element the toasts stack above (a status strip); without it they sit 110 px from the bottom. */
  constructor(private acima?: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = "avs";
    document.body.appendChild(this.root);
  }

  /** Shows a toast now (newest at the bottom); the oldest goes if there are already 4. `ms`: how long (hints stay longer). */
  mostrar(texto: string, iconeNome?: string, ms = MOSTRA_MS) {
    const vivos = [...this.root.children].filter((c) => !c.classList.contains("sai"));
    if (vivos.length >= MAX) this.tirar(vivos[0] as HTMLElement);
    if (this.acima) {
      const r = this.acima.getBoundingClientRect();
      this.root.style.bottom = r.height ? `${Math.round(innerHeight - r.top + 8)}px` : "";
    }
    const t = document.createElement("div");
    t.className = "avs-item";
    if (iconeNome) t.appendChild(icone(iconeNome, 32));
    t.append(texto);
    this.root.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("on")));
    window.setTimeout(() => this.tirar(t), ms);
  }

  private tirar(t: HTMLElement) {
    if (t.classList.contains("sai")) return;
    t.classList.add("sai");
    t.classList.remove("on");
    window.setTimeout(() => t.remove(), FADE_MS);
  }
}
