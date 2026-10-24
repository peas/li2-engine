import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { criarEventos, type EventosBase } from "../eventos";
import { SAVE_BASE_INICIAL, SaveBaseSchema } from "./base";
import { criarStore } from "./store";

/** A tiny game save: the base plus hearts, and an action of its own. */
const SaveSchema = SaveBaseSchema.extend({ versao: z.literal(2), coracoes: z.number().min(0) });
type Save = z.infer<typeof SaveSchema>;
const INICIAL: Save = { ...SAVE_BASE_INICIAL, versao: 2, coracoes: 3 };
const ITENS = new Set(["maca", "peixe"]);

const eventos = criarEventos<{ curou: (n: number) => void }>();
interface Acoes { curar(n: number): void }
const jogo = criarStore<Save, Acoes>({
  chave: "teste.save",
  inicial: INICIAL,
  schema: SaveSchema,
  // v1 called the hearts "vida"
  migrar: (raw) => (raw.versao === 1 ? { ...raw, versao: 2, coracoes: raw.vida, vida: undefined } : raw),
  sanear: (save) => ({ ...save, inventario: Object.fromEntries(Object.entries(save.inventario).filter(([id]) => ITENS.has(id))) }),
  acoes: (set, get) => ({
    curar(n: number) {
      set({ coracoes: get().coracoes + n });
      eventos.emit("curou", n);
    },
  }),
}, eventos);
const { store, salvar, carregar, exportarJSON, importarJSON, CHAVE } = jogo;
const s = () => store.getState();

let offs: (() => void)[] = [];
function ouvir<K extends keyof EventosBase>(nome: K) {
  const fn = vi.fn();
  offs.push(eventos.on(nome, fn as never));
  return fn;
}

beforeEach(() => {
  localStorage.clear();
  s().zerar();
});
afterEach(() => {
  for (const off of offs) off();
  offs = [];
});

