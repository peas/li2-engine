import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { criarEventos } from "../eventos";
import { SAVE_BASE_INICIAL, SaveBaseSchema, type SaveBase, type SaveDasFatias } from "./base";
import { montarFatias, type CtxFatia, type Fatia } from "./fatias";
import { FATIAS_BASE } from "./fatiasBase";
import { criarStore, type Estado } from "./store";

/** A made-up game: stars (with an action that saves and emits) and a lamp, plus a clean-up. */
const CAMPOS_ESTRELAS = { estrelas: z.number().int().min(0), estrelasMax: z.number().int().min(1) };
const CAMPOS_LAMPADA = { lampada: z.object({ acesa: z.boolean() }) };
type Save = SaveDasFatias<3, typeof CAMPOS_ESTRELAS & typeof CAMPOS_LAMPADA>;
interface Acoes { brilhar(n: number): void; acender(): void }
type E = Estado<Save> & Acoes;

const estrelas: Fatia<Save, Pick<Acoes, "brilhar">, E> = {
  nome: "estrelas",
  schema: CAMPOS_ESTRELAS,
  inicial: { estrelas: 0, estrelasMax: 3 },
  acoes: (set, get, ctx) => ({
    brilhar(n) {
      set({ estrelas: Math.min(get().estrelasMax, get().estrelas + n) });
      ctx.eventos.emit("brilhou", n);
      ctx.salvar("brilhou");
    },
  }),
  sanear: (s) => ({ ...s, estrelas: Math.min(s.estrelas, s.estrelasMax) }),
};
const lampada: Fatia<Save, Pick<Acoes, "acender">, E> = {
  nome: "lampada",
  schema: CAMPOS_LAMPADA,
  inicial: { lampada: { acesa: false } },
  acoes: (set, get) => ({
    acender() {
      set({ lampada: { acesa: true } });
      get().pegarItem("luz"); // another slice's action, through get()
    },
  }),
};
const FATIAS = [...FATIAS_BASE, estrelas, lampada];

describe("montarFatias", () => {
  it("one schema: versao first, then each slice's fields in slice order", () => {
    const m = montarFatias<Save, Acoes>({ versao: 3, fatias: FATIAS });
    const shape = (m.schema as unknown as z.ZodObject).shape;
    expect(Object.keys(shape)).toEqual([...Object.keys(SaveBaseSchema.shape), "estrelas", "estrelasMax", "lampada"]);
    expect(Object.keys(m.inicial as object)).toEqual(Object.keys(shape));
    expect(m.inicial).toEqual({ ...SAVE_BASE_INICIAL, versao: 3, estrelas: 0, estrelasMax: 3, lampada: { acesa: false } });
    expect(() => m.schema.parse({ ...m.inicial, versao: 2 })).toThrow();
    expect(m.schema.parse(m.inicial)).toEqual(m.inicial);
  });

  it("the initial state is a fresh copy (a slice's objects are never shared)", () => {
    const a = montarFatias<Save>({ versao: 3, fatias: FATIAS }).inicial;
    a.lampada.acesa = true;
    expect(montarFatias<Save>({ versao: 3, fatias: FATIAS }).inicial.lampada.acesa).toBe(false);
    expect(lampada.inicial.lampada!.acesa).toBe(false);
  });

  it("the sanear chain runs every slice's, in order", () => {
    const ordem: string[] = [];
    const f = (nome: string): Fatia => ({ nome, schema: {}, inicial: {}, sanear: (s) => (ordem.push(nome), { ...s, ultimo: nome }) });
    const m = montarFatias<Record<string, unknown>>({ versao: 1, fatias: [f("a"), { nome: "sem", schema: {}, inicial: {} }, f("b")] });
    expect(m.sanear({ x: 1 })).toEqual({ x: 1, ultimo: "b" });
    expect(ordem).toEqual(["a", "b"]);
  });

  it("errors: a slice twice, a field in two slices, a field without initial value, an initial value outside the schema", () => {
    const um: Fatia = { nome: "um", schema: { x: z.number() }, inicial: { x: 0 } };
    expect(() => montarFatias({ versao: 1, fatias: [um, um] })).toThrow(/duas vezes/);
    expect(() => montarFatias({ versao: 1, fatias: [um, { ...um, nome: "dois" }] })).toThrow(/campo "x" em duas fatias/);
    expect(() => montarFatias({ versao: 1, fatias: [{ ...um, inicial: {} }] })).toThrow(/valor inicial de "x"/);
    expect(() => montarFatias({ versao: 1, fatias: [{ ...um, inicial: { x: 0, y: 1 } }] })).toThrow(/"y" tem valor inicial/);
  });

  it("actions merge; the same name in two slices is an error", () => {
    const ctx: CtxFatia = { eventos: criarEventos(), salvar: () => {}, minutosPorDia: 10 };
    const a: Fatia = { nome: "a", schema: {}, inicial: {}, acoes: () => ({ f() {} }) };
    const b: Fatia = { nome: "b", schema: {}, inicial: {}, acoes: () => ({ g() {} }) };
    expect(Object.keys(montarFatias({ versao: 1, fatias: [a, b] }).acoes(() => {}, () => ({}), ctx) as object)).toEqual(["f", "g"]);
    expect(() => montarFatias({ versao: 1, fatias: [a, { ...a, nome: "c" }] }).acoes(() => {}, () => ({}), ctx)).toThrow(/ação "f" em duas fatias: a e c/);
    // `substitui`: the later slice replaces the named action on purpose (the Dragão's tick drains its bars too)
    const c: Fatia = { nome: "c", schema: {}, inicial: {}, acoes: () => ({ f: () => "c" }) };
    const acoes = montarFatias({ versao: 1, fatias: [a, b, c], substitui: ["f"] }).acoes(() => {}, () => ({}), ctx) as Record<string, () => unknown>;
    expect(Object.keys(acoes)).toEqual(["f", "g"]);
    expect(acoes.f()).toBe("c");
  });

  it("FATIAS_BASE is SaveBaseSchema and SAVE_BASE_INICIAL (same fields, same order, same defaults)", () => {
    const m = montarFatias<SaveBase>({ versao: 1, fatias: FATIAS_BASE });
    expect(Object.keys((m.schema as unknown as z.ZodObject).shape)).toEqual(Object.keys(SaveBaseSchema.shape));
    const { versao, ...resto } = m.inicial;
    expect(versao).toBe(1);
    expect(resto).toEqual(SAVE_BASE_INICIAL);
    expect(Object.keys(resto)).toEqual(Object.keys(SAVE_BASE_INICIAL));
    expect(FATIAS_BASE.map((f) => f.nome)).toEqual(["dia", "inventario", "missoes", "dicas", "cenas", "novidades", "relogio"]);
  });
});

