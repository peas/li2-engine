import * as THREE from "three";
import type GUI from "lil-gui";
import { clamp, mulberry32, smoothstep } from "../core/math";
import type { Sky } from "./sky";

export type WeatherKind = "limpo" | "chuva" | "neve";

export interface WeatherParams {
  kind: WeatherKind;
  /** Change the weather by itself (exponential timings below). */
  auto: boolean;
  /** 0..1: how many particles are drawn and how opaque they are. */
  intensity: number;
  /** Mean time between chances of rain/snow (minutes). */
  changeEvery: number;
  /** Mean length of a shower (minutes). */
  duration: number;
}

/** Overcast each kind fades to (sky.overcast). */
const OVERCAST: Record<WeatherKind, number> = { limpo: 0, chuva: 0.75, neve: 0.6 };
/** Seconds for a full fade (clear → rain and back). */
const FADE = 6;
/** Box around the camera (m): width/depth, and vertical span from camera y - BELOW to camera y + ABOVE. */
const BOX = { width: 140, below: 50, above: 70 };
/** World height of the cloud base (m): nothing falls from above it, so a flyer climbs out of the rain. */
const CEILING = 260;
const RAIN = { count: 4000, speed: 22, minLen: 0.6, maxLen: 1.2, drift: new THREE.Vector2(2.2, 1.1) };
const SNOW = { count: 2500, speed: 2, size: 0.35, wobble: 0.9, drift: new THREE.Vector2(0.7, 0.35) };
/** Auto weather dice: chance that a roll starts a shower, and the snow share of it where it is warm and where it is cold. */
export interface WeatherAuto {
  chance: number;
  snowLow: number;
  snowHigh: number;
  /** Is it cold at this camera position / altitude above ground (snow more likely)? Default: above 120 m. */
  cold: (camera: THREE.Vector3, altitude: number) => boolean;
}
export const DEFAULT_WEATHER_AUTO: WeatherAuto = { chance: 0.35, snowLow: 0.15, snowHigh: 0.75, cold: (cam, alt) => Math.max(cam.y, alt) > 120 };

// Shared by both shaders: wrap a fixed base position (0..1 in the box) around the camera, in world space, so a
// drop stays put in the world while the camera moves and re-enters from the other side when it leaves the box.
const WRAP = /* glsl */ `
  uniform vec3 uCamera;   // camera position
  uniform vec3 uBox;      // width, height, width
  uniform float uTop;     // world y of the box top (min(camera + above, ceiling))
  uniform vec3 uOffset;   // fall + drift accumulated on the CPU (doubles, kept small with mod)
  uniform float uOpacity;
  varying float vAlpha;
  vec3 wrapped(vec3 base) {
    vec3 p = base * uBox + uOffset;
    vec3 lo = vec3(uCamera.x - uBox.x * 0.5, uTop - uBox.y, uCamera.z - uBox.z * 0.5);
    vec3 w = lo + mod(p - lo, uBox);
    // fade at the box walls (no popping) and near the top and bottom
    float r = length(w.xz - uCamera.xz) / (uBox.x * 0.5);
    float h = (w.y - lo.y) / uBox.y;
    vAlpha = uOpacity * (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.9, 1.0, h));
    return w;
  }`;

const FOG_FRAG_HEAD = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  #include <fog_pars_fragment>`;

/**
 * Rain and snow from a box of particles that follows the camera (2 draw calls, no per-frame allocation: the
 * CPU only moves uniforms; the fall, the drift and the wrapping happen in the vertex shader). Fades the sky's
 * `overcast` in and out. With `auto` on it rolls the dice every `changeEvery` minutes on average.
 */
export class Weather {
  readonly params: WeatherParams = { kind: "limpo", auto: false, intensity: 0.8, changeEvery: 3, duration: 1.5 };
  /** Current 0..1 (fades over FADE seconds). */
  overcast = 0;
  /** 0..1 for the sound: rain only, fades with the fade and above the cloud base. */
  rainLevel = 0;
  /** Fade of each kind (0..1). */
  private rain = 0;
  private snow = 0;
  private pushed = 0;
  private time = 0;
  /** Seconds until the next auto change. */
  private timer = 0;
  private rng = mulberry32(1234);
  private rainLines: THREE.LineSegments;
  private snowPoints: THREE.Points;
  private rainU: Record<string, THREE.IUniform>;
  private snowU: Record<string, THREE.IUniform>;
  private rainOffset = new THREE.Vector3();
  private snowOffset = new THREE.Vector3();

