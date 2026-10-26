/**
 * The quest schema as the MDM sees it, in the browser and in Node: the engine's step types plus the ones a game's
 * manifest declares (`passos_extras`), and, for the MDM editor's property panel, what fields each step type has and
 * how each one is edited.
 */
import { z } from "zod";
import { Id, LugarId, PASSOS_BASE, PassoBase, criarMissaoSchema } from "../../../src/game/missoes/schema.ts";
import type { PassoExtra } from "./tipos.ts";

/** How each field type of a manifest step is validated. */
const CAMPO: Record<NonNullable<PassoExtra["campos"]>[string], z.ZodType> = {
  id: Id, lugar: LugarId, pessoa: Id, item: Id, numero: z.number(), texto: z.string(), textos: z.array(z.string()), sim_nao: z.boolean().optional(),
};
export const TIPOS_BASE = PASSOS_BASE.map((p) => p.shape.tipo.value as string);

/** The step shapes a manifest declares: `tipo` literal plus its `campos` (absent = only the `tipo`); an engine type there (an older manifest's `achar`) is skipped. */
export function passosDoManifesto(extras: Record<string, PassoExtra>) {
  return Object.entries(extras).filter(([tipo]) => !TIPOS_BASE.includes(tipo)).map(([tipo, e]) => PassoBase.extend({
    tipo: z.literal(tipo),
    ...Object.fromEntries(Object.entries(e.campos ?? {}).map(([k, t]) => [k, CAMPO[t]])),
  }));
}

/** The quest schema of a game (engine steps + its manifest's). */
export const esquemaDaMissao = (extras: Record<string, PassoExtra>) => criarMissaoSchema(passosDoManifesto(extras));

/** How a field is edited in the panel: a catalogue choice (with its emoji), a number, a text, yes/no, or only shown. */
export type TipoDeCampo = "pessoa" | "item" | "lugar" | "dialogo" | "numero" | "texto" | "sim_nao" | "so_ler";
export interface CampoDoPasso { campo: string; tipo: TipoDeCampo; obrigatorio: boolean }

/** A field's kind by its name, the convention the games follow (`npc` is a person, `dialogo_*` a dialogue...). */
function tipoPeloNome(campo: string, schema: z.ZodType): TipoDeCampo {
  if (campo === "npc") return "pessoa";
  if (campo === "item") return "item";
  if (campo === "lugar") return "lugar";
  if (campo === "dialogo" || campo.startsWith("dialogo_")) return "dialogo";
  if (schema.safeParse(1).success && !schema.safeParse("x").success) return "numero";
  if (schema.safeParse(true).success && !schema.safeParse("x").success) return "sim_nao";
  if (schema.safeParse("x").success) return "texto";
  return "so_ler";
}

/** Reading order of a step, as the games write them: the text, then who/where/what/how many, the dialogues last. */
const ordemDeLeitura = (c: CampoDoPasso) => (c.campo === "texto" ? 0 : c.tipo === "dialogo" ? 2 : 1);

/** The fields of a step type in reading order (`tipo` is not one: a step's type does not change). */
export function camposDoPasso(tipo: string, extras: Record<string, PassoExtra>): CampoDoPasso[] {
  return camposNaOrdemDoSchema(tipo, extras).map((c, i) => [c, i] as const).sort((a, b) => ordemDeLeitura(a[0]) - ordemDeLeitura(b[0]) || a[1] - b[1]).map(([c]) => c);
}

function camposNaOrdemDoSchema(tipo: string, extras: Record<string, PassoExtra>): CampoDoPasso[] {
  const base = PASSOS_BASE.find((p) => p.shape.tipo.value === tipo);
  if (base) {
    return Object.entries(base.shape as Record<string, z.ZodType>).filter(([k]) => k !== "tipo")
      .map(([campo, s]) => ({ campo, tipo: tipoPeloNome(campo, s), obrigatorio: !s.safeParse(undefined).success }));
  }
  const e = extras[tipo];
  const doTipo: Record<string, TipoDeCampo> = { pessoa: "pessoa", item: "item", lugar: "lugar", numero: "numero", texto: "texto", id: "texto", sim_nao: "sim_nao", textos: "so_ler" };
  const campos: CampoDoPasso[] = [
    { campo: "texto", tipo: "texto", obrigatorio: true },
    ...Object.entries(e?.campos ?? {}).map(([campo, t]) => ({ campo, tipo: campo.startsWith("dialogo") ? "dialogo" as const : doTipo[t], obrigatorio: t !== "sim_nao" })),
    { campo: "dialogo", tipo: "dialogo", obrigatorio: false },
  ];
  return campos.filter((c, i, todos) => todos.findIndex((x) => x.campo === c.campo) === i);
}

/** Every step type a quest can use here: the engine's and the game's. */
export const tiposDePasso = (extras: Record<string, PassoExtra>) => [...TIPOS_BASE, ...Object.keys(extras).filter((t) => !TIPOS_BASE.includes(t))];
