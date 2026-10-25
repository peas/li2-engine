import conteudo from "virtual:jogo";
import { alvosDoPasso, vizinhos } from "../carregador/grafo.ts";
import type { Aresta, Conteudo, Grafo, Missao, TipoNo } from "../carregador/tipos.ts";
import { dicasVistas, marcarDicasVistas } from "../edicoes/armazem.ts";
import { Editor, LIMITES, medirFala } from "../edicoes/editor.ts";
import { GrafoVista } from "./grafo-vista.ts";
import { listaHtml } from "./lista.ts";
import { Painel } from "./painel.ts";
import { COR, esc, ICONE, NOME_TIPO, PLURAL, TIPOS } from "./visual.ts";

/** The content as the repo has it; the editor applies her edits on top and rebuilds the graph after each one. */
const editor = new Editor(conteudo as Conteudo);
let g: Grafo = editor.grafo;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
document.title = `MDM: ${g.jogo.titulo}`;
$("#titulo").textContent = `${g.jogo.titulo}: MDM (Mapa de Dependência de Missões)`;

/** The opening view is the quest chain (quests, people, places, powers, world changes). Items, recipes and the many dialogues start
 * hidden: a chip turns a type on, and a double click on a node opens whatever is linked to it. */
const filtros = new Set<TipoNo>(["missao", "pessoa", "lugar", "poder", "mundo"]);
const expandidos = new Set<string>();
let selecionado: string | null = null;
let busca = "";
let historia: { missao: Missao; passo: number } | null = null;
let vista: "grafo" | "lista" = "grafo";
let editando = false;

const painel = new Painel(g);
painel.editor = editor;
const vistaGrafo = new GrafoVista($("#grafo"), g, {
  clique: (id) => selecionar(id),
  duploClique: (id) => { if (expandidos.has(id)) expandidos.delete(id); else expandidos.add(id); selecionar(id); },
  religar: (a, noId) => religar(a, noId),
  naoEncaixa: (_a, tipo) => aviso(`Essa seta só encaixa em ${ICONE[tipo]} ${PLURAL[tipo]}.`),
});
let porId = new Map(g.nos.map((n) => [n.id, n]));
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function visiveis(): Set<string> {
  const v = new Set<string>();
  if (historia) {
    const eu = `missao:${historia.missao.id}`;
    v.add(eu);
    for (const n of vizinhos(g, eu)) v.add(n);
    return v;
  }
  for (const n of g.nos) if (filtros.has(n.tipo)) v.add(n.id);
  for (const id of expandidos) { v.add(id); for (const n of vizinhos(g, id)) v.add(n); }
  if (selecionado) v.add(selecionado);
  if (busca) for (const n of g.nos) if (normal(n.nome).includes(normal(busca)) || normal(n.chave).includes(normal(busca))) v.add(n.id);
  return v;
}

function desenhar(opts: { animar?: boolean } = {}) {
  const foco = new Set<string>();
  if (historia) {
    const eu = `missao:${historia.missao.id}`;
    foco.add(eu);
    for (const a of alvosDoPasso(g, historia.missao.id, historia.passo)) { foco.add(a.id); foco.add(a.para); }
  } else if (busca) {
    for (const n of g.nos) if (normal(n.nome).includes(normal(busca)) || normal(n.chave).includes(normal(busca))) foco.add(n.id);
  }
  // the panel first: it changes the width left for the graph, and the fit must see the final size
  desenharPainel();
  desenharHistoria();
  desenharBarraEditar();
  const margemInferior = $("#legenda").offsetHeight + (historia ? $("#historia").offsetHeight + 16 : 0);
  vistaGrafo.mostrar(visiveis(), foco, { animar: opts.animar, centrar: selecionado, margemInferior });
  vistaGrafo.selecionar(selecionado);
  vistaGrafo.marcar(editor.editados, editor.arestasEditadas);
  desenharChips();
}

