import * as THREE from "three";

/** One floating label ("+1", "+3 🐟") pinned to a world spot. */
interface Sinal {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  age: number;
}

/** Seconds a label lives: it rises and fades in that time. */
const LIFE = 1;
/** How far (px) it rises on screen during its life. */
const RISE = 70;
const MAX = 24;

/**
 * Floating "+1" labels over the world (picked a fruit, caught a fish): an HTML element per label, projected from its
 * world position every frame, rising and fading in one second. HTML, not sprites, so the text is crisp and the font is
 * the page's. `update` needs the camera; labels behind it are hidden.
 */
export class Sinais {
  private readonly vivos: Sinal[] = [];
  private readonly tmp = new THREE.Vector3();

  /** `container` = where the labels go (default `document.body`); it should cover the canvas. */
  constructor(private readonly container: HTMLElement = document.body) {}

  /** A label `texto` in `cor` above `position` (world, m). Oldest ones are dropped past a small cap. */
  maisUm(position: THREE.Vector3, texto = "+1", cor: string = "#ffe066") {
    if (this.vivos.length >= MAX) this.remove(0);
    const el = document.createElement("div");
    el.textContent = texto;
    Object.assign(el.style, {
      position: "fixed", left: "0", top: "0", pointerEvents: "none", zIndex: "20", willChange: "transform, opacity",
      font: "800 26px system-ui, sans-serif", color: cor, whiteSpace: "nowrap",
      textShadow: "0 0 3px rgba(0,0,0,.65), 0 2px 4px rgba(0,0,0,.45)", opacity: "0",
    } satisfies Partial<CSSStyleDeclaration>);
    this.container.appendChild(el);
    this.vivos.push({ el, pos: position.clone(), age: 0 });
  }

  /** Per frame. `width`/`height` = the canvas size in CSS px (default the window). */
  update(dt: number, camera: THREE.Camera, width = innerWidth, height = innerHeight) {
    for (let i = this.vivos.length - 1; i >= 0; i--) {
      const s = this.vivos[i];
      s.age += dt;
      const t = s.age / LIFE;
      if (t >= 1) {
        this.remove(i);
        continue;
      }
      const p = this.tmp.copy(s.pos).project(camera);
      if (p.z > 1 || p.z < -1) {
        s.el.style.opacity = "0";
        continue;
      }
      const x = (p.x * 0.5 + 0.5) * width, y = (-p.y * 0.5 + 0.5) * height - RISE * (1 - (1 - t) * (1 - t));
      const pop = t < 0.15 ? 0.6 + 0.4 * (t / 0.15) * 1.15 : 1; // a little pop at the start
      s.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
      s.el.style.opacity = String(t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    }
  }

  /** How many labels are alive (tests). */
  get count() {
    return this.vivos.length;
  }

  clear() {
    while (this.vivos.length) this.remove(this.vivos.length - 1);
  }

  private remove(i: number) {
    this.vivos[i].el.remove();
    this.vivos.splice(i, 1);
  }
}
