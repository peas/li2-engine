/**
 * The graph on screen: Cytoscape.js with the dagre layout (layered, deterministic: the same visible set always lands in
 * the same place, nothing trembles). All nodes and edges are created once; what is on screen is a class (`oculto`),
 * and each change re-runs the layout only on what is visible.
 */
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { Aresta, Grafo, No, TipoNo } from "../carregador/tipos.ts";
import { COR, ICONE } from "./visual.ts";

/** The edge kinds the editor re-targets (the end that moves: the person for `da`, the target for a step). */
export const ARESTAS_EDITAVEIS = new Set<Aresta["tipo"]>(["da", "vai_a", "fala_com", "coleta", "leva", "leva_para"]);
/** Which node type a re-targeted edge accepts. */
export function tipoAlvoDaAresta(a: Aresta, g: Grafo): TipoNo | null {
  if (!ARESTAS_EDITAVEIS.has(a.tipo) || !a.campo) return null;
  const alvo = g.nos.find((n) => n.id === (a.tipo === "da" ? a.de : a.para));
  return alvo?.tipo ?? null;
}
const COR_EDITADO = "#7b2cbf";

cytoscape.use(dagre);

/** Approximate box of a wrapped label at 19px: up to ~16 characters per line, 2 lines, then it is cut by the wrap. */
const LARG_MAX = 190, POR_LETRA = 11.5;
function linhasDoRotulo(r: string) { return Math.max(1, Math.min(3, Math.ceil((r.length * POR_LETRA) / (LARG_MAX - 24)))); }
function larguraDoRotulo(r: string) { return Math.min(LARG_MAX, Math.max(96, r.length * POR_LETRA + 28)); }
function alturaDoRotulo(r: string) { return 28 + linhasDoRotulo(r) * 24; }

export interface Eventos {
  clique(id: string | null): void;
  duploClique(id: string): void;
  /** Edit mode: the arrow `aresta` was dropped on `noId` (a compatible node). */
  religar?(aresta: Aresta, noId: string): void;
  /** Edit mode: dropped somewhere that does not fit (`tipo` = what it needed). */
  naoEncaixa?(aresta: Aresta, tipo: TipoNo): void;
}

