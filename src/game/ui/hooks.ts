import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

/** What `useStore` needs of a store (a zustand/vanilla store fits). */
export interface LeitorStore<S> {
  getState(): S;
  subscribe(fn: (s: S, antes: S) => void): () => void;
}

/**
 * Subscribe a component to a zustand/vanilla store slice. Re-renders only when the selected value changes
 * (Object.is): the game store changes every frame (play time ticks), so select raw fields, never build arrays here.
 * Without a store it returns `undefined` and never re-renders.
 */
export function useStore<S, T>(st: LeitorStore<S> | undefined, sel: (s: S) => T): T | undefined {
  const [valor, setValor] = useState(() => (st ? sel(st.getState()) : undefined));
  const selRef = useRef(sel);
  selRef.current = sel;
  useLayoutEffect(() => {
    if (!st) return;
    const ver = () => {
      const novo = selRef.current(st.getState());
      setValor((antes) => (Object.is(antes, novo) ? antes : novo));
    };
    ver();
    return st.subscribe(ver);
  }, [st]);
  return valor;
}

type Dir = "esq" | "dir" | "cima" | "baixo";
const DIRS: Record<string, Dir> = {
  ArrowLeft: "esq", KeyA: "esq", ArrowRight: "dir", KeyD: "dir",
  ArrowUp: "cima", KeyW: "cima", ArrowDown: "baixo", KeyS: "baixo",
};
const ATIVAR = new Set(["Enter", "NumpadEnter", "Space", "KeyE"]);
const grupoDe = (e: Element) => e.closest("[data-cols]");
/** Is she typing in a text box (a rename)? Then keys are letters, not navigation. */
export const escrevendo = () => document.activeElement instanceof HTMLInputElement && document.activeElement.type === "text";

/**
 * Next index from `i` in `dir`. Left/right step ±1 in DOM order; up/down jump a row inside the grid the element is
 * in (`data-cols` on an ancestor; 1 when none), and leave the grid at its first/last row to the item before/after it.
 */
export function mover(l: Element[], i: number, dir: Dir): number {
  const n = l.length;
  if (dir === "esq") return Math.max(0, i - 1);
  if (dir === "dir") return Math.min(n - 1, i + 1);
  const g = grupoDe(l[i]);
  const cols = Number(g?.getAttribute("data-cols")) || 1;
  if (cols === 1) return dir === "cima" ? Math.max(0, i - 1) : Math.min(n - 1, i + 1);
  const doGrupo = l.filter((e) => grupoDe(e) === g);
  const gi = doGrupo.indexOf(l[i]);
  const linha = Math.floor(gi / cols);
  const ultima = Math.floor((doGrupo.length - 1) / cols);
  if (dir === "baixo") {
    if (linha < ultima) return l.indexOf(doGrupo[Math.min(gi + cols, doGrupo.length - 1)]);
    const depois = l.indexOf(doGrupo[doGrupo.length - 1]) + 1;
    return depois < n ? depois : i;
  }
  if (linha > 0) return l.indexOf(doGrupo[gi - cols]);
  const antes = l.indexOf(doGrupo[0]) - 1;
  return antes >= 0 ? antes : i;
}

/**
 * Roving focus over every `[data-nav]` inside `ref` (UX pattern 3): focus lands on the first one on open and stays
 * on the same element (or index) across re-renders; arrows / WASD move (grid aware), Home/End jump, Enter / Space /
 * E click the focused one, the mouse focuses on hover (all of it off while a text box has the focus: the box gets the
 * keys and handles Enter/Esc itself). Keys are caught in the capture phase with
 * stopImmediatePropagation so they never reach the game; Esc (Contextos), Tab and every other key (the screen keys of
 * `ligarTeclas`) pass through. While mounted, a requestAnimationFrame loop reads the first gamepad: d-pad / left stick move
 * (250 ms, then every 120 ms), A clicks, B calls `fecharTopo`. `onDesc` gets the focused element's `data-desc`.
 */
