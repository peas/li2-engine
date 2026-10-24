import { describe, expect, it } from "vitest";
import { Diretor, naJanela, type CenaMontada, type Provedores } from "./diretor";
import { CenaSchema, type Gatilho } from "./schema";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A fake scene: `tocar` resolves when the test calls `fim(pulada)`; it logs what it does. */
function cenaFalsa(id: string, log: string[], gatilho?: Gatilho, ritual: Record<string, boolean> = {}) {
  const cena = CenaSchema.parse({ id, gatilho, ritual, passos: [{ esperar: 1 }] });
  let fim: ((pulada: boolean) => void) | null = null;
  const cs = { rig: { ativo: false }, ativa: false };
  const m: CenaMontada & { fim(pulada?: boolean): void; updates: number; tocadas: number } = {
    cena, cs: cs as unknown as CenaMontada["cs"], updates: 0, tocadas: 0, faixa: `faixa-${id}`,
    tocar({ jaVista }) {
      m.tocadas++;
      log.push(`tocar:${id}:${jaVista}`);
      cs.ativa = true; cs.rig.ativo = true;
      return new Promise((ok) => { fim = (pulada) => { cs.ativa = false; cs.rig.ativo = false; ok({ pulada }); }; });
    },
    update() { m.updates++; },
    fim(pulada = false) { fim?.(pulada); },
  };
  return m;
}

function provedores(log: string[], extra: Partial<Provedores> = {}) {
  const vistas = new Set<string>();
  const estado = { quieto: true, pos: { x: 0, z: 0 }, hora: 0.5, status: {} as Record<string, string>, passo: {} as Record<string, string> };
  const ouvintes = new Map<string, Set<() => void>>();
  const p: Provedores = {
    store: { cenaVista: (id) => vistas.has(id), verCena: (id) => { vistas.add(id); log.push(`verCena:${id}`); } },
    salvar: (m) => log.push(`salvar:${m}`),
    hud: { modoCinema: (on) => log.push(`hud:${on}`) },
    camera: { snap: () => log.push("snap") },
    posicao: () => estado.pos,
    hora: () => estado.hora,
    lugares: { encontro: { x: 100, z: 0 } },
    missoes: { status: (id) => estado.status[id] ?? null, passoAtivo: (id) => (estado.passo[id] ? { tipo: estado.passo[id] } : null) },
    eventos: { on: (nome, f) => { const s = ouvintes.get(nome) ?? new Set(); ouvintes.set(nome, s); s.add(f); return () => s.delete(f); } },
    quieto: () => estado.quieto,
    ...extra,
  };
  const emit = (nome: string) => { for (const f of ouvintes.get(nome) ?? []) f(); };
  return { p, vistas, estado, emit };
}

