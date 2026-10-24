import { load } from "js-yaml";
import { z } from "zod";
import { mulberry32 } from "../../core/math";
import { Id, LugarId, MissaoSchema, type MissaoDef, type Passo } from "./schema";

/**
 * Repeatable quests (from the Dragão, 21/10/2026: "a gente acabou de acabar todas"): a YAML of templates (`moldes`),
 * and `gerarRepetivel(n, cfg)` fills one deterministically (seed from n), so quest `rep-<n>` is the same quest every
 * time the save is loaded and only its progress needs saving. The interpreter (`Missoes` with `repetiveis` in its
 * options) offers the next one when the giver has nothing written left and no quest is running.
 *
 * Markers in the texts: {qtd} (a number), {item} (singular or plural by {qtd}), {npc} (name with article),
 * {lugares} ("a torre e a ilha"). The template of quest n is `moldes[(n - 1) % moldes.length]`.
 */
const Faixa = z.tuple([z.number().int().positive(), z.number().int().positive()]).refine(([a, b]) => a <= b, "min > max");
const Base = { titulo: z.string().min(1), descricao: z.string().min(1), texto: z.string().min(1), moedas: z.number().int().min(0) };

export const MoldeSchema = z.discriminatedUnion("tipo", [
  /** Pick up `qtd` of one of `itens`. */
  z.object({ tipo: z.literal("coletar"), ...Base, itens: z.array(Id).min(1), qtd: Faixa }),
  /** Pick up `qtd` of one of `itens` and take them to one of the `npcs`. */
  z.object({ tipo: z.literal("levar"), ...Base, texto_coletar: z.string().min(1), itens: z.array(Id).min(1), qtd: Faixa }),
  /** Go to `quantos` different places of `lugares` (generates an `ir` step with a list). */
  z.object({ tipo: z.literal("visitar"), ...Base, quantos: z.number().int().positive(), raio: z.number().positive() }),
]);
export type Molde = z.infer<typeof MoldeSchema>;

export const RepetiveisSchema = z.object({
  /** NPC id of the giver. */
  quem: Id,
  dialogo_oferta: Id,
  dialogo_andamento: Id,
  dialogo_feito: Id,
  /** What the giver says while another quest is running (repeatables come one at a time). */
  dialogo_espera: Id,
  /** Generic villager lines for `levar` (the game swaps in the real villager's name and portrait). */
  dialogo_entrega: Id,
  dialogo_falta: Id,
  /** Item names by id, singular and plural. */
  itens: z.record(Id, z.object({ um: z.string().min(1), varios: z.string().min(1) })),
  /** Villagers a delivery can go to: id → name with article. */
  npcs: z.record(Id, z.string().min(1)),
  /** Places a visit can name: key of the game's places → name with article. */
  lugares: z.record(LugarId, z.string().min(1)),
  moldes: z.array(MoldeSchema).min(1),
});
export type Repetiveis = z.infer<typeof RepetiveisSchema>;

/** The templates, validated (throws on a bad file). Item ids in the templates must have names. */
export function carregarRepetiveis(text: string, arquivo = "missoes/repetiveis.yaml"): Repetiveis {
  const r = RepetiveisSchema.safeParse(load(text));
  if (!r.success) throw new Error(`${arquivo}: ${z.prettifyError(r.error)}`);
  for (const m of r.data.moldes) {
    if (m.tipo === "visitar" && m.quantos > Object.keys(r.data.lugares).length) throw new Error(`${arquivo}: visitar pede ${m.quantos} lugares`);
    if (m.tipo !== "visitar") for (const i of m.itens) if (!r.data.itens[i]) throw new Error(`${arquivo}: item "${i}" sem nome em itens`);
  }
  return r.data;
}

export const ID_REPETIVEL = /^rep-(\d+)$/;

/** n of a "rep-<n>" id, or null. */
export function numeroRepetivel(id: string): number | null {
  const m = ID_REPETIVEL.exec(id);
  return m ? Number(m[1]) : null;
}

/** "a torre", "a torre e a ilha", "a torre, a vila e a ilha". */
function juntar(nomes: string[]) {
  return nomes.length < 2 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/** Repeatable quest number `n` (n ≥ 1): always the same quest for the same n and the same `cfg`. */
export function gerarRepetivel(n: number, cfg: Repetiveis): MissaoDef {
  if (!Number.isInteger(n) || n < 1) throw new Error(`repetível ${n}: n tem que ser 1, 2, 3...`);
  const rnd = mulberry32(n * 2654435761);
  const escolher = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const molde = cfg.moldes[(n - 1) % cfg.moldes.length];
  const vars: Record<string, string> = {};
  let item = "", qtd = 0;
  if (molde.tipo !== "visitar") {
    item = escolher(molde.itens);
    qtd = molde.qtd[0] + Math.floor(rnd() * (molde.qtd[1] - molde.qtd[0] + 1));
    vars.qtd = String(qtd);
    vars.item = qtd === 1 ? cfg.itens[item].um : cfg.itens[item].varios;
  }
  let npc = "";
  if (molde.tipo === "levar") { npc = escolher(Object.keys(cfg.npcs)); vars.npc = cfg.npcs[npc]; }
  const lugares: string[] = [];
  if (molde.tipo === "visitar") {
    const livres = Object.keys(cfg.lugares);
    while (lugares.length < molde.quantos) lugares.push(livres.splice(Math.floor(rnd() * livres.length), 1)[0]);
    vars.lugares = juntar(lugares.map((l) => cfg.lugares[l]));
  }
  const t = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

  let passos: Passo[];
  if (molde.tipo === "coletar") passos = [{ tipo: "coletar", texto: t(molde.texto), item, qtd, dialogo: cfg.dialogo_feito }];
  else if (molde.tipo === "levar") passos = [
    { tipo: "coletar", texto: t(molde.texto_coletar), item, qtd },
    { tipo: "levar", texto: t(molde.texto), npc, item, qtd, dialogo: cfg.dialogo_entrega, dialogo_falta: cfg.dialogo_falta },
  ];
  else passos = [{ tipo: "ir", texto: t(molde.texto), lugar: lugares, raio: molde.raio, dialogo: cfg.dialogo_feito }];

  return MissaoSchema.parse({
    id: `rep-${n}`,
    titulo: t(molde.titulo),
    descricao: t(molde.descricao),
    quem: cfg.quem,
    repetivel: true,
    dialogo_oferta: cfg.dialogo_oferta,
    dialogo_andamento: cfg.dialogo_andamento,
    dialogo_feito: cfg.dialogo_feito,
    passos,
    ao_concluir: { moedas: molde.moedas },
  }) as MissaoDef;
}
