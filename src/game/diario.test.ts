import { beforeEach, describe, expect, it } from "vitest";
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
