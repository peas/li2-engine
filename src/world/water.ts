import * as THREE from "three";

/**
 * Three water colours by depth. Depth stands in for distance to the shore: `raso` near the banks, `medio`, `fundo` in
 * the middle of a lake and out at sea. The thresholds are depths below the water level (m). The pale `raso` band is
 * meant as walkable floor (wading): the game's `Ground.rasaAt` should read `RASO_PISAVEL`, so what the player sees is
 * what she can walk.
 */
export const WATER_BANDS = {
  raso: { until: 3, color: "#62cbe6" },
  medio: { until: 22, color: "#3b8fdc" },
  fundo: { until: Infinity, color: "#1f4f9e" },
};

/** Depth (m below the water level) an actor can wade into: exactly the pale band. */
export const RASO_PISAVEL = WATER_BANDS.raso.until;

/** Faceted water plane; vertices bob in the vertex shader, flat shading keeps the facets. Colour per facet by depth. */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uTime: { value: 0 }, uAmp: { value: 0.7 } };
  readonly params = { raso: WATER_BANDS.raso.until, medio: WATER_BANDS.medio.until };

  /** `depthAt(x, z)` = how deep the bottom is below the surface (m) at world (x, z); negative or missing = land. */
  constructor(size: number, level: number, private depthAt?: (x: number, z: number) => number, segments = 130) {
    const geo = new THREE.PlaneGeometry(size * 1.3, size * 1.3, segments, segments).rotateX(-Math.PI / 2).toNonIndexed();
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, flatShading: true, transparent: true, opacity: 0.88 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uAmp;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          transformed.y += uAmp * (sin(transformed.x * 0.045 + uTime * 0.9) + sin(transformed.z * 0.06 - uTime * 1.3) * 0.7
            + sin((transformed.x + transformed.z) * 0.03 + uTime * 0.6) * 0.5);`,
        );
    };
    mat.customProgramCacheKey = () => "water";
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = level;
    this.mesh.name = "water";
    this.paint();
  }

  /** Colour each facet by the depth under its centroid (call again after changing `params`). */
  paint() {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.mesh.geometry.attributes.color as THREE.BufferAttribute;
    const raso = new THREE.Color(WATER_BANDS.raso.color), medio = new THREE.Color(WATER_BANDS.medio.color), fundo = new THREE.Color(WATER_BANDS.fundo.color);
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      const depth = this.depthAt ? this.depthAt(cx, cz) : Infinity;
      const c = depth < this.params.raso ? raso : depth < this.params.medio ? medio : fundo;
      for (let k = 0; k < 3; k++) col.setXYZ(t + k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
  }
}
