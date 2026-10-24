import * as THREE from "three";

const MAX = 240;
/** Default puff colours: each particle is a random mix of the two. */
export const DUST_COLOURS = { a: "#dcc690", b: "#a98d62" };

/**
 * Dust puffs: a fixed pool of flat round particles (one Points draw call) updated on the CPU.
 * `burst` spawns a ring of particles that fly outward along the ground, slow down, grow and fade.
 */
export class Dust {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX).fill(1);
  private readonly life = new Float32Array(MAX).fill(1);
  private readonly size0 = new Float32Array(MAX);
  private next = 0;
  private alive = 0;
  readonly uniforms = { uScale: { value: 1 } };
  private readonly colourA: THREE.Color;
  private readonly colourB: THREE.Color;

  /** `colours`: the two tints a puff mixes (default sand and earth; ash grey on a volcano, for example). */
  constructor(colours: { a: THREE.ColorRepresentation; b: THREE.ColorRepresentation } = DUST_COLOURS) {
    this.colourA = new THREE.Color(colours.a);
    this.colourB = new THREE.Color(colours.b);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 color;
        uniform float uScale;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, vAlpha * (1.0 - smoothstep(0.38, 0.5, d)));
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** `count` particles around (x, y, z) on the floor; `reach` = how far they fly (m), `size` = puff size (m).
   * `colour` replaces the default tint (sparkles of one colour). */
  burst(center: THREE.Vector3, count: number, reach: number, size: number, lift = 0.4, colour?: THREE.Color) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size;
      const v = reach * 4 * (0.5 + Math.random() * 0.7); // drag is 4/s, so a particle travels about v / 4
      this.pos[i * 3] = center.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = center.y + Math.random() * size * 0.3;
      this.pos[i * 3 + 2] = center.z + Math.sin(a) * r;
      this.vel[i * 3] = Math.cos(a) * v;
      this.vel[i * 3 + 1] = v * lift * (0.4 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * v;
      (colour ? colour.clone().offsetHSL(0, 0, (Math.random() - 0.3) * 0.3) : this.colourA.clone().lerp(this.colourB, Math.random())).toArray(this.col, i * 3);
      this.age[i] = 0;
      this.life[i] = 0.7 + Math.random() * 0.5;
      this.size0[i] = size * (0.5 + Math.random() * 0.6);
    }
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.alive = MAX;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewHeightPx: number) {
    if (this.alive === 0) {
      this.points.visible = false;
      return;
    }
    this.uniforms.uScale.value = viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const drag = Math.exp(-4 * dt);
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      this.age[i] += dt;
      const o = i * 3;
      this.vel[o] *= drag; this.vel[o + 1] = this.vel[o + 1] * drag - 1.5 * dt; this.vel[o + 2] *= drag;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      this.size[i] = this.size0[i] * (1 + 1.6 * t);
      this.alpha[i] = 0.9 * (1 - t) * (1 - t);
    }
    this.alive = alive;
    const a = this.points.geometry.attributes;
    (a.position as THREE.BufferAttribute).needsUpdate = true;
    (a.aSize as THREE.BufferAttribute).needsUpdate = true;
    (a.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = alive > 0;
  }

  clear() {
    this.age.fill(1);
    this.life.fill(1);
    this.alive = 0;
    this.points.visible = false;
  }
}
