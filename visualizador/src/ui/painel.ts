/** The side panel: the full content of one node, with links to its neighbours. Pure HTML strings; main.ts wires the clicks. */
import { descreverPasso, descreverRecompensa, iconePasso, valorMundo, type Nomear } from "../carregador/texto.ts";
import type { Colhivel, Cutscene, Dialogo, Grafo, Item, Lugar, Missao, No, Pessoa, Poder, Receita, Regiao, TipoNo } from "../carregador/tipos.ts";
import { descreverOp } from "../../../src/game/edicoes/edicoes.ts";
import { LIMITES, medirFala, type Editor } from "../edicoes/editor.ts";
import { Ficha } from "./ficha.ts";
import { COR, esc, falaHtml, ICONE, NOME_TIPO, PLURAL, TIPOS } from "./visual.ts";

export class Painel {
  private porId = new Map<string, No>();
  /** Edit mode (main.ts sets both): fields become inputs, steps get ↑↓, every edited node shows its badge. */
  editor: Editor | null = null;
  editando = false;
  constructor(private g: Grafo) { for (const n of g.nos) this.porId.set(n.id, n); }

  /** After an edit the graph is rebuilt: the panel follows it. */
  trocarGrafo(g: Grafo) { this.g = g; this.porId = new Map(g.nos.map((n) => [n.id, n])); }

  no(id: string) { return this.porId.get(id); }
  nomear: Nomear = (tipo, chave) => this.porId.get(`${tipo}:${chave}`)?.nome ?? chave;

  /** A clickable chip for a node (by id); an unknown id is drawn dashed. */
  link(id: string): string {
    const n = this.porId.get(id);
    if (!n) return `<a class="no desconhecido" style="--cor:#eee">${esc(id)}</a>`;
    return `<a class="no${n.desconhecido ? " desconhecido" : ""}" data-no="${esc(n.id)}" style="--cor:${COR[n.tipo]}">${ICONE[n.tipo]} ${esc(n.nome)}</a>`;
  }
  private links(ids: string[]) { return ids.length ? `<ul class="links">${[...new Set(ids)].map((i) => `<li>${this.link(i)}</li>`).join("")}</ul>` : "<p class=\"vazio\">— nenhum</p>"; }
  private entrando(id: string, tipos?: string[]) { return this.g.arestas.filter((a) => a.para === id && (!tipos || tipos.includes(a.tipo))).map((a) => a.de); }
  private saindo(id: string, tipos?: string[]) { return this.g.arestas.filter((a) => a.de === id && (!tipos || tipos.includes(a.tipo))).map((a) => a.para); }
  private missoesLigadas(id: string) { return [...new Set(this.g.arestas.filter((a) => (a.de === id || a.para === id) && a.missao).map((a) => `missao:${a.missao}`))]; }

