/** A once-per-page stylesheet for one HUD piece. */
export function cssUmaVez(css: string): () => void {
  let posto = false;
  return () => {
    if (posto) return;
    posto = true;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  };
}

const css = cssUmaVez(`
.crb { position: fixed; left: 50%; top: 22vh; z-index: 30; pointer-events: none; transform: translate(-50%, 0) rotate(-6deg);
  font: 900 clamp(32px, 6vh, 72px)/1.1 system-ui, -apple-system, "Segoe UI", sans-serif; color: #ffd23f; text-align: center;
  padding: 10px 28px; border: 6px solid #ffd23f; border-radius: 18px; background: rgba(26, 20, 48, .7);
  text-shadow: 0 3px 0 #8a5a00; opacity: 0; }
.crb.on { animation: crb-bate 2600ms ease forwards; }
@keyframes crb-bate {
  0% { opacity: 0; transform: translate(-50%, 0) rotate(-6deg) scale(2.4); }
  6% { opacity: 1; transform: translate(-50%, 0) rotate(-6deg) scale(.94); }
  9% { transform: translate(-50%, 0) rotate(-6deg) scale(1); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, 0) rotate(-6deg) scale(1); }
}
`);

/** The quest stamp ("item get" level 3): a big gold seal that lands with a bump, holds and fades. */
export class Carimbo {
  readonly root = document.createElement("div");
  constructor() {
    css();
    this.root.className = "crb";
    document.body.appendChild(this.root);
  }
  mostrar(texto: string) {
    this.root.textContent = texto;
    this.root.classList.remove("on");
    void this.root.offsetWidth;
    this.root.classList.add("on");
  }
}
