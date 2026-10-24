import * as THREE from "three";
import type GUI from "lil-gui";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash2, mulberry32, smoothstep } from "../core/math";
import type { Biome, WorldMap } from "./map";
import type { Obstacles } from "./obstacles";

/**
 * Trees, pines, palms, rocks, bushes and flowers, all low-poly geometry made here, no models.
 *
 * Placement walks the map in cells and decides each one with `hash2(ix, iz, salt)`, so the same world appears on
 * every load and a rule can be tuned without reshuffling the rest. Rendering is one InstancedMesh per
 * (chunk, kind, variant) on an 8×8 grid of chunks: three culls per chunk, and bushes and flowers are hidden beyond
 * `smallRange`. Only the player casts shadows, so every mesh here receives and none casts.
 * Trees, palms and rocks register spheres in `Obstacles` (trunk stack + crowns; one per rock).
 *
 * What grows where is the map's biomes plus the island's `VegetationRules` (clearings, pine and palm zones, density).
 */

/** The island's say on the vegetation: where nothing grows, where pines and palms go, where it is thicker. */
export interface VegetationRules {
  /** Circles kept clear of everything (houses, squares, quest spots, the start). */
  clareiras: { x: number; z: number; r: number }[];
  /** Any other spot kept clear (true = nothing grows here). */
  manterLivre?: (x: number, z: number) => boolean;
  /** 0..1: chance that a tree here is a pine (on top of the altitude rule `pineAbove`). */
  pinheiros?: (x: number, z: number) => number;
  /** 0..n multiplier on every chance at this spot (0 = bare, 1 = normal). */
  densidade?: (x: number, z: number) => number;
  /** 0..1: chance per ~14 m cell of a coconut palm (sand and fields; e.g. the beaches). Default: none. */
  palmeiras?: (x: number, z: number) => number;
  /** Biomes where trees, bushes and flowers grow. Default field and forest. */
  verdes?: Biome[];
  /** Biomes with big boulders. Default rock, snow, ash. */
  pedregosos?: Biome[];
  /** Keep this far (m) from path centrelines. Default 8. */
  pathClearance?: number;
}

export const DEFAULT_VEGETATION_RULES: VegetationRules = { clareiras: [] };

export interface VegetationParams {
  /** Multiplier on how much grows (0..2). Needs `rebuild()`. */
  density: number;
  /** Bushes and flowers are drawn only in chunks within this distance of the camera (m). */
  smallRange: number;
  /**
   * Rocks are drawn only in chunks within this distance (m). Beyond ~650 m the terrain shows a coarser LOD whose
   * ridges sit metres below `heightAt`, and a mountain rock would float there.
   */
  rockRange: number;
  /** Low-poly facets (true) or smooth shading (false): a material flag, like the terrain. */
  flatShading: boolean;
  /** Round trees and pines are scaled between these heights (m). Needs `rebuild()`. */
  treeHeight: [number, number];
  /** Palms are scaled between these heights (m). Needs `rebuild()`. */
  palmHeight: [number, number];
  /** Every tree above this height over the water (m) is a pine. Needs `rebuild()`. */
  pineAbove: number;
}

export const DEFAULT_VEGETATION: VegetationParams = {
  density: 1, smallRange: 450, rockRange: 650, flatShading: true, treeHeight: [10, 22], palmHeight: [7, 12], pineAbove: 70,
};

export type VegetationKind = "tree" | "pine" | "palm" | "rock" | "bush" | "flower";
type Kind = VegetationKind;
/** Kinds hidden by distance, and the param that holds their range. */
const RANGED: Partial<Record<Kind, "smallRange" | "rockRange">> = { bush: "smallRange", flower: "smallRange", rock: "rockRange" };

