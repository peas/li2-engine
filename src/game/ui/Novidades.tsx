import { useContext } from "preact/hooks";
import { dataCurta } from "../novidades";
import { segmentar } from "../dialogo/texto";
import { CtxTelas } from "./contexto";
import { Tela } from "./Tela";

/** A line with the dialogue's key-word markers drawn in colour (`*cor 1*`, `_cor 2_`). */
function Colorida({ texto }: { texto: string }) {
  return <>{segmentar(texto.replace(/\s*\n\s*/g, " ")).map((s, i) => (s.cor ? <b key={i} class={`tl-k${s.cor}`}>{s.texto}</b> : s.texto))}</>;
}

/** "Novidades": `deps.novidades`, newest first; each entry is a nav stop so ↑↓ scroll through them. */
export function TelaNovidades({ titulo = "Novidades", dica = "Esc fecha · ↑↓ passa", largura = 740 }: { titulo?: string; dica?: string; largura?: number }) {
  const { deps } = useContext(CtxTelas);
  return (
    <Tela titulo={titulo} cabecalho={<span class="tl-chip">✨</span>} semDesc largura={largura} dica={dica}>
      {(deps.novidades ?? []).map((n) => (
        <section key={n.versao} class="tl-ajuda-secao" data-nav tabIndex={0}>
          <h3>{n.titulo} <span class="tl-estado">· {dataCurta(n.data)}</span></h3>
          {n.falas.map((f, i) => <div key={i} class="tl-ajuda-linha"><span>• <Colorida texto={f} /></span></div>)}
        </section>
      ))}
    </Tela>
  );
}
