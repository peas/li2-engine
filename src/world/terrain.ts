import * as THREE from "three";
import { mulberry32, smoothstep } from "../core/math";
import type { Biome, WorldMap } from "./map";

export interface TerrainOptions {
  /** Quads per side of the whole map at the finest level (280 → 10 m quads on a 2.8 km map). */
  segments: number;
  /** Chunks per side. */
  chunks: number;
  /** flat = one colour and normal per face (low-poly look); smooth = shared vertices, blended colours. */
  shading: "flat" | "smooth";
  /** Camera distance (m) beyond which each coarser level is used. */
  lodDistances: [number, number];
  /** Colours that replace the default `PALETTE` entries (only the biomes given change). */
  palette?: Partial<Record<Biome, THREE.ColorRepresentation>>;
}

/** 2.8-3 km maps: ~10 m quads, 28 per chunk side, LOD at 900/1700 m (650/1400 showed jagged ridges). */
export const DEFAULT_TERRAIN: TerrainOptions = { segments: 280, chunks: 10, shading: "flat", lodDistances: [900, 1700] };

/** Default palette (flat shaded, no textures). The grass blades (fx/grass.ts) take their colour from the same table. */
export const PALETTE: Readonly<Record<Biome, THREE.Color>> = {
  water: new THREE.Color("#b5ae8c"),
  sand: new THREE.Color("#e6d49a"),
  field: new THREE.Color("#63a84b"),
  forest: new THREE.Color("#407d38"),
  rock: new THREE.Color("#7a7370"),
  snow: new THREE.Color("#f3f5fb"),
  village: new THREE.Color("#8fb650"),
  path: new THREE.Color("#b89a6a"),
  lava: new THREE.Color("#d8431c"),
  ash: new THREE.Color("#4a4440"),
  mud: new THREE.Color("#6e5a3e"),
};
/** Fields darken toward this with height, forests toward it with depth. */
export const GRASS_DARK = new THREE.Color("#3e7f3b");

/** The default palette with the given overrides applied (fresh colours: editing them does not touch `PALETTE`). */
export function resolvePalette(overrides: Partial<Record<Biome, THREE.ColorRepresentation>> = {}): Record<Biome, THREE.Color> {
  const out = {} as Record<Biome, THREE.Color>;
  for (const b of Object.keys(PALETTE) as Biome[]) out[b] = new THREE.Color(overrides[b] ?? PALETTE[b]);
  return out;
}

/**
 * Colour of the ground at (x, z) before the per-face jitter: the biome's palette colour, fields darker higher up,
 * forests darker deeper in. Shared by the terrain mesh and the grass blades so both match.
 */
export function groundColour(map: WorldMap, palette: Record<Biome, THREE.Color>, biome: Biome, x: number, z: number, h: number, out: THREE.Color) {
  out.copy(palette[biome]);
  const rel = h - map.waterLevel;
  if (biome === "field") out.lerp(GRASS_DARK, smoothstep(10, 90, rel));
  if (biome === "forest") out.lerp(GRASS_DARK, 0.5 * smoothstep(0.5, 1, map.forestAt(x, z)));
  return out;
}
/** How far down the skirt around each chunk hangs, hiding the cracks between LOD levels (m). */
const SKIRT = 30;

/**
 * The terrain mesh: a grid of chunks, each built at three densities, and every frame the level that matches the
 * camera distance is shown. The heights come from `WorldMap.heightAt`, which stays the only source of collision.
 */
export class Terrain {
  readonly group = new THREE.Group();
  readonly heightAt: WorldMap["heightAt"];
  private chunks: { center: THREE.Vector3; levels: THREE.Mesh[] }[] = [];
  private material!: THREE.MeshLambertMaterial;
  /** The palette in use (default + `opts.palette`); edit and `rebuild()` to repaint. */
  readonly palette: Record<Biome, THREE.Color>;
  /** Triangles drawn last frame (for the HUD / tests). */
  triangles = 0;

  constructor(readonly map: WorldMap, readonly opts: TerrainOptions = DEFAULT_TERRAIN) {
    this.heightAt = map.heightAt;
    this.palette = resolvePalette(opts.palette);
    this.group.name = "terrain";
    this.build();
  }