/** Map chunks (same grid as the terrain). */
const CHUNKS = 8;
/** Trunk base below the ground (m), plus the slope × trunk radius on hillsides, so no root floats. */
const SINK = 0.3;
const asSet = (list: Biome[]) => Object.fromEntries(list.map((b) => [b, true])) as Partial<Record<Biome, true>>;
const FLOWER_COLOURS = ["#f4f1e6", "#ffd23f", "#ff6f91", "#b98cf2", "#ff8c42"].map((c) => new THREE.Color(c));

/** One placed thing before it becomes an instance. */
export interface VegetationItem {
  kind: Kind;
  variant: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Extra vertical stretch (rocks are squashed, trees a bit taller or shorter). */
  scaleY: number;
  yaw: number;
  colour: THREE.Color;
}

/** Sphere in the variant's local space, used to place colliders. */
interface LocalSphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

interface Variant {
  geometry: THREE.BufferGeometry;
  /** Height of the geometry at scale 1 (m). */
  height: number;
  trunk?: { height: number; radius: number };
  crowns: LocalSphere[];
}

// ---- geometry ----

/** Non-indexed copy with only position/normal/color, so every part can be merged. */
function prepare(geo: THREE.BufferGeometry, colour: (i: number) => THREE.Color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let t = 0; t < n; t += 3) {
    const c = colour(t / 3);
    for (let k = 0; k < 3; k++) c.toArray(col, (t + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A lumpy blob: a low-detail polyhedron scaled to an ellipsoid, each vertex pushed by a hash of its original
 * position (so shared corners move together and no crack opens). Normals point away from the centre, which
 * reads as round under smooth shading and is ignored under flat shading.
 */
function blob(base: THREE.BufferGeometry, rx: number, ry: number, rz: number, jitter: number, seed: number) {
  const pos = base.attributes.position as THREE.BufferAttribute;
  const nrm = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const kx = Math.round(v.x * 1000), ky = Math.round(v.y * 1000), kz = Math.round(v.z * 1000);
    const j = 1 + jitter * (hash2(kx + ky * 7, kz, seed) - 0.5) * 2;
    v.toArray(nrm, i * 3);
    pos.setXYZ(i, v.x * rx * j, v.y * ry * j, v.z * rz * j);
  }
  base.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return base;
}

/** Per-face shade: the base colour with a small random lightness change, like the terrain faces. */
const faceShade = (base: THREE.Color, rand: () => number, amount = 0.07) => {
  const c = new THREE.Color();
  return () => c.copy(base).offsetHSL(0, 0, (rand() - 0.5) * amount);
};

const BARK = new THREE.Color("#6b4a32");
const LEAVES = ["#4f9a3c", "#3f8434", "#66ad45"].map((c) => new THREE.Color(c));
const NEEDLES = ["#2f6a3a", "#285c34", "#37763f"].map((c) => new THREE.Color(c));
const STONE = new THREE.Color("#8a8480");
const BUSH = new THREE.Color("#4c9440");
const STEM = new THREE.Color("#4b8a35");
const PALM_BARK = new THREE.Color("#8a6a48");
const FRONDS = ["#4fa83e", "#5cb845", "#47983a"].map((c) => new THREE.Color(c));
const COCONUT = new THREE.Color("#6a4a2a");

/** Round tree, 14 m at scale 1: a tapered 6-sided trunk and 2-3 stacked lumpy crowns. */
function roundTree(seed: number, crowns: LocalSphere[]): Variant {
  const rand = mulberry32(seed);
  const trunkH = 7, trunkR = 0.6;
  const parts = [prepare(new THREE.CylinderGeometry(0.32, trunkR, trunkH, 6, 1).translate(0, trunkH / 2, 0), faceShade(BARK, rand))];
  crowns.forEach((c, i) => {
    const shape = i % 2 === 0 ? new THREE.IcosahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0);
    const g = blob(shape, c.r, c.r * 0.85, c.r, 0.28, seed * 10 + i).translate(c.x, c.y, c.z);
    parts.push(prepare(g, faceShade(LEAVES[(i + seed) % LEAVES.length], rand, 0.09)));
  });
  const geometry = mergeGeometries(parts)!;
  geometry.computeBoundingSphere();
  return { geometry, height: 14, trunk: { height: trunkH, radius: trunkR }, crowns };
}

/** Pine, 16 m at scale 1: thin trunk and three stacked cones. */
function pine(seed: number): Variant {
  const rand = mulberry32(seed);
  const trunkH = 5, trunkR = 0.45;
  const parts = [prepare(new THREE.CylinderGeometry(0.25, trunkR, trunkH, 6, 1).translate(0, trunkH / 2, 0), faceShade(BARK, rand))];
  const cones = [
    { r: 4.2, h: 6.5, y: 3.2 },
    { r: 3.2, h: 5.5, y: 7.2 },
    { r: 2.1, h: 5, y: 11 },
  ];
  const crowns: LocalSphere[] = [];
  cones.forEach((c, i) => {
    const g = new THREE.ConeGeometry(c.r, c.h, 7, 1).rotateY(i * 0.4).translate(0, c.y + c.h / 2, 0);
    parts.push(prepare(g, faceShade(NEEDLES[(i + seed) % NEEDLES.length], rand, 0.08)));
    crowns.push({ x: 0, y: c.y + c.h * 0.35, z: 0, r: c.r * 0.8 });
  });
  const geometry = mergeGeometries(parts)!;
  geometry.computeBoundingSphere();
  return { geometry, height: 16, trunk: { height: trunkH, radius: trunkR }, crowns };
}

/**
 * Coconut palm, 10 m at scale 1: a leaning trunk of four tapered segments that curve back up, a fan of `fronds` long
 * drooping leaves and three coconuts. The trunk leans toward +x; colliders follow the curve.
 */
function palm(seed: number, fronds: number): Variant {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const crowns: LocalSphere[] = [];
  const segs = 4, segH = 2.4;
  let x = 0, y = 0, lean = 0.32;
  for (let i = 0; i < segs; i++) {
    const r0 = 0.42 - i * 0.05, r1 = r0 - 0.05;
    const g = new THREE.CylinderGeometry(r1, r0, segH, 6, 1).translate(0, segH / 2, 0).rotateZ(-lean).translate(x, y, 0);
    parts.push(prepare(g, faceShade(PALM_BARK, rand, 0.1)));
    crowns.push({ x: x + Math.sin(lean) * segH / 2, y: y + Math.cos(lean) * segH / 2, z: 0, r: r0 + 0.1 });
    x += Math.sin(lean) * segH;
    y += Math.cos(lean) * segH;
    lean *= 0.62; // curves back toward the vertical near the top
  }
  for (let i = 0; i < fronds; i++) {
    const yaw = (i / fronds) * Math.PI * 2 + rand() * 0.3, len = 4.2 + rand() * 1.2, droop = 0.35 + rand() * 0.25;
    // a flat diamond leaf from the crown outward, tipped down
    const leaf = new THREE.OctahedronGeometry(1, 0).scale(len / 2, 0.07, 0.55).translate(len / 2, 0, 0).rotateZ(-droop).rotateY(yaw).translate(x, y, 0);
    parts.push(prepare(leaf, faceShade(FRONDS[(i + seed) % FRONDS.length], rand, 0.08)));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(prepare(new THREE.IcosahedronGeometry(0.28, 0).translate(x + Math.cos(a) * 0.35, y - 0.35, Math.sin(a) * 0.35), faceShade(COCONUT, rand, 0.06)));
  }
  crowns.push({ x, y: y + 0.2, z: 0, r: 1.2 });
  const geometry = mergeGeometries(parts)!;
  geometry.computeBoundingSphere();
  return { geometry, height: 10, crowns };
}

/** Rock of radius 1 at scale 1 (centre at the origin). */
function rock(seed: number, detail: number): Variant {
  const rand = mulberry32(seed);
  const g = blob(new THREE.IcosahedronGeometry(1, detail), 1, 1, 1, 0.35, seed);
  const geometry = prepare(g, faceShade(STONE, rand, 0.12));
  geometry.computeBoundingSphere();
  return { geometry, height: 1, crowns: [{ x: 0, y: 0, z: 0, r: 1 }] };
}

/** Bush, ~2 m across at scale 1: three small lumps. */
function bush(seed: number): Variant {
  const rand = mulberry32(seed);
  const lumps = [[0, 0.55, 0, 0.8], [0.6, 0.4, 0.3, 0.6], [-0.5, 0.4, -0.35, 0.55]];
  const parts = lumps.map(([x, y, z, r], i) =>
    prepare(blob(new THREE.IcosahedronGeometry(1, 0), r, r * 0.8, r, 0.25, seed + i).translate(x, y, z), faceShade(BUSH, rand, 0.1)));
  const geometry = mergeGeometries(parts)!;
  geometry.computeBoundingSphere();
  return { geometry, height: 1.2, crowns: [] };
}

/**
 * Flower, 1.1 m (it has to show above the grass blades): a vertical cross of two thin quads (stem) and a small octahedron head. The head vertices get
 * `aHead = 1`, and the flower material tints only them with the instance colour, so one mesh draws all 5 colours.
 */
function flower(): Variant {
  const stem = (rot: number) => prepare(new THREE.PlaneGeometry(0.16, 0.95).translate(0, 0.475, 0).rotateY(rot), () => STEM);
  const head = prepare(new THREE.OctahedronGeometry(0.3, 0).scale(1, 0.6, 1).translate(0, 1, 0), () => new THREE.Color(1, 1, 1));
  const parts = [stem(0), stem(Math.PI / 2), head];
  parts.forEach((g, i) => g.setAttribute("aHead", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(i === 2 ? 1 : 0), 1)));
  const geometry = mergeGeometries(parts)!;
  geometry.computeBoundingSphere();
  return { geometry, height: 1.1, crowns: [] };
}

