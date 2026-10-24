import * as THREE from "three";

/**
 * Anime speed lines: one full-screen quad (drawn straight in clip space, so resizing needs nothing) whose
 * fragment shader draws thin radial streaks rushing outward from the screen centre, like the FOV opening.
 * The centre stays clear; `uIntensity` 0..1 sets how many streaks show and how opaque they are.
 */
export class SpeedLines {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uPhase: { value: 0 },
    uIntensity: { value: 0 },
    uAspect: { value: 1 },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() {
          vP = position.xy;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uPhase;
        uniform float uIntensity;
        uniform float uAspect;
        varying vec2 vP;
        float hash(float n) { return fract(sin(n) * 43758.5453123); }
        void main() {
          vec2 p = vec2(vP.x * uAspect, vP.y);
          float r = length(p);
          float clearR = 0.78 - 0.18 * uIntensity;
          if (r < clearR) discard;
          const float N = 110.0;
          float a = atan(p.y, p.x) / 6.2831853 + 0.5;
          float cell = floor(a * N);
          float h = hash(cell);
          // each streak travels outward once per cycle, then re-rolls whether it shows and where it sits
          float t = uPhase * (0.7 + 0.6 * h) + h * 7.0;
          float cycle = floor(t);
          float phase = fract(t);
          float roll = hash(cell * 7.13 + cycle * 13.7);
          if (roll > 0.15 + 0.6 * uIntensity) discard;
          float jitter = (hash(cell * 3.1 + cycle * 5.3) - 0.5) * 0.7;
          float d = abs(fract(a * N) - 0.5 - jitter) / N * 6.2831853 * r; // distance to the streak, screen units
          float thick = 0.0015 + 0.0035 * r;
          float line = 1.0 - smoothstep(0.0, thick, d);
          float headR = mix(clearR, 2.2, phase);
          float len = 0.25 + 0.45 * hash(cell + cycle * 1.7);
          float along = smoothstep(headR - len, headR, r) * step(r, headR);
          float edge = smoothstep(clearR, clearR + 0.35, r);
          float alpha = line * along * edge * uIntensity * 0.6;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(0.94, 0.98, 1.0, alpha);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
  }

  update(dt: number, intensity: number, camera: THREE.PerspectiveCamera) {
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uAspect.value = camera.aspect;
    // accumulate the phase so changing the rate never makes the streaks jump
    this.uniforms.uPhase.value += dt * (0.9 + 1.6 * intensity);
    this.mesh.visible = intensity > 0.01;
  }
}
