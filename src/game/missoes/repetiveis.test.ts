import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_BASE_INICIAL, SaveBaseSchema } from "../estado/base";
import { criarStore } from "../estado/store";
import { criarEventos } from "../eventos";
import { Missoes, type Lugares } from "./missoes";
import { carregarRepetiveis, gerarRepetivel, numeroRepetivel } from "./repetiveis";
import type { MissaoDef } from "./schema";

/**
 * Ported from the Dragão's repetiveis.test.ts. Made-up data that reproduces the Dragão's three templates in shape and
 * size (levar from 3 items, visitar 2 of 10 places, coletar from 5 items; 6 item names, 12 villagers), so the same n
 * draws the same choices: rep-1 = 2 of the 2nd item to the 3rd villager, as in the Dragão.
 */
const YAML = `
quem: guia
dialogo_oferta: guia-rep-oferta
dialogo_andamento: guia-rep-andamento
dialogo_feito: guia-rep-feito
dialogo_espera: guia-rep-depois
dialogo_entrega: rep-entrega
dialogo_falta: rep-falta
itens:
  uva: { um: uva, varios: uvas }
  pao: { um: pão, varios: pães }
  queijo: { um: queijo, varios: queijos }
  mel: { um: pote de mel, varios: potes de mel }
  leite: { um: leite, varios: leites }
  ovo: { um: ovo, varios: ovos }
npcs:
  ana: a Ana
  beto: o Beto
  caio: o Caio
  dora: a Dora
  eva: a Eva
  fabio: o Fábio
  gil: o Gil
  hugo: o Hugo
  iris: a Íris
  joao: o João
  kika: a Kika
  lia: a Lia
lugares:
  lugarA: o lugar A
  lugarB: o lugar B
  lugarC: o lugar C
  lugarD: o lugar D
  lugarE: o lugar E
  lugarF: o lugar F
  lugarG: o lugar G
  lugarH: o lugar H
  lugarI: o lugar I
  lugarJ: o lugar J
moldes:
  - tipo: levar
    titulo: "Um presente para {npc}"
    descricao: "A guia quer mandar {qtd} {item} para {npc}."
    texto_coletar: "junte {qtd} {item}"
    texto: "leve {qtd} {item} para {npc}"
    itens: [uva, pao, queijo]
    qtd: [1, 3]
    moedas: 3
  - tipo: visitar
    titulo: "Um passeio da guia"
    descricao: "A guia quer saber como estão {lugares}."
    texto: "vá até {lugares}"
    quantos: 2
    raio: 90
    moedas: 2
  - tipo: coletar
    titulo: "Cestinha de {item}"
    descricao: "A guia está guardando comida: junte {qtd} {item}."
    texto: "junte {qtd} {item}"
    itens: [uva, pao, mel, leite, ovo]
    qtd: [2, 4]
    moedas: 2
`;
const cfg = carregarRepetiveis(YAML);
const DIALOGOS = [cfg.dialogo_oferta, cfg.dialogo_andamento, cfg.dialogo_feito, cfg.dialogo_espera, cfg.dialogo_entrega, cfg.dialogo_falta];

const eventos = criarEventos();
const { store, exportarJSON, importarJSON } = criarStore({ chave: "repetiveis.teste", inicial: { ...SAVE_BASE_INICIAL, versao: 1 }, schema: SaveBaseSchema }, eventos);
const s = () => store.getState();
const lugares: Lugares = { ...Object.fromEntries(Object.keys(cfg.lugares).map((k, i) => [k, { x: i * 1000, z: 0 }])), vila: { x: 0, z: 5000 } };

/** Written quests: the giver has one, another villager one (a written quest running blocks the repeatables). */
const base = { dificuldade: "facil" as const };
const conversas = (q: string, id: string) => ({ dialogo_oferta: `${id}-oferta`, dialogo_andamento: `${id}-andamento`, dialogo_feito: `${id}-feito`, quem: q });
const ESCRITAS: MissaoDef[] = [
  { ...base, ...conversas("guia", "explorar"), id: "explorar", titulo: "Explorar", descricao: "d", passos: [{ tipo: "ir", texto: "vá à vila", lugar: "vila", raio: 10 }] },
  { ...base, ...conversas("ana", "bolo"), id: "bolo", titulo: "Bolo", descricao: "d", passos: [{ tipo: "coletar", texto: "junte uvas", item: "uva", qtd: 2 }] },
];

