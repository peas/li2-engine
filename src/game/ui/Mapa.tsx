import { useContext, useLayoutEffect, useRef } from "preact/hooks";
import { CtxTelas } from "./contexto";
import { Tela } from "./Tela";

/** The whole island on a big map (north up), drawn once on open by `deps.mapa` (`Minimapa.desenharIlha`). */
export function TelaMapa({ titulo = "Mapa da ilha", dica = "Esc fecha" }: { titulo?: string; dica?: string }) {
  const { deps } = useContext(CtxTelas);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (canvas.current) deps.mapa?.desenharIlha(canvas.current);
  }, [deps]);
  return (
    <Tela titulo={titulo} cabecalho={deps.cabecalho?.()} dica={dica} largura={720} semDesc>
      <canvas ref={canvas} class="tl-mapa" />
    </Tela>
  );
}