function desenharPainel() {
  const p = $("#painel");
  const n = selecionado ? porId.get(selecionado) : undefined;
  p.innerHTML = n ? painel.html(n, historia && n.id === `missao:${historia.missao.id}` ? historia.passo : undefined) : painel.inicio();
}

function selecionar(id: string | null) {
  selecionado = id;
  if (vista === "lista" && id) trocarVista("grafo");
  desenhar();
}

function desenharChips() {
  const conta = (t: TipoNo) => g.nos.filter((n) => n.tipo === t && !n.desconhecido).length;
  $("#filtros").innerHTML = TIPOS.map((t) => `<button class="chip ${filtros.has(t) ? "ativa" : ""}" data-tipo="${t}" style="--cor:${COR[t]}" ${historia ? "disabled" : ""}>${ICONE[t]} ${PLURAL[t]} <span class="conta">${conta(t)}</span></button>`).join("");
}

function desenharLegenda() {
  $("#legenda").innerHTML = TIPOS.map((t) => `<span class="item"><span class="bola" style="--cor:${COR[t]}"></span>${ICONE[t]} ${PLURAL[t]}</span>`).join("") +
    `<span class="item"><span class="bola editado"></span>✏️ mudado por ${esc(editor.autor || "você")}</span>` +
    `<span class="dica">1 clique: abre · 2 cliques: mostra o que está ligado · seta verde: quem dá a missão · seta vermelha: o que destrava o quê · 🌍 verde-água: o mundo mudou</span>`;
}

function desenharAvisos() {
  const a = $("#avisos");
  if (!g.avisos.length) { a.hidden = true; return; }
  a.hidden = false;
  a.innerHTML = `<details><summary>⚠️ ${g.avisos.length} aviso${g.avisos.length > 1 ? "s" : ""}: coisas que o jogo cita e eu não achei nos arquivos</summary><ul>${g.avisos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
}

function desenharHistoria() {
  const h = $("#historia");
  if (!historia) { h.hidden = true; return; }
  const { missao, passo } = historia;
  const p = missao.passos[passo];
  h.hidden = false;
  h.innerHTML = `<button data-h="sair">✕ sair</button><button data-h="-1" ${passo === 0 ? "disabled" : ""}>◀</button>
    <div class="passo"><b>📖 ${esc(missao.titulo)} · passo ${passo + 1} de ${missao.passos.length}</b>${esc(p?.texto ?? "(sem passos)")}</div>
    <button data-h="+1" ${passo >= missao.passos.length - 1 ? "disabled" : ""}>▶</button>`;
}

function modoHistoria(id: string | null, passo = 0) {
  const n = id ? porId.get(`missao:${id}`) : undefined;
  historia = n && !n.desconhecido ? { missao: n.dados as Missao, passo } : null;
  if (historia) selecionado = n!.id;
  desenhar();
}

function trocarVista(v: "grafo" | "lista") {
  vista = v;
  $("#grafo").style.display = v === "grafo" ? "" : "none";
  $<HTMLElement>("#lista").hidden = v !== "lista";
  $("#legenda").style.display = v === "grafo" ? "" : "none";
  document.querySelectorAll<HTMLButtonElement>(".vista").forEach((b) => b.classList.toggle("ativa", b.dataset.vista === v));
  if (v === "lista") $("#lista").innerHTML = listaHtml(g, painel);
  else vistaGrafo.cy.resize();
}

// ---- editing ----

/** The game with her edits: same origin in production (/tresilhas/mdm/ → /tresilhas/); in dev the ops go in the URL. */
function linkDoJogo(): string {
  if (import.meta.env.DEV) return `http://localhost:5180/?edicoes=${encodeURIComponent(JSON.stringify(editor.documento()))}`;
  return "../";
}

