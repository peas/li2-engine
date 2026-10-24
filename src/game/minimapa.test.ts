import { describe, expect, it } from "vitest";
import { marcosVisiveis, mundoParaImagem, mundoParaMinimapa, naBorda, recorte, sombra, ZOOM_RAIOS } from "./minimapa";

const N = Math.PI; // flight yaw convention: π faces north (−z), 0 faces south (+z), π/2 faces east (+x)
const L = Math.PI / 2;

describe("mundoParaImagem", () => {
  it("maps the island square to the image, north up", () => {
    expect(mundoParaImagem(0, 0, 2400, 480)).toEqual({ u: 240, v: 240 });
    expect(mundoParaImagem(-1200, -1200, 2400, 480)).toEqual({ u: 0, v: 0 });
    expect(mundoParaImagem(1200, 1200, 2400, 480)).toEqual({ u: 480, v: 480 });
    // east is right, north is up
    expect(mundoParaImagem(600, 0, 2400, 480).u).toBe(360);
    expect(mundoParaImagem(0, -600, 2400, 480).v).toBe(120);
  });
});

describe("mundoParaMinimapa (forward is up)", () => {
  const jogador = { x: 100, z: -50 };
  it("puts what is ahead of the camera above the centre", () => {
    // camera facing north: a point 150 m north sits straight up, at half the radius when the radius is 300 m
    const p = mundoParaMinimapa(100, -200, jogador, N, 300, 100);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-50);
    expect(p.dentro).toBe(true);
    // camera facing east: a point to the east is now up too
    const q = mundoParaMinimapa(250, -50, jogador, L, 300, 100);
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(-50);
  });
  it("puts what is to the camera's right on the right", () => {
    // facing north, east is on the right
    const p = mundoParaMinimapa(400, -50, jogador, N, 300, 100);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
    // facing south, west is on the right
    const q = mundoParaMinimapa(-200, -50, jogador, 0, 300, 100);
    expect(q.x).toBeCloseTo(100);
    expect(q.y).toBeCloseTo(0);
  });
  it("with north up (rumo = π) it is a plain map: east right, south down", () => {
    const p = mundoParaMinimapa(jogador.x + 30, jogador.z + 60, jogador, N, 300, 100);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(20);
  });
  it("scales with the zoom and flags what falls outside the disc", () => {
    const perto = mundoParaMinimapa(100, -50 - 500, jogador, N, ZOOM_RAIOS.perto, 100);
    const longe = mundoParaMinimapa(100, -50 - 500, jogador, N, ZOOM_RAIOS.longe, 100);
    expect(perto.dentro).toBe(false);
    expect(longe.dentro).toBe(true);
    expect(longe.dist).toBeCloseTo(500 / ZOOM_RAIOS.longe * 100); // 40 px at the 1250 m far zoom
    expect(perto.dist).toBeGreaterThan(100);
  });
  it("agrees with the canvas rotation (rumo + π) used to draw the crop", () => {
    // the drawn image maps the world through: rotate(rumo + π) · scale · (image − centre); the icon projection must land
    // on the same pixel, or the icons would drift off the painted places
    const rumo = 0.7, raioM = 300, R = 100, size = 2400, px = 480;
    const ponto = { x: 310, z: -120 };
    const s = (R / raioM) * (size / px);
    const ci = mundoParaImagem(jogador.x, jogador.z, size, px), pi = mundoParaImagem(ponto.x, ponto.z, size, px);
    const du = (pi.u - ci.u) * s, dv = (pi.v - ci.v) * s;
    const a = rumo + Math.PI;
    const desenhado = { x: du * Math.cos(a) - dv * Math.sin(a), y: du * Math.sin(a) + dv * Math.cos(a) };
    const proj = mundoParaMinimapa(ponto.x, ponto.z, jogador, rumo, raioM, R);
    expect(proj.x).toBeCloseTo(desenhado.x);
    expect(proj.y).toBeCloseTo(desenhado.y);
  });
});

describe("naBorda", () => {
  it("leaves points inside alone and pulls the rest onto the rim, keeping the direction", () => {
    expect(naBorda({ x: 30, y: -40 }, 100)).toEqual({ x: 30, y: -40 });
    const p = naBorda({ x: 300, y: -400 }, 100);
    expect(p.x).toBeCloseTo(60);
    expect(p.y).toBeCloseTo(-80);
  });
});

describe("recorte", () => {
  it("is the square around the centre in image pixels, and may spill past the image at the edges", () => {
    expect(recorte({ x: 0, z: 0 }, 300, 2400, 480)).toEqual({ sx: 180, sy: 180, sw: 120, sh: 120 });
    const borda = recorte({ x: -1100, z: 0 }, 1000, 2400, 480);
    expect(borda.sx).toBeLessThan(0);
    expect(borda.sw).toBe(400);
  });
});

describe("marcosVisiveis", () => {
  const marcos = [{ nome: "casa", icone: "🏠", x: 0, z: 0 }, { nome: "estábulo", icone: "🛖", x: 60, z: 0, soPerto: true }];
  it("hides the close-neighbour places when zoomed out", () => {
    expect(marcosVisiveis(marcos, "perto").map((m) => m.nome)).toEqual(["casa", "estábulo"]);
    expect(marcosVisiveis(marcos, "longe").map((m) => m.nome)).toEqual(["casa"]);
  });
});

describe("sombra", () => {
  it("brightens slopes facing the north-west light, darkens the others, flat stays 1", () => {
    expect(sombra(10, 10, 10, 10, 5)).toBe(1);
    // rises to the east and the south: the slope faces west/north → lit
    expect(sombra(0, 10, 0, 10, 5)).toBeGreaterThan(1);
    expect(sombra(10, 0, 10, 0, 5)).toBeLessThan(1);
    expect(sombra(0, 1000, 0, 1000, 5)).toBeLessThanOrEqual(1.18);
    expect(sombra(1000, 0, 1000, 0, 5)).toBeGreaterThanOrEqual(0.82);
  });
});