describe("Diretor: the ritual", () => {
  it("skipped: scene state, then verCena, salvar, HUD back, events, depois, snap, in this order", async () => {
    const log: string[] = [];
    const { p } = provedores(log);
    const d = new Diretor(p);
    const c = cenaFalsa("encontro", log);
    d.on("cena:comecou", (id) => log.push(`comecou:${id}`));
    d.on("cena:terminou", (id) => log.push(`terminou:${id}`));
    d.on("cena:pulada", (id) => log.push(`pulada:${id}`));
    d.registrar("encontro", c, { antes: () => { log.push("antes"); }, depois: (r) => { log.push(`depois:${r.pulada}:${r.jaVista}`); } });
    const pr = d.tocar("encontro");
    // synchronous up to the scene: it is already running
    expect(d.rodando).toBe(true);
    expect(d.atual).toBe("encontro");
    expect(d.faixa()).toBe("faixa-encontro");
    expect(log).toEqual(["antes", "hud:true", "comecou:encontro", "tocar:encontro:false"]);
    c.fim(true);
    expect(await pr).toEqual({ pulada: true, jaVista: false });
    expect(log.slice(4)).toEqual(["verCena:encontro", "salvar:encontro", "hud:false", "terminou:encontro", "pulada:encontro", "depois:true:false", "snap"]);
    expect(d.rodando).toBe(false);
    expect(d.faixa()).toBeNull();
  });

  it("an async depois keeps cameraOcupada() while the scene's rig is active; rodando is already false", async () => {
    const log: string[] = [];
    const d = new Diretor(provedores(log).p);
    const c = cenaFalsa("intro", log);
    let soltar = () => {};
    d.registrar("intro", c, {
      depois: async () => {
        c.cs.rig.ativo = true;
        await new Promise<void>((ok) => { soltar = ok; });
        c.cs.rig.ativo = false;
      },
    });
    const pr = d.tocar("intro");
    expect(d.cameraOcupada()).toBe(true);
    c.fim();
    await tick();
    expect(d.rodando).toBe(false);
    expect(d.cameraOcupada()).toBe(true);
    d.update(0.1);
    expect(c.updates).toBe(1); // updated while its rig drives the camera
    expect(log).not.toContain("snap");
    soltar();
    await pr;
    expect(d.cameraOcupada()).toBe(false);
    expect(log.at(-1)).toBe("snap");
    d.update(0.1);
    expect(c.updates).toBe(1);
  });

  it("a ritual with every key off does none of it; a second tocar while one runs rejects", async () => {
    const log: string[] = [];
    const d = new Diretor(provedores(log).p);
    const c = cenaFalsa("x", log, undefined, { esconder_hud: false, salvar_ao_fim: false, lembrar_vista: false, snap_camera: false });
    d.registrar("x", c);
    const pr = d.tocar("x");
    await expect(d.tocar("x")).rejects.toThrow(/tocando/);
    c.fim();
    await pr;
    expect(log).toEqual(["tocar:x:false"]);
  });

  it("jaVista comes from the store; the id must be the YAML's; unknown ids throw", async () => {
    const log: string[] = [];
    const { p, vistas } = provedores(log);
    const d = new Diretor(p);
    vistas.add("a");
    const a = cenaFalsa("a", log);
    expect(() => d.registrar("b", a)).toThrow(/id "a"/);
    d.registrar("a", a);
    expect(() => d.registrar("a", a)).toThrow(/duas vezes/);
    expect(() => d.tocar("nada")).toThrow(/não registrada/);
    const pr = d.tocar("a");
    a.fim();
    expect((await pr).jaVista).toBe(true);
  });

  it("sempre: update every frame, playing or not", () => {
    const log: string[] = [];
    const d = new Diretor(provedores(log).p);
    const a = cenaFalsa("a", log), b = cenaFalsa("b", log);
    d.registrar("a", a, { sempre: true });
    d.registrar("b", b);
    d.update(0.1); d.update(0.1);
    expect([a.updates, b.updates]).toEqual([2, 0]);
  });
});

