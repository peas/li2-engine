import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";
import { secoesDaAba } from "./ajuda";
import { CtxTelas } from "./contexto";
import { escrevendo } from "./hooks";
import { Icone, Tela } from "./Tela";

const CHIP = { border: "none", cursor: "pointer", font: "inherit", fontWeight: 700, color: "#fff" };
const CHIP_ATIVO = { ...CHIP, background: "#ffd23f", color: "#1a1430" };
const LINK = { color: "#ffd23f", textDecoration: "underline" };

/**
 * "Como jogar": stacked sections of `deps.ajuda`; each section is a nav stop, so ↑↓ scroll through them.
 * With `abas`, chips at the top pick a tab (click, ← / →, Tab / Shift+Tab) and only its sections show; the box carries
 * the current tab index in `data-aba`. Without `abas`, every section, as before. A line with `link` is an anchor that
 * opens in a new tab (the game keeps running behind).
 */
export function TelaAjuda({ titulo = "Como jogar", dica }: { titulo?: string; dica?: string }) {
  const { deps } = useContext(CtxTelas);
  const conteudo = deps.ajuda ?? { secoes: [] };
  const abas = conteudo.abas ?? [];
  const comAbas = abas.length > 1;
  const [aba, setAba] = useState(0);
  const n = useRef(abas.length);
  n.current = abas.length;

  // The tab keys must run before the screen's own navigation (Tela's capture listener on window takes the arrows and
  // stops them). Tela adds it in a layout effect of a child, which runs before ours, so ours is added during the first
  // render instead: same target and phase, added first, called first.
  const teclas = useRef<((e: KeyboardEvent) => void) | null>(null);
  if (!teclas.current && comAbas) {
    teclas.current = (e: KeyboardEvent) => {
      const d = e.code === "ArrowRight" || (e.code === "Tab" && !e.shiftKey) ? 1 : e.code === "ArrowLeft" || e.code === "Tab" ? -1 : 0;
      if (!d || n.current < 2 || escrevendo()) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // Tab may also be a screen key of the game (the backpack): not while here
      if (!e.repeat) setAba((a) => (a + d + n.current) % n.current);
    };
    addEventListener("keydown", teclas.current, true);
  }
  // a layout effect (not useEffect): it runs at once, so a screen closed right after opening still removes the listener
  useLayoutEffect(() => () => { if (teclas.current) removeEventListener("keydown", teclas.current, true); }, []);

  const atual = Math.min(aba, Math.max(0, abas.length - 1));
  const chips = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { chips.current?.closest(".tl-caixa")?.setAttribute("data-aba", String(atual)); }, [atual]);

  const cabecalho = (
    <>
      {comAbas && (
        <div ref={chips} class="tl-abas" role="tablist" style={{ display: "flex", gap: "6px" }}>
          {abas.map((a, i) => (
            <button key={a.titulo} type="button" role="tab" class="tl-chip" aria-selected={i === atual}
              style={i === atual ? CHIP_ATIVO : CHIP} onClick={() => setAba(i)}>
              {a.titulo}
            </button>
          ))}
        </div>
      )}
      <Icone nome="ajuda" size={34} />
    </>
  );
  return (
    <Tela titulo={titulo} cabecalho={cabecalho} semDesc largura={780}
      dica={dica ?? (comAbas ? "Esc fecha · ↑↓ passa · ←→ ou Tab troca a aba" : "Esc fecha · ↑↓ passa")}>
      {secoesDaAba(conteudo, atual).map((s) => (
        <section key={s.titulo} class="tl-ajuda-secao" data-nav tabIndex={0}>
          <h3>{s.titulo}</h3>
          {s.linhas.map((l, i) => (
            <div key={i} class="tl-ajuda-linha">
              {l.tecla?.split(" / ").map((t) => <kbd key={t} class="tl-tecla">{t}</kbd>)}
              {l.icone && <Icone nome={l.icone} size={30} />}
              <span>{l.titulo && <b>{l.titulo}: </b>}{l.link ? <a href={l.link} target="_blank" rel="noopener" style={LINK}>{l.texto}</a> : l.texto}</span>
            </div>
          ))}
        </section>
      ))}
    </Tela>
  );
}
