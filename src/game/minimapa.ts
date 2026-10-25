import type GUI from "lil-gui";
import type { Biome, WorldMap } from "../world/map";
import type { Marco } from "./bussola";

/**
 * Round minimap (top-left): the whole island painted ONCE into an offscreen canvas from `WorldMap.heightAt/biomeAt`
 * (biome colours, light hillshade), then per frame only a rotated crop centred on the player, the place icons, the
 * quest star and her arrow. Never a second camera. Forward is up (the map turns with the camera, like the compass
 * bar); `girar: false` keeps north up. Two zoom levels (Z, a click or the wheel over the map while the mouse is free).
 * The mode (compass, minimap or both), zoom and rotation are kept in localStorage (`opcoes.chave`) so the child's
 * choice survives a reload. The first landmark is home: outside the view it is pulled to the rim.
 */
export type Modo = "bússola" | "minimapa" | "os dois";
/** Default metres from the player to the rim at each zoom: near = the neighbourhood, far = a ~2.5 km island. */
export const ZOOM_RAIOS = { perto: 300, longe: 1250 } as const;
export type Zoom = keyof typeof ZOOM_RAIOS;
export interface MarcoMapa extends Marco {
  /** Only drawn at the near zoom (zoomed out it would sit on top of a close neighbour). */
  soPerto?: boolean;
}

export interface OpcoesMinimapa {
  /** localStorage key of the child's choices ("tresilhas.minimapa"). */
  chave: string;
  /** Pixels across the island image (default 480). */
  px?: number;
  /** Metres to the rim at each zoom (default `ZOOM_RAIOS`). */
  zoomRaios?: Record<Zoom, number>;
  /** Tooltip of the map. */
  titulo?: string;
}

const MODOS: Modo[] = ["bússola", "minimapa", "os dois"];

/** Biome colours (sRGB), a bit brighter than the terrain so the map reads at 200 px. */
export const CORES: Record<Biome, [number, number, number]> = {
  water: [58, 128, 210],
  sand: [236, 220, 160],
  field: [122, 190, 86],
  forest: [52, 138, 66],
  rock: [150, 142, 128],
  snow: [245, 247, 250],
  village: [214, 170, 110],
  path: [196, 164, 112],
  lava: [232, 92, 36],
  ash: [92, 86, 88],
  mud: [120, 92, 60],
};

/** World (x, z) → pixel in the north-up island image (`px` pixels across `size` metres, −size/2..size/2). */
export function mundoParaImagem(x: number, z: number, size: number, px: number) {
  return { u: (x / size + 0.5) * px, v: (z / size + 0.5) * px };
}

/**
 * World point → offset from the minimap centre in screen px. `rumo` is the heading drawn as "up" (flight yaw
 * convention: 0 faces +z, π faces north); pass the camera yaw for forward-up or Math.PI for north-up.
 * Screen x grows to the right, y downwards. `dentro`: inside the disc of `raioPx`.
 */
export function mundoParaMinimapa(x: number, z: number, centro: { x: number; z: number }, rumo: number, raioM: number, raioPx: number) {
  const dx = x - centro.x, dz = z - centro.z;
  const s = raioPx / raioM;
  const sx = (-dx * Math.cos(rumo) + dz * Math.sin(rumo)) * s;
  const sy = -(dx * Math.sin(rumo) + dz * Math.cos(rumo)) * s;
  const dist = Math.hypot(sx, sy);
  return { x: sx, y: sy, dist, dentro: dist <= raioPx };
}

/** Pull a point that fell outside the disc back onto the rim (the quest star and home stay visible as a direction). */
export function naBorda(p: { x: number; y: number }, raioPx: number) {
  const d = Math.hypot(p.x, p.y);
  if (d <= raioPx) return { x: p.x, y: p.y };
  const k = raioPx / d;
  return { x: p.x * k, y: p.y * k };
}

/** The square of the island image (in image px) that a zoom level shows around `centro`; may spill past the image. */
export function recorte(centro: { x: number; z: number }, raioM: number, size: number, px: number) {
  const c = mundoParaImagem(centro.x, centro.z, size, px);
  const r = (raioM / size) * px;
  return { sx: c.u - r, sy: c.v - r, sw: 2 * r, sh: 2 * r };
}

