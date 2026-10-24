#!/usr/bin/env node
// Runs Vite for one game: `node scripts/rodar.mjs dev|build|preview --jogo ../meu-jogo`. Sets JOGO (the folder the
// loader reads) and VIS_OUT (the build folder, dist-<game>), then hands the rest of the arguments to Vite.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

const args = process.argv.slice(2);
const comando = args[0];
if (!comando || ["--help", "-h"].includes(comando) || !["dev", "build", "preview"].includes(comando)) {
  console.log(`Usage: node scripts/rodar.mjs <dev|build|preview> --jogo <pasta> [vite args]

  dev      opens the viewer at http://localhost:5190/ reading the game folder live (YAML/TS changes reload the page)
  build    writes a static site to dist-<nome do jogo>/ (relative paths: serve it from any sub-path)
  preview  serves the last build on port 5190

  --jogo PASTA   the game's repo (e.g. ../meu-jogo); also read from the JOGO env var

Examples:
  npm run dev -- --jogo ../meu-jogo
  npm run build -- --jogo ../outro-jogo        # → dist-outro-jogo/`);
  process.exit(comando && !["--help", "-h"].includes(comando) ? 1 : 0);
}
const i = args.indexOf("--jogo");
let jogo = i >= 0 ? args[i + 1] : process.env.JOGO;
if (!jogo) { console.error("Falta --jogo <pasta> (ex.: --jogo ../meu-jogo)"); process.exit(1); }
jogo = resolve(jogo.replace(/^~(?=$|\/)/, homedir()));
if (!existsSync(jogo)) { console.error(`Pasta não existe: ${jogo}`); process.exit(1); }
const resto = args.slice(1).filter((_, k) => k !== i - 1 && k !== i);
const env = { ...process.env, JOGO: jogo, VIS_OUT: `dist-${basename(jogo)}` };
const r = spawnSync("npx", ["vite", comando === "dev" ? "" : comando, ...resto].filter(Boolean), { stdio: "inherit", env, cwd: new URL("..", import.meta.url).pathname });
process.exit(r.status ?? 1);
