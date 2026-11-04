import type GUI from "lil-gui";
import * as THREE from "three";
import type { Npc } from "./npc";

/**
 * The discreet sign that someone has a quest for her: a small slow glow over the head, seen only from near, and (with
 * `opcoes.minimapa`) a faint dot on the minimap at the near zoom. Never a "!": she should notice it, not be sent to it.
 * Who has one comes from `missoes.pedidoAgora(id)` (no repeatable quests, no secrets). A switch in the adults' panel turns
 * it all off, kept in localStorage (`opcoes.chave`).
 */
const RAIO_PADRAO = 40;
const PERIODO_S = 3.2;
/** Re-asks the quests this often: enough for a sign, and most frames then cost nothing. */
const CONSULTA_S = 0.25;
const TAMANHO_M = 0.42;
const ACIMA_DA_CABECA_M = 0.4;

export interface OpcoesPedidos {
  /** localStorage key of the switch ("tresilhas.pedidos"). */
  chave?: string;
  /** Metres at which the glow shows (default 40). */
  raio?: number;
  /** Who also shows the dots. */
  minimapa?: { setPedidos(pontos: readonly { x: number; z: number }[]): void };
  /** Glow colour (default warm gold). */
  cor?: string;
}

/** The people with a quest for her right now (a sign or a board has none). */
export function npcsComPedido<N extends Pick<Npc, "id" | "semMissoes">>(npcs: readonly N[], missoes: { pedidoAgora(id: string): unknown }): N[] {
  return npcs.filter((n) => !n.semMissoes && missoes.pedidoAgora(n.id));
}

/** How strong the glow is at `dist` metres, at second `t`: nothing past `raio`, fading in over its last 20%, breathing slowly. */
export function opacidadeDoBrilho(dist: number, raio: number, t: number): number {
  if (dist >= raio) return 0;
  const perto = Math.min(1, (raio - dist) / (raio * 0.2));
  const respira = 0.6 + 0.3 * Math.sin((t * 2 * Math.PI) / PERIODO_S);
  return perto * respira;
}

function texturaDoBrilho(cor: string): THREE.Texture | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.25, cor);
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SinalPedidos {
  readonly params = { enabled: true, raio: RAIO_PADRAO };
  private readonly grupo = new THREE.Group();
  private readonly material: THREE.SpriteMaterial;
  /** One sprite per person who ever had a quest, kept (and hidden) once made; `altura` = feet to the top of the head. */
  private readonly brilhos = new Map<string, { sprite: THREE.Sprite; altura: number }>();
  private comPedido: Npc[] = [];
  private espera = 0;
  private readonly chave?: string;

  constructor(scene: THREE.Object3D, private readonly npcs: readonly Npc[], private readonly missoes: { pedidoAgora(id: string): unknown }, private readonly opcoes: OpcoesPedidos = {}) {
    this.params.raio = opcoes.raio ?? RAIO_PADRAO;
    this.chave = opcoes.chave;
    this.material = new THREE.SpriteMaterial({ map: texturaDoBrilho(opcoes.cor ?? "#ffd97a"), transparent: true, depthWrite: false, toneMapped: false });
    this.grupo.name = "sinal-pedidos";
    scene.add(this.grupo);
    this.carregar();
  }

  /** Per frame: `pos` is the player, `t` seconds; `escondido` while a cutscene or a screen owns the view. */
  update(dt: number, pos: THREE.Vector3, t: number, escondido = false) {
    if ((this.espera -= dt) <= 0) {
      this.espera = CONSULTA_S;
      this.comPedido = this.params.enabled ? npcsComPedido(this.npcs, this.missoes) : [];
      this.opcoes.minimapa?.setPedidos(this.comPedido.map((n) => n.position));
    }
    for (const { sprite } of this.brilhos.values()) sprite.visible = false;
    if (escondido) return;
    // one material for all: the breathing is the same, so only how far each one is changes its size, never its beat
    let forca = 0;
    for (const n of this.comPedido) {
      if (!n.group.visible) continue;
      const o = opacidadeDoBrilho(n.position.distanceTo(pos), this.params.raio, t);
      if (o <= 0) continue;
      forca = Math.max(forca, o);
      const b = this.brilho(n);
      b.sprite.position.set(n.position.x, n.position.y + b.altura + ACIMA_DA_CABECA_M, n.position.z);
      b.sprite.scale.setScalar(TAMANHO_M * Math.min(1, o / 0.6));
      b.sprite.visible = true;
    }
    this.material.opacity = forca;
  }

  /** For the tests and the console. */
  estado() {
    return {
      enabled: this.params.enabled,
      comPedido: this.comPedido.map((n) => n.id),
      visiveis: [...this.brilhos].filter(([, b]) => b.sprite.visible).map(([id]) => id),
    };
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("brilho de quem tem pedido").onChange(() => {
      this.espera = 0;
      this.salvar();
    });
  }

  private brilho(n: Npc) {
    let b = this.brilhos.get(n.id);
    if (!b) {
      const caixa = new THREE.Box3().setFromObject(n.group);
      b = { sprite: new THREE.Sprite(this.material), altura: caixa.isEmpty() ? 1.8 : caixa.max.y - n.position.y };
      b.sprite.renderOrder = 1;
      this.grupo.add(b.sprite);
      this.brilhos.set(n.id, b);
    }
    return b;
  }

  private carregar() {
    if (!this.chave) return;
    try {
      const s = JSON.parse(localStorage.getItem(this.chave) ?? "{}") as { enabled?: unknown };
      if (typeof s.enabled === "boolean") this.params.enabled = s.enabled;
    } catch { /* a broken value: keep the default */ }
  }

  private salvar() {
    if (this.chave) localStorage.setItem(this.chave, JSON.stringify({ enabled: this.params.enabled }));
  }
}
