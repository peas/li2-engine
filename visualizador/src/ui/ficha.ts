/**
 * The MDM editor's property panel for a quest ("a ficha", à la Visual Basic): every field of the quest and of each step
 * as a labelled control, the YAML key as the label (monospace), choices from the game's whole catalogue, "⚠️ falta"
 * where something required is empty, the reward's items, what the panel does not edit shown read-only, and the file as
 * it would be written ("📜 ver como está escrito no jogo"). Pure HTML strings; main.ts wires the changes to the editor.
 */
import type { z } from "zod";
import { camposDoPasso, esquemaDaMissao, tiposDePasso, type CampoDoPasso } from "../carregador/esquema.ts";
import { iconePasso, valorMundo } from "../carregador/texto.ts";
import type { Grafo, Missao, PassoExtra, TipoNo } from "../carregador/tipos.ts";
import { LIMITES, type Editor } from "../edicoes/editor.ts";
import { aplicarNoYaml, marcarLinhas } from "../edicoes/yaml.ts";
import { esc, ICONE } from "./visual.ts";

/** The keys the ficha edits or shows in its own place; anything else of the quest goes to "outras coisas". */
const NA_FICHA = new Set(["id", "titulo", "descricao", "quem", "dificuldade", "passos", "ao_concluir", "arquivo", "avisos", "fonte", "repetivel"]);
const TIPO_DO_CATALOGO: Partial<Record<CampoDoPasso["tipo"], TipoNo>> = { pessoa: "pessoa", item: "item", lugar: "lugar", dialogo: "dialogo" };

export interface Problema { missao: string; passo?: number; campo: string; motivo: string }

/** What is missing or wrong in a quest as it is now: the game's schema plus the catalogue (an id nothing has). */
export function problemasDaMissao(m: Missao, g: Grafo): Problema[] {
  const out: Problema[] = [];
  const r = esquemaDaMissao(g.passosExtras).safeParse(m);
  if (!r.success) {
    for (const i of (r.error as z.ZodError).issues) {
      const [a, b, c] = i.path;
      if (a === "passos" && typeof b === "number") out.push({ missao: m.id, passo: b, campo: String(c ?? "tipo"), motivo: m.passos[b]?.[String(c)] === undefined || m.passos[b]?.[String(c)] === "" ? "falta" : "não vale" });
      else out.push({ missao: m.id, campo: String(a ?? "?"), motivo: "não vale" });
    }
  }
  const existe = new Set(g.nos.filter((n) => !n.desconhecido).map((n) => n.id));
  m.passos.forEach((p, i) => {
    for (const c of camposDoPasso(String(p.tipo), g.passosExtras)) {
      const alvo = TIPO_DO_CATALOGO[c.tipo];
      const v = p[c.campo];
      if (!alvo || typeof v !== "string" || v === "") continue;
      if (!existe.has(`${alvo}:${v}`) && !out.some((x) => x.passo === i && x.campo === c.campo)) out.push({ missao: m.id, passo: i, campo: c.campo, motivo: "não existe no jogo" });
    }
  });
  return out;
}

/** Starting values of a new step of `tipo`: every required field gets something valid where it can (`""` where only she can say). */
export function passoInicial(tipo: string, m: Missao, g: Grafo): Record<string, string | number | boolean> {
  const primeiro = (t: TipoNo) => g.nos.filter((n) => n.tipo === t && !n.desconhecido).sort((a, b) => a.nome.localeCompare(b.nome, "pt"))[0]?.chave ?? "";
  const p: Record<string, string | number | boolean> = { tipo };
  for (const c of camposDoPasso(tipo, g.passosExtras)) {
    if (!c.obrigatorio) continue;
    if (c.campo === "texto") p.texto = "um passo novo";
    else if (c.tipo === "pessoa") p[c.campo] = m.quem;
    else if (c.tipo === "item" || c.tipo === "lugar") p[c.campo] = primeiro(c.tipo);
    else if (c.tipo === "numero") p[c.campo] = c.campo === "raio" ? 10 : 1;
    else if (c.tipo === "dialogo" || c.tipo === "texto") p[c.campo] = "";
  }
  return p;
}

export class Ficha {
  constructor(private g: Grafo, private editor: Editor) {}

  private nos(t: TipoNo) { return this.g.nos.filter((n) => n.tipo === t && !n.desconhecido).sort((a, b) => a.nome.localeCompare(b.nome, "pt")); }

