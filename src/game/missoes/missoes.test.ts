import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SAVE_BASE_INICIAL, SaveBaseSchema } from "../estado/base";
import { criarStore } from "../estado/store";
import { criarEventos, type EventosBase } from "../eventos";
import { Missoes, carregarMissoes, lugaresDe, type Lugares, type MundoMissoes, type PassoHandler } from "./missoes";
import { MissaoSchema, PassoBase, criarMissaoSchema, type MissaoDef } from "./schema";

const eventos = criarEventos();
const { store } = criarStore({ chave: "missoes.teste", inicial: { ...SAVE_BASE_INICIAL, versao: 1 }, schema: SaveBaseSchema }, eventos);
const s = () => store.getState();

const lugares: Lugares = lugaresDe({ vila: { x: 0, z: 0, yaw: 0, radius: 20 }, lago: { x: 300, z: 0 }, praia: { x: 0, z: 400 }, trilhas: [[1, 2]] }, { forno: { x: -50, z: 10 } });
const longe = { x: 5000, z: 5000 };

const base = { dificuldade: "facil" as const };
const EXPLORAR: MissaoDef = {
  ...base, id: "explorar", titulo: "Explorar", descricao: "Conheça a ilha.", quem: "vovo",
  dialogo_oferta: "vovo-oferta", dialogo_andamento: "vovo-andamento", dialogo_feito: "vovo-feito",
  passos: [{ tipo: "ir", texto: "visite o lago e a praia", lugar: ["lago", "praia"], raio: 60, dialogos: { lago: "chegou-lago" } }],
  ao_concluir: { coracoes: 1 },
};
const MACAS: MissaoDef = {
  ...base, id: "macas", titulo: "Maçãs", descricao: "Leve maçãs.", quem: "rosa", requer: ["explorar"],
  dialogo_oferta: "rosa-oferta", dialogo_andamento: "rosa-andamento", dialogo_feito: "rosa-feito",
  passos: [
    { tipo: "coletar", texto: "colha 3 maçãs", item: "maca", qtd: 3, dialogo: "colheu" },
    { tipo: "levar", texto: "leve para a Rosa", npc: "rosa", item: "maca", qtd: 3, dialogo: "rosa-entrega", dialogo_falta: "rosa-falta" },
    { tipo: "falar", texto: "conte ao vovô", npc: "vovo", dialogo: "vovo-contou" },
  ],
};

let mundo: MundoMissoes & { npc: ReturnType<typeof vi.fn> };
let recompensa: ReturnType<typeof vi.fn<(r: Record<string, unknown>, def: MissaoDef<any>) => void>>;
let m: Missoes;
let offs: (() => void)[] = [];

function ouvir<K extends keyof EventosBase>(nome: K) {
  const fn = vi.fn();
  offs.push(eventos.on(nome, fn as never));
  return fn;
}
function falar(npc: string, fim: "fim" | "pulado" = "fim") {
  const c = m.aoFalar(npc);
  c.depois?.(fim);
  return c.falas;
}
const novas = (defs: MissaoDef<any>[], extra: Partial<ConstructorParameters<typeof Missoes>[0]> = {}) =>
  new Missoes({ defs, lugares, store, eventos, mundo, entregarRecompensa: recompensa, ...extra });

beforeEach(() => {
  localStorage.clear();
  s().zerar();
  mundo = { npc: vi.fn(() => ({ x: 1, z: 2 })) };
  recompensa = vi.fn();
  m = novas([EXPLORAR, MACAS]);
  offs.push(m.ligar());
});
afterEach(() => {
  for (const off of offs) off();
  offs = [];
});

