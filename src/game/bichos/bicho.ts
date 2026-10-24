import * as THREE from "three";
import { clamp, damp, mulberry32 } from "../../core/math";
import type { Collider } from "../../core/types";
import type { WorldMap } from "../../world/map";
import type { Especie, Regiao } from "./especies";
import { criarModelo, type Modelo, type TipoModelo } from "./modelos";
import { Fsm, type V2, arrive, clampLength, dampAngle, flee, headingVelocity, seek, separation, stayInside, steer, v2, wander } from "../steering";
import { SEGUIDOR_PADRAO, Seguidor } from "../seguidor";
import { LOBO, Matilha, Teste } from "./lobo";

export type EstadoBicho = "pastando" | "andando" | "fugindo" | "rondando" | "testando" | "voando" | "pulando" | "seguindo" | "sumindo";

/** Tuning shared by every animal (the manager exposes it in lil-gui). Per-species numbers live in bichos.yaml. */
export const BICHO_PARAMS = {
  /** The wolf pack's test and bite (lobo.ts). */
  lobo: LOBO,
  /** Seconds an animal keeps fleeing after the protagonist is out of its `foge` range. */
  calma: 3,
  /** Wolves start circling the protagonist within this horizontal distance (m)... */
  rondaRaio: 60,
  /** ...while they are less than this high over the ground (m). */
  rondaAltura: 40,
  /** Seconds a power keeps the scared animals running. */
  sustoTempo: 8,
  /** Neighbours of the same group push each other apart within this many body lengths. */
  separacao: 2.2,
  /** Ground animals: how fast they change velocity (m/s²). */
  aceleracao: 8,
  /** Birds: wing beats (rad/s of the flap sine). */
  bateAsa: 11,
  /** Fish: seconds between jumps (min, max). */
  puloMin: 2,
  puloMax: 6,
};
export type BichoParams = typeof BICHO_PARAMS;

/** The one the animals react to (the game's player character, or its mount), by value: feet position (m) and speed (m/s). */
export interface Protagonista {
  x: number; y: number; z: number; grounded: boolean; speed: number;
  /** Body length or height (m): the pack measures its test in these. Default `Bichos` option `corpo`. */
  corpo?: number;
}

export interface Contexto {
  protagonista: Protagonista;
  /** The protagonist's position as a vector (the manager copies it each frame). */
  posicao: THREE.Vector3;
  /** The protagonist's height over the ground under them (m), and their body (m): the wolves measure in bodies. */
  alturaSobreChao: number;
  corpo: number;
  time: number;
  params: BichoParams;
  map: WorldMap;
  /** Keeps the ground animals out of solid scenery (houses, trees), when the game gives one. */
  colisor?: Collider;
  onSplash?: (pos: THREE.Vector3) => void;
  /** The testing wolf stayed three seconds within a body of the protagonist and bit. */
  onMordeu?: (lobo: Bicho) => void;
}

// scratch (no allocations in the per-frame loop)
const W = v2(), S = v2(), B = v2(), T = v2(), C = v2();
const splash = new THREE.Vector3(), esfera = new THREE.Vector3();

/**
 * One animal: steering over the ground (or a flight circle / a jump arc), a tiny FSM, procedural legs and wings.
 * `position` is in world space with the feet on `heightAt` (birds: body centre in the air; fish: under the water
 * until they jump). It never leaves its region radius for long (steered back) and never walks into the water.
 */
export class Bicho {
  readonly nome: string;
  readonly item: string | null;
  readonly group: THREE.Group;
  readonly position = new THREE.Vector3();
  /** Main colour (the sparkles when it is hunted). */
  readonly cor: THREE.Color;
  heading = 0;
  estado: EstadoBicho;
  /** The herd / pack / flock it belongs to (set by the manager); [0] leads a wolf pack. */
  bando: Bicho[] = [];
  /** Wolves only: what the pack shares (next test, keeping away), and this wolf's own test while it runs. */
  matilha: Matilha | null = null;
  teste: Teste | null = null;
  sumido = false;
  /** Time at which a hunted animal comes back. */
  voltaEm = 0;
  readonly rand: () => number;

  private modelo: Modelo;
  private fsm: Fsm<EstadoBicho>;
  private vel = v2();
  private rumo = 0;
  private phase = 0;
  private pitch = 0;
  private ameaca = v2();
  private ameacaAte = -1;
  private susto = false;
  private bandoPos: V2[] = [];
  private skip = (i: number) => this.bando[i].sumido;
  // birds
  private ang = 0;
  private raioVoo = 20;
  private alt = 40;
  private altAtual = 40;
  private dir = 1;
  private chao = 0;
  // fish
  private casa = v2();
  /** `segue`: the companion it walks with (created on spawn). */
  seguidor: Seguidor | null = null;
  private pulo = { t0: 0, dur: 1, h: 1, len: 1, x: 0, z: 0, dx: 0, dz: 1, proximo: 0 };

