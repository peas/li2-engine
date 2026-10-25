/**
 * Writes her ops into the game's YAML files changing only what she changed: every other byte of the file (comments and
 * their alignment, blank lines, key order, quoting, flow lists) stays as it was. Each op is a surgical text edit at the
 * source ranges the `yaml` library reports: a value is replaced in its own style, a reorder moves whole blocks of lines
 * (each step with the comments right above it), a reward set to zero removes its line. After the edits the file is
 * parsed again and must equal what the engine's `aplicarEdicoes` computed; if it does not (a shape this writer does not
 * know, such as a flow map), the file falls back to the `yaml` Document rewrite, which keeps comments but may move them.
 * Conflict detection is the engine's: an op it refuses is reported and never written. Node only (the CLI
 * `scripts/aplicar-edicoes.mjs`, the dev server's save endpoint and vitest).
 */
import { isMap, isScalar, isSeq, parseDocument, Scalar, stringify, type Document, type YAMLMap, type YAMLSeq } from "yaml";
import { aplicarEdicoes, type Conflito, type Op } from "../../../src/game/edicoes/edicoes.ts";

export interface ResultadoYaml {
  fonte: string;
  aplicadas: Op[];
  conflitos: Conflito[];
  /** True when the surgical edit could not reproduce the engine's result and the Document rewrite was used instead. */
  reescrito?: boolean;
}

type Caminho = (string | number)[];
const ler = (fonte: string) => parseDocument(fonte, { keepSourceTokens: true });
const iguais = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const trocar = (fonte: string, de: number, ate: number, texto: string) => fonte.slice(0, de) + texto + fonte.slice(ate);
const inicioDaLinha = (fonte: string, i: number) => fonte.lastIndexOf("\n", i - 1) + 1;
const fimDaLinha = (fonte: string, i: number) => { const n = fonte.indexOf("\n", i); return n < 0 ? fonte.length : n + 1; };

/** A scalar written in the style it had: double quotes as JSON (as the games write two-line speeches), single quotes, or plain when plain is safe. */
function escalar(valor: unknown, estilo: Scalar["type"]): string {
  if (typeof valor !== "string") return String(valor);
  if (estilo === Scalar.QUOTE_DOUBLE || valor.includes("\n")) return JSON.stringify(valor);
  if (estilo === Scalar.QUOTE_SINGLE) return `'${valor.replace(/'/g, "''")}'`;
  const simples = stringify(valor, { lineWidth: 0 }).replace(/\n$/, "");
  return simples === valor ? valor : JSON.stringify(valor);
}

/** Replaces the value at `caminho` (an existing scalar) in place; false when there is no scalar there. */
function porValor(fonte: string, caminho: Caminho, valor: unknown): string | null {
  const no = ler(fonte).getIn(caminho, true);
  if (!isScalar(no) || !no.range) return null;
  return trocar(fonte, no.range[0], no.range[1], escalar(valor, no.type));
}

/** Sets `ao_concluir.<campo>`: in place when it exists, a new line at the end of a block `ao_concluir:` otherwise, or a new block at the end of the file. */
function recompensa(fonte: string, campo: string, valor: number): string | null {
  const doc = ler(fonte);
  const mapa = doc.get("ao_concluir", true);
  if (isMap(mapa) && (mapa as YAMLMap).has(campo)) return porValor(fonte, ["ao_concluir", campo], valor);
  if (mapa === undefined) return `${fonte.replace(/\n*$/, "\n")}ao_concluir:\n  ${campo}: ${valor}\n`;
  const m = mapa as YAMLMap;
  if (!isMap(m) || m.flow || !m.items.length || !m.range) return null;
  const primeiro = m.items[0].key as Scalar;
  const recuo = primeiro.range ? primeiro.range[0] - inicioDaLinha(fonte, primeiro.range[0]) : 2;
  const fim = fimDaLinha(fonte, m.range[1] - 1);
  return trocar(fonte, fim, fim, `${" ".repeat(recuo)}${campo}: ${valor}\n`);
}

