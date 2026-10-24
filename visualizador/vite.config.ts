import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { lerJogo } from "./src/carregador/ler.ts";

/**
 * The game folder comes in `JOGO` (scripts/rodar.mjs sets it from `--jogo`). The page imports `virtual:jogo`: the
 * loader runs here, in Node, and the page receives the `Conteudo` as JSON (it builds the graph itself, so the editor
 * can rebuild it with the edits applied). In dev, a change to any YAML or TS
 * of the game (its `jogo.yaml` manifest included) reloads the page.
 */
function jogoPlugin(): Plugin {
  const pasta = process.env.JOGO;
  if (!pasta) throw new Error("Diga qual jogo: npm run dev -- --jogo ../meu-jogo (ou JOGO=../meu-jogo)");
  const raiz = resolve(pasta.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  const ID = "virtual:jogo", RESOLVIDO = "\0" + ID;
  return {
    name: "jogo",
    resolveId: (id) => (id === ID ? RESOLVIDO : undefined),
    load(id) {
      if (id !== RESOLVIDO) return;
      const c = lerJogo(raiz);
      // the absolute folder stays out of the bundle (a built site is public)
      return `export default ${JSON.stringify({ ...c, jogo: { ...c.jogo, pasta: c.jogo.nome } })};`;
    },
    configureServer(server) {
      server.watcher.add([resolve(raiz, "src"), resolve(raiz, "jogo.yaml")]);
      server.watcher.on("change", (f) => {
        if (!f.startsWith(raiz) || !/\.(ya?ml|ts)$/.test(f)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVIDO);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [jogoPlugin()],
  server: { port: 5190, strictPort: true, host: true },
  preview: { port: 5190, strictPort: true },
  build: { outDir: process.env.VIS_OUT ?? "dist", emptyOutDir: true },
});
