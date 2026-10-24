import * as THREE from "three";
import { clamp, lerp, smoothstep } from "../core/math";

export interface SkyParams {
  zenith: string;
  horizon: string;
  ground: string;
  sunColor: string;
  /** Sun elevation and azimuth in degrees. With `setHora` these are the noon values (the top of the sun's arc). */
  sunElevation: number;
  sunAzimuth: number;
  fogNear: number;
  fogFar: number;
}

export const DEFAULT_SKY: SkyParams = {
  zenith: "#4d7fd8",
  horizon: "#f4a6c8",
  ground: "#6b5b9c",
  sunColor: "#fff0c2",
  sunElevation: 30, // 14 looked like the reference, but the shadow only shows with a higher sun
  sunAzimuth: 200,
  fogNear: 500,
  fogFar: 2200,
};

/** One key of the day cycle: dome colours and the two lights. `sunColor`/`sun` at night are the moonlight. */
export interface SkyKey {
  zenith: string;
  horizon: string;
  ground: string;
  sunColor: string;
  /** DirectionalLight intensity. */
  sun: number;
  hemiSky: string;
  hemiGround: string;
  /** HemisphereLight intensity. */
  hemi: number;
}

/**
 * Night, dawn and dusk (the day key is built from the params, so a game's custom sky is its noon). Night is dark blue
 * with a weak bluish moonlight and a strong ambient: never black, a child has to see where she walks.
 */
export const SKY_KEYS: Record<"noite" | "amanhecer" | "entardecer", SkyKey> = {
  noite: { zenith: "#0f1c44", horizon: "#2e3f73", ground: "#1b2142", sunColor: "#a9bdf0", sun: 0.75, hemiSky: "#6a80c4", hemiGround: "#26343e", hemi: 1.05 },
  amanhecer: { zenith: "#6f8fd0", horizon: "#ffb48a", ground: "#7a5f8c", sunColor: "#ffd2a0", sun: 1.5, hemiSky: "#e0c8d8", hemiGround: "#4f5a3c", hemi: 1.2 },
  entardecer: { zenith: "#3d5aa8", horizon: "#ff8a5c", ground: "#5c4a80", sunColor: "#ffb070", sun: 1.6, hemiSky: "#f0b8a8", hemiGround: "#4a4a34", hemi: 1.2 },
};

/** Where each key sits on the 0..1 clock; between two keys the colours blend with a smoothstep. Day holds long. */
const CYCLE: [number, "noite" | "amanhecer" | "dia" | "entardecer"][] = [
  [0, "noite"], [0.2, "noite"], [0.27, "amanhecer"], [0.35, "dia"], [0.65, "dia"], [0.73, "entardecer"], [0.8, "noite"], [1, "noite"],
];
/** Below this |elevation| (deg) the directional light fades out, hiding the swap from sunlight to moonlight. */
const HANDOVER = 8;

/**
 * Gradient dome (pink horizon, blue zenith, big sun) + the two lights + fog that matches the horizon, with an optional
 * day cycle: `setHora(h)` moves the sun along its arc and blends the colours between night, dawn, day and dusk. At
 * night a pale moon disc sits opposite the sun, a few stars show, and the directional light comes from the moon.
 * Without `setHora` it behaves as a fixed sky (the params).
 */
