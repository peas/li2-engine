#!/usr/bin/env node
// Writes the edits a child exported from the map ("Mandar para o papai": edicoes-<jogo>-<data>.json) into the game's
// YAML files, keeping comments and order (src/edicoes/yaml.ts). Prints a diff per file; an op whose original value no
// longer matches the repo is a conflict: reported, never applied. Run the game's tests afterwards (npm test there).
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { DocumentoEdicoesSchema, descreverOp } from "../../src/game/edicoes/edicoes.ts";
import { lerManifesto } from "../../src/game/manifesto.ts";
import { arquivosDoCaminho } from "../src/carregador/ler.ts";
import { aplicarNoYaml, diffLinhas } from "../src/edicoes/yaml.ts";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || !args.includes("--json")) {
  console.log(`Usage: node scripts/aplicar-edicoes.mjs --jogo PASTA --json edicoes.json [--dry-run]

Applies the edits exported from the content map (the "Mandar para o papai" JSON) to the game's YAML files.

  --jogo PASTA     the game folder (e.g. ../meu-jogo); default: the folder named in the JSON, under ~
  --json ARQUIVO   the exported edicoes-<jogo>-<data>.json
  --dry-run        print the diffs, write nothing

Files come from the game's jogo.yaml (conteudo.missoes, conteudo.dialogos). Comments, key order and quotes are kept.
An op whose original value ("de") no longer matches the file is a CONFLICT: listed at the end, not applied (the child
edited something the repo changed since). Exit code 1 when there are conflicts or unknown targets, so you look at them.
After applying, run the game's tests (npm test) and commit the YAML.`);
  process.exit(args.includes("--json") ? 0 : 1);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const dry = args.includes("--dry-run");
const doc = DocumentoEdicoesSchema.parse(JSON.parse(readFileSync(opt("--json"), "utf8")));
const raiz = resolve((opt("--jogo") ?? `~/${doc.jogo}`).replace(/^~(?=$|\/)/, homedir()));
const manifesto = lerManifesto(readFileSync(join(raiz, "jogo.yaml"), "utf8"));
const rel = (f) => relative(raiz, f);

/** file → { tipo, id } for every quest and dialogue file the manifest lists. */
const arquivos = new Map();
for (const f of arquivosDoCaminho(raiz, manifesto.conteudo.missoes ?? "")) {
  const id = parse(readFileSync(f, "utf8"))?.id;
  if (typeof id === "string") arquivos.set(f, { tipo: "missao", id });
}
for (const f of arquivosDoCaminho(raiz, manifesto.conteudo.dialogos ?? "")) arquivos.set(f, { tipo: "dialogo", id: basename(f).replace(/\.ya?ml$/, "") });
const porAlvo = new Map([...arquivos].map(([f, a]) => [`${a.tipo}:${a.id}`, f]));

console.log(`${doc.ops.length} mudança(s) de ${doc.autor || "?"} para ${manifesto.nome} (${raiz})${dry ? " [dry-run]" : ""}\n`);
const grupos = new Map();
const semArquivo = [];
for (const op of doc.ops) {
  const alvo = op.tipo === "fala.texto" ? `dialogo:${op.dialogo}` : `missao:${op.missao}`;
  const f = porAlvo.get(alvo);
  if (!f) { semArquivo.push(op); continue; }
  if (!grupos.has(f)) grupos.set(f, []);
  grupos.get(f).push(op);
}
const conflitos = [];
let escritos = 0;
for (const [f, ops] of grupos) {
  const { tipo, id } = arquivos.get(f);
  const antes = readFileSync(f, "utf8");
  const r = aplicarNoYaml(antes, tipo, id, ops);
  conflitos.push(...r.conflitos.map((c) => ({ ...c, arquivo: rel(f) })));
  if (!r.aplicadas.length) continue;
  console.log(`── ${rel(f)} (${r.aplicadas.length} mudança(s))`);
  for (const op of r.aplicadas) console.log(`   • ${descreverOp(op)}`);
  for (const l of diffLinhas(antes, r.fonte)) console.log(`   ${l}`);
  console.log("");
  if (!dry) { writeFileSync(f, r.fonte); escritos++; }
}
if (semArquivo.length) {
  console.log(`⚠️ sem arquivo no repo (missão ou conversa que não existe mais):`);
  for (const op of semArquivo) console.log(`   • ${descreverOp(op)}`);
}
if (conflitos.length) {
  console.log(`⚠️ ${conflitos.length} conflito(s): o repo mudou depois da edição, revise à mão:`);
  for (const c of conflitos) console.log(`   • ${c.arquivo}: ${c.motivo}\n     (ela queria: ${descreverOp(c.op)})`);
}
console.log(`\n${dry ? "nada escrito (dry-run)" : `${escritos} arquivo(s) escrito(s)`}; ${conflitos.length} conflito(s), ${semArquivo.length} sem arquivo. Agora: npm test no jogo e commit.`);
process.exit(conflitos.length || semArquivo.length ? 1 : 0);
