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

/** Sets `ao_concluir.<campo>`: in place or as a new entry of `ao_concluir` (block or flow), or a new block at the end of the file. */
function recompensa(fonte: string, campo: string, valor: number): string | null {
  if (ler(fonte).get("ao_concluir", true) === undefined) return `${fonte.replace(/\n*$/, "\n")}ao_concluir:\n  ${campo}: ${valor}\n`;
  return campoNoMapa(fonte, ["ao_concluir"], campo, valor);
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
 * The steps as blocks of lines: each block is a step's lines plus the comment lines right above it (a blank line stops
 * it); the blank lines after a block are its separator, which stays in its place when the blocks move.
 */
interface Passos { linhas: string[]; antes: string[]; depois: string[]; blocos: string[][]; separadores: string[][]; recuo: number }
function passosEmBlocos(fonte: string): Passos | null {
  const doc = ler(fonte);
  const seq = doc.get("passos", true) as YAMLSeq | undefined;
  if (!isSeq(seq) || seq.flow || !seq.range || !seq.items.length) return null;
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
  const comeco = linhasItem.map((l, k) => {
    let c = l;
    const limite = k === 0 ? linhaDe(chave.range![0]) : linhasItem[k - 1];
    while (c - 1 > limite && /^\s*#/.test(linhas[c - 1]) && linhas[c - 1].search(/\S/) === recuo) c--;
    return c;
  });
  const blocos: string[][] = [], separadores: string[][] = [];
  comeco.forEach((c, k) => {
    const corpo = linhas.slice(c, k + 1 < comeco.length ? comeco[k + 1] : fimSeq);
    const brancas: string[] = [];
    while (corpo.length && corpo[corpo.length - 1].trim() === "") brancas.unshift(corpo.pop()!);
    blocos.push(corpo); separadores.push(brancas);
  });
  return { linhas, antes: linhas.slice(0, comeco[0]), depois: linhas.slice(fimSeq), blocos, separadores, recuo };
}
const juntarPassos = (p: Passos, blocos: string[][], separadores: string[][]) =>
  [...p.antes, ...blocos.flatMap((b, k) => [...b, ...(separadores[k] ?? [])]), ...p.depois].join("\n");

/** Reorders the steps by moving whole blocks (`ordem[j]` = the current position of the step that goes to j). */
function reordenar(fonte: string, ordem: number[]): string | null {
  const p = passosEmBlocos(fonte);
  if (!p || ordem.length !== p.blocos.length) return null;
  return juntarPassos(p, ordem.map((i) => p.blocos[i]), p.separadores);
}

/** Removes the step at `indice` (its block, with the comments above it); the separators keep their places. */
function apagarPasso(fonte: string, indice: number): string | null {
  const p = passosEmBlocos(fonte);
  if (!p || !p.blocos[indice] || p.blocos.length < 2) return null;
  const blocos = p.blocos.filter((_, k) => k !== indice);
  const separadores = p.separadores.filter((_, k) => k !== (indice === p.blocos.length - 1 ? indice - 1 : indice));
  return juntarPassos(p, blocos, separadores);
}

/** A new step at the end of `passos`, written like the others: `- tipo: x` and one key per line under it. */
function novoPasso(fonte: string, passo: Record<string, unknown>): string | null {
  const p = passosEmBlocos(fonte);
  if (!p) return null;
  const r = " ".repeat(p.recuo);
  const chaves = ["tipo", ...Object.keys(passo).filter((k) => k !== "tipo")];
  const bloco = chaves.map((k, i) => `${i === 0 ? `${r}- ` : `${r}  `}${k}: ${escalar(passo[k], Scalar.PLAIN)}`);
  const separadores = [...p.separadores];
  // the old last step's trailing blank lines stay at the very end, after the new step
  const fim = separadores.pop() ?? [];
  return juntarPassos(p, [...p.blocos, bloco], [...separadores, [], fim]);
}

/** Sets `campo` in a block map at `caminho` (in place when it exists, a new line after the map's last line otherwise). */
function campoNoMapa(fonte: string, caminho: Caminho, campo: string, valor: unknown): string | null {
  const doc = ler(fonte);
  const mapa = caminho.length ? doc.getIn(caminho, true) : doc.contents;
  if (!isMap(mapa) || !mapa.range) return null;
  const m = mapa as YAMLMap;
  if (m.has(campo)) return porValor(fonte, [...caminho, campo], valor);
  if (!m.items.length) return null;
  if (m.flow) {
    // `{ a: 1 }` → `{ a: 1, b: 2 }`: right after the last value, keeping the braces' own spacing
    const ult = m.items[m.items.length - 1];
    const fimValor = ((ult.value as Scalar | null)?.range ?? (ult.key as Scalar).range)?.[1];
    return fimValor === undefined ? null : trocar(fonte, fimValor, fimValor, `, ${campo}: ${escalar(valor, Scalar.PLAIN)}`);
  }
  const primeiro = m.items[0].key as Scalar;
  if (!primeiro.range) return null;
  const recuo = primeiro.range[0] - inicioDaLinha(fonte, primeiro.range[0]);
  const ultimo = m.items[m.items.length - 1];
  const fimUltimo = ((ultimo.value as Scalar | null)?.range ?? (ultimo.key as Scalar).range)!;
  const fim = fimDaLinha(fonte, fimUltimo[1] - 1);
  return trocar(fonte, fim, fim, `${" ".repeat(recuo)}${campo}: ${escalar(valor, Scalar.PLAIN)}\n`);
}

/** An item of the reward (`ao_concluir.itens.<item>`): set, added (creating `itens:` or `ao_concluir:` as needed) or removed at 0. */
function itemDoPremio(fonte: string, item: string, qtd: number): string | null {
  const doc = ler(fonte);
  const ao = doc.get("ao_concluir", true);
  const itens = isMap(ao) ? (ao as YAMLMap).get("itens", true) : undefined;
  if (qtd === 0) {
    if (!isMap(itens)) return null;
    const m = itens as YAMLMap;
    if (m.flow) return null;
    const par = m.items.find((p) => isScalar(p.key) && p.key.value === item);
    if (!par) return fonte;
    if (m.items.length > 1) return removerLinhasDoPar(fonte, par.key as Scalar, par.value as Scalar | null);
    // the last item goes: the "itens:" line too
    const parItens = (ao as YAMLMap).items.find((p) => isScalar(p.key) && p.key.value === "itens")!;
    return removerLinhasDoPar(fonte, parItens.key as Scalar, par.value as Scalar | null);
  }
  if (isMap(itens)) return campoNoMapa(fonte, ["ao_concluir", "itens"], item, qtd);
  if (itens !== undefined) return null;
  if (isMap(ao)) {
    const m = ao as YAMLMap;
    if (m.flow || !m.items.length) return null;
    const primeiro = m.items[0].key as Scalar;
    const recuo = primeiro.range ? primeiro.range[0] - inicioDaLinha(fonte, primeiro.range[0]) : 2;
    const ultimo = m.items[m.items.length - 1];
    const fimUltimo = ((ultimo.value as Scalar | null)?.range ?? (ultimo.key as Scalar).range)!;
    const fim = fimDaLinha(fonte, fimUltimo[1] - 1);
    return trocar(fonte, fim, fim, `${" ".repeat(recuo)}itens:\n${" ".repeat(recuo * 2)}${item}: ${qtd}\n`);
  }
  if (ao !== undefined) return null;
  return `${fonte.replace(/\n*$/, "\n")}ao_concluir:\n  itens:\n    ${item}: ${qtd}\n`;
}

/** Removes the whole lines from `chave`'s line to the end of `valor` (or of the key when there is no value). */
function removerLinhasDoPar(fonte: string, chave: Scalar, valor: Scalar | null): string | null {
  if (!chave.range) return null;
  const fim = (valor?.range ?? chave.range)[1];
  return trocar(fonte, inicioDaLinha(fonte, chave.range[0]), fimDaLinha(fonte, fim - 1), "");
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
    case "passo.campo": return campoNoMapa(fonte, ["passos", op.passo], op.campo, op.para);
    case "missao.dificuldade": return campoNoMapa(fonte, [], "dificuldade", op.para);
    case "missao.item": return itemDoPremio(fonte, op.item, op.para);
    case "passo.novo": return novoPasso(fonte, op.para);
    case "passo.apagar": return apagarPasso(fonte, op.passo);
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
      case "passo.campo": setar(doc, ["passos", op.passo, op.campo], op.para); break;
      case "missao.dificuldade": setar(doc, ["dificuldade"], op.para); break;
      case "missao.item":
        if (op.para === 0) {
          doc.deleteIn(["ao_concluir", "itens", op.item]);
          if ((doc.getIn(["ao_concluir", "itens"]) as { items?: unknown[] } | undefined)?.items?.length === 0) doc.deleteIn(["ao_concluir", "itens"]);
          if ((doc.get("ao_concluir") as { items?: unknown[] } | undefined)?.items?.length === 0) doc.delete("ao_concluir");
        } else setar(doc, ["ao_concluir", "itens", op.item], op.para);
        break;
      case "passo.novo": (doc.get("passos") as YAMLSeq).add(doc.createNode(op.para)); break;
      case "passo.apagar": (doc.get("passos") as YAMLSeq).delete(op.passo); break;
    }
  }
  return doc.toString({ lineWidth: 0, doubleQuotedAsJSON: true, flowCollectionPadding: false });
}

