import { basename, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { DocumentoEdicoesSchema } from "../src/game/edicoes/edicoes.ts";
import { lerJogo } from "./src/carregador/ler.ts";
import { salvarNoJogo } from "./src/edicoes/salvar.ts";

/** Addresses of this computer: the only ones allowed to write through "Salvar no jogo". */
const LOCAIS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

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
  let publicando = false;
  return {
    name: "jogo",
    configResolved(c) { publicando = c.command === "build"; },
    resolveId: (id) => (id === ID ? RESOLVIDO : undefined),
    load(id) {
      if (id !== RESOLVIDO) return;
      const c = lerJogo(raiz);
      // a built site is public: no absolute folder, and no YAML text (its comments may carry private notes)
      const missoes = publicando ? c.missoes.map(({ fonte: _, ...m }) => m) : c.missoes;
      return `export default ${JSON.stringify({ ...c, missoes, jogo: { ...c.jogo, pasta: c.jogo.nome } })};`;
    },
    configureServer(server) {
      const invalidar = () => { const mod = server.moduleGraph.getModuleById(RESOLVIDO); if (mod) server.moduleGraph.invalidateModule(mod); };
      // files the "Salvar no jogo" endpoint just wrote: the page reloads itself after keeping the conflicting ops
      const proprios = new Set<string>();
      server.watcher.add([resolve(raiz, "src"), resolve(raiz, "jogo.yaml")]);
      server.watcher.on("change", (f) => {
        if (!f.startsWith(raiz) || !/\.(ya?ml|ts)$/.test(f)) return;
        invalidar();
        if (!proprios.has(f)) server.ws.send({ type: "full-reload" });
      });
      // "💾 Salvar no jogo" (MDM editor): POST the edits document, get the report; ?simular=1 only previews. Only from
      // this computer (the dev server listens on the network for the tablet to look, never to write).
      server.middlewares.use("/__mdm/salvar", (req, res) => {
        const responder = (status: number, corpo: unknown) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(corpo)); };
        if (req.method !== "POST") return responder(405, { erro: "use POST" });
        if (!LOCAIS.has(req.socket.remoteAddress ?? "")) return responder(403, { erro: "só dá para salvar no computador onde o MDM está rodando" });
        let texto = "";
        req.on("data", (c) => { texto += c; });
        req.on("end", () => {
          try {
            const r = DocumentoEdicoesSchema.safeParse(JSON.parse(texto));
            if (!r.success) return responder(400, { erro: "isso não é um documento de mudanças do MDM" });
            if (r.data.jogo !== basename(raiz)) return responder(400, { erro: `essas mudanças são do jogo "${r.data.jogo}", e este MDM é de "${basename(raiz)}"` });
            const gravar = !new URL(req.url ?? "", "http://x").searchParams.has("simular");
            const relatorio = salvarNoJogo(raiz, r.data, { gravar });
            if (gravar) {
              for (const a of relatorio.arquivos) { const f = resolve(raiz, a.arquivo); proprios.add(f); setTimeout(() => proprios.delete(f), 3000); }
              invalidar();
            }
            responder(200, relatorio);
          } catch (e) { responder(500, { erro: (e as Error).message }); }
        });
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
