import { z } from "zod";

/**
 * Edits a child makes to a game's content from the viewer (`visualizador/`), as a list of small declarative operations
 * over the YAML as it is parsed (a quest doc, a dialogue doc). Shared by the viewer (writes them), the game (applies them
 * on top of its YAML before validating, `src/game/edicoes/` in the game) and the repo script that writes them into the
 * files (`visualizador/scripts/aplicar-edicoes.mjs`). No dependency besides zod.
 *
 * Every op carries `de` (the value in the repo when she edited) and `para` (her value): `aplicarEdicoes` only applies an
 * op whose `de` still matches, so a YAML the repo changed since turns the op into a *conflict* ("precisa revisar"),
 * never a silent overwrite. One op per target (`chaveDaOp`): applying the same list twice gives the same result.
 * Step indices (`passo`) always count the ORIGINAL order of the file; `passo.ordem` is applied last.
 */

const Id = z.string().min(1);
const Carimbo = {
  /** ISO date-time of the edit. */
  quando: z.string().optional(),
  /** Who edited (the name she typed once). */
  autor: z.string().optional(),
};

export const OpSchema = z.discriminatedUnion("tipo", [
  /** Who gives the quest (an NPC id). */
  z.object({ tipo: z.literal("missao.quem"), missao: Id, de: z.string(), para: Id, ...Carimbo }),
  /** The quest's title or description. */
  z.object({ tipo: z.literal("missao.texto"), missao: Id, campo: z.enum(["titulo", "descricao"]), de: z.string(), para: z.string().trim().min(1), ...Carimbo }),
  /** Hearts or coins in `ao_concluir` (`de` undefined = the field was absent; `para` 0 removes it). */
  z.object({ tipo: z.literal("missao.recompensa"), missao: Id, campo: z.enum(["coracoes", "moedas"]), de: z.number().optional(), para: z.number().int().min(0).max(100), ...Carimbo }),
  /** A step's target: `campo` is the YAML key (`npc`, `lugar`, `item` or a game's own field); for a list (`lugar: [a, b]`) the matching element. */
  z.object({ tipo: z.literal("passo.alvo"), missao: Id, passo: z.number().int().min(0), campo: Id, de: z.string(), para: z.string().min(1), ...Carimbo }),
  /** A step's quantity (`qtd` of coletar / levar). */
  z.object({ tipo: z.literal("passo.qtd"), missao: Id, passo: z.number().int().min(0), de: z.number(), para: z.number().int().min(1).max(99), ...Carimbo }),
  /** The order of the steps: `para[j]` is the original index of the step now at position j; `de` the original `texto`s, in order. */
  z.object({ tipo: z.literal("passo.ordem"), missao: Id, de: z.array(z.string()), para: z.array(z.number().int().min(0)), ...Carimbo }),
  /** The text of one line of a dialogue (`falas[indice].texto`). */
  z.object({ tipo: z.literal("fala.texto"), dialogo: Id, indice: z.number().int().min(0), de: z.string(), para: z.string().trim().min(1), ...Carimbo }),
]);
export type Op = z.infer<typeof OpSchema>;
export type TipoOp = Op["tipo"];

export const VERSAO_EDICOES = 1;

/** What the viewer stores and exports (`edicoes-<jogo>-<data>.json`) and the game reads. */
export const DocumentoEdicoesSchema = z.object({
  versao: z.literal(VERSAO_EDICOES),
  /** The game folder name (`tresilhas`): the game only applies its own. */
  jogo: z.string().min(1),
  autor: z.string().default(""),
  /** ISO date-time of the export (absent while it only lives in the browser). */
  exportado: z.string().optional(),
  ops: z.array(OpSchema),
});
export type DocumentoEdicoes = z.infer<typeof DocumentoEdicoesSchema>;

/** The target of an op: two ops with the same key edit the same thing (the later one replaces the earlier). */
export function chaveDaOp(op: Op): string {
  switch (op.tipo) {
    case "missao.quem": return `missao.quem:${op.missao}`;
    case "missao.texto": return `missao.texto:${op.missao}:${op.campo}`;
    case "missao.recompensa": return `missao.recompensa:${op.missao}:${op.campo}`;
    case "passo.alvo": return `passo.alvo:${op.missao}:${op.passo}:${op.campo}`;
    case "passo.qtd": return `passo.qtd:${op.missao}:${op.passo}`;
    case "passo.ordem": return `passo.ordem:${op.missao}`;
    case "fala.texto": return `fala.texto:${op.dialogo}:${op.indice}`;
  }
}

