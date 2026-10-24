import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../../core/math";
import { jitter, paint, put } from "../../world/lowpoly";

/**
 * Low-poly animals by code (no .glb). Each model faces +z with its feet at y = 0 (birds and fish: origin at the
 * body centre). Body, head and tail are ONE merged mesh; legs are 4 small child meshes pivoting at the hip (swing
 * on x); bird wings are 2 meshes pivoting at the shoulder (flap on z). Geometry is built once per species and
 * shared by every animal of it; all meshes share two flat Lambert materials. ≤ 6 draw calls per animal.
 * Two-legged animals (the hen) just have 2 hips and a 2-entry gait; the hen's head is its own mesh so it can bob.
 * Real-world sizes: deer 1.6 m tall, sheep 1.0, rabbit 0.4, wolf 0.9, boar 0.9, hen 0.4, bird 0.5 long with a 1.2 m
 * span, fish 0.6; every model is drawn ESCALA_BICHOS times that (or the species' `escala`), with legs PERNA_GROSSA
 * times thicker than real.
 */
export type TipoModelo = "veado" | "ovelha" | "coelho" | "lobo" | "javali" | "galinha" | "passaro" | "peixe";

export interface Modelo {
  group: THREE.Group;
  body: THREE.Mesh;
  legs: THREE.Mesh[];
  wings: THREE.Mesh[];
  /** A separate head that bobs forward and back with each step (hen), pivoting at the neck; null = part of `body`. */
  head: THREE.Mesh | null;
  /** Rest z of `head` (the bob is added to it). */
  neckZ: number;
  /** Phase offset of each leg in the gait (trot: diagonals together; rabbit: front pair, back pair). */
  gait: number[];
  /** Metres travelled per full gait cycle. */
  stride: number;
  /** Body length (m), for slope tilt. */
  length: number;
  /** Hop height (m) per gait cycle (rabbits hop instead of walking). */
  hop: number;
}

/** Every animal is drawn this much bigger than its real size by default (the first game's child found them too small, +40%). */
export const ESCALA_BICHOS = 1.4;
/** Legs this much thicker than a real animal's (real ones looked like sticks). */
const PERNA_GROSSA = 1.6;

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const MAT_2SIDED = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

type G = THREE.BufferGeometry;

/** A painted ellipsoid of half-sizes (sx, sy, sz) at (x, y, z), pitched. */
function ellipsoid(color: string, rand: () => number, x: number, y: number, z: number, sx: number, sy: number, sz: number, pitch = 0, j = 0) {
  let g: G = new THREE.SphereGeometry(1, 7, 5);
  if (j) g = jitter(g, j, rand);
  return paint(put(g, x, y, z, 0, sx, sy, sz, pitch), color, rand, 0.04);
}
/** A painted cone of radius r and height h whose apex points along +y before the pitch. */
function cone(color: string, rand: () => number, x: number, y: number, z: number, r: number, h: number, pitch = 0, roll = 0, seg = 4) {
  return paint(put(new THREE.ConeGeometry(r, h, seg), x, y, z, 0, 1, 1, 1, pitch, roll), color, rand, 0.04);
}
function cyl(color: string, rand: () => number, x: number, y: number, z: number, rTop: number, rBot: number, h: number, pitch = 0, roll = 0) {
  return paint(put(new THREE.CylinderGeometry(rTop, rBot, h, 5), x, y, z, 0, 1, 1, 1, pitch, roll), color, rand, 0.04);
}

/** A leg hanging from its pivot at the origin down to y = -len, with a darker foot. */
function legGeo(color: string, foot: string, len: number, r: number, rand: () => number) {
  r *= PERNA_GROSSA;
  return merged([cyl(color, rand, 0, -len * 0.45, 0, r, r * 0.75, len * 0.9), cyl(foot, rand, 0, -len * 0.95, 0, r * 0.75, r * 0.8, len * 0.1)]);
}

