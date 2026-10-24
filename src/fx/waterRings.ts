import * as THREE from "three";

const MAX = 16;
/** Fallback wave amplitude when the frame does not say (world/water.ts default). The vertex shader repeats its wave formula. */
const WATER_AMP = 0.7;

/**
 * Rings on the water when an actor skims or wades it: one InstancedMesh of flat rings whose vertex shader follows the
 * water's wave formula, so they sit on the surface. Each ring expands and fades; the pool is capped.
 */
export class WaterRings {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = { uTime: { value: 0 }, uAmp: { value: WATER_AMP } };
  private readonly alpha = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX).fill(99);
  private readonly centers = Array.from({ length: MAX }, () => new THREE.Vector3());
  private readonly r0 = new Float32Array(MAX);
  private readonly r1 = new Float32Array(MAX);
  private next = 0;
  private timer = 0;
  private readonly m = new THREE.Matrix4();
  life = 1.3;

  constructor() {
    const geo = new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2);
    geo.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        uniform float uTime;
        uniform float uAmp;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          w.y += uAmp * (sin(w.x * 0.045 + uTime * 0.9) + sin(w.z * 0.06 - uTime * 1.3) * 0.7
            + sin((w.x + w.z) * 0.03 + uTime * 0.6) * 0.5) + 0.35;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.003) discard;
          gl_FragColor = vec4(0.95, 0.98, 1.0, vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false; // instances move around; the cached bounding sphere would be wrong
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.m);
  }

  /** `skimming` spawns a ring under `pos` every `interval` s; rings grow from 0.3 to `size` m radius. */
  update(dt: number, time: number, skimming: boolean, pos: THREE.Vector3, size: number, interval: number, waterAmp = WATER_AMP) {
    this.uniforms.uTime.value = time;
    this.uniforms.uAmp.value = waterAmp;
    this.timer += dt;
    if (skimming && this.timer >= interval) {
      this.timer = 0;
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.centers[i].set(pos.x, 0, pos.z);
      this.age[i] = 0;
      this.r0[i] = size * 0.25;
      this.r1[i] = size;
    }
    let any = false;
    for (let i = 0; i < MAX; i++) {
      this.age[i] += dt;
      const t = this.age[i] / this.life;
      if (t >= 1) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); }
        continue;
      }
      any = true;
      const r = this.r0[i] + (this.r1[i] - this.r0[i]) * (1 - (1 - t) * (1 - t)); // fast, then slow
      this.m.makeScale(r, 1, r).setPosition(this.centers[i]);
      this.mesh.setMatrixAt(i, this.m);
      this.alpha[i] = 0.7 * (1 - t);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = any;
  }

  clear() {
    this.age.fill(99);
    this.timer = 0;
    this.mesh.visible = false;
  }
}
