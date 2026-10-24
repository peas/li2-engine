import type { ComponentChildren } from "preact";
import { useContext, useRef, useState } from "preact/hooks";
import { icone } from "../hud/icones";
import { CtxTelas } from "./contexto";
import { useNavegacao } from "./hooks";

export const DICA = "Esc fecha · ↑↓←→ escolhe · Enter usa";

/** An icon of hud/icones.ts (same drawing as the HUD). */
export function Icone({ nome, size = 32 }: { nome: string; size?: number }) {
  return <span class="tl-ico" dangerouslySetInnerHTML={{ __html: icone(nome, size).outerHTML }} />;
}

interface Props {
  titulo: string;
  /** Chips on the right of the title (coins, day). */
  cabecalho?: ComponentChildren;
  /** The hint line at the bottom. */
  dica?: string;
  /** Max width in px (92vw caps it). */
  largura?: number;
  /** Hide the line that describes the focused item. */
  semDesc?: boolean;
  children: ComponentChildren;
}

/**
 * The shell every screen uses: dim backdrop (a click on it closes, like Esc), the dark purple box, title + chips,
 * a scrollable body, the line that says what the focused item does (its `data-desc`) and the key hints.
 * Navigation over the body's `[data-nav]` elements is `useNavegacao` (keyboard, mouse, gamepad).
 */
export function Tela({ titulo, cabecalho, dica = DICA, largura, semDesc, children }: Props) {
  const { contextos } = useContext(CtxTelas);
  const caixa = useRef<HTMLDivElement>(null);
  const [desc, setDesc] = useState("");
  useNavegacao(caixa, setDesc, () => contextos.fecharTopo());
  return (
    <div class="tl-fundo" onClick={(e) => { if (e.target === e.currentTarget) contextos.fecharTopo(); }}>
      <div class="tl-caixa" ref={caixa} role="dialog" aria-label={titulo}
        style={largura ? { width: `min(${largura}px, 92vw)` } : undefined}>
        <div class="tl-topo"><div class="tl-titulo">{titulo}</div>{cabecalho}</div>
        <div class="tl-corpo">{children}</div>
        {!semDesc && <div class="tl-desc" aria-live="polite">{desc || " "}</div>}
        <div class="tl-dica">{dica}</div>
      </div>
    </div>
  );
}

/** Adds a one-shot animation class (`tl-nham`, `tl-nao`) to an element, removed when it ends. */
export function piscar(e: Element | null | undefined, classe: string) {
  if (!e) return;
  e.classList.remove(classe);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(classe);
  e.addEventListener("animationend", () => e.classList.remove(classe), { once: true });
}