  isWaterAt(x: number, z: number) {
    return this.map.isWaterAt(x, z);
  }

  /** Rebuild after changing `segments` or `shading` (the height function is unchanged). */
  rebuild() {
    for (const c of this.chunks) for (const m of c.levels) { m.geometry.dispose(); this.group.remove(m); }
    this.material?.dispose();
    this.chunks = [];
    this.build();
  }

  private build() {
    const { segments, chunks, shading } = this.opts;
    const flat = shading === "flat";
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
    const size = this.map.size, chunkSize = size / chunks;
    const perChunk = Math.max(2, Math.round(segments / chunks));
    const rand = mulberry32(this.map.size + segments);
    for (let cz = 0; cz < chunks; cz++)
      for (let cx = 0; cx < chunks; cx++) {
        const x0 = -size / 2 + cx * chunkSize, z0 = -size / 2 + cz * chunkSize;
        const levels = [perChunk, Math.max(2, perChunk >> 1), Math.max(2, perChunk >> 2)].map((n, i) => {
          const mesh = new THREE.Mesh(this.chunkGeometry(x0, z0, chunkSize, n, flat, rand), this.material);
          mesh.name = `terrain-${cx}-${cz}-lod${i}`;
          mesh.receiveShadow = true;
          mesh.visible = i === 0;
          mesh.matrixAutoUpdate = false;
          this.group.add(mesh);
          return mesh;
        });
        const center = new THREE.Vector3(x0 + chunkSize / 2, 0, z0 + chunkSize / 2);
        center.y = this.heightAt(center.x, center.z);
        this.chunks.push({ center, levels });
      }
  }

  private colorAt(x: number, z: number, h: number, slope: number, rand: () => number, out: THREE.Color) {
    groundColour(this.map, this.palette, this.map.biomeAt(x, z, h, slope), x, z, h, out);
    out.offsetHSL(0, 0, (rand() - 0.5) * 0.06); // small variation between faces
  }

