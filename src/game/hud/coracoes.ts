import { CORACAO_D, S } from "./icones";

/**
 * Hearts à la Zelda in the top-left corner: `set(atual, max)` in quarters (atual 2.75 of 3 = two full, one 3/4).
 * Inline SVG, ≥ 28 px each; the row pulses when the value changes (green-ish bump when it rises, a shake when it
 * falls). Writes the DOM only when something changed.
 */
const CSS = `
.crc { position: fixed; top: 12px; left: 12px; z-index: 15; pointer-events: none; display: flex; flex-wrap: wrap;
  gap: 4px; max-width: 46vw; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .45)); }
.crc svg { display: block; }
.crc.sobe { animation: crc-sobe .45s ease; }
.crc.desce { animation: crc-desce .4s ease; }
@keyframes crc-sobe { 40% { transform: scale(1.15); } }
@keyframes crc-desce { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
`;

const NS = "http://www.w3.org/2000/svg";
const CHEIO = "#ff4f6d";
const VAZIO = "rgba(26, 20, 48, .55)";

/** How each heart of `max` is filled for `atual` (rounded down to quarters): 1, 0.75, 0.5, 0.25 or 0. */
export function preenchimento(atual: number, max: number): number[] {
  // the epsilon keeps 0.1 + 0.2-style float sums from losing a quarter
  const quartos = Math.max(0, Math.min(Math.floor(atual * 4 + 1e-6), Math.ceil(max) * 4));
  return Array.from({ length: Math.max(0, Math.ceil(max)) }, (_, i) => Math.max(0, Math.min(1, (quartos - i * 4) / 4)));
}

export class Coracoes {
  readonly root = document.createElement("div");
  private atual = -1;
  private max = -1;

  constructor(private readonly tamanho = 36) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = "crc";
    this.root.setAttribute("aria-label", "corações");
    document.body.appendChild(this.root);
  }

  set(atual: number, max: number) {
    if (atual === this.atual && max === this.max) return;
    const antes = this.atual;
    this.atual = atual;
    this.max = max;
    this.root.replaceChildren(...preenchimento(atual, max).map((k, i) => this.coracao(k, i)));
    this.root.setAttribute("aria-valuenow", String(atual));
    if (antes >= 0 && atual !== antes) this.pulsar(atual > antes ? "sobe" : "desce");
  }

  private coracao(k: number, i: number) {
    const svg = document.createElementNS(NS, "svg");
    const size = Math.max(28, this.tamanho);
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.dataset.k = String(k);
    const id = `crc-parte-${i}`;
    // a partial heart is clipped from the left: 1/4, 1/2, 3/4 of the 64-wide drawing
    const cheio = k >= 1 ? `<path d="${CORACAO_D}" fill="${CHEIO}"/>`
      : k > 0 ? `<clipPath id="${id}"><rect x="0" y="0" width="${Math.round(k * 64)}" height="64"/></clipPath><path d="${CORACAO_D}" fill="${CHEIO}" clip-path="url(#${id})"/>`
        : "";
    svg.innerHTML = `<path d="${CORACAO_D}" fill="${VAZIO}"/>${cheio}<path d="${CORACAO_D}" fill="none" ${S()}/>${
      k > 0 ? `<path d="M15 22 C15 17 18 14 22 14" fill="none" stroke="#ffc2cc" stroke-width="4" stroke-linecap="round"/>` : ""}`;
    return svg;
  }

  private pulsar(classe: "sobe" | "desce") {
    const r = this.root;
    r.classList.remove("sobe", "desce");
    void r.offsetWidth;
    r.classList.add(classe);
  }
}
