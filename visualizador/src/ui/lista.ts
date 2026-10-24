/** The "Lista" view: the quest table (what MISSOES.md prints), for reading fast. */
import { descreverPasso, descreverRecompensa } from "../carregador/texto.ts";
import type { Grafo, Missao } from "../carregador/tipos.ts";
import type { Painel } from "./painel.ts";
import { esc } from "./visual.ts";

export function listaHtml(g: Grafo, painel: Painel): string {
  const missoes = g.nos.filter((n) => n.tipo === "missao" && !n.desconhecido).map((n) => n.dados as Missao);
  const a = (tipo: string, chave: string) => `<a class="no" data-no="${tipo}:${esc(chave)}">${esc(painel.nomear(tipo as "pessoa", chave))}</a>`;
  if (!missoes.length) return `<h2>Missões</h2><p class="vazio">Este jogo ainda não tem missões em arquivo.</p>`;
  return `<h2>Missões de ${esc(g.jogo.titulo)} (${missoes.length})</h2>
  <table><thead><tr><th>Missão</th><th>Quem dá</th><th>Exige</th><th>Passos</th><th>Recompensa</th></tr></thead><tbody>
  ${missoes.map((m) => `<tr>
    <td><b><a class="no" data-no="missao:${esc(m.id)}">${esc(m.titulo)}</a></b><br><small>${esc(m.descricao)}</small>${m.avisos.map((x) => `<br><small>⚠️ ${esc(x)}</small>`).join("")}</td>
    <td>${a("pessoa", m.quem)}</td>
    <td>${m.requer.map((r) => a("missao", r)).join("<br>") || "—"}</td>
    <td><ol>${m.passos.map((p) => `<li>${esc(descreverPasso(p, painel.nomear, g.passosExtras))}</li>`).join("")}</ol></td>
    <td>${esc(descreverRecompensa(m.ao_concluir, painel.nomear)) || "—"}</td>
  </tr>`).join("")}</tbody></table>`;
}
