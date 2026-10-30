import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

/**
 * The thin exports (`li2-engine/game/missoes`, `/estado`, `/dialogo`, `/novidades`) let a 2D game use the quests, the
 * store, the dialogue text and the news without installing three.js. This walks each one's module graph from the source
 * (value imports and re-exports; `import type` is erased) and checks that no file in it imports `three`.
 */
const FINOS = ["./game/missoes", "./game/estado", "./game/dialogo", "./game/novidades"] as const;
const exportsDoPacote = pkg.exports as Record<string, string>;
/** Every source file of the engine, by path from the repo root ("src/game/novidades.ts"). */
const FONTES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }))
    .map(([c, t]) => [c.slice(1), t as string]),
);
const ler = (f: string) => FONTES[f];

/** "a/b/c.ts" + "../d" → "a/d" (POSIX paths inside the repo). */
function juntar(base: string, spec: string) {
  const partes = base.split("/").slice(0, -1);
  for (const p of spec.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== ".") partes.push(p);
  }
  return partes.join("/");
}

/** Value import/export specifiers of a file (type-only ones are skipped). */
function importsDe(codigo: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^;]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (let m; (m = re.exec(codigo)); ) if (!m[2]) out.push(m[4]);
  return out;
}

function arquivo(base: string, spec: string): string {
  const p = juntar(base, spec);
  const achado = [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`].find((c) => ler(c) !== undefined);
  if (!achado) throw new Error(`não achei ${spec} a partir de ${base}`);
  return achado;
}

/** Every file reached from `entrada` and every bare package it imports. */
function grafo(entrada: string) {
  const arquivos = new Set<string>(), pacotes = new Set<string>();
  const visitar = (f: string) => {
    if (arquivos.has(f)) return;
    arquivos.add(f);
    for (const spec of importsDe(ler(f))) {
      if (spec.startsWith(".")) visitar(arquivo(f, spec));
      else pacotes.add(spec);
    }
  };
  visitar(entrada);
  return { arquivos, pacotes };
}

describe("exports finos sem three.js", () => {
  for (const nome of FINOS) {
    it(`${nome} não puxa three`, async () => {
      const entrada = exportsDoPacote[nome];
      expect(entrada, `${nome} no package.json`).toBeTruthy();
      const { arquivos, pacotes } = grafo(entrada.replace(/^\.\//, ""));
      expect([...pacotes].filter((p) => p === "three" || p.startsWith("three/"))).toEqual([]);
      expect(arquivos.size).toBeGreaterThan(0);
      // and it really loads
      const mod = await import(/* @vite-ignore */ `../../${entrada.replace(/^\.\//, "")}`);
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
  }

  it("o export largo (./game) puxa three: é por isso que os finos existem", () => {
    const { pacotes } = grafo(exportsDoPacote["./game"].replace(/^\.\//, ""));
    expect([...pacotes].some((p) => p === "three" || p.startsWith("three/"))).toBe(true);
  });
});
