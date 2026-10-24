import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Contextos } from "../core/contextos";
import { Cutscenes, animar, type Cena, type FalaCena } from "./index";

// The opening of As Três Ilhas as written in the research (cutscenes-threejs.md §6): the engine must accept it as is.
const ABERTURA = `
id: abertura
pulavel: segurar          # segurar | toque | nao
cameras:                  # câmeras virtuais (Cinemachine): corte = blend 0
  mar_largo: { pos: [-60, 18, 90], alvo: barco, fov: 45 }
  trilho_vela: { trilho: [[-40, 6, 60], [-12, 9, 28], [8, 14, 6]], alvo: barco, fov: 55 }
  conves: { presa: barco, offset: [0, 3, -6], olhar: [0, 1.5, 4], fov: 60 }
  onda_baixo: { pos: [25, 1, 35], alvo: tsunami, fov: 72 }
  agua_pov: { presa: menina, offset: [0, 0.4, 0], olhar: [0, 0.3, 5], fov: 75 }
  teto: { pos: [0, 0.9, 0], olhar: [0, 3, 0.2], roll: 12, fov: 70 }
  sentada: { pos: [0, 1.4, 0.2], olhar: [0, 1.2, 3], fov: 65 }
  maos: { pos: [0, 1.4, 0.2], olhar: [0, 0.5, 0.9], fov: 65 }
  quarto: { pos: [2.6, 1.7, 2.6], alvo: cama, fov: 50 }
passos:
  - marca: barco
  - fade: { para: preto, dur: 0 }
  - letterbox: { ligar: true, dur: 0 }
  - camera: { usar: mar_largo }
  - musica: { faixa: mar-calmo, volume: 0.6, dur: 3 }
  - fade: { para: nada, dur: 2.5 }
  - junto:
      - camera: { usar: trilho_vela, blend: 8, ease: suave }   # travelling no trilho
      - animar: { alvo: amigos, clipe: acenar, laco: true }
      - mar: { intensidade: 0.1, dur: 0 }
  - camera: { usar: conves }                                    # corte
  - esperar: 2.5
  - marca: tempestade
  - junto:
      - mar: { intensidade: 0.7, dur: 6 }
      - ceu: { para: tempestade, dur: 6 }
      - chuva: { para: 1, dur: 4 }
      - musica: { faixa: tempestade, volume: 0.8, dur: 4 }
      - tremor: { forca: 0.3, dur: 6 }
  - som: { nome: trovao, atraso: 1.5, fundo: true }
  - camera: { usar: mar_largo, blend: 0 }
  - esperar: 2
  - marca: onda
  - trocar: { mostrar: tsunami }
  - junto:
      - camera: { usar: onda_baixo, blend: 0 }
      - mover: { alvo: tsunami, para: [0, 0, 10], dur: 4, ease: entra }
      - som: { nome: onda-ronco }
  - junto:
      - trocar: { esconder: barco, mostrar: barco_pedacos }
      - evento: { nome: barco-quebra }      # o código solta os pedaços com física falsa
      - som: { nome: madeira-estala }
      - tremor: { forca: 1, dur: 0.6 }
  - marca: agua
  - camera: { usar: agua_pov, blend: 0 }
  - junto:
      - animar: { alvo: menina, clipe: agarrada, laco: true }
      - mover: { alvo: amigos, para: [-30, -1.5, -40], dur: 7 }   # somem nas ondas
      - desfoque: { para: 3, dur: 7 }
  - junto:
      - som: { nome: pancada }
      - tremor: { forca: 1.5, dur: 0.25 }
      - desfoque: { para: 10, dur: 1.5 }
      - palpebras: { para: 0, dur: 1.8 }
      - musica: { volume: 0, dur: 2 }
  - fade: { para: preto, dur: 0.5 }
  - esperar: 2.5
  - marca: acordar
  - trocar: { esconder: [mar, barco_pedacos, amigos, tsunami], mostrar: casa_ilha }
  - camera: { usar: teto }
  - fade: { para: nada, dur: 0 }
  - palpebras: { roteiro: [0.3, 0.1, 0.6, 0.2, 1], dur: 4 }   # piscadas de quem acorda
  - desfoque: { para: 0, dur: 4, fundo: true }
  - esperar: 1.5
  - junto:
      - camera: { usar: sentada, blend: 0.35, ease: back-out }  # levanta de repente
      - som: { nome: respiracao-susto }
  - junto:
      - camera: { usar: maos, blend: 1.2 }
      - mover: { alvo: maos_pov, para: [0, 0.8, 0.7], dur: 1.2 }
  - esperar: 2
  - camera: { usar: quarto, blend: 0 }
  - animar: { alvo: [ilheu1, ilheu2, ilheu3], clipe: compressa }
  - musica: { faixa: ilha-tema, volume: 0.5, dur: 3, fundo: true }
  - esperar: 2.5
  - letterbox: { ligar: false, dur: 0.8 }
  - evento: { nome: abertura-fim }
`;