/** Does the op change anything? (`para` equal to `de` is "back to the original": the op is dropped.) */
export function opVazia(op: Op): boolean {
  if (op.tipo === "passo.ordem") return op.para.every((i, j) => i === j);
  if (op.tipo === "missao.recompensa") return (op.de ?? 0) === op.para;
  return op.de === op.para;
}

/** `ops` with `nova` in place of any op on the same target (appended when new; removed when `nova` is empty). */
export function juntarOp(ops: readonly Op[], nova: Op): Op[] {
  const chave = chaveDaOp(nova);
  const resto = ops.filter((o) => chaveDaOp(o) !== chave);
  return opVazia(nova) ? resto : [...resto, nova];
}

/** The quest/dialogue the op belongs to, as `missao:<id>` / `dialogo:<id>` (the viewer's node ids). */
export function alvoDaOp(op: Op): string {
  return op.tipo === "fala.texto" ? `dialogo:${op.dialogo}` : `missao:${op.missao}`;
}

// ---- applying ----

/** A quest file as parsed (the keys the ops touch; everything else passes through). */
export type MissaoDoc = Record<string, unknown> & {
  quem?: unknown; titulo?: unknown; descricao?: unknown;
  passos?: Record<string, unknown>[];
  ao_concluir?: Record<string, unknown>;
};
/** A dialogue file as parsed. */
export type DialogoDoc = Record<string, unknown> & { falas?: Record<string, unknown>[] };

export interface ConteudoEditavel {
  /** By quest id. */
  missoes: Record<string, MissaoDoc>;
  /** By dialogue name (the file name without extension). */
  dialogos: Record<string, DialogoDoc>;
}

export interface Conflito { op: Op; motivo: string }

