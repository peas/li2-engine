#!/usr/bin/env node
// Opens the viewer in a real headless Chromium (Playwright from PLAYWRIGHT_DIR or ./node_modules, like the games' testar-*.mjs),
// checks it (no console errors, every visible node inside the view, no two visible nodes overlapping, panel and story
// mode render) and saves PNGs: the whole graph, the panel of a quest, the story mode, the list, and the editing (an arrow
// dragged to another person, a line of dialogue edited, the export JSON) and, when a quest changes the world, its
// "O mundo mudou" box.
import { mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/capturar.mjs (--jogo PASTA | --url URL) [--out DIR] [--missao ID] [--playwright DIR]

  --jogo PASTA      starts its own dev server for that game on port 5191 and stops it at the end
  --url URL         or use a server that is already running (e.g. http://localhost:5190/)
  --out DIR         where the PNGs go (default docs/capturas/<jogo>-<data>)
  --missao ID       the quest for the panel and the story captures (default: the first one with 2+ steps)
  --playwright DIR  node_modules with playwright (default PLAYWRIGHT_DIR or ./node_modules)

Exit code 1 when a check fails. Prints a JSON report.`);
  process.exit(0);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const pw = opt("--playwright", `${process.env.PLAYWRIGHT_DIR ?? "node_modules"}`);
const jogo = opt("--jogo");
let url = opt("--url", "http://127.0.0.1:5190/");
let servidor = null;
if (jogo) {
  servidor = spawn("node", ["scripts/rodar.mjs", "dev", "--jogo", jogo, "--port", "5191"], { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "inherit"], detached: true }); // its own process group: killing it takes Vite along
  url = "http://127.0.0.1:5191/";
  await new Promise((ok, erro) => { servidor.stdout.on("data", (d) => { if (String(d).includes("Local:")) ok(); }); servidor.on("exit", () => erro(new Error("o dev server não subiu"))); });
}
const nome = jogo ? jogo.replace(/\/+$/, "").split("/").pop() : new URL(url).port;
const out = opt("--out", new URL(`../docs/capturas/${nome}-${new Date().toLocaleDateString("sv")}`, import.meta.url).pathname);
mkdirSync(out, { recursive: true });

const { chromium } = await import(pathToFileURL(`${pw}/playwright/index.mjs`).href);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const erros = [];
page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
page.on("pageerror", (e) => erros.push(String(e)));
const checks = [];
const check = (nome, ok, info = "") => { checks.push({ nome, ok: !!ok, info }); if (!ok) console.error(`✗ ${nome} ${info}`); };
const espera = (ms) => page.waitForTimeout(ms);

/** The view holds every visible node and no two visible nodes overlap (the layout is sane). */
async function sanidade(rotulo) {
  const r = await page.evaluate(() => {
    const cy = window.visualizador.cy;
    const ns = cy.nodes().not(".oculto");
    const ext = cy.extent();
    // with a selection the view may centre on it (big graphs): then only the selected node has to be on screen
    const sel = cy.$("node:selected");
    const fora = (sel.nonempty() ? sel : ns).filter((n) => { const b = n.boundingBox(); return b.x1 < ext.x1 - 1 || b.x2 > ext.x2 + 1 || b.y1 < ext.y1 - 1 || b.y2 > ext.y2 + 1; }).map((n) => n.id());
    const boxes = ns.map((n) => ({ id: n.id(), ...n.boundingBox({ includeLabels: false }) }));
    const sobrepostos = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x1 < b.x2 - 2 && b.x1 < a.x2 - 2 && a.y1 < b.y2 - 2 && b.y1 < a.y2 - 2) sobrepostos.push(`${a.id} × ${b.id}`);
    }
    return { visiveis: ns.length, fora, sobrepostos, zoom: cy.zoom() };
  });
  check(`${rotulo}: todos os nós visíveis dentro da tela`, r.fora.length === 0, r.fora.join(", "));
  check(`${rotulo}: nenhum nó em cima de outro`, r.sobrepostos.length === 0, r.sobrepostos.slice(0, 5).join("; "));
  return r;
}

await page.goto(url, { waitUntil: "networkidle" });
await espera(1500);
const titulo = await page.title();
check("página abre com o nome do jogo e MDM", /MDM/.test(titulo), titulo);
const g = await page.evaluate(() => ({ nos: window.visualizador.g.nos.length, arestas: window.visualizador.g.arestas.length, avisos: window.visualizador.g.avisos.length }));
const geral = await sanidade("grafo inteiro");
await page.screenshot({ path: `${out}/1-grafo.png` });

const missaoId = opt("--missao") ?? await page.evaluate(() => {
  const ms = window.visualizador.g.nos.filter((n) => n.tipo === "missao" && !n.desconhecido);
  return (ms.find((m) => m.dados.passos.length >= 2) ?? ms[0])?.chave ?? null;
});
let painel = null, historia = null;
if (missaoId) {
  await page.evaluate((id) => window.visualizador.selecionar(`missao:${id}`), missaoId);
  await espera(900);
  const h2 = await page.textContent("#painel h2");
  check("painel da missão abre", h2 && h2.includes("🎯"), h2 ?? "");
  painel = await sanidade("missão selecionada");
  await page.screenshot({ path: `${out}/2-painel-missao.png` });

  // double click on the giver shows its dialogues
  const quem = await page.evaluate((id) => window.visualizador.g.arestas.find((a) => a.tipo === "da" && a.para === `missao:${id}`)?.de ?? null, missaoId);
  if (quem) {
    const pos = await page.evaluate((q) => { const n = window.visualizador.cy.getElementById(q); const p = n.renderedPosition(); const r = document.querySelector("#grafo").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, quem);
    await page.mouse.dblclick(pos.x, pos.y);
    await espera(900);
    const dialogosVisiveis = await page.evaluate(() => window.visualizador.cy.nodes('[tipo="dialogo"]').not(".oculto").length);
    check("dois cliques numa pessoa mostram as conversas dela", dialogosVisiveis > 0, String(dialogosVisiveis));
    await page.mouse.dblclick(pos.x, pos.y);
    await espera(600);
  }

  await page.evaluate((id) => window.visualizador.modoHistoria(id, 0), missaoId);
  await espera(900);
  const barra = await page.textContent("#historia");
  check("modo história mostra o passo 1", barra && barra.includes("passo 1"), barra ?? "");
  const foco = await page.evaluate(() => window.visualizador.cy.elements(".foco").length);
  check("modo história destaca a missão e os alvos do passo", foco >= 1, String(foco));
  historia = await sanidade("modo história");
  await page.screenshot({ path: `${out}/3-modo-historia.png` });
  await page.keyboard.press("ArrowRight");
  await espera(600);
  check("seta → avança o passo", (await page.textContent("#historia")).includes("passo 2") || (await page.evaluate((id) => window.visualizador.g.nos.find((n) => n.id === `missao:${id}`).dados.passos.length, missaoId)) < 2);
  await page.keyboard.press("Escape");
  await espera(400);
  check("Esc sai do modo história", await page.evaluate(() => document.querySelector("#historia").hidden));
}
await page.click('[data-vista="lista"]');
await espera(400);
const linhas = await page.$$eval("#lista tbody tr", (t) => t.length);
check("vista lista tem uma linha por missão", linhas === (await page.evaluate(() => window.visualizador.g.nos.filter((n) => n.tipo === "missao" && !n.desconhecido).length)), String(linhas));
await page.screenshot({ path: `${out}/4-lista.png` });

// ---- editing: drag an arrow, edit a line, export ----
await page.click('[data-vista="grafo"]');
await page.evaluate(() => { const ed = window.visualizador.editor; ed.mudarAutor("Olivia"); localStorage.setItem(`edicoes:${ed.jogo}:dicas-vistas`, "1"); });
await page.evaluate(() => window.visualizador.ligarEdicao(true));
await espera(900);
check("modo editar liga pelo botão e mostra a barra", await page.evaluate(() => document.body.classList.contains("editando") && !document.querySelector("#barra-editar").hidden));
const seta = await page.evaluate((id) => {
  // the "quem dá a missão" arrow of the quest and another person to drop it on
  const g = window.visualizador.g, cy = window.visualizador.cy, r = document.querySelector("#grafo").getBoundingClientRect();
  const a = g.arestas.find((a) => a.tipo === "da" && a.para === `missao:${id}`);
  const outra = g.nos.find((n) => n.tipo === "pessoa" && !n.desconhecido && n.id !== a?.de && !cy.getElementById(n.id).hasClass("oculto"));
  if (!a || !outra) return null;
  const m = cy.getElementById(a.id).renderedMidpoint(), p = cy.getElementById(outra.id).renderedPosition();
  return { de: { x: r.left + m.x, y: r.top + m.y }, para: { x: r.left + p.x, y: r.top + p.y }, pessoa: outra.chave, nome: outra.nome, atual: a.de };
}, missaoId);
if (seta) {
  await page.mouse.move(seta.de.x, seta.de.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) { await page.mouse.move(seta.de.x + (seta.para.x - seta.de.x) * k / 12, seta.de.y + (seta.para.y - seta.de.y) * k / 12); await espera(30); }
  await page.screenshot({ path: `${out}/5-arrastando-seta.png` });
  await page.mouse.up();
  await espera(900);
  const quem = await page.evaluate((id) => ({ ops: window.visualizador.editor.ops, quem: window.visualizador.editor.conteudo.missoes.find((m) => m.id === id)?.quem, editados: [...window.visualizador.editor.editados] }), missaoId);
  check("arrastar a seta verde até outra pessoa troca quem dá a missão", quem.quem === seta.pessoa && quem.ops.some((o) => o.tipo === "missao.quem" && o.para === seta.pessoa), JSON.stringify(quem));
  check("a missão editada fica marcada (borda tracejada) e guardada no navegador", quem.editados.includes(`missao:${missaoId}`) && !!(await page.evaluate(() => localStorage.getItem(`edicoes:${window.visualizador.editor.jogo}`))));
  await page.evaluate((id) => window.visualizador.selecionar(`missao:${id}`), missaoId);
  await espera(900);
  await page.screenshot({ path: `${out}/6-seta-trocada.png` });
}
const dialogoId = await page.evaluate((id) => window.visualizador.g.arestas.find((a) => a.tipo === "conversa" && a.de === `missao:${id}`)?.para ?? window.visualizador.g.nos.find((n) => n.tipo === "dialogo" && n.dados?.falas?.length)?.id ?? null, missaoId);
if (dialogoId) {
  await page.evaluate((id) => window.visualizador.selecionar(id), dialogoId);
  await espera(900);
  const ta = page.locator('#painel textarea[data-editar="fala"]').first();
  await ta.fill("Oi! Eu mudei esta *fala* no mapa.\nFicou boa?");
  await espera(200);
  const contador = await page.textContent("#painel [data-contador]");
  check("o contador mostra as letras por linha (2 × 38)", /linha 1: 3[0-9]\/38/.test(contador) && /linha 2: 10\/38/.test(contador), contador);
  await page.screenshot({ path: `${out}/7-editando-fala.png` });
  await ta.blur();
  await espera(900);
  const fala = await page.evaluate((id) => window.visualizador.editor.conteudo.dialogos.find((d) => `dialogo:${d.id}` === id)?.falas[0].texto, dialogoId);
  check("sair do campo grava a fala editada", fala === "Oi! Eu mudei esta *fala* no mapa.\nFicou boa?", fala ?? "");
  await ta.fill("Esta fala é comprida demais para caber na caixinha do jogo, com certeza.");
  await ta.blur();
  await espera(600);
  const naoCabe = await page.evaluate((id) => window.visualizador.editor.conteudo.dialogos.find((d) => `dialogo:${d.id}` === id)?.falas[0].texto, dialogoId);
  check("uma fala que não cabe não é gravada (aviso)", naoCabe === "Oi! Eu mudei esta *fala* no mapa.\nFicou boa?");
}
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }).catch(() => null), page.click('[data-ed="exportar"]')]);
if (download) {
  const nome = download.suggestedFilename();
  const caminho = `${out}/${nome}`;
  await download.saveAs(caminho);
  const json = JSON.parse(readFileSync(caminho, "utf8"));
  check("Mandar para o papai baixa edicoes-<jogo>-<data>.json com as mudanças", /^edicoes-.+-\d{4}-\d{2}-\d{2}\.json$/.test(nome) && json.versao === 1 && json.autor === "Olivia" && json.ops.length >= 1, nome);
} else check("Mandar para o papai baixa o JSON", false, "nenhum download");
await page.evaluate(() => window.visualizador.editor.desfazer());
await espera(500);
check("Desfazer volta uma mudança", await page.evaluate(() => window.visualizador.editor.podeRefazer));
await page.evaluate(() => { window.visualizador.editor.apagarTudo(); });
await espera(300);
await page.screenshot({ path: `${out}/8-barra-editar.png`, clip: { x: 0, y: 0, width: 1600, height: 220 } });
// "o mundo mudou": the first quest whose reward changes the world shows the teal box (only when the game has one)
const comMundo = await page.evaluate(() => window.visualizador.g.nos.find((n) => n.tipo === "missao" && Object.keys(n.dados?.ao_concluir?.mundo ?? {}).length)?.chave ?? null);
if (comMundo) {
  await page.evaluate((id) => window.visualizador.selecionar(`missao:${id}`), comMundo);
  await espera(600);
  const caixa = await page.evaluate(() => { const c = document.querySelector("#painel .mundo-mudou"); c?.scrollIntoView(); return c?.textContent ?? ""; });
  check("a missão que muda o mundo mostra a caixinha \"O mundo mudou\"", caixa.includes("O mundo mudou") && caixa.includes(":"), caixa);
  await page.screenshot({ path: `${out}/9-o-mundo-mudou.png` });
}
check("sem erros no console", erros.length === 0, erros.slice(0, 3).join(" | "));

await browser.close();
if (servidor) try { process.kill(-servidor.pid); } catch {}
const falhas = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ url, out, grafo: g, visiveis: { geral: geral.visiveis, painel: painel?.visiveis, historia: historia?.visiveis }, checks: `${checks.length - falhas.length}/${checks.length}`, falhas, erros }, null, 2));
process.exit(falhas.length ? 1 : 0);