export class GrafoVista {
  readonly cy: Core;
  private rodada = 0;
  /** Edit mode: arrows can be dragged to another node. */
  editando = false;
  private religando: { aresta: Aresta; tipo: TipoNo; fixo: string } | null = null;
  constructor(container: HTMLElement, private g: Grafo, private ev: Eventos) {
    this.cy = cytoscape({
      container, elements: this.elementos(g), minZoom: 0.05, maxZoom: 2.5, wheelSensitivity: 0.3, autoungrabify: false,
      style: [
        { selector: "node", style: {
          // explicit sizes (not "label"): dagre and the grid read them before the first paint, hidden nodes included
          shape: "round-rectangle", width: (n: cytoscape.NodeSingular) => larguraDoRotulo(n.data("rotulo")), height: (n: cytoscape.NodeSingular) => alturaDoRotulo(n.data("rotulo")),
          "background-color": (n) => COR[n.data("tipo") as No["tipo"]], "border-width": 2.5, "border-color": "rgba(0,0,0,0.25)",
          label: "data(rotulo)", "font-size": 19, "font-family": "system-ui, sans-serif", "font-weight": 600, color: "#2b2622",
          "text-wrap": "wrap", "text-max-width": `${LARG_MAX - 24}px`, "text-valign": "center", "text-halign": "center", "line-height": 1.2,
        } },
        { selector: "node[desconhecido = 1]", style: { "background-color": "#fff", "border-style": "dashed", "border-color": "#c9a200", "border-width": 3 } },
        { selector: "node:selected", style: { "border-width": 5, "border-color": "#2b2622" } },
        { selector: "edge", style: {
          width: 3, "line-color": "#9a9088", "target-arrow-color": "#9a9088", "target-arrow-shape": "triangle", "arrow-scale": 1.5,
          "curve-style": "bezier", label: "data(rotulo)", "font-size": 16, color: "#5a524b", "text-background-color": "#fbf7ef",
          "text-background-opacity": 1, "text-background-padding": "3px", "text-rotation": "autorotate",
        } },
        { selector: "edge[tipo = 'destrava']", style: { "line-color": "#e76f51", "target-arrow-color": "#e76f51", width: 4 } },
        { selector: "edge[tipo = 'da']", style: { "line-color": "#6a994e", "target-arrow-color": "#6a994e", width: 4 } },
        { selector: "edge[tipo = 'muda'], edge[tipo = 'espera']", style: { "line-color": "#3fae9c", "target-arrow-color": "#3fae9c", width: 4 } },
        { selector: "edge[tipo = 'espera']", style: { "line-style": "dashed" } },
        { selector: ".oculto", style: { display: "none" } },
        { selector: ".apagado", style: { opacity: 0.18, "text-opacity": 0.4 } },
        { selector: "node.foco", style: { "border-width": 6, "border-color": "#ffb703", "font-size": 22 } },
        { selector: "edge.foco", style: { "line-color": "#ffb703", "target-arrow-color": "#ffb703", width: 6, "font-size": 20, color: "#2b2622", "z-index": 9 } },
        // edited by her: dashed violet border / violet arrow
        { selector: "node[editado = 1]", style: { "border-style": "dashed", "border-color": COR_EDITADO, "border-width": 5 } },
        { selector: "edge[editado = 1]", style: { "line-color": COR_EDITADO, "target-arrow-color": COR_EDITADO, "line-style": "dashed", width: 5 } },
        // edit mode: the arrows that can be dragged are thicker, with a grab cursor feel (a halo)
        { selector: "edge.arrastavel", style: { width: 6, "arrow-scale": 2, "overlay-opacity": 0.08, "overlay-color": COR_EDITADO, "overlay-padding": 8 } },
        { selector: "edge.religando", style: { "line-style": "dotted", opacity: 0.35 } },
        { selector: "node.alvo-ok", style: { "border-color": COR_EDITADO, "border-width": 5, "border-style": "double" } },
        { selector: "node.alvo-sobre", style: { "border-color": "#ffb703", "border-width": 8, "background-blacken": -0.15 } },
        { selector: "#__ponta", style: { width: 14, height: 14, shape: "ellipse", "background-color": COR_EDITADO, label: "", "border-width": 0, "z-index": 20 } },
        { selector: "#__fantasma", style: { "line-color": COR_EDITADO, "target-arrow-color": COR_EDITADO, width: 6, label: "", "line-style": "dashed", "z-index": 19 } },
      ],
    });
    // the container changes width when the side panel opens or closes (a window resize is not the only trigger)
    new ResizeObserver(() => this.cy.resize()).observe(container);
    this.cy.on("tap", (e) => { if (e.target === this.cy) ev.clique(null); });
    this.cy.on("tap", "node", (e) => { if (e.target.id().startsWith("__")) return; ev.clique(e.target.id()); });
    this.cy.on("dbltap", "node", (e) => { if (!e.target.id().startsWith("__")) ev.duploClique(e.target.id()); });
    this.ligarArrasto();
  }

  private elementos(g: Grafo): ElementDefinition[] {
    return [
      ...g.nos.map((n) => ({ data: { id: n.id, tipo: n.tipo, rotulo: `${ICONE[n.tipo]} ${n.nome}`, desconhecido: n.desconhecido ? 1 : 0, editado: 0 } })),
      ...g.arestas.map((a) => ({ data: { id: a.id, source: a.de, target: a.para, rotulo: a.rotulo, tipo: a.tipo, editado: 0 } })),
    ];
  }