describe("criarStore", () => {
  it("starts from the initial save, with the base and the game's actions", () => {
    expect(s().coracoes).toBe(3);
    expect(s().dia).toBe(1);
    s().curar(2);
    expect(s().coracoes).toBe(5);
    expect(CHAVE).toBe("teste.save");
  });

  it("inventory: pegar emits pegouItem, tirar is silent, usar emits usouItem; never below zero", () => {
    const pegou = ouvir("pegouItem"), usou = ouvir("usouItem");
    s().pegarItem("maca", 3);
    expect(pegou).toHaveBeenCalledWith("maca", 3);
    expect(s().tirarItem("maca")).toBe(true);
    expect(s().usarItem("maca", 2)).toBe(true);
    expect(usou).toHaveBeenCalledWith("maca", 2);
    expect(s().inventario.maca).toBeUndefined();
    expect(s().tirarItem("maca")).toBe(false);
    expect(s().usarItem("maca")).toBe(false);
    expect(usou).toHaveBeenCalledTimes(1);
  });

  it("first-time hints and cutscenes seen are remembered", () => {
    expect(s().dicaNova("primeira-maca")).toBe(true);
    expect(s().dicaNova("primeira-maca")).toBe(false);
    expect(s().dicas).toEqual(["primeira-maca"]);
    expect(s().cenaVista("abertura")).toBe(false);
    s().verCena("abertura");
    s().verCena("abertura");
    expect(s().cenaVista("abertura")).toBe(true);
    expect(s().cenasVistas).toEqual(["abertura"]);
  });

  it("news: verNovidades keeps the newest version told and saves", () => {
    s().verNovidades(3);
    expect(s().ultimaNovidadeVista).toBe(3);
    s().verNovidades(2);
    expect(s().ultimaNovidadeVista).toBe(3);
    expect(JSON.parse(localStorage.getItem(CHAVE)!).ultimaNovidadeVista).toBe(3);
  });

  it("sleeping turns the day only after 10 minutes played, emits dormiu and saves", () => {
    const dormiu = ouvir("dormiu"), salvou = ouvir("salvou");
    s().tick(300);
    expect(s().dormir()).toEqual({ novoDia: false, faltam: 300 });
    expect(s().dia).toBe(1);
    expect(dormiu).toHaveBeenCalledWith(1, false);
    s().tick(300);
    expect(s().dormir()).toEqual({ novoDia: true, faltam: 0 });
    expect(s().dia).toBe(2);
    expect(s().segundosHoje).toBe(0);
    expect(dormiu).toHaveBeenCalledWith(2, true);
    expect(salvou).toHaveBeenCalledWith("dormiu");
    const salvo = JSON.parse(localStorage.getItem(CHAVE)!);
    expect(salvo.dia).toBe(2);
    expect(salvo.ultimaVez).toBeGreaterThan(0);
    expect(salvo.curar).toBeUndefined();
  });

  it("minutosPorDia is a parameter", () => {
    const outro = criarStore({ chave: "outro", inicial: INICIAL, schema: SaveSchema, minutosPorDia: 1 }, criarEventos());
    outro.store.getState().tick(59);
    expect(outro.store.getState().dormir().novoDia).toBe(false);
    outro.store.getState().tick(1);
    expect(outro.store.getState().dormir().novoDia).toBe(true);
  });

  it("real days away advance the day on return, once per calendar day", () => {
    const voltou = ouvir("voltou");
    expect(s().voltar()).toBe(0);
    salvar("teste");
    s().tick(100);
    const ultima = s().ultimaVez;
    expect(s().voltar(ultima + 1000)).toBe(0);
    expect(s().segundosHoje).toBe(100);
    expect(s().voltar(ultima + 3 * 86400000)).toBe(3);
    expect(s().dia).toBe(4);
    expect(voltou).toHaveBeenLastCalledWith(3, 4);
  });

  it("quests: start, update (done saves and emits), zero", () => {
    const fim = ouvir("missaoConcluida"), ini = ouvir("missaoIniciada");
    s().missaoAtualizar("x", { passo: 2 });
    expect(s().missao("x")).toBeUndefined();
    s().missaoIniciar("x");
    s().missaoIniciar("x");
    expect(ini).toHaveBeenCalledTimes(1);
    s().missaoAtualizar("x", { contadores: { a: 1 } });
    s().missaoAtualizar("x", { passo: 1, contadores: { b: 2 } });
    expect(s().missao("x")).toEqual({ passo: 1, contadores: { a: 1, b: 2 }, concluida: false });
    s().missaoAtualizar("x", { passo: 2, concluida: true });
    expect(fim).toHaveBeenCalledWith("x");
    expect(localStorage.getItem(CHAVE)).not.toBeNull();
    s().missaoZerar("x");
    expect(s().missao("x")).toBeUndefined();
  });

  it("export → import round trip; the import rejects junk", () => {
    s().pegarItem("peixe", 4);
    s().curar(1);
    const json = exportarJSON();
    s().zerar();
    importarJSON(json);
    expect(s().inventario.peixe).toBe(4);
    expect(s().coracoes).toBe(4);
    expect(() => importarJSON("{\"versao\": 2}")).toThrow();
    expect(() => importarJSON("nope")).toThrow();
  });

  it("carregar: nothing saved = new; a saved game comes back; migrar runs before the schema, sanear after", () => {
    const carregou = ouvir("carregou");
    expect(carregar()).toBe("novo");
    s().pegarItem("maca", 2);
    salvar("teste");
    s().zerar();
    expect(carregar()).toBe("carregou");
    expect(s().inventario.maca).toBe(2);
    expect(carregou).toHaveBeenCalled();
    // a v1 save with an item that left the catalogue
    localStorage.setItem(CHAVE, JSON.stringify({ ...INICIAL, versao: 1, vida: 7, coracoes: undefined, inventario: { maca: 1, espada: 2 } }));
    expect(carregar()).toBe("carregou");
    expect(s().versao).toBe(2);
    expect(s().coracoes).toBe(7);
    expect(s().inventario).toEqual({ maca: 1 });
  });

  it("a corrupt save is kept aside and the game starts fresh", () => {
    s().pegarItem("maca");
    localStorage.setItem(CHAVE, "{broken");
    expect(carregar()).toBe("corrompido");
    expect(localStorage.getItem(`${CHAVE}.corrompido`)).toBe("{broken");
    expect(s().inventario).toEqual({});
    localStorage.setItem(CHAVE, JSON.stringify({ versao: 9 }));
    expect(carregar()).toBe("corrompido");
  });
});
