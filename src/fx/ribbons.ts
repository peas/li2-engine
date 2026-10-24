import * as THREE from "three";

const MAX_POINTS = 96;

/**
 * One trail (a wing tip, a hand, a sword tip): a ring buffer of the tip's world positions (one sample per frame), drawn as a
 * camera-facing quad strip clipped to an exact length so the tail never pops. Width and alpha taper to the tail.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private readonly pts = Array.from({ length: MAX_POINTS }, () => new THREE.Vector3());
  private head = 0;
  private count = 0;
  private readonly pos = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly fade = new Float32Array(MAX_POINTS * 2);
  private readonly geo = new THREE.BufferGeometry();
  private readonly tmp = { a: new THREE.Vector3(), dir: new THREE.Vector3(), toCam: new THREE.Vector3(), side: new THREE.Vector3() };

  constructor(material: THREE.Material) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aFade", new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(index);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  private at(back: number) {
    return this.pts[(this.head - back + MAX_POINTS) % MAX_POINTS];
  }

  /** Add the tip's current position. A jump longer than `maxStep` (a teleport) restarts the trail. */
  push(p: THREE.Vector3, maxStep: number) {
    if (this.count > 0 && this.at(0).distanceToSquared(p) > maxStep * maxStep) this.count = 0;
    this.head = (this.head + 1) % MAX_POINTS;
    this.pts[this.head].copy(p);
    this.count = Math.min(this.count + 1, MAX_POINTS);
  }

  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  /** Rebuild the strip: `length` m long, `width` m wide at the tip. */
  build(length: number, width: number, camera: THREE.Camera) {
    const { a, dir, toCam, side } = this.tmp;
    let travelled = 0, n = 0;
    for (let i = 0; i < this.count; i++) {
      const cur = this.at(i);
      // tangent from the neighbours, side vector perpendicular to it and to the view ray
      dir.subVectors(this.at(Math.max(i - 1, 0)), this.at(Math.min(i + 1, this.count - 1)));
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      toCam.subVectors(camera.position, cur);
      side.crossVectors(dir, toCam).normalize();
      const t = travelled / length;
      this.write(n++, cur, side, width * (1 - 0.7 * t), 1 - t);
      if (i + 1 >= this.count) break;
      const next = this.at(i + 1);
      const seg = cur.distanceTo(next);
      if (travelled + seg >= length) {
        // clip the final segment so the trail is exactly `length` long and the tail slides instead of popping
        a.lerpVectors(cur, next, (length - travelled) / seg);
        this.write(n++, a, side, width * 0.3, 0);
        break;
      }
      travelled += seg;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aFade as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  private write(n: number, p: THREE.Vector3, side: THREE.Vector3, w: number, fade: number) {
    const h = w * 0.5, o = n * 6;
    this.pos[o] = p.x + side.x * h; this.pos[o + 1] = p.y + side.y * h; this.pos[o + 2] = p.z + side.z * h;
    this.pos[o + 3] = p.x - side.x * h; this.pos[o + 4] = p.y - side.y * h; this.pos[o + 5] = p.z - side.z * h;
    this.fade[n * 2] = this.fade[n * 2 + 1] = fade;
  }
}

/** Pale translucent material shared by both trails; `uOpacity` fades them in and out with speed. */
export function ribbonMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aFade;
      varying float vFade;
      void main() {
        vFade = aFade;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * vFade);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
