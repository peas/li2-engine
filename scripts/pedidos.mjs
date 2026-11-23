#!/usr/bin/env node
// Lists the wishes players wrote inside the games (worker-diario, POST /pedido): one small JSON per wish under
// `pedidos/<jogo>/<AAAA-MM-DD>/` in the private bucket. Reads the local copy of the bucket that `diario.mjs --r2` keeps.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Usage: node scripts/pedidos.mjs [--r2] [--jogo NOME] [--desde AAAA-MM-DD] [--pasta DIR] [--json]
  --r2          sync the bucket first (runs scripts/diario.mjs --r2; same credentials file, see its --help)
  --jogo NOME   only this game (the folder name: dragao, tresilhas...)
  --desde DATA  only wishes received on or after this day
  --pasta DIR   local copy of the bucket (default ~/.cache/li2-engine/diarios)
  --json        print the list as JSON instead of the report
Wishes are free text typed by the players: keep them out of any repo or page.`);
  process.exit(0);
}
const opcao = (nome, padrao) => { const k = args.indexOf(`--${nome}`); return k >= 0 ? args[k + 1] : padrao; };
const pasta = opcao("pasta", join(homedir(), ".cache/li2-engine/diarios"));
if (args.includes("--r2")) {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, "diario.mjs"), "--r2", "--pasta", pasta, "--json"], { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const raiz = join(pasta, "pedidos");
const pedidos = [];
if (existsSync(raiz)) {
  for (const f of readdirSync(raiz, { recursive: true }).filter((f) => f.endsWith(".json"))) {
    try {
      const p = JSON.parse(readFileSync(join(raiz, f), "utf8"));
      if (p.versao === "pedido-1") pedidos.push(p);
    } catch (e) { console.error(`${f}: ${e.message}`); }
  }
}
const jogo = opcao("jogo", null), desde = opcao("desde", "");
const lista = pedidos.filter((p) => (!jogo || p.jogo === jogo) && p.recebido.slice(0, 10) >= desde).sort((a, b) => a.recebido.localeCompare(b.recebido));
if (args.includes("--json")) { console.log(JSON.stringify(lista, null, 2)); process.exit(0); }
if (!lista.length) { console.log("nenhum pedido"); process.exit(0); }
for (const p of lista) {
  const quando = new Date(p.recebido).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  console.log(`${quando}  ${p.jogo}${p.lugar ? ` (${p.lugar})` : ""}  ${p.dispositivo.slice(0, 6)}\n  ${p.nome}${p.descricao ? `\n  ${p.descricao}` : ""}\n`);
}
console.log(`${lista.length} pedido(s)`);
