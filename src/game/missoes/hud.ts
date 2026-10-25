import type GUI from "lil-gui";
import type { Eventos } from "../eventos";
import type { Missoes } from "./missoes";

/**
 * The quest strip under the minimap ("what to do now", always visible): ⭐ title, one line per step with ○/✓ and the counter
 * ("2/3"), the current step highlighted. It follows `missoes.ativa()` (the most recently started quest). When that
 * quest ends, "✓ título" stays alone for 6 s, fades out, and the next active quest (if any) takes its place.
 * `update()` is cheap: call it every ~250 ms; it touches the DOM only when the text would change.
 */
const DONE_SHOW_MS = 6000;
const FADE_MS = 1200;
const GLOW_MS = 1600;

const CSS = `
.msh { position: fixed; top: calc(118px + var(--sob-minimapa, 0px)); left: 12px; z-index: 15; pointer-events: none; padding: 10px 14px; max-width: 400px;
  font: 18px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .6);
  background: rgba(26, 20, 48, .6); border-radius: 12px; opacity: 1; transition: opacity ${FADE_MS}ms ease; }
.msh.off { opacity: 0; }
.msh-title { font-weight: 700; margin-bottom: 2px; }
.msh-line { border-radius: 6px; padding: 0 4px; margin: 0 -4px; opacity: .7;
  transition: background-color .8s ease, text-shadow .8s ease; }
.msh-line.now { opacity: 1; font-weight: 600; }
.msh-line.ok { opacity: .7; }
.msh-mark { display: inline-block; width: 1.2em; }
.msh-line.ok .msh-mark { color: #ffd23f; }
.msh-prog { margin-left: 6px; color: #ffd23f; font-weight: 700; }
.msh-line.glow { background-color: rgba(255, 210, 63, .35); text-shadow: 0 0 8px #ffd23f; }
`;

export class MissaoHud {
  readonly root = document.createElement("div");
  readonly params = { enabled: true };
  /** Quest being shown (null: nothing to follow). */
  private seguindo: string | null = null;
  /** What was last rendered; same key = no DOM work. */
  private chave = "";
  /** The current step's line, for the glow. */
  private linhaAtual: HTMLElement | null = null;
  /** True while the "✓ título" farewell is on screen (update leaves it alone). */
  private despedindo = false;
  private timers: number[] = [];

  constructor(private readonly missoes: Pick<Missoes, "ativa" | "status" | "resumo" | "def"> & { existe?: (id: string) => boolean }, eventos: Eventos<any>,
    /** `opcoes.css`: rules appended after the strip's own (another size). */
    opcoes: { css?: string } = {}) {
    const style = document.createElement("style");
    style.textContent = CSS + (opcoes.css ?? "");
    document.head.appendChild(style);
    this.root.className = "msh";
    this.root.style.display = "none";
    document.body.appendChild(this.root);

    eventos.on("missaoAvancou", (id: string) => {
      this.update();
      if (id !== this.seguindo || this.despedindo || !this.linhaAtual) return;
      const linha = this.linhaAtual;
      linha.classList.add("glow");
      window.setTimeout(() => linha.classList.remove("glow"), GLOW_MS);
    });
  }

  update() {
    if (!this.params.enabled) {
      this.esconder();
      return;
    }
    if (this.despedindo) return;
    // a reset or a load can forget the repeatable quest it was following
    if (this.seguindo && this.missoes.existe && !this.missoes.existe(this.seguindo)) this.seguindo = null;
    if (this.seguindo && this.missoes.status(this.seguindo) === "feita") {
      this.despedir(this.seguindo);
      return;
    }
    const d = this.missoes.ativa();
    if (!d) {
      this.esconder();
      return;
    }
    const r = this.missoes.resumo(d.id);
    const chave = JSON.stringify([r.id, r.passo, r.passos.map((p) => p.progresso)]);
    this.seguindo = d.id;
    if (chave === this.chave) return;
    this.chave = chave;

    const title = div("msh-title", `⭐ ${r.titulo}`);
    this.linhaAtual = null;
    const rows = r.passos.map((p, i) => {
      const atual = i === r.passo;
      const row = div(`msh-line${p.feito ? " ok" : ""}${atual ? " now" : ""}`);
      row.append(span("msh-mark", p.feito ? "✓" : "○"), p.texto);
      if (atual && p.progresso) row.append(span("msh-prog", p.progresso));
      if (atual) this.linhaAtual = row;
      return row;
    });
    this.root.replaceChildren(title, ...rows);
    this.root.classList.remove("off");
    this.root.style.display = "";
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("missão no HUD").onChange(() => {
      this.chave = "";
      this.update();
    });
  }

  /** "✓ título" alone for 6 s, fade, then follow the next active quest. */
  private despedir(id: string) {
    this.despedindo = true;
    this.linhaAtual = null;
    const line = div("msh-line ok now");
    line.append(span("msh-mark", "✓"), this.missoes.def(id).titulo);
    this.root.replaceChildren(line);
    this.root.classList.remove("off");
    this.root.style.display = "";
    this.timers.push(window.setTimeout(() => {
      this.root.classList.add("off");
      this.timers.push(window.setTimeout(() => {
        this.despedindo = false;
        this.seguindo = null;
        this.chave = "";
        this.root.style.display = "none";
        this.update();
      }, FADE_MS));
    }, DONE_SHOW_MS));
  }

  private esconder() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.despedindo = false;
    this.seguindo = null;
    this.chave = "";
    this.linhaAtual = null;
    this.root.style.display = "none";
  }
}

function div(className: string, text = "") {
  const d = document.createElement("div");
  d.className = className;
  d.textContent = text;
  return d;
}

function span(className: string, text: string) {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}
