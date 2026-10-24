import { useContext, useReducer } from "preact/hooks";
import { CtxTelas } from "./contexto";
import { useStore } from "./hooks";
import { DICA, Icone, piscar, Tela } from "./Tela";

/**
 * The backpack: a 4-column grid of what she carries (`deps.mochila.itens()`, the game decides order and what shows).
 * Enter / click on an item with an `acao` calls `deps.mochila.usar(id)`: the card bumps when it worked, shakes when not.
 * Re-renders when the store's inventory changes.
 */
export function TelaMochila({ titulo = "Mochila", dica = DICA }: { titulo?: string; dica?: string }) {
  const { deps } = useContext(CtxTelas);
  useStore(deps.store, (s) => s.inventario);
  const [, atualizar] = useReducer((n: number) => n + 1, 0);
  const itens = deps.mochila?.itens() ?? [];

  const usar = (id: string, e: Event) => {
    const ok = deps.mochila?.usar(id);
    piscar(e.currentTarget as Element, ok === false ? "tl-nao" : "tl-nham");
    atualizar(0);
  };

  return (
    <Tela titulo={titulo} cabecalho={deps.cabecalho?.()} dica={dica}>
      {itens.length === 0 && <div class="tl-vazio">{deps.mochila?.vazio ?? "A mochila está vazia."}</div>}
      {itens.length > 0 && (
        <div class="tl-grade" data-cols="4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {itens.map((i) => (
            <button key={i.id} type="button" class="tl-cartao" data-nav data-id={i.id}
              data-desc={i.acao ? `${i.descricao} · Enter ${i.acao}` : i.descricao}
              onClick={(e) => { if (i.acao) usar(i.id, e); }}>
              <span class="tl-qtd">×{i.qtd}</span>
              <Icone nome={i.icone} size={56} />
              <span class="tl-nome">{i.nome}</span>
              {i.mais && <span class="tl-mais">{i.mais}</span>}
            </button>
          ))}
        </div>
      )}
    </Tela>
  );
}