/** Removes `ao_concluir.<campo>` (its whole lines); the `ao_concluir:` key goes too when nothing is left in it. */
function semRecompensa(fonte: string, campo: string): string | null {
  const doc = ler(fonte);
  const m = doc.get("ao_concluir", true) as YAMLMap | undefined;
  if (!isMap(m) || m.flow) return null;
  const par = m.items.find((p) => isScalar(p.key) && p.key.value === campo);
  if (!par) return fonte;
  const chave = par.key as Scalar, valor = par.value as Scalar | null;
  if (!chave.range) return null;
  const de = inicioDaLinha(fonte, chave.range[0]), ate = fimDaLinha(fonte, ((valor?.range ?? chave.range)[1]) - 1);
  if (m.items.length > 1) return trocar(fonte, de, ate, "");
  const raiz = doc.contents as YAMLMap;
  const parRaiz = raiz.items.find((p) => isScalar(p.key) && p.key.value === "ao_concluir");
  const k = parRaiz?.key as Scalar | undefined;
  if (!k?.range) return null;
  return trocar(fonte, inicioDaLinha(fonte, k.range[0]), ate, "");
}

/**
 * Reorders the steps by moving whole blocks of lines: each block is a step's lines plus the comment and blank lines
 * right above it (so a comment above a step travels with it, the first step's included).
 */
