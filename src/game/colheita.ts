/**
 * Things to pick around the world (fruit on trees, mushrooms, eggs) as data, no THREE: each point has an item, a
 * position and whether it is there. `pos` is the picker's feet; the reach is horizontal (`alcanceM`) plus a vertical
 * window (`alcanceAcima` above the feet, `alcanceAbaixo` below). A picked one comes back after its `regrow` seconds and
 * grows for `crescerS` before it can be picked again. The game draws the points (and redraws when `versao` changes).
 *
 * Things can also be knocked off (`derrubar`, the wind on a fruit tree): the point leaves its spot as a `solta` that
 * falls (gravity, drifting and slowing sideways, one bounce, over the `chao` the game gives), then lies on the ground,
 * pickable there (before any one still hanging), until it is picked or its `regrow`, counted from the knock, brings it
 * back to its spot. A game without knocks never sees a `solta`.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A thing knocked off its spot: where it is now, its velocity (m/s) while it falls, and whether it lies on the ground. */
export interface Solta {
  posicao: Vec3;
  vel: Vec3;
  quicou: boolean;
  noChao: boolean;
}

/** One thing to pick: where it hangs or lies, and whether it is there. */
export interface PontoDeColheita<I extends string = string> {
  item: I;
  posicao: Vec3;
  /** Seconds since it was picked; null while it is there. */
  colhidaHa: number | null;
  /** 0..1 while growing back (pickable only at 1). */
  cresceu: number;
  /** Seconds to come back after picked; the `Colheita`'s `regrow` when absent. */
  regrow?: number;
  /** Switched off by `limitar` (the world gives fewer now): not pickable, not counted, drawn at scale 0. Absent = on. */
  ativo?: boolean;
  /** Knocked off (`derrubar`): falling or on the ground, away from `posicao` (its `colhidaHa` runs from the knock). */
  solta?: Solta;
}

/** Default reach above the feet (m): fruit hangs 2-4 m up. */
export const ALCANCE_ACIMA = 4.5;
/** Default reach below the feet (m): a mushroom on a slope. */
export const ALCANCE_ABAIXO = 1.5;
/** Default seconds a picked thing takes to grow back to full size after its `regrow`. */
export const CRESCER_S = 2;
/**
 * How a knocked thing falls: gravity (m/s²), the share of speed kept by its one bounce, the sideways drag (1/s), and the
 * longest step of the fall (s), so a bounce is never skipped in a long frame.
 */
export const QUEDA = { g: 9.8, restituicao: 0.35, arrasto: 0.6, passo: 1 / 120 };

/** Is `p` inside the cone with apex `origem`, axis `dir` (any length), half-angle `anguloRad` and length `alcance`? */
export function dentroDoCone(p: Vec3, origem: Vec3, dir: Vec3, anguloRad: number, alcance: number): boolean {
  const vx = p.x - origem.x, vy = p.y - origem.y, vz = p.z - origem.z;
  const d = Math.hypot(vx, vy, vz);
  if (d > alcance) return false;
  if (d === 0) return true;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len === 0) return false;
  return (vx * dir.x + vy * dir.y + vz * dir.z) / (d * len) >= Math.cos(anguloRad);
}

/** Vertical state of a falling thing. */
export interface Queda {
  y: number;
  vy: number;
  quicou: boolean;
}

/**
 * One gravity step for a falling thing over ground at height `chao` (already including its radius). The first hit
 * bounces back at `restituicao` of the speed, the second one (or a slow first one) stops it. Returns true once it rests
 * on the ground (`q.y === chao`, `q.vy === 0`).
 */
export function passoQueda(q: Queda, chao: number, dt: number, g = QUEDA.g, restituicao = QUEDA.restituicao): boolean {
  q.vy -= g * dt;
  q.y += q.vy * dt;
  if (q.y > chao) return false;
  q.y = chao;
  if (!q.quicou && -q.vy > 1) {
    q.vy = -q.vy * restituicao;
    q.quicou = true;
    return false;
  }
  q.vy = 0;
  return true;
}

export interface OpcoesColheita<I extends string = string> {
  /** Seconds to come back after picked (default 120); mutable later through `colheita.regrow`. */
  regrow?: number;
  /** Per item, when not `regrow` (the default of `add`). */
  regrowPorItem?: Partial<Record<I, number>>;
  alcanceAcima?: number;
  alcanceAbaixo?: number;
  crescerS?: number;
  /** Where a knocked thing rests at (x, z): the ground's height plus its radius (default 0). Only `derrubar` uses it. */
  chao?: (x: number, z: number) => number;
}

export type ContagemColheita<I extends string> = Record<I, { total: number; prontas: number }>;

export class Colheita<I extends string = string> {
  readonly pontos: PontoDeColheita<I>[] = [];
  /** Bumped whenever something appears or disappears (the meshes redraw on change). */
  versao = 0;
  regrow: number;
  readonly regrowPorItem: Partial<Record<I, number>>;
  readonly alcanceAcima: number;
  readonly alcanceAbaixo: number;
  readonly crescerS: number;
  readonly chao: (x: number, z: number) => number;

  /** `new Colheita(120)` (just the regrow) or `new Colheita({ regrow, regrowPorItem, ... })`. */
  constructor(o: number | OpcoesColheita<I> = {}) {
    const op: OpcoesColheita<I> = typeof o === "number" ? { regrow: o } : o;
    this.regrow = op.regrow ?? 120;
    this.regrowPorItem = op.regrowPorItem ?? {};
    this.alcanceAcima = op.alcanceAcima ?? ALCANCE_ACIMA;
    this.alcanceAbaixo = op.alcanceAbaixo ?? ALCANCE_ABAIXO;
    this.crescerS = op.crescerS ?? CRESCER_S;
    this.chao = op.chao ?? (() => 0);
  }

