import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { Look } from "./humanoide";
import { LookSchema } from "./look";

type DoSchema = z.infer<typeof LookSchema>;
// both directions, at the type level: a field added to Look and not to the schema (or the other way) fails typecheck
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaEhLook: Igual<DoSchema, Look> = true;
void _schemaEhLook;

describe("LookSchema", () => {
  it("parses a full look into a Look and rejects an unknown hair style", () => {
    const raw = { height: 1.6, body: "#111", legs: "#222", shoes: "#333", hair: "#444", skin: "#555", extra: "#666", hairStyle: "coque", adulto: true, roupa: { tipo: "capa", cor: "#777" }, ferramenta: "vara" };
    const l = LookSchema.parse(raw) satisfies Look;
    expect(l).toEqual(raw);
    const deVolta: DoSchema = l as Look;
    expect(deVolta.hairStyle).toBe("coque");
    expect(LookSchema.safeParse({ ...raw, hairStyle: "moicano" }).success).toBe(false);
    expect(LookSchema.safeParse({ ...raw, height: 0 }).success).toBe(false);
  });
});