  /** What the panel shows when nothing is selected: the game in numbers and what was read. */
  inicio(): string {
    const conta = (t: string) => this.g.nos.filter((n) => n.tipo === t && !n.desconhecido).length;
    return `<h2>${esc(this.g.jogo.titulo)}: MDM</h2>
      <p><b>MDM</b> quer dizer <b>Mapa de Dependência de Missões</b>: cada caixinha é um pedaço do jogo, cada seta mostra o que depende do quê.</p>
      <p>Clique numa caixinha para ver o que tem dentro. Dois cliques abrem (ou fecham) o que está ligado a ela. Os botões de cima escolhem o que aparece.</p>
      <h3>O que tem no jogo</h3>
      <table>${TIPOS.map((t) => `<tr><td>${ICONE[t]} ${PLURAL[t]}</td><td><b>${conta(t)}</b></td></tr>`).join("")}</table>
      <h3>De onde eu li</h3>
      <table>${Object.entries(this.g.lidos).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="arquivo">${esc(v)}</td></tr>`).join("")}</table>
      <h3>Como funciona</h3>
      <p>O jogo não tem as missões escritas no código: elas ficam em arquivos de texto (YAML). O jogo lê esses arquivos quando abre, confere se está tudo certo e monta as missões, as conversas e os itens a partir deles. O MDM lê os mesmos arquivos.</p>`;
  }

  /** "✏️ editado por Olivia" + the list of her changes on this node, the conflicts, and "Voltar ao original". */
  private selo(n: No): string {
    const ed = this.editor;
    if (!ed) return "";
    const ops = ed.opsDoNo(n.id), conflitos = ed.conflitosDoNo(n.id);
    if (!ops.length) return "";
    const nome = (tipo: string, id: string) => (tipo === "dialogo" ? id : this.porId.get(`${tipo}:${id}`)?.nome ?? id);
    return `<div class="selo-editado"><b>✏️ editado${ed.autor ? ` por ${esc(ed.autor)}` : ""}</b>
      <ul>${ops.map((o) => `<li>${esc(descreverOp(o, nome as never))}</li>`).join("")}</ul>
      ${conflitos.length ? `<p class="caixa-aviso">⚠️ ${conflitos.length === 1 ? "Uma mudança precisa revisar" : `${conflitos.length} mudanças precisam revisar`}: o jogo mudou por baixo. ${conflitos.map((c) => esc(c.motivo)).join("; ")}</p>` : ""}
      ${this.editando ? `<button data-voltar="${esc(n.id)}">↩ Voltar ao original</button>` : ""}</div>`;
  }

  /** A `<select>` of every node of `tipo` (edit mode: the alternative to dragging the arrow). */
  private escolha(tipo: TipoNo, atual: string, attrs: string): string {
    const nos = this.g.nos.filter((n) => n.tipo === tipo && !n.desconhecido).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    return `<select class="escolha" ${attrs} aria-label="trocar ${NOME_TIPO[tipo]}">${nos.map((n) => `<option value="${esc(n.chave)}" ${n.chave === atual ? "selected" : ""}>${ICONE[tipo]} ${esc(n.nome)}</option>`).join("")}</select>`;
  }

  html(n: No, passoAtual?: number): string {
    const titulo = esc(n.nome);
    const cab = `<button class="fechar" data-fechar>✕</button><h2>${ICONE[n.tipo]} ${titulo}</h2><span class="tipo" style="--cor:${COR[n.tipo]}">${NOME_TIPO[n.tipo]}</span>${this.selo(n)}`;
    if (n.desconhecido) {
      return `${cab}<p class="caixa-aviso">⚠️ O jogo fala em <b>${esc(n.chave)}</b>, mas eu não achei ${NOME_TIPO[n.tipo] === "pessoa" ? "essa pessoa" : "isso"} em nenhum arquivo que li. Pode estar escrito no código do jogo, ou ser um erro de digitação.</p>
        <h3>Quem fala nisso</h3>${this.links([...this.entrando(n.id), ...this.saindo(n.id)])}`;
    }
    switch (n.tipo) {
      case "missao": return cab + this.missao(n.dados as Missao, passoAtual);
      case "pessoa": return cab + this.pessoa(n, n.dados as Pessoa);
      case "lugar": return cab + this.lugar(n, n.dados as Lugar);
      case "item": return cab + this.item(n, n.dados as Item);
      case "receita": return cab + this.receita(n, n.dados as Receita);
      case "dialogo": return cab + this.dialogo(n, n.dados as Dialogo);
      case "poder": return cab + this.poder(n, n.dados as Poder);
      case "colhivel": return cab + this.colhivel(n, n.dados as Colhivel);
      case "cutscene": return cab + this.cutscene(n, n.dados as Cutscene);
      case "regiao": return cab + this.regiao(n, n.dados as Regiao);
      case "mundo": return cab + this.mundo(n);
    }
  }

  private passoHtml(m: Missao, i: number, atual?: number): string {
    const p = m.passos[i];
    const doPasso = this.g.arestas.filter((a) => a.missao === m.id && a.passo === i);
    const alvos = doPasso.filter((a) => a.tipo !== "conversa");
    const conversas = doPasso.filter((a) => a.tipo === "conversa").map((a) => a.para);
    const ed = this.editando ? `<div class="editar-passo">
        <span class="mover"><button data-mover="-1" data-missao="${esc(m.id)}" data-passo="${i}" ${i === 0 ? "disabled" : ""} title="subir">↑</button><button data-mover="1" data-missao="${esc(m.id)}" data-passo="${i}" ${i === m.passos.length - 1 ? "disabled" : ""} title="descer">↓</button></span>
        ${alvos.filter((a) => a.campo).map((a) => { const no = this.porId.get(a.para)!; return `<label>${esc(a.rotulo.split(" ")[0])} ${this.escolha(no.tipo, no.chave, `data-editar="alvo" data-missao="${esc(m.id)}" data-passo="${i}" data-campo="${esc(a.campo!)}" data-atual="${esc(no.chave)}"`)}</label>`; }).join("")}
        ${typeof p.qtd === "number" ? `<label>quantos <input type="number" data-editar="qtd" data-missao="${esc(m.id)}" data-passo="${i}" value="${p.qtd}" min="${LIMITES.qtd.min}" max="${LIMITES.qtd.max}"></label>` : ""}
      </div>` : "";
    return `<li class="${i === atual ? "atual" : ""}">${iconePasso(p.tipo, this.g.passosExtras)} ${esc(descreverPasso(p, this.nomear, this.g.passosExtras))}<span class="texto">${esc(p.texto)}</span>
      ${alvos.length && !this.editando ? `<ul class="links">${alvos.map((a) => `<li>${this.link(a.para)}</li>`).join("")}</ul>` : ""}${ed}
      ${conversas.length ? `<div class="texto">conversa: ${conversas.map((c) => this.link(c)).join(" ")}</div>` : ""}</li>`;
  }

  private missao(m: Missao, atual?: number): string {
    const eu = `missao:${m.id}`;
    if (this.editando && this.editor) {
      // the MDM editor: the ficha (every field), then what the quest is linked to, read-only
      return `${new Ficha(this.g, this.editor).html(m)}
        <p class="acoes"><button data-historia="${esc(m.id)}">▶ Modo história</button></p>
        <h3>Conversas com quem dá</h3>
        <table>${(["dialogo_oferta", "dialogo_andamento", "dialogo_feito"] as const).map((k) => `<tr><td><code>${k}</code></td><td>${m[k] ? this.link(`dialogo:${m[k]}`) : "—"}</td></tr>`).join("")}</table>
        <h3>Destrava</h3>${this.links(this.saindo(eu, ["destrava"]))}
        <p class="arquivo">${esc(m.arquivo)}</p>`;
    }
    const recompensa = descreverRecompensa(m.ao_concluir, this.nomear);
    const itensRecompensa = this.saindo(eu, ["recompensa", "ensina"]);
    const ed = this.editando;
    const r = m.ao_concluir ?? {};
    const descricao = ed ? `<textarea class="campo-descricao" data-editar="descricao" data-missao="${esc(m.id)}" maxlength="${LIMITES.descricao}" rows="3" aria-label="descrição da missão">${esc(m.descricao)}</textarea>` : `<p>${esc(m.descricao)}</p>`;
    const quem = ed ? `<p class="dica-editar">Arraste a seta verde no MDM até outra pessoa, ou escolha aqui:</p>${this.escolha("pessoa", m.quem, `data-editar="quem" data-missao="${esc(m.id)}"`)}` : this.links(this.entrando(eu, ["da"]));
    const recompensaHtml = ed ? `<p class="editar-recompensa"><label>❤️ corações <input type="number" data-editar="coracoes" data-missao="${esc(m.id)}" value="${r.coracoes ?? 0}" min="${LIMITES.coracoes.min}" max="${LIMITES.coracoes.max}"></label>
        <label>🪙 moedas <input type="number" data-editar="moedas" data-missao="${esc(m.id)}" value="${r.moedas ?? 0}" min="${LIMITES.moedas.min}" max="${LIMITES.moedas.max}"></label></p>` : `<p>${esc(recompensa) || "—"}</p>`;
    return `${descricao}
      <p class="acoes"><button data-historia="${esc(m.id)}">▶ Modo história</button><span class="tipo" style="--cor:#eee">dificuldade: ${esc(m.dificuldade)}</span></p>
      ${m.avisos.map((a) => `<p class="caixa-aviso">⚠️ ${esc(a)}</p>`).join("")}
      <h3>Quem dá a missão</h3>${quem}
      <h3>Precisa antes</h3>${this.links(this.entrando(eu, ["destrava"]))}
      ${m.oferecer_apos ? `<p class="so-depois">só depois que acontecer: <code>${esc(m.oferecer_apos)}</code></p>` : ""}
      <h3>Passos${ed ? ' <small class="dica-editar">(↑↓ trocam a ordem)</small>' : ""}</h3><ol class="passos">${m.passos.map((_, i) => this.passoHtml(m, i, atual)).join("")}</ol>
      <h3>Recompensa</h3>${recompensaHtml}${itensRecompensa.length ? this.links(itensRecompensa) : ""}
      ${Object.keys(r.mundo ?? {}).length ? `<div class="mundo-mudou"><b>🌍 O mundo mudou</b><ul>${Object.entries(r.mundo!).map(([k, v]) => `<li><code>${esc(k)}: ${esc(valorMundo(v))}</code></li>`).join("")}</ul></div>` : ""}
      <h3>Conversas com quem dá</h3>
      <table>${(["dialogo_oferta", "dialogo_andamento", "dialogo_feito"] as const).map((k) => `<tr><td>${k.replace("dialogo_", "")}</td><td>${m[k] ? this.link(`dialogo:${m[k]}`) : "—"}</td></tr>`).join("")}</table>
      <h3>Destrava</h3>${this.links(this.saindo(eu, ["destrava"]))}
      ${this.entrando(eu, ["dispara"]).length ? `<h3>Cenas que esta missão faz tocar</h3>${this.links(this.entrando(eu, ["dispara"]))}` : ""}
      <p class="arquivo">${esc(m.arquivo)}</p>`;
  }

  /** A world key: the quests that change it and the quests that wait for it. */
  private mundo(n: No): string {
    return `<p>Uma coisa do mundo que fica mudada para sempre quando uma missão acaba.</p>
      <h3>Missões que mudam</h3>${this.links(this.entrando(n.id, ["muda"]))}
      ${this.opcional("Missões que esperam isto acontecer", this.saindo(n.id, ["espera"]))}`;
  }

  private pessoa(n: No, p: Pessoa): string {
    const d = p.dialogo ? this.porId.get(`dialogo:${p.dialogo}`) : undefined;
    return `${p.papel ? `<p>${esc(p.papel)}</p>` : ""}
      <h3>Fica em</h3>${this.links(this.saindo(n.id, ["mora_em"]))}
      <h3>Dá as missões</h3>${this.links(this.saindo(n.id, ["da"]))}
      <h3>Missões que passam por aqui</h3>${this.links(this.entrando(n.id, ["fala_com", "leva_para"]))}
      <h3>O que diz quando você chega</h3>${d && !d.desconhecido ? this.falas(d.dados as Dialogo) + this.links([d.id]) : p.dialogo ? this.links([`dialogo:${p.dialogo}`]) : "<p>—</p>"}`;
  }

  private lugar(n: No, l: Lugar): string {
    return `<p>${esc(l.descricao ?? "(sem descrição no código)")}${l.lista ? " <i>(uma lista de pontos)</i>" : ""}</p>
      <h3>Quem fica aqui</h3>${this.links(this.entrando(n.id, ["mora_em"]))}
      <h3>Missões que passam por aqui</h3>${this.links(this.missoesLigadas(n.id))}
      ${this.opcional("O que cresce aqui", this.entrando(n.id, ["colhe_em"]))}
      ${this.opcional("Cenas que tocam aqui", this.entrando(n.id, ["dispara"]))}
      ${this.opcional("Região da música", this.entrando(n.id, ["cobre"]))}`;
  }

  private item(n: No, it: Item): string {
    const fichas = [it.tipo && `tipo: ${it.tipo}`, it.coracoes !== undefined && `cura ${it.coracoes} ❤️`, it.fome !== undefined && `fome +${it.fome}`, it.preco !== undefined && `custa ${it.preco} 🪙`].filter(Boolean);
    return `<p>${esc(it.descricao ?? "")}</p><p>${fichas.map((f) => `<span class="tipo" style="--cor:#eee">${esc(f)}</span>`).join(" ")}</p>
      <h3>Missões que pedem ou dão</h3>${this.links(this.missoesLigadas(n.id))}
      <h3>Receitas</h3>${this.links([...this.saindo(n.id, ["usa"]), ...this.entrando(n.id, ["faz"])])}
      ${this.opcional("Onde colher", this.entrando(n.id, ["colhe"]))}`;
  }

  private receita(n: No, r: Receita): string {
    return `<p>${esc(r.descricao ?? "")}</p>
      <h3>Ingredientes</h3><ul class="links">${Object.entries(r.ingredientes).map(([k, v]) => `<li>${v}× ${this.link(`item:${k}`)}</li>`).join("")}</ul>
      <h3>Faz</h3>${this.links(this.saindo(n.id, ["faz"]))}`;
  }

  private falas(d: Dialogo): string {
    return d.falas.map((f) => `<div class="fala"><b>${esc(f.quem)}</b>${falaHtml(f.texto)}</div>`).join("") || "<p>—</p>";
  }

  /** Edit mode: one textarea per line with the live count "linha 1: 12/38", the colour preview and the markers hint. */
  private falasEditaveis(d: Dialogo): string {
    return d.falas.map((f, i) => {
      const m = medirFala(f.texto);
      return `<div class="fala editavel"><b>${esc(f.quem)} · fala ${i + 1}</b>
        <textarea data-editar="fala" data-dialogo="${esc(d.id)}" data-indice="${i}" rows="2" spellcheck="false" aria-label="fala ${i + 1}">${esc(f.texto)}</textarea>
        <div class="contador ${m.cabe ? "" : "estourou"}" data-contador>${this.contadorHtml(f.texto)}</div>
        <div class="previa" data-previa>${falaHtml(f.texto)}</div></div>`;
    }).join("") || "<p>—</p>";
  }
  /** "linha 1: 12/38 · linha 2: 30/38" (red when it does not fit the game's box). */
  contadorHtml(texto: string): string {
    const m = medirFala(texto);
    const linhas = m.linhas.map((n, i) => `linha ${i + 1}: <strong>${n}</strong>/${LIMITES.fala.letras}`).join(" · ");
    return m.cabe ? linhas : `${linhas} — ⚠️ não cabe na caixa do jogo (${LIMITES.fala.linhas} linhas de ${LIMITES.fala.letras} letras)`;
  }

  private dialogo(n: No, d: Dialogo): string {
    return `<p>${esc(d.personagem)} fala (retrato: ${esc(d.retrato)})</p>
      <h3>Falas</h3>${this.editando ? `<p class="dica-editar">Enter faz a segunda linha. Palavras entre *estrelinhas* ficam em cor; entre _traços_, na outra cor.</p>${this.falasEditaveis(d)}` : this.falas(d)}
      <h3>Quem usa esta conversa</h3>${this.links(this.entrando(n.id))}
      <p class="arquivo">${esc(d.arquivo)}</p>`;
  }

  /** A section only when it has something (the new kinds do not exist in every game). */
  private opcional(titulo: string, ids: string[]) { return ids.length ? `<h3>${esc(titulo)}</h3>${this.links(ids)}` : ""; }

  private colhivel(n: No, c: Colhivel): string {
    const quantos = Array.isArray(c.quantos) ? c.quantos.join(c.arranjo === "trigal" ? " × " : " a ") : String(c.quantos);
    return `<p>Onde colher: o jogo desenha isto sozinho quando a ilha nasce (colhiveis.yaml).</p>
      <table><tr><td>arranjo</td><td>${esc(c.arranjo)}</td></tr><tr><td>quantos</td><td>${esc(quantos)}</td></tr>
      ${c.em ? `<tr><td>só nos pontos</td><td>${esc(c.em.join(", "))}</td></tr>` : ""}
      ${c.semente !== undefined ? `<tr><td>sorteio (semente)</td><td>${c.semente}</td></tr>` : ""}
      ${c.regrow !== undefined ? `<tr><td>volta depois de</td><td>${c.regrow} s</td></tr>` : ""}</table>
      <h3>Dá</h3>${this.links(this.saindo(n.id, ["colhe"]))}
      <h3>Cresce em</h3>${this.links(this.saindo(n.id, ["colhe_em"]))}`;
  }

  private cutscene(n: No, c: Cutscene): string {
    const g = c.gatilho;
    const quando = !g ? "só quando o código manda (sem gatilho no arquivo)"
      : g.tipo === "inicio" ? "quando o jogo começa"
      : g.tipo === "lugar" ? `quando ela chega perto de ${this.nomear("lugar", g.lugar ?? "?")}${g.raio ? ` (${g.raio} m)` : ""}${g.hora ? `, entre ${g.hora.join(" e ")} do dia` : ""}`
      : g.tipo === "missao" ? `durante a missão ${this.nomear("missao", g.missao ?? "?")}${g.passo ? `, no passo ${g.passo}` : ""}`
      : g.tipo === "evento" ? `quando acontece "${g.nome ?? "?"}"` : g.tipo;
    const ritual = Object.entries(c.ritual ?? {}).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td>${v ? "sim" : "não"}</td></tr>`).join("");
    return `${c.descricao ? `<p>${esc(c.descricao)}</p>` : ""}
      <table><tr><td>passos</td><td>${c.passos}</td></tr><tr><td>câmeras</td><td>${c.cameras}</td></tr>
      ${c.pulavel ? `<tr><td>pular</td><td>${esc(c.pulavel)}</td></tr>` : ""}</table>
      <h3>Quando toca</h3><p>${esc(quando)}</p>${this.links(this.saindo(n.id, ["dispara"]))}
      ${ritual ? `<h3>Em volta da cena</h3><table>${ritual}</table>` : ""}
      <p class="arquivo">${esc(c.arquivo)}</p>`;
  }

  private regiao(n: No, r: Regiao): string {
    const cond = (q: Record<string, unknown>) =>
      typeof q.perto_de === "string" ? `perto de ${this.nomear("lugar", q.perto_de)}${q.fator ? ` (× ${q.fator} do raio)` : ""}${q.margem ? ` (+ ${q.margem} m)` : ""}`
      : q.altura_acima !== undefined ? `acima de ${q.altura_acima} m de altura`
      : q.bioma !== undefined ? `no chão de ${q.bioma}` : JSON.stringify(q);
    return `<p>Uma região do mapa para a música: o jogo testa as regiões em ordem e a primeira que bate ganha.</p>
      <h3>Quando ela está aqui</h3>${r.padrao ? "<p>em qualquer outro lugar (é a região padrão)</p>" : `<ul>${r.quando.map((q) => `<li>${esc(cond(q))}</li>`).join("")}</ul>`}
      <h3>Lugares</h3>${this.links(this.saindo(n.id, ["cobre"]))}`;
  }

  private poder(n: No, p: Poder): string {
    return `<p>${esc(p.descricao ?? "")}</p><h3>Quem ensina</h3>${this.links(this.entrando(n.id, ["ensina"]))}`;
  }
}
