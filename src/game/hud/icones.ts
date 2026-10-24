/**
 * HUD icons as inline SVG, drawn like a child's marker drawing: flat colours, thick dark rounded outlines, no
 * gradients. All on a 64×64 viewBox; `icone(nome, size)` returns a fresh SVGElement. The engine ships a few generic
 * drawings; the game registers its own (`registrarIcone("peixe-assado", markup)`) with the same helpers (`S`, `L`,
 * `linha`, `TINTA`) so everything looks drawn by the same hand. An unknown name is a grey disc with its first letter.
 */
export const TINTA = "#2b1d3a";
/** The dark marker outline of a filled shape (`w` wide). */
export const S = (w = 4) => `stroke="${TINTA}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** An unfilled round line in `cor` (`w` wide). */
export const L = (cor = TINTA, w = 4) => `fill="none" stroke="${cor}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
/** A coloured line with the dark outline around it (the outline is `w + 5` wide, drawn underneath). */
export const linha = (d: string, cor: string, w: number) => `<path d="${d}" ${L(TINTA, w + 5)}/><path d="${d}" ${L(cor, w)}/>`;

/** The heart path (also used by the hearts HUD). */
export const CORACAO_D = "M32 56 C22 48 6 38 6 23 C6 13 14 7 22 7 C27 7 30 10 32 14 C34 10 37 7 42 7 C50 7 58 13 58 23 C58 38 42 48 32 56 Z";

const ICONES: Record<string, string> = {
  // star: the quest marker
  estrela: `
    <path d="M32 7 L38.5 24.1 L56.7 25 L42.5 36.4 L47.3 54 L32 44 L16.7 54 L21.5 36.4 L7.3 25 L25.5 24.1 Z" fill="#ffd23f" ${S()}/>
    <path d="M25 29 L28 23" ${L("#fff6c0", 3)}/>`,
  // help: a question mark in a circle
  ajuda: `
    <circle cx="32" cy="32" r="26" fill="#8fe3ff" ${S()}/>
    ${linha("M23 25 C23 14 41 14 41 24 C41 32 32 31 32 40", "#ffffff", 5)}
    <circle cx="32" cy="50" r="4" fill="#ffffff" ${S(3)}/>`,
  coracao: `
    <path d="${CORACAO_D}" fill="#ff4f6d" ${S()}/>
    <path d="M15 22 C15 17 18 14 22 14" ${L("#ffc2cc", 4)}/>`,
  peixe: `
    <path d="M44 32 L60 18 L58 32 L60 46 Z" fill="#4fa3e0" ${S()}/>
    <path d="M6 32 C14 16 36 14 46 32 C36 50 14 48 6 32 Z" fill="#6fc3f0" ${S()}/>
    <path d="M26 22 C30 28 30 36 26 42" ${L(TINTA, 3)}/>
    <circle cx="16" cy="29" r="3.5" fill="${TINTA}"/>`,
  maca: `
    <path d="M32 20 C24 12 8 14 8 32 C8 48 20 60 32 56 C44 60 56 48 56 32 C56 14 40 12 32 20 Z" fill="#e8322a" ${S()}/>
    <path d="M32 20 C32 13 34 9 37 6" ${L()}/>
    <path d="M36 13 C40 5 52 5 54 9 C50 15 42 17 36 13 Z" fill="#5cc05c" ${S(3)}/>
    <path d="M17 30 C17 25 20 22 24 21" ${L("#ffb3a8", 4)}/>`,
  cogumelo: `
    <path d="M24 34 L22 54 C22 58 42 58 42 54 L40 34 Z" fill="#fff3dc" ${S()}/>
    <path d="M6 34 C6 16 18 8 32 8 C46 8 58 16 58 34 Z" fill="#e8322a" ${S()}/>
    <circle cx="20" cy="22" r="4" fill="#ffffff"/><circle cx="36" cy="16" r="4.5" fill="#ffffff"/><circle cx="46" cy="27" r="3.5" fill="#ffffff"/>`,
  coco: `
    <circle cx="32" cy="34" r="24" fill="#8a5a2b" ${S()}/>
    <path d="M20 22 C22 28 20 40 24 48 M34 12 C36 22 40 34 38 56 M46 20 C46 28 50 36 48 46" ${L("#6b4220", 3)}/>
    <circle cx="26" cy="22" r="2.6" fill="${TINTA}"/><circle cx="34" cy="20" r="2.6" fill="${TINTA}"/><circle cx="31" cy="27" r="2.6" fill="${TINTA}"/>`,
  tomate: `
    <circle cx="32" cy="36" r="22" fill="#ff4a3d" ${S()}/>
    <path d="M32 16 L26 10 L30 18 L20 16 L28 22 L32 20 L36 22 L44 16 L34 18 L38 10 Z" fill="#5cc05c" ${S(3)}/>
    <path d="M18 34 C18 29 21 26 25 25" ${L("#ffc2b8", 4)}/>`,
  casa: `
    <rect x="12" y="30" width="40" height="26" fill="#f2e2c4" ${S()}/>
    <path d="M6 32 L32 8 L58 32 Z" fill="#d9534f" ${S()}/>
    <rect x="27" y="40" width="11" height="16" fill="#8a5a2b" ${S(3)}/>
    <rect x="16" y="36" width="8" height="8" fill="#8fd8ff" ${S(3)}/>`,
  mapa: `
    <path d="M6 14 L22 8 L42 14 L58 8 L58 50 L42 56 L22 50 L6 56 Z" fill="#f2e2c4" ${S()}/>
    <path d="M22 8 V50 M42 14 V56" ${L(TINTA, 3)}/>
    <path d="M12 40 C18 30 26 36 30 28 C34 20 44 30 50 22" ${L("#e8322a", 3)}/>
    <path d="M46 34 L52 40 M52 34 L46 40" ${L("#e8322a", 3)}/>`,
  moeda: `
    <circle cx="32" cy="32" r="26" fill="#ffd23f" ${S()}/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#e0a800" stroke-width="4"/>
    <path d="M32 20 V44 M26 26 H36 C40 26 40 32 36 32 H28 C24 32 24 38 28 38 H38" ${L("#b07a00", 4)}/>
    <path d="M16 24 C18 18 22 14 28 12" ${L("#fff6c0", 4)}/>`,
};

/** Adds (or replaces) an icon: `markup` is the inner SVG on a 64×64 viewBox. */
export function registrarIcone(nome: string, markup: string) {
  ICONES[nome] = markup;
}

export const temIcone = (nome: string) => nome in ICONES;
export const nomesDosIcones = () => Object.keys(ICONES);

const NS = "http://www.w3.org/2000/svg";

/** A fresh `<svg>` for `nome` at `size` px; an unknown name is a grey circle with its first letter. */
export function icone(nome: string, size = 32): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ico", `ico-${nome}`);
  const corpo = ICONES[nome];
  svg.innerHTML = corpo ?? `<circle cx="32" cy="32" r="26" fill="#9a94a8" ${S()}/>
    <text x="32" y="43" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" font-weight="700" fill="#fff">${
      (nome[0] ?? "?").toUpperCase().replace(/[<&>]/g, "?")}</text>`;
  return svg;
}