describe("Diretor: triggers", () => {
  it("inicio plays on the first update, once, even when not quiet; not when seen", async () => {
    const log: string[] = [];
    const { p, estado } = provedores(log);
    estado.quieto = false;
    const d = new Diretor(p);
    const a = cenaFalsa("intro", log, { tipo: "inicio" });
    d.registrar("intro", a);
    expect(a.tocadas).toBe(0);
    d.update(0.1);
    expect(a.tocadas).toBe(1);
    a.fim();
    await tick();
    d.update(0.1);
    expect(a.tocadas).toBe(1);

    const log2: string[] = [];
    const q = provedores(log2);
    q.vistas.add("intro");
    const d2 = new Diretor(q.p), a2 = cenaFalsa("intro", log2, { tipo: "inicio" });
    d2.registrar("intro", a2);
    d2.update(0.1);
    q.vistas.clear();
    d2.update(0.1);
    expect(a2.tocadas).toBe(0); // once: evaluated at start-up, seen, never again
  });

  it("disparar() plays it synchronously (the opening starts during the game's install)", () => {
    const log: string[] = [];
    const d = new Diretor(provedores(log).p);
    const a = cenaFalsa("intro", log, { tipo: "inicio" });
    d.registrar("intro", a);
    d.disparar();
    expect(d.rodando).toBe(true);
    expect(a.updates).toBe(0);
  });

  it("armar(false) disarms (and armar(true) re-arms)", () => {
    const log: string[] = [];
    const d = new Diretor(provedores(log).p);
    const a = cenaFalsa("intro", log, { tipo: "inicio" });
    d.registrar("intro", a);
    d.armar("intro", false);
    d.update(0.1);
    expect(a.tocadas).toBe(0);
    d.armar("intro", true);
    d.update(0.1);
    expect(a.tocadas).toBe(1);
  });

  it("missao: by status, and by the active step's tipo; only quiet, only when not seen", async () => {
    const log: string[] = [];
    const { p, estado } = provedores(log);
    const d = new Diretor(p);
    const porStatus = cenaFalsa("s", log, { tipo: "missao", missao: "m1" });
    const porPasso = cenaFalsa("encontro", log, { tipo: "missao", missao: "m2", passo: "amansar" });
    d.registrar("s", porStatus);
    d.registrar("encontro", porPasso);
    d.update(0.1);
    expect([porStatus.tocadas, porPasso.tocadas]).toEqual([0, 0]);
    estado.status.m1 = "ativa";
    estado.quieto = false;
    d.update(0.1);
    expect(porStatus.tocadas).toBe(0); // waits for quiet
    estado.quieto = true;
    d.update(0.1);
    expect(porStatus.tocadas).toBe(1);
    estado.passo.m2 = "amansar";
    d.update(0.1);
    expect(porPasso.tocadas).toBe(0); // one scene at a time
    porStatus.fim();
    await tick();
    d.update(0.1);
    expect(porPasso.tocadas).toBe(1);
    porPasso.fim();
    await tick();
    d.update(0.1); d.update(0.1);
    expect([porStatus.tocadas, porPasso.tocadas]).toEqual([1, 1]); // seen: never again
    estado.passo.m2 = "ir";
    expect(porPasso.tocadas).toBe(1);
  });

  it("podeTocar is an extra guard", () => {
    const log: string[] = [];
    const { p, estado } = provedores(log);
    const d = new Diretor(p);
    let pode = false;
    const c = cenaFalsa("c", log, { tipo: "missao", missao: "m" });
    d.registrar("c", c, { podeTocar: () => pode });
    estado.status.m = "ativa";
    d.update(0.1);
    expect(c.tocadas).toBe(0);
    pode = true;
    d.update(0.1);
    expect(c.tocadas).toBe(1);
  });

  it("lugar: within raio; with hora, only in the window (one that wraps midnight too)", () => {
    const log: string[] = [];
    const { p, estado } = provedores(log);
    const d = new Diretor(p);
    const perto = cenaFalsa("perto", log, { tipo: "lugar", lugar: "encontro", raio: 10 });
    d.registrar("perto", perto);
    estado.pos = { x: 80, z: 0 };
    d.update(0.1);
    expect(perto.tocadas).toBe(0);
    estado.pos = { x: 92, z: 5 };
    d.update(0.1);
    expect(perto.tocadas).toBe(1);

    const q = provedores(log), d2 = new Diretor(q.p);
    const noite = cenaFalsa("noite", log, { tipo: "lugar", lugar: "encontro", raio: 10, hora: [0.9, 0.1] });
    d2.registrar("noite", noite);
    q.estado.pos = { x: 100, z: 0 };
    q.estado.hora = 0.5;
    d2.update(0.1);
    expect(noite.tocadas).toBe(0);
    q.estado.hora = 0.05;
    d2.update(0.1);
    expect(noite.tocadas).toBe(1);
    expect(() => d2.registrar("x", cenaFalsa("x", log, { tipo: "lugar", lugar: "nada", raio: 1 }))).toThrow(/nada/);
  });

  it("naJanela: plain and wrapping windows", () => {
    expect(naJanela(0.5, [0.25, 0.75])).toBe(true);
    expect(naJanela(0.8, [0.25, 0.75])).toBe(false);
    expect(naJanela(0.95, [0.9, 0.1])).toBe(true);
    expect(naJanela(0.05, [0.9, 0.1])).toBe(true);
    expect(naJanela(0.5, [0.9, 0.1])).toBe(false);
  });

  it("evento: plays at the first quiet moment after the event; again only on a new event (lembrar_vista off)", async () => {
    const log: string[] = [];
    const { p, estado, emit } = provedores(log);
    const d = new Diretor(p);
    const c = cenaFalsa("e", log, { tipo: "evento", nome: "choveu" }, { lembrar_vista: false });
    d.registrar("e", c);
    d.update(0.1);
    expect(c.tocadas).toBe(0);
    estado.quieto = false;
    emit("choveu");
    d.update(0.1);
    expect(c.tocadas).toBe(0);
    estado.quieto = true;
    d.update(0.1);
    expect(c.tocadas).toBe(1);
    c.fim();
    await tick();
    d.update(0.1);
    expect(c.tocadas).toBe(1);
    emit("choveu");
    d.update(0.1);
    expect(c.tocadas).toBe(2);
    expect(() => new Diretor({ ...p, eventos: undefined }).registrar("e", cenaFalsa("e", log, { tipo: "evento", nome: "x" }))).toThrow(/eventos/);
  });

  it("with lembrar_vista off a lugar trigger fires again only after leaving and coming back", async () => {
    const log: string[] = [];
    const { p, estado } = provedores(log);
    const d = new Diretor(p);
    const c = cenaFalsa("l", log, { tipo: "lugar", lugar: "encontro", raio: 10 }, { lembrar_vista: false });
    d.registrar("l", c);
    estado.pos = { x: 100, z: 0 };
    d.update(0.1);
    c.fim();
    await tick();
    d.update(0.1);
    expect(c.tocadas).toBe(1);
    estado.pos = { x: 0, z: 0 };
    d.update(0.1);
    estado.pos = { x: 100, z: 0 };
    d.update(0.1);
    expect(c.tocadas).toBe(2);
  });

  it("nothing fires without quieto()", () => {
    const log: string[] = [];
    const { p, estado, emit } = provedores(log);
    estado.quieto = false;
    const d = new Diretor(p);
    const cs = [
      cenaFalsa("a", log, { tipo: "lugar", lugar: "encontro", raio: 1000 }),
      cenaFalsa("b", log, { tipo: "missao", missao: "m" }),
      cenaFalsa("c", log, { tipo: "evento", nome: "e" }),
    ];
    for (const c of cs) d.registrar(c.cena.id, c);
    estado.status.m = "ativa";
    emit("e");
    for (let i = 0; i < 5; i++) d.update(0.1);
    expect(cs.map((c) => c.tocadas)).toEqual([0, 0, 0]);
  });
});