  constructor(readonly especie: Especie, readonly regiao: Regiao, readonly indice: number, seed: number) {
    this.nome = especie.nome;
    this.item = especie.item;
    this.cor = new THREE.Color(especie.cores[0]);
    this.rand = mulberry32(seed);
    this.modelo = criarModelo(especie.id as TipoModelo, especie.cores, especie.id, especie.escala);
    this.group = this.modelo.group;
    this.group.rotation.order = "YXZ";
    const voa = especie.comportamento === "voa", pula = especie.comportamento === "pula";
    this.estado = voa ? "voando" : pula ? "andando" : "pastando";
    this.fsm = new Fsm<EstadoBicho>(this.estado);
    this.fsm.dur = 1 + this.rand() * 5;
  }

  /** Called by the manager once the group is known (`matilha` for a wolf pack). */
  setBando(bando: Bicho[], matilha: Matilha | null = null) {
    this.bando = bando;
    this.bandoPos = bando.map((b) => b.position);
    this.matilha = matilha;
  }

  /** This wolf walks up to test the protagonist (the manager picks who and when; lobo.ts says how it ends). */
  testar(params = this.matilha ? LOBO : LOBO) {
    if (!this.matilha) return;
    this.teste = new Teste(params);
    this.matilha.comecou(this.indice);
    this.estado = "testando";
  }

  /** The protagonist's distance in their own body lengths, as the wolf feels it: taking off puts them out of reach. */
  private distEmCorpos(ctx: Contexto) {
    const m = ctx.posicao, h = Math.hypot(m.x - this.position.x, m.z - this.position.z);
    return (h + (ctx.protagonista.grounded ? 0 : ctx.alturaSobreChao)) / ctx.corpo;
  }

  /** `segue`: start following the protagonist home. False when it was not waiting (or does not follow). */
  chamar() {
    return this.seguidor?.chamar() ?? false;
  }

  /** Place at a spawn point (x, z) on the ground (birds: around the region centre in the air; fish: under water). */
  placeAt(x: number, z: number, map: WorldMap, flockDir = this.dir) {
    this.position.set(x, map.heightAt(x, z), z);
    this.heading = this.rumo = this.rand() * Math.PI * 2;
    this.vel.x = this.vel.z = 0;
    this.ameacaAte = -1;
    const c = this.especie.comportamento;
    if (c === "voa") {
      this.chao = Math.max(map.heightAt(this.regiao.x, this.regiao.z), map.waterLevel);
      // a flock flies together: same circle (± a little), one behind the other
      this.ang = (this.regiao.x * 0.37) % (Math.PI * 2) - this.indice * 0.2 * flockDir + this.rand() * 0.08;
      this.raioVoo = 24 + this.rand() * 8;
      this.alt = this.altAtual = 36 + this.rand() * 14;
      this.dir = flockDir;
      this.estado = "voando";
      this.noVoo(0);
    } else if (c === "pula") {
      this.casa.x = x;
      this.casa.z = z;
      this.position.y = map.waterLevel - 0.6;
      this.pulo.proximo = 0;
      this.estado = "andando";
    } else {
      this.estado = "pastando";
      this.fsm.set("pastando", 1 + this.rand() * 4);
      if (c === "segue") {
        const casa = this.especie.casa ?? this.regiao;
        this.seguidor = new Seguidor({ x, z, yaw: this.heading, radius: 1 }, { x: casa.x, z: casa.z, yaw: 0, radius: casa.raio },
          { ...SEGUIDOR_PADRAO, ...this.especie.seguidor });
      }
    }
    this.group.visible = c !== "pula";
    this.apply(0);
  }

  /** A power (or anything) at `center` scares it: run away from it for `params.sustoTempo` s. */
  assustar(center: V2, time: number, params: BichoParams) {
    this.ameaca.x = center.x;
    this.ameaca.z = center.z;
    this.ameacaAte = time + params.sustoTempo;
    this.susto = true;
  }

  update(dt: number, ctx: Contexto) {
    const c = this.especie.comportamento;
    if (c === "voa") this.voar(dt, ctx);
    else if (c === "pula") this.pular(ctx);
    else if (c === "segue") this.seguir(dt, ctx);
    else this.andar(dt, ctx, c === "bando");
  }

