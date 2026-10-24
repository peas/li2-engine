import { load } from "js-yaml";
import type { Fala } from "./fala";

/**
 * Conversations live in the game's `dialogos/<nome>.yaml` (one per character or scene). The game passes its files
 * (`import.meta.glob("./dialogos/*.yaml", { query: "?raw", import: "default", eager: true })`); the name is the file
 * name without extension. Format: `personagem` and `retrato` are the defaults; each entry of `falas` needs `texto`
 * and may override `quem` / `retrato` for that line. A missing `retrato` is the speaker's name in lower case.
 */
interface Arquivo {
  personagem?: string;
  retrato?: string;
  falas?: { quem?: string; retrato?: string; texto?: string }[];
}

export interface Dialogos {
  /** The lines of `nome`; throws a readable error when it does not exist or is malformed. */
  carregar(nome: string): Fala[];
  /** Every dialogue name, sorted. */
  listar(): string[];
  existe(nome: string): boolean;
}

export function criarDialogos(files: Record<string, string>): Dialogos {
  const porNome = new Map(Object.entries(files).map(([path, raw]) => [path.replace(/^.*\//, "").replace(/\.ya?ml$/, ""), raw]));
  const listar = () => [...porNome.keys()].sort();
  return {
    listar,
    existe: (nome) => porNome.has(nome),
    carregar(nome) {
      const raw = porNome.get(nome);
      if (raw === undefined) throw new Error(`diálogo "${nome}" não existe (há: ${listar().join(", ")})`);
      const doc = (load(raw) ?? {}) as Arquivo;
      if (!Array.isArray(doc.falas)) throw new Error(`dialogos/${nome}.yaml: falta a lista "falas"`);
      return doc.falas.map((f, i) => {
        if (typeof f?.texto !== "string" || !f.texto.trim()) throw new Error(`dialogos/${nome}.yaml: a fala ${i + 1} não tem "texto"`);
        const quem = f.quem ?? doc.personagem ?? "";
        return { quem, retrato: f.retrato ?? doc.retrato ?? quem.toLowerCase(), texto: f.texto.trim() };
      });
    },
  };
}
