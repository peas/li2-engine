import * as THREE from "three";
import type GUI from "lil-gui";
import type { Ground } from "../core/types";
import type { WorldMap } from "../world/map";
import { Ribbon, ribbonMaterial } from "./ribbons";
import { SpeedLines } from "./speedlines";
import { GrassField, type GrassOptions } from "./grass";
import { Dust, DUST_COLOURS } from "./dust";
import { WaterRings } from "./waterRings";
import { Brilho } from "./brilho";
import { Sinais } from "./sinais";
import { damp, smoothstep } from "./util";

export * from "./ribbons";
export * from "./speedlines";
export * from "./grass";
export * from "./dust";
export * from "./waterRings";
export * from "./brilho";
export * from "./sinais";
export * from "./util";

/** Everything the effects need to know about this frame. Positions are world space, metres. */
export interface FxFrame {
  dt: number;
  time: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  forward: THREE.Vector3;
  /** m/s along `forward` in the air; walking speed on the ground. */
  speed: number;
  cruiseSpeed: number;
  maxSpeed: number;
  grounded: boolean;
  /** Feet above the floor (terrain or water surface), m. */
  altitude: number;
  /** Is the floor under the actor deep water (a flyer skims it, nobody lands)? */
  overWater: boolean;
  /** Is the actor wading in the shallows (terrain under the water, walkable)? Rings at the feet, splashes, no dust. */
  rasa?: boolean;
  /** Wave amplitude of the water mesh (m), so rings ride the same waves. */
  waterAmp?: number;
  /** Size of the actor (m: body length of a creature, height of a person): every effect size scales by it. */
  scale: number;
  /** Trail points (wing tips, hands): ribbons follow them. World matrices from the last render are fine. */
  trailL?: THREE.Object3D;
  trailR?: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  /** 0..1: glowing motes rise round the actor (healing, charging). */
  brilho?: number;
}

export interface EffectsOptions {
  /** The grass patch around the actor; pass the terrain's `palette` here so blades match the ground. */
  grass?: Partial<GrassOptions>;
  /** Colour of the trails. */
  trailColour?: THREE.ColorRepresentation;
  /** The two tints of a dust puff. */
  dust?: { a: THREE.ColorRepresentation; b: THREE.ColorRepresentation };
  /** Where the floating "+1" labels go (default `document.body`). */
  container?: HTMLElement;
}

export interface FxParams {
  /** Master switch ("desligar efeitos" in the panel). */
  enabled: boolean;
  ribbons: boolean;
  speedLines: boolean;
  grass: boolean;
  dust: boolean;
  rings: boolean;
  /** Ribbons show above this many times the cruise speed. */
  ribbonFrom: number;
  /** Speed lines start at this many times the cruise speed and peak at max speed. */
  linesFrom: number;
  linesStrength: number;
  /** How hard the grass bends away from the actor. */
  grassPush: number;
  /** Multiplier on the number and reach of dust particles. */
  dustAmount: number;
}

/** The grass patch that follows the actor: radius (m) and blade count. */
const GRASS_FIELD = { radius: 75, count: 32000 };
const TRAIL = "#c9ecff";
/** Colour of the drops of a splash in the shallows. */
const SPLASH = new THREE.Color("#bfe6f7");

/**
 * Wind and speed effects for the player's actor: trails (wing tips, hands), speed lines at the screen edge, bending
 * grass, dust on landing, splashes and water rings, glowing motes, floating "+1" labels. Every size scales with
 * `FxFrame.scale` (the actor's size in metres).
 */
export class Effects {
  readonly params: FxParams = {
    enabled: true, ribbons: true, speedLines: true, grass: true, dust: true, rings: true,
    ribbonFrom: 1.1, linesFrom: 1.3, linesStrength: 1, grassPush: 1, dustAmount: 1,
  };
  private readonly ribbonMat: THREE.ShaderMaterial;
  private readonly ribbons: Ribbon[];
  private readonly lines = new SpeedLines();
  readonly grass: GrassField;
  private readonly dust: Dust;
  private readonly rings = new WaterRings();
  /** Glowing motes round the actor (`FxFrame.brilho`). */
  readonly brilho = new Brilho();
  /** Floating "+1" labels. */
  readonly sinais: Sinais;
  private ribbonFade = 0;
  /** Time of the last frame (for splashes fired between frames). */
  private lastTime = 0;
  private linesFade = 0;
  private length = 1.6;
  private readonly tip = new THREE.Vector3();
  private readonly floor = new THREE.Vector3();