  // ---- ground: graze/wander/flee (pasta) and the wolf pack (bando) ----

  private andar(dt: number, ctx: Contexto, bando: boolean) {
    const e = this.especie, p = ctx.params, pos = this.position, m = ctx.posicao, time = ctx.time;
    const dProt = pos.distanceTo(m);
    if (!bando && e.foge > 0 && dProt < e.foge) {
      this.ameaca.x = m.x;
      this.ameaca.z = m.z;
      this.ameacaAte = time + p.calma;
      this.susto = false;
    }
    // the pack keeps away after a bite or a claw (lobo.ts); a test the pack cancelled is over for this wolf too
    if (bando && this.matilha) {
      if (this.matilha.afastada(time)) { this.ameaca.x = m.x; this.ameaca.z = m.z; this.ameacaAte = this.matilha.afastadoAte; this.susto = true; }
      if (this.teste && this.matilha.testador !== this.indice) this.teste = null;
    }
    let vmax = e.velocidade, bound = 1;
    W.x = W.z = 0;
    if (time < this.ameacaAte) {
      this.estado = "fugindo";
      flee(pos, this.ameaca, (vmax = e.velocidadeFuga), W);
      bound = this.susto ? 2.5 : 1.3;
    } else if (bando && this.teste && this.matilha) {
      // the test: walk up to one body of the protagonist, stay, then bite or go back (the numbers and the verdict in lobo.ts)
      const fim = this.teste.update(dt, this.distEmCorpos(ctx));
      if (fim) {
        this.teste = null;
        if (fim === "mordeu") { ctx.onMordeu?.(this); this.matilha.afastar(time, this.rand); } else this.matilha.terminou(time, this.rand);
      }
      this.estado = "testando";
      arrive(pos, m, (vmax = e.velocidadeFuga * 0.7), 8, W, ctx.corpo * 0.85);
      bound = 2.5;
    } else if (bando && Math.hypot(m.x - pos.x, m.z - pos.z) < p.rondaRaio && ctx.alturaSobreChao < p.rondaAltura) {
      this.rondar(ctx);
      vmax = this.estado === "fugindo" ? e.velocidadeFuga : e.velocidade;
      bound = 1.8;
    } else if (bando && this.indice > 0 && this.bando[0]) {
      // follow the leader in a loose V behind it
      const lead = this.bando[0], k = Math.ceil(this.indice / 2), side = this.indice % 2 ? 1 : -1;
      const a = lead.heading + Math.PI + side * 0.6;
      T.x = lead.position.x + Math.sin(a) * 3.5 * k;
      T.z = lead.position.z + Math.cos(a) * 3.5 * k;
      arrive(pos, T, (vmax = e.velocidade * 1.5), 6, W, 0.8);
      this.estado = Math.hypot(this.vel.x, this.vel.z) > 0.3 ? "andando" : "pastando";
    } else {
      // graze ↔ wander (the wolf leader only wanders)
      if (this.fsm.tick(dt) || (bando && this.fsm.state === "pastando")) {
        const walk = this.fsm.state === "pastando" || bando;
        this.fsm.set(walk ? "andando" : "pastando", walk ? 4 + this.rand() * 6 : 3 + this.rand() * 6);
      }
      this.estado = this.fsm.state;
      if (this.estado === "andando") {
        this.rumo = wander(this.rumo, this.rand, 1.2, dt);
        headingVelocity(this.rumo, bando ? vmax * 0.8 : vmax, W);
        // loose herd: drift back toward the others when far from them
        C.x = this.centroX;
        C.z = this.centroZ;
        if (!bando && Math.hypot(C.x - pos.x, C.z - pos.z) > 10) {
          seek(pos, C, vmax * 0.5, T);
          W.x += T.x;
          W.z += T.z;
        }
      }
    }
    separation(pos, this.bandoPos, this.modelo.length * p.separacao, vmax * 0.7, S, this.skip);
    stayInside(pos, this.regiao, this.regiao.raio * bound, vmax, B);
    W.x += S.x + B.x;
    W.z += S.z + B.z;
    if (B.x || B.z) this.rumo = Math.atan2(W.x, W.z);
    clampLength(W, vmax * 1.1);
    steer(this.vel, W, this.estado === "fugindo" ? p.aceleracao * 2 : p.aceleracao, dt);
    this.mover(dt, ctx);
  }

