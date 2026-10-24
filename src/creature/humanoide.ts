import * as THREE from "three";
import type { HeightAt } from "../core/types";

export type HairStyle = "curto" | "longo" | "coque" | "careca" | "chapeu" | "chiquinhas" | "rabo";
/** Something held in the right hand. */
export type Ferramenta = "ancinho" | "bengala" | "machado" | "cajado" | "vara";
/** Clothes over the basic shirt, with their own colour `cor`. */
export type Roupa = { tipo: "xadrez" | "macacao" | "sueter" | "capa"; cor: string };

/** How a person looks. Colours are CSS strings; `extra` is the accent (hat, apron, cap, belt, ribbons). */
export interface Look {
  /** Height (m) before `escala`. */
  height: number;
  body: string;
  legs: string;
  shoes: string;
  hair: string;
  skin: string;
  extra: string;
  hairStyle: HairStyle;
  /** Adults have a smaller head for their size. */
  adulto: boolean;
  /** A skirt over the legs (in the `legs` colour). */
  saia?: boolean;
  /** A beard in the hair colour. */
  barba?: boolean;
  /** A moustache in the hair colour. */
  bigode?: boolean;
  /** Replaces the belt. */
  roupa?: Roupa;
  ferramenta?: Ferramenta;
  /** A tall cook's hat in `extra` (over the hair). */
  chapeu?: boolean;
  /** A long apron in `extra` (replaces the belt). */
  avental?: boolean;
  /** A cap with a visor in `extra` (replaces the hair style). */
  bone?: boolean;
  /** A rounder torso. */
  redondo?: boolean;
}

export interface HumanoideOptions {
  /** Floor under the feet, for placing and for `desmontar`. */
  heightAt: HeightAt;
  x: number;
  z: number;
  /** Heading it faces when nobody is near (rad, 0 = +z). */
  yaw?: number;
  /** Drawn this much bigger than `look.height` (next to a big creature people read better a bit bigger). */
  escala?: number;
  /** Waves with the left arm while the target is within `faceRange`. */
  acena?: boolean;
}

