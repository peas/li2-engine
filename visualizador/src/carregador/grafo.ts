/**
 * Turns a `Conteudo` into the typed graph the page draws. Pure (no fs, no DOM), so it is tested directly and runs
 * wherever. Every edge points at a node that exists: an id referenced but defined nowhere becomes a placeholder node
 * (`desconhecido`) and a warning line, so the page shows the hole instead of crashing on it.
 */
import { valorMundo } from "./texto.ts";
import type { Aresta, Conteudo, Grafo, Missao, No, PassoBruto, PassoExtra, TipoAresta, TipoNo } from "./tipos.ts";

export const ROTULOS_TIPO: Record<TipoNo, string> = {
  missao: "missão", pessoa: "pessoa", lugar: "lugar", item: "item", receita: "receita", dialogo: "diálogo", poder: "poder",
  colhivel: "onde colher", cutscene: "cena", regiao: "região", mundo: "o mundo mudou",
};
export const ROTULOS_ARESTA: Record<TipoAresta, string> = {
  da: "dá a missão", destrava: "destrava", conversa: "conversa", vai_a: "vai a", fala_com: "fala com", coleta: "coleta",
  leva: "leva", leva_para: "leva para", procura_em: "procura em", recompensa: "ganha", ensina: "ensina", usa: "usa", faz: "faz",
  mora_em: "fica em", fala: "diz", colhe: "dá", colhe_em: "cresce em", dispara: "toca em", cobre: "cobre", muda: "muda", espera: "só depois de",
};

/** The YAML key each kind of edge comes from (the MDM shows it as a keyword before the edge's words). */
export const CHAVE_YAML: Record<TipoAresta, string> = {
  da: "quem", destrava: "requer", conversa: "dialogo", vai_a: "lugar", fala_com: "npc", coleta: "item", leva: "item", leva_para: "npc",
  procura_em: "lugar", recompensa: "itens", ensina: "poder", usa: "ingredientes", faz: "resultado", mora_em: "lugar", fala: "dialogo",
  colhe: "item", colhe_em: "onde", dispara: "gatilho", cobre: "quando", muda: "mundo", espera: "oferecer_apos",
};

export const noId = (tipo: TipoNo, chave: string) => `${tipo}:${chave}`;

