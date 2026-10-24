import { useContext, useMemo, useState } from "preact/hooks";
import type { ResumoMissao } from "../missoes/schema";
import { CtxTelas } from "./contexto";
import { useStore } from "./hooks";
import { Icone, Tela } from "./Tela";

const ORDEM: Record<ResumoMissao["status"], number> = { ativa: 0, nova: 1, feita: 2 };
const CHIP: Record<ResumoMissao["status"], string> = { ativa: "ativa ⭐", nova: "nova", feita: "feita ✓" };

/**
 * The quest list: active first (with its steps ✓/○ and "2/3"), then new, then done. Enter on a row shows or hides
 * its description. Refreshes from `deps.missoes()` on open and whenever quest progress changes in `deps.store`.
 */
export function TelaMissoes({ titulo = "Missões", dica = "Esc fecha · ↑↓ escolhe · Enter mostra mais" }: { titulo?: string; dica?: string }) {
  const { deps } = useContext(CtxTelas);
  const progresso = useStore(deps.store, (s) => s.missoes);
  const [aberta, setAberta] = useState<string | null>(null);
  const lista = useMemo(
    () => [...(deps.missoes?.() ?? [])].sort((a, b) => ORDEM[a.status] - ORDEM[b.status]),
    [progresso, deps],
  );
  const nome = deps.nomeNpc ?? ((id: string) => id);

  return (
    <Tela titulo={titulo} cabecalho={deps.cabecalho?.()} dica={dica}>
      {lista.length === 0 && <div class="tl-vazio">{deps.textoVazio ?? "Nenhuma missão ainda. Converse com as pessoas (E)."}</div>}
      <div class="tl-lista">
        {lista.map((m) => (
          <button key={m.id} type="button" class="tl-linha tl-missao" data-nav data-id={m.id}
            data-desc={aberta === m.id ? "Enter esconde" : "Enter mostra mais"}
            onClick={() => setAberta(aberta === m.id ? null : m.id)}>
            <div class="tl-missao-topo">
              {m.status === "ativa" && <Icone nome="estrela" size={32} />}
              <span class="tl-nome" style={{ marginRight: "auto" }}>{m.titulo}</span>
              <span class={`tl-status tl-status-${m.status}`}>{CHIP[m.status]}</span>
            </div>
            <span class="tl-quem">pedido de: {nome(m.quem)}</span>
            {aberta === m.id && <span class="tl-estado">{m.descricao}</span>}
            {m.status === "ativa" && m.passos.map((p, i) => (
              <span key={i} class={`tl-passo${p.feito ? " tl-feito" : ""}`}>
                {p.feito ? "✓" : "○"} {p.texto}{p.progresso && ` (${p.progresso})`}
              </span>
            ))}
          </button>
        ))}
      </div>
    </Tela>
  );
}