  /** A choice from the whole catalogue of `t` (with its emoji); `vazio` adds "—" for an optional or still empty field. */
  private escolha(t: TipoNo, atual: string, attrs: string, vazio: boolean): string {
    const nos = this.nos(t);
    const conhecido = nos.some((n) => n.chave === atual);
    return `<select class="escolha" ${attrs}>${vazio || !conhecido ? `<option value="" ${atual === "" ? "selected" : ""}>— escolha —</option>` : ""}${!conhecido && atual ? `<option value="${esc(atual)}" selected>⚠️ ${esc(atual)}</option>` : ""}${nos.map((n) => `<option value="${esc(n.chave)}" ${n.chave === atual ? "selected" : ""}>${ICONE[t]} ${esc(n.nome)}</option>`).join("")}</select>`;
  }

  private prop(chave: string, controle: string, problema?: Problema): string {
    return `<div class="prop${problema ? " com-problema" : ""}"><code>${esc(chave)}</code><div class="valor">${controle}${problema ? `<span class="falta">⚠️ ${esc(problema.motivo)}</span>` : ""}</div></div>`;
  }

  /** One field of a step: the right control for its kind; a list (`lugar: [a, b]`) keeps one choice per element. */
  private campoDoPasso(m: Missao, i: number, c: CampoDoPasso, problemas: Problema[]): string {
    const v = m.passos[i][c.campo];
    const base = `data-missao="${esc(m.id)}" data-passo="${i}" data-campo="${esc(c.campo)}"`;
    const problema = problemas.find((p) => p.passo === i && p.campo === c.campo);
    const alvo = TIPO_DO_CATALOGO[c.tipo];
    let controle: string;
    if (Array.isArray(v) && alvo) controle = v.map((x) => this.escolha(alvo, String(x), `data-editar="alvo" ${base} data-atual="${esc(x)}"`, false)).join(" ");
    else if (alvo) controle = this.escolha(alvo, typeof v === "string" ? v : "", `data-editar="ref" ${base}`, !c.obrigatorio || v === undefined || v === "");
    else if (c.tipo === "numero") controle = `<input type="number" data-editar="numero" ${base} value="${typeof v === "number" ? v : ""}" min="1" max="${c.campo === "qtd" ? LIMITES.qtd.max : 500}">`;
    else if (c.tipo === "sim_nao") controle = `<input type="checkbox" data-editar="sim_nao" ${base} ${v === true ? "checked" : ""}>`;
    else if (c.tipo === "texto") controle = `<input class="campo-texto" data-editar="texto" ${base} value="${esc(v ?? "")}" maxlength="${c.campo === "texto" ? 80 : 40}">`;
    else controle = `<span class="so-ler">${esc(JSON.stringify(v) ?? "—")}</span>`;
    return this.prop(c.campo, controle, problema);
  }

  private passo(m: Missao, i: number, problemas: Problema[]): string {
    const p = m.passos[i];
    const tipo = String(p.tipo);
    const campos = camposDoPasso(tipo, this.g.passosExtras);
    // fields the step has that its schema does not list (a game's own) are shown too, read-only
    const outros = Object.keys(p).filter((k) => k !== "tipo" && !campos.some((c) => c.campo === k));
    const id = esc(m.id);
    return `<li class="passo-ficha">
      <div class="passo-cabeca">${iconePasso(tipo, this.g.passosExtras)} <code>tipo: ${esc(tipo)}</code>
        <span class="mover"><button data-mover="-1" data-missao="${id}" data-passo="${i}" ${i === 0 ? "disabled" : ""} title="subir">↑</button><button data-mover="1" data-missao="${id}" data-passo="${i}" ${i === m.passos.length - 1 ? "disabled" : ""} title="descer">↓</button><button data-apagar-passo="${i}" data-missao="${id}" title="tirar este passo" ${m.passos.length < 2 ? "disabled" : ""}>🗑️</button></span></div>
      ${campos.map((c) => this.campoDoPasso(m, i, c, problemas)).join("")}
      ${outros.map((k) => this.prop(k, `<span class="so-ler">${esc(JSON.stringify(p[k]))}</span>`)).join("")}
    </li>`;
  }

  private premio(m: Missao): string {
    const r = m.ao_concluir ?? {};
    const id = esc(m.id);
    const itens = Object.entries(r.itens ?? {});
    const doCatalogo = this.nos("item").filter((n) => !itens.some(([k]) => k === n.chave));
    return `${this.prop("coracoes", `<input type="number" data-editar="coracoes" data-missao="${id}" value="${r.coracoes ?? 0}" min="${LIMITES.coracoes.min}" max="${LIMITES.coracoes.max}"> ❤️`)}
      ${this.prop("moedas", `<input type="number" data-editar="moedas" data-missao="${id}" value="${r.moedas ?? 0}" min="${LIMITES.moedas.min}" max="${LIMITES.moedas.max}"> 🪙`)}
      ${this.prop("itens", `${itens.map(([k, q]) => `<div class="item-premio">${ICONE.item} ${esc(this.g.nos.find((n) => n.id === `item:${k}`)?.nome ?? k)} <input type="number" data-editar="item-premio" data-missao="${id}" data-item="${esc(k)}" value="${q}" min="0" max="20"> <button data-tirar-item="${esc(k)}" data-missao="${id}" title="tirar do prêmio">🗑️</button></div>`).join("")}
        <div class="item-premio"><select class="escolha" data-novo-item-de="${id}"><option value="">— um item do jogo —</option>${doCatalogo.map((n) => `<option value="${esc(n.chave)}">${ICONE.item} ${esc(n.nome)}</option>`).join("")}</select> <button data-novo-item="${id}">➕ no prêmio</button></div>`)}`;
  }