  /** `ground` = what the actor stands on (dust height, deep water); `map` places the grass by biome. */
  constructor(readonly scene: THREE.Scene, readonly ground: Ground, readonly map: WorldMap, opts: EffectsOptions = {}) {
    this.ribbonMat = ribbonMaterial(opts.trailColour ?? TRAIL);
    this.ribbons = [new Ribbon(this.ribbonMat), new Ribbon(this.ribbonMat)];
    this.dust = new Dust(opts.dust ?? DUST_COLOURS);
    this.sinais = new Sinais(opts.container);
    this.grass = new GrassField(ground, map, { ...GRASS_FIELD, ...opts.grass });
    scene.add(this.grass.mesh, this.lines.mesh, this.dust.points, this.rings.mesh, this.brilho.points, ...this.ribbons.map((r) => r.mesh));
  }

  /** Events from the locomotion (fired during its update, before this frame's `update`). Landing dust grows with speed. */
  onLand(speed: number, position: THREE.Vector3) {
    const k = THREE.MathUtils.clamp(speed / 24, 0.4, 1.4);
    this.puff(position, 20 + 30 * k, 0.9 * k, 0.16);
  }

  /** A splash in the shallows (landing or a hop into the water): pale-blue drops up and out, and rings on the surface. */
  private splash(position: THREE.Vector3, count: number, reach: number) {
    const p = this.params;
    if (!p.enabled) return;
    const L = this.length;
    if (p.dust) {
      this.floor.set(position.x, this.map.waterLevel + 0.2, position.z);
      this.dust.burst(this.floor, Math.min(50, Math.round(count * p.dustAmount)), reach * L, 0.1 * L, 1.6, SPLASH);
    }
    if (p.rings) for (let i = 0; i < 3; i++) this.rings.update(0.16, this.lastTime, true, position, (0.6 + 0.3 * i) * L, 0.15);
  }
  onTakeoff(position: THREE.Vector3) {
    this.puff(position, 32, 0.75, 0.15);
  }
  onJump(position: THREE.Vector3) {
    this.puff(position, 12, 0.35, 0.08);
  }

  /** Something vanishes into sparkles of one colour (an animal caught: never blood). `position` = its centre. */
  faiscas(position: THREE.Vector3, colour: THREE.Color) {
    const p = this.params;
    if (!p.enabled || !p.dust) return;
    const L = this.length;
    this.dust.burst(position, 40, 0.25 * L, 0.12 * L, 1.2, colour);
  }

  private puff(position: THREE.Vector3, count: number, reach: number, size: number) {
    const p = this.params;
    if (!p.enabled || !p.dust || this.ground.isWaterAt(position.x, position.z)) return;
    // the shallows: the terrain is under the water, so the puff is a splash
    if (this.map.isWaterAt(position.x, position.z)) return this.splash(position, count, reach * 0.6);
    const L = this.length;
    this.floor.set(position.x, this.ground.heightAt(position.x, position.z) + 0.1, position.z);
    this.dust.burst(this.floor, Math.min(60, Math.round(count * p.dustAmount)), reach * L * Math.sqrt(p.dustAmount), size * L);
  }

  /** A floating label (default "+1") over `position` that rises and fades in 1 s. */
  maisUm(position: THREE.Vector3, texto = "+1", cor?: string) {
    if (this.params.enabled) this.sinais.maisUm(position, texto, cor);
  }