/** Which places are drawn at a zoom level (never the hidden ones, `oculto`). */
export function marcosVisiveis<T extends MarcoMapa>(marcos: T[], zoom: Zoom): T[] {
  return marcos.filter((m) => !m.oculto && (zoom === "perto" || !m.soPerto));
}

/** Hillshade factor (≈0.72..1.18) from the four neighbours' heights; light from the north-west, like the sun in sky.ts. */
export function sombra(hOeste: number, hLeste: number, hNorte: number, hSul: number, metrosPorPixel: number) {
  const gx = (hLeste - hOeste) / (2 * metrosPorPixel);
  const gz = (hSul - hNorte) / (2 * metrosPorPixel);
  // the normal is ≈ (−gx, 1, −gz): slopes rising to the east/south face the light (−x, −z) and get brighter; clamped so
  // cliffs do not go black
  const luz = Math.max(-1, Math.min(1, (gx + gz) * 0.9));
  return 1 + 0.18 * luz;
}

export class Minimapa {
  readonly params = { modo: "os dois" as Modo, zoom: "perto" as Zoom, girar: true, diametro: 200 };
  readonly canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  /** The island painted once (north up). */
  private imagem = document.createElement("canvas");
  private dados: ImageData;
  private alturas: Float32Array;
  /** Progressive build: phase 0 = heights, 1 = colours, 2 = done; `linha` = next row of the current phase. */
  private fase = 0;
  private linha = 0;
  private alvo: Marco | null = null;
  private controles: { updateDisplay(): void }[] = [];
  /** Last frame's screen position of the star (null = hidden), for the tests. */
  private alvoNaTela: { x: number; y: number } | null = null;

  private readonly px: number;
  private readonly chave: string;
  private readonly raios: Record<Zoom, number>;

  /** `opcoes.px`: pixels across the island image (2400 m / 480 px = 5 m per pixel; the build costs ~0.3 s, spread over frames). */
  constructor(private readonly map: WorldMap, private readonly marcos: MarcoMapa[], opcoes: OpcoesMinimapa) {
    this.px = opcoes.px ?? 480;
    this.chave = opcoes.chave;
    this.raios = opcoes.zoomRaios ?? { ...ZOOM_RAIOS };
    const px = this.px;
    this.carregar();
    this.imagem.width = this.imagem.height = px;
    this.dados = this.imagem.getContext("2d")!.createImageData(px, px);
    this.alturas = new Float32Array(px * px);
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.className = "mmp";
    this.canvas.style.cssText = "position: fixed; top: 118px; left: 12px; z-index: 10; cursor: pointer;";
    this.canvas.title = opcoes.titulo ?? "minimapa: Z, clique ou a rodinha do mouse aproxima ou afasta";
    document.body.appendChild(this.canvas);
    this.canvas.addEventListener("click", () => { if (!document.pointerLockElement) this.alternarZoom(); });
    this.canvas.addEventListener("wheel", (e) => {
      if (document.pointerLockElement) return;
      e.preventDefault();
      this.setZoom(e.deltaY > 0 ? "longe" : "perto");
    }, { passive: false });
    this.redimensionar();
  }

  /** Is the minimap shown? (mode minimap or both) */
  get ativo() { return this.params.modo !== "bússola"; }
  /** Should the compass bar be shown? (mode compass or both) */
  get bussolaAtiva() { return this.params.modo !== "minimapa"; }
  /** True once the island image is fully painted. */
  get pronto() { return this.fase === 2; }
  get raioM() { return this.raios[this.params.zoom]; }

  /** Point the star at a place (the active quest step), or hide it with null. */
  setAlvo(marco: Marco | null) { this.alvo = marco; }

  alternarZoom() { this.setZoom(this.params.zoom === "perto" ? "longe" : "perto"); }

  setZoom(zoom: Zoom) {
    if (this.params.zoom === zoom) return;
    this.params.zoom = zoom;
    this.salvar();
  }