function buildVariants(): Record<Kind, Variant[]> {
  return {
    tree: [
      roundTree(1, [{ x: 0, y: 8.2, z: 0, r: 4.3 }, { x: 1.2, y: 11.4, z: -0.6, r: 3.2 }, { x: -2.2, y: 7.2, z: 1.3, r: 2.8 }]),
      roundTree(2, [{ x: 0, y: 8.8, z: 0, r: 4.6 }, { x: -0.8, y: 12, z: 0.7, r: 2.9 }]),
    ],
    pine: [pine(3)],
    palm: [palm(7, 6), palm(8, 5)],
    rock: [rock(4, 0), rock(5, 1)],
    bush: [bush(6)],
    flower: [flower()],
  };
}

// ---- placement rules ----

/** Distance from (x, z) to a place. */
const dist = (x: number, z: number, p: { x: number; z: number }) => Math.hypot(x - p.x, z - p.z);

/** Is (x, z) kept clear by the rules (clearings, `manterLivre`, near a path)? */
export function keptClear(map: WorldMap, rules: VegetationRules, x: number, z: number) {
  for (const c of rules.clareiras) if (dist(x, z, c) < c.r) return true;
  return !!rules.manterLivre?.(x, z) || map.pathDistance(x, z) < (rules.pathClearance ?? 8);
}

