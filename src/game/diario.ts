import type { Emitter } from "nanoevents";

/**
 * The play diary: COUNTERS of what the child actually uses, aggregated from the event bus, so an adult can later see
 * which quests, items and features get played and which never do (Paulo, 2026-11-01). It is not a log: every counter
 * saturates at the size of the catalogues and the session list has a ceiling, so the whole thing stays a few KB in
 * its own localStorage key next to the save (`<jogo>.diario`), written at the same safe moments (`salvou`) and when the
 * tab hides. Nothing personal: ids of quests, items and features, counts and timestamps.
 *
 * What it counts by itself, from `EventosBase`: items (`pegouItem`, `usouItem`), quests (started, completed, played
 * minutes from start to completion, how many times restarted), `achou`/`abriu`/`entregou` (places and NPCs), `venceu`,
 * `dormiu`, cutscenes (watched / skipped) and `usouRecurso(nome)`: a game emits that one where a feature is used that
 * no other event covers (took off, opened the map, cooked). The game's OWN events join through `contar`: the event
 * name is counted, and when its first argument is a string the pair `nome:arg` too (`poderUsado:fogo`).
 *
 * Reading: `exportarJSON()` (the adults' panel offers it as a download) and, offline, the engine's `scripts/diario.mjs`.
 */
export interface Diario {
  versao: 1;
  jogo: string;
  criado: number;
  atualizado: number;
  /** Seconds of play across every session (wall clock while the tab is open). */
  segundos: number;
  itens: Record<string, { pegou: number; usou: number; primeira: number; ultima: number }>;
  missoes: Record<string, {
    iniciou: number; concluiu: number;
    /** Play seconds (the diary's `segundos`) at the first start / at completion; their difference is the time it took. */
    iniciadaAos?: number; concluidaAos?: number;
    /** Wall clock of the first start and of the completion. */
    primeiraVez?: number; concluidaEm?: number;
    passos: number;
  }>;
  /** Feature uses: `usouRecurso(nome)`, the game's `contar` events (`nome` and `nome:arg`). */
  recursos: Record<string, number>;
  /** `achou(objeto)`, `abriu(lugar)`, `entregou(npc)`: how often. */
  lugares: Record<string, number>;
  venceu: Record<string, number>;
  cenas: Record<string, { viu: number; pulou: number }>;
  dormiu: number;
  /** The last `MAX_SESSOES` sessions, oldest first; `fim` is refreshed at every write. */
  sessoes: { inicio: number; fim: number; versaoJogo?: number; dia?: number }[];
}

export const MAX_SESSOES = 40;
/** A new tab less than this after the previous session ended continues it (a reload, not a new sitting). */
const JUNTAR_SESSOES_MS = 5 * 60_000;

export interface ConfigDiario {
  /** localStorage key ("tresilhas.diario"). */
  chave: string;
  /** The game's id, kept inside the file so a folder of exports tells them apart. */
  jogo: string;
  /** The game's bus (the engine's `Eventos` or any nanoevents emitter with the base events). */
  eventos: Emitter<any>;
  /** The game's own events to count under `recursos` (see above). */
  contar?: readonly string[];
  /** The current version of the game (its novidades' `VERSAO`), stamped on the session. */
  versaoJogo?: number;
  /** The current day of the game, stamped on the session at every write. */
  dia?: () => number | undefined;
  /** Clock and storage, for tests. */
  agora?: () => number;
  storage?: Storage;
}

export interface DiarioDoJogo {
  /** The diary as it is now (a live reference: read, don't keep). */
  estado(): Diario;
  /** Write it now (also done on `salvou` and when the tab hides). */
  gravar(): void;
  exportarJSON(): string;
  /** Download it as `<jogo>-diario-<date>.json` (browser only). */
  baixar(): void;
  /** Forget everything (the adults' panel). */
  zerar(): void;
  /** Stop listening (tests). */
  parar(): void;
}

function vazio(jogo: string, agora: number): Diario {
  return { versao: 1, jogo, criado: agora, atualizado: agora, segundos: 0, itens: {}, missoes: {}, recursos: {}, lugares: {}, venceu: {}, cenas: {}, dormiu: 0, sessoes: [] };
}

const inc = (mapa: Record<string, number>, chave: string, n = 1) => { mapa[chave] = (mapa[chave] ?? 0) + n; };

