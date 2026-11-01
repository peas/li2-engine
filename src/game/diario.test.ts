import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarDiario, MAX_SESSOES, type DiarioDoJogo } from "./diario";
import { criarEventos } from "./eventos";

const eventos = criarEventos<{ poderUsado: (poder: string) => void; montou: () => void }>();
let t = 1_000_000;
const agora = () => t;
const avancar = (s: number) => { t += s * 1000; };
let diario: DiarioDoJogo;
const abrir = () => criarDiario({ chave: "teste.diario", jogo: "teste", eventos, agora, contar: ["poderUsado", "montou"], versaoJogo: 7, dia: () => 3 });

beforeEach(() => {
  localStorage.clear();
  diario?.parar();
  t = 1_000_000;
  diario = abrir();
});

describe("diário de jogo", () => {
  it("counts items picked and used, with first and last time", () => {
    eventos.emit("pegouItem", "maca", 2);
    avancar(10);
    eventos.emit("usouItem", "maca", 1);
    eventos.emit("pegouItem", "peixe", 1);
    const d = diario.estado();
    expect(d.itens.maca).toEqual({ pegou: 2, usou: 1, primeira: 1_000_000, ultima: 1_010_000 });
    expect(d.itens.peixe.pegou).toBe(1);
  });

  it("times a quest in played seconds from first start to completion, and counts restarts and steps", () => {
    avancar(30);
    eventos.emit("missaoIniciada", "porco");
    eventos.emit("missaoPasso", "porco", 1);
    avancar(120);
    eventos.emit("missaoIniciada", "porco"); // restarted (the adults' panel, or a repeatable quest)
    avancar(60);
    eventos.emit("missaoConcluida", "porco");
    const m = diario.estado().missoes.porco;
    expect(m).toMatchObject({ iniciou: 2, concluiu: 1, passos: 1, iniciadaAos: 30, concluidaAos: 210 });
    expect(m.concluidaAos! - m.iniciadaAos!).toBe(180);
  });

  it("counts features: usouRecurso, the game's own events by name and by name:arg, places, wins, sleep, cutscenes", () => {
    eventos.emit("usouRecurso", "mapa");
    eventos.emit("usouRecurso", "mapa");
    eventos.emit("poderUsado", "fogo");
    eventos.emit("poderUsado", "gelo");
    eventos.emit("poderUsado", "fogo");
    eventos.emit("montou");
    eventos.emit("achou", "porco");
    eventos.emit("abriu", "porta", "chave");
    eventos.emit("entregou", "vovo", "maca", 1);
    eventos.emit("venceu", "lobo", 2);
    eventos.emit("dormiu", 2, true);
    eventos.emit("cenaAcabou", "abertura", false);
    eventos.emit("cenaAcabou", "abertura", true);
    const d = diario.estado();
    expect(d.recursos).toEqual({ mapa: 2, poderUsado: 3, "poderUsado:fogo": 2, "poderUsado:gelo": 1, montou: 1 });
    expect(d.lugares).toEqual({ porco: 1, porta: 1, vovo: 1 });
    expect(d.venceu).toEqual({ lobo: 2 });
    expect(d.dormiu).toBe(1);
    expect(d.cenas.abertura).toEqual({ viu: 1, pulou: 1 });
  });

  it("writes on salvou, stamps the session with version and day, and reloads what it wrote", () => {
    eventos.emit("pegouItem", "maca", 1);
    avancar(90);
    eventos.emit("salvou", "dormiu");
    const gravado = JSON.parse(localStorage.getItem("teste.diario")!);
    expect(gravado.itens.maca.pegou).toBe(1);
    expect(gravado.segundos).toBe(90);
    expect(gravado.sessoes).toEqual([{ inicio: 1_000_000, fim: 1_090_000, versaoJogo: 7, dia: 3 }]);

    diario.parar();
    avancar(3600); // a new sitting an hour later
    diario = abrir();
    eventos.emit("pegouItem", "maca", 1);
    avancar(10);
    eventos.emit("salvou", "menu");
    const d = diario.estado();
    expect(d.itens.maca.pegou).toBe(2);
    expect(d.sessoes).toHaveLength(2);
    expect(d.segundos).toBe(100);
  });

  it("a reload a minute later continues the same session instead of opening another", () => {
    eventos.emit("salvou", "menu");
    diario.parar();
    avancar(60);
    diario = abrir();
    avancar(30);
    eventos.emit("salvou", "menu");
    expect(diario.estado().sessoes).toHaveLength(1);
    expect(diario.estado().segundos).toBe(30);
  });

  it("keeps at most MAX_SESSOES sessions", () => {
    for (let i = 0; i < MAX_SESSOES + 5; i++) {
      eventos.emit("salvou", "menu");
      diario.parar();
      avancar(3600);
      diario = abrir();
    }
    expect(diario.estado().sessoes).toHaveLength(MAX_SESSOES);
  });

  it("ignores a diary of another game or a corrupt one, and exportarJSON writes first", () => {
    localStorage.setItem("teste.diario", JSON.stringify({ versao: 1, jogo: "outro", itens: { x: 1 } }));
    diario.parar();
    diario = abrir();
    expect(diario.estado().itens).toEqual({});
    localStorage.setItem("teste.diario", "{broken");
    diario.parar();
    diario = abrir();
    expect(diario.estado().jogo).toBe("teste");
    eventos.emit("pegouItem", "maca", 1);
    const json = JSON.parse(diario.exportarJSON());
    expect(json.itens.maca.pegou).toBe(1);
    expect(localStorage.getItem("teste.diario")).not.toBeNull();
  });

  it("zerar forgets everything, in memory and in storage", () => {
    eventos.emit("pegouItem", "maca", 1);
    eventos.emit("salvou", "menu");
    diario.zerar();
    expect(diario.estado().itens).toEqual({});
    expect(diario.estado().sessoes).toEqual([]);
    expect(localStorage.getItem("teste.diario")).toBeNull();
  });
});