describe("criarStore with slices", () => {
  const eventos = criarEventos<{ brilhou: (n: number) => void }>();
  const jogo = criarStore<Save, Acoes>({
    chave: "fatias.save",
    versao: 3,
    fatias: FATIAS,
    // v2 had no lamp
    migrar: (raw) => (raw.versao === 2 ? { ...raw, versao: 3, lampada: { acesa: false } } : raw),
    minutosPorDia: 1,
  }, eventos);
  const s = () => jogo.store.getState();

  beforeEach(() => {
    localStorage.clear();
    s().zerar();
  });

  it("starts from the slices' initial state, with the base actions and every slice's", () => {
    expect(s().versao).toBe(3);
    expect(s().estrelasMax).toBe(3);
    s().acender();
    expect(s().lampada.acesa).toBe(true);
    expect(s().inventario).toEqual({ luz: 1 });
  });

  it("ctx: the slice's events, salvar and the minutes per day are the store's", () => {
    const brilhou = vi.fn(), salvou = vi.fn();
    const offs = [eventos.on("brilhou", brilhou), eventos.on("salvou", salvou)];
    s().brilhar(5);
    expect(s().estrelas).toBe(3);
    expect(brilhou).toHaveBeenCalledWith(5);
    expect(salvou).toHaveBeenCalledWith("brilhou");
    expect(JSON.parse(localStorage.getItem("fatias.save")!).estrelas).toBe(3);
    s().tick(60);
    expect(s().dormir().novoDia).toBe(true);
    offs.forEach((off) => off());
  });

  it("the save is versao then the slices' fields, in order; migrar before the schema, sanear after", () => {
    s().brilhar(2);
    const json = JSON.parse(jogo.exportarJSON());
    expect(Object.keys(json)).toEqual([...Object.keys(SaveBaseSchema.shape), "estrelas", "estrelasMax", "lampada"]);
    const { lampada: _, ...v2 } = { ...json, versao: 2, estrelas: 3, estrelasMax: 2 };
    jogo.importarJSON(JSON.stringify(v2));
    expect(s().lampada).toEqual({ acesa: false });
    expect(s().estrelas).toBe(2);
    expect(() => jogo.importarJSON(JSON.stringify({ ...json, versao: 4 }))).toThrow();
  });

  it("without the engine's slices it is an error", () => {
    expect(() => criarStore({ chave: "x", versao: 1, fatias: [estrelas] }, criarEventos())).toThrow(/faltam as fatias do engine/);
  });
});