const IDS = ["barco", "amigos", "tsunami", "menina", "cama", "barco_pedacos", "mar", "casa_ilha", "maos_pov", "ilheu1", "ilheu2", "ilheu3"];

interface Opts { fala?: (f: FalaCena, s: AbortSignal) => Promise<void> }

function montar(o: Opts = {}) {
  const objs = new Map(IDS.map((id) => {
    const ob = new THREE.Object3D();
    ob.name = id;
    return [id, ob] as const;
  }));
  objs.get("barco")!.position.set(3, 0, -2);
  objs.get("tsunami")!.visible = false;
  objs.get("barco_pedacos")!.visible = false;
  objs.get("casa_ilha")!.visible = false;
  let t = 0;
  const eventos: { nome: string; t: number; pulado?: boolean }[] = [];
  const sons: string[] = [];
  const musicas: [string | undefined, number | undefined, number][] = [];
  const falas: FalaCena[] = [];
  const clipes: Record<string, string> = {};
  const mundo = { mar: 0, ceu: "calmo", chuva: 0 };
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const contextos = new Contextos();
  const cs = new Cutscenes({
    camera, canvas, contextos,
    obj: (id) => { const ob = objs.get(id); if (!ob) throw new Error(`sem objeto ${id}`); return ob; },
    fala: o.fala ?? (async (f) => { falas.push(f); }),
    audio: { tocar: (n) => sons.push(n), musica: (f, v, d) => musicas.push([f, v, d]) },
    animar: (alvo, clipe) => { clipes[alvo] = clipe; },
    emit: (nome, d) => eventos.push({ nome, t, pulado: d?.pulado }),
    relogio: () => t,
  });
  // the game's own step types
  cs.registrar<{ intensidade: number; dur: number }>("mar", {
    run: (p, c) => { const de = mundo.mar; return animar(c, p.dur, "linear", (k) => { mundo.mar = de + (p.intensidade - de) * k; }); },
    fim: (p) => { mundo.mar = p.intensidade; },
  });
  cs.registrar<{ para: string; dur: number }>("ceu", { run: (p) => { mundo.ceu = p.para; }, fim: (p) => { mundo.ceu = p.para; } });
  cs.registrar<{ para: number; dur: number }>("chuva", {
    run: (p, c) => { const de = mundo.chuva; return animar(c, p.dur, "linear", (k) => { mundo.chuva = de + (p.para - de) * k; }); },
    fim: (p) => { mundo.chuva = p.para; },
  });
  const quadro = async (dt = 0.1) => {
    t += dt;
    cs.update(dt);
    await new Promise((r) => setTimeout(r, 0));
  };
  /** Advances the clock until `pr` settles (or `max` seconds). */
  const ate = async <T>(pr: Promise<T>, max = 200, dt = 0.1) => {
    let feito = false;
    pr.then(() => { feito = true; });
    for (let i = 0; i < max / dt && !feito; i++) await quadro(dt);
    expect(feito).toBe(true);
    return pr;
  };
  const segundos = async (s: number, dt = 0.1) => { for (let i = 0; i < Math.round(s / dt); i++) await quadro(dt); };
  const tecla = (tipo: "keydown" | "keyup", code: string) => dispatchEvent(new KeyboardEvent(tipo, { code }));
  const foto = () => ({
    objs: Object.fromEntries([...objs].map(([id, ob]) => [id, { p: ob.position.toArray(), q: ob.quaternion.toArray(), v: ob.visible }])),
    cam: { p: camera.position.toArray(), q: camera.quaternion.toArray(), nome: cs.rig.nome },
    ui: { ...cs.ui.estado },
    mundo: { ...mundo },
    clipes: { ...clipes },
    musica: musicas.at(-1)?.slice(0, 2),
  });
  return { cs, objs, camera, contextos, eventos, sons, musicas, falas, clipes, mundo, quadro, ate, segundos, tecla, foto, agora: () => t };
}

function perto(a: unknown, b: unknown, caminho = ""): void {
  if (typeof a === "number" && typeof b === "number") {
    expect(a, caminho).toBeCloseTo(b, 4);
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    expect(Object.keys(a).sort(), caminho).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) perto((a as any)[k], (b as any)[k], `${caminho}.${k}`);
  } else expect(a, caminho).toEqual(b);
}

