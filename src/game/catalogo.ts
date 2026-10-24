import { load } from "js-yaml";
import { z } from "zod";

/**
 * A catalogue (items, villagers, recipes...) lives in a YAML file of the game and is validated with zod when the
 * module loads, so a typo is an error at start-up (and in the game's tests), never a bug in front of the child.
 * `criarCatalogo(raw, ItemSchema, "itens.yaml", "itens")` reads the list under the key `itens`; ids must be unique.
 */
export interface Catalogo<T extends { id: string }> {
  readonly lista: readonly T[];
  /** The entry `id`; throws a readable error (with the ids there are) when it does not exist. */
  por(id: string): T;
  is(id: string): boolean;
}

export function criarCatalogo<T extends { id: string }>(raw: string, schema: z.ZodType<T>, nome: string, lista: string): Catalogo<T> {
  const r = z.object({ [lista]: z.array(schema).min(1) }).safeParse(load(raw));
  if (!r.success) throw new Error(`${nome}: ${z.prettifyError(r.error)}`);
  const itens = (r.data as Record<string, T[]>)[lista];
  const porId = new Map<string, T>();
  for (const x of itens) {
    if (porId.has(x.id)) throw new Error(`${nome}: id repetido "${x.id}"`);
    porId.set(x.id, x);
  }
  return {
    lista: itens,
    por(id) {
      const x = porId.get(id);
      if (!x) throw new Error(`"${id}" não existe em ${nome} (há: ${[...porId.keys()].join(", ")})`);
      return x;
    },
    is: (id) => porId.has(id),
  };
}