describe("CenaSchema: gatilho and ritual", () => {
  const base = { id: "x", passos: [{ esperar: 1 }] };
  it("ritual defaults to every key true; absent gatilho = by code only", () => {
    const c = CenaSchema.parse(base);
    expect(c.gatilho).toBeUndefined();
    expect(c.ritual).toEqual({ esconder_hud: true, salvar_ao_fim: true, lembrar_vista: true, snap_camera: true });
    expect(CenaSchema.parse({ ...base, ritual: { snap_camera: false } }).ritual.snap_camera).toBe(false);
    expect(CenaSchema.parse({ ...base, ritual: { snap_camera: false } }).ritual.salvar_ao_fim).toBe(true);
  });
  it("rejects unknown trigger types, typos in the ritual and windows outside 0..1", () => {
    expect(CenaSchema.safeParse({ ...base, gatilho: { tipo: "sempre" } }).success).toBe(false);
    expect(CenaSchema.safeParse({ ...base, ritual: { esconder_hub: true } }).success).toBe(false);
    expect(CenaSchema.safeParse({ ...base, gatilho: { tipo: "lugar", lugar: "a", raio: 5, hora: [0, 2] } }).success).toBe(false);
    expect(CenaSchema.safeParse({ ...base, gatilho: { tipo: "missao", missao: "m", passo: "amansar" } }).success).toBe(true);
  });
});