  /** Wolves near the protagonist: never closer than `foge` (+ a little per wolf); stalk when they move, circle when they stop. */
  private rondar(ctx: Contexto) {
    const e = this.especie, pos = this.position, m = ctx.posicao;
    const minD = e.foge + this.indice * 2;
    let ux = pos.x - m.x, uz = pos.z - m.z;
    const d = Math.hypot(ux, uz) || 1;
    ux /= d;
    uz /= d;
    if (d < minD) {
      flee(pos, m, e.velocidadeFuga * 0.6, W);
      this.estado = "fugindo";
      return;
    }
    this.estado = "rondando";
    if (ctx.protagonista.speed > 1.5) {
      T.x = m.x + ux * (minD + 10);
      T.z = m.z + uz * (minD + 10);
      arrive(pos, T, e.velocidade * 0.6, 5, W);
    } else {
      const a = 0.35, ca = Math.cos(a), sa = Math.sin(a);
      T.x = m.x + (ux * ca - uz * sa) * (minD + 4);
      T.z = m.z + (ux * sa + uz * ca) * (minD + 4);
      arrive(pos, T, e.velocidade * 0.7, 3, W);
    }
  }

  /** Herd centre, written by the manager once per frame. */
  centroX = 0;
  centroZ = 0;

  /** Integrate the velocity, keep the feet on the ground and out of the water, animate. */
  private mover(dt: number, ctx: Contexto) {
    const map = ctx.map, pos = this.position, vel = this.vel;
    const nx = pos.x + vel.x * dt, nz = pos.z + vel.z * dt;
    const h = map.heightAt(nx, nz);
    if (h < map.waterLevel + 0.3 || Math.hypot(nx, nz) > map.size * 0.48) {
      // the shore: stop and turn back toward the middle of the region
      vel.x *= -0.3;
      vel.z *= -0.3;
      this.rumo = Math.atan2(this.regiao.x - pos.x, this.regiao.z - pos.z);
    } else {
      pos.x = nx;
      pos.z = nz;
      pos.y = h;
      // solid scenery (when the game gives a collider): pushed out sideways, feet back on the ground
      const raio = this.modelo.length * 0.4;
      if (ctx.colisor && ctx.colisor.resolve(esfera.set(pos.x, pos.y + raio, pos.z), raio) > 0) {
        pos.x = esfera.x;
        pos.z = esfera.z;
        pos.y = map.heightAt(pos.x, pos.z);
      }
    }
    this.animar(dt, map);
  }

  /** `segue`: the engine's `Seguidor` walks it (waiting → following → home); here only the feet and the gait. */
  private seguir(dt: number, ctx: Contexto) {
    const s = this.seguidor!, pos = this.position;
    s.step(dt, { x: ctx.posicao.x, z: ctx.posicao.z, speed: ctx.protagonista.speed });
    pos.set(s.x, ctx.map.heightAt(s.x, s.z), s.z);
    this.vel.x = Math.sin(s.yaw) * s.velocidade;
    this.vel.z = Math.cos(s.yaw) * s.velocidade;
    this.estado = s.estado === "seguindo" ? "seguindo" : "pastando";
    this.animar(dt, ctx.map);
  }