describe("loading", () => {
  it("carregarMissoes validates each file with the schema it gets, naming the file on error", () => {
    const yaml = `id: x\ntitulo: X\ndescricao: d\nquem: rosa\ndialogo_oferta: a\ndialogo_andamento: b\ndialogo_feito: c\npassos:\n  - { tipo: falar, texto: t, npc: rosa, dialogo: d }\n`;
    expect(carregarMissoes({ "./missoes/x.yaml": yaml }).map((d) => d.id)).toEqual(["x"]);
    expect(() => carregarMissoes({ "./missoes/ruim.yaml": "id: x\n" })).toThrow(/ruim\.yaml/);
    expect(() => carregarMissoes({ "./x.yaml": yaml.replace("tipo: falar", "tipo: voar") }, MissaoSchema)).toThrow();
  });

  it("lugaresDe keeps the point-like places and the extras", () => {
    expect(Object.keys(lugares).sort()).toEqual(["forno", "lago", "praia", "vila"]);
  });

  it("an unknown place, an unknown step type or a repeated id throws", () => {
    const { praia: _, ...semPraia } = lugares;
    expect(() => novas([EXPLORAR], { lugares: semPraia })).toThrow(/praia/);
    expect(() => novas([{ ...MACAS, passos: [{ tipo: "cozinhar", texto: "t" } as any] }])).toThrow(/cozinhar/);
    expect(() => novas([EXPLORAR, EXPLORAR])).toThrow(/repetida/);
  });
});

describe("oferecer_apos (a quest that waits for a world event)", () => {
  const RACAO: MissaoDef = {
    ...base, id: "racao", titulo: "Ração", descricao: "As galinhas não comem.", quem: "maria", oferecer_apos: "ovo_acabou",
    dialogo_oferta: "maria-oferta", dialogo_andamento: "maria-andamento", dialogo_feito: "maria-feito",
    passos: [{ tipo: "coletar", texto: "faça 3 rações", item: "racao", qtd: 3 }],
    ao_concluir: { mundo: { ovos_por_vez: 3 } },
  };

  it("is blocked (hidden, not offered) until the world says the event happened; then offered like any other", () => {
    const aconteceu = new Set<string>();
    m = novas([RACAO], { mundo: { ...mundo, aconteceu: (e) => aconteceu.has(e) } });
    expect(m.status("racao")).toBe("bloqueada");
    expect(m.resumos()).toEqual([]);
    expect(m.aoFalar("maria").falas).toEqual([]);
    expect(m.ofertaPara("maria")).toBeNull();
    aconteceu.add("ovo_acabou");
    expect(m.status("racao")).toBe("nova");
    expect(m.ofertaPara("maria")?.id).toBe("racao");
    expect(falar("maria")).toEqual(["maria-oferta"]);
    expect(m.status("racao")).toBe("ativa");
    m.ligar();
    s().pegarItem("racao", 3);
    expect(m.status("racao")).toBe("feita");
    expect(recompensa).toHaveBeenCalledWith({ mundo: { ovos_por_vez: 3 } }, RACAO);
  });

  it("the schema takes the field (snake_case) and the interpreter warns without mundo.aconteceu", () => {
    expect(MissaoSchema.safeParse({ ...RACAO, oferecer_apos: "Ovo Acabou" }).success).toBe(false);
    expect(MissaoSchema.safeParse(RACAO).success).toBe(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    m = novas([RACAO]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/oferecer_apos sem mundo.aconteceu/));
    expect(m.status("racao")).toBe("bloqueada");
    warn.mockRestore();
  });
});

describe("ir + requer + recompensa", () => {
  it("offered by its giver; Esc does not start it; places in any order; reward injected before done", () => {
    const concluida = ouvir("missaoConcluida"), avancou = ouvir("missaoAvancou");
    expect(m.status("macas")).toBe("bloqueada");
    expect(m.resumos().map((r) => r.id)).toEqual(["explorar"]);
    expect(falar("vovo", "pulado")).toEqual(["vovo-oferta"]);
    expect(m.status("explorar")).toBe("nova");
    falar("vovo");
    expect(m.status("explorar")).toBe("ativa");
    expect(m.aoFalar("vovo").falas).toEqual(["vovo-andamento"]);
    expect(m.alvo()).toEqual({ x: 300, z: 0, nome: "visite o lago e a praia" });

    m.update({ x: 340, z: 0 }, true);
    expect(m.proximoDialogo()).toBe("chegou-lago");
    expect(m.progresso("explorar", 0)).toBe("1/2");
    expect(avancou).toHaveBeenCalledWith("explorar", "lago");
    m.update({ x: 300, z: 0 }, true); // standing still does not count twice
    expect(m.proximoDialogo()).toBeNull();
    expect(m.alvo()).toMatchObject({ x: 0, z: 400 });
    m.update({ x: 0, z: 461 }, true); // farther than the radius
    expect(m.status("explorar")).toBe("ativa");
    m.update({ x: 0, z: 440 }, false);
    expect(m.status("explorar")).toBe("feita");
    expect(recompensa).toHaveBeenCalledWith({ coracoes: 1 }, EXPLORAR);
    expect(concluida).toHaveBeenCalledTimes(1);
    expect(m.aoFalar("vovo").falas).toEqual(["vovo-feito"]);
    expect(m.alvo()).toBeNull();
    expect(m.status("macas")).toBe("nova");
  });

  it("a second instance reads the saved progress; zerar forgets it", () => {
    falar("vovo");
    m.update({ x: 300, z: 0 }, true);
    const outra = novas([EXPLORAR, MACAS]);
    expect(outra.status("explorar")).toBe("ativa");
    expect(outra.progresso("explorar", 0)).toBe("1/2");
    m.zerar("explorar");
    expect(m.status("explorar")).toBe("nova");
  });
});

