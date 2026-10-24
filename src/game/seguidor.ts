import type { Spot } from "../core/types";
import { arrive, seek, v2, type V2 } from "./steering";

/** Speeds and distances of a `Seguidor` (m, m/s, rad/s). */
export interface ParamsSeguidor {
  /** Following: it aims this far behind the leader... */
  atras: number;
  /** ...and stops when this close to the leader. */
  perto: number;
  /** Its speed: the leader's × `fator`, at least `minimo`, at most `teto`; at least `trote` while `alcancar` m or more behind. */
  fator: number;
  minimo: number;
  teto: number;
  trote: number;
  alcancar: number;
  /** `arrive` slows down inside this radius of the point behind the leader. */
  freio: number;
  /** Further than `longe` from the leader, it shows up `aparece` m behind them (it is quick). */
  longe: number;
  aparece: number;
  /** When the leader (or it) is this close to home's centre it goes straight in. */
  casa: number;
  /** Arrived when this close to home's centre. */
  chegada: number;
  /** How fast it turns to face where it goes. */
  giro: number;
}

export const SEGUIDOR_PADRAO: ParamsSeguidor = {
  atras: 1.8, perto: 1.5, fator: 1.1, minimo: 1.2, teto: 8, trote: 3, alcancar: 6, freio: 1.2, longe: 60, aparece: 6,
  casa: 10, chegada: 2, giro: 6,
};

export type EstadoSeguidor = "esperando" | "seguindo" | "chegou";

/** Where the leader is this step (feet) and how fast they go (m/s). */
export interface Lider { x: number; z: number; speed: number }

/** Wrap an angle to -π..π. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A companion that follows (no THREE: tested in node). Waiting, it stays where it is; called, it follows the leader
 * (`arrive` to a point `atras` behind them, at their pace, never on top of them; it shows up behind them when left
 * more than `longe` away); when the leader or it gets within `params.casa` of home it heads straight to its centre and
 * has arrived (within `chegada`), and stays put. `params` is read live (tune it while the game runs).
 */
export class Seguidor {
  estado: EstadoSeguidor = "esperando";
  x: number;
  z: number;
  yaw: number;
  /** True while it walks this step (a trot animation reads it); `velocidade` = m/s this step. */
  andando = false;
  velocidade = 0;
  /** Heading straight home (the leader brought it close enough). */
  entrando = false;
  /** The leader's last position and the direction they last moved in (unit xz; null until they move). */
  private dela: { x: number; z: number } | null = null;
  private rumo: { x: number; z: number } | null = null;
  private alvo = v2();
  private vel = v2();

  constructor(readonly onde: Spot, readonly casa: Spot, readonly params: ParamsSeguidor = SEGUIDOR_PADRAO) {
    this.x = onde.x;
    this.z = onde.z;
    this.yaw = onde.yaw;
  }

  /** Starts following. False when it was not waiting any more. */
  chamar() {
    if (this.estado !== "esperando") return false;
    this.estado = "seguindo";
    return true;
  }

  /** Straight home and arrived (a save where it is back already). */
  irParaCasa() {
    this.estado = "chegou";
    this.entrando = false;
    this.x = this.casa.x;
    this.z = this.casa.z;
    this.yaw = this.casa.yaw;
    this.andando = false;
    this.velocidade = 0;
  }

  /** Horizontal distance to home's centre (m). */
  faltaM() {
    return Math.hypot(this.casa.x - this.x, this.casa.z - this.z);
  }

  /** Horizontal distance to `p` (m). */
  distanciaDe(p: { x: number; z: number }) {
    return Math.hypot(p.x - this.x, p.z - this.z);
  }

  step(dt: number, lider: Lider) {
    const P = this.params;
    this.andando = false;
    this.velocidade = 0;
    this.lembrarRumo(lider);
    if (this.estado !== "seguindo" || dt <= 0) return;
    const dCasa = (p: { x: number; z: number }) => Math.hypot(p.x - this.casa.x, p.z - this.casa.z);
    // too far behind (the leader ran, or jumped somewhere): it shows up behind them before anything else
    const r = this.rumo ?? this.deLa(lider);
    let apareceu = false;
    if (!this.entrando && this.distanciaDe(lider) > P.longe) {
      this.x = lider.x - r.x * P.aparece;
      this.z = lider.z - r.z * P.aparece;
      this.yaw = Math.atan2(r.x, r.z);
      apareceu = true;
    }
    if (!this.entrando && (dCasa(lider) < P.casa || dCasa(this) < P.casa)) this.entrando = true;
    if (apareceu && !this.entrando) return;
    if (this.entrando) {
      if (this.faltaM() <= P.chegada) return this.irParaCasa();
      this.andar(seek(this, this.casa, Math.max(P.trote, lider.speed * P.fator), this.vel), dt);
      if (this.faltaM() <= P.chegada) this.irParaCasa();
      return;
    }
    // behind the leader: opposite the way they last moved (or on the line from them to it, before they have moved)
    this.alvo.x = lider.x - r.x * P.atras;
    this.alvo.z = lider.z - r.z * P.atras;
    if (this.distanciaDe(lider) <= P.perto) return;
    const atrasM = Math.hypot(this.alvo.x - this.x, this.alvo.z - this.z);
    let speed = Math.min(P.teto, Math.max(P.minimo, lider.speed * P.fator));
    if (atrasM >= P.alcancar) speed = Math.max(speed, P.trote);
    this.andar(arrive(this, this.alvo, speed, P.freio, this.vel), dt);
  }

  /** Unit xz from the leader toward it (where "behind" is before they have moved). */
  private deLa(j: { x: number; z: number }) {
    const d = this.distanciaDe(j);
    return d > 1e-6 ? { x: (j.x - this.x) / d, z: (j.z - this.z) / d } : { x: 0, z: 1 };
  }

  private lembrarRumo(j: Lider) {
    if (this.dela) {
      const dx = j.x - this.dela.x, dz = j.z - this.dela.z, d = Math.hypot(dx, dz);
      if (d > 1e-3) this.rumo = { x: dx / d, z: dz / d };
    }
    this.dela = { x: j.x, z: j.z };
  }

  /** Move by velocity `v` (m/s) for `dt`, turning toward where it goes. */
  private andar(v: V2, dt: number) {
    const sp = Math.hypot(v.x, v.z);
    if (sp < 1e-3) return;
    this.x += v.x * dt;
    this.z += v.z * dt;
    const turn = wrap(Math.atan2(v.x, v.z) - this.yaw);
    this.yaw = wrap(this.yaw + Math.sign(turn) * Math.min(Math.abs(turn), this.params.giro * dt));
    this.andando = true;
    this.velocidade = sp;
  }
}