describe("cutscene schema", () => {
  it("accepts the opening of the research with the game's own types registered", () => {
    const { cs } = montar();
    const cena = cs.carregar(ABERTURA);
    expect(cena.id).toBe("abertura");
    expect(cena.passos.length).toBe(40);
    expect(cs.verificar(cena)).toEqual([]);
  });

  it("explains which step is wrong", () => {
    const { cs } = montar();
    expect(() => cs.carregar({ id: "x", passos: [{ esperar: 1 }, { mover: { alvo: "a", paar: [0, 0, 0] } }] }))
      .toThrow(/passos\[1\] \(mover\)/);
    expect(() => cs.carregar({ id: "x", passos: [{ camera: { usar: "nenhuma" } }] })).toThrow(/não declarada/);
  });

  it("verificar lists unknown step types and objects", () => {
    const { cs } = montar();
    const cena = cs.carregar({ id: "x", passos: [{ vento: { forca: 1 } }, { mover: { alvo: "fantasma", para: [0, 0, 0] } }] });
    expect(cs.verificar(cena)).toEqual(['passo "vento" sem handler', 'objeto "fantasma" não existe']);
  });
});

describe("cutscene player", () => {
  it("skipping applies every remaining step's end: same final state as playing it all", async () => {
    const inteira = montar();
    const cenaA = inteira.cs.carregar(ABERTURA);
    const r1 = await inteira.ate(inteira.cs.tocar(cenaA));
    expect(r1.pulada).toBe(false);
    expect(inteira.sons).toContain("pancada");
    expect(inteira.falas.map((f) => f.texto)).toEqual([]);

    const pulada = montar();
    const cenaB = pulada.cs.carregar(ABERTURA);
    const pr = pulada.cs.tocar(cenaB);
    expect(pulada.contextos.topo).toBe("cutscene");
    await pulada.segundos(0.6);
    pulada.tecla("keydown", "Escape");
    expect(pulada.cs.ui.avisoVisivel).toBe(true);
    await pulada.segundos(1.2);
    pulada.tecla("keyup", "Escape");
    const r2 = await pulada.ate(pr, 5);
    expect(r2.pulada).toBe(true);
    expect(pulada.agora()).toBeLessThan(3);
    expect(pulada.sons).toEqual([]); // no effect sounds on a skip
    expect(pulada.eventos.find((e) => e.nome === "barco-quebra")?.pulado).toBe(true);
    expect(pulada.eventos.at(-1)?.nome).toBe("cena:abertura:fim");
    expect(pulada.contextos.topo).toBe("jogo");
    expect(pulada.cs.ativa).toBe(false);

    perto(pulada.foto(), inteira.foto());
    expect(pulada.foto().cam.nome).toBe("quarto");
    expect(pulada.objs.get("casa_ilha")!.visible).toBe(true);
    expect(pulada.mundo.mar).toBe(0.7);
    expect(pulada.camera.fov).toBe(50); // restored
  }, 30_000);

  it("junto waits for all; fundo does not wait", async () => {
    const h = montar();
    const junto = h.cs.carregar({ id: "j", pulavel: "nao", passos: [
      { junto: [{ esperar: 1 }, { mover: { alvo: "barco", para: [9, 0, 0], dur: 2, ease: "linear" } }] },
      { evento: { nome: "depois-junto" } },
      { mover: { alvo: "menina", para: [0, 0, 7], dur: 3 }, fundo: true },
      { evento: { nome: "depois-fundo" } },
      { esperar: 0.5 },
    ] });
    await h.ate(h.cs.tocar(junto));
    const t1 = h.eventos.find((e) => e.nome === "depois-junto")!.t;
    const t2 = h.eventos.find((e) => e.nome === "depois-fundo")!.t;
    expect(t1).toBeGreaterThanOrEqual(2);
    expect(t1).toBeLessThan(2.3);
    expect(t2 - t1).toBeLessThan(0.15);
    // the background move was cut at the end of the scene and landed on its final value
    expect(h.objs.get("menina")!.position.toArray()).toEqual([0, 0, 7]);
  });

  it("→ skips only to the next marca and the scene goes on", async () => {
    const h = montar();
    const cena = h.cs.carregar({ id: "m", passos: [
      { marca: "a" },
      { mover: { alvo: "barco", para: [5, 0, 0], dur: 5 } },
      { som: { nome: "nao-toca" } },
      { esperar: 5 },
      { marca: "b" },
      { mover: { alvo: "menina", para: [0, 1, 0], dur: 1, ease: "linear" } },
      { som: { nome: "toca" } },
    ] });
    const pr = h.cs.tocar(cena);
    await h.segundos(0.6);
    expect(h.cs.ui.proximaVisivel).toBe(true);
    h.tecla("keydown", "ArrowRight");
    await h.segundos(0.5);
    expect(h.objs.get("barco")!.position.toArray()).toEqual([5, 0, 0]);
    const y = h.objs.get("menina")!.position.y;
    expect(y).toBeGreaterThan(0.2);
    expect(y).toBeLessThan(0.8);
    expect(h.cs.ui.proximaVisivel).toBe(false); // no marca ahead any more
    const r = await h.ate(pr, 5);
    expect(r.pulada).toBe(true);
    expect(h.sons).toEqual(["toca"]);
  });

  it("pulavel: nao ignores Esc", async () => {
    const h = montar();
    const cena = h.cs.carregar({ id: "n", pulavel: "nao", passos: [{ esperar: 3 }, { som: { nome: "fim" } }] });
    const pr = h.cs.tocar(cena);
    await h.segundos(0.6);
    h.tecla("keydown", "Escape");
    await h.segundos(1.5);
    h.tecla("keyup", "Escape");
    h.tecla("keydown", "ArrowRight");
    expect(h.cs.ui.avisoVisivel).toBe(false);
    const r = await h.ate(pr);
    expect(r.pulada).toBe(false);
    expect(h.sons).toEqual(["fim"]);
    expect(h.agora()).toBeGreaterThanOrEqual(3);
  });

  it("Esc in the first half second is ignored; a seen scene skips with one tap", async () => {
    const h = montar();
    const cena = h.cs.carregar({ id: "v", passos: [{ esperar: 10 }] });
    let pr = h.cs.tocar(cena, { jaVista: true });
    expect(h.cs.ui.avisoVisivel).toBe(true);
    h.tecla("keydown", "Escape");
    await h.segundos(0.6);
    expect(h.cs.ativa).toBe(true);
    h.tecla("keyup", "Escape");
    h.tecla("keydown", "Escape");
    expect((await h.ate(pr, 1)).pulada).toBe(true);
  });

  it("camera rig: attached camera follows its object mid-blend; rail travels during the blend", async () => {
    const h = montar();
    const cena = h.cs.carregar({ id: "c", pulavel: "nao",
      cameras: {
        larga: { pos: [0, 10, 10], alvo: "barco", fov: 40 },
        conves: { presa: "barco", offset: [0, 3, -6], olhar: [0, 1.5, 4], fov: 60, roll: 10 },
        trilho: { trilho: [[0, 0, 0], [10, 0, 0], [20, 0, 0]], alvo: "cama" },
      },
      passos: [
        { camera: { usar: "larga" } },
        { junto: [
          { camera: { usar: "conves", blend: 2, ease: "linear" } },
          { mover: { alvo: "barco", para: [100, 0, 0], dur: 0.5 } },
        ] },
        { camera: { usar: "trilho", blend: 2, ease: "linear" } },
      ] });
    const pr = h.cs.tocar(cena);
    await h.segundos(1);
    // half way through the blend, with the boat already at x = 100: the camera is between the wide shot and the deck
    expect(h.camera.position.x).toBeGreaterThan(40);
    expect(h.camera.position.x).toBeLessThan(60);
    expect(Math.abs(h.camera.fov - 50)).toBeLessThan(2.5);
    await h.segundos(1.1);
    expect(h.cs.rig.nome).toBe("trilho");
    await h.ate(pr, 5);
    expect(h.camera.position.toArray().map((v) => Math.round(v * 1000) / 1000)).toEqual([20, 0, 0]);
  });

  it("fala with bloqueia: false does not wait", async () => {
    const nunca = () => new Promise<void>(() => {});
    const h = montar({ fala: nunca });
    const cena = h.cs.carregar({ id: "f", pulavel: "toque", passos: [
      { fala: { quem: "tera", texto: "Volte antes de escurecer, tá?", bloqueia: false } },
      { evento: { nome: "andou" } },
      { fala: { quem: "tera", texto: "Esta espera." } },
      { evento: { nome: "nunca" } },
    ] });
    const pr = h.cs.tocar(cena);
    await h.segundos(2);
    expect(h.eventos.map((e) => e.nome)).toEqual(["cena:f:inicio", "andou"]);
    // the blocking line holds the scene until the player (or a skip) ends it
    h.tecla("keydown", "Escape");
    await h.ate(pr, 1);
    expect(h.eventos.find((e) => e.nome === "nunca")?.pulado).toBe(true);
  });
});