  /** What the ficha does not edit (yet): shown as the file has it. */
  private outras(m: Missao): string {
    const mostrar: [string, unknown][] = Object.entries(m).filter(([k, v]) => !NA_FICHA.has(k) && v !== undefined && !(Array.isArray(v) && !v.length));
    const resto = Object.entries(m.ao_concluir ?? {}).filter(([k]) => !["coracoes", "moedas", "itens", "mundo"].includes(k)).map(([k, v]) => [`ao_concluir.${k}`, v] as [string, unknown]);
    const linhas = [...mostrar, ...resto];
    if (!linhas.length) return "";
    return `<details class="outras"><summary>outras coisas que o arquivo tem</summary>${linhas.map(([k, v]) => this.prop(k, `<span class="so-ler">${esc(typeof v === "string" ? v : JSON.stringify(v))}</span>`)).join("")}</details>`;
  }

  /** The file as it would be written with her changes; the changed lines lit. Only where the MDM has the file's text (the local one). */
  private yaml(m: Missao): string {
    const original = this.editor.missaoOriginal(m.id);
    if (!original?.fonte) return "";
    const ops = this.editor.opsDoNo(`missao:${m.id}`);
    const novo = ops.length ? aplicarNoYaml(original.fonte, "missao", m.id, ops).fonte : original.fonte;
    return `<details class="yaml"><summary>📜 ver como está escrito no jogo</summary><pre>${marcarLinhas(original.fonte, novo).map((l) => `<span class="${l.nova ? "linha nova" : "linha"}">${esc(l.texto) || " "}</span>`).join("\n")}</pre>
      <p class="dica-editar">O jogo lê este arquivo (<code>${esc(m.arquivo)}</code>). As linhas acesas são as que você mudou.</p></details>`;
  }

  html(m: Missao): string {
    const id = esc(m.id);
    const problemas = problemasDaMissao(m, this.g);
    const geral = (campo: string) => problemas.find((p) => p.passo === undefined && p.campo === campo);
    const tipos = tiposDePasso(this.g.passosExtras);
    return `<div class="ficha">
      ${this.prop("titulo", `<input class="campo-titulo" data-editar="titulo" data-missao="${id}" value="${esc(m.titulo)}" maxlength="${LIMITES.titulo}">`, geral("titulo"))}
      ${this.prop("descricao", `<textarea class="campo-descricao" data-editar="descricao" data-missao="${id}" maxlength="${LIMITES.descricao}" rows="3">${esc(m.descricao)}</textarea>`, geral("descricao"))}
      ${this.prop("quem", this.escolha("pessoa", m.quem, `data-editar="quem" data-missao="${id}"`, false), geral("quem"))}
      ${this.prop("dificuldade", `<select class="escolha" data-editar="dificuldade" data-missao="${id}">${(["facil", "media", "dificil"] as const).map((d) => `<option value="${d}" ${m.dificuldade === d ? "selected" : ""}>${{ facil: "😊 fácil", media: "🙂 média", dificil: "😤 difícil" }[d]}</option>`).join("")}</select>`)}
      <h3><code>passos</code></h3>
      <ol class="passos-ficha">${m.passos.map((_, i) => this.passo(m, i, problemas)).join("")}</ol>
      <div class="novo-passo"><select class="escolha" data-novo-passo-de="${id}">${tipos.map((t) => `<option value="${esc(t)}">${iconePasso(t, this.g.passosExtras)} ${esc(t)}</option>`).join("")}</select> <button data-novo-passo="${id}">➕ passo novo</button></div>
      <h3><code>ao_concluir</code></h3>
      ${this.premio(m)}
      ${Object.keys(m.ao_concluir?.mundo ?? {}).length ? `<div class="mundo-mudou"><b>🌍 O mundo mudou</b> <small>(só para ler, por enquanto)</small><ul>${Object.entries(m.ao_concluir!.mundo!).map(([k, v]) => `<li><code>${esc(k)}: ${esc(valorMundo(v))}</code></li>`).join("")}</ul></div>` : ""}
      ${this.outras(m)}
      ${this.yaml(m)}
    </div>`;
  }
}