let m: Missoes;
let off: () => void;
const novas = () => new Missoes({ defs: ESCRITAS, lugares, store, eventos, mundo: { npc: vi.fn(() => ({ x: 1, z: 2 })) }, repetiveis: cfg });
const falar = (npc: string) => { const c = m.aoFalar(npc); c.depois?.("fim"); return c.falas; };
/** Every written quest done (so the giver has nothing written left to offer). */
function todasEscritasFeitas() {
  for (const d of ESCRITAS) { s().missaoIniciar(d.id); s().missaoAtualizar(d.id, { passo: d.passos.length, concluida: true }); }
}
/** Finish whatever the running repeatable asks. */
function cumprir(id: string) {
  for (const p of m.def(id).passos) {
    if (p.tipo === "coletar") s().pegarItem(p.item, p.qtd);
    else if (p.tipo === "levar") { s().pegarItem(p.item, p.qtd); falar(p.npc); }
    else if (p.tipo === "ir") for (const l of p.lugar as string[]) m.update(lugares[l], true);
  }
}

beforeEach(() => {
  localStorage.clear();
  s().zerar();
  m = novas();
  off = m.ligar();
});
afterEach(() => off());

describe("gerarRepetivel", () => {
  it("is deterministic: the same n gives the same quest", () => {
    for (const n of [1, 2, 3, 17, 50]) expect(gerarRepetivel(n, cfg)).toEqual(gerarRepetivel(n, cfg));
    expect(gerarRepetivel(1, cfg)).not.toEqual(gerarRepetivel(2, cfg));
  });

  it("draws what the Dragão draws for the same n (same seed, same template rotation)", () => {
    expect(gerarRepetivel(1, cfg)).toMatchObject({
      id: "rep-1", titulo: "Um presente para o Caio", ao_concluir: { moedas: 3 },
      passos: [
        { tipo: "coletar", item: "pao", qtd: 2, texto: "junte 2 pães" },
        { tipo: "levar", npc: "caio", item: "pao", qtd: 2, texto: "leve 2 pães para o Caio", dialogo: "rep-entrega", dialogo_falta: "rep-falta" },
      ],
    });
    expect(gerarRepetivel(2, cfg).passos).toEqual([{ tipo: "ir", texto: "vá até o lugar I e o lugar E", lugar: ["lugarI", "lugarE"], raio: 90, dialogo: "guia-rep-feito" }]);
    expect(gerarRepetivel(3, cfg).passos).toEqual([{ tipo: "coletar", texto: "junte 3 pães", item: "pao", qtd: 3, dialogo: "guia-rep-feito" }]);
    expect(gerarRepetivel(17, cfg).passos[0]).toMatchObject({ tipo: "ir", lugar: ["lugarB", "lugarF"] });
  });

  it("n from 1 to 50: valid ids, items, places, NPCs and dialogues; no placeholder left", () => {
    const tipos = new Set<string>();
    for (let n = 1; n <= 50; n++) {
      const d = gerarRepetivel(n, cfg);
      expect(d).toMatchObject({ id: `rep-${n}`, quem: "guia", repetivel: true });
      expect(numeroRepetivel(d.id)).toBe(n);
      expect((d.ao_concluir as { moedas: number }).moedas).toBeGreaterThan(0);
      for (const t of [d.titulo, d.descricao, ...d.passos.map((p) => p.texto)]) expect(t, `rep-${n}: ${t}`).not.toMatch(/[{}]/);
      const falas = [d.dialogo_oferta, d.dialogo_andamento, d.dialogo_feito];
      for (const p of d.passos) {
        tipos.add(p.tipo);
        if (p.dialogo) falas.push(p.dialogo);
        if ("item" in p) expect(cfg.itens).toHaveProperty(p.item);
        if ("npc" in p) expect(cfg.npcs).toHaveProperty(p.npc);
        if (p.tipo === "levar") falas.push(p.dialogo_falta);
        if (p.tipo === "ir") for (const l of p.lugar as string[]) expect(l in lugares, `rep-${n}: ${l}`).toBe(true);
      }
      for (const f of falas) expect(DIALOGOS, `rep-${n}: ${f}`).toContain(f);
    }
    expect([...tipos].sort()).toEqual(["coletar", "ir", "levar"]);
  });

  it("bad n, a bad file, an item with no name, too many places or an unknown place throws", () => {
    expect(() => gerarRepetivel(0, cfg)).toThrow();
    expect(() => gerarRepetivel(1.5, cfg)).toThrow();
    expect(() => carregarRepetiveis("quem: guia\n")).toThrow(/repetiveis\.yaml/);
    expect(() => carregarRepetiveis(YAML.replace("itens: [uva, pao, queijo]", "itens: [uva, pera]"))).toThrow(/pera/);
    expect(() => carregarRepetiveis(YAML.replace("quantos: 2", "quantos: 11"))).toThrow(/11 lugares/);
    const { lugarA: _, ...semA } = lugares;
    expect(() => new Missoes({ defs: [], lugares: semA, store, eventos, mundo: { npc: () => null }, repetiveis: cfg })).toThrow(/lugarA/);
  });
});