  /** Heading from the velocity, procedural legs, slope tilt. */
  private animar(dt: number, map: WorldMap) {
    const pos = this.position, vel = this.vel;
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.15) this.heading = dampAngle(this.heading, Math.atan2(vel.x, vel.z), 6, dt);
    // procedural gait: phase from distance travelled, longer strides when running
    const md = this.modelo, run = clamp(speed / this.especie.velocidade, 0, 3);
    this.phase += (speed * dt) / (md.stride * Math.max(1, run * 0.7)) * Math.PI * 2;
    const amp = Math.min(run, 1.5) * 0.45;
    for (let i = 0; i < md.legs.length; i++) md.legs[i].rotation.x = Math.sin(this.phase + md.gait[i]) * amp;
    // the hen's head bobs forward and back once per step (two steps per gait cycle)
    if (md.head) md.head.position.z = md.neckZ + Math.sin(this.phase * 2) * 0.025 * Math.min(run, 1);
    // body tilt with the slope along the heading (nose down = +x), a little more when grazing
    const sx = Math.sin(this.heading) * md.length * 0.5, sz = Math.cos(this.heading) * md.length * 0.5;
    const slope = -Math.atan2(map.heightAt(pos.x + sx, pos.z + sz) - map.heightAt(pos.x - sx, pos.z - sz), md.length);
    this.pitch = damp(this.pitch, slope + (this.estado === "pastando" ? 0.07 : 0), 6, dt);
    this.apply(md.hop * Math.abs(Math.sin(this.phase * 0.5)) * Math.min(run, 1));
  }

  private apply(lift: number, roll = 0) {
    this.group.position.set(this.position.x, this.position.y + lift, this.position.z);
    this.group.rotation.set(this.pitch, this.heading, roll);
  }

  // ---- birds: circles over the region centre, flapping, climbing away from the protagonist ----

  private voar(dt: number, ctx: Contexto) {
    const e = this.especie, p = ctx.params, time = ctx.time;
    if (e.foge > 0 && this.position.distanceTo(ctx.posicao) < e.foge) {
      this.ameacaAte = time + p.calma * 1.5;
      this.susto = false;
    }
    const fugindo = time < this.ameacaAte;
    this.estado = fugindo ? "fugindo" : "voando";
    const speed = fugindo ? e.velocidadeFuga : e.velocidade;
    this.ang += (this.dir * speed * dt) / this.raioVoo;
    this.altAtual = damp(this.altAtual, this.alt + (fugindo ? 25 : 0), 0.8, dt);
    this.noVoo(time);
    // flap, with glides now and then
    const md = this.modelo, glide = Math.sin(time * 0.45 + this.indice * 1.7) > 0.35 && !fugindo;
    const amp = glide ? 0.08 : 0.6, beat = Math.sin(time * p.bateAsa * (fugindo ? 1.4 : 1) + this.indice);
    md.wings[0].rotation.z = beat * amp + 0.05;
    md.wings[1].rotation.z = -beat * amp - 0.05;
    this.pitch = 0;
    this.apply(0, -this.dir * 0.35);
  }

  /** Bird position on its circle around the (slowly drifting) flock centre, and the heading along it. */
  private noVoo(time: number) {
    const r = this.regiao, seed = r.x * 0.01;
    const cx = r.x + Math.sin(time * 0.03 + seed) * r.raio * 0.3, cz = r.z + Math.cos(time * 0.027 + seed) * r.raio * 0.3;
    const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
    this.position.set(cx + ca * this.raioVoo, this.chao + this.altAtual + Math.sin(time * 0.8 + this.indice) * 1.5, cz + sa * this.raioVoo);
    this.heading = Math.atan2(-sa * this.dir, ca * this.dir);
  }

  // ---- fish: under water (invisible), then a jump in a parabola with a splash at each end ----

  /** Something (a power) makes a fish jump now (next `pular` tick), if it is in the water. */
  pularJa(time: number) {
    if (this.especie.comportamento === "pula" && this.estado !== "pulando" && !this.sumido) this.pulo.proximo = time + this.rand() * 0.4;
  }

  private pular(ctx: Contexto) {
    const map = ctx.map, time = ctx.time, j = this.pulo, p = ctx.params;
    if (this.estado !== "pulando") {
      if (time < j.proximo) return;
      const a = this.rand() * Math.PI * 2, r = this.rand() * 4;
      j.x = this.casa.x + Math.cos(a) * r;
      j.z = this.casa.z + Math.sin(a) * r;
      if (map.heightAt(j.x, j.z) > map.waterLevel - 0.4) { j.x = this.casa.x; j.z = this.casa.z; }
      const h = this.rand() * Math.PI * 2;
      j.dx = Math.sin(h);
      j.dz = Math.cos(h);
      j.dur = 0.9 + this.rand() * 0.5;
      j.h = 1.2 + this.rand() * 1.2;
      j.len = 1.2 + this.rand() * 1.2;
      j.t0 = time;
      this.heading = h;
      this.estado = "pulando";
      this.group.visible = true;
      ctx.onSplash?.(splash.set(j.x, map.waterLevel, j.z));
    }
    const u = (time - j.t0) / j.dur;
    if (u >= 1) {
      this.estado = "andando";
      this.group.visible = false;
      this.position.set(j.x + j.dx * j.len, map.waterLevel - 0.6, j.z + j.dz * j.len);
      j.proximo = time + p.puloMin + this.rand() * (p.puloMax - p.puloMin);
      ctx.onSplash?.(splash.set(this.position.x, map.waterLevel, this.position.z));
      return;
    }
    const h0 = 0.3;
    this.position.set(j.x + j.dx * j.len * u, map.waterLevel - h0 + (j.h + h0) * 4 * u * (1 - u), j.z + j.dz * j.len * u);
    const vy = ((j.h + h0) * 4 * (1 - 2 * u)) / j.dur, vh = j.len / j.dur;
    this.pitch = -Math.atan2(vy, vh);
    this.apply(0, Math.sin(time * 18) * 0.15);
  }
}
