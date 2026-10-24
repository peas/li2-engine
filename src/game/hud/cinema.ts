/**
 * Cinema mode: hides a set of HUD elements as a block while a cutscene plays, and shows them back. It toggles a class
 * (`display: none !important`), so an element that manages its own `display` (a strip that hides when empty) keeps
 * doing so underneath and comes back exactly as it was. Remembers nothing else.
 */
const CLASSE = "modo-cinema-oculto";
let cssPosto = false;

export function criarModoCinema(elementos: () => (HTMLElement | null | undefined)[]): (on: boolean) => void {
  if (!cssPosto && typeof document !== "undefined") {
    cssPosto = true;
    const style = document.createElement("style");
    style.textContent = `.${CLASSE} { display: none !important; }`;
    document.head.appendChild(style);
  }
  return (on) => {
    for (const el of elementos()) el?.classList.toggle(CLASSE, on);
  };
}
