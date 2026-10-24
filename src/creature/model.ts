import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Default canonical clip names and the raw clip names found for them in the CC0 models used so far (Quaternius).
 * A game with another model passes its own `aliases` to `loadCreature`.
 */
export const CLIP_ALIASES = {
  fly: ["Fly", "Dragon_Flying", "Fast_Flying"],
  hover: ["Hover", "Flying_Idle"],
  idle: ["Idle", "Idle_A"],
  walk: ["Walk"],
  run: ["Run"],
} as const satisfies Record<string, readonly string[]>;
export type ClipName = keyof typeof CLIP_ALIASES;

export interface CreatureModel<K extends string = ClipName> {
  /** Scaled, centred, facing +Z. Add this to the scene (inside your own group). */
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  /** Clips found, by canonical name. */
  clips: Partial<Record<K, THREE.AnimationClip>>;
  /** Every clip in the file, by its raw name, for a debug panel. */
  allClips: THREE.AnimationClip[];
  bones: Record<string, THREE.Bone>;
  /** Current size along the normalised axis (m): nose to tail, or feet to head with `escalarPor: "altura"`. */
  length: number;
  /** Half height after scaling (distance from pivot to the lowest point). */
  halfHeight: number;
  /** Rescale to a new size (growth stages). Updates `length` and `halfHeight`. */
  setLength(length: number): void;
  /** flat = faceted (low-poly look); smooth = the model's own normals. */
  setShading(shading: "flat" | "smooth"): void;
}

export interface LoadOptions<K extends string = ClipName> {
  /** Desired size (m): nose to tail by default, feet to head with `escalarPor: "altura"`. */
  length: number;
  /** What `length` measures: the longest horizontal extent (a quadruped) or the height (a person in T-pose). */
  escalarPor?: "comprimento" | "altura";
  /** Rotation around Y to make the model face +Z. */
  rotationY?: number;
  shading?: "flat" | "smooth";
  /** Canonical clip name → raw names to look for (the armature prefix `Armature|` is ignored). Default `CLIP_ALIASES`. */
  aliases?: Record<K, readonly string[]>;
}

const stripArmature = (name: string) => name.split("|").pop() ?? name;

function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(...(Array.isArray(o.material) ? o.material : [o.material]));
  });
  return out;
}

/** Load a .glb (contract: the first game's docs/MODELO.md) and normalise its size and orientation. */
export async function loadCreature<K extends string = ClipName>(url: string, opts: LoadOptions<K>): Promise<CreatureModel<K>> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  const bones: Record<string, THREE.Bone> = {};

  scene.traverse((o) => {
    if (o instanceof THREE.Bone) bones[o.name] = o;
    if (o instanceof THREE.Mesh) o.frustumCulled = false; // skinned bounds don't follow the animation
  });
  const setShading = (shading: "flat" | "smooth") => {
    for (const m of materialsOf(scene)) {
      if (m instanceof THREE.MeshStandardMaterial) {
        m.flatShading = shading === "flat";
        m.metalness = 0;
        m.roughness = 0.9;
        m.needsUpdate = true;
      }
    }
  };
  setShading(opts.shading ?? "flat");

  const inner = new THREE.Group();
  inner.add(scene);
  inner.rotation.y = opts.rotationY ?? 0;
  const root = new THREE.Group();
  root.add(inner);

  // measure once at scale 1, before the model is in the scene (Box3.setFromObject works in world space)
  const base = new THREE.Box3().setFromObject(inner);
  const baseSize = base.getSize(new THREE.Vector3());
  const baseCenter = base.getCenter(new THREE.Vector3());
  const ref = opts.escalarPor === "altura" ? baseSize.y : Math.max(baseSize.x, baseSize.z);
  const model = { length: 0, halfHeight: 0 };
  /** Scale so the reference extent is `length`, centred on the box. */
  const setLength = (length: number) => {
    const s = length / ref;
    inner.scale.setScalar(s);
    inner.position.copy(baseCenter).multiplyScalar(-s);
    model.length = length;
    model.halfHeight = (baseSize.y * s) / 2;
  };
  setLength(opts.length);

  const mixer = new THREE.AnimationMixer(scene);
  const aliases = (opts.aliases ?? CLIP_ALIASES) as Record<K, readonly string[]>;
  const clips: Partial<Record<K, THREE.AnimationClip>> = {};
  for (const name of Object.keys(aliases) as K[]) {
    const names = aliases[name];
    const clip = gltf.animations.find((c) => names.includes(stripArmature(c.name)));
    if (clip) clips[name] = clip;
  }
  return {
    root, mixer, clips, allClips: gltf.animations, bones,
    get length() { return model.length; },
    get halfHeight() { return model.halfHeight; },
    setLength, setShading,
  };
}
