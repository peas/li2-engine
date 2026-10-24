import type * as THREE from "three";

/** A solid thing Mila bumps into: a sphere (trees get two: trunk and crown; houses a few). */
export interface Obstacle {
  x: number;
  y: number;
  z: number;
  r: number;
}

const CELL = 60;

/**
 * Simple collision: capsule-ish body (a sphere at the pivot) against spheres, in a hash grid so a frame only looks at
 * the obstacles near her. Anything that places solid scenery (vegetation, village, cave, tower) adds spheres here;
 * the flight model calls `resolve` after moving. PLANO.md §1: "cápsula contra esferas", no physics engine.
 */
export class Obstacles {
  private cells = new Map<string, Obstacle[]>();
  count = 0;

  private key(cx: number, cz: number) {
    return `${cx},${cz}`;
  }

  add(o: Obstacle) {
    const c0x = Math.floor((o.x - o.r) / CELL), c1x = Math.floor((o.x + o.r) / CELL);
    const c0z = Math.floor((o.z - o.r) / CELL), c1z = Math.floor((o.z + o.r) / CELL);
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(o);
      }
    this.count++;
  }

  /** Obstacles whose cells overlap the square of half-size `range` around (x, z). May repeat across cells. */
  near(x: number, z: number, range: number): Obstacle[] {
    const out: Obstacle[] = [];
    const c0x = Math.floor((x - range) / CELL), c1x = Math.floor((x + range) / CELL);
    const c0z = Math.floor((z - range) / CELL), c1z = Math.floor((z + range) / CELL);
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const list = this.cells.get(this.key(cx, cz));
        if (list) out.push(...list);
      }
    return out;
  }

  /**
   * Push a sphere of `radius` at `pos` out of every obstacle it overlaps (`pos` is modified).
   * Returns the total push distance (0 = nothing hit).
   */
  resolve(pos: THREE.Vector3, radius: number): number {
    let pushed = 0;
    for (const o of this.near(pos.x, pos.z, radius + 1)) {
      const dx = pos.x - o.x, dy = pos.y - o.y, dz = pos.z - o.z;
      const d = Math.hypot(dx, dy, dz), min = o.r + radius;
      if (d >= min || d === 0) continue;
      const k = (min - d) / d;
      pos.x += dx * k; pos.y += dy * k; pos.z += dz * k;
      pushed += min - d;
    }
    return pushed;
  }

  /** Is a sphere at (x, y, z) free of obstacles? For placing things without overlap. */
  free(x: number, y: number, z: number, radius: number) {
    for (const o of this.near(x, z, radius + 1))
      if (Math.hypot(x - o.x, y - o.y, z - o.z) < o.r + radius) return false;
    return true;
  }
}
