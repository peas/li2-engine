import { icone } from "./icones";

/**
 * Small toasts stacked bottom-right: "+1 maçã", "Dia 2 ☀️", first-time hints. The game wires them to its events
 * (state vs event: toasts answer events, never the store) and calls `mostrar`. At most 4 at once, 2.5 s each.
 */
const MAX = 4;
const MOSTRA_MS = 2500;
const DESTAQUE_MS = 4000;
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
.avs-destaque { position: fixed; left: 50%; top: 16vh; z-index: 17; pointer-events: none; display: flex; align-items: center;
  gap: 16px; max-width: min(720px, 88vw); padding: 16px 30px 16px 20px; border-radius: 24px; box-sizing: border-box;
  font: 800 30px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; text-shadow: 0 2px 3px rgba(0, 0, 0, .55);
  background: linear-gradient(135deg, rgba(58, 36, 120, .94), rgba(26, 20, 48, .94)); border: 3px solid #ffd23f;
  box-shadow: 0 10px 36px rgba(0, 0, 0, .45), 0 0 0 6px rgba(255, 210, 63, .18);
  transform: translateX(-50%); animation: avs-entra .55s cubic-bezier(.2, 1.6, .4, 1) both; }
.avs-destaque.sai { animation: avs-sai ${FADE_MS * 2}ms ease forwards; }
.avs-destaque-ico { font-size: 52px; line-height: 1; flex: none; animation: avs-gira 1.2s ease-in-out .5s 2; }
@keyframes avs-entra { from { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(.6); } }
@keyframes avs-sai { to { opacity: 0; transform: translateX(-50%) translateY(-24px) scale(.9); } }
@keyframes avs-gira { 50% { transform: rotate(-14deg) scale(1.15); } }
`;

export class Avisos {
  readonly root = document.createElement("div");

  private readonly iconePx: number;

  /**
   * `acima`: the element the toasts stack above (a status strip); without it they sit 110 px from the bottom.
   * `opcoes.iconePx`: icon size of a toast (default 32); `opcoes.css`: rules appended after the toasts' own.
   */
  constructor(private acima?: HTMLElement, opcoes: { iconePx?: number; css?: string } = {}) {
    this.iconePx = opcoes.iconePx ?? 32;
    const style = document.createElement("style");
    style.textContent = CSS + (opcoes.css ?? "");
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
    if (iconeNome) t.appendChild(icone(iconeNome, this.iconePx));
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

  /**
   * The big toast, for what must not go unnoticed (time passing, a new day; the first game's child missed the small
   * one): centred at the top, a large icon (an emoji) and bold text, bouncing in, `ms` long. One at a time: a new one
   * replaces the one on screen.
   */
  destaque(texto: string, emoji = "🕰️", ms = DESTAQUE_MS): HTMLElement {
    document.querySelectorAll(".avs-destaque").forEach((d) => d.remove());
    const d = document.createElement("div");
    d.className = "avs-destaque";
    d.setAttribute("role", "status");
    const ico = document.createElement("span");
    ico.className = "avs-destaque-ico";
    ico.textContent = emoji;
    const txt = document.createElement("span");
    txt.textContent = texto;
    d.append(ico, txt);
    document.body.appendChild(d);
    window.setTimeout(() => {
      d.classList.add("sai");
      window.setTimeout(() => d.remove(), FADE_MS * 2);
    }, ms);
    return d;
  }
}