describe("envio do diário (enviar)", () => {
  const url = "https://diario.exemplo/diario";
  const chamadas: { url: string; body: string; keepalive?: boolean }[] = [];
  let falhar = false;
  const fetchFalso = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(u), body: String(init?.body), keepalive: init?.keepalive });
    if (falhar) throw new Error("offline");
    return new Response(null, { status: 204 });
  });
  const abrirEnviando = (intervaloMs?: number) =>
    criarDiario({ chave: "teste.diario", jogo: "teste", eventos, agora, enviar: { url, intervaloMs } });

  beforeEach(() => {
    chamadas.length = 0;
    falhar = false;
    vi.stubGlobal("fetch", fetchFalso);
    // happy-dom's navigator has no sendBeacon: the fetch keepalive fallback is what runs here
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
    diario.parar();
    diario = abrirEnviando();
  });

  it("POSTs the whole diary plus an anonymous device id on gravar, as plain text with keepalive", () => {
    eventos.emit("pegouItem", "maca", 1);
    eventos.emit("salvou", "menu");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ url, keepalive: true });
    const corpo = JSON.parse(chamadas[0].body);
    expect(corpo).toMatchObject({ versao: 1, jogo: "teste", itens: { maca: { pegou: 1 } } });
    expect(corpo.dispositivo).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(corpo.dispositivo).toBe(diario.dispositivo());
    expect(localStorage.getItem("teste.diario.dispositivo")).toBe(corpo.dispositivo);
  });

  it("keeps the same device id across openings, and does not put it in the stored diary", () => {
    eventos.emit("salvou", "menu");
    const id = diario.dispositivo();
    expect(JSON.parse(localStorage.getItem("teste.diario")!).dispositivo).toBeUndefined();
    diario.parar();
    avancar(3600);
    diario = abrirEnviando();
    expect(diario.dispositivo()).toBe(id);
  });

  it("sends at most once per interval (5 min by default), and never fails the game when the request fails", () => {
    eventos.emit("salvou", "a");
    avancar(60);
    eventos.emit("salvou", "b"); // inside the interval: skipped
    expect(chamadas).toHaveLength(1);
    avancar(5 * 60);
    falhar = true;
    expect(() => eventos.emit("salvou", "c")).not.toThrow();
    expect(chamadas).toHaveLength(2);
    expect(JSON.parse(chamadas[1].body).sessoes[0].fim).toBe(agora());
  });

  it("honours a custom interval and sends nothing without enviar", () => {
    diario.parar();
    diario = abrirEnviando(1000);
    eventos.emit("salvou", "a");
    avancar(2);
    eventos.emit("salvou", "b");
    expect(chamadas).toHaveLength(2);
    diario.parar();
    diario = abrir();
    eventos.emit("salvou", "c");
    expect(chamadas).toHaveLength(2);
    expect(diario.dispositivo()).toBeDefined(); // the id exists anyway (made once per browser)
  });

  it("prefers navigator.sendBeacon when it exists and falls back to fetch when it refuses", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    eventos.emit("salvou", "a");
    expect(beacon).toHaveBeenCalledWith(url, expect.stringContaining('"dispositivo"'));
    expect(chamadas).toHaveLength(0);
    beacon.mockReturnValueOnce(false); // the beacon queue is full: fetch takes over
    avancar(6 * 60);
    eventos.emit("salvou", "b");
    expect(chamadas).toHaveLength(1);
  });
});