/** The chance multiplier of the rules at (x, z): `densidade`, 0 where kept clear. */
export function ruleDensity(map: WorldMap, rules: VegetationRules, x: number, z: number) {
  if (keptClear(map, rules, x, z)) return 0;
  return Math.max(0, rules.densidade?.(x, z) ?? 1);
}

/** Ground facts at a spot, computed once per candidate. */
interface Spot {
  x: number;
  z: number;
  h: number;
  slope: number;
  biome: Biome;
  /** Height above the water (m). */
  rel: number;
}

/**
 * Vegetation for the whole island. See the file comment for the model; `DEFAULT_VEGETATION` for the knobs.
 * `rebuild()` re-places everything after a density change. Obstacles has no removal, so a rebuild adds the new
 * colliders on top of the old ones (harmless for a debug knob; reload the page for an exact world).
 */
export class Vegetation {
  readonly group = new THREE.Group();
  readonly params: VegetationParams;
  counts = { trees: 0, pines: 0, palms: 0, rocks: 0, bushes: 0, flowers: 0 };
  /** Everything placed by the last build (for tests and the minimap). */
  items: VegetationItem[] = [];
  readonly rules: VegetationRules;
  private green: Partial<Record<Biome, true>>;
  private stony: Partial<Record<Biome, true>>;
  /** Instanced meshes (for the HUD / tests). */
  drawCalls = 0;
  private variants = buildVariants();
  private material: THREE.MeshLambertMaterial;
  private flowerMaterial: THREE.MeshLambertMaterial;
  private chunks: { center: THREE.Vector2; ranged: { mesh: THREE.InstancedMesh; range: "smallRange" | "rockRange" }[] }[] = [];

