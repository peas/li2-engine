import * as THREE from "three";
import type { Controls } from "./types";

export interface LoopOptions {
  /** Simulation step (s). */
  step?: number;
  /** At most this many steps per frame; after a longer stall the rest is dropped (no slow-motion catch-up). */
  maxSteps?: number;
  /** Longest frame time accepted (s): a background tab or a breakpoint never turns into a giant step. */
  maxDt?: number;
  /** Read the input once per frame (`dt` = real seconds since the last frame). Zero it here when a menu is open. */
  lerControles: (dt: number) => Controls;
  /**
   * One fixed step of the whole simulation. `controls.lookX/lookY` are this step's share of the mouse travel (the
   * frame's travel split evenly over its steps; a frame with no step carries it to the next one).
   */
  simular: (step: number, controls: Controls, simTime: number) => void;
  /** Once per frame, after the steps: camera, pose, effects, sound, render. `alpha` (0..1) = how far into the next step. */
  renderizar: (dt: number, alpha: number, controls: Controls) => void;
  /** Clock in ms (default `performance.now`); tests pass a fake one. */
  agora?: () => number;
  /** Frame scheduler (default `requestAnimationFrame`); tests pass a fake one. */
  agendar?: (cb: () => void) => number;
  cancelar?: (id: number) => void;
}

/**
 * Fixed timestep ("Fix Your Timestep", Gaffer 2004; measured in the first game): the simulation runs in `step`-second
 * steps from an accumulator (at most `maxSteps` per frame, the rest is dropped), and the render shows the state
 * interpolated between the last two steps by `alpha`. Camera, pose, effects and sound run once per frame on that
 * interpolated state, so a 55 or 120 Hz screen gets the same motion without stutter.
 *
 * Drive it with `start()` (its own requestAnimationFrame), or call `quadro(dt)` from a loop you already have
 * (`renderer.setAnimationLoop`).
 */
export class Loop {
  readonly step: number;
  readonly maxSteps: number;
  readonly maxDt: number;
  /** Simulated seconds since the start (advances only by whole steps). */
  simTime = 0;
  /** Frames per second, averaged every 0.5 s. */
  fps = 0;
  /** Off = render the latest step as is (alpha 1), for comparing. */
  interpolate = true;
  /** Steps run in the last frame. */
  passos = 0;
  private acc = 0;
  private pendingLook = { x: 0, y: 0 };
  private frames = 0;
  private fpsTime = 0;
  private last: number | null = null;
  private raf: number | null = null;
  private opts: LoopOptions;

  constructor(opts: LoopOptions) {
    this.opts = opts;
    this.step = opts.step ?? 1 / 60;
    this.maxSteps = opts.maxSteps ?? 4;
    this.maxDt = opts.maxDt ?? 0.1;
  }

  get rodando() {
    return this.raf !== null;
  }

  start() {
    if (this.raf !== null) return;
    const agora = this.opts.agora ?? (() => performance.now());
    const agendar = this.opts.agendar ?? ((cb) => requestAnimationFrame(cb));
    this.last = null;
    const tick = () => {
      this.raf = agendar(tick);
      const t = agora();
      const dt = this.last === null ? 0 : (t - this.last) / 1000;
      this.last = t;
      this.quadro(dt);
    };
    this.raf = agendar(tick);
  }

  stop() {
    if (this.raf === null) return;
    (this.opts.cancelar ?? ((id) => cancelAnimationFrame(id)))(this.raf);
    this.raf = null;
  }

  /** One rendered frame `dt` real seconds after the previous one. Returns the number of steps run. */
  quadro(rawDt: number) {
    const o = this.opts, STEP = this.step;
    const dt = Math.min(Math.max(rawDt, 0), this.maxDt);
    const controls = o.lerControles(dt);

    this.acc += dt;
    // the epsilon keeps 50 ms = 3 steps of 1/60 (floating point would make it 2.9999...)
    let steps = Math.min(this.maxSteps, Math.floor(this.acc / STEP + 1e-6));
    if (steps === this.maxSteps) this.acc = Math.min(this.acc, STEP * this.maxSteps); // long stall: drop the rest
    this.pendingLook.x += controls.lookX;
    this.pendingLook.y += controls.lookY;
    const stepControls: Controls = {
      ...controls,
      lookX: steps ? this.pendingLook.x / steps : 0,
      lookY: steps ? this.pendingLook.y / steps : 0,
    };
    if (steps) this.pendingLook.x = this.pendingLook.y = 0;
    for (let i = 0; i < steps; i++) {
      this.acc = Math.max(0, this.acc - STEP);
      this.simTime += STEP;
      o.simular(STEP, stepControls, this.simTime);
    }
    this.passos = steps;
    const alpha = this.interpolate ? THREE.MathUtils.clamp(this.acc / STEP, 0, 1) : 1;
    o.renderizar(dt, alpha, controls);

    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    return steps;
  }
}

/**
 * What the eye sees of a simulated body: its pose interpolated between the previous and the current step. Call
 * `antesDoPasso()` before each step that moves it, `depoisDoPasso()` after it (a jump longer than `limiar` metres is a
 * teleport and is not interpolated across the map), and `interpolar(alpha)` once per frame.
 */
export class Interpolado {
  readonly prevPos = new THREE.Vector3();
  readonly prevQuat = new THREE.Quaternion();
  /** Interpolated pose (written by `interpolar`). */
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();

  constructor(
    readonly alvo: { position: THREE.Vector3; quaternion: THREE.Quaternion },
    /** Metres: a step that moves the body further than this is a teleport. */
    public limiar = 30,
  ) {
    this.reset();
  }

  /** Forget the previous step (after placing the body by hand). */
  reset() {
    this.prevPos.copy(this.alvo.position);
    this.prevQuat.copy(this.alvo.quaternion);
    this.position.copy(this.alvo.position);
    this.quaternion.copy(this.alvo.quaternion);
  }

  antesDoPasso() {
    this.prevPos.copy(this.alvo.position);
    this.prevQuat.copy(this.alvo.quaternion);
  }

  depoisDoPasso() {
    if (this.prevPos.distanceToSquared(this.alvo.position) > this.limiar * this.limiar) {
      this.prevPos.copy(this.alvo.position);
      this.prevQuat.copy(this.alvo.quaternion);
    }
  }

  interpolar(alpha: number) {
    this.position.lerpVectors(this.prevPos, this.alvo.position, alpha);
    this.quaternion.slerpQuaternions(this.prevQuat, this.alvo.quaternion, alpha);
    return this;
  }

  /** Copy the interpolated pose onto a scene object. */
  aplicar(obj: THREE.Object3D) {
    obj.position.copy(this.position);
    obj.quaternion.copy(this.quaternion);
  }
}
