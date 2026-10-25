import { describe, expect, it } from "vitest";
import { Colheita } from "./colheita";

/**
 * A `Colheita` used the way As Três Ilhas uses it (`regrow` 120 with slower items, picking by the feet with the default
 * vertical window, `limitar`, `contar` with every item), pinned as a snapshot before it grew things that fall: which
 * item each pick takes, the points' clocks and growth, `versao` and the counts at each checkpoint. `npx vitest run -u`
 * rewrites it (only on purpose).
 */
type Item = "maca" | "ovo" | "coco";
const r = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

function sessao() {
  const c = new Colheita<Item>({ regrow: 120, regrowPorItem: { ovo: 240 } });
  const pts: [Item, number, number, number][] = [["maca", 0, 3, 0], ["maca", 1.5, 2.2, 0.5], ["maca", 3, 4.8, 0], ["ovo", 10, 0.2, 0], ["ovo", 11, 0.2, 0], ["coco", 20, 5.5, 1], ["coco", 21, -1, 0]];
  for (const [i, x, y, z] of pts) c.add(i, { x, y, z });
  c.add("coco", { x: 22, y: 0, z: 0 }, 30);
  const out: unknown[] = [];
  const ponto = (rotulo: string, extra: Record<string, unknown> = {}) => out.push({
    rotulo, versao: c.versao, ...extra, contar: c.contar(["maca", "ovo", "coco"]),
    pontos: c.pontos.map((p) => [p.colhidaHa === null ? "-" : r(p.colhidaHa), r(p.cresceu), p.ativo ?? true].join(" ")),
  });
  const rodar = (seg: number, dt: number) => { for (let t = 0; t < seg - 1e-9; t += dt) c.update(dt); };
  ponto("início");
  const pe = { x: 1, y: 0, z: 0 };
  ponto("colhe 4 maçãs", { colheu: [c.colher(pe, 3), c.colher(pe, 3), c.colher(pe, 3), c.colher(pe, 3)] });
  ponto("cocos", { colheu: [c.colher({ x: 20, y: 0, z: 1 }, 2), c.colher({ x: 21, y: 0, z: 0 }, 2), c.colher({ x: 22, y: 0, z: 0 }, 2)] });
  c.limitar("ovo", 1);
  ponto("limitar ovo 1", { colheu: [c.colher({ x: 10.5, y: 0, z: 0 }, 2), c.colher({ x: 10.5, y: 0, z: 0 }, 2)] });
  rodar(31, 0.5);
  ponto("31 s");
  rodar(90, 0.25);
  ponto("121 s");
  rodar(1, 1 / 60);
  ponto("122 s, crescendo", { colhivel: c.colhivel(pe, 3) });
  rodar(2, 1 / 60);
  ponto("124 s", { colhivel: c.colhivel(pe, 3) });
  c.limitar("ovo", 2);
  c.regrow = 5;
  ponto("limitar ovo 2, regrow 5", { colheu: c.colher({ x: 10.5, y: 0, z: 0 }, 2) });
  rodar(250, 1);
  ponto("374 s");
  return out;
}

describe("Colheita golden (As Três Ilhas' use)", () => {
  it("picks, regrows and limits as pinned", () => {
    expect(sessao()).toMatchSnapshot();
  });
});