export function criarDiario(cfg: ConfigDiario): DiarioDoJogo {
  const agora = cfg.agora ?? (() => Date.now());
  const storage = cfg.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const d = carregar();
  const inicioSessao = agora();
  /** Play seconds before this session (the sessions already closed). */
  const segundosAntes = d.segundos;
  const sessao = abrirSessao();

  function carregar(): Diario {
    try {
      const raw = storage?.getItem(cfg.chave);
      if (raw) {
        const lido = JSON.parse(raw) as Diario;
        if (lido && lido.versao === 1 && lido.jogo === cfg.jogo) return lido;
      }
    } catch { /* corrupt or blocked: start fresh */ }
    return vazio(cfg.jogo, agora());
  }

  function abrirSessao() {
    const ultima = d.sessoes[d.sessoes.length - 1];
    if (ultima && inicioSessao - ultima.fim < JUNTAR_SESSOES_MS) {
      // a reload: carry on; its seconds were already summed, so count only from now on
      return ultima;
    }
    const nova = { inicio: inicioSessao, fim: inicioSessao, versaoJogo: cfg.versaoJogo, dia: cfg.dia?.() };
    d.sessoes.push(nova);
    if (d.sessoes.length > MAX_SESSOES) d.sessoes.splice(0, d.sessoes.length - MAX_SESSOES);
    return nova;
  }

  /** Play seconds now: the closed sessions plus this one so far. */
  const segundos = () => segundosAntes + Math.round((agora() - inicioSessao) / 1000);

  function gravar() {
    const t = agora();
    sessao.fim = t;
    if (cfg.versaoJogo !== undefined) sessao.versaoJogo = cfg.versaoJogo;
    const dia = cfg.dia?.();
    if (dia !== undefined) sessao.dia = dia;
    d.segundos = segundos();
    d.atualizado = t;
    try { storage?.setItem(cfg.chave, JSON.stringify(d)); } catch { /* storage blocked */ }
  }

  function item(id: string) {
    const t = agora();
    return (d.itens[id] ??= { pegou: 0, usou: 0, primeira: t, ultima: t });
  }
  const missao = (id: string) => (d.missoes[id] ??= { iniciou: 0, concluiu: 0, passos: 0 });

  const offs: (() => void)[] = [];
  const on = (nome: string, fn: (...args: any[]) => void) => offs.push(cfg.eventos.on(nome, fn));

  on("pegouItem", (id: string, qtd = 1) => { const i = item(id); i.pegou += qtd; i.ultima = agora(); });
  on("usouItem", (id: string, qtd = 1) => { const i = item(id); i.usou += qtd; i.ultima = agora(); });
  on("missaoIniciada", (id: string) => {
    const m = missao(id);
    m.iniciou += 1;
    if (m.primeiraVez === undefined) { m.primeiraVez = agora(); m.iniciadaAos = segundos(); }
  });
  on("missaoPasso", (id: string) => { missao(id).passos += 1; });
  on("missaoConcluida", (id: string) => {
    const m = missao(id);
    m.concluiu += 1;
    if (m.concluidaEm === undefined) { m.concluidaEm = agora(); m.concluidaAos = segundos(); }
  });
  on("achou", (objeto: string) => inc(d.lugares, objeto));
  on("abriu", (lugar: string) => inc(d.lugares, lugar));
  on("entregou", (npc: string) => inc(d.lugares, npc));
  on("venceu", (inimigo: string, qtd = 1) => inc(d.venceu, inimigo, qtd));
  on("dormiu", () => { d.dormiu += 1; });
  on("cenaAcabou", (id: string, pulada: boolean) => {
    const c = (d.cenas[id] ??= { viu: 0, pulou: 0 });
    if (pulada) c.pulou += 1; else c.viu += 1;
  });
  on("usouRecurso", (nome: string) => inc(d.recursos, nome));
  for (const nome of cfg.contar ?? []) {
    on(nome, (arg: unknown) => {
      inc(d.recursos, nome);
      if (typeof arg === "string") inc(d.recursos, `${nome}:${arg}`);
    });
  }
  on("salvou", gravar);

  const aoEsconder = () => { if (document.visibilityState === "hidden") gravar(); };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", aoEsconder);
    addEventListener("pagehide", gravar);
  }

  return {
    estado: () => d,
    gravar,
    exportarJSON: () => { gravar(); return JSON.stringify(d, null, 2); },
    baixar() {
      const texto = JSON.stringify({ ...d, segundos: segundos(), atualizado: agora() }, null, 2);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      a.download = `${cfg.jogo}-diario-${new Date(agora()).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    zerar() {
      const fresco = vazio(cfg.jogo, agora());
      Object.assign(d, fresco, { sessoes: [] });
      for (const k of Object.keys(d) as (keyof Diario)[]) if (!(k in fresco)) delete d[k];
      try { storage?.removeItem(cfg.chave); } catch { /* ignore */ }
    },
    parar() {
      for (const off of offs) off();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", aoEsconder);
        removeEventListener("pagehide", gravar);
      }
    },
  };
}
