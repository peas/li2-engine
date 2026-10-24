import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Low-poly building helpers (from the first game's cave.ts): paint per face, place, jitter, merge, boulder. Verbatim, generic.
/** Non-indexed copy of `geo` with one colour per triangle (`base` with a small lightness jitter), no uvs. */
export function paint(geo: THREE.BufferGeometry, base: THREE.ColorRepresentation, rand: () => number, jitter = 0.05,
  face?: (c: THREE.Color, centroid: THREE.Vector3, i: number) => void) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), base3 = new THREE.Color(base), centroid = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centroid.x += pos.getX(t * 3 + k) / 3, centroid.y += pos.getY(t * 3 + k) / 3, centroid.z += pos.getZ(t * 3 + k) / 3;
    c.copy(base3).offsetHSL(0, 0, (rand() - 0.5) * 2 * jitter);
    face?.(c, centroid, t);
    for (let k = 0; k < 3; k++) c.toArray(col, (t * 3 + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
/** Move a geometry in place: scale, then rotate (yaw, and optional pitch/roll), then translate. */
export function put(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx, pitch = 0, roll = 0) {
  tmpQ.setFromEuler(tmpE.set(pitch, yaw, roll, "YXZ"));
  return geo.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
}

/** Displace every vertex of an indexed geometry by a random offset (same offset for shared vertices). */
export function jitter(geo: THREE.BufferGeometry, amount: number, rand: () => number) {
  const pos = geo.attributes.position as THREE.BufferAttribute, seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) seen.set(key, (d = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]));
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  return geo;
}

/** One flat-shaded mesh (one draw call) from painted geometries. Receives the sun shadow, casts none. */
export function lowpolyMesh(geos: THREE.BufferGeometry[], name: string, side: THREE.Side = THREE.FrontSide) {
  const geo = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side }));
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

/** A lumpy boulder (dodecahedron with jittered vertices) of radius ~`r`, painted. */
export function boulder(r: number, colour: THREE.ColorRepresentation, rand: () => number) {
  const g = jitter(new THREE.DodecahedronGeometry(1, 0), 0.45, rand);
  g.scale(r, r * (0.65 + rand() * 0.3), r);
  return paint(g, colour, rand, 0.06);
}


// ---- roofs (from the first game's loja.ts): gable ends and a two-colour checker roof ----
function triangles(pos: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Gable ends and underside of a roof `w` wide (ridge along x), `d` deep, `h` high, base at y = 0. */
export function gableEnds(w: number, d: number, h: number) {
  const x = w / 2, z = d / 2;
  return triangles([
    -x, 0, -z, -x, 0, z, -x, h, 0, // west gable
    x, 0, -z, x, h, 0, x, 0, z, // east gable
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, -z, x, 0, z, -x, 0, z, // underside
  ]);
}

/** The two slopes of a gable roof (ridge along x), as a grid of `across` × `up` quads per slope. */
function roofSlopes(w: number, d: number, h: number, across: number, up: number) {
  const x = w / 2, z = d / 2, pos: number[] = [];
  for (const side of [-1, 1]) {
    // P(u, v): u across the roof, v from the eave (0) to the ridge (1)
    const P = (u: number, v: number) => [-x + 2 * x * u, h * v, side * (z - z * v)];
    for (let j = 0; j < up; j++)
      for (let i = 0; i < across; i++) {
        const a = P(i / across, j / up), b = P((i + 1) / across, j / up);
        const c = P((i + 1) / across, (j + 1) / up), e = P(i / across, (j + 1) / up);
        // winding so the normals point out of the roof on both slopes
        if (side < 0) pos.push(...a, ...e, ...c, ...a, ...c, ...b);
        else pos.push(...a, ...b, ...c, ...a, ...c, ...e);
      }
  }
  return triangles(pos);
}

/** A gable roof with a checkered tile pattern (Elisa's drawing of the shops): tiles alternate `a` and `b`. */
export function checkerRoof(w: number, d: number, h: number, a: THREE.Color, b: THREE.Color, rand: () => number,
  across = 6, up = 4, gable: THREE.ColorRepresentation = "#5a3a24") {
  const slopes = paint(roofSlopes(w, d, h, across, up), a, rand, 0, (c, _p, t) => {
    // two triangles per tile, `across * up` tiles per slope
    const tile = Math.floor(t / 2) % (across * up);
    const i = tile % across, j = Math.floor(tile / across);
    c.copy((i + j) % 2 ? b : a).offsetHSL(0, 0, (rand() - 0.5) * 0.04);
  });
  return [slopes, paint(gableEnds(w, d, h), gable, rand, 0.03)];
}
