import * as THREE from "three";
import type GUI from "lil-gui";

export interface ShadowParams {
  enabled: boolean;
  /** Half-size of the shadow frustum, in multiples of the caster's size (`update`'s `length`). */
  size: number;
  /** PCF blur radius in texels. */
  softness: number;
  /** How dark the shadow is (0..1). */
  strength: number;
  /** Normal offset in multiples of the caster's size (fights self-shadow acne). */
  normalBias: number;
}

const MAP_SIZE = 2048;
/** Depth range of the shadow camera behind the creature: covers the ground under a 300 m flight at low sun. */
const DEPTH_BEHIND = 1600;

/**
 * Sun shadow: a shadow map on the sky's DirectionalLight that follows one actor (the player), so she casts a
 * shadow on the ground wherever she is. Only the creature casts (the terrain only receives), so the
 * shadow pass draws ~1.3k triangles and the terrain can never show acne. The orthographic camera looks
 * along the sun ray: the creature and her ground shadow project to the same spot of the map, so a frustum
 * of a few sizes around her always contains the shadow, at any altitude, as long as `far` reaches
 * the ground. The centre is snapped to whole texels in light space so the edge does not shimmer in flight.
 */
export class SunShadow {
  readonly params: ShadowParams = { enabled: true, size: 4, softness: 3, strength: 0.75, normalBias: 0.004 };
  private sunDir: THREE.Vector3;
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private center = new THREE.Vector3();

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    readonly sun: THREE.DirectionalLight,
    readonly scene: THREE.Scene,
    /** Live unit vector toward the sun (Sky.sunDir, updated when the panel moves the sun). */
    sunDir?: THREE.Vector3,
  ) {
    this.sunDir = sunDir ?? sun.position.clone().normalize();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x; PCF + radius is the soft one now
    const s = sun.shadow;
    s.mapSize.set(MAP_SIZE, MAP_SIZE);
    s.bias = 0; // only the actor casts; normalBias (world units) handles her self-shadow
    scene.add(sun.target);
    this.applyParams(1);
  }

  /** Objects that cast (the creature) and receive (terrain, grass) shadows. */
  setCaster(root: THREE.Object3D) {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true; // wings shadow the body
      }
    });
  }

  addReceiver(mesh: THREE.Object3D) {
    mesh.traverse((o) => { if (o instanceof THREE.Mesh) o.receiveShadow = true; });
  }

  /** Call every frame with the caster's position and size (m: body length, or height for someone on foot). */
  update(target: THREE.Vector3, length: number) {
    this.applyParams(length);
    const half = this.params.size * length;
    const d = this.sunDir;
    // same basis as Object3D.lookAt for the shadow camera (camera.up = +Y unless the sun is overhead)
    const cam = this.sun.shadow.camera;
    cam.up.set(0, 1, 0);
    this.right.crossVectors(cam.up, d);
    if (this.right.lengthSq() < 1e-6) { cam.up.set(0, 0, 1); this.right.crossVectors(cam.up, d); }
    this.right.normalize();
    this.up.crossVectors(d, this.right);
    // snap the centre to whole texels in the light's plane; the component along the ray does not matter
    const texel = (2 * half) / MAP_SIZE;
    const x = target.dot(this.right), y = target.dot(this.up);
    const dx = Math.round(x / texel) * texel - x, dy = Math.round(y / texel) * texel - y;
    this.center.copy(target).addScaledVector(this.right, dx).addScaledVector(this.up, dy);

    const lead = half + length * 2; // light sits in front of the creature, past her wings
    this.sun.target.position.copy(this.center);
    this.sun.position.copy(this.center).addScaledVector(d, lead);
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 0.5; cam.far = lead + DEPTH_BEHIND;
    cam.updateProjectionMatrix();
  }

  private applyParams(length: number) {
    const p = this.params, s = this.sun.shadow;
    if (this.sun.castShadow !== p.enabled) {
      this.sun.castShadow = p.enabled; // the light-state change recompiles the materials by itself
    }
    s.radius = p.softness;
    s.intensity = p.strength;
    s.normalBias = p.normalBias * length;
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("sombra do sol");
    folder.add(this.params, "size", 1.5, 10, 0.5).name("área da sombra (tamanhos)");
    folder.add(this.params, "softness", 0, 8, 0.5).name("sombra suave");
    folder.add(this.params, "strength", 0, 1, 0.05).name("sombra escura");
    folder.add(this.params, "normalBias", 0, 0.03, 0.001).name("correção de manchas");
  }
}