  /** One chunk at `n` quads per side, with a skirt hanging from its edges. */
  private chunkGeometry(x0: number, z0: number, size: number, n: number, flat: boolean, rand: () => number) {
    const step = size / n;
    const hAt = (i: number, j: number) => this.heightAt(x0 + i * step, z0 + j * step);
    // heights of the grid, computed once
    const hs = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hs[j * (n + 1) + i] = hAt(i, j);
    const H = (i: number, j: number) => hs[j * (n + 1) + i];
    const geo = new THREE.BufferGeometry();
    const c = new THREE.Color();

    if (flat) {
      // one colour per triangle; skirt quads reuse the colour of the edge face
      const tris = n * n * 2 + n * 4 * 2;
      const pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
      let k = 0;
      const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, colour: THREE.Color) => {
        pos.set([ax, ay, az, bx, by, bz, cx, cy, cz], k);
        for (let t = 0; t < 3; t++) colour.toArray(col, k + t * 3);
        k += 9;
      };
      const faceColour = (i: number, j: number, h: number, nx: number, ny: number, nz: number) => {
        const slope = Math.hypot(nx, nz) / Math.max(ny, 1e-3);
        this.colorAt(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step, h, slope, rand, c);
        return c;
      };
      const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), nrm = new THREE.Vector3();
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = x0 + i * step, z = z0 + j * step;
          const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
          // alternate the diagonal so the low-poly facets don't all lean the same way
          const diag = ((i + j) & 1) === 0;
          const quads: [number, number, number, number, number, number, number, number, number][] = diag
            ? [[x, h00, z, x, h01, z + step, x + step, h11, z + step], [x, h00, z, x + step, h11, z + step, x + step, h10, z]]
            : [[x, h00, z, x, h01, z + step, x + step, h10, z], [x, h01, z + step, x + step, h11, z + step, x + step, h10, z]];
          for (const q of quads) {
            a.set(q[0], q[1], q[2]); b.set(q[3], q[4], q[5]); d.set(q[6], q[7], q[8]);
            nrm.copy(b).sub(a).cross(d.clone().sub(a)).normalize();
            const colour = faceColour(i, j, (q[1] + q[4] + q[7]) / 3, nrm.x, nrm.y, nrm.z);
            tri(q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], colour);
          }
        }
      // skirts: vertical quads hanging from the 4 edges (winding faces outward)
      const skirt = (i0: number, j0: number, i1: number, j1: number, outX: number, outZ: number) => {
        const ax = x0 + i0 * step, az = z0 + j0 * step, bx = x0 + i1 * step, bz = z0 + j1 * step;
        const ah = H(i0, j0), bh = H(i1, j1);
        const fi = Math.min(i0, i1, n - 1), fj = Math.min(j0, j1, n - 1);
        const colour = faceColour(fi, fj, (ah + bh) / 2, 0, 1, 0);
        // choose the winding so the face normal points outward (outX, outZ)
        const nx = -(bz - az), nz = bx - ax;
        const flip = nx * outX + nz * outZ < 0;
        if (!flip) {
          tri(ax, ah, az, ax, ah - SKIRT, az, bx, bh - SKIRT, bz, colour);
          tri(ax, ah, az, bx, bh - SKIRT, bz, bx, bh, bz, colour);
        } else {
          tri(ax, ah, az, bx, bh - SKIRT, bz, ax, ah - SKIRT, az, colour);
          tri(ax, ah, az, bx, bh, bz, bx, bh - SKIRT, bz, colour);
        }
      };
      for (let i = 0; i < n; i++) {
        skirt(i, 0, i + 1, 0, 0, -1);
        skirt(i, n, i + 1, n, 0, 1);
        skirt(0, i, 0, i + 1, -1, 0);
        skirt(n, i, n, i + 1, 1, 0);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, k), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col.subarray(0, k), 3));
      geo.computeVertexNormals();
    } else {
      // indexed grid, colour per vertex; the skirt shares the edge vertices and adds a lowered copy of them
      const count = (n + 1) * (n + 1), edge = 4 * n;
      const pos = new Float32Array((count + edge) * 3), col = new Float32Array((count + edge) * 3);
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          const v = j * (n + 1) + i, x = x0 + i * step, z = z0 + j * step, h = H(i, j);
          pos.set([x, h, z], v * 3);
          const hx = (H(Math.min(i + 1, n), j) - H(Math.max(i - 1, 0), j)) / (2 * step);
          const hz = (H(i, Math.min(j + 1, n)) - H(i, Math.max(j - 1, 0))) / (2 * step);
          this.colorAt(x, z, h, Math.hypot(hx, hz), rand, c);
          c.toArray(col, v * 3);
        }
      const index: number[] = [];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const v = j * (n + 1) + i;
          index.push(v, v + n + 1, v + n + 2, v, v + n + 2, v + 1);
        }
      // edge ring (clockwise seen from above), each with a lowered twin
      const ring: number[] = [];
      for (let i = 0; i < n; i++) ring.push(i);                     // north edge, west → east
      for (let j = 0; j < n; j++) ring.push(j * (n + 1) + n);        // east edge, north → south
      for (let i = n; i > 0; i--) ring.push(n * (n + 1) + i);        // south edge, east → west
      for (let j = n; j > 0; j--) ring.push(j * (n + 1));            // west edge, south → north
      ring.forEach((v, r) => {
        const low = count + r;
        pos.set([pos[v * 3], pos[v * 3 + 1] - SKIRT, pos[v * 3 + 2]], low * 3);
        col.set(col.subarray(v * 3, v * 3 + 3), low * 3);
      });
      for (let r = 0; r < edge; r++) {
        const v = ring[r], w = ring[(r + 1) % edge], lv = count + r, lw = count + ((r + 1) % edge);
        index.push(v, lv, lw, v, lw, w);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();
    return geo;
  }

  /** Pick the LOD of every chunk from the camera distance. Call once per frame. */
  update(cameraPosition: THREE.Vector3) {
    const [d1, d2] = this.opts.lodDistances;
    let tris = 0;
    for (const c of this.chunks) {
      const d = Math.hypot(cameraPosition.x - c.center.x, cameraPosition.z - c.center.z);
      const level = d < d1 ? 0 : d < d2 ? 1 : 2;
      c.levels.forEach((m, i) => { m.visible = i === level; });
      const g = c.levels[level].geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    this.triangles = tris;
  }
}
