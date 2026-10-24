import { useContext, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import { CtxTelas } from "./contexto";
import { Icone, piscar, Tela } from "./Tela";

/**
 * The generic appearance screen (`aparencia`, from the Dragão's C screen without its catalogue, shop or showcase
 * built in): the game describes **sections** (one per creature / person), each with an optional name, colour rows
 * (ready colours + the free picker) and slot rows (variants, some locked with a reason). Every pick calls the game's
 * `mudar` at once (the game paints the model and keeps it in its store) and the screen re-renders. Registered by
 * `montarTelas` as `aparencia` only when `deps.aparencia` exists.
 */
export interface CorAparencia {
  parte: string;
  /** How the row is called ("corpo", "cabelo"). */
  nome: string;
  /** Ready colours (hex). */
  cores: readonly string[];
  /** The colour in use; null = none chosen (the `semCor` button is on). */
  atual: string | null;
  mudar(cor: string | null): void;
  /** Label of a first button that sets null ("a da loja"); none = no such button. */
  semCor?: string;
  /** What that button means (its `data-desc`). */
  descSemCor?: string;
  /** The free colour picker after the ready ones (default true). */
  livre?: boolean;
}

export interface VarianteAparencia {
  /** null = nothing in the slot. */
  id: string | null;
  nome: string;
  icone?: string;
  trancada?: boolean;
  /** Why it is locked ("ganhe na loja"). */
  motivo?: string;
}

export interface SlotAparencia {
  slot: string;
  nome: string;
  variantes: readonly VarianteAparencia[];
  atual: string | null;
  mudar(id: string | null): void;
}

export interface NomeAparencia {
  valor: string;
  /** False = refused (empty, too long): the box shakes and stays open. */
  mudar(v: string): boolean | void;
  /** Max letters (default 16). */
  max?: number;
}

export interface SecaoAparencia {
  titulo: string;
  icone?: string;
  nome?: NomeAparencia;
  cores?: readonly CorAparencia[];
  slots?: readonly SlotAparencia[];
}

/** A showcase canvas (the Dragão's `VitrineApi` fits): a small scene of the creature, drawn while the screen is open. */
export interface VitrineAparencia {
  readonly canvas: HTMLCanvasElement;
  resize(width: number, height: number): void;
  start(): void;
  stop(): void;
}

/** What the screen reads from `deps.aparencia`. */
export interface DepsAparencia {
  /** Screen title (default "Aparência"). */
  titulo?: string;
  /** The sections, read again after every pick (so `atual` is always fresh). */
  secoes(): SecaoAparencia[];
  /** Optional showcase on the left. */
  vitrine?: () => Promise<VitrineAparencia>;
}

const CSS_APARENCIA = `
.tl-cor { all: unset; box-sizing: border-box; width: 100%; max-width: 44px; aspect-ratio: 1; border-radius: 50%; cursor: pointer;
  border: 3px solid rgba(255, 255, 255, .35); display: inline-grid; place-items: center; font-size: 20px; font-weight: 900;
  color: #fff; text-shadow: 0 0 3px #000; }
.tl-cor:focus { border-color: #ffd23f; box-shadow: 0 0 0 3px #ffd23f; }
.tl-cor.tl-on { border-color: #fff; }
input.tl-cor { padding: 0; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
input.tl-cor::-webkit-color-swatch-wrapper { padding: 0; }
input.tl-cor::-webkit-color-swatch { border: 0; border-radius: 50%; }
.tl-cores { display: grid; grid-template-columns: repeat(11, minmax(0, 44px)); gap: 6px; }
.tl-rotulo { grid-column: 1 / -1; font-size: 17px; font-weight: 700; margin-top: 6px; }
.tl-ap { display: flex; gap: 16px; max-height: min(640px, calc(86vh - 150px)); }
.tl-vitrine { flex: 0 0 42%; min-height: 240px; border-radius: 14px; background: rgba(0, 0, 0, .25); display: grid;
  place-items: center; overflow: hidden; position: relative; }
.tl-vitrine canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.tl-ap-lado { flex: 1; overflow-y: auto; padding: 4px; }
.tl-opcoes { display: flex; flex-wrap: wrap; gap: 8px; }
.tl-ap-nome { display: flex; gap: 8px; align-items: stretch; margin: 4px 0 6px; }
.tl-ap-nome > .tl-botao { flex: none; }
.tl-ap-nome .tl-ap-nome-valor { flex: 1; font: 700 24px system-ui, sans-serif; display: flex; align-items: center; }
input.tl-nome-input { box-sizing: border-box; flex: 1; min-height: 64px; padding: 8px 16px; border-radius: 14px; font: 700 24px system-ui, sans-serif;
  color: #2b1d3a; background: #fff8e1; border: 3px solid #ffd23f; outline: none; }
`;
let cssPosto = false;
function porCss() {
  if (cssPosto || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = CSS_APARENCIA;
  document.head.appendChild(style);
  cssPosto = true;
}

/** The name row: the name and a pencil; the pencil turns it into a text box (Enter / ✔️ / leaving keep, Esc gives up). */
function Nome({ secao, depois }: { secao: SecaoAparencia; depois: () => void }) {
  const n = secao.nome!;
  const [editando, setEditando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fim = useRef(false);
  useLayoutEffect(() => {
    if (editando) { fim.current = false; input.current?.focus(); input.current?.select(); }
  }, [editando]);
  const terminar = (guardar: boolean) => {
    if (fim.current) return;
    if (guardar && n.mudar((input.current?.value ?? "").trim()) === false) { piscar(input.current, "tl-nao"); return; }
    fim.current = true;
    setEditando(false);
    depois();
  };
  if (editando) {
    return (
      <div class="tl-ap-nome">
        <input ref={input} type="text" class="tl-nome-input" data-nav maxLength={n.max ?? 16} defaultValue={n.valor}
          aria-label={`novo nome de ${n.valor}`} data-desc="escreva o nome · Enter guarda · Esc desiste"
          onKeyDown={(e) => {
            e.stopPropagation(); // typing never reaches the game
            if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); terminar(true); }
            else if (e.code === "Escape") { e.preventDefault(); terminar(false); }
          }}
          onBlur={() => terminar(true)} />
        <button type="button" class="tl-botao" data-nav data-desc="guardar o nome novo"
          onMouseDown={(e) => e.preventDefault()} onClick={() => terminar(true)}>✔️ guardar</button>
      </div>
    );
  }
  return (
    <div class="tl-ap-nome">
      <span class="tl-ap-nome-valor">{n.valor}</span>
      <button type="button" class="tl-botao" data-nav data-nome={secao.titulo} data-desc={`Enter: mudar o nome de ${n.valor}`}
        onClick={() => setEditando(true)}>✏️ mudar o nome</button>
    </div>
  );
}

function Cores({ cores, depois }: { cores: readonly CorAparencia[]; depois: () => void }) {
  const cols = Math.max(...cores.map((c) => c.cores.length + (c.semCor ? 1 : 0) + (c.livre === false ? 0 : 1)));
  const mudar = (c: CorAparencia, cor: string | null) => { c.mudar(cor); depois(); };
  return (
    <div class="tl-cores" data-cols={cols} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 44px))` }}>
      {cores.map((c) => [
        <div key={`r-${c.parte}`} class="tl-rotulo">{c.nome}</div>,
        ...(c.semCor ? [
          <button key={`${c.parte}-nada`} type="button" data-nav data-parte={c.parte} data-cor="" class={`tl-cor${c.atual === null ? " tl-on" : ""}`}
            style={{ background: "repeating-linear-gradient(45deg, #777 0 6px, #aaa 6px 12px)" }} aria-label={`${c.nome}: ${c.semCor}`}
            data-desc={`${c.nome}: ${c.semCor}${c.descSemCor ? ` (${c.descSemCor})` : ""}`} onClick={() => mudar(c, null)}>{c.atual === null ? "✓" : ""}</button>,
        ] : []),
        ...c.cores.map((cor) => (
          <button key={`${c.parte}-${cor}`} type="button" data-nav data-parte={c.parte} data-cor={cor} class={`tl-cor${c.atual === cor ? " tl-on" : ""}`}
            style={{ background: cor }} aria-label={`${c.nome} ${cor}`} data-desc={`cor: ${c.nome}`}
            onClick={() => mudar(c, cor)}>{c.atual === cor ? "✓" : ""}</button>
        )),
        ...(c.livre === false ? [] : [
          <input key={`${c.parte}-livre`} type="color" data-nav data-parte={c.parte} class="tl-cor" value={c.atual ?? "#ffffff"}
            aria-label={`outra cor: ${c.nome}`} data-desc={`qualquer cor: ${c.nome} (abre a paleta)`}
            onInput={(e) => mudar(c, (e.currentTarget as HTMLInputElement).value)} />,
        ]),
      ])}
    </div>
  );
}

function Slots({ slots, depois }: { slots: readonly SlotAparencia[]; depois: () => void }) {
  return (
    <>
      {slots.map((s) => (
        <div key={s.slot}>
          <div class="tl-rotulo">{s.nome}</div>
          <div class="tl-opcoes">
            {s.variantes.map((v) => {
              const on = s.atual === v.id;
              return (
                <button key={v.id ?? "nenhum"} type="button" data-nav data-slot={s.slot} data-variante={v.id ?? ""} aria-disabled={!!v.trancada}
                  class={`tl-botao${on ? " tl-on" : ""}${v.trancada ? " tl-cinza" : ""}`}
                  data-desc={v.trancada ? `${v.nome}: ${v.motivo ?? "ainda trancado"}` : on ? `${v.nome}: você está usando` : `${v.nome}: Enter veste`}
                  onClick={(e) => { if (v.trancada) return piscar(e.currentTarget, "tl-nao"); s.mudar(v.id); depois(); }}>
                  {v.trancada ? <Icone nome="cadeado" size={28} /> : v.icone && <Icone nome={v.icone} size={28} />}
                  {v.nome}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/** The showcase box: mounts the canvas, fits it, starts it; stops and removes it on close. */
function Vitrine({ criar }: { criar: () => Promise<VitrineAparencia> }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"carregando" | "pronta" | "erro">("carregando");
  // layout effect: its cleanup runs at once on close (preact defers passive cleanups), so the showcase stops now
  useLayoutEffect(() => {
    let vivo = true;
    let api: VitrineAparencia | null = null;
    let obs: ResizeObserver | undefined;
    criar().then((x) => {
      if (!vivo || !caixa.current) return;
      api = x;
      const div = caixa.current;
      div.appendChild(x.canvas);
      const medir = () => x.resize(div.clientWidth || 300, div.clientHeight || 360);
      medir();
      if (typeof ResizeObserver !== "undefined") { obs = new ResizeObserver(medir); obs.observe(div); }
      x.start();
      setEstado("pronta");
    }, () => { if (vivo) setEstado("erro"); });
    return () => { vivo = false; obs?.disconnect(); api?.stop(); api?.canvas.remove(); };
  }, []);
  return (
    <div class="tl-vitrine" ref={caixa}>
      {estado !== "pronta" && <span class="tl-estado">{estado === "erro" ? "a vitrine não carregou" : "carregando..."}</span>}
    </div>
  );
}

export function TelaAparencia() {
  porCss();
  const { deps } = useContext(CtxTelas);
  const ap = deps.aparencia as DepsAparencia | undefined;
  const [, atualizar] = useReducer((n: number) => n + 1, 0);
  const depois = () => atualizar(0);
  const secoes = ap?.secoes() ?? [];
  return (
    <Tela titulo={ap?.titulo ?? "Aparência"} cabecalho={deps.cabecalho?.()} largura={ap?.vitrine ? 1040 : 720}>
      <div class="tl-ap">
        {ap?.vitrine && <Vitrine criar={ap.vitrine} />}
        <div class="tl-ap-lado">
          {secoes.length === 0 && <div class="tl-vazio">Nada para mudar por enquanto.</div>}
          {secoes.map((s) => (
            <div key={s.titulo} data-secao={s.titulo}>
              <div class="tl-secao">{s.icone && <Icone nome={s.icone} size={26} />} {s.titulo}</div>
              {s.nome && <Nome secao={s} depois={depois} />}
              {s.cores && s.cores.length > 0 && <Cores cores={s.cores} depois={depois} />}
              {s.slots && s.slots.length > 0 && <Slots slots={s.slots} depois={depois} />}
            </div>
          ))}
        </div>
      </div>
    </Tela>
  );
}
