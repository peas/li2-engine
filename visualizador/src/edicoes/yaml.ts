/**
 * Writes her ops into the game's YAML files keeping comments, key order and quoting (the `yaml` library's Document, not
 * js-yaml's dump). Conflict detection is the engine's `aplicarEdicoes` on the parsed value: an op the engine refuses
 * is reported and the file is left as it is for that op. Node only (the CLI `scripts/aplicar-edicoes.mjs` and vitest).
 */
import { isScalar, isSeq, parseDocument, Scalar, type Document, type YAMLSeq } from "yaml";
import { aplicarEdicoes, type Conflito, type Op } from "../../../src/game/edicoes/edicoes.ts";

export interface ResultadoYaml {
  fonte: string;
  aplicadas: Op[];
  conflitos: Conflito[];
}

/** Sets a scalar keeping its style (quotes, block); a string with a line break is written double-quoted (`"a\nb"`), as the games write their lines. */
function porValor(doc: Document, caminho: (string | number)[], valor: unknown) {
  const atual = doc.getIn(caminho, true);
  if (isScalar(atual)) {
    atual.value = valor;
    if (typeof valor === "string" && valor.includes("\n")) atual.type = Scalar.QUOTE_DOUBLE;
    return;
  }
  const novo = new Scalar(valor);
  if (typeof valor === "string" && valor.includes("\n")) novo.type = Scalar.QUOTE_DOUBLE;
  doc.setIn(caminho, novo);
}

/**
 * Applies the ops that belong to one file (`tipo` says how to read it: a quest file is one quest, a dialogue file one
 * dialogue, both keyed by `id`). Returns the new source (unchanged when nothing applied) plus what was applied/refused.
 */
export function aplicarNoYaml(fonte: string, tipo: "missao" | "dialogo", id: string, ops: readonly Op[]): ResultadoYaml {
  const doc = parseDocument(fonte, { keepSourceTokens: true });
  const valor = (doc.toJS() ?? {}) as Record<string, unknown>;
  const r = aplicarEdicoes(tipo === "missao" ? { missoes: { [id]: valor }, dialogos: {} } : { missoes: {}, dialogos: { [id]: valor } }, ops);
  for (const op of r.aplicadas) {
    switch (op.tipo) {
      case "missao.quem": porValor(doc, ["quem"], op.para); break;
      case "missao.texto": porValor(doc, [op.campo], op.para); break;
      case "missao.recompensa":
        if (op.para === 0) { doc.deleteIn(["ao_concluir", op.campo]); if ((doc.get("ao_concluir") as { items?: unknown[] } | undefined)?.items?.length === 0) doc.delete("ao_concluir"); }
        else porValor(doc, ["ao_concluir", op.campo], op.para);
        break;
      case "passo.alvo": {
        const no = doc.getIn(["passos", op.passo, op.campo], true);
        if (isSeq(no)) {
          const i = (no as YAMLSeq).items.findIndex((x) => isScalar(x) && x.value === op.de);
          if (i >= 0) porValor(doc, ["passos", op.passo, op.campo, i], op.para);
        } else porValor(doc, ["passos", op.passo, op.campo], op.para);
        break;
      }
      case "passo.qtd": porValor(doc, ["passos", op.passo, "qtd"], op.para); break;
      case "passo.ordem": {
        const seq = doc.get("passos") as YAMLSeq;
        seq.items = op.para.map((i) => seq.items[i]);
        break;
      }
      case "fala.texto": porValor(doc, ["falas", op.indice, "texto"], op.para); break;
    }
  }
  return { fonte: r.aplicadas.length ? doc.toString({ lineWidth: 0, doubleQuotedAsJSON: true }) : fonte, aplicadas: r.aplicadas, conflitos: r.conflitos };
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
