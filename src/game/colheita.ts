/**
 * Things to pick around the world (fruit on trees, mushrooms, eggs) as data, no THREE: each point has an item, a
 * position and whether it is there. `pos` is the picker's feet; the reach is horizontal (`alcanceM`) plus a vertical
 * window (`alcanceAcima` above the feet, `alcanceAbaixo` below). A picked one comes back after its `regrow` seconds and
 * grows for `crescerS` before it can be picked again. The game draws the points (and redraws when `versao` changes).
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
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
}

/** Default reach above the feet (m): fruit hangs 2-4 m up. */
export const ALCANCE_ACIMA = 4.5;
/** Default reach below the feet (m): a mushroom on a slope. */
export const ALCANCE_ABAIXO = 1.5;
/** Default seconds a picked thing takes to grow back to full size after its `regrow`. */
export const CRESCER_S = 2;

export interface OpcoesColheita<I extends string = string> {
  /** Seconds to come back after picked (default 120); mutable later through `colheita.regrow`. */
  regrow?: number;
  /** Per item, when not `regrow` (the default of `add`). */
  regrowPorItem?: Partial<Record<I, number>>;
  alcanceAcima?: number;
  alcanceAbaixo?: number;
  crescerS?: number;
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

  /** `new Colheita(120)` (just the regrow) or `new Colheita({ regrow, regrowPorItem, ... })`. */
  constructor(o: number | OpcoesColheita<I> = {}) {
    const op: OpcoesColheita<I> = typeof o === "number" ? { regrow: o } : o;
    this.regrow = op.regrow ?? 120;
    this.regrowPorItem = op.regrowPorItem ?? {};
    this.alcanceAcima = op.alcanceAcima ?? ALCANCE_ACIMA;
    this.alcanceAbaixo = op.alcanceAbaixo ?? ALCANCE_ABAIXO;
    this.crescerS = op.crescerS ?? CRESCER_S;
  }

  /** Adds a point; `regrow` defaults to the item's own (`regrowPorItem`), else the `Colheita`'s. Returns its index. */
  add(item: I, posicao: Vec3, regrow: number | undefined = this.regrowPorItem[item]) {
    this.pontos.push({ item, posicao, colhidaHa: null, cresceu: 1, ...(regrow !== undefined && { regrow }) });
    return this.pontos.length - 1;
  }

  /** Index of the nearest ripe one within reach, or -1. */
  indice(pos: Vec3, alcanceM: number) {
    let best = -1, bestD = alcanceM;
    this.pontos.forEach((p, i) => {
      if (p.ativo === false || p.colhidaHa !== null || p.cresceu < 1) return;
      const dy = p.posicao.y - pos.y;
      if (dy > this.alcanceAcima || dy < -this.alcanceAbaixo) return;
      const d = Math.hypot(p.posicao.x - pos.x, p.posicao.z - pos.z);
      if (d <= bestD) { best = i; bestD = d; }
    });
    return best;
  }

  colhivel(pos: Vec3, alcanceM: number): { item: I; posicao: Vec3 } | null {
    const i = this.indice(pos, alcanceM);
    return i < 0 ? null : { item: this.pontos[i].item, posicao: this.pontos[i].posicao };
  }

  colher(pos: Vec3, alcanceM: number): I | null {
    const i = this.indice(pos, alcanceM);
    if (i < 0) return null;
    const p = this.pontos[i];
    p.colhidaHa = 0;
    p.cresceu = 0;
    this.versao++;
    return p.item;
  }

  update(dt: number) {
    for (const p of this.pontos) {
      if (p.ativo === false) continue;
      if (p.colhidaHa !== null) {
        p.colhidaHa += dt;
        if (p.colhidaHa >= (p.regrow ?? this.regrow)) { p.colhidaHa = null; p.cresceu = 0; this.versao++; }
      } else if (p.cresceu < 1) {
        p.cresceu = Math.min(1, p.cresceu + dt / this.crescerS);
        this.versao++;
      }
    }
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
      if (ligar) { delete p.ativo; p.colhidaHa = null; p.cresceu = 1; } else p.ativo = false;
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