  /** Replaces the graph (after an edit): same ids keep their positions, so the next layout starts from where things are. */
  recarregar(g: Grafo) {
    this.g = g;
    const pos = new Map(this.cy.nodes().map((n) => [n.id(), { ...n.position() }]));
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(this.elementos(g));
      this.cy.nodes().forEach((n) => { const p = pos.get(n.id()); if (p) n.position(p); });
    });
  }

  /** Marks what she edited (node ids and edge ids) and, in edit mode, which arrows can be dragged. */
  marcar(editados: Set<string>, arestasEditadas: Set<string>) {
    this.cy.batch(() => {
      this.cy.nodes().forEach((n) => { n.data("editado", editados.has(n.id()) ? 1 : 0); });
      this.cy.edges().forEach((e) => {
        e.data("editado", arestasEditadas.has(e.id()) ? 1 : 0);
        const a = this.g.arestas.find((x) => x.id === e.id());
        e.toggleClass("arrastavel", this.editando && !!a && tipoAlvoDaAresta(a, this.g) !== null);
      });
    });
  }

  /**
   * Dragging an arrow in edit mode: press on an editable arrow, a violet dot follows the pointer with a dashed ghost
   * arrow from the fixed end; compatible nodes get a double border, the one under the pointer glows; release on it to
   * re-target (`ev.religar`), anywhere else to cancel (`ev.naoEncaixa` when it was a node of the wrong kind).
   */
  private ligarArrasto() {
    const cy = this.cy;
    const noEm = (p: { x: number; y: number }) => cy.nodes().not(".oculto").filter((n) => {
      if (n.id().startsWith("__")) return false;
      const b = n.boundingBox({ includeLabels: false });
      return p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;
    }).first();
    cy.on("tapstart", "edge", (e) => {
      if (!this.editando || this.religando) return;
      const a = this.g.arestas.find((x) => x.id === e.target.id());
      const tipo = a ? tipoAlvoDaAresta(a, this.g) : null;
      if (!a || !tipo) return;
      const fixo = a.tipo === "da" ? a.para : a.de;
      this.religando = { aresta: a, tipo, fixo };
      cy.userPanningEnabled(false);
      cy.boxSelectionEnabled(false);
      cy.batch(() => {
        e.target.addClass("religando");
        cy.add([{ data: { id: "__ponta" }, position: { ...e.position }, grabbable: false, selectable: false },
          { data: { id: "__fantasma", source: a.tipo === "da" ? "__ponta" : fixo, target: a.tipo === "da" ? fixo : "__ponta" }, selectable: false }]);
        cy.nodes().not(".oculto").forEach((n) => { if (!n.id().startsWith("__")) n.addClass(n.data("tipo") === tipo ? "alvo-ok" : "apagado"); });
      });
    });
    cy.on("tapdrag", (e) => {
      if (!this.religando) return;
      cy.getElementById("__ponta").position(e.position);
      const sobre = noEm(e.position);
      cy.nodes(".alvo-sobre").removeClass("alvo-sobre");
      if (sobre.nonempty() && sobre.hasClass("alvo-ok")) sobre.addClass("alvo-sobre");
    });
    cy.on("tapend", (e) => {
      const r = this.religando;
      if (!r) return;
      this.religando = null;
      const sobre = noEm(e.position);
      cy.batch(() => {
        cy.remove(cy.$("#__ponta, #__fantasma"));
        cy.elements().removeClass("religando alvo-ok alvo-sobre apagado");
      });
      cy.userPanningEnabled(true);
      cy.boxSelectionEnabled(true);
      if (sobre.empty()) return;
      const atual = r.aresta.tipo === "da" ? r.aresta.de : r.aresta.para;
      if (sobre.id() === atual) return;
      if (sobre.data("tipo") === r.tipo) this.ev.religar?.(r.aresta, sobre.id());
      else this.ev.naoEncaixa?.(r.aresta, r.tipo);
    });
  }

  /** Shows exactly `visiveis` (edges follow their ends) and lays them out; `foco` (node/edge ids) glow, the rest fades if any foco. */
  async mostrar(visiveis: Set<string>, foco: Set<string> = new Set(), opts: { animar?: boolean; centrar?: string | null; margemInferior?: number } = {}) {
    const cy = this.cy;
    const minha = ++this.rodada;
    cy.batch(() => {
      cy.nodes().forEach((n) => { n.toggleClass("oculto", !visiveis.has(n.id())); });
      cy.edges().forEach((e) => { e.toggleClass("oculto", !(visiveis.has(e.data("source")) && visiveis.has(e.data("target")))); });
      cy.elements().removeClass("foco apagado");
      if (foco.size) cy.elements().not(".oculto").forEach((el) => { el.addClass(foco.has(el.id()) ? "foco" : "apagado"); });
    });
    // a node that was display:none reports 1×1 to the layouts until the renderer has drawn one frame with it visible
    await new Promise(requestAnimationFrame);
    if (minha !== this.rodada) return;
    const vistos = cy.elements().not(".oculto");
    const animar = opts.animar ?? true;
    // What has a visible link goes through dagre (layered, left to right); what is alone sits in a grid below it, so a
    // handful of quests never becomes a two-metre column of unused places and items.
    const ligados = vistos.nodes().filter((n) => n.connectedEdges().not(".oculto").nonempty());
    const soltos = vistos.nodes().not(ligados);
    const comArestas = ligados.union(vistos.edges());
    const acabou = async () => {
      if (soltos.nonempty()) {
        const bb = ligados.nonempty() ? ligados.boundingBox({}) : { x1: 0, y1: 0, x2: 0, y2: -80, w: 0, h: 0 };
        const largura = Math.max(bb.w, 1100);
        const cols = Math.max(1, Math.floor(largura / 210));
        const linhas = Math.ceil(soltos.length / cols);
        soltos.layout({ name: "grid", cols, fit: false, animate: false, avoidOverlapPadding: 16, condense: true,
          boundingBox: { x1: bb.x1, y1: bb.y2 + 80, w: largura, h: linhas * 90 } } as cytoscape.LayoutOptions).run();
      }
      // one more frame so the bounding boxes of the nodes the grid just moved are current, then fit everything; only if
      // the chosen node still falls outside the view (big graphs) is it brought to the centre
      await new Promise(requestAnimationFrame);
      if (minha !== this.rodada) return;
      cy.fit(vistos, 30);
      // the legend (and the story bar) sit over the bottom of the canvas: leave that strip empty
      const margem = opts.margemInferior ?? 0;
      if (margem > 0 && cy.height() > margem + 100) {
        cy.zoom(cy.zoom() * (cy.height() - margem - 30) / cy.height());
        cy.center(vistos);
        cy.panBy({ x: 0, y: -margem / 2 });
      }
      const n = opts.centrar ? cy.getElementById(opts.centrar) : null;
      if (n && n.nonempty() && !n.hasClass("oculto")) {
        const b = n.boundingBox(), e = cy.extent();
        if (b.x1 < e.x1 || b.x2 > e.x2 || b.y1 < e.y1 || b.y2 > e.y2) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: animar ? 250 : 0 });
      }
    };
    if (ligados.nonempty()) {
      // dagre itself never animates (its layoutstop fires before the positions settle); the fit animation is the motion
      comArestas.layout({ name: "dagre", rankDir: "LR", nodeSep: 30, rankSep: 110, edgeSep: 16, animate: false, fit: false } as cytoscape.LayoutOptions).run();
      await acabou();
    } else await acabou();
  }

  selecionar(id: string | null) {
    this.cy.elements().unselect();
    if (id) this.cy.getElementById(id).select();
  }

  /** A PNG of what is on screen (the capture script reads it). */
  png() { return this.cy.png({ full: true, scale: 1.5, bg: "#fbf7ef" }); }
}