function reordenar(fonte: string, ordem: number[]): string | null {
  const doc = ler(fonte);
  const seq = doc.get("passos", true) as YAMLSeq | undefined;
  if (!isSeq(seq) || seq.flow || !seq.range) return null;
  const chave = (doc.contents as YAMLMap).items.find((p) => isScalar(p.key) && p.key.value === "passos")?.key as Scalar | undefined;
  if (!chave?.range) return null;
  const linhas = fonte.split("\n");
  const linhaDe = (i: number) => fonte.slice(0, i).split("\n").length - 1;
  const inicios = seq.items.map((it) => (it as { range?: [number, number, number] }).range?.[0]);
  if (inicios.some((i) => i === undefined)) return null;
  // the "- " of each item is on the line where its first key starts
  const linhasItem = inicios.map((i) => linhaDe(i!));
  const recuo = linhas[linhasItem[0]].search(/\S/);
  const fimSeq = linhaDe(fimDaLinha(fonte, seq.range[1] - 1)); // first line after the sequence
  // a block starts at its item line, pulled up over the comment lines right above it (a blank line stops it)
  const comeco = linhasItem.map((l, k) => {
    let c = l;
    const limite = k === 0 ? linhaDe(chave.range![0]) : linhasItem[k - 1];
    while (c - 1 > limite && /^\s*#/.test(linhas[c - 1]) && linhas[c - 1].search(/\S/) === recuo) c--;
    return c;
  });
  // the blank lines between blocks are separators that stay in their places; only the blocks move
  const blocos: string[][] = [], separadores: string[][] = [];
  comeco.forEach((c, k) => {
    const corpo = linhas.slice(c, k + 1 < comeco.length ? comeco[k + 1] : fimSeq);
    const brancas: string[] = [];
    while (corpo.length && corpo[corpo.length - 1].trim() === "") brancas.unshift(corpo.pop()!);
    blocos.push(corpo); separadores.push(brancas);
  });
  const novos = ordem.flatMap((i, k) => [...blocos[i], ...separadores[k]]);
  return [...linhas.slice(0, comeco[0]), ...novos, ...linhas.slice(fimSeq)].join("\n");
}

/** The surgical edit of one op, or null when the file has a shape it does not handle. */
function editar(fonte: string, op: Op): string | null {
  switch (op.tipo) {
    case "missao.quem": return porValor(fonte, ["quem"], op.para);
    case "missao.texto": return porValor(fonte, [op.campo], op.para);
    case "missao.recompensa": return op.para === 0 ? semRecompensa(fonte, op.campo) : recompensa(fonte, op.campo, op.para);
    case "passo.alvo": {
      const no = ler(fonte).getIn(["passos", op.passo, op.campo], true);
      if (isSeq(no)) {
        const i = (no as YAMLSeq).items.findIndex((x) => isScalar(x) && x.value === op.de);
        return i < 0 ? null : porValor(fonte, ["passos", op.passo, op.campo, i], op.para);
      }
      return porValor(fonte, ["passos", op.passo, op.campo], op.para);
    }
    case "passo.qtd": return porValor(fonte, ["passos", op.passo, "qtd"], op.para);
    case "passo.ordem": return reordenar(fonte, op.para);
    case "fala.texto": return porValor(fonte, ["falas", op.indice, "texto"], op.para);
  }
}

/** The previous writer, kept as the fallback: the `yaml` Document, which keeps comments but may move their alignment. */
function reescrever(fonte: string, ops: readonly Op[]): string {
  const doc = ler(fonte);
  const setar = (d: Document, caminho: Caminho, valor: unknown) => {
    const atual = d.getIn(caminho, true);
    const novo = isScalar(atual) ? atual : new Scalar(valor);
    novo.value = valor;
    if (typeof valor === "string" && valor.includes("\n")) novo.type = Scalar.QUOTE_DOUBLE;
    if (!isScalar(atual)) d.setIn(caminho, novo);
  };
  for (const op of ops) {
    switch (op.tipo) {
      case "missao.quem": setar(doc, ["quem"], op.para); break;
      case "missao.texto": setar(doc, [op.campo], op.para); break;
      case "missao.recompensa":
        if (op.para === 0) { doc.deleteIn(["ao_concluir", op.campo]); if ((doc.get("ao_concluir") as { items?: unknown[] } | undefined)?.items?.length === 0) doc.delete("ao_concluir"); }
        else setar(doc, ["ao_concluir", op.campo], op.para);
        break;
      case "passo.alvo": {
        const no = doc.getIn(["passos", op.passo, op.campo], true);
        const i = isSeq(no) ? (no as YAMLSeq).items.findIndex((x) => isScalar(x) && x.value === op.de) : -1;
        setar(doc, i >= 0 ? ["passos", op.passo, op.campo, i] : ["passos", op.passo, op.campo], op.para);
        break;
      }
      case "passo.qtd": setar(doc, ["passos", op.passo, "qtd"], op.para); break;
      case "passo.ordem": { const seq = doc.get("passos") as YAMLSeq; seq.items = op.para.map((i) => seq.items[i]); break; }
      case "fala.texto": setar(doc, ["falas", op.indice, "texto"], op.para); break;
    }
  }
  return doc.toString({ lineWidth: 0, doubleQuotedAsJSON: true, flowCollectionPadding: false });
}

/**
 * Applies the ops that belong to one file (`tipo` says how to read it: a quest file is one quest, a dialogue file one
 * dialogue, both keyed by `id`). Returns the new source (unchanged when nothing applied) plus what was applied/refused.
 */
export function aplicarNoYaml(fonte: string, tipo: "missao" | "dialogo", id: string, ops: readonly Op[]): ResultadoYaml {
  const valor = (ler(fonte).toJS() ?? {}) as Record<string, unknown>;
  const r = aplicarEdicoes(tipo === "missao" ? { missoes: { [id]: valor }, dialogos: {} } : { missoes: {}, dialogos: { [id]: valor } }, ops);
  if (!r.aplicadas.length) return { fonte, aplicadas: r.aplicadas, conflitos: r.conflitos };
  const esperado = { ...(tipo === "missao" ? r.conteudo.missoes[id] : r.conteudo.dialogos[id]) } as Record<string, unknown>;
  // the engine leaves an empty `ao_concluir: {}` behind when the last reward goes; the file drops the key (as before)
  if (esperado.ao_concluir && !Object.keys(esperado.ao_concluir as object).length) delete esperado.ao_concluir;
  // the engine applies the reorder last, so step indices in the other ops are the file's: the same order here
  let atual: string | null = fonte;
  for (const op of r.aplicadas) { atual = atual === null ? null : editar(atual, op); }
  if (atual !== null && iguais(ler(atual).toJS(), esperado)) return { fonte: atual, aplicadas: r.aplicadas, conflitos: r.conflitos };
  return { fonte: reescrever(fonte, r.aplicadas), aplicadas: r.aplicadas, conflitos: r.conflitos, reescrito: true };
}

/** A unified-ish line diff (`-`/`+`/` `) between two texts, for the CLI to print; empty when equal. */
export function diffLinhas(a: string, b: string): string[] {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { out.push(`  ${A[i]}`); i++; j++; }
    else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) { out.push(`- ${A[i]}`); i++; }
    else { out.push(`+ ${B[j]}`); j++; }
  }
  // only the changed lines with two of context
  const marcadas = out.map((l, k) => !l.startsWith("  ") || out.slice(Math.max(0, k - 2), k + 3).some((x) => !x.startsWith("  ")));
  return out.filter((_, k) => marcadas[k]);
}
