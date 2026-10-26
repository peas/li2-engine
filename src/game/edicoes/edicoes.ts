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
 * Step indices (`passo`) always count the ORIGINAL order of the file. New steps (`passo.novo`) are numbered after the
 * originals (the k-th new step of a quest is `passos.length + k`). The engine applies, per quest: the field ops, then
 * the new steps (appended), then the deleted steps, then `passo.ordem` (a permutation of what is left).
 */

const Id = z.string().min(1);
/** A simple value a step field can hold. */
const Simples = z.union([z.string(), z.number(), z.boolean()]);
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
  /** Any simple field of a step (`texto`, `raio`, `dialogo`, a single `lugar`...); `de` undefined = the key was absent. */
  z.object({ tipo: z.literal("passo.campo"), missao: Id, passo: z.number().int().min(0), campo: z.string().regex(/^[a-z_]+$/), de: Simples.optional(), para: Simples, ...Carimbo }),
  /** How hard the quest is. */
  z.object({ tipo: z.literal("missao.dificuldade"), missao: Id, de: z.string().optional(), para: z.enum(["facil", "media", "dificil"]), ...Carimbo }),
  /** An item in the reward (`ao_concluir.itens.<item>`): `de` undefined = absent; `para` 0 removes it. */
  z.object({ tipo: z.literal("missao.item"), missao: Id, item: Id, de: z.number().optional(), para: z.number().int().min(0).max(20), ...Carimbo }),
  /** A new step, the `n`-th new one of this quest (0-based): `de` is how many steps the file had, `para` the whole step. */
  z.object({ tipo: z.literal("passo.novo"), missao: Id, n: z.number().int().min(0), de: z.number().int().min(0), para: z.record(z.string(), Simples), ...Carimbo }),
  /** Deletes an original step; `de` is its `texto` (to notice when the file changed). */
  z.object({ tipo: z.literal("passo.apagar"), missao: Id, passo: z.number().int().min(0), de: z.string(), ...Carimbo }),
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
    case "passo.campo": return `passo.campo:${op.missao}:${op.passo}:${op.campo}`;
    case "missao.dificuldade": return `missao.dificuldade:${op.missao}`;
    case "missao.item": return `missao.item:${op.missao}:${op.item}`;
    case "passo.novo": return `passo.novo:${op.missao}:${op.n}`;
    case "passo.apagar": return `passo.apagar:${op.missao}:${op.passo}`;
  }
}