function desenharBarraEditar() {
  const b = $("#barra-editar");
  $("#editar").classList.toggle("ativa", editando);
  $("#editar").textContent = editando ? "✅ Pronto, sair do MDM editor" : "✏️ MDM editor: quero mudar o jogo";
  b.hidden = !editando;
  if (!editando) return;
  const n = editor.ops.length, c = editor.conflitos.length;
  b.innerHTML = `<span class="quem">✏️ MDM editor · ${esc(editor.autor || "você")}: <b>${n}</b> mudança${n === 1 ? "" : "s"}${c ? ` <span class="revisar">⚠️ ${c} para revisar</span>` : ""}</span>
    <button data-ed="desfazer" ${editor.podeDesfazer ? "" : "disabled"} title="desfazer (Ctrl+Z)">↶ Desfazer</button>
    <button data-ed="refazer" ${editor.podeRefazer ? "" : "disabled"} title="refazer (Ctrl+Shift+Z)">↷ Refazer</button>
    <button data-ed="voltar-tudo" ${n ? "" : "disabled"}>↩ Voltar tudo ao original</button>
    <span class="espaco"></span>
    <a class="botao" href="${esc(linkDoJogo())}" target="_blank" rel="noopener" ${n ? "" : 'aria-disabled="true"'}>🎮 Ver no jogo</a>
    ${SALVA_NO_JOGO ? `<button data-ed="salvar" ${n ? "" : "disabled"}>💾 Salvar no jogo</button>` : ""}
    <button data-ed="exportar" ${n ? "" : "disabled"}>📤 Mandar para o papai</button>
    <button data-ed="importar">📥 Trazer de volta</button>
    <button data-ed="apagar" class="perigo" ${n ? "" : "disabled"}>🗑️ Apagar tudo</button>
    <button data-ed="dicas" title="como funciona">❓</button>`;
}

function religar(a: Aresta, noId: string) {
  const no = porId.get(noId);
  if (!no || a.missao === undefined) return;
  if (a.tipo === "da") editor.mudarQuem(a.missao, no.chave);
  else if (a.passo !== undefined && a.campo) editor.mudarAlvo(a.missao, a.passo, a.campo, porId.get(a.para)?.chave ?? "", no.chave);
  aviso(`Pronto: agora ${a.tipo === "da" ? "quem dá a missão é" : "a seta aponta para"} ${ICONE[no.tipo]} ${no.nome}. ↶ Desfazer volta.`);
}

let avisoTimer = 0;
function aviso(texto: string) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = window.setTimeout(() => { t.hidden = true; }, 3500);
}

/** A big, simple dialog: `botoes` are the choices (the first is the main one); resolves with the chosen index, -1 on Esc. */
function perguntar(html: string, botoes: string[], opts: { campo?: { valor: string; placeholder: string } } = {}): Promise<{ escolha: number; texto: string }> {
  const d = $<HTMLDialogElement>("#dialogo");
  d.innerHTML = `<form method="dialog">${html}${opts.campo ? `<input id="dialogo-campo" value="${esc(opts.campo.valor)}" placeholder="${esc(opts.campo.placeholder)}" maxlength="30" autocomplete="off">` : ""}
    <div class="botoes">${botoes.map((b, i) => `<button value="${i}" ${i === 0 ? "autofocus" : 'class="secundario"'}>${esc(b)}</button>`).join("")}</div></form>`;
  d.showModal();
  if (opts.campo) $<HTMLInputElement>("#dialogo-campo").focus();
  return new Promise((ok) => {
    d.onclose = () => ok({ escolha: d.returnValue === "" ? -1 : Number(d.returnValue), texto: (d.querySelector("#dialogo-campo") as HTMLInputElement | null)?.value ?? "" });
  });
}

