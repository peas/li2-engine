#!/usr/bin/env node
// Writes the edits a child exported from the MDM editor ("Mandar para o papai": edicoes-<jogo>-<data>.json) into the game's
// YAML files changing only what she changed (src/edicoes/salvar.ts + yaml.ts; the MDM dev server's "Salvar no jogo" does the same). Prints a diff per file; an op whose original value no
// longer matches the repo is a conflict: reported, never applied. Run the game's tests afterwards (npm test there).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DocumentoEdicoesSchema, descreverOp } from "../../src/game/edicoes/edicoes.ts";
import { lerManifesto } from "../../src/game/manifesto.ts";
import { salvarNoJogo } from "../src/edicoes/salvar.ts";

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
console.log(`${doc.ops.length} mudança(s) de ${doc.autor || "?"} para ${manifesto.nome} (${raiz})${dry ? " [dry-run]" : ""}\n`);
const r = salvarNoJogo(raiz, doc, { gravar: !dry });
for (const a of r.arquivos) {
  console.log(`── ${a.arquivo} (${a.aplicadas.length} mudança(s))${a.reescrito ? " [reescrito pelo Document: confira os comentários]" : ""}`);
  for (const op of a.aplicadas) console.log(`   • ${descreverOp(op)}`);
  for (const l of a.diff) console.log(`   ${l}`);
  console.log("");
}
if (r.semArquivo.length) {
  console.log(`⚠️ sem arquivo no repo (missão ou conversa que não existe mais):`);
  for (const op of r.semArquivo) console.log(`   • ${descreverOp(op)}`);
}
if (r.conflitos.length) {
  console.log(`⚠️ ${r.conflitos.length} conflito(s): o repo mudou depois da edição, revise à mão:`);
  for (const c of r.conflitos) console.log(`   • ${c.arquivo}: ${c.motivo}\n     (ela queria: ${descreverOp(c.op)})`);
}
console.log(`\n${dry ? "nada escrito (dry-run)" : `${r.arquivos.length} arquivo(s) escrito(s)`}; ${r.conflitos.length} conflito(s), ${r.semArquivo.length} sem arquivo. Agora: npm test no jogo e commit.`);
process.exit(r.conflitos.length || r.semArquivo.length ? 1 : 0);