/** Does the op change anything? (`para` equal to `de` is "back to the original": the op is dropped.) */
export function opVazia(op: Op): boolean {
  if (op.tipo === "passo.ordem") return op.para.every((i, j) => i === j);
  if (op.tipo === "missao.recompensa" || op.tipo === "missao.item") return (op.de ?? 0) === op.para;
  if (op.tipo === "passo.novo" || op.tipo === "passo.apagar") return false;
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
 * current value equals its `de`; otherwise it is a conflict with the reason in Portuguese. Per quest the field ops come
 * first (every `passo` index is the file's), then the structure: new steps appended, deleted steps removed, and
 * `passo.ordem` (a permutation of the original steps left plus the new ones, numbered after the originals).
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

  /** Structural changes per quest, applied after every field op: new steps by `n`, deleted original indices, the order. */
  const estrutura = new Map<string, { originais: number; novos: Map<number, Op & { tipo: "passo.novo" }>; apagar: Map<number, Op>; ordem?: Op & { tipo: "passo.ordem" } }>();
  const deMissao = (id: string, m: MissaoDoc) => {
    if (!estrutura.has(id)) estrutura.set(id, { originais: (m.passos ?? []).length, novos: new Map(), apagar: new Map() });
    return estrutura.get(id)!;
  };

  // the reorders are looked at last (their conflicts read last too); they are applied with the structure, below
  for (const op of [...ops.filter((o) => o.tipo !== "passo.ordem"), ...ops.filter((o) => o.tipo === "passo.ordem")]) {
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
      case "passo.campo": {
        const p = m.passos?.[op.passo];
        if (!p) { falha(op, `a missão "${op.missao}" não tem mais o passo ${op.passo + 1}`); continue; }
        if (op.campo === "tipo") { falha(op, "o tipo de um passo não muda: apague o passo e crie outro"); continue; }
        if (p[op.campo] !== op.de) { falha(op, `"${op.campo}" do passo ${op.passo + 1} de "${op.missao}" mudou no jogo: agora é ${mostra(p[op.campo])}`); continue; }
        p[op.campo] = op.para;
        break;
      }
      case "missao.dificuldade": {
        if (m.dificuldade !== op.de) { falha(op, `a dificuldade de "${op.missao}" mudou no jogo: agora é ${mostra(m.dificuldade)}`); continue; }
        m.dificuldade = op.para;
        break;
      }
      case "missao.item": {
        const r = (m.ao_concluir ??= {});
        const itens = (r.itens ??= {}) as Record<string, unknown>;
        const atual = typeof itens[op.item] === "number" ? (itens[op.item] as number) : undefined;
        if (atual !== op.de) { falha(op, `o prêmio "${op.item}" de "${op.missao}" mudou no jogo: agora é ${mostra(atual)}`); continue; }
        if (op.para === 0) delete itens[op.item]; else itens[op.item] = op.para;
        if (!Object.keys(itens).length) delete r.itens;
        break;
      }
      case "passo.novo": {
        const e = deMissao(op.missao, m);
        if (e.originais !== op.de) { falha(op, `os passos da missão "${op.missao}" mudaram no jogo (o passo novo foi criado quando ela tinha ${op.de})`); continue; }
        e.novos.set(op.n, op);
        continue; // counted as applied with the structure, below
      }
      case "passo.apagar": {
        // checked against the file as it was (a texto she also edited must not turn her own delete into a conflict)
        const p = conteudo.missoes[op.missao].passos?.[op.passo];
        if (!p || String(p.texto ?? "") !== op.de) { falha(op, `o passo ${op.passo + 1} de "${op.missao}" mudou no jogo (ia ser apagado)`); continue; }
        deMissao(op.missao, m).apagar.set(op.passo, op);
        continue; // counted as applied with the structure, below
      }
      case "passo.ordem": {
        const textos = (conteudo.missoes[op.missao].passos ?? []).map((p) => String(p.texto ?? ""));
        if (textos.length !== op.de.length || !textos.every((t, i) => t === op.de[i])) { falha(op, `os passos da missão "${op.missao}" mudaram no jogo (a ordem nova não bate mais)`); continue; }
        deMissao(op.missao, m).ordem = op;
        continue; // checked against what is left, after the structure (below)
      }
    }
    aplicadas.push(op);
  }

  // the structure of each quest: new steps after the originals, deleted ones out, then the order (if any)
  for (const [id, e] of estrutura) {
    const m = missoes[id];
    const passos = (m.passos ?? []) as Record<string, unknown>[];
    const porNumero = new Map<number, Record<string, unknown>>();
    passos.forEach((p, i) => { if (!e.apagar.has(i)) porNumero.set(i, p); });
    for (const [n, op] of [...e.novos].sort((a, b) => a[0] - b[0])) porNumero.set(e.originais + n, clone(op.para));
    let ordem = [...porNumero.keys()];
    if (e.ordem) {
      const pedida = e.ordem.para;
      const ok = pedida.length === ordem.length && [...pedida].sort((a, b) => a - b).every((i, k) => i === [...ordem].sort((a, b) => a - b)[k]);
      if (ok) ordem = pedida;
      else falha(e.ordem, `os passos da missão "${id}" mudaram (a ordem nova não bate com os passos que sobraram)`);
    }
    // in the order the file writer replays them: new steps, deleted steps, then the order
    aplicadas.push(...[...e.novos].sort((a, b) => a[0] - b[0]).map(([, op]) => op), ...e.apagar.values());
    if (e.ordem && ordem === e.ordem.para) aplicadas.push(e.ordem);
    m.passos = ordem.map((i) => porNumero.get(i)!);
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
    case "passo.campo": return `passo ${op.passo + 1} da ${m()}: ${op.campo} → ${mostra(op.para)} (antes: ${mostra(op.de)})`;
    case "missao.dificuldade": return `a ${m()} fica ${op.para === "facil" ? "fácil" : op.para === "media" ? "média" : "difícil"} (antes: ${op.de ?? "?"})`;
    case "missao.item": return `a ${m()} dá ${op.para}× ${nome("item", op.item)} (antes: ${op.de ?? 0})`;
    case "passo.novo": return `passo novo na ${m()}: ${String(op.para.tipo ?? "?")}${op.para.texto ? ` «${op.para.texto}»` : ""}`;
    case "passo.apagar": return `o passo ${op.passo + 1} da ${m()} sai («${op.de}»)`;
  }
}