async function dicas() {
  await perguntar(`<h2>✏️ MDM editor: mudar o jogo</h2>
    <ul class="dicas">
      <li><b>Arraste a ponta de uma seta</b> até outra caixinha: a missão passa a ser de outra pessoa, o passo vai para outro lugar ou pede outro item. Só encaixa onde faz sentido.</li>
      <li><b>Clique numa missão ou numa conversa</b> e mude o texto, a quantidade, a recompensa ou a ordem dos passos no painel do lado.</li>
      <li>O que você mudou fica com <b>borda roxa tracejada</b>. Nada se perde quando você fecha a página.</li>
      <li><b>↶ Desfazer</b> volta um passo; <b>↩ Voltar ao original</b> desfaz uma caixinha; <b>🎮 Ver no jogo</b> abre o jogo já com as suas mudanças.</li>
      <li>Quando ficar bom, <b>📤 Mandar para o papai</b> baixa um arquivo para ele colocar no jogo de verdade.</li>
    </ul>`, ["Entendi!"]);
  marcarDicasVistas(editor.jogo);
}

async function ligarEdicao(ligar: boolean) {
  if (ligar && !editor.autor) {
    const r = await perguntar(`<h2>Quem está mudando o jogo?</h2><p>Escreva o seu nome: ele aparece nas mudanças e no jogo.</p>`, ["Sou eu!", "Deixa para depois"], { campo: { valor: "", placeholder: "seu nome" } });
    if (r.escolha === 0 && r.texto.trim()) editor.mudarAutor(r.texto);
    else if (r.escolha !== 0) return;
  }
  editando = ligar;
  painel.editando = ligar;
  vistaGrafo.editando = ligar;
  document.body.classList.toggle("editando", ligar);
  desenharLegenda();
  desenhar({ animar: false });
  if (ligar && !dicasVistas(editor.jogo)) await dicas();
}

function exportar() {
  const { nome, json } = editor.exportar();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  aviso(`Baixei ${nome}. Mande esse arquivo para o papai!`);
}

/** Only the MDM running on this computer (the dev server) can write the game's files; a published copy cannot. */
const SALVA_NO_JOGO = import.meta.env.DEV;