  constructor(readonly map: WorldMap, readonly obstacles: Obstacles, params: Partial<VegetationParams> = {},
    rules: VegetationRules = DEFAULT_VEGETATION_RULES) {
    this.params = { ...DEFAULT_VEGETATION, ...params };
    this.rules = rules;
    this.green = asSet(rules.verdes ?? ["field", "forest"]);
    this.stony = asSet(rules.pedregosos ?? ["rock", "snow", "ash"]);
    this.group.name = "vegetation";
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: this.params.flatShading });
    this.flowerMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: this.params.flatShading, side: THREE.DoubleSide });
    // tint only the flower heads with the instance colour; the stem keeps its green
    this.flowerMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aHead;")
        .replace(
          "#include <color_vertex>",
          `vColor = vec4(1.0);
          #ifdef USE_COLOR
            vColor.rgb *= color;
          #endif
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aHead);
          #endif`,
        );
    };
    this.flowerMaterial.customProgramCacheKey = () => "flower";
    this.build();
  }

  /** Re-place everything (after changing density or tree heights). Adds colliders again: see the class comment. */
  rebuild() {
    for (const m of this.group.children as THREE.InstancedMesh[]) m.dispose();
    this.group.clear();
    this.chunks = [];
    this.build();
  }

  /** Per frame: show bushes, flowers and rocks only in the chunks near the camera. */
  update(cameraPosition: THREE.Vector3) {
    const half = this.map.size / CHUNKS / 2;
    for (const c of this.chunks) {
      // distance from the camera to the chunk's square, not to its centre
      const dx = Math.max(Math.abs(cameraPosition.x - c.center.x) - half, 0);
      const dz = Math.max(Math.abs(cameraPosition.z - c.center.y) - half, 0);
      const d = Math.hypot(dx, dz);
      for (const r of c.ranged) r.mesh.visible = d < this.params[r.range];
    }
  }

  addGui(folder: GUI) {
    const p = this.params;
    folder.add(p, "density", 0, 2, 0.05).name("densidade da vegetação").onFinishChange(() => this.rebuild());
    folder.add(p, "smallRange", 100, 1200, 10).name("arbustos e flores até (m)");
    folder.add(p, "rockRange", 100, 2000, 10).name("pedras até (m)");
    folder.add(p, "flatShading").name("vegetação facetada").onChange((v: boolean) => {
      for (const m of [this.material, this.flowerMaterial]) { m.flatShading = v; m.needsUpdate = true; }
    });
  }

  // ---- placement ----

  private build() {
    const items: VegetationItem[] = [];
    this.counts = { trees: 0, pines: 0, palms: 0, rocks: 0, bushes: 0, flowers: 0 };
    this.placeTrees(items);
    this.placePalms(items);
    this.placeRocks(items);
    this.placeBushes(items);
    this.placeFlowers(items);
    for (const it of items) this.addColliders(it);
    this.buildMeshes(items);
    this.items = items;
  }

  private spot(x: number, z: number): Spot {
    const h = this.map.heightAt(x, z), slope = this.map.slopeAt(x, z);
    return { x, z, h, slope, biome: this.map.biomeAt(x, z, h, slope), rel: h - this.map.waterLevel };
  }

  /**
   * Walk the map in square cells of `cell` m; for each, `chance(ix, iz, x, z)` (cheap tests first) gives the
   * probability, the hash decides, and `place` gets a jittered point inside the cell.
   */
  private scatter(cell: number, salt: number, chance: (x: number, z: number) => number, place: (x: number, z: number, r: () => number) => void) {
    const half = this.map.size / 2, n = Math.ceil(this.map.size / cell);
    for (let iz = 0; iz < n; iz++)
      for (let ix = 0; ix < n; ix++) {
        const x = -half + (ix + 0.1 + 0.8 * hash2(ix, iz, salt + 1)) * cell;
        const z = -half + (iz + 0.1 + 0.8 * hash2(ix, iz, salt + 2)) * cell;
        let p = chance(x, z);
        if (p <= 0) continue;
        p *= ruleDensity(this.map, this.rules, x, z);
        if (p <= 0 || hash2(ix, iz, salt) >= p) continue;
        if (!this.map.onLand(x, z)) continue;
        place(x, z, mulberry32(Math.floor(hash2(ix, iz, salt + 3) * 4294967296)));
      }
  }

  private tree(s: Spot, rand: () => number, pine: boolean, items: VegetationItem[]) {
    const [h0, h1] = this.params.treeHeight;
    const kind: Kind = pine ? "pine" : "tree";
    const v = Math.floor(rand() * this.variants[kind].length);
    const height = h0 + (h1 - h0) * rand() ** 1.3; // more mid-sized trees than giants
    const scale = height / this.variants[kind][v].height;
    const trunkR = (this.variants[kind][v].trunk?.radius ?? 0.5) * scale;
    const colour = new THREE.Color(1, 1, 1).multiplyScalar(0.88 + rand() * 0.24).offsetHSL((rand() - 0.5) * 0.03, 0, 0);
    items.push({ kind, variant: v, x: s.x, y: s.h - SINK - s.slope * trunkR, z: s.z, scale, scaleY: 0.9 + rand() * 0.2, yaw: rand() * Math.PI * 2, colour });
    if (pine) this.counts.pines++; else this.counts.trees++;
  }

  /** Pines high up (`pineAbove`) and where the rules say; round trees elsewhere. */
  private isPineSpot(s: Spot, rand: () => number) {
    const p = this.rules.pinheiros?.(s.x, s.z) ?? 0;
    return s.rel > this.params.pineAbove || (p > 0 && rand() < p);
  }

  private placeTrees(items: VegetationItem[]) {
    const d = this.params.density, map = this.map;
    const grows = (s: Spot) => this.green[s.biome] && s.slope < 0.6;
    // woods: about one per 12×12 m, thinning towards the edge of each blob
    this.scatter(12, 101, (x, z) => d * smoothstep(0.5, 0.75, map.forestAt(x, z)) * 0.9, (x, z, r) => {
      const s = this.spot(x, z);
      if (s.biome === "forest" && s.slope < 0.6) this.tree(s, r, this.isPineSpot(s, r), items);
    });
    // open country: about one per 70×70 m
    this.scatter(70, 211, () => 0.8 * d, (x, z, r) => {
      const s = this.spot(x, z);
      if (s.biome !== "forest" && grows(s)) this.tree(s, r, this.isPineSpot(s, r), items);
    });
    // pine band high up, between the high fields and the bare rock
    this.scatter(32, 401, () => 0.35 * d, (x, z, r) => {
      const s = this.spot(x, z);
      if (grows(s) && s.rel > this.params.pineAbove) this.tree(s, r, true, items);
    });
  }

  /** Coconut palms where `rules.palmeiras` says (sand and green ground, never in the water). */
  private placePalms(items: VegetationItem[]) {
    const chance = this.rules.palmeiras;
    if (!chance) return;
    const d = this.params.density, [h0, h1] = this.params.palmHeight;
    this.scatter(14, 801, (x, z) => d * chance(x, z), (x, z, r) => {
      const s = this.spot(x, z);
      if (s.rel < 0.5 || s.slope > 0.5 || !(s.biome === "sand" || this.green[s.biome])) return;
      const v = Math.floor(r() * this.variants.palm.length);
      const height = h0 + (h1 - h0) * r();
      const colour = new THREE.Color(1, 1, 1).multiplyScalar(0.9 + r() * 0.2).offsetHSL((r() - 0.5) * 0.03, 0, 0);
      items.push({ kind: "palm", variant: v, x, y: s.h - SINK - s.slope * 0.5, z, scale: height / this.variants.palm[v].height, scaleY: 0.92 + r() * 0.16, yaw: r() * Math.PI * 2, colour });
      this.counts.palms++;
    });
  }

  private rockAt(s: Spot, rand: () => number, size: number, items: VegetationItem[]) {
    const v = Math.floor(rand() * this.variants.rock.length);
    const scaleY = 0.55 + rand() * 0.35;
    const colour = new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rand() * 0.3);
    // centre a third of its height below the ground, more on slopes, so it sits in the hill
    const y = s.h - size * scaleY * (0.3 + Math.min(s.slope, 1) * 0.3);
    items.push({ kind: "rock", variant: v, x: s.x, y, z: s.z, scale: size, scaleY, yaw: rand() * Math.PI * 2, colour });
    this.counts.rocks++;
  }

  private placeRocks(items: VegetationItem[]) {
    const d = this.params.density;
    this.scatter(45, 503, () => 0.55 * d, (x, z, r) => {
      const s = this.spot(x, z);
      if (this.stony[s.biome]) this.rockAt(s, r, 2 + 4 * r() ** 0.7, items); // 2-6 m in the mountains
      else if (this.green[s.biome] && r() < 0.75) this.rockAt(s, r, 1 + 2.2 * r() ** 2, items); // 1-3 m in the fields
    });
  }

  private placeBushes(items: VegetationItem[]) {
    const d = this.params.density, map = this.map;
    this.scatter(20, 601, (x, z) => {
      const f = map.forestAt(x, z);
      return d * (0.1 + 0.6 * smoothstep(0.1, 0.4, f) * (1 - smoothstep(0.6, 0.8, f))); // fields, thick at wood edges
    }, (x, z, r) => {
      const s = this.spot(x, z);
      if (!this.green[s.biome] || s.slope > 0.6) return;
      const size = 1 + r() * 1.4;
      const colour = new THREE.Color(1, 1, 1).multiplyScalar(0.85 + r() * 0.3).offsetHSL((r() - 0.5) * 0.04, 0, 0);
      items.push({ kind: "bush", variant: 0, x, y: s.h - 0.2 * size, z, scale: size, scaleY: 0.8 + r() * 0.4, yaw: r() * Math.PI * 2, colour });
      this.counts.bushes++;
    });
  }

  /** Flowers come in patches: a 60 m cell may hold one, and the patch scatters ~25 flowers around its centre. */
  private placeFlowers(items: VegetationItem[]) {
    const d = this.params.density;
    this.scatter(60, 701, () => 0.3, (cx, cz, r) => {
      const colour = FLOWER_COLOURS[Math.floor(r() * FLOWER_COLOURS.length)];
      const second = FLOWER_COLOURS[Math.floor(r() * FLOWER_COLOURS.length)];
      const n = Math.round((15 + r() * 20) * d), radius = 8 + r() * 14;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rr = radius * Math.sqrt(r()) * (0.6 + 0.4 * r());
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (!this.map.onLand(x, z) || this.map.pathDistance(x, z) < 6 || keptClear(this.map, this.rules, x, z)) continue;
        const h = this.map.heightAt(x, z);
        const biome = this.map.biomeAt(x, z, h);
        if (biome !== "field") continue;
        const c = (r() < 0.8 ? colour : second).clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08);
        items.push({ kind: "flower", variant: 0, x, y: h - 0.05, z, scale: 0.8 + r() * 0.6, scaleY: 1, yaw: r() * Math.PI, colour: c });
        this.counts.flowers++;
      }
    });
  }

  // ---- colliders ----

  private addColliders(it: VegetationItem) {
    if (it.kind !== "tree" && it.kind !== "pine" && it.kind !== "palm" && it.kind !== "rock") return;
    const v = this.variants[it.kind][it.variant];
    const cos = Math.cos(it.yaw), sin = Math.sin(it.yaw), s = it.scale, sy = it.scale * it.scaleY;
    if (v.trunk) {
      // the trunk as a stack of spheres from the ground to the crown (one sphere at mid-height would let her walk under it)
      const height = v.trunk.height * sy, r = Math.max(0.9, v.trunk.radius * s + 0.5);
      const n = Math.max(1, Math.ceil(height / (1.5 * r)));
      for (let i = 0; i < n; i++) this.obstacles.add({ x: it.x, y: it.y + (height * (i + 0.5)) / n, z: it.z, r });
    }
    for (const c of v.crowns) {
      // rotate the local offset by the yaw (Object3D convention: x' = x cos + z sin, z' = -x sin + z cos)
      const x = it.x + (c.x * cos + c.z * sin) * s, z = it.z + (-c.x * sin + c.z * cos) * s;
      const r = it.kind === "rock" ? c.r * s * 0.9 * Math.max(it.scaleY, 0.75) : it.kind === "palm" ? Math.max(0.8, c.r * s) : c.r * s * 0.85;
      this.obstacles.add({ x, y: it.y + c.y * sy, z, r });
    }
  }

  // ---- meshes ----

  private buildMeshes(items: VegetationItem[]) {
    const size = this.map.size, chunk = size / CHUNKS;
    const buckets = new Map<string, VegetationItem[]>();
    for (const it of items) {
      const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((it.x + size / 2) / chunk)));
      const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((it.z + size / 2) / chunk)));
      const key = `${cx},${cz},${it.kind},${it.variant}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(it);
    }
    const chunks = new Map<string, (typeof this.chunks)[number]>();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.drawCalls = 0;
    for (const [key, list] of buckets) {
      const [cx, cz, kind, variant] = key.split(",");
      const k = kind as Kind;
      const v = this.variants[k][+variant];
      const mesh = new THREE.InstancedMesh(v.geometry, k === "flower" ? this.flowerMaterial : this.material, list.length);
      list.forEach((it, i) => {
        p.set(it.x, it.y, it.z);
        q.setFromAxisAngle(up, it.yaw);
        sc.set(it.scale, it.scale * it.scaleY, it.scale);
        mesh.setMatrixAt(i, m.compose(p, q, sc));
        mesh.setColorAt(i, it.colour);
      });
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.name = `veg-${k}-${cx}-${cz}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.drawCalls++;
      const ck = `${cx},${cz}`;
      let c = chunks.get(ck);
      if (!c) chunks.set(ck, (c = { center: new THREE.Vector2(-size / 2 + (+cx + 0.5) * chunk, -size / 2 + (+cz + 0.5) * chunk), ranged: [] }));
      const range = RANGED[k];
      if (range) c.ranged.push({ mesh, range });
    }
    this.chunks = [...chunks.values()];
  }
}