describe("repeatable quests in Missoes", () => {
  it("nothing written left and nothing running: the giver offers rep-1, then rep-2", () => {
    todasEscritasFeitas();
    expect(m.ofertaPara("guia")?.id).toBe("rep-1");
    expect(falar("guia")).toEqual(["guia-rep-oferta"]);
    expect(m.existe("rep-1")).toBe(true);
    expect(m.status("rep-1")).toBe("ativa");
    expect(m.ativa()?.id).toBe("rep-1");
    expect(m.aoFalar("guia").falas).toEqual(["guia-rep-andamento"]);
    expect(m.ofertaPara("guia")).toBeNull();
    cumprir("rep-1");
    expect(m.status("rep-1")).toBe("feita");
    expect(falar("guia")).toEqual(["guia-rep-oferta"]);
    expect(m.status("rep-2")).toBe("ativa");
    expect(m.repetiveis().map((d) => d.id)).toEqual(["rep-1", "rep-2"]);
  });

  it("the reward goes through entregarRecompensa like a written quest's", () => {
    const recompensa = vi.fn();
    m = new Missoes({ defs: ESCRITAS, lugares, store, eventos, mundo: { npc: () => null }, repetiveis: cfg, entregarRecompensa: recompensa });
    off();
    off = m.ligar();
    todasEscritasFeitas();
    falar("guia");
    cumprir("rep-1");
    expect(recompensa).toHaveBeenCalledWith({ moedas: 3 }, expect.objectContaining({ id: "rep-1", repetivel: true }));
  });

  it("Esc on the offer does not register it; the same rep-1 comes again", () => {
    todasEscritasFeitas();
    m.aoFalar("guia").depois?.("pulado");
    expect(s().missao("rep-1")).toBeUndefined();
    expect(m.existe("rep-1")).toBe(false);
    expect(m.ofertaPara("guia")?.id).toBe("rep-1");
  });

  it("with a written quest running the giver offers no repeatable, and says to come back", () => {
    todasEscritasFeitas();
    s().missaoZerar("bolo");
    falar("ana");
    expect(m.ofertaPara("guia")).toBeNull();
    expect(m.aoFalar("guia").falas).toEqual(["guia-rep-depois"]);
  });

  it("while the giver still has a written quest, that one comes first", () => {
    expect(m.ofertaPara("guia")?.id).toBe("explorar");
  });

  it("resumos show only the running repeatable and the last one done", () => {
    todasEscritasFeitas();
    for (const id of ["rep-1", "rep-2"]) { falar("guia"); cumprir(id); }
    falar("guia");
    const reps = m.resumos().filter((r) => r.repetivel).map((r) => [r.id, r.status]);
    expect(reps).toEqual([["rep-2", "feita"], ["rep-3", "ativa"]]);
    expect(m.resumos().filter((r) => !r.repetivel).map((r) => r.id)).toEqual(["explorar", "bolo"]);
  });

  it("a new instance and a save load re-register the repeatables in the save", () => {
    todasEscritasFeitas();
    falar("guia");
    s().pegarItem("pao", 1);
    const outra = novas();
    expect(outra.status("rep-1")).toBe("ativa");
    expect(outra.def("rep-1")).toEqual(m.def("rep-1"));

    const save = exportarJSON();
    s().zerar(); // emits carregou: rep-1 forgotten
    expect(m.existe("rep-1")).toBe(false);
    expect(m.ofertaPara("guia")?.id).toBe("explorar");
    importarJSON(save);
    expect(m.status("rep-1")).toBe("ativa");
  });

  it("zerar forgets a repeatable, so the same number is offered again", () => {
    todasEscritasFeitas();
    falar("guia");
    m.zerar("rep-1");
    expect(m.existe("rep-1")).toBe(false);
    expect(m.ofertaPara("guia")?.id).toBe("rep-1");
  });
});