/** "💾 Salvar no jogo": preview what changes in which file, then write; the ops written leave the browser, the ones that need review stay. */
async function salvarNoJogo() {
  const enviar = async (simular: boolean) => {
    const r = await fetch(`/__mdm/salvar${simular ? "?simular=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editor.documento()) });
    const corpo = await r.json();
    if (!r.ok) throw new Error(corpo.erro ?? `erro ${r.status}`);
    return corpo as { arquivos: { arquivo: string; aplicadas: unknown[] }[]; conflitos: { op: unknown }[]; semArquivo: unknown[] };
  };
  try {
    const previa = await enviar(true);
    const n = previa.arquivos.reduce((t, a) => t + a.aplicadas.length, 0), revisar = previa.conflitos.length + previa.semArquivo.length;
    if (!n) { aviso("Nada para salvar: as mudanças precisam ser revistas antes."); return; }
    const { escolha } = await perguntar(`<h2>💾 Salvar no jogo</h2>
      <p>Vou escrever <b>${n}</b> mudança${n === 1 ? "" : "s"} em <b>${previa.arquivos.length}</b> arquivo${previa.arquivos.length === 1 ? "" : "s"} do jogo:</p>
      <ul class="dicas">${previa.arquivos.map((a) => `<li><code>${esc(a.arquivo)}</code></li>`).join("")}</ul>
      ${revisar ? `<p>⚠️ ${revisar} mudança${revisar === 1 ? " precisa" : "s precisam"} ser revista${revisar === 1 ? "" : "s"} e fica${revisar === 1 ? "" : "m"} aqui no MDM.</p>` : ""}
      <p>Depois o jogo já abre com elas. O papai vê no git o que mudou.</p>`, ["💾 Salvar", "Agora não"]);
    if (escolha !== 0) return;
    const feito = await enviar(false);
    const ficam = new Set([...feito.conflitos.map((c) => JSON.stringify(c.op)), ...feito.semArquivo.map((o) => JSON.stringify(o))]);
    editor.manter(editor.ops.filter((o) => ficam.has(JSON.stringify(o))));
    aviso(`Salvei no jogo! ${feito.arquivos.length} arquivo${feito.arquivos.length === 1 ? "" : "s"} mudado${feito.arquivos.length === 1 ? "" : "s"}. Abrindo de novo…`);
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    aviso(`Não consegui salvar: ${(e as Error).message}. As mudanças continuam aqui.`);
  }
}

function importar() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const erro = editor.importar(await f.text());
    aviso(erro ? `Não deu: ${erro}.` : `Trouxe ${editor.ops.length} mudança${editor.ops.length === 1 ? "" : "s"} de volta.`);
  };
  input.click();
}

async function apagarTudo() {
  const n = editor.ops.length;
  const um = await perguntar(`<h2>🗑️ Apagar tudo?</h2><p>Isso apaga as suas <b>${n}</b> mudanças e não dá para desfazer.</p>`, ["Não, deixa", "Apagar as mudanças"]);
  if (um.escolha !== 1) return;
  const dois = await perguntar(`<h2>Tem certeza mesmo?</h2><p>Se quiser guardar antes, use 📤 Mandar para o papai.</p>`, ["Não, deixa", "Sim, apagar tudo"]);
  if (dois.escolha !== 1) return;
  editor.apagarTudo();
  aviso("Apaguei. O MDM voltou a ser o original.");
}

editor.aoMudar = () => {
  g = editor.grafo;
  porId = new Map(g.nos.map((n) => [n.id, n]));
  painel.trocarGrafo(g);
  vistaGrafo.recarregar(g);
  if (historia) { const n = porId.get(`missao:${historia.missao.id}`); historia = n ? { missao: n.dados as Missao, passo: Math.min(historia.passo, (n.dados as Missao).passos.length - 1) } : null; }
  desenharLegenda();
  desenhar({ animar: false });
};

// ---- wiring ----
document.body.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-no],[data-fechar],[data-historia],[data-h],[data-tipo],[data-vista],[data-ed],[data-mover],[data-voltar],#editar");
  if (!el) return;
  if (el.dataset.no) selecionar(el.dataset.no);
  else if ("fechar" in el.dataset) selecionar(null);
  else if (el.dataset.historia) modoHistoria(el.dataset.historia);
  else if (el.dataset.h) { if (el.dataset.h === "sair") modoHistoria(null); else modoHistoria(historia!.missao.id, historia!.passo + Number(el.dataset.h)); }
  else if (el.dataset.tipo) { const t = el.dataset.tipo as TipoNo; if (filtros.has(t)) filtros.delete(t); else filtros.add(t); desenhar(); }
  else if (el.dataset.vista) trocarVista(el.dataset.vista as "grafo" | "lista");
  else if (el.id === "editar") void ligarEdicao(!editando);
  else if (el.dataset.ed) {
    const acao = el.dataset.ed;
    if (acao === "desfazer") editor.desfazer();
    else if (acao === "refazer") editor.refazer();
    else if (acao === "voltar-tudo") { editor.voltarTudo(); aviso("Tudo voltou ao original (↶ Desfazer traz as mudanças de volta)."); }
    else if (acao === "salvar") void salvarNoJogo();
    else if (acao === "exportar") exportar();
    else if (acao === "importar") importar();
    else if (acao === "apagar") void apagarTudo();
    else if (acao === "dicas") void dicas();
  }
  else if (el.dataset.mover) editor.moverPasso(el.dataset.missao!, Number(el.dataset.passo), Number(el.dataset.mover));
  else if (el.dataset.voltar) { editor.voltar(el.dataset.voltar); aviso("Essa caixinha voltou ao original."); }
});
/** Panel inputs commit on change (blur / Enter): the panel is re-rendered after every edit, so typing must not redraw. */
$("#painel").addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const d = el.dataset;
  if (!d.editar) return;
  const missao = d.missao ?? "";
  switch (d.editar) {
    case "titulo": case "descricao": editor.mudarTexto(missao, d.editar, el.value); break;
    case "quem": editor.mudarQuem(missao, el.value); break;
    case "alvo": editor.mudarAlvo(missao, Number(d.passo), d.campo!, d.atual!, el.value); break;
    case "qtd": editor.mudarQtd(missao, Number(d.passo), Number(el.value)); break;
    case "coracoes": case "moedas": editor.mudarRecompensa(missao, d.editar, Number(el.value)); break;
    case "fala":
      // a line that does not fit the game's box is not committed: she sees the red counter and shortens it
      if (!medirFala(el.value).cabe) { aviso(`Essa fala não cabe na caixa do jogo: no máximo ${LIMITES.fala.linhas} linhas de ${LIMITES.fala.letras} letras.`); el.focus(); return; }
      editor.mudarFala(d.dialogo!, Number(d.indice), el.value);
      break;
  }
});
/** While she types a line: the counter and the colour preview follow, without re-rendering. */
$("#painel").addEventListener("input", (e) => {
  const el = e.target as HTMLTextAreaElement;
  if (el.dataset.editar !== "fala") return;
  const caixa = el.closest(".fala")!;
  const m = painel.contadorHtml(el.value);
  const contador = caixa.querySelector("[data-contador]")!;
  contador.innerHTML = m;
  contador.classList.toggle("estourou", m.includes("⚠️"));
  caixa.querySelector("[data-previa]")!.innerHTML = esc(el.value).replace(/\*([^*]+)\*/g, '<span class="c1">$1</span>').replace(/_([^_]+)_/g, '<span class="c2">$1</span>').replace(/\n/g, "<br>");
});
$("#painel").addEventListener("keydown", (e) => {
  // Enter commits a one-line field (a title); in a line of dialogue it is the line break (max 2 lines)
  const el = e.target as HTMLElement;
  if (e.key === "Enter" && el.tagName === "INPUT") (el as HTMLInputElement).blur();
  if (e.key === "Enter" && el.tagName === "TEXTAREA" && (el as HTMLTextAreaElement).dataset.editar === "descricao") { e.preventDefault(); el.blur(); }
});
$<HTMLInputElement>("#busca").addEventListener("input", (e) => { busca = (e.target as HTMLInputElement).value.trim(); desenhar({ animar: false }); });
$<HTMLInputElement>("#busca").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !busca) return;
  const n = g.nos.find((n) => normal(n.nome).includes(normal(busca)) || normal(n.chave).includes(normal(busca)));
  if (n) selecionar(n.id);
});
document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (editando && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) editor.refazer(); else editor.desfazer(); return; }
  if (e.key === "Escape") { if (historia) modoHistoria(null); else selecionar(null); }
  if (historia && e.key === "ArrowRight" && historia.passo < historia.missao.passos.length - 1) modoHistoria(historia.missao.id, historia.passo + 1);
  if (historia && e.key === "ArrowLeft" && historia.passo > 0) modoHistoria(historia.missao.id, historia.passo - 1);
});

desenharLegenda();
desenharAvisos();
desenhar({ animar: false });
// she already has edits: say so right away (the badge in the legend and the dashed nodes do the rest)
if (editor.ops.length) aviso(`Este MDM tem ${editor.ops.length} mudança${editor.ops.length === 1 ? "" : "s"} ${editor.autor ? `de ${editor.autor}` : "suas"}. Clique em ✏️ para continuar.`);

/** For the capture script and for poking around in the console. */
Object.assign(window, { visualizador: {
  get g() { return g; }, editor, selecionar, modoHistoria, trocarVista, ligarEdicao, png: () => vistaGrafo.png(), cy: vistaGrafo.cy,
  filtro: (t: TipoNo, on: boolean) => { on ? filtros.add(t) : filtros.delete(t); desenhar({ animar: false }); },
  nomeTipo: NOME_TIPO,
} });