  setModo(modo: Modo) {
    this.params.modo = modo;
    this.salvar();
  }

  /** For the tests and the console: what the map is showing right now. */
  estado() {
    return { pronto: this.pronto, modo: this.params.modo, zoom: this.params.zoom, girar: this.params.girar, visivel: this.canvas.style.display !== "none", alvo: this.alvoNaTela, diametro: this.params.diametro };
  }

  /**
   * Per frame. `yawJogador` = the player's heading (the arrow), `yawCamera` = the heading the camera looks along (the map's up
   * when `girar`), `tempo` = seconds (the star pulses). While the image is not finished, a few ms of it are painted.
   */
  update(x: number, z: number, yawJogador: number, yawCamera: number, tempo: number) {
    const on = this.ativo;
    this.canvas.style.display = on ? "" : "none";
    document.documentElement.style.setProperty("--sob-minimapa", on ? `${this.params.diametro + 10}px` : "0px");
    if (!on) { this.alvoNaTela = null; return; }
    if (!this.pronto) this.construir(3);
    const D = this.params.diametro, R = D / 2, c = R;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(D * dpr)) this.redimensionar();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, D, D);
    const rumo = this.params.girar ? yawCamera : Math.PI;
    const raioM = this.raioM;
    const centro = { x, z };
    const proj = (px: number, pz: number) => mundoParaMinimapa(px, pz, centro, rumo, raioM, R);

    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(26, 20, 48, .7)";
    ctx.fillRect(0, 0, D, D);
    if (this.fase > 0) {
      // the crop: rotate the north-up image so `rumo` points up (angle rumo + π, see mundoParaMinimapa), scale metres → px
      const metrosPorPx = this.map.size / this.px;
      const s = (R / raioM) * metrosPorPx;
      const im = mundoParaImagem(x, z, this.map.size, this.px);
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(rumo + Math.PI);
      ctx.scale(s, s);
      ctx.translate(-im.u, -im.v);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.imagem, 0, 0);
      ctx.restore();
    }
    // places: big icons on a light disc; outside the view only home (the first landmark) is pulled to the rim
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const visiveis = marcosVisiveis(this.marcos, this.params.zoom);
    for (let i = 0; i < visiveis.length; i++) {
      const m = visiveis[i];
      const p = proj(m.x, m.z);
      if (!p.dentro && m !== this.marcos[0]) continue;
      const q = naBorda(p, R - 18);
      // the main places are big (read from the sofa); the near-only ones are smaller so they do not pile up
      this.icone(ctx, c + q.x, c + q.y, m.icone, m.soPerto ? 14 : 19, p.dentro ? 1 : 0.6);
    }
    // the quest star: always visible (on the rim when far), pulsing
    if (this.alvo) {
      const p = proj(this.alvo.x, this.alvo.z);
      const q = naBorda(p, R - 20);
      const pulso = 1 + 0.12 * Math.sin(tempo * 5);
      this.icone(ctx, c + q.x, c + q.y, "⭐", 23 * pulso, 1, "rgba(255, 210, 63, .95)");
      this.alvoNaTela = { x: q.x, y: q.y };
    } else this.alvoNaTela = null;
    // the player: a yellow arrow at the centre pointing where she faces
    const frente = proj(x + Math.sin(yawJogador), z + Math.cos(yawJogador));
    const ang = Math.atan2(frente.y, frente.x);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.lineTo(-10, 9); ctx.lineTo(-5, 0); ctx.lineTo(-10, -9); ctx.closePath();
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "rgba(0, 0, 0, .75)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // rim and the N marker (north is a direction on the rim, so the child can match the map to the compass)
    ctx.beginPath();
    ctx.arc(c, c, R - 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, .85)";
    ctx.lineWidth = 3;
    ctx.stroke();
    const n = naBorda(proj(x, z - 1e6), R - 11);
    ctx.font = "700 12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0, 0, 0, .7)";
    ctx.lineWidth = 3;
    ctx.strokeText("N", c + n.x, c + n.y);
    ctx.fillText("N", c + n.x, c + n.y);
  }

  private icone(ctx: CanvasRenderingContext2D, x: number, y: number, emoji: string, tamanho: number, alpha: number, fundo = "rgba(255, 255, 255, .85)") {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, tamanho * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = fundo;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, .55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${tamanho}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = "#000";
    ctx.fillText(emoji, x, y + tamanho * 0.06);
    ctx.restore();
  }

  /** Paint rows of the island image for up to `budgetMs`: heights first (phase 0), then colours with hillshade (phase 1). */
  construir(budgetMs: number) {
    const fim = performance.now() + budgetMs;
    const px = this.px, size = this.map.size, mpp = size / px;
    const h = this.alturas;
    while (this.fase < 2 && performance.now() < fim) {
      const r = this.linha;
      const z = (r + 0.5) * mpp - size / 2;
      if (this.fase === 0) {
        for (let i = 0; i < px; i++) h[r * px + i] = this.map.heightAt((i + 0.5) * mpp - size / 2, z);
      } else {
        const d = this.dados.data;
        for (let i = 0; i < px; i++) {
          const k = r * px + i;
          const x = (i + 0.5) * mpp - size / 2;
          const hw = h[k - (i > 0 ? 1 : 0)], he = h[k + (i < px - 1 ? 1 : 0)];
          const hn = h[k - (r > 0 ? px : 0)], hs = h[k + (r < px - 1 ? px : 0)];
          const slope = Math.hypot((he - hw) / (2 * mpp), (hs - hn) / (2 * mpp));
          const bioma = this.map.biomeAt(x, z, h[k], slope);
          const cor = CORES[bioma];
          let f = sombra(hw, he, hn, hs, mpp);
          // water: deeper = darker, so the lake and the sea read as water and the shore shows
          if (bioma === "water") f = 0.55 + 0.45 * Math.max(0, 1 + (h[k] - this.map.waterLevel) / 40);
          d[k * 4] = Math.min(255, cor[0] * f);
          d[k * 4 + 1] = Math.min(255, cor[1] * f);
          d[k * 4 + 2] = Math.min(255, cor[2] * f);
          d[k * 4 + 3] = 255;
        }
      }
      this.linha++;
      if (this.linha >= px) {
        if (this.fase === 1) this.imagem.getContext("2d")!.putImageData(this.dados, 0, 0);
        this.fase++;
        this.linha = 0;
      }
    }
    // show the rows done so far (the map fills in from the north over the first second)
    if (this.fase === 1 && this.linha > 0) this.imagem.getContext("2d")!.putImageData(this.dados, 0, 0, 0, 0, px, this.linha);
  }

  /** Build the whole image now (the tests and the capture script). */
  construirTudo() { while (!this.pronto) this.construir(1e9); }

  private redimensionar() {
    const D = this.params.diametro;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = Math.round(D * dpr);
    this.canvas.style.width = this.canvas.style.height = `${D}px`;
  }

  private carregar() {
    try {
      const s = JSON.parse(localStorage.getItem(this.chave) ?? "{}") as Partial<typeof this.params>;
      if (s.modo && MODOS.includes(s.modo)) this.params.modo = s.modo;
      if (s.zoom && s.zoom in this.raios) this.params.zoom = s.zoom;
      if (typeof s.girar === "boolean") this.params.girar = s.girar;
    } catch { /* a broken value: keep the defaults */ }
  }

  private salvar() {
    const { modo, zoom, girar } = this.params;
    localStorage.setItem(this.chave, JSON.stringify({ modo, zoom, girar }));
    for (const c of this.controles) c.updateDisplay();
  }

  addGui(folder: GUI) {
    this.controles = [
      folder.add(this.params, "modo", MODOS).name("orientação").onChange(() => this.salvar()),
      folder.add(this.params, "zoom", Object.keys(this.raios)).name("minimapa: zoom").onChange(() => this.salvar()),
      folder.add(this.params, "girar").name("minimapa gira com a câmera").onChange(() => this.salvar()),
      folder.add(this.params, "diametro", 140, 320, 10).name("minimapa: tamanho (px)").onFinishChange(() => this.redimensionar()),
    ];
  }
}