/**
 * The applied ops in the order the file can take them: field ops first (their step indices are the file's), new steps
 * (appended at the end), deleted steps from the last to the first (so the indices still hold), and the reorder with its
 * numbering (originals, then new steps after them) translated to the positions the blocks have by then.
 */
function paraReproduzir(aplicadas: readonly Op[], originais: number): Op[] {
  const campos = aplicadas.filter((o) => o.tipo !== "passo.novo" && o.tipo !== "passo.apagar" && o.tipo !== "passo.ordem");
  const novos = aplicadas.filter((o): o is Op & { tipo: "passo.novo" } => o.tipo === "passo.novo").sort((a, b) => a.n - b.n);
  const apagar = aplicadas.filter((o): o is Op & { tipo: "passo.apagar" } => o.tipo === "passo.apagar").sort((a, b) => b.passo - a.passo);
  const ordem = aplicadas.filter((o): o is Op & { tipo: "passo.ordem" } => o.tipo === "passo.ordem");
  const fora = new Set(apagar.map((o) => o.passo));
  const posicao = [...Array.from({ length: originais }, (_, i) => i).filter((i) => !fora.has(i)), ...novos.map((o) => originais + o.n)];
  const traduzidas = ordem.map((o) => ({ ...o, para: o.para.map((num) => posicao.indexOf(num)) }));
  return [...campos, ...novos, ...apagar, ...traduzidas];
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
  let atual: string | null = fonte;
  for (const op of paraReproduzir(r.aplicadas, ((valor.passos as unknown[] | undefined) ?? []).length)) { atual = atual === null ? null : editar(atual, op); }
  if (atual !== null && iguais(ler(atual).toJS(), esperado)) return { fonte: atual, aplicadas: r.aplicadas, conflitos: r.conflitos };
  const reescrita = reescrever(fonte, paraReproduzir(r.aplicadas, ((valor.passos as unknown[] | undefined) ?? []).length));
  return { fonte: reescrita, aplicadas: r.aplicadas, conflitos: r.conflitos, reescrito: true };
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

/** Every line of `b` and whether it is new or changed relative to `a` (the same longest-common-subsequence as `diffLinhas`). */
export function marcarLinhas(a: string, b: string): { texto: string; nova: boolean }[] {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: { texto: string; nova: boolean }[] = [];
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && A[i] === B[j]) { out.push({ texto: B[j], nova: false }); i++; j++; }
    else if (i < n && lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else { out.push({ texto: B[j], nova: true }); j++; }
  }
  return out;
}
