#!/usr/bin/env node
// Reads one or more play diaries (the JSON the adults' panel downloads: li2-engine `criarDiario`, src/game/diario.ts)
// and prints what the child actually plays: sessions and time, the quests (done, started and left, never seen), the
// items most picked and used, the features counted, the cutscenes skipped. Several files of the same game are MERGED
// (counts summed, sessions joined and deduplicated by start time), so a folder of weekly exports reads as one.
// With --jogo DIR it also lists the quests of the game's YAML the diary never saw (needs js-yaml, a dev dependency here).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/diario.mjs <diario.json | pasta>... [--jogo DIR] [--json]
  diario.json   a file the adults' panel downloaded ("baixar o diário de uso"); a folder takes every *.json inside
  --jogo DIR    the game's repo: lists quests from src/game/missoes/*.yaml the diary never saw (never started)
  --json        print the merged diary instead of the report (to feed another tool)
Files of different games are reported separately.`);
  process.exit(0);
}

const arquivos = [];
let jogoDir = null, comoJson = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--jogo") jogoDir = args[++i];
  else if (args[i] === "--json") comoJson = true;
  else if (statSync(args[i]).isDirectory()) arquivos.push(...readdirSync(args[i]).filter((f) => f.endsWith(".json")).map((f) => join(args[i], f)));
  else arquivos.push(args[i]);
}

const porJogo = new Map();
for (const f of arquivos) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  if (d.versao !== 1 || !d.jogo) { console.error(`${f}: não é um diário de jogo (versao 1)`); continue; }
  porJogo.set(d.jogo, juntar(porJogo.get(d.jogo), d));
}

function somar(a = {}, b = {}, campos) {
  const r = structuredClone(a);
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number") { r[k] = (r[k] ?? 0) + v; continue; }
    const x = (r[k] ??= {});
    for (const c of campos) {
      if (v[c] === undefined) continue;
      if (c === "primeira" || c === "primeiraVez" || c === "iniciadaAos") x[c] = x[c] === undefined ? v[c] : Math.min(x[c], v[c]);
      else if (c === "ultima" || c === "concluidaEm" || c === "concluidaAos") x[c] = x[c] === undefined ? v[c] : Math.max(x[c], v[c]);
      else x[c] = (x[c] ?? 0) + v[c];
    }
  }
  return r;
}

/** Two exports of the same browser overlap (counters are cumulative): the NEWER file wins; different browsers add up. */
function juntar(a, b) {
  if (!a) return structuredClone(b);
  // same browser: the later export already contains the earlier one
  if (a.criado === b.criado) return b.atualizado > a.atualizado ? structuredClone(b) : a;
  const sessoes = [...a.sessoes, ...b.sessoes].filter((s, i, arr) => arr.findIndex((o) => o.inicio === s.inicio) === i).sort((x, y) => x.inicio - y.inicio);
  return {
    ...a,
    criado: Math.min(a.criado, b.criado), atualizado: Math.max(a.atualizado, b.atualizado), segundos: a.segundos + b.segundos,
    itens: somar(a.itens, b.itens, ["pegou", "usou", "primeira", "ultima"]),
    missoes: somar(a.missoes, b.missoes, ["iniciou", "concluiu", "passos", "iniciadaAos", "concluidaAos", "primeiraVez", "concluidaEm"]),
    recursos: somar(a.recursos, b.recursos), lugares: somar(a.lugares, b.lugares), venceu: somar(a.venceu, b.venceu),
    cenas: somar(a.cenas, b.cenas, ["viu", "pulou"]), dormiu: a.dormiu + b.dormiu, sessoes,
  };
}

const data = (ms) => new Date(ms).toLocaleDateString("pt-BR");
const minutos = (s) => `${Math.round(s / 60)} min`;
const top = (mapa, n = 15) => Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, n);

async function missoesDoJogo(dir) {
  try {
    const m = await import("js-yaml");
    const yaml = m.load ? m : m.default;
    const pasta = join(dir, "src/game/missoes");
    const ids = [];
    for (const f of readdirSync(pasta).filter((f) => f.endsWith(".yaml"))) {
      const doc = yaml.load(readFileSync(join(pasta, f), "utf8"));
      const lista = Array.isArray(doc) ? doc : doc?.missoes ?? (doc?.id ? [doc] : []); // one quest per file, or a list
      for (const m of lista) if (m?.id) ids.push(m.id);
    }
    return ids;
  } catch (e) {
    console.error(`--jogo: não li as missões de ${dir}: ${e.message}`);
    return null;
  }
}

for (const [jogo, d] of porJogo) {
  if (comoJson) { console.log(JSON.stringify(d, null, 2)); continue; }
  const linhas = [];
  linhas.push(`# ${jogo}: diário de uso (${data(d.criado)} a ${data(d.atualizado)})`, "");
  linhas.push(`Sessões: ${d.sessoes.length} · tempo total: ${minutos(d.segundos)} · dormiu ${d.dormiu}x`);
  const ultimas = d.sessoes.slice(-10);
  for (const s of ultimas) linhas.push(`  ${data(s.inicio)}  ${minutos((s.fim - s.inicio) / 1000).padStart(8)}  versão ${s.versaoJogo ?? "?"}  dia ${s.dia ?? "?"}`);
  if (d.sessoes.length > 10) linhas.push(`  (… ${d.sessoes.length - 10} sessões mais antigas)`);

  const ms = Object.entries(d.missoes);
  const feitas = ms.filter(([, m]) => m.concluiu > 0), abertas = ms.filter(([, m]) => m.concluiu === 0);
  linhas.push("", `## Missões: ${feitas.length} concluídas, ${abertas.length} começadas e não terminadas`);
  for (const [id, m] of feitas.sort((a, b) => (a[1].concluidaEm ?? 0) - (b[1].concluidaEm ?? 0))) {
    const levou = m.concluidaAos !== undefined && m.iniciadaAos !== undefined ? minutos(m.concluidaAos - m.iniciadaAos) : "?";
    linhas.push(`  ✓ ${id.padEnd(28)} levou ${levou.padStart(8)} de jogo${m.iniciou > 1 ? ` · recomeçou ${m.iniciou - 1}x` : ""}`);
  }
  for (const [id, m] of abertas) linhas.push(`  … ${id.padEnd(28)} começou em ${m.primeiraVez ? data(m.primeiraVez) : "?"} · ${m.passos} passo(s) avançado(s)`);
  if (jogoDir) {
    const todas = await missoesDoJogo(jogoDir);
    if (todas) {
      const nunca = todas.filter((id) => !d.missoes[id]);
      linhas.push(`  nunca vistas (${nunca.length} de ${todas.length}): ${nunca.join(", ") || "nenhuma"}`);
    }
  }

  linhas.push("", "## Itens mais pegos / usados");
  for (const [id, i] of Object.entries(d.itens).sort((a, b) => b[1].pegou + b[1].usou - a[1].pegou - a[1].usou).slice(0, 15))
    linhas.push(`  ${id.padEnd(24)} pegou ${String(i.pegou).padStart(4)}  usou ${String(i.usou).padStart(4)}  última ${data(i.ultima)}`);

  linhas.push("", "## Recursos (eventos do jogo, usouRecurso)");
  for (const [k, n] of top(d.recursos, 30)) linhas.push(`  ${k.padEnd(32)} ${String(n).padStart(5)}`);
  if (Object.keys(d.lugares).length) { linhas.push("", "## Lugares, NPCs e achados"); for (const [k, n] of top(d.lugares)) linhas.push(`  ${k.padEnd(32)} ${String(n).padStart(5)}`); }
  if (Object.keys(d.venceu).length) { linhas.push("", "## Batalhas vencidas"); for (const [k, n] of top(d.venceu)) linhas.push(`  ${k.padEnd(32)} ${String(n).padStart(5)}`); }
  if (Object.keys(d.cenas).length) {
    linhas.push("", "## Cutscenes (assistiu / pulou)");
    for (const [id, c] of Object.entries(d.cenas)) linhas.push(`  ${id.padEnd(32)} ${String(c.viu).padStart(3)} / ${c.pulou}`);
  }
  console.log(linhas.join("\n"), "\n");
}
if (porJogo.size === 0) { console.error(`nenhum diário em: ${arquivos.map((f) => basename(f)).join(", ") || "(nada)"}`); process.exit(1); }