  update(f: FxFrame) {
    const p = this.params, L = f.scale, dt = f.dt;
    this.length = L;
    const on = p.enabled;
    const ratio = f.speed / f.cruiseSpeed;
    if (!on) this.ribbonFade = this.linesFade = 0; // the master switch is instant; per-effect toggles fade

    // trails: always sampled (so they are ready when they fade in), drawn only when visible
    const ribbonTarget = on && p.ribbons && !f.grounded ? smoothstep(p.ribbonFrom, p.ribbonFrom + 0.25, ratio) : 0;
    this.ribbonFade = damp(this.ribbonFade, ribbonTarget, 4, dt);
    this.ribbonMat.uniforms.uOpacity.value = this.ribbonFade * 0.75;
    const tips = [f.trailL, f.trailR];
    this.ribbons.forEach((r, i) => {
      const bone = tips[i];
      r.mesh.visible = !!bone && this.ribbonFade > 0.01;
      if (!bone) return;
      // refresh the bone chain now (flight and pose already ran this frame), so the trail starts exactly at the tip
      bone.updateWorldMatrix(true, false);
      r.push(bone.getWorldPosition(this.tip), Math.max(L, f.speed * dt * 4));
      if (r.mesh.visible) r.build(1.5 * L, 0.04 * L, f.camera);
    });

    // speed lines at the screen edge, in step with the FOV that opens with speed (camera.ts)
    const maxRatio = f.maxSpeed / f.cruiseSpeed;
    const linesTarget = on && p.speedLines && !f.grounded ? smoothstep(p.linesFrom, Math.max(maxRatio, p.linesFrom + 0.1), ratio) * p.linesStrength : 0;
    this.linesFade = damp(this.linesFade, linesTarget, 3, dt);
    this.lines.update(dt, this.linesFade, f.camera);

    // grass bends away from the actor when low; on the ground only the feet push it
    this.grass.mesh.visible = on && p.grass;
    if (this.grass.mesh.visible) {
      const low = 1 - smoothstep(0.4 * L, 1.5 * L, f.altitude);
      const strength = low * p.grassPush * (f.grounded ? 0.3 + 0.3 * Math.min(f.speed / 10, 1) : 0.5 + 0.4 * Math.min(ratio, 1.5));
      this.grass.update(dt, f.time, f.position, strength, (f.grounded ? 0.6 : 1.5) * L, 1, 1);
    }

    // dust: particles already in the air finish even if dust is switched off mid-puff, unless master is off
    if (!on) this.dust.clear();
    this.dust.update(dt, f.camera, innerHeight * Math.min(devicePixelRatio, 2));
    // glow: `f.brilho` (0..1) is how strong it is this frame
    if (on && (f.brilho ?? 0) > 0) this.brilho.emit(f.position, 0.35 * L, 45 * f.brilho!, dt);
    this.brilho.update(dt, f.camera, innerHeight * Math.min(devicePixelRatio, 2));

    // water rings while skimming, and at the feet while wading in the shallows
    this.lastTime = f.time;
    const skimming = on && p.rings && f.overWater && !f.grounded && f.altitude < 0.4 * L && f.speed > 0;
    const wading = on && p.rings && !!f.rasa && f.grounded && f.speed > 0.5;
    if (!on) this.rings.clear();
    else this.rings.update(dt, f.time, skimming || wading, f.position, wading ? 0.5 * L : 1.1 * L, wading ? 0.3 : 0.15, f.waterAmp);

    if (!on) this.sinais.clear();
    this.sinais.update(dt, f.camera);
  }

  /** Knobs for the debug panel (the game creates the folder). */
  addGui(folder: GUI) {
    const p = this.params;
    folder.add(p, "enabled").name("efeitos ligados");
    folder.add(p, "ribbons").name("fitas (rastros)");
    folder.add(p, "speedLines").name("linhas de velocidade");
    folder.add(p, "grass").name("grama");
    folder.add(p, "dust").name("poeira");
    folder.add(p, "rings").name("anéis na água");
    folder.add(p, "ribbonFrom", 0.8, 2.5, 0.05).name("fitas a partir de (× cruzeiro)");
    folder.add(p, "linesFrom", 0.8, 2.5, 0.05).name("linhas a partir de (× cruzeiro)");
    folder.add(p, "linesStrength", 0, 1.5, 0.05).name("força das linhas");
    folder.add(p, "grassPush", 0, 2, 0.05).name("grama dobra");
    folder.add(p, "dustAmount", 0, 2, 0.05).name("poeira (quantidade)");
  }
}
