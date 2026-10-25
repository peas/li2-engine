import { describe, expect, it } from "vitest";
import { SEGUIDOR_PADRAO, Seguidor, type Lider } from "./seguidor";

/**
 * The `Seguidor` with its default params (the lost pig of As Três Ilhas uses exactly these) through a scripted session,
 * pinned as a snapshot before the follower grew options for another game: waiting, called, the leader walking,
 * running, turning, standing, walking past it, jumping far away (it shows up behind), and bringing it home (it goes in
 * and stays). Every 0.5 s: where it is, its heading and state. `npx vitest run -u` rewrites it (only on purpose).
 */
const DT = 1 / 60;
const r = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

function sessao(params = SEGUIDOR_PADRAO) {
  const casa = { x: 40, z: -30, yaw: 0.5, radius: 4 };
  const s = new Seguidor({ x: 0, z: 0, yaw: 0, radius: 1 }, casa, params);
  const j: Lider = { x: 0, z: 3, speed: 0 };
  const quadros: unknown[] = [];
  let passo = 0;
  const andar = (seg: number, speed: number, yaw: number, rotulo: string) => {
    j.speed = speed;
    for (let i = 0; i < Math.round(seg / DT); i++) {
      j.x += Math.sin(yaw) * speed * DT;
      j.z += Math.cos(yaw) * speed * DT;
      s.step(DT, j);
      if (passo++ % 30 === 0) quadros.push([rotulo, r(s.x), r(s.z), r(s.yaw), s.estado, s.andando, r(s.velocidade), s.entrando].join(" "));
    }
  };
  andar(1, 1, 0, "esperando");
  s.chamar();
  andar(6, 1.5, 0, "anda");
  andar(5, 6, 0.4, "corre");
  andar(2, 2, 2, "vira");
  andar(3, 0, 2, "para");
  andar(4, 2, Math.PI + 0.3, "passa por ele");
  j.x += 100;
  andar(1, 0, 0, "pula longe");
  const rumo = Math.atan2(casa.x - j.x, casa.z - j.z);
  const ate = Math.hypot(casa.x - j.x, casa.z - j.z) - 8;
  andar(ate / 4, 4, rumo, "leva para casa");
  andar(6, 0, rumo, "em casa");
  andar(3, 5, 0, "vai embora");
  return quadros;
}

describe("Seguidor golden (the default params, As Três Ilhas' pig)", () => {
  it("follows, shows up behind and goes home as pinned", () => {
    expect(sessao()).toMatchSnapshot();
  });
});
