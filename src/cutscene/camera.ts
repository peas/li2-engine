import * as THREE from "three";
import { lerp } from "../core/math";
import type { CameraVirtual } from "./schema";
import { animar, type CtxTempo, type EaseFn, type NomeEase } from "./animar";

/** Where a virtual camera is this frame (orientation without the roll, which blends on its own). */
export interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
  /** degrees */
  roll: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const VIRAR = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
const vec = (a?: readonly number[]) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3());

function olharPara(de: THREE.Vector3, para: THREE.Vector3, q = new THREE.Quaternion()) {
  // Matrix4.lookAt(eye, target) is what Object3D.lookAt uses for cameras (they look down -z)
  return q.setFromRotationMatrix(_m.lookAt(de, para, UP));
}

/**
 * Cinemachine-style camera rig for cutscenes: named virtual cameras (fixed, looking at an object, attached to an
 * object, on a rail), each one a `pose()` evaluated every frame; switching = blend from the previous camera's live
 * pose (lerp position, slerp orientation, linear fov and roll), blend 0 = cut. Because `pose()` runs every frame, a
 * camera attached to a moving object follows it even mid-blend. While `ativo` is false the game drives the camera.
 */
export class CameraRig {
  ativo = false;
  /** Accessibility ("reduzir tremor"): 0 = no shake, 1 = as scripted. */
  escalaTremor = 1;
  private cams = new Map<string, CameraVirtual>();
  private curvas = new Map<string, THREE.CatmullRomCurve3>();
  private atual: { nome: string; k: number } | null = null;
  private de: (() => Pose) | null = null;
  private peso = 1;
  private seq = 0;
  private tempo = 0;
  private tremorForca = 0;
  private tremorDur = 0;
  private tremorT = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, private obj: (id: string) => THREE.Object3D) {}

  /** Declares (or replaces) a virtual camera. */
  declarar(nome: string, cv: CameraVirtual) {
    this.cams.set(nome, cv);
    if (cv.trilho) this.curvas.set(nome, new THREE.CatmullRomCurve3(cv.trilho.map((p) => vec(p))));
    else this.curvas.delete(nome);
  }

  /** Forgets every virtual camera and the current shot. */
  limpar() {
    this.cams.clear();
    this.curvas.clear();
    this.atual = null;
    this.de = null;
    this.peso = 1;
    this.seq++;
    this.tremorForca = 0;
  }

  /** Name of the current shot (null before the first `usar`/`fixar`). */
  get nome() {
    return this.atual?.nome ?? null;
  }

  private cv(nome: string) {
    const cv = this.cams.get(nome);
    if (!cv) throw new Error(`cutscene: câmera "${nome}" não declarada (tem: ${[...this.cams.keys()].join(", ") || "nenhuma"})`);
    return cv;
  }

  private posDe(id: string) {
    const o = this.obj(id);
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(new THREE.Vector3());
  }

  /** Pose of a virtual camera; `k` = progress along its rail (0..1). */
  pose(nome: string, k = 1): Pose {
    const cv = this.cv(nome);
    const fov = cv.fov ?? 60, roll = cv.roll ?? 0;
    const curva = this.curvas.get(nome);
    let pos: THREE.Vector3;
    let olhar: THREE.Vector3 | null = cv.alvo ? this.posDe(cv.alvo) : null;
    let quat: THREE.Quaternion | null = null;
    if (curva) {
      pos = curva.getPointAt(Math.min(Math.max(k, 0), 1));
      if (!olhar && !cv.olhar) olhar = pos.clone().add(curva.getTangentAt(Math.min(Math.max(k, 0), 1)));
      else if (!olhar) olhar = vec(cv.olhar);
    } else if (cv.presa) {
      const o = this.obj(cv.presa);
      o.updateWorldMatrix(true, false);
      pos = o.localToWorld(vec(cv.offset));
      if (!olhar && cv.olhar) olhar = o.localToWorld(vec(cv.olhar));
      // no target: look the way the object faces (+z for objects, -z for cameras)
      if (!olhar) quat = o.getWorldQuaternion(new THREE.Quaternion()).multiply(VIRAR);
    } else {
      pos = vec(cv.pos);
      if (!olhar && cv.olhar) olhar = vec(cv.olhar);
    }
    if (!quat) quat = olhar ? olharPara(pos, olhar) : new THREE.Quaternion();
    return { pos, quat, fov, roll };
  }

  /** The THREE camera as it is now (start of the first blend, from the game's own camera). */
  private foto(): Pose {
    const c = this.camera;
    return { pos: c.position.clone(), quat: c.quaternion.clone(), fov: c.fov, roll: 0 };
  }

  /**
   * Switches to `nome`, blending for `blend` seconds (0 = cut). A rail camera travels its curve during `dur` (or the
   * blend when `dur` is absent). Resolves when blend and travel are done; a skip jumps both to the end.
   */
  usar(nome: string, blend: number, e: EaseFn | NomeEase, c: CtxTempo, dur?: number): Promise<void> {
    this.cv(nome);
    const id = ++this.seq;
    const ant = this.atual;
    if (blend > 0) {
      if (ant) {
        const congelado = { ...ant };
        this.de = () => this.pose(congelado.nome, congelado.k);
      } else {
        const f = this.foto();
        this.de = () => f;
      }
      this.peso = 0;
    } else {
      this.de = null;
      this.peso = 1;
    }
    const trilho = this.curvas.has(nome);
    const atual = { nome, k: trilho ? 0 : 1 };
    this.atual = atual;
    const espera: Promise<void>[] = [];
    if (blend > 0) espera.push(animar(c, blend, e, (k) => { if (id === this.seq) this.peso = k; }));
    if (trilho) espera.push(animar(c, dur ?? blend, e, (k) => { if (id === this.seq) atual.k = k; }));
    this.aplicar();
    return Promise.all(espera).then(() => {
      if (id === this.seq) { this.de = null; this.aplicar(); }
    });
  }

  /** Final state of `usar(nome)` right now: no blend, rail at its end. */
  fixar(nome: string) {
    this.cv(nome);
    this.seq++;
    this.atual = { nome, k: 1 };
    this.de = null;
    this.peso = 1;
    this.aplicar();
  }

  /** Shake: noise offset of `forca` that decays to zero over `dur` seconds (forca 0 stops it). */
  tremor(forca: number, dur: number) {
    this.tremorForca = forca;
    this.tremorDur = Math.max(dur, 1e-3);
    this.tremorT = 0;
  }

  /** Call every frame (after the scene clock advanced). */
  update(dt: number) {
    this.tempo += dt;
    if (this.tremorForca > 0) {
      this.tremorT += dt;
      if (this.tremorT >= this.tremorDur) this.tremorForca = 0;
    }
    this.aplicar();
  }

  /** Current shake amplitude (0 when still). */
  get amplitudeTremor() {
    if (this.tremorForca <= 0) return 0;
    const r = 1 - this.tremorT / this.tremorDur;
    return this.tremorForca * r * r * this.escalaTremor;
  }

  private aplicar() {
    if (!this.ativo || !this.atual) return;
    const b = this.pose(this.atual.nome, this.atual.k);
    let { pos, quat, fov, roll } = b;
    if (this.de && this.peso < 1) {
      const a = this.de();
      pos = a.pos.lerp(b.pos, this.peso);
      quat = a.quat.slerp(b.quat, this.peso);
      fov = lerp(a.fov, b.fov, this.peso);
      roll = lerp(a.roll, b.roll, this.peso);
    }
    const cam = this.camera;
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    const amp = this.amplitudeTremor;
    if (amp > 0) {
      const t = this.tempo;
      // sum of incommensurate sines: cheap, deterministic noise
      _v.set(
        Math.sin(t * 37.1) + 0.5 * Math.sin(t * 61.7 + 1.3),
        Math.sin(t * 41.3 + 2.1) + 0.5 * Math.sin(t * 73.9),
        0,
      ).multiplyScalar(0.08 * amp).applyQuaternion(quat);
      cam.position.add(_v);
      roll += amp * 1.5 * Math.sin(t * 29.3 + 0.7);
    }
    if (roll) cam.quaternion.multiply(_q.setFromAxisAngle(Z, THREE.MathUtils.degToRad(roll)));
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