describe("coletar + levar + falar", () => {
  beforeEach(() => {
    s().missaoIniciar("explorar");
    s().missaoAtualizar("explorar", { passo: 1, concluida: true });
  });

  it("items picked before the step do not count; then hand them over and tell the giver", () => {
    const passo = ouvir("missaoPasso"), entregou = ouvir("entregou");
    s().pegarItem("maca", 2);
    expect(m.ofertaPara("rosa")?.id).toBe("macas");
    falar("rosa");
    expect(m.ofertaPara("rosa")).toBeNull();
    expect(passo).toHaveBeenCalledWith("macas", 0);
    expect(m.coletando("maca")).toBe(true);
    expect(m.alvo()).toBeNull();
    s().pegarItem("maca", 2);
    expect(m.progresso("macas", 0)).toBe("2/3");
    s().pegarItem("maca");
    expect(s().missao("macas")!.passo).toBe(1);
    expect(m.proximoDialogo()).toBe("colheu");
    expect(m.coletando("maca")).toBe(false);
    expect(m.alvo()).toEqual({ x: 1, z: 2, nome: "leve para a Rosa" });
    expect(mundo.npc).toHaveBeenLastCalledWith("rosa");

    s().tirarItem("maca", 3); // short now: 2 left
    expect(falar("rosa")).toEqual(["rosa-falta"]);
    expect(s().missao("macas")!.passo).toBe(1);
    s().pegarItem("maca");
    expect(falar("rosa")).toEqual(["rosa-entrega"]);
    expect(s().inventario.maca).toBeUndefined();
    expect(entregou).toHaveBeenCalledWith("rosa", "maca", 3);
    expect(m.proximoDialogo()).toBeNull(); // the delivery line was the conversation itself

    expect(falar("vovo")).toEqual(["vovo-contou"]);
    expect(m.status("macas")).toBe("feita");
    expect(recompensa).not.toHaveBeenCalled(); // no ao_concluir
    expect(m.aoFalar("rosa").falas).toEqual(["rosa-feito"]);
  });

  it("ativa() follows the most recently started; resumos have the HUD shape", () => {
    s().missaoZerar("explorar");
    falar("vovo");
    s().missaoIniciar("macas");
    expect(m.ativas().map((d) => d.id)).toEqual(["explorar", "macas"]);
    expect(m.ativa()?.id).toBe("macas");
    s().pegarItem("maca", 3);
    expect(m.resumo("macas")).toMatchObject({ id: "macas", quem: "rosa", status: "ativa", passo: 1 });
    expect(m.resumo("macas").passos.map((p) => p.feito)).toEqual([true, false, false]);
    expect(m.resumos().find((r) => r.id === "explorar")!.passos[0]).toMatchObject({ feito: false, progresso: "0/2" });
  });
});

