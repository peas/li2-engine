#!/usr/bin/env node
/**
 * Writes MISSOES.md for a game: the quest table (who gives it, what it needs, the steps, the reward), the people and
 * the places, in Markdown, for Paulo to scribble new quests on top of. Node runs this TS directly (Node ≥ 23).
 *
 *   node scripts/missoes-md.ts --jogo ../meu-jogo [--out ARQUIVO]     (default: docs/MISSOES-<jogo>.md here)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { montarGrafo } from "../src/carregador/grafo.ts";
import { lerJogo } from "../src/carregador/ler.ts";
import { descreverPasso, descreverRecompensa } from "../src/carregador/texto.ts";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || !args.includes("--jogo")) {
  console.log(`Usage: node scripts/missoes-md.ts --jogo <pasta> [--out ARQUIVO]

Reads the game's quests, dialogues, people, places and items and writes one Markdown file with:
  - the quest table: title, who gives it, what it requires, difficulty, the steps (one line each), the reward
  - the people (name, role, where they stand, which quests they give)
  - the places (key, description, which quests pass by)
  - the warnings (ids that point nowhere)
Default output: docs/MISSOES-<nome do jogo>.md in this folder. Nothing is written inside the game's repo.`);
  process.exit(args.includes("--jogo") ? 0 : 1);
}
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const pasta = resolve(opt("--jogo")!.replace(/^~(?=$|\/)/, homedir()));
const c = lerJogo(pasta);
const g = montarGrafo(c);
const nome = (tipo: string, chave: string) => g.nos.find((n) => n.tipo === tipo && n.chave === chave)?.nome ?? chave;
const hoje = new Date().toLocaleDateString("sv-SE"); // local date as YYYY-MM-DD

const linhas: string[] = [];
linhas.push(`# Missões de ${c.jogo.titulo}`, "", `Gerado em ${hoje} por \`visualizador/scripts/missoes-md.ts --jogo ${pasta}\` a partir de \`${c.lidos.missoes ?? "?"}\`. Edite as missões nos YAML do jogo; este arquivo é para ler e rabiscar as próximas.`, "");
linhas.push("## Missões", "", "| Missão | Quem dá | Exige | Dificuldade | Passos | Recompensa |", "|---|---|---|---|---|---|");
for (const m of c.missoes) {
  const passos = m.passos.map((p, i) => `${i + 1}. ${descreverPasso(p, nome, c.passosExtras)}`).join("<br>");
  linhas.push(`| **${m.titulo}** (\`${m.id}\`)<br>${m.descricao} | ${nome("pessoa", m.quem)} | ${m.requer.map((r) => nome("missao", r)).join(", ") || "—"} | ${m.dificuldade} | ${passos || "—"} | ${descreverRecompensa(m.ao_concluir, nome) || "—"} |`);
}
linhas.push("", "## Pessoas", "", "| Pessoa | Papel | Fica em | Dá as missões |", "|---|---|---|---|");
for (const p of c.pessoas) linhas.push(`| **${p.nome}** (\`${p.id}\`) | ${p.papel ?? "—"} | ${p.lugar ?? "—"} | ${c.missoes.filter((m) => m.quem === p.id).map((m) => m.titulo).join(", ") || "—"} |`);
const soQuem = [...new Set(c.missoes.map((m) => m.quem))].filter((q) => !c.pessoas.some((p) => p.id === q));
for (const q of soQuem) linhas.push(`| \`${q}\` (não está em nenhum catálogo lido) | — | — | ${c.missoes.filter((m) => m.quem === q).map((m) => m.titulo).join(", ")} |`);
linhas.push("", "## Lugares", "", "| Lugar | O que é | Missões que passam por ele |", "|---|---|---|");
for (const l of c.lugares) {
  const miss = [...new Set(g.arestas.filter((a) => a.para === `lugar:${l.id}` && a.missao).map((a) => nome("missao", a.missao!)))];
  linhas.push(`| \`${l.id}\`${l.lista ? " (lista de pontos)" : ""} | ${l.descricao ?? "—"} | ${miss.join(", ") || "—"} |`);
}
linhas.push("", "## Itens", "", "| Item | Tipo | Descrição | Quem pede / dá |", "|---|---|---|---|");
for (const it of c.itens) {
  const miss = [...new Set(g.arestas.filter((a) => a.para === `item:${it.id}` && a.missao !== undefined).map((a) => nome("missao", a.missao!)))];
  linhas.push(`| **${it.nome}** (\`${it.id}\`) | ${it.tipo ?? "—"} | ${it.descricao ?? "—"} | ${miss.join(", ") || "—"} |`);
}
if (c.receitas.length) {
  linhas.push("", "## Receitas", "", "| Receita | Ingredientes | Faz |", "|---|---|---|");
  for (const r of c.receitas) linhas.push(`| **${r.nome}** | ${Object.entries(r.ingredientes).map(([k, v]) => `${v}× ${nome("item", k)}`).join(", ")} | ${nome("item", r.resultado)} |`);
}
if (c.poderes.length) {
  linhas.push("", "## Poderes", "", "| Poder | O que faz | Quem ensina |", "|---|---|---|");
  for (const p of c.poderes) linhas.push(`| **${p.nome}** | ${p.descricao ?? "—"} | ${c.missoes.filter((m) => m.ao_concluir?.poder === p.id).map((m) => m.titulo).join(", ") || "—"} |`);
}
linhas.push("", "## Avisos", "");
for (const a of g.avisos) linhas.push(`- ${a}`);
if (!g.avisos.length) linhas.push("- nenhum");
linhas.push("", "## Rascunho das próximas", "", "_(rabisque aqui: título, quem dá, o que exige, passos, recompensa)_", "");

const out = resolve(opt("--out") ?? new URL(`../docs/MISSOES-${c.jogo.nome}.md`, import.meta.url).pathname);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, linhas.join("\n"));
console.log(`${out}: ${c.missoes.length} missões, ${c.pessoas.length} pessoas, ${c.lugares.length} lugares, ${g.avisos.length} avisos`);