const MAX_HEAD = THREE.MathUtils.degToRad(60);
/** Signed shortest difference between two angles. */
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Riding pose: legs forward and apart (astride), arms forward holding on. `seat` is the hips' height above the mount
 * bone (m in the world, not scaled by the person's size).
 */
const SIT = { legPitch: -1.2, legSpread: 0.45, armPitch: -1.1, armSpread: 0.15, seat: 0.9 };

type MeshFn = (geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh;

/**
 * A low-poly person built from primitives (flat Lambert, pivot at the feet, front = +z): legs and arms on pivots, a
 * head that follows a target (±60°), a body that turns slowly to it when close, an optional wave, breathing. Can ride
 * on a bone (`montar`), walk (`setMarcha`, procedural: legs and arms swing with the distance walked) and jump
 * (`setPulo`). Serves as a villager and as a placeholder player. Talk range is the game's business, in metres.
 */
export class Humanoide {
  readonly group = new THREE.Group();
  /** World position of the head (updated by `update`, `montar`, `desmontar`). */
  readonly position = new THREE.Vector3();
  /** Head pivot (turns toward the target). */
  readonly head = new THREE.Group();
  /** Hand anchors (right, left): attach things to hold. */
  readonly maos: THREE.Group[] = [];
  /** Drawn height (m): `look.height × escala`. */
  readonly height: number;
  readonly look: Look;
  readonly params = {
    /** Turns the head toward the target within this distance (m). */
    lookRange: 12,
    /** Turns the whole body toward the target within this distance (m); also the waving range. */
    faceRange: 6,
    headSpeed: 4,
    /** How fast the body turns (1/s). */
    bodySpeed: 1.2,
    /** Breathing bob (m). */
    breath: 0.02,
    /** Metres walked per full gait cycle (two steps), as a fraction of the height. */
    stride: 1.4,
    /** Leg swing at full gait (rad). */
    legSwing: 0.8,
  };
  /** Heading it turns back to when the target is away. */
  descanso: number;
  acena: boolean;
  private body = new THREE.Group();
  private waveArm: THREE.Group | null = null;
  private arms: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private armRest: THREE.Euler[] = [];
  private legH = 0;
  private headYaw = 0;
  private wave = 0;
  private phase: number;
  private headY = 0;
  private local = new THREE.Vector3();
  private riding = false;
  private homeParent: THREE.Object3D | null = null;
  private gait = 0;
  private gaitTarget = 0;
  private distancia = 0;
  private pulo = 0;

  constructor(look: Look, opts: HumanoideOptions) {
    this.look = look;
    this.height = look.height * (opts.escala ?? 1);
    this.acena = opts.acena ?? false;
    this.group.position.set(opts.x, opts.heightAt(opts.x, opts.z), opts.z);
    this.group.rotation.y = this.descanso = opts.yaw ?? 0;
    this.phase = opts.x * 0.37 + opts.z * 0.11;
    this.build();
    if (this.acena) this.waveArm = this.arms[1];
    this.armRest = this.arms.map((a) => a.rotation.clone());
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = true;
    });
    this.group.updateMatrixWorld(true);
    this.head.getWorldPosition(this.position);
  }

  /** Riding on a bone (`montar`): no turning, no bobbing. */
  get montado() {
    return this.riding;
  }

  /** Walking: `gait` 0 (still) .. 1 (running), `distancia` = total metres walked (drives the swing). */
  setMarcha(gait: number, distancia: number) {
    this.gaitTarget = THREE.MathUtils.clamp(gait, 0, 1);
    this.distancia = distancia;
  }

  /** In the air: 0 (feet down) .. 1 (legs tucked). */
  setPulo(t: number) {
    this.pulo = THREE.MathUtils.clamp(t, 0, 1);
  }

  /**
   * `alvo`: who to look at (head within `lookRange`, body within `faceRange`, back to `descanso` otherwise); `null` = the
   * game turns the body itself (the player, a walking NPC) and the head looks ahead.
   */
  update(dt: number, alvo: THREE.Vector3 | null, time: number) {
    if (this.riding) {
      this.head.getWorldPosition(this.position);
      return;
    }
    const p = this.params;
    const g = this.group.position;
    let dist = Infinity;
    if (alvo) {
      dist = Math.hypot(alvo.x - g.x, alvo.z - g.z);
      const toAlvo = Math.atan2(alvo.x - g.x, alvo.z - g.z);
      // body: slowly toward the target when it is close, back to rest otherwise
      const bodyTarget = dist < p.faceRange ? toAlvo : this.descanso;
      this.group.rotation.y += angleDiff(bodyTarget, this.group.rotation.y) * (1 - Math.exp(-p.bodySpeed * dt));
    }

    // head: toward the target within lookRange (clamped, in the body's frame), and up at it if it is above
    let yaw = 0, pitch = 0;
    if (alvo && dist < p.lookRange) {
      this.local.copy(alvo);
      this.group.worldToLocal(this.local);
      yaw = THREE.MathUtils.clamp(Math.atan2(this.local.x, this.local.z), -MAX_HEAD, MAX_HEAD);
      pitch = THREE.MathUtils.clamp(Math.atan2(this.local.y - this.headY, Math.max(dist, 1)), -0.3, 0.6);
    }
    const k = 1 - Math.exp(-p.headSpeed * dt);
    this.headYaw += (yaw - this.headYaw) * k;
    this.head.rotation.y = this.headYaw;
    this.head.rotation.x += (-pitch - this.head.rotation.x) * k;

    // gait: the swing amplitude follows the asked gait smoothly, so stopping eases back to rest
    this.gait += (this.gaitTarget - this.gait) * (1 - Math.exp(-8 * dt));
    const cycle = (this.distancia / Math.max(0.1, this.height * p.stride)) * Math.PI * 2;
    const swing = Math.sin(cycle) * p.legSwing * this.gait;
    const tuck = this.pulo;
    this.legs.forEach((leg, i) => {
      const s = i === 0 ? 1 : -1;
      leg.rotation.set(s * swing * (1 - tuck) - tuck * (i === 0 ? 0.9 : 0.4), 0, 0);
    });
    this.arms.forEach((arm, i) => {
      if (arm === this.waveArm && this.wave > 0.01) return;
      const s = i === 0 ? -1 : 1;
      const rest = this.armRest[i];
      const holding = i === 0 && !!this.look.ferramenta;
      arm.rotation.set(rest.x + s * swing * 0.8 * (holding ? 0.3 : 1), rest.y, rest.z + (i === 0 ? 1 : -1) * tuck * 0.6);
    });

    // the wave (the arm lifts, then swings) while the target is close
    if (this.waveArm) {
      this.wave += ((dist < p.faceRange ? 1 : 0) - this.wave) * (1 - Math.exp(-3 * dt));
      if (this.wave > 0.01) this.waveArm.rotation.z = -this.wave * (2.5 + Math.sin(time * 9) * 0.35);
    }

    // breathing, the walking bob and a little lean forward
    const s = Math.sin(time * 1.8 + this.phase);
    this.body.position.y = s * p.breath * (1 - this.gait) + Math.abs(Math.sin(cycle)) * this.height * 0.025 * this.gait;
    this.body.rotation.x = this.gait * 0.1;
    this.body.scale.set(1 + s * 0.012, 1, 1 + s * 0.012);
    this.head.getWorldPosition(this.position);
  }

  /**
   * Sit on a creature: reparent under `osso` (its back bone). `escala` = 1 / the bone's world scale, so the person
   * keeps their size. `offset` is the seat in the bone's local space; by default `SIT.seat` m above the bone in the
   * world's up at the moment of mounting. The rider is turned upright in the world, facing `yaw` (default: as now),
   * and then follows the bone.
   */
  montar(osso: THREE.Object3D, escala: number, offset?: THREE.Vector3, yaw = this.group.rotation.y) {
    if (!this.riding) this.homeParent = this.group.parent;
    this.riding = true;
    osso.updateWorldMatrix(true, false);
    const inv = osso.getWorldQuaternion(new THREE.Quaternion()).invert();
    osso.add(this.group);
    this.group.scale.setScalar(escala);
    this.group.quaternion.copy(inv).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    if (offset) this.group.position.copy(offset);
    else this.group.position.set(0, SIT.seat, 0).applyQuaternion(inv).multiplyScalar(escala);
    this.pose(true);
    this.group.updateMatrixWorld(true);
    this.head.getWorldPosition(this.position);
  }

  /** Get off: back under the parent it came from, standing at (x, floor, z) facing `yaw` (which becomes the rest). */
  desmontar(heightAt: HeightAt, x: number, z: number, yaw: number) {
    if (!this.riding) return;
    this.riding = false;
    if (this.homeParent) this.homeParent.add(this.group);
    else this.group.removeFromParent();
    this.homeParent = null;
    this.group.scale.setScalar(1);
    this.group.quaternion.identity();
    this.group.rotation.y = this.descanso = yaw;
    this.group.position.set(x, heightAt(x, z), z);
    this.pose(false);
    this.group.updateMatrixWorld(true);
    this.head.getWorldPosition(this.position);
  }

  /** Riding (seated: hips at the group origin) or standing (feet at the origin). */
  private pose(sitting: boolean) {
    this.body.position.y = sitting ? -this.legH : 0;
    this.body.rotation.x = 0;
    this.body.scale.set(1, 1, 1);
    this.legs.forEach((leg, i) => {
      const s = i === 0 ? -1 : 1;
      leg.rotation.set(sitting ? SIT.legPitch : 0, 0, sitting ? s * SIT.legSpread : 0);
    });
    this.arms.forEach((arm, i) => {
      const s = i === 0 ? -1 : 1;
      if (sitting) arm.rotation.set(SIT.armPitch, 0, s * SIT.armSpread);
      else arm.rotation.copy(this.armRest[i]);
    });
    this.head.rotation.set(0, 0, 0);
    this.headYaw = 0;
    this.wave = 0;
    this.gait = this.gaitTarget = this.pulo = 0;
  }

  private build() {
    const look = this.look;
    const mats = new Map<string, THREE.MeshLambertMaterial>();
    const mat = (c: string) => {
      let m = mats.get(c);
      if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })));
      return m;
    };
    const mesh: MeshFn = (geo, color, parent, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, mat(color));
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    // proportions scale with height; children have a bigger head for their size
    const h = this.height;
    const legH = (this.legH = h * 0.42), torsoH = h * 0.36;
    const headR = look.adulto ? h * 0.085 : h * 0.12;
    const torsoR = h * 0.12 * (look.redondo ? 1.35 : 1);
    this.group.add(this.body);

    // legs and feet: pivots at the hips (walking, jumping, riding)
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * h * 0.06, legH, 0);
      this.body.add(hip);
      mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.035, legH, 6), look.legs, hip, 0, -legH / 2, 0);
      const foot = mesh(new THREE.BoxGeometry(h * 0.07, h * 0.04, h * 0.13), look.shoes, hip, 0, h * 0.02 - legH, h * 0.03);
      foot.rotation.y = s * 0.1;
      this.legs.push(hip);
    }
    // torso: tapered (narrower at the shoulders)
    const torso = mesh(new THREE.CylinderGeometry(torsoR * 0.8, torsoR, torsoH, 8), look.body, this.body, 0, legH + torsoH / 2, 0);
    torso.scale.z = 0.8;
    const shoulderY = legH + torsoH * 0.92;

    // arms: pivots at the shoulders, hanging down, slightly out; a hand anchor at the end
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * torsoR * 0.95, shoulderY, 0);
      pivot.rotation.z = s * 0.12;
      this.body.add(pivot);
      const armL = h * 0.33;
      mesh(new THREE.CylinderGeometry(h * 0.03, h * 0.025, armL, 5), look.body, pivot, 0, -armL / 2, 0);
      mesh(new THREE.IcosahedronGeometry(h * 0.032, 0), look.skin, pivot, 0, -armL - h * 0.01, 0);
      const mao = new THREE.Group();
      mao.position.set(0, -h * 0.34, 0);
      pivot.add(mao);
      this.arms.push(pivot);
      this.maos.push(mao);
    }

    // head pivot on the neck
    this.headY = shoulderY + headR * 0.9;
    this.head.position.y = this.headY;
    this.body.add(this.head);
    mesh(new THREE.IcosahedronGeometry(headR, 1), look.skin, this.head, 0, headR * 0.3, 0);
    // eyes and nose so the face direction reads
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(headR * 0.13, 5, 4), "#1c140d", this.head, s * headR * 0.38, headR * 0.45, headR * 0.88);
    const nose = "#" + new THREE.Color(look.skin).multiplyScalar(0.88).getHexString();
    mesh(new THREE.SphereGeometry(headR * 0.14, 5, 4), nose, this.head, 0, headR * 0.25, headR * 1.0);

    if (look.saia) mesh(new THREE.CylinderGeometry(torsoR * 0.98, torsoR * 1.25, legH * 0.7, 8), look.legs, this.body, 0, legH * 0.65, 0).scale.z = 0.8;

    if (look.bone) this.buildCap(mesh, look, headR);
    else this.buildHair(mesh, look, headR);
    if (look.chapeu) this.buildCookHat(mesh, look, headR);
    if (look.barba) this.buildBeard(mesh, look.hair, headR);
    // a moustache
    if (look.bigode) mesh(new THREE.BoxGeometry(headR * 0.8, headR * 0.18, headR * 0.2), look.hair, this.head, 0, headR * 0.02, headR * 0.95);
    if (look.roupa) this.buildRoupa(mesh, look.roupa, h, torsoR, legH, torsoH);
    else if (look.avental) {
      const apronH = torsoH * 0.9 + legH * 0.6;
      const apron = mesh(new THREE.BoxGeometry(torsoR * 1.4, apronH, h * 0.02), look.extra, this.body, 0, legH * 0.4 + apronH / 2, torsoR * 0.82);
      apron.rotation.x = 0.04;
    }
    // a belt in the accent colour
    else mesh(new THREE.CylinderGeometry(torsoR * 1.02, torsoR * 1.02, h * 0.035, 8), look.extra, this.body, 0, legH + h * 0.02, 0).scale.z = 0.82;
    if (look.ferramenta) this.buildFerramenta(mesh, look.ferramenta, h, this.arms[0]);
  }

  private buildBeard(mesh: MeshFn, color: string, headR: number) {
    const beard = mesh(new THREE.ConeGeometry(headR * 0.7, headR * 1.4, 6), color, this.head, 0, -headR * 0.55, headR * 0.5);
    beard.rotation.x = Math.PI + 0.2;
  }

  /** Hair tufts under a cap with a visor. */
  private buildCap(mesh: MeshFn, look: Look, headR: number) {
    mesh(new THREE.SphereGeometry(headR * 1.04, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), look.hair, this.head, 0, headR * 0.25, -headR * 0.18).scale.y = 1.1;
    mesh(new THREE.SphereGeometry(headR * 1.06, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.42), look.extra, this.head, 0, headR * 0.42, 0);
    const visor = mesh(new THREE.CylinderGeometry(headR * 0.75, headR * 0.75, headR * 0.08, 8, 1, false, -Math.PI / 2, Math.PI), look.extra, this.head, 0, headR * 0.72, headR * 0.35);
    visor.scale.z = 1.2;
  }

  /** A tall cook's hat. */
  private buildCookHat(mesh: MeshFn, look: Look, headR: number) {
    mesh(new THREE.CylinderGeometry(headR * 0.95, headR * 0.9, headR * 0.5, 8), look.extra, this.head, 0, headR * 1.15, 0);
    const puff = mesh(new THREE.IcosahedronGeometry(headR * 1.1, 1), look.extra, this.head, 0, headR * 1.65, 0);
    puff.scale.y = 0.65;
  }

  /** A ring round the torso at height `y` (m from the feet), `t` thick: bands, hems and collars. */
  private ring(mesh: MeshFn, color: string, torsoR: number, y: number, t: number, grow = 1.03) {
    mesh(new THREE.CylinderGeometry(torsoR * grow, torsoR * grow, t, 8), color, this.body, 0, y, 0).scale.z = 0.82;
  }

  private buildRoupa(mesh: MeshFn, roupa: Roupa, h: number, torsoR: number, legH: number, torsoH: number) {
    const top = legH + torsoH;
    switch (roupa.tipo) {
      case "xadrez":
        // flannel: dark bands round the torso and the sleeves
        for (const f of [0.15, 0.45, 0.75]) this.ring(mesh, roupa.cor, torsoR * (1 - f * 0.2), legH + torsoH * f, h * 0.03);
        for (const arm of this.arms)
          for (const f of [0.3, 0.65]) mesh(new THREE.CylinderGeometry(h * 0.033, h * 0.033, h * 0.025, 5), roupa.cor, arm, 0, -h * 0.33 * f, 0);
        break;
      case "macacao": {
        // overalls: the trousers are already `legs`; a bib on the chest and two straps over the shoulders
        this.ring(mesh, roupa.cor, torsoR, legH + torsoH * 0.15, torsoH * 0.3);
        mesh(new THREE.BoxGeometry(torsoR * 1.1, torsoH * 0.5, h * 0.02), roupa.cor, this.body, 0, legH + torsoH * 0.45, torsoR * 0.75);
        for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(h * 0.025, torsoH * 0.45, torsoR * 1.75), roupa.cor, this.body, s * torsoR * 0.45, legH + torsoH * 0.78, 0);
        break;
      }
      case "sueter":
        // a knitted collar and hem
        this.ring(mesh, roupa.cor, torsoR, legH + h * 0.02, h * 0.04);
        this.ring(mesh, roupa.cor, torsoR * 0.75, top - h * 0.01, h * 0.04, 1.05);
        break;
      case "capa": {
        // a shawl round the shoulders and a cape down the back to the knees
        this.ring(mesh, roupa.cor, torsoR * 0.85, top - torsoH * 0.12, torsoH * 0.25, 1.15);
        const capeH = torsoH * 0.9 + legH * 0.5;
        const cape = mesh(new THREE.BoxGeometry(torsoR * 2, capeH, h * 0.025), roupa.cor, this.body, 0, top - capeH / 2, -torsoR * 0.85);
        cape.rotation.x = -0.06;
        break;
      }
    }
  }

  /**
   * A tool in the hand of `arm`: a group at the hand, turned back upright in the body's frame, so each tool is built
   * standing (y up, front +z) with the hand at the origin.
   */
  private buildFerramenta(mesh: MeshFn, tool: Ferramenta, h: number, arm: THREE.Group) {
    arm.rotation.x = tool === "machado" ? -0.25 : tool === "vara" ? -0.7 : -0.45;
    const g = new THREE.Group();
    g.position.set(0, -h * 0.34, 0);
    g.rotation.set(-arm.rotation.x, 0, -arm.rotation.z);
    arm.add(g);
    const wood = "#7a5230", metal = "#9aa0a6";
    const handY = h * 0.42; // the hand's height above the feet, roughly
    const stick = (len: number, y0: number, r = h * 0.014) => mesh(new THREE.CylinderGeometry(r, r, len, 5), wood, g, 0, y0 + len / 2, 0);
    switch (tool) {
      case "bengala": {
        // a cane to the ground with a hooked top
        stick(handY + h * 0.06, -handY);
        const hook = mesh(new THREE.TorusGeometry(h * 0.035, h * 0.013, 4, 8, Math.PI), wood, g, 0, h * 0.06, h * 0.035);
        hook.rotation.y = Math.PI / 2;
        break;
      }
      case "cajado": {
        // a tall staff with a crook above the head
        const len = h * 1.1;
        stick(len, -handY);
        const crook = mesh(new THREE.TorusGeometry(h * 0.07, h * 0.014, 4, 10, Math.PI * 1.3), wood, g, 0, len - handY + h * 0.06, h * 0.07);
        crook.rotation.y = Math.PI / 2;
        break;
      }
      case "ancinho": {
        // a rake standing on its handle, the head with its teeth up high
        const len = h * 1.05;
        stick(len, -handY);
        const top = len - handY;
        mesh(new THREE.BoxGeometry(h * 0.28, h * 0.025, h * 0.025), wood, g, 0, top, 0);
        for (let k = -2; k <= 2; k++) mesh(new THREE.BoxGeometry(h * 0.012, h * 0.06, h * 0.012), metal, g, k * h * 0.06, top + h * 0.035, 0);
        break;
      }
      case "machado": {
        // a small axe hanging from the hand, the head at the bottom pointing forward
        stick(h * 0.3, -h * 0.26, h * 0.016);
        mesh(new THREE.BoxGeometry(h * 0.02, h * 0.08, h * 0.1), metal, g, 0, -h * 0.22, h * 0.05);
        break;
      }
      case "vara": {
        // a fishing rod leaning forward and up, with a line hanging from the tip
        const rod = new THREE.Group();
        rod.rotation.x = 1.35 + arm.rotation.x;
        g.add(rod);
        const rodL = h * 1.6;
        mesh(new THREE.CylinderGeometry(h * 0.008, h * 0.016, rodL, 5), wood, rod, 0, rodL * 0.4, 0);
        mesh(new THREE.CylinderGeometry(h * 0.025, h * 0.025, h * 0.05, 6), "#555555", rod, 0, h * 0.05, h * 0.03);
        const tip = new THREE.Group();
        tip.position.y = rodL * 0.9;
        rod.add(tip);
        const line = mesh(new THREE.CylinderGeometry(h * 0.003, h * 0.003, h * 0.5, 3), "#eeeeee", tip, 0, 0, 0);
        // the line hangs straight down: undo the rod tilt (the arm's is already undone by `g`)
        line.rotation.x = -rod.rotation.x;
        line.position.set(0, -Math.cos(line.rotation.x) * h * 0.25, -Math.sin(line.rotation.x) * h * 0.25);
        mesh(new THREE.IcosahedronGeometry(h * 0.02, 0), "#e0362c", tip, 0, line.position.y * 2, line.position.z * 2);
        break;
      }
    }
  }

  /** Hair by style. */
  private buildHair(mesh: MeshFn, look: Look, headR: number) {
    const cap = () => {
      const c = mesh(new THREE.SphereGeometry(headR * 1.05, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), look.hair, this.head, 0, headR * 0.27, -headR * 0.15);
      c.scale.y = 1.1;
    };
    switch (look.hairStyle) {
      case "curto":
        cap();
        break;
      case "longo": {
        cap();
        // hair down the back to the shoulders, and a fringe at each side
        mesh(new THREE.BoxGeometry(headR * 1.8, headR * 2.2, headR * 0.6), look.hair, this.head, 0, -headR * 0.35, -headR * 0.7);
        for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(headR * 0.35, headR * 1.5, headR * 0.6), look.hair, this.head, s * headR * 0.9, -headR * 0.1, -headR * 0.1);
        break;
      }
      case "coque":
        cap();
        mesh(new THREE.IcosahedronGeometry(headR * 0.5, 0), look.hair, this.head, 0, headR * 1.1, -headR * 0.55);
        break;
      case "careca":
        // only a little hair over the ears
        for (const s of [-1, 1]) mesh(new THREE.IcosahedronGeometry(headR * 0.35, 0), look.hair, this.head, s * headR * 0.85, headR * 0.25, -headR * 0.35).scale.set(0.6, 0.8, 1.2);
        break;
      case "chiquinhas":
        // two bunches at the sides tied with a ribbon in the accent colour
        cap();
        for (const s of [-1, 1]) {
          mesh(new THREE.IcosahedronGeometry(headR * 0.4, 0), look.hair, this.head, s * headR * 1.15, headR * 0.35, -headR * 0.2).scale.set(0.8, 1.3, 0.8);
          mesh(new THREE.IcosahedronGeometry(headR * 0.17, 0), look.extra, this.head, s * headR * 0.95, headR * 0.6, -headR * 0.2);
        }
        break;
      case "rabo":
        // hair tied back in a ponytail
        cap();
        mesh(new THREE.IcosahedronGeometry(headR * 0.3, 0), look.hair, this.head, 0, headR * 0.5, -headR * 1.0);
        mesh(new THREE.ConeGeometry(headR * 0.28, headR * 1.3, 5), look.hair, this.head, 0, -headR * 0.2, -headR * 1.15).rotation.x = Math.PI + 0.25;
        break;
      case "chapeu":
        // a wide hat in the accent colour
        cap();
        mesh(new THREE.CylinderGeometry(headR * 1.6, headR * 1.6, headR * 0.1, 10), look.extra, this.head, 0, headR * 1.0, 0);
        mesh(new THREE.CylinderGeometry(headR * 0.85, headR * 0.95, headR * 0.6, 8), look.extra, this.head, 0, headR * 1.3, 0);
        break;
    }
  }
}
