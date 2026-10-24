/**
 * First-time hints (everything explained in the game): `const dica = dicaUmaVez(store, avisos)`, then
 * `dica("primeira-maca", "guardado na mochila: aperte I", "maca")` anywhere; shown once per save, longer than a toast.
 */
export interface LeitorDicas {
  getState(): { dicaNova(id: string): boolean };
}

export interface MostraAviso {
  mostrar(texto: string, icone?: string, ms?: number): void;
}

export function dicaUmaVez(store: LeitorDicas, avisos: MostraAviso, ms = 6000) {
  return (id: string, texto: string, icone?: string) => {
    if (store.getState().dicaNova(id)) avisos.mostrar(texto, icone, ms);
  };
}