  /** Auto-weather rules (which places are cold, how often it rains). */
  readonly auto: WeatherAuto;

  constructor(scene: THREE.Scene, private sky: Sky, auto: Partial<WeatherAuto> = {}) {
    this.auto = { ...DEFAULT_WEATHER_AUTO, ...auto };
    const box = new THREE.Vector3(BOX.width, BOX.below + BOX.above, BOX.width);
    const common = () => ({
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uCamera: { value: new THREE.Vector3() },
      uBox: { value: box.clone() },
      uTop: { value: 0 },
      uOffset: { value: new THREE.Vector3() },
      uOpacity: { value: 0 },
    });
    const rnd = mulberry32(99);

    // Rain: each streak is two vertices sharing the base; the tail sits behind the head along the velocity.
    {
      const n = RAIN.count;
      const base = new Float32Array(n * 6), tail = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const x = rnd(), y = rnd(), z = rnd(), len = RAIN.minLen + (RAIN.maxLen - RAIN.minLen) * rnd();
        base.set([x, y, z, x, y, z], i * 6);
        tail[i * 2] = 0;
        tail[i * 2 + 1] = len;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(base, 3));
      g.setAttribute("aTail", new THREE.BufferAttribute(tail, 1));
      this.rainU = { ...common(), uColor: { value: new THREE.Color("#cfdcf0") }, uVel: { value: new THREE.Vector3() } };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.rainU,
        transparent: true,
        depthWrite: false,
        fog: true,
        vertexShader: /* glsl */ `
          ${WRAP}
          uniform vec3 uVel;
          attribute float aTail;
          #include <fog_pars_vertex>
          void main() {
            vec3 w = wrapped(position) - normalize(uVel) * aTail;
            vAlpha *= aTail > 0.0 ? 0.25 : 1.0; // the tail fades out: reads as a falling streak
            vec4 mvPosition = viewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */ `
          ${FOG_FRAG_HEAD}
          void main() {
            gl_FragColor = vec4(uColor, vAlpha);
            #include <fog_fragment>
          }`,
      });
      this.rainLines = new THREE.LineSegments(g, mat);
    }

    // Snow: round soft points with a sideways wobble per flake.
    {
      const n = SNOW.count;
      const base = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        base.set([rnd(), rnd(), rnd()], i * 3);
        seed[i] = rnd();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(base, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      this.snowU = {
        ...common(),
        uColor: { value: new THREE.Color("#ffffff") },
        uTime: { value: 0 },
        uSize: { value: SNOW.size },
        uWobble: { value: SNOW.wobble },
        uScale: { value: 780 }, // px per metre at 1 m, set from the camera fov every frame
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.snowU,
        transparent: true,
        depthWrite: false,
        fog: true,
        vertexShader: /* glsl */ `
          ${WRAP}
          uniform float uTime, uSize, uWobble, uScale;
          attribute float aSeed;
          #include <fog_pars_vertex>
          void main() {
            vec3 w = wrapped(position);
            float f = 0.6 + aSeed * 0.9, ph = aSeed * 40.0;
            w.x += sin(uTime * f + ph) * uWobble;
            w.z += cos(uTime * f * 0.8 + ph * 1.3) * uWobble;
            vec4 mvPosition = viewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = clamp(uSize * (0.6 + aSeed * 0.8) * uScale / -mvPosition.z, 1.0, 24.0);
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */ `
          ${FOG_FRAG_HEAD}
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            gl_FragColor = vec4(uColor, vAlpha * (1.0 - smoothstep(0.35, 1.0, d)));
            #include <fog_fragment>
          }`,
      });
      this.snowPoints = new THREE.Points(g, mat);
    }

    for (const o of [this.rainLines, this.snowPoints]) {
      o.frustumCulled = false; // positions live in the shader
      o.visible = false;
      o.renderOrder = 2; // after the opaque world and the water
      scene.add(o);
    }
    this.rainLines.name = "chuva";
    this.snowPoints.name = "neve";
    this.timer = this.wait(this.params.changeEvery);
  }

  /** Immediate target; the fade does the rest. Restarts the auto timer for this state. */
  set(kind: WeatherKind) {
    this.params.kind = kind;
    this.timer = this.wait(kind === "limpo" ? this.params.changeEvery : this.params.duration);
  }

  /** Exponential wait (s) with the given mean in minutes. */
  private wait(meanMinutes: number) {
    return -Math.log(1 - this.rng() * 0.999) * Math.max(meanMinutes, 0.05) * 60;
  }

  private roll(camera: THREE.Vector3, altitude: number) {
    const A = this.auto;
    if (this.params.kind !== "limpo") return this.set("limpo");
    if (this.rng() >= A.chance) return void (this.timer = this.wait(this.params.changeEvery));
    this.set(this.rng() < (A.cold(camera, altitude) ? A.snowHigh : A.snowLow) ? "neve" : "chuva");
  }

  /** Call every frame. `altitude` (above the ground) goes to `auto.cold`. */
  update(dt: number, camera: THREE.Camera, altitude: number) {
    const p = this.params, cam = camera.position;
    this.time += dt;
    if (p.auto && (this.timer -= dt) <= 0) this.roll(cam, altitude);

    const step = dt / FADE;
    const toward = (v: number, target: number) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
    this.rain = toward(this.rain, p.kind === "chuva" ? 1 : 0);
    this.snow = toward(this.snow, p.kind === "neve" ? 1 : 0);
    this.overcast = Math.max(this.rain * OVERCAST.chuva, this.snow * OVERCAST.neve);
    if (Math.abs(this.overcast - this.pushed) > 0.005 || (this.overcast === 0 && this.pushed !== 0)) {
      this.pushed = this.overcast;
      this.sky.overcast = this.overcast;
      this.sky.apply();
    }

    const intensity = clamp(p.intensity, 0, 1);
    const top = Math.min(cam.y + BOX.above, CEILING);
    const height = BOX.below + BOX.above;
    // the box drops below the camera once she climbs over the cloud base; above it plus a margin, nothing shows
    const reach = 1 - smoothstep(CEILING + 40, CEILING + 140, cam.y);
    this.rainLevel = this.rain * intensity * (1 - smoothstep(CEILING - 10, CEILING + 40, cam.y));

    this.drive(this.rainLines, this.rainU, this.rainOffset, this.rain * intensity * reach, 0.8, RAIN.count, 2,
      RAIN.speed, RAIN.drift, dt, cam, top, height, intensity);
    this.drive(this.snowPoints, this.snowU, this.snowOffset, this.snow * intensity * reach, 0.9, SNOW.count, 1,
      SNOW.speed, SNOW.drift, dt, cam, top, height, intensity);
    if (this.rainLines.visible) (this.rainU.uVel.value as THREE.Vector3).set(RAIN.drift.x, -RAIN.speed, RAIN.drift.y);
    if (this.snowPoints.visible) {
      this.snowU.uTime.value = this.time % 1000;
      // perspective point size: pixels per metre at 1 m from the camera
      const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov : 60;
      this.snowU.uScale.value = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    }
  }

  private drive(o: THREE.Object3D & { geometry: THREE.BufferGeometry }, u: Record<string, THREE.IUniform>, off: THREE.Vector3,
    level: number, opacity: number, count: number, perItem: number, speed: number, drift: THREE.Vector2, dt: number,
    cam: THREE.Vector3, top: number, height: number, intensity: number) {
    o.visible = level > 0.002;
    if (!o.visible) return;
    // offsets accumulate in JS doubles, wrapped by the box so the float32 uniform never loses precision
    off.x = (off.x + drift.x * dt) % BOX.width;
    off.y = (off.y - speed * dt) % height;
    off.z = (off.z + drift.y * dt) % BOX.width;
    u.uOffset.value.copy(off);
    u.uCamera.value.copy(cam);
    u.uTop.value = top;
    u.uOpacity.value = opacity * level;
    // fewer particles for a lighter shower (the opacity also follows the fade)
    o.geometry.setDrawRange(0, Math.ceil(count * (0.25 + 0.75 * intensity)) * perItem);
  }

  addGui(folder: GUI) {
    folder.add(this.params, "kind", { limpo: "limpo", chuva: "chuva", neve: "neve" }).name("tempo").listen()
      .onChange((k: WeatherKind) => this.set(k));
    folder.add(this.params, "auto").name("muda sozinho");
    folder.add(this.params, "intensity", 0, 1, 0.05).name("intensidade");
    folder.add(this.params, "changeEvery", 0.5, 20, 0.5).name("chance a cada (min)");
    folder.add(this.params, "duration", 0.25, 10, 0.25).name("dura (min)");
  }
}