export function useNavegacao(ref: RefObject<HTMLElement | null>, onDesc: (d: string) => void, fecharTopo: () => void) {
  const cb = useRef({ onDesc, fecharTopo });
  cb.current = { onDesc, fecharTopo };
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    let sel = 0;
    const itens = () => [...raiz.querySelectorAll<HTMLElement>("[data-nav]")];
    const desc = (e?: HTMLElement) => cb.current.onDesc(e?.dataset.desc ?? "");
    const marcar = (i: number) => {
      const l = itens();
      if (!l.length) return desc();
      sel = Math.max(0, Math.min(i, l.length - 1));
      const e = l[sel];
      if (document.activeElement !== e) e.focus({ preventScroll: true });
      e.scrollIntoView?.({ block: "nearest" });
      desc(e);
    };
    const ativar = () => itens()[sel]?.click();
    const andar = (d: Dir) => {
      const l = itens();
      if (l.length) marcar(mover(l, Math.min(sel, l.length - 1), d));
    };

    const onKey = (e: KeyboardEvent) => {
      const c = e.code;
      if (c === "Escape" || c === "Tab" || escrevendo()) return;
      if (DIRS[c]) andar(DIRS[c]);
      else if (c === "Home") marcar(0);
      else if (c === "End") marcar(itens().length - 1);
      else if (ATIVAR.has(c)) { if (!e.repeat) ativar(); }
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onFocus = (e: FocusEvent) => {
      const l = itens();
      const i = l.indexOf(e.target as HTMLElement);
      if (i >= 0) { sel = i; desc(l[i]); }
    };
    const onHover = (e: MouseEvent) => {
      const alvo = (e.target as Element).closest?.<HTMLElement>("[data-nav]");
      if (alvo && raiz.contains(alvo) && document.activeElement !== alvo && !escrevendo()) alvo.focus({ preventScroll: true });
    };
    // re-renders: keep the focused element if it is still there, else the same index (clamped)
    const obs = new MutationObserver(() => {
      const l = itens();
      const i = l.indexOf(document.activeElement as HTMLElement);
      if (i >= 0) { sel = i; desc(l[i]); } else marcar(sel);
    });
    obs.observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-desc"] });

    // gamepad: edge-triggered buttons; whatever is held when the screen opens is ignored until released
    let raf = 0;
    let primeiro = true;
    let segurando: Dir | null = null;
    let proxima = 0;
    let antesA = false;
    let antesB = false;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const p = [...(navigator.getGamepads?.() ?? [])].find((g) => g);
      if (!p) return;
      const b = (k: number) => !!p.buttons[k]?.pressed;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      const d: Dir | null = b(12) || ay < -0.5 ? "cima" : b(13) || ay > 0.5 ? "baixo"
        : b(14) || ax < -0.5 ? "esq" : b(15) || ax > 0.5 ? "dir" : null;
      const a = b(0);
      const bb = b(1);
      if (primeiro) { primeiro = false; segurando = d; antesA = a; antesB = bb; return; }
      if (d !== segurando) { segurando = d; if (d) { andar(d); proxima = t + 250; } }
      else if (d && t >= proxima) { andar(d); proxima = t + 120; }
      if (a && !antesA) ativar();
      if (bb && !antesB) cb.current.fecharTopo();
      antesA = a;
      antesB = bb;
    };
    if (typeof requestAnimationFrame === "function" && typeof navigator.getGamepads === "function") raf = requestAnimationFrame(loop);

    addEventListener("keydown", onKey, true);
    raiz.addEventListener("focusin", onFocus);
    raiz.addEventListener("mouseover", onHover);
    marcar(0);
    return () => {
      removeEventListener("keydown", onKey, true);
      raiz.removeEventListener("focusin", onFocus);
      raiz.removeEventListener("mouseover", onHover);
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
}
