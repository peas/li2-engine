/**
 * Input context stack (UX pattern 2 of the games): `jogo` at the bottom, `dialogo`, `menu` and `cutscene` pushed on
 * top. Only the top receives input (the game loop zeroes the controls when the top is not `jogo`), Esc closes
 * whatever is on top and nothing else, and opening a menu releases the pointer lock so the mouse can click.
 * The `cutscene` layer handles Esc itself (hold to skip): the stack leaves Esc alone while it is on top.
 */
export type Contexto = "jogo" | "dialogo" | "menu" | "cutscene";

interface Camada {
  nome: Contexto;
  /** Called when Esc is pressed with this layer on top (it should end up calling `pop`). */
  fechar?: () => void;
}

export class Contextos {
  private pilha: Camada[] = [{ nome: "jogo" }];
  private listeners = new Set<(topo: Contexto) => void>();

  constructor() {
    addEventListener("keydown", (e) => {
      if (e.code !== "Escape" || this.topo === "jogo" || this.topo === "cutscene") return;
      // a text box being typed in handles Esc itself: it gives up the edit, the menu stays
      if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.fecharTopo();
    }, true);
  }

  get topo(): Contexto {
    return this.pilha[this.pilha.length - 1].nome;
  }

  /** Is the game itself receiving input? */
  get jogando() {
    return this.topo === "jogo";
  }

  ativo(nome: Contexto) {
    return this.topo === nome;
  }

  push(nome: Contexto, fechar?: () => void) {
    this.pilha.push({ nome, fechar });
    if (nome === "menu" && document.pointerLockElement) document.exitPointerLock();
    this.notify();
  }

  /** Removes the top layer (or the top layer named `nome`, if given and present). */
  pop(nome?: Contexto) {
    if (this.pilha.length <= 1) return;
    if (nome === undefined) this.pilha.pop();
    else {
      for (let i = this.pilha.length - 1; i > 0; i--) if (this.pilha[i].nome === nome) { this.pilha.splice(i, 1); break; }
    }
    this.notify();
  }

  /** Esc: ask the top layer to close itself (the layer pops when done). */
  fecharTopo() {
    const topo = this.pilha[this.pilha.length - 1];
    if (topo.nome === "jogo") return;
    if (topo.fechar) topo.fechar();
    else this.pop();
  }

  onChange(fn: (topo: Contexto) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn(this.topo);
  }
}