export interface ResultadoEdicoes {
  /** The content with the edits applied (the untouched docs are the same objects; the edited ones are copies). */
  conteudo: ConteudoEditavel;
  aplicadas: Op[];
  /** Ops whose target is gone or whose `de` no longer matches: shown as "precisa revisar", never applied. */
  conflitos: Conflito[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const mostra = (v: unknown) => (v === undefined ? "(nada)" : JSON.stringify(v));

/**
 * Applies `ops` to `conteudo` (pure: the input is not changed). An op is applied only when its target exists and the
 * current value equals its `de`; otherwise it is a conflict with the reason in Portuguese. `passo.ordem` runs after the
 * other ops of the same quest, so every `passo` index refers to the original order.
 */
export function aplicarEdicoes(conteudo: ConteudoEditavel, ops: readonly Op[]): ResultadoEdicoes {
  const missoes = { ...conteudo.missoes };
  const dialogos = { ...conteudo.dialogos };
  const aplicadas: Op[] = [];
  const conflitos: Conflito[] = [];
  const tocadas = new Set<string>();
  const missao = (id: string): MissaoDoc | undefined => {
    if (!(id in missoes)) return undefined;
    if (!tocadas.has(`m:${id}`)) { missoes[id] = clone(missoes[id]); tocadas.add(`m:${id}`); }
    return missoes[id];
  };
  const dialogo = (id: string): DialogoDoc | undefined => {
    if (!(id in dialogos)) return undefined;
    if (!tocadas.has(`d:${id}`)) { dialogos[id] = clone(dialogos[id]); tocadas.add(`d:${id}`); }
    return dialogos[id];
  };
  const falha = (op: Op, motivo: string) => conflitos.push({ op, motivo });

  const ordem = ops.filter((o) => o.tipo === "passo.ordem");
  for (const op of [...ops.filter((o) => o.tipo !== "passo.ordem"), ...ordem]) {
    if (op.tipo === "fala.texto") {
      const d = dialogo(op.dialogo);
      if (!d) { falha(op, `a conversa "${op.dialogo}" não existe mais`); continue; }
      const f = d.falas?.[op.indice];
      if (!f) { falha(op, `a conversa "${op.dialogo}" não tem mais a fala ${op.indice + 1}`); continue; }
      if (String(f.texto ?? "").trim() !== op.de.trim()) { falha(op, `a fala ${op.indice + 1} de "${op.dialogo}" mudou no jogo: agora é ${mostra(f.texto)}`); continue; }
      f.texto = op.para;
      aplicadas.push(op);
      continue;
    }
    const m = missao(op.missao);
    if (!m) { falha(op, `a missão "${op.missao}" não existe mais`); continue; }
    switch (op.tipo) {
      case "missao.quem":
      case "missao.texto": {
        const campo = op.tipo === "missao.quem" ? "quem" : op.campo;
        if (m[campo] !== op.de) { falha(op, `"${campo}" da missão "${op.missao}" mudou no jogo: agora é ${mostra(m[campo])}`); continue; }
        m[campo] = op.para;
        break;
      }
      case "missao.recompensa": {
        const r = (m.ao_concluir ??= {});
        const atual = typeof r[op.campo] === "number" ? (r[op.campo] as number) : undefined;
        if (atual !== op.de) { falha(op, `"${op.campo}" da recompensa de "${op.missao}" mudou no jogo: agora é ${mostra(atual)}`); continue; }
        if (op.para === 0) delete r[op.campo]; else r[op.campo] = op.para;
        break;
      }
      case "passo.alvo": {
        const p = m.passos?.[op.passo];
        if (!p) { falha(op, `a missão "${op.missao}" não tem mais o passo ${op.passo + 1}`); continue; }
        const v = p[op.campo];
        if (Array.isArray(v)) {
          const i = v.indexOf(op.de);
          if (i < 0) { falha(op, `o passo ${op.passo + 1} de "${op.missao}" não tem mais "${op.de}" em ${op.campo}`); continue; }
          p[op.campo] = v.map((x, k) => (k === i ? op.para : x));
        } else {
          if (v !== op.de) { falha(op, `"${op.campo}" do passo ${op.passo + 1} de "${op.missao}" mudou no jogo: agora é ${mostra(v)}`); continue; }
          p[op.campo] = op.para;
        }
        break;
      }
      case "passo.qtd": {
        const p = m.passos?.[op.passo];
        if (!p) { falha(op, `a missão "${op.missao}" não tem mais o passo ${op.passo + 1}`); continue; }
        if (p.qtd !== op.de) { falha(op, `a quantidade do passo ${op.passo + 1} de "${op.missao}" mudou no jogo: agora é ${mostra(p.qtd)}`); continue; }
        p.qtd = op.para;
        break;
      }
      case "passo.ordem": {
        const passos = m.passos ?? [];
        const textos = passos.map((p) => String(p.texto ?? ""));
        const ok = textos.length === op.de.length && textos.every((t, i) => t === op.de[i]) && op.para.length === passos.length && [...op.para].sort((a, b) => a - b).every((i, k) => i === k);
        if (!ok) { falha(op, `os passos da missão "${op.missao}" mudaram no jogo (a ordem nova não bate mais)`); continue; }
        m.passos = op.para.map((i) => passos[i]);
        break;
      }
    }
    aplicadas.push(op);
  }
  return { conteudo: { missoes, dialogos }, aplicadas, conflitos };
}

/** One line in Portuguese for an op; `nome(tipo, id)` turns ids into names when the caller has them. */
export function descreverOp(op: Op, nome: (tipo: "missao" | "pessoa" | "lugar" | "item" | "dialogo", id: string) => string = (_, id) => id): string {
  const m = () => `missão «${nome("missao", op.tipo === "fala.texto" ? "" : op.missao)}»`;
  switch (op.tipo) {
    case "missao.quem": return `a ${m()} agora é dada por ${nome("pessoa", op.para)} (antes: ${nome("pessoa", op.de)})`;
    case "missao.texto": return `${op.campo === "titulo" ? "título" : "descrição"} da ${m()}: «${op.para}» (antes: «${op.de}»)`;
    case "missao.recompensa": return `a ${m()} dá ${op.para} ${op.campo === "coracoes" ? "❤️" : "🪙"} (antes: ${op.de ?? 0})`;
    case "passo.alvo": {
      const tipo = op.campo === "npc" ? "pessoa" : op.campo === "item" ? "item" : op.campo === "lugar" ? "lugar" : null;
      const n = (id: string) => (tipo ? nome(tipo, id) : id);
      return `passo ${op.passo + 1} da ${m()}: ${op.campo} → ${n(op.para)} (antes: ${n(op.de)})`;
    }
    case "passo.qtd": return `passo ${op.passo + 1} da ${m()}: quantidade ${op.para} (antes: ${op.de})`;
    case "passo.ordem": return `a ${m()}: passos na ordem ${op.para.map((i) => i + 1).join(", ")}`;
    case "fala.texto": return `fala ${op.indice + 1} de «${nome("dialogo", op.dialogo)}»: «${op.para}» (antes: «${op.de}»)`;
  }
}
