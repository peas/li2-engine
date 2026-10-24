/**
 * The bar of keys that do something right here (polish item 4), bottom-left: `set([{ tecla: "E", texto: "falar" }])`
 * whenever the context changes (on foot, mounted, in a menu, in a conversation). Keys are drawn as key caps; several
 * keys for one action are separated by " / " ("W / Espaço"). Rewrites the DOM only when the list changes.
 */
export interface TeclaDica {
  tecla: string;
  texto: string;
}

const CSS = `
.btc { position: fixed; left: 12px; bottom: 12px; z-index: 14; pointer-events: none; display: flex; flex-wrap: wrap;
  gap: 6px 16px; max-width: min(900px, 70vw); font: 600 18px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .7); }
.btc-item { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.btc kbd { display: inline-block; min-width: 24px; padding: 2px 8px; border-radius: 7px; text-align: center;
  font: 700 16px system-ui, sans-serif; color: #2b1d3a; background: #f4efff; box-shadow: 0 3px 0 #9a8fc0; text-shadow: none; }
`;

export class BarraTeclas {
  readonly root = document.createElement("div");
  private chave = "";

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = "btc";
    document.body.appendChild(this.root);
  }

  set(lista: readonly TeclaDica[]) {
    const chave = JSON.stringify(lista);
    if (chave === this.chave) return;
    this.chave = chave;
    this.root.replaceChildren(...lista.map((t) => {
      const item = document.createElement("span");
      item.className = "btc-item";
      for (const k of t.tecla.split(" / ")) {
        const kbd = document.createElement("kbd");
        kbd.textContent = k;
        item.append(kbd);
      }
      item.append(t.texto);
      return item;
    }));
  }

  /** Hide or show the whole bar (cutscenes). */
  visivel(on: boolean) {
    this.root.style.display = on ? "" : "none";
  }
}
