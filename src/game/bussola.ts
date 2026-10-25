import type GUI from "lil-gui";

/** A place the compass points at. */
export interface Marco {
  /** Not shown (yet): a place that is still a secret. Read every update. */
  oculto?: boolean;
  nome: string;
  icone: string;
  x: number;
  z: number;
}

const CSS = `
.bus { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); width: min(560px, 70vw); height: 86px;
  pointer-events: none; font-family: system-ui, -apple-system, sans-serif; color: #fff; z-index: 10;
  text-shadow: 0 1px 2px rgba(0,0,0,.7); overflow: hidden; }
.bus::before { content: ""; position: absolute; left: 0; right: 0; top: 30px; height: 2px; background: rgba(255,255,255,.55); }
.bus::after { content: ""; position: absolute; left: 50%; top: 24px; width: 2px; height: 14px; margin-left: -1px; background: #fff; }
.bus-m { position: absolute; top: 0; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 16px;
  text-align: center; line-height: 1.1; transition: opacity .2s; }
.bus-m .i { font-size: 17px; display: block; }
.bus-m.card { font-weight: 700; font-size: 12px; top: 2px; opacity: .8; }
.bus-m.edge { opacity: .45; }
.bus-m.edge span:not(.i) { display: none; }
.bus-m.row2, .bus-m.row3 { top: 40px; }
.bus-m.row3 { top: 60px; }
.bus-m.row2 .i, .bus-m.row3 .i { display: inline; font-size: 13px; margin-right: 3px; }
.bus-m.near { color: #ffd23f; }
.bus-m.alvo { color: #ffd23f; font-weight: 700; top: 0; z-index: 1; }
.bus-m.alvo .i { font-size: 20px; }
`;

interface Item { marco: Marco; el: HTMLDivElement; text: HTMLSpanElement }

/** Compass bar at the top of the screen (Zelda style): the landmarks slide along it with their distance. */
export class Bussola {
  readonly params = {
    enabled: true,
    /** Degrees of heading visible across the bar. */
    span: 220,
    /** Only the nearest landmarks are shown (plus the quest star and the first landmark, home): the bar used to
     * drown in 11 names in the first game. */
    maxMarcos: 4,
  };
  private bar: HTMLDivElement;
  private items: Item[] = [];
  private cardinals: { label: string; yaw: number; el: HTMLDivElement }[] = [];
  /** The quest star: one extra landmark that moves with the active quest step; hidden when null. */
  private alvo: Item;

  /** `opcoes.css`: rules appended after the compass's own (another size). */
  constructor(marcos: Marco[], opcoes: { css?: string } = {}) {
    const style = document.createElement("style");
    style.textContent = CSS + (opcoes.css ?? "");
    document.head.appendChild(style);
    this.bar = document.createElement("div");
    this.bar.className = "bus";
    document.body.appendChild(this.bar);
    // flight yaw convention: 0 faces +z (south), π faces -z (north)
    // forward = (sin yaw, 0, cos yaw): yaw π/2 faces +x, which is east when north is -z
    for (const [label, yaw] of [["N", Math.PI], ["S", 0], ["L", Math.PI / 2], ["O", -Math.PI / 2]] as [string, number][]) {
      const el = document.createElement("div");
      el.className = "bus-m card";
      el.textContent = label;
      this.bar.appendChild(el);
      this.cardinals.push({ label, yaw, el });
    }
    for (const marco of marcos) {
      const el = document.createElement("div");
      el.className = "bus-m";
      const i = document.createElement("span");
      i.className = "i";
      i.textContent = marco.icone;
      const text = document.createElement("span");
      el.append(i, text);
      this.bar.appendChild(el);
      this.items.push({ marco, el, text });
    }
    this.alvo = this.criarItem({ nome: "", icone: "⭐", x: 0, z: 0 });
    this.alvo.el.classList.add("alvo");
    this.alvo.el.style.display = "none";
  }

  /** Point the star at a place (the active quest step), or hide it with null. Cheap to call every frame. */
  setAlvo(marco: Marco | null) {
    if (!marco) { this.alvo.el.style.display = "none"; return; }
    this.alvo.el.style.display = "";
    this.alvo.marco = marco;
  }

  private criarItem(marco: Marco): Item {
    const el = document.createElement("div");
    el.className = "bus-m";
    const i = document.createElement("span");
    i.className = "i";
    i.textContent = marco.icone;
    const text = document.createElement("span");
    el.append(i, text);
    this.bar.appendChild(el);
    return { marco, el, text };
  }

  /** `yaw` = the heading the camera looks along (flight yaw convention: 0 faces +z, π faces north). */
  update(x: number, z: number, yaw: number) {
    const on = this.params.enabled;
    this.bar.style.display = on ? "" : "none";
    if (!on) return;
    const half = (this.params.span / 2) * (Math.PI / 180);
    const width = this.bar.clientWidth || 560;
    // bar position (0..1) of a heading: left = turn left; turning left increases yaw, so positive d sits to the left
    const at = (target: number) => {
      let d = target - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return { d, pct: 50 - (Math.max(-half, Math.min(half, d)) / half) * 48 };
    };
    for (const c of this.cardinals) {
      const { d, pct } = at(c.yaw);
      c.el.style.left = `${pct}%`;
      c.el.style.opacity = Math.abs(d) > half ? "0" : "";
    }
    // landmarks: beyond the span they sit at the edge as a dim icon; neighbours closer than 130 px (a label is ~120 px) drop to a second row
    const placed: { it: Item; px: number; edge: boolean }[] = [];
    const itens = this.alvo.el.style.display === "none" ? this.items : [...this.items, this.alvo];
    // keep home (first landmark), the quest star and the nearest `maxMarcos` others; hide the rest
    const byDist = this.items.slice(1).filter((it) => !it.marco.oculto).map((it) => ({ it, d: Math.hypot(it.marco.x - x, it.marco.z - z) })).sort((a, b) => a.d - b.d);
    const visiveis = new Set<Item>([this.items[0], this.alvo, ...byDist.slice(0, this.params.maxMarcos).map((b) => b.it)]);
    for (const it of itens) {
      const show = visiveis.has(it);
      if (it !== this.alvo) it.el.style.display = show ? "" : "none";
      if (!show) continue;
      const dx = it.marco.x - x, dz = it.marco.z - z;
      const dist = Math.hypot(dx, dz);
      const { d, pct } = at(Math.atan2(dx, dz));
      it.el.style.left = `${pct}%`;
      it.text.textContent = dist < 1000 ? `${it.marco.nome} ${Math.round(dist / 10) * 10} m` : `${it.marco.nome} ${(dist / 1000).toFixed(1)} km`;
      it.el.classList.toggle("near", dist < 60);
      placed.push({ it, px: (pct / 100) * width, edge: Math.abs(d) > half });
    }
    placed.sort((a, b) => a.px - b.px);
    const last = [-1e9, -1e9, -1e9];
    for (const p of placed) {
      p.it.el.classList.toggle("edge", p.edge);
      let row = last.findIndex((l) => p.px - l >= 130);
      if (row < 0) row = 0;
      last[row] = p.px;
      p.it.el.classList.toggle("row2", row === 1);
      p.it.el.classList.toggle("row3", row === 2);
    }
  }

  /** `enabled` has no control here: the "orientação" choice of the minimap (bússola / minimapa / os dois) drives it. */
  addGui(folder: GUI) {
    folder.add(this.params, "span", 90, 360, 10).name("bússola: graus visíveis");
    folder.add(this.params, "maxMarcos", 1, 12, 1).name("bússola: marcos mais perto");
  }
}