export class Sky {
  readonly dome: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  /** 0 = clear, 1 = fully overcast (rain, snow): greys the dome, the fog and the lights. Set by the weather, then `apply()`. */
  overcast = 0;
  /** Draw the moon disc (and stars) when the sun is down. */
  lua = true;
  /** Current time of day (0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = sunset). Change it with `setHora`. */
  hora = 0.5;
  private sunIntensity: number;
  private hemiIntensity: number;
  /** Unit vector toward the light (the sun, or the moon when the sun is down); the shadow places the light along it. */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  /** Unit vector toward the moon (opposite the sun). */
  readonly moonDir = new THREE.Vector3(0, -1, 0);
  /** The noon key, taken from the params at construction. */
  private readonly dia: SkyKey;
  private readonly noon: { elevation: number; azimuth: number };
  private readonly hemiSky = new THREE.Color("#b8c8ff");
  private readonly hemiGround = new THREE.Color("#4f6d3c");
  readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3() },
    /** 0..1: how visible the moon and the stars are. */
    uNight: { value: 0 },
  };

  constructor(readonly params: SkyParams = { ...DEFAULT_SKY }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uZenith, uHorizon, uGround, uSunColor, uSunDir, uMoonDir;
        uniform float uNight;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = d.y >= 0.0
            ? mix(uHorizon, uZenith, smoothstep(0.0, 0.45, d.y))
            : mix(uHorizon, uGround, smoothstep(0.0, -0.12, d.y));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (smoothstep(0.9975, 0.9985, s) + pow(s, 10.0) * 0.35) * smoothstep(-0.05, 0.02, uSunDir.y);
          if (uNight > 0.0) {
            float m = max(dot(d, uMoonDir), 0.0);
            col += vec3(0.93, 0.95, 1.0) * uNight * (smoothstep(0.9988, 0.9992, m) * 0.9 + pow(m, 40.0) * 0.12);
            vec3 cell = floor(d * 260.0);
            float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.3, d.y);
            col += vec3(star * 0.8 * uNight);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    this.dome.name = "sky";

    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.hemi = new THREE.HemisphereLight(0xb8c8ff, 0x4f6d3c, 1.4);
    this.fog = new THREE.Fog(0xffffff, params.fogNear, params.fogFar);
    this.sunIntensity = this.sun.intensity;
    this.hemiIntensity = this.hemi.intensity;
    this.dia = {
      zenith: params.zenith, horizon: params.horizon, ground: params.ground, sunColor: params.sunColor,
      sun: this.sunIntensity, hemiSky: "#b8c8ff", hemiGround: "#4f6d3c", hemi: this.hemiIntensity,
    };
    this.noon = { elevation: params.sunElevation, azimuth: params.sunAzimuth };
    this.apply();
  }

  /**
   * Time of day, 0..1 (wraps): 0 = midnight, 0.25 = dawn (sun on the horizon), 0.5 = noon (the params' elevation and
   * azimuth), 0.75 = sunset. Moves the sun, blends the colours and the light intensities, then `apply()`.
   */
  setHora(h: number) {
    h = ((h % 1) + 1) % 1;
    if (!Number.isFinite(h)) return;
    this.hora = h;
    const k = this.keyAt(h), p = this.params;
    p.zenith = k.zenith; p.horizon = k.horizon; p.ground = k.ground; p.sunColor = k.sunColor;
    this.sunIntensity = k.sun;
    this.hemiIntensity = k.hemi;
    this.hemiSky.set(k.hemiSky);
    this.hemiGround.set(k.hemiGround);
    // the sun runs a full circle a day: on the horizon at 0.25 and 0.75, at the noon elevation at 0.5
    const a = (h - 0.25) * Math.PI * 2;
    p.sunElevation = this.noon.elevation * Math.sin(a);
    p.sunAzimuth = this.noon.azimuth + (h - 0.5) * 360;
    this.apply();
  }

  /** Is the sun below the horizon (for lanterns, fireflies, the music)? */
  get noite() {
    return this.params.sunElevation < 0;
  }

  /** The blended key at time `h`. */
  private keyAt(h: number): SkyKey {
    let i = 0;
    while (i < CYCLE.length - 2 && h > CYCLE[i + 1][0]) i++;
    const [h0, n0] = CYCLE[i], [h1, n1] = CYCLE[i + 1];
    const t = smoothstep(h0, h1, h);
    const a = n0 === "dia" ? this.dia : SKY_KEYS[n0], b = n1 === "dia" ? this.dia : SKY_KEYS[n1];
    const c = new THREE.Color(), mix = (x: string, y: string) => `#${c.set(x).lerp(new THREE.Color(y), t).getHexString()}`;
    return {
      zenith: mix(a.zenith, b.zenith), horizon: mix(a.horizon, b.horizon), ground: mix(a.ground, b.ground),
      sunColor: mix(a.sunColor, b.sunColor), sun: lerp(a.sun, b.sun, t),
      hemiSky: mix(a.hemiSky, b.hemiSky), hemiGround: mix(a.hemiGround, b.hemiGround), hemi: lerp(a.hemi, b.hemi, t),
    };
  }

  /** Push params into uniforms, lights and fog (call after editing params in the GUI). */
  apply() {
    const p = this.params, o = clamp(this.overcast, 0, 1);
    // overcast greys are dimmer at night, or rain would light the night sky up
    const dayness = 0.35 + 0.65 * smoothstep(-6, 6, p.sunElevation);
    const grey = new THREE.Color("#6f7889").multiplyScalar(dayness), greyLow = new THREE.Color("#a3a9b5").multiplyScalar(dayness);
    this.uniforms.uZenith.value.set(p.zenith).lerp(grey, Math.min(1, o * 1.3));
    this.uniforms.uHorizon.value.set(p.horizon).lerp(greyLow, Math.min(1, o * 1.3));
    this.uniforms.uGround.value.set(p.ground).lerp(grey, o);
    this.uniforms.uSunColor.value.set(p.sunColor).multiplyScalar(1 - o * 0.9);
    const el = THREE.MathUtils.degToRad(p.sunElevation), az = THREE.MathUtils.degToRad(p.sunAzimuth);
    const sunVec = this.uniforms.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.moonDir.copy(sunVec).negate();
    this.uniforms.uMoonDir.value.copy(this.moonDir);
    const down = p.sunElevation < 0;
    this.uniforms.uNight.value = this.lua ? smoothstep(0, 10, -p.sunElevation) * (1 - o * 0.85) : 0;
    // the light comes from whichever of sun and moon is up; it fades out near the horizon so the swap never shows
    this.sunDir.copy(down ? this.moonDir : sunVec);
    const handover = smoothstep(0, HANDOVER, Math.abs(p.sunElevation));
    this.sun.intensity = this.sunIntensity * (1 - o * 0.6) * handover;
    this.hemi.intensity = this.hemiIntensity * (1 - o * 0.25);
    this.hemi.color.copy(this.hemiSky);
    this.hemi.groundColor.copy(this.hemiGround);
    // without a shadow following the creature, the light just sits along the light direction
    this.sun.position.copy(this.sunDir).multiplyScalar(500);
    this.sun.color.set(p.sunColor);
    this.fog.color.set(p.horizon).lerp(new THREE.Color("#ffffff"), down ? 0.08 : 0.25).lerp(greyLow, Math.min(1, o * 1.3));
    this.fog.near = p.fogNear * (1 - o * 0.5);
    this.fog.far = p.fogFar * (1 - o * 0.45);
  }

  /** Keep the dome centred on the camera so it reads as infinitely far. */
  update(camera: THREE.Camera) {
    this.dome.position.copy(camera.position);
  }
}
