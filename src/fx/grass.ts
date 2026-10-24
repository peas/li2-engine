import * as THREE from "three";
import type { Ground } from "../core/types";
import type { Biome, WorldMap } from "../world/map";
import { DEFAULT_TERRAIN, groundColour, resolvePalette } from "../world/terrain";
import { hash2, mulberry32, smoothstep } from "../core/math";

/** How many past positions of the actor the shader remembers, so the bend fades back instead of snapping. */
const TRAIL = 8;
/** Default ground where no blade grows. */
export const GRASS_BARE: Biome[] = ["water", "sand", "rock", "snow", "path", "lava", "ash", "mud"];
/** Floats kept per cached blade: x, y, z, height, cos(yaw), sin(yaw), r, g, b, edge dice. */
const STRIDE = 10;
/** Cells kept in the cache (each ~30 KB); beyond this the oldest are dropped. */
const CACHE_CELLS = 600;

export interface GrassOptions {
  /** Radius of the round patch around the actor (m). */
  radius: number;
  /** Blades in a full patch (the instance capacity). */
  count: number;
  /** Spacing of the terrain's finest grid (m), so each blade sits exactly on the flat-shaded triangle under it. */
  gridStep?: number;
  /** The terrain's palette overrides (pass the same as `TerrainOptions.palette`, so blades match the ground). */
  palette?: Partial<Record<Biome, THREE.ColorRepresentation>>;
  /** Biomes with no grass. Default `GRASS_BARE`. */
  bare?: Biome[];
}

/** One cell of the grass grid: the blades that may grow there, in world space, fixed for the whole game. */
interface Cell {
  blades: Float32Array;
  n: number;
}

/**
 * Instanced grass blades (2 triangles each, normal pointing up so they are lit like the terrain) in a round patch
 * that follows the actor across the whole map. The vertex shader sways them in the wind and bends them away from her
 * recent positions.
 *
 * The map is cut into cells two terrain quads wide (20 m). A cell's blades come from a PRNG seeded with
 * `hash2(cellX, cellZ)`, so a blade always reappears in the same place; they skip the `bare` biomes, sand
 * near the water and slopes over 0.35, with the biome taken per terrain quad (the same test that paints the
 * ground) and the height interpolated on the same triangle the terrain mesh draws. When she moves more than a
 * third of the radius from the patch centre, the instances are rewritten from the cached cells; the blades near
 * the rim are thinned and shrunk (ragged edge) at that moment.
 */
