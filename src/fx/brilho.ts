import * as THREE from "three";

const MAX = 160;

/**
 * Glowing motes rising round an actor (healing, a power charging, a blessing). A fixed pool of round points (one draw
 * call); `emit(center, radius, rate, dt)` spawns new motes at the feet that drift up and fade. Same CPU pool pattern as
 * dust.ts; colour in `params.cor`.
 */
export class Brilho {
  readonly points: THREE.Points;
  /** `size` = mote diameter as a fraction of the emit radius (metres in the shader, like dust.ts). */
  readonly params = { cor: "#ffe58a", rise: 2.2, life: 1.4, size: 0.09 };
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX).fill(1);
  private readonly life = new Float32Array(MAX).fill(1);
  private next = 0;
  private alive = 0;
  private carry = 0;
  readonly uniforms = { uScale: { value: 1 }, uColor: { value: new THREE.Color("#ffe58a") } };

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float k = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(uColor * (0.7 + k), k * k * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Spawn `rate` motes per second (fractional, carried between frames) in a cylinder of `radius` round `center`. */
  emit(center: THREE.Vector3, radius: number, rate: number, dt: number) {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2, r = radius * Math.sqrt(Math.random());
      this.pos[i * 3] = center.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = center.y + Math.random() * radius * 0.5;
      this.pos[i * 3 + 2] = center.z + Math.sin(a) * r;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.4;
      this.vel[i * 3 + 1] = this.params.rise * (0.7 + Math.random() * 0.6);
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      this.age[i] = 0;
      this.life[i] = this.params.life * (0.7 + Math.random() * 0.6);
      this.size[i] = radius * this.params.size * (0.6 + Math.random() * 0.8);
    }
    this.alive = MAX;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewHeightPx: number) {
    if (this.alive === 0) {
      this.points.visible = false;
      return;
    }
    this.uniforms.uColor.value.set(this.params.cor);
    this.uniforms.uScale.value = viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.age[i] += dt;
      const o = i * 3;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      this.alpha[i] = Math.sin(Math.min(1, t) * Math.PI);
    }
    this.alive = alive;
    const a = this.points.geometry.attributes;
    (a.position as THREE.BufferAttribute).needsUpdate = true;
    (a.aSize as THREE.BufferAttribute).needsUpdate = true;
    (a.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = alive > 0;
  }
}
