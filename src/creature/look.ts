import { z } from "zod";

/**
 * The `Look` of a `Humanoide` as a zod schema, for games that keep their people in YAML: every field of `Look`, so a
 * parsed `look` is a `Look` without a cast (look.test.ts checks both directions at the type level).
 */
export const LookSchema = z.object({
  height: z.number().positive(),
  body: z.string(), legs: z.string(), shoes: z.string(), hair: z.string(), skin: z.string(), extra: z.string(),
  hairStyle: z.enum(["curto", "longo", "coque", "careca", "chapeu", "chiquinhas", "rabo"]),
  adulto: z.boolean(),
  saia: z.boolean().optional(),
  barba: z.boolean().optional(),
  bigode: z.boolean().optional(),
  roupa: z.object({ tipo: z.enum(["xadrez", "macacao", "sueter", "capa"]), cor: z.string() }).optional(),
  ferramenta: z.enum(["ancinho", "bengala", "machado", "cajado", "vara"]).optional(),
  chapeu: z.boolean().optional(),
  avental: z.boolean().optional(),
  bone: z.boolean().optional(),
  redondo: z.boolean().optional(),
});