export class GrassField {
  /** Places where no grass grows even if the biome allows it (a cave floor, a square). Set before the first update. */
  exclude?: (x: number, z: number) => boolean;
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uRadius: { value: 10 },
    uPush: { value: Array.from({ length: TRAIL + 1 }, () => new THREE.Vector4()) },
  };
  /** Milliseconds the last re-placement took (for tests / the HUD). */
  lastPlaceMs = 0;
  /** Past positions (xyz) and the strength (w) she had there, newest first; ages in `ages`. */
  private readonly trail = Array.from({ length: TRAIL }, () => new THREE.Vector4());
  private readonly ages = new Float32Array(TRAIL).fill(99);
  private sampleTimer = 0;
  private readonly cells = new Map<number, Cell>();
  private readonly center = new THREE.Vector2(Infinity, Infinity);
  private readonly step: number;
  private readonly cellSize: number;
  private readonly perCell: number;
  private readonly palette: Record<Biome, THREE.Color>;
  private readonly bare: Set<Biome>;

  constructor(readonly ground: Ground, readonly map: WorldMap, readonly opts: GrassOptions) {
    this.step = opts.gridStep ?? map.size / DEFAULT_TERRAIN.segments;
    this.palette = resolvePalette(opts.palette);
    this.bare = new Set(opts.bare ?? GRASS_BARE);
    this.cellSize = 2 * this.step;
    // the ragged rim drops ~22% of the blades: generate that many more so a full patch gets close to `count`
    this.perCell = Math.round((opts.count * this.cellSize * this.cellSize) / (Math.PI * opts.radius * opts.radius) / 0.78);

    // a tapered blade, 1 m tall in local space (instances scale it)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, -0.03, 1, 0, 0.03, 1, 0], 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute([0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.2, 1.2, 1.05, 1.2, 1.2, 1.05], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          uniform float uWind;
          uniform float uRadius;
          uniform vec4 uPush[${TRAIL + 1}];`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            vec3 base = instanceMatrix[3].xyz;
            mat3 im = mat3(instanceMatrix);
            float s = length(im[0]);
            float k = position.y * position.y; // only the top moves
            // wind: a slow gust in one direction plus a per-blade wobble
            vec2 off = vec2(0.22, 0.1) * (0.6 + 0.4 * sin(uTime * 0.5 + base.x * 0.02 + base.z * 0.015));
            off += vec2(sin(uTime * 1.7 + base.x * 0.13 + base.z * 0.07), 0.6 * sin(uTime * 1.3 + base.z * 0.11 - base.x * 0.05)) * 0.12;
            off *= uWind;
            // the actor: push away from each remembered position
            for (int i = 0; i < ${TRAIL + 1}; i++) {
              vec2 d = base.xz - uPush[i].xz;
              float dist = length(d) + 0.001;
              off += d / dist * uPush[i].w * (1.0 - smoothstep(uRadius * 0.25, uRadius, dist)) * 1.3;
            }
            float m = length(off);
            if (m > 1.3) off *= 1.3 / m;
            vec3 bend = vec3(off.x, -0.45 * min(m * m, 1.0), off.y) * k; // in blade heights
            transformed += (bend * im) / s; // world direction -> local (instance = rotation * uniform scale)
          }`,
        );
      // both faces keep the up normal (DoubleSide would flip it on the back face and paint it dark)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        "#include <normal_fragment_begin>\n          normal = normalize(vNormal);",
      );
    };
    mat.customProgramCacheKey = () => "grass";

    this.mesh = new THREE.InstancedMesh(geo, mat, opts.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color()); // allocates instanceColor
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.name = "grass";
    // The blades do not receive the sun shadow (the terrain under them does).
    this.mesh.boundingSphere = new THREE.Sphere();
  }

  /** `pos` = the actor's position, `strength` 0..~1.3 (0 = far or high), `radius` in m. */
  update(dt: number, time: number, pos: THREE.Vector3, strength: number, radius: number, wind: number, recover: number) {
    if (Math.hypot(pos.x - this.center.x, pos.z - this.center.y) > this.opts.radius / 3) this.place(pos.x, pos.z);
    const u = this.uniforms;
    u.uTime.value = time;
    u.uWind.value = wind;
    u.uRadius.value = radius;
    for (let i = 0; i < TRAIL; i++) this.ages[i] += dt;
    this.sampleTimer += dt;
    const step = recover / TRAIL;
    if (this.sampleTimer >= step) {
      this.sampleTimer = 0;
      for (let i = TRAIL - 1; i > 0; i--) {
        this.trail[i].copy(this.trail[i - 1]);
        this.ages[i] = this.ages[i - 1];
      }
      this.trail[0].set(pos.x, pos.y, pos.z, strength);
      this.ages[0] = 0;
    }
    u.uPush.value[0].set(pos.x, pos.y, pos.z, strength);
    for (let i = 0; i < TRAIL; i++) {
      const t = this.trail[i];
      const fade = Math.max(0, 1 - this.ages[i] / recover);
      u.uPush.value[i + 1].set(t.x, t.y, t.z, t.w * fade * fade);
    }
  }

  /** Rewrite the instances for the patch centred on (x, z). */
  place(x: number, z: number) {
    const t0 = performance.now();
    const R = this.opts.radius, cs = this.cellSize, cap = this.opts.count;
    this.center.set(x, z);
    const m = this.mesh.instanceMatrix.array as Float32Array, col = this.mesh.instanceColor!.array as Float32Array;
    let n = 0, yMin = Infinity, yMax = -Infinity;
    const c0x = Math.floor((x - R) / cs), c1x = Math.floor((x + R) / cs);
    const c0z = Math.floor((z - R) / cs), c1z = Math.floor((z + R) / cs);
    for (let cz = c0z; cz <= c1z && n < cap; cz++)
      for (let cx = c0x; cx <= c1x && n < cap; cx++) {
        // skip cells entirely outside the circle
        const nx = Math.max(cx * cs, Math.min(x, (cx + 1) * cs)), nz = Math.max(cz * cs, Math.min(z, (cz + 1) * cs));
        if (Math.hypot(nx - x, nz - z) > R) continue;
        const cell = this.cell(cx, cz), b = cell.blades;
        for (let i = 0; i < cell.n && n < cap; i++) {
          const o = i * STRIDE, bx = b[o], bz = b[o + 2];
          const edge = smoothstep(0.75, 1, Math.hypot(bx - x, bz - z) / R);
          if (b[o + 9] < edge || edge >= 1) continue; // ragged edge: thinned...
          const s = b[o + 3] * (1 - 0.5 * edge), c = b[o + 4] * s, sn = b[o + 5] * s; // ...and shorter
          const k = n * 16, y = b[o + 1];
          // rotation about Y times a uniform scale, column-major
          m[k] = c; m[k + 1] = 0; m[k + 2] = -sn; m[k + 3] = 0;
          m[k + 4] = 0; m[k + 5] = s; m[k + 6] = 0; m[k + 7] = 0;
          m[k + 8] = sn; m[k + 9] = 0; m[k + 10] = c; m[k + 11] = 0;
          m[k + 12] = bx; m[k + 13] = y; m[k + 14] = bz; m[k + 15] = 1;
          col[n * 3] = b[o + 6]; col[n * 3 + 1] = b[o + 7]; col[n * 3 + 2] = b[o + 8];
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
          n++;
        }
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.clearUpdateRanges();
    this.mesh.instanceColor!.addUpdateRange(0, n * 3);
    this.mesh.instanceColor!.needsUpdate = true;
    // bounding sphere from the patch itself (cheaper than walking every instance)
    const yMid = n ? (yMin + yMax) / 2 : 0;
    this.mesh.boundingSphere!.center.set(x, yMid, z);
    this.mesh.boundingSphere!.radius = Math.hypot(R, n ? (yMax - yMin) / 2 : 0) + 3;
    this.lastPlaceMs = performance.now() - t0;
  }

  /** The cached blades of a cell, generating them the first time. */
  private cell(cx: number, cz: number): Cell {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let cell = this.cells.get(key);
    if (cell) {
      this.cells.delete(key); // re-insert: Map order doubles as least-recently-used
      this.cells.set(key, cell);
      return cell;
    }
    cell = this.generate(cx, cz);
    this.cells.set(key, cell);
    if (this.cells.size > CACHE_CELLS) this.cells.delete(this.cells.keys().next().value!);
    return cell;
  }

  private generate(cx: number, cz: number): Cell {
    const map = this.map, step = this.step, cs = this.cellSize;
    const x0 = cx * cs, z0 = cz * cs;
    // terrain grid indices of the cell's corner (the mesh starts at -size/2)
    const gi0 = Math.round((x0 + map.size / 2) / step), gj0 = Math.round((z0 + map.size / 2) / step);
    const H: number[] = [];
    for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) H.push(map.heightAt(x0 + i * step, z0 + j * step));
    const h = (i: number, j: number) => H[j * 3 + i];
    // per terrain quad: may grass grow there, and its colour (same rules as terrain.ts colorAt)
    const quads = [0, 1, 2, 3].map((q) => {
      const i = q & 1, j = q >> 1;
      const qx = x0 + (i + 0.5) * step, qz = z0 + (j + 0.5) * step;
      const hq = (h(i, j) + h(i + 1, j) + h(i, j + 1) + h(i + 1, j + 1)) / 4;
      const sx = (h(i + 1, j) + h(i + 1, j + 1) - h(i, j) - h(i, j + 1)) / (2 * step);
      const sz = (h(i, j + 1) + h(i + 1, j + 1) - h(i, j) - h(i + 1, j)) / (2 * step);
      const slope = Math.hypot(sx, sz);
      const biome = map.biomeAt(qx, qz, hq, slope);
      const rel = hq - map.waterLevel;
      const ok = !this.bare.has(biome) && rel >= 4.5 && slope <= 0.35 && !this.exclude?.(qx, qz);
      const colour = groundColour(map, this.palette, biome, qx, qz, hq, new THREE.Color());
      return { ok, colour };
    });
    const blades = new Float32Array(this.perCell * STRIDE);
    if (!quads.some((q) => q.ok)) return { blades, n: 0 };
    const rand = mulberry32(Math.floor(hash2(cx, cz, 977) * 4294967296));
    let n = 0;
    for (let k = 0; k < this.perCell; k++) {
      const u = rand() * 2, v = rand() * 2, yaw = rand() * Math.PI, height = 0.7 + rand() * 0.9, shade = 0.9 + rand() * 0.2, dice = rand();
      const i = Math.min(1, Math.floor(u)), j = Math.min(1, Math.floor(v));
      const q = quads[j * 2 + i];
      if (!q.ok) continue;
      // height on the same triangle the terrain draws (it alternates the diagonal with the parity of the quad)
      const fx = u - i, fz = v - j;
      const h00 = h(i, j), h10 = h(i + 1, j), h01 = h(i, j + 1), h11 = h(i + 1, j + 1);
      let y: number;
      if (((gi0 + i + gj0 + j) & 1) === 0) y = fz >= fx ? h00 + fx * (h11 - h01) + fz * (h01 - h00) : h00 + fx * (h10 - h00) + fz * (h11 - h10);
      else y = fx + fz <= 1 ? h00 + fx * (h10 - h00) + fz * (h01 - h00) : h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
      const o = n * STRIDE;
      blades[o] = x0 + u * step;
      blades[o + 1] = y - 0.15;
      blades[o + 2] = z0 + v * step;
      blades[o + 3] = height;
      blades[o + 4] = Math.cos(yaw);
      blades[o + 5] = Math.sin(yaw);
      blades[o + 6] = q.colour.r * shade;
      blades[o + 7] = q.colour.g * shade;
      blades[o + 8] = q.colour.b * shade;
      blades[o + 9] = dice;
      n++;
    }
    return { blades, n };
  }
}