describe("a game's step type", () => {
  it("is validated by the extended schema and run by the registered handler", () => {
    const Cozinhar = PassoBase.extend({ tipo: z.literal("cozinhar"), receita: z.string(), lugar: z.string() });
    const schema = criarMissaoSchema([Cozinhar]);
    const yaml = `id: sopa\ntitulo: Sopa\ndescricao: d\nquem: vovo\ndialogo_oferta: a\ndialogo_andamento: b\ndialogo_feito: c\npassos:\n  - { tipo: cozinhar, texto: cozinhe a sopa, receita: sopa, lugar: forno, dialogo: ficou-pronta }\nao_concluir: { coracoes: 2 }\n`;
    const defs = carregarMissoes({ "sopa.yaml": yaml }, schema) as MissaoDef<any>[];
    expect(() => carregarMissoes({ "sopa.yaml": yaml })).toThrow(); // the base schema does not know it
    let cozinhou = false;
    const cozinhar: PassoHandler<{ receita: string; lugar: string; texto: string }> = {
      alvo: (p, _e, ctx) => ctx.lugar(p.lugar, p.texto),
      update: () => cozinhou,
      progresso: () => (cozinhou ? "1/1" : "0/1"),
    };
    const mm = novas(defs, { passosExtras: { cozinhar } });
    mm.iniciar("sopa");
    expect(mm.alvo()).toEqual({ x: -50, z: 10, nome: "cozinhe a sopa" });
    mm.update(longe, true);
    expect(mm.status("sopa")).toBe("ativa");
    expect(mm.progresso("sopa", 0)).toBe("0/1");
    cozinhou = true;
    mm.update(longe, true);
    expect(mm.status("sopa")).toBe("feita");
    expect(mm.proximoDialogo()).toBe("ficou-pronta");
    expect(recompensa).toHaveBeenCalledWith({ coracoes: 2 }, expect.objectContaining({ id: "sopa" }));
  });

  it("a plain object store works too (no zustand)", () => {
    const estado: Record<string, any> = {};
    const fake = {
      get missoes() { return estado; },
      inventario: {},
      missao: (id: string) => estado[id],
      missaoIniciar: (id: string) => { estado[id] ??= { passo: 0, contadores: {}, concluida: false }; },
      missaoAtualizar: (id: string, mu: any) => { estado[id] = { ...estado[id], ...mu, contadores: { ...estado[id].contadores, ...(mu.contadores ?? {}) } }; },
      missaoZerar: (id: string) => { delete estado[id]; },
      tirarItem: () => false,
    };
    const mm = novas([EXPLORAR], { store: fake });
    mm.iniciar("explorar");
    mm.update({ x: 300, z: 0 }, true);
    mm.update({ x: 0, z: 400 }, true);
    expect(mm.status("explorar")).toBe("feita");
  });
});

describe("achar", () => {
  const PERDIDO: MissaoDef = {
    ...base, id: "perdido", titulo: "Perdido", descricao: "Ache o gato.", quem: "rosa",
    dialogo_oferta: "rosa-oferta", dialogo_andamento: "rosa-andamento", dialogo_feito: "rosa-feito",
    passos: [
      { tipo: "achar", texto: "ache o gato perto do lago", objeto: "gato", lugar: "lago", raio: 6, dialogo: "achou-gato" },
      { tipo: "falar", texto: "conte para a Rosa", npc: "rosa", dialogo: "rosa-voltou" },
    ],
  };

  it("points at the place, waits for mundo.achou, records the find in the save and emits achou", () => {
    const achados = new Set<string>();
    const achou = ouvir("achou"), avancou = ouvir("missaoAvancou");
    const mm = novas([PERDIDO], { mundo: { npc: () => null, achou: (o) => achados.has(o) } });
    expect(MissaoSchema.parse(PERDIDO).passos[0].tipo).toBe("achar"); // a base step now
    mm.iniciar("perdido");
    expect(mm.alvo()).toEqual({ x: 300, z: 0, nome: "ache o gato perto do lago" });
    mm.update(longe, true);
    expect(mm.passoAtivo("perdido")?.tipo).toBe("achar");
    expect(mm.achou("gato")).toBe(false);
    achados.add("gato");
    mm.update(longe, true);
    expect(achou).toHaveBeenCalledExactlyOnceWith("gato");
    expect(avancou).not.toHaveBeenCalled();
    expect(mm.proximoDialogo()).toBe("achou-gato");
    expect(mm.passoAtivo("perdido")?.tipo).toBe("falar");
    expect(s().missao("perdido")!.contadores).toEqual({ "achar:gato": 1 });
    // the registry answers after a reload, without the world
    expect(novas([PERDIDO], { mundo: { npc: () => null, achou: () => false } }).achou("gato")).toBe(true);
    expect(mm.achou("cachorro")).toBe(false);
  });

  it("without mundo.achou it never ends, and registering warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mm = novas([PERDIDO]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/perdido.*achar/));
    warn.mockRestore();
    mm.iniciar("perdido");
    mm.update({ x: 300, z: 0 }, true);
    expect(mm.passoAtivo("perdido")?.tipo).toBe("achar");
  });
});