function merged(geos: G[]) {
  const g = mergeGeometries(geos);
  for (const x of geos) x.dispose();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A flat wing: a triangle from the shoulder (front and back) to the tip at x = span × side. Pivot at the shoulder. */
function wingGeo(color: string, span: number, side: 1 | -1, rand: () => number) {
  const g = new THREE.BufferGeometry();
  const tip = span * side;
  const v = [0, 0, 0.09, tip, 0, -0.05, 0, 0, -0.1, 0, 0, 0.09, tip * 0.55, 0, 0.05, tip, 0, -0.05];
  if (side < 0) for (let i = 0; i < v.length; i += 9) [v[i + 3], v[i + 4], v[i + 5], v[i + 6], v[i + 7], v[i + 8]] = [v[i + 6], v[i + 7], v[i + 8], v[i + 3], v[i + 4], v[i + 5]];
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
  const p = paint(g, color, rand, 0.05);
  p.computeVertexNormals();
  return p;
}

interface Template {
  body: G;
  leg?: G;
  hips: [number, number, number][];
  wing?: [G, G];
  shoulders?: [number, number, number][];
  head?: G;
  neck?: [number, number, number];
  gait: number[];
  stride: number;
  length: number;
  hop: number;
}

const TROT = [0, Math.PI, Math.PI, 0];

/** Builders per species: body parts in colours `c[0]` (main), `c[1]`, `c[2]`... from bichos.yaml. */
const BUILD: Record<TipoModelo, (c: string[], r: () => number) => Template> = {
  veado: (c, r) => {
    const [fur, white = "#f4ece0", antler = "#6b4a2a", dark = "#2a1e16"] = c;
    const hipY = 0.82;
    return {
      body: merged([
        ellipsoid(fur, r, 0, 1.02, 0, 0.24, 0.27, 0.66, 0, 0.12),
        ellipsoid(white, r, 0, 0.9, 0.05, 0.17, 0.12, 0.45),
        cyl(fur, r, 0, 1.3, 0.55, 0.08, 0.12, 0.5, 0.65),
        ellipsoid(fur, r, 0, 1.5, 0.76, 0.1, 0.11, 0.2, 0.25),
        ellipsoid(dark, r, 0, 1.44, 0.95, 0.045, 0.04, 0.04),
        cone(fur, r, 0.09, 1.6, 0.68, 0.035, 0.13, -0.2, -0.9),
        cone(fur, r, -0.09, 1.6, 0.68, 0.035, 0.13, -0.2, 0.9),
        cyl(antler, r, 0.05, 1.68, 0.72, 0.012, 0.02, 0.2, -0.25, -0.35),
        cyl(antler, r, -0.05, 1.68, 0.72, 0.012, 0.02, 0.2, -0.25, 0.35),
        cyl(antler, r, 0.1, 1.74, 0.76, 0.01, 0.012, 0.1, 0.6, -0.2),
        cyl(antler, r, -0.1, 1.74, 0.76, 0.01, 0.012, 0.1, 0.6, 0.2),
        ellipsoid(white, r, 0, 1.12, -0.66, 0.08, 0.09, 0.05),
      ]),
      leg: legGeo(fur, dark, hipY, 0.045, r),
      hips: [[0.14, hipY, 0.45], [-0.14, hipY, 0.45], [0.14, hipY, -0.45], [-0.14, hipY, -0.45]],
      gait: TROT, stride: 1.6, length: 1.4, hop: 0,
    };
  },
  ovelha: (c, r) => {
    const [wool, face = "#2b2622"] = c;
    const hipY = 0.4;
    const lumps: G[] = [ellipsoid(wool, r, 0, 0.62, 0, 0.36, 0.3, 0.48, 0, 0.18)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      lumps.push(ellipsoid(wool, r, Math.cos(a) * 0.2, 0.8 + r() * 0.06, Math.sin(a) * 0.3, 0.18, 0.15, 0.18, 0, 0.1));
    }
    return {
      body: merged([
        ...lumps,
        ellipsoid(face, r, 0, 0.74, 0.55, 0.12, 0.13, 0.17, 0.35),
        ellipsoid(wool, r, 0, 0.86, 0.5, 0.1, 0.06, 0.08),
        ellipsoid(face, r, 0.13, 0.78, 0.5, 0.08, 0.03, 0.04, 0, 0),
        ellipsoid(face, r, -0.13, 0.78, 0.5, 0.08, 0.03, 0.04, 0, 0),
        ellipsoid(wool, r, 0, 0.66, -0.5, 0.07, 0.07, 0.06),
      ]),
      leg: legGeo(face, "#18140f", hipY, 0.05, r),
      hips: [[0.17, hipY, 0.28], [-0.17, hipY, 0.28], [0.17, hipY, -0.28], [-0.17, hipY, -0.28]],
      gait: TROT, stride: 0.8, length: 1.0, hop: 0,
    };
  },
  coelho: (c, r) => {
    const [fur, white = "#f6f1ea", pink = "#e8a8a8"] = c;
    const hipY = 0.07;
    return {
      body: merged([
        ellipsoid(fur, r, 0, 0.15, -0.02, 0.12, 0.12, 0.17, 0, 0.04),
        ellipsoid(fur, r, 0, 0.25, 0.14, 0.085, 0.085, 0.095),
        ellipsoid(pink, r, 0, 0.23, 0.235, 0.015, 0.015, 0.012),
        ellipsoid(fur, r, 0.035, 0.36, 0.1, 0.024, 0.09, 0.014, -0.25),
        ellipsoid(fur, r, -0.035, 0.36, 0.1, 0.024, 0.09, 0.014, -0.25),
        ellipsoid(pink, r, 0.035, 0.36, 0.113, 0.012, 0.07, 0.004, -0.25),
        ellipsoid(pink, r, -0.035, 0.36, 0.113, 0.012, 0.07, 0.004, -0.25),
        ellipsoid(white, r, 0, 0.17, -0.19, 0.05, 0.05, 0.04),
      ]),
      leg: legGeo(fur, white, hipY + 0.02, 0.03, r),
      hips: [[0.06, hipY + 0.02, 0.08], [-0.06, hipY + 0.02, 0.08], [0.07, hipY + 0.02, -0.1], [-0.07, hipY + 0.02, -0.1]],
      gait: [0, 0, Math.PI, Math.PI], stride: 0.5, length: 0.35, hop: 0.1,
    };
  },
  lobo: (c, r) => {
    const [grey, light = "#d6d6d2", dark = "#3e3f44"] = c;
    const hipY = 0.46;
    return {
      body: merged([
        ellipsoid(grey, r, 0, 0.6, -0.02, 0.19, 0.21, 0.52, 0, 0.08),
        ellipsoid(light, r, 0, 0.55, 0.35, 0.15, 0.17, 0.15),
        ellipsoid(grey, r, 0, 0.74, 0.58, 0.13, 0.12, 0.15),
        cone(light, r, 0, 0.7, 0.78, 0.06, 0.22, Math.PI / 2, 0, 5),
        ellipsoid(dark, r, 0, 0.71, 0.89, 0.025, 0.025, 0.025),
        cone(grey, r, 0.07, 0.87, 0.55, 0.04, 0.11),
        cone(grey, r, -0.07, 0.87, 0.55, 0.04, 0.11),
        ellipsoid(grey, r, 0, 0.5, -0.72, 0.075, 0.08, 0.28, -0.7, 0.04),
        ellipsoid(light, r, 0, 0.32, -0.92, 0.05, 0.05, 0.06),
      ]),
      leg: legGeo(grey, dark, hipY, 0.042, r),
      hips: [[0.11, hipY, 0.36], [-0.11, hipY, 0.36], [0.11, hipY, -0.36], [-0.11, hipY, -0.36]],
      gait: TROT, stride: 1.2, length: 1.1, hop: 0,
    };
  },
  javali: (c, r) => {
    const [fur, dark = "#1e1a17", tusk = "#efe6d2", snout = "#8a6252"] = c;
    const hipY = 0.4;
    return {
      body: merged([
        ellipsoid(fur, r, 0, 0.6, -0.02, 0.24, 0.26, 0.5, 0, 0.08),
        ellipsoid(dark, r, 0, 0.8, 0.04, 0.07, 0.09, 0.4, 0, 0.05),
        ellipsoid(fur, r, 0, 0.58, 0.5, 0.16, 0.17, 0.2, 0.3),
        cyl(snout, r, 0, 0.5, 0.72, 0.07, 0.08, 0.16, Math.PI / 2),
        ellipsoid(dark, r, 0, 0.5, 0.8, 0.06, 0.05, 0.02),
        cone(tusk, r, 0.075, 0.5, 0.72, 0.016, 0.09, 0, -0.35),
        cone(tusk, r, -0.075, 0.5, 0.72, 0.016, 0.09, 0, 0.35),
        ellipsoid(dark, r, 0.09, 0.64, 0.63, 0.02, 0.02, 0.02),
        ellipsoid(dark, r, -0.09, 0.64, 0.63, 0.02, 0.02, 0.02),
        cone(fur, r, 0.09, 0.78, 0.44, 0.045, 0.11, -0.3, -0.6),
        cone(fur, r, -0.09, 0.78, 0.44, 0.045, 0.11, -0.3, 0.6),
        cyl(dark, r, 0, 0.64, -0.53, 0.012, 0.022, 0.14, -0.6),
      ]),
      leg: legGeo(fur, dark, hipY, 0.05, r),
      hips: [[0.13, hipY, 0.3], [-0.13, hipY, 0.3], [0.13, hipY, -0.3], [-0.13, hipY, -0.3]],
      gait: TROT, stride: 0.9, length: 1.0, hop: 0,
    };
  },
  galinha: (c, r) => {
    const [white, brown = "#a0663a", red = "#d8342c", beak = "#f0962a", leg = "#e8b838"] = c;
    const hipY = 0.13;
    return {
      body: merged([
        ellipsoid(white, r, 0, 0.22, -0.01, 0.09, 0.1, 0.13, 0.2, 0.01),
        ellipsoid(white, r, 0, 0.27, 0.08, 0.06, 0.08, 0.06),
        ellipsoid(brown, r, 0.085, 0.23, -0.02, 0.025, 0.06, 0.09, 0.2),
        ellipsoid(brown, r, -0.085, 0.23, -0.02, 0.025, 0.06, 0.09, 0.2),
        // the tail fan: brown in the middle, a white feather each side
        ellipsoid(brown, r, 0, 0.32, -0.13, 0.018, 0.09, 0.05, -0.5),
        ellipsoid(white, r, 0.03, 0.3, -0.12, 0.016, 0.075, 0.04, -0.6),
        ellipsoid(white, r, -0.03, 0.3, -0.12, 0.016, 0.075, 0.04, -0.6),
      ]),
      // head around the neck pivot: crest, wattle, beak, eyes
      head: merged([
        ellipsoid(white, r, 0, 0.04, 0.02, 0.045, 0.05, 0.05),
        ellipsoid(red, r, 0, 0.1, 0.015, 0.012, 0.035, 0.045),
        ellipsoid(red, r, 0, -0.005, 0.065, 0.01, 0.022, 0.012),
        cone(beak, r, 0, 0.035, 0.085, 0.016, 0.045, Math.PI / 2),
        ellipsoid("#1e1a17", r, 0.04, 0.05, 0.04, 0.008, 0.008, 0.008),
        ellipsoid("#1e1a17", r, -0.04, 0.05, 0.04, 0.008, 0.008, 0.008),
      ]),
      neck: [0, 0.3, 0.1],
      leg: legGeo(leg, beak, hipY, 0.012, r),
      hips: [[0.04, hipY, 0], [-0.04, hipY, 0]],
      gait: [0, Math.PI], stride: 0.3, length: 0.3, hop: 0,
    };
  },
  passaro: (c, r) => {
    const [body, wing = "#2a2a35", beak = "#e0a030"] = c;
    return {
      body: merged([
        ellipsoid(body, r, 0, 0, 0, 0.065, 0.065, 0.19),
        ellipsoid(body, r, 0, 0.035, 0.17, 0.055, 0.055, 0.06),
        cone(beak, r, 0, 0.03, 0.25, 0.02, 0.07, Math.PI / 2),
        paint(put(new THREE.BoxGeometry(0.12, 0.012, 0.12), 0, 0, -0.22, 0), wing, r, 0.04),
      ]),
      hips: [],
      wing: [wingGeo(wing, 0.55, 1, r), wingGeo(wing, 0.55, -1, r)],
      shoulders: [[0.04, 0.02, 0.03], [-0.04, 0.02, 0.03]],
      gait: [], stride: 1, length: 0.5, hop: 0,
    };
  },
  peixe: (c, r) => {
    const [silver, back = "#5f7a8c", fin = "#a8b8c4"] = c;
    return {
      body: merged([
        ellipsoid(silver, r, 0, 0, 0.02, 0.06, 0.09, 0.24),
        ellipsoid(back, r, 0, 0.045, 0.02, 0.045, 0.05, 0.2),
        paint(put(new THREE.ConeGeometry(0.1, 0.16, 4), 0, 0, -0.28, 0, 0.3, 1, 1, Math.PI / 2), fin, r, 0.04),
        cone(fin, r, 0, 0.1, 0, 0.02, 0.07, -0.4),
      ]),
      hips: [],
      gait: [], stride: 1, length: 0.6, hop: 0,
    };
  },
};

const cache = new Map<string, Template>();

/** A new animal of `tipo` (geometry shared with the others of its species), drawn `escala` times its real size. `chave` keys the cache (species id). */
export function criarModelo(tipo: TipoModelo, cores: string[], chave: string = tipo, escala = ESCALA_BICHOS): Modelo {
  let t = cache.get(chave);
  if (!BUILD[tipo]) throw new Error(`bichos: não há modelo para "${tipo}" (modelos.ts tem: ${Object.keys(BUILD).join(", ")})`);
  if (!t) cache.set(chave, (t = BUILD[tipo](cores, mulberry32(chave.length * 7919 + chave.charCodeAt(0)))));
  const group = new THREE.Group();
  group.name = `bicho-${chave}`;
  // the parts hang from an inner group so the whole animal is drawn `escala` bigger (Bicho moves `group`)
  const inner = new THREE.Group();
  inner.scale.setScalar(escala);
  group.add(inner);
  const mesh = (g: G, m: THREE.Material, p: [number, number, number]) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(...p);
    o.receiveShadow = true;
    inner.add(o);
    return o;
  };
  const body = mesh(t.body, MAT, [0, 0, 0]);
  const legs = t.leg ? t.hips.map((h) => mesh(t.leg!, MAT, h)) : [];
  const wings = t.wing ? t.wing.map((g, i) => mesh(g, MAT_2SIDED, t.shoulders![i])) : [];
  const head = t.head ? mesh(t.head, MAT, t.neck!) : null;
  const k = escala;
  return { group, body, legs, wings, head, neckZ: t.neck?.[2] ?? 0, gait: t.gait, stride: t.stride * k, length: t.length * k, hop: t.hop * k };
}