export function montarGrafo(c: Conteudo): Grafo {
  const nos = new Map<string, No>();
  const arestas: Aresta[] = [];
  const avisos = [...c.avisos];
  const poe = (tipo: TipoNo, chave: string, nome: string, dados: unknown) => nos.set(noId(tipo, chave), { id: noId(tipo, chave), tipo, chave, nome, dados });

  for (const m of c.missoes) poe("missao", m.id, m.titulo, m);
  for (const p of c.pessoas) poe("pessoa", p.id, p.nome, p);
  for (const l of c.lugares) poe("lugar", l.id, l.id, l);
  for (const i of c.itens) poe("item", i.id, i.nome, i);
  for (const r of c.receitas) poe("receita", r.id, r.nome, r);
  for (const d of c.dialogos) poe("dialogo", d.id, d.id, d);
  for (const p of c.poderes) poe("poder", p.id, p.nome, p);
  const nomeItem = (id: string) => c.itens.find((i) => i.id === id)?.nome ?? id;
  for (const x of c.colhiveis) poe("colhivel", x.id, `${nomeItem(x.item)} em ${x.onde}`, x);
  for (const x of c.cutscenes) poe("cutscene", x.id, x.id, x);
  for (const x of c.regioes) poe("regiao", x.id, x.nome, x);

  /** The node of `chave` as a `tipo`, created as a placeholder (and a warning) when it does not exist. */
  const alvo = (tipo: TipoNo, chave: string, onde: string): string => {
    const id = noId(tipo, chave);
    if (!nos.has(id)) {
      nos.set(id, { id, tipo, chave, nome: chave, dados: null, desconhecido: true });
      avisos.push(`${onde}: ${ROTULOS_TIPO[tipo]} "${chave}" não existe em nada que eu li`);
    }
    return id;
  };
  /** A world key ("o mundo mudou") is defined by the quests that change or wait for it: never a placeholder. */
  const mundo = (chave: string) => {
    const id = noId("mundo", chave);
    if (!nos.has(id)) nos.set(id, { id, tipo: "mundo", chave, nome: chave, dados: { chave } });
    return id;
  };
  let n = 0;
  const liga = (de: string, para: string, tipo: TipoAresta, extra: Partial<Aresta> = {}) =>
    arestas.push({ id: `a${n++}`, de, para, tipo, rotulo: ROTULOS_ARESTA[tipo], ...extra });

  for (const m of c.missoes) {
    const eu = noId("missao", m.id), onde = `missão "${m.titulo}"`;
    for (const a of m.avisos) avisos.push(`${onde}: ${a}`);
    if (m.quem) liga(alvo("pessoa", m.quem, onde), eu, "da", { missao: m.id, campo: "quem" });
    for (const r of m.requer) liga(alvo("missao", r, onde), eu, "destrava");
    for (const [k, rot] of [["dialogo_oferta", "oferta"], ["dialogo_andamento", "andamento"], ["dialogo_feito", "feito"]] as const) {
      const d = m[k];
      if (d) liga(eu, alvo("dialogo", d, onde), "conversa", { rotulo: rot });
    }
    m.passos.forEach((p, i) => ligarPasso(m, p, i, eu, `${onde}, passo ${i + 1}`, alvo, liga, c.passosExtras[p.tipo]));
    const r = m.ao_concluir ?? {};
    for (const item of Object.keys(r.itens ?? {})) liga(eu, alvo("item", item, onde), "recompensa", { rotulo: `ganha ${r.itens![item]}` });
    if (typeof r.poder === "string") liga(eu, alvo("poder", r.poder, onde), "ensina");
    for (const [k, v] of Object.entries(r.mundo ?? {})) liga(eu, mundo(k), "muda", { rotulo: `muda ${k}=${valorMundo(v)}` });
    if (m.oferecer_apos) liga(mundo(m.oferecer_apos), eu, "espera");
  }
  for (const p of c.pessoas) {
    const eu = noId("pessoa", p.id), onde = `pessoa "${p.nome}"`;
    if (p.lugar) liga(eu, alvo("lugar", p.lugar, onde), "mora_em");
    if (p.dialogo) liga(eu, alvo("dialogo", p.dialogo, onde), "fala");
  }
  for (const r of c.receitas) {
    const eu = noId("receita", r.id), onde = `receita "${r.nome}"`;
    for (const [item, qtd] of Object.entries(r.ingredientes)) liga(alvo("item", item, onde), eu, "usa", { rotulo: `${qtd}×` });
    if (r.resultado) liga(eu, alvo("item", r.resultado, onde), "faz");
  }
  for (const x of c.colhiveis) {
    const eu = noId("colhivel", x.id), onde = `colhiveis.yaml "${x.id}"`;
    liga(eu, alvo("item", x.item, onde), "colhe");
    liga(eu, alvo("lugar", x.onde, onde), "colhe_em", { rotulo: `cresce em (${x.arranjo})` });
  }
  for (const x of c.cutscenes) {
    const eu = noId("cutscene", x.id), onde = `cena "${x.id}"`, g = x.gatilho;
    if (g?.lugar) liga(eu, alvo("lugar", g.lugar, onde), "dispara", { rotulo: `toca perto de${g.raio ? ` (${g.raio} m)` : ""}` });
    if (g?.missao) liga(eu, alvo("missao", g.missao, onde), "dispara", { rotulo: g.passo ? `toca no passo ${g.passo}` : "toca na missão" });
  }
  for (const x of c.regioes) {
    const eu = noId("regiao", x.id), onde = `região "${x.nome}"`;
    for (const q of x.quando) if (typeof q.perto_de === "string") liga(eu, alvo("lugar", q.perto_de, onde), "cobre");
  }
  return { jogo: c.jogo, nos: [...nos.values()], arestas, avisos, lidos: c.lidos, passosExtras: c.passosExtras };
}