  /** Adds a point; `regrow` defaults to the item's own (`regrowPorItem`), else the `Colheita`'s. Returns its index. */
  add(item: I, posicao: Vec3, regrow: number | undefined = this.regrowPorItem[item]) {
    this.pontos.push({ item, posicao, colhidaHa: null, cresceu: 1, ...(regrow !== undefined && { regrow }) });
    return this.pontos.length - 1;
  }

  /** Where a point can be picked now: lying on the ground (knocked off), or ripe on its spot; else null. */
  private ondeColher(p: PontoDeColheita<I>) {
    if (p.ativo === false) return null;
    if (p.solta) return p.solta.noChao ? p.solta.posicao : null;
    return p.colhidaHa === null && p.cresceu >= 1 ? p.posicao : null;
  }

  /** Index of the nearest one within reach (one lying on the ground before any ripe one on its spot), or -1. */
  indice(pos: Vec3, alcanceM: number) {
    let best = -1, bestD = alcanceM, chao = -1, chaoD = alcanceM;
    this.pontos.forEach((p, i) => {
      const onde = this.ondeColher(p);
      if (!onde) return;
      const dy = onde.y - pos.y;
      if (dy > this.alcanceAcima || dy < -this.alcanceAbaixo) return;
      const d = Math.hypot(onde.x - pos.x, onde.z - pos.z);
      if (p.solta) { if (d <= chaoD) { chao = i; chaoD = d; } } else if (d <= bestD) { best = i; bestD = d; }
    });
    return chao >= 0 ? chao : best;
  }

  colhivel(pos: Vec3, alcanceM: number): { item: I; posicao: Vec3 } | null {
    const i = this.indice(pos, alcanceM);
    return i < 0 ? null : { item: this.pontos[i].item, posicao: this.ondeColher(this.pontos[i])! };
  }

  colher(pos: Vec3, alcanceM: number): I | null {
    const i = this.indice(pos, alcanceM);
    if (i < 0) return null;
    const p = this.pontos[i];
    if (p.solta) delete p.solta; // from the ground: its clock keeps running from the knock
    else { p.colhidaHa = 0; p.cresceu = 0; }
    this.versao++;
    return p.item;
  }

  /**
   * Knocks point `i` off its spot with velocity `vel` (m/s): it falls from where it hangs and then lies on the ground.
   * Only one that is there (on, not picked, not knocked already; ripe or not, the game decides). True if it fell.
   */
  derrubar(i: number, vel: Vec3) {
    const p = this.pontos[i];
    if (!p || p.ativo === false || p.colhidaHa !== null || p.solta) return false;
    p.solta = { posicao: { ...p.posicao }, vel: { ...vel }, quicou: false, noChao: false };
    p.colhidaHa = 0;
    p.cresceu = 0;
    this.versao++;
    return true;
  }

  update(dt: number) {
    for (const p of this.pontos) {
      if (p.ativo === false) continue;
      if (p.colhidaHa !== null) {
        p.colhidaHa += dt;
        if (p.colhidaHa >= (p.regrow ?? this.regrow)) { p.colhidaHa = null; p.cresceu = 0; delete p.solta; this.versao++; }
        else if (p.solta && !p.solta.noChao) this.cair(p.solta, dt);
      } else if (p.cresceu < 1) {
        p.cresceu = Math.min(1, p.cresceu + dt / this.crescerS);
        this.versao++;
      }
    }
  }

  /** Drift sideways (slowing down) and fall, in steps of at most `QUEDA.passo`, until it rests on `chao`. */
  private cair(s: Solta, dt: number) {
    const passos = Math.ceil(dt / QUEDA.passo);
    const h = dt / passos, q: Queda = { y: s.posicao.y, vy: s.vel.y, quicou: s.quicou };
    for (let i = 0; i < passos; i++) {
      s.posicao.x += s.vel.x * h;
      s.posicao.z += s.vel.z * h;
      const k = Math.exp(-QUEDA.arrasto * h);
      s.vel.x *= k;
      s.vel.z *= k;
      if (passoQueda(q, this.chao(s.posicao.x, s.posicao.z), h)) {
        s.noChao = true;
        s.vel.x = s.vel.y = s.vel.z = 0;
        break;
      }
    }
    s.posicao.y = q.y;
    s.quicou = q.quicou;
    if (!s.noChao) s.vel.y = q.vy;
  }

  /**
   * Only the first `n` points of `item` stay on; the rest are switched off (the hen house gives 2 eggs, 0 while the hens
   * are hungry, 3 after the quest). A point switched back on comes back ripe. Bumps `versao` when anything changes.
   */
  limitar(item: I, n: number) {
    let k = 0;
    for (const p of this.pontos) {
      if (p.item !== item) continue;
      const ligar = k++ < n;
      if (ligar === (p.ativo !== false)) continue;
      if (ligar) { delete p.ativo; delete p.solta; p.colhidaHa = null; p.cresceu = 1; } else p.ativo = false;
      this.versao++;
    }
  }

  /** Total and ripe per item: of every item in `itens` (zeros included, in that order), or of the items it has. */
  contar(itens?: readonly I[]): ContagemColheita<I> {
    const chaves = itens ?? [...new Set(this.pontos.map((p) => p.item))];
    const out = Object.fromEntries(chaves.map((i) => [i, { total: 0, prontas: 0 }])) as ContagemColheita<I>;
    for (const p of this.pontos) {
      if (p.ativo === false) continue;
      const c = (out[p.item] ??= { total: 0, prontas: 0 });
      c.total++;
      if (p.colhidaHa === null && p.cresceu >= 1) c.prontas++;
    }
    return out;
  }
}