type Alvo = (tipo: TipoNo, chave: string, onde: string) => string;
type Liga = (de: string, para: string, tipo: TipoAresta, extra?: Partial<Aresta>) => void;

/** The edge each field type of a game's own step draws (jogo.yaml `passos_extras[tipo].campos`). */
const ARESTA_DO_CAMPO: Partial<Record<NonNullable<PassoExtra["campos"]>[string], [TipoNo, TipoAresta]>> = {
  lugar: ["lugar", "vai_a"], pessoa: ["pessoa", "fala_com"], item: ["item", "coleta"],
};

/**
 * What each step type points at: the engine's four by their fields; a game's own type by its manifest `campos`
 * (lugar → vai a, pessoa → fala com, item → coleta); without a manifest, by the field names `lugar`, `npc`, `item`.
 */
function ligarPasso(m: Missao, p: PassoBruto, i: number, eu: string, onde: string, alvo: Alvo, liga: Liga, extra?: PassoExtra) {
  const ex = { missao: m.id, passo: i };
  const lugares = Array.isArray(p.lugar) ? p.lugar : p.lugar ? [p.lugar] : [];
  const dialogos = new Set<string>();
  // every `dialogo`, `dialogo_<algo>` field (dialogo_falta of levar, a game's own dialogo_monta...)
  for (const [k, v] of Object.entries(p)) if (/^dialogo(_|$)/.test(k) && typeof v === "string") dialogos.add(v);
  for (const d of Object.values(p.dialogos ?? {})) dialogos.add(d);
  if (extra?.campos) {
    for (const [k, t] of Object.entries(extra.campos)) {
      const a = ARESTA_DO_CAMPO[t], v = p[k];
      if (!a || v === undefined) continue;
      for (const chave of Array.isArray(v) ? v : [v]) liga(eu, alvo(a[0], String(chave), onde), a[1], { ...ex, campo: k });
    }
    for (const d of dialogos) liga(eu, alvo("dialogo", d, onde), "conversa", { ...ex, rotulo: `passo ${i + 1}` });
    return;
  }
  switch (p.tipo) {
    case "ir":
      for (const l of lugares) liga(eu, alvo("lugar", l, onde), "vai_a", { ...ex, campo: "lugar" });
      break;
    case "falar":
      if (p.npc) liga(eu, alvo("pessoa", p.npc, onde), "fala_com", { ...ex, campo: "npc" });
      break;
    case "coletar":
      if (p.item) liga(eu, alvo("item", p.item, onde), "coleta", { ...ex, campo: "item", rotulo: `coleta ${p.qtd ?? ""}`.trim() });
      break;
    case "levar":
      if (p.item) liga(eu, alvo("item", p.item, onde), "leva", { ...ex, campo: "item", rotulo: `leva ${p.qtd ?? ""}`.trim() });
      if (p.npc) liga(eu, alvo("pessoa", p.npc, onde), "leva_para", { ...ex, campo: "npc" });
      break;
    default:
      for (const l of lugares) liga(eu, alvo("lugar", l, onde), "vai_a", { ...ex, campo: "lugar" });
      if (p.npc) liga(eu, alvo("pessoa", p.npc, onde), "fala_com", { ...ex, campo: "npc" });
      if (p.item) liga(eu, alvo("item", p.item, onde), "coleta", { ...ex, campo: "item" });
  }
  for (const d of dialogos) liga(eu, alvo("dialogo", d, onde), "conversa", { ...ex, rotulo: `passo ${i + 1}` });
}

/** The targets of one step, in the order the story mode shows them (what the arrows point at). */
export function alvosDoPasso(g: Grafo, missao: string, passo: number): Aresta[] {
  return g.arestas.filter((a) => a.missao === missao && a.passo === passo);
}

/** Neighbour node ids of `id` (both directions), unique. */
export function vizinhos(g: Grafo, id: string): string[] {
  const s = new Set<string>();
  for (const a of g.arestas) { if (a.de === id) s.add(a.para); else if (a.para === id) s.add(a.de); }
  return [...s];
}
