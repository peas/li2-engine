import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alvosDoPasso, montarGrafo, noId, vizinhos } from "./grafo.ts";
import { arquivosDoCaminho, lerJogo, lerLugaresTs, lerMissao, lerPessoasTs, SEM_MANIFESTO } from "./ler.ts";
import { descreverPasso, descreverRecompensa, iconePasso } from "./texto.ts";
import type { Conteudo } from "./tipos.ts";

/** A tiny game on disk, in the Três Ilhas layout, with one hole on purpose (the place "pico" exists nowhere); no manifest. */
function jogoDeMentira() {
  const raiz = mkdtempSync(join(tmpdir(), "jogo-"));
  const w = (rel: string, txt: string) => { mkdirSync(join(raiz, rel, ".."), { recursive: true }); writeFileSync(join(raiz, rel), txt); };
  w("src/game/missoes/bolo.yaml", `
id: bolo
titulo: "O bolo"
descricao: "A Nina quer um bolo."
quem: nina
dialogo_oferta: bolo-oferta
dialogo_andamento: bolo-andamento
dialogo_feito: bolo-feito
passos:
  - { tipo: coletar, texto: "colha 3 maçãs", item: maca, qtd: 3 }
  - { tipo: levar, texto: "leve para a Nina", npc: nina, item: maca, qtd: 3, dialogo: bolo-entrega, dialogo_falta: bolo-falta }
ao_concluir: { coracoes: 1, moedas: 4 }
`);
  w("src/game/missoes/pico.yaml", `
id: pico
titulo: "Até o pico"
descricao: "Suba."
quem: vovo
requer: [bolo]
dialogo_oferta: pico-oferta
dialogo_andamento: pico-andamento
dialogo_feito: pico-feito
passos:
  - { tipo: ir, texto: "vá ao pico", lugar: pico, raio: 20 }
  - { tipo: domar, texto: "dome a Brasa" }
ao_concluir: { itens: { bolo-de-fruta: 1 } }
`);
  w("src/game/missoes/quebrada.yaml", `
id: quebrada
titulo: "Sem passos"
descricao: "Faltam coisas."
quem: nina
dialogo_oferta: x
dialogo_andamento: x
dialogo_feito: x
passos: []
`);
  w("src/game/missoes/repetiveis.yaml", "quem: coruja\nmoldes: []\n");
  for (const d of ["bolo-oferta", "bolo-andamento", "bolo-feito", "bolo-entrega", "bolo-falta", "pico-oferta", "pico-andamento", "pico-feito", "x", "morador-nina", "morador-vovo"])
    w(`src/game/dialogos/${d}.yaml`, `personagem: Nina\nretrato: nina\nfalas:\n  - texto: "Oi, *${d}*!"\n  - { quem: Vovô, texto: "Olá." }\n`);
  w("src/game/moradores.yaml", `moradores:\n  - { id: nina, nome: Nina, papel: menina, lugar: vila, dialogo: morador-nina }\n  - { id: vovo, nome: Vovô Bento, papel: velho, lugar: vila, dialogo: morador-vovo }\n`);
  w("src/world/lugares.ts", `
const VILA = { x: 1, z: 2 };
export const PLACES = {
  /** Her house. */
  casa: spot(0, 640, 36),
  /** The village: a flat terrace
   * west of the centre. */
  vila: { ...spot(VILA.x, VILA.z, 150, 0), floor: 18 },
  pomares: [spot(600, 120, 30), spot(820, 60, 30)],
  paths: [
    [[1, 2], [3, 4]],
  ] as [number, number][][],
  // ---- version 2 ----
  caverna: spot(1, 2, 3),
} satisfies Record<string, unknown>;
export type PlaceId = keyof typeof PLACES;
`);
  w("src/game/itens.yaml", `itens:\n  - { id: maca, nome: maçã, tipo: fruta, coracoes: 1, icone: maca, descricao: "cura 1" }\n  - { id: bolo-de-fruta, nome: bolo de fruta, tipo: prato, coracoes: 4, icone: b, descricao: "bolo" }\n  - { id: morango, nome: morango, tipo: fruta, coracoes: 1, icone: m, descricao: "m" }\n`);
  w("src/game/receitas.yaml", `receitas:\n  - { id: bolo-de-fruta, nome: bolo de fruta, ingredientes: { morango: 2, maca: 1 }, resultado: { item: bolo-de-fruta, coracoes: 4 }, descricao: "r" }\n`);
  w("src/game/novidades/novidades.yaml", `novidades:\n  - { versao: 1, data: 2026-10-22, titulo: "Estreia", falas: ["Oi!"] }\n  - { versao: 2, data: 2026-10-23, titulo: "Mais", falas: ["Tchau!"] }\n`);
  w("src/game/ui/ajuda.yaml", `secoes:\n  - titulo: A pé\n    linhas:\n      - { tecla: W, texto: anda }\n`);
  return raiz;
}

describe("lerJogo", () => {
  const c = lerJogo(jogoDeMentira());
  it("reads every kind of content and says which file answered", () => {
    expect(c.missoes.map((m) => m.id)).toEqual(["bolo", "pico", "quebrada"]);
    expect(c.dialogos).toHaveLength(11);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Nina", "Vovô Bento"]);
    expect(c.itens).toHaveLength(3);
    expect(c.receitas[0].ingredientes).toEqual({ morango: 2, maca: 1 });
    expect(c.novidades.map((n) => n.versao)).toEqual([2, 1]);
    expect(c.ajuda[0].linhas[0]).toEqual({ tecla: "W", titulo: undefined, texto: "anda" });
    expect(c.lidos.missoes).toBe("src/game/missoes/*.yaml");
    expect(c.lidos.lugares).toBe("src/world/lugares.ts");
  });
  it("without jogo.yaml: the default paths, and it says so", () => {
    expect(c.jogo).toMatchObject({ titulo: c.jogo.nome });
    expect(c.lidos.manifesto).toBe(SEM_MANIFESTO);
    expect(c.avisos).toContain(SEM_MANIFESTO);
    expect(c.passosExtras).toEqual({});
    expect([c.colhiveis, c.cutscenes, c.regioes]).toEqual([[], [], []]);
    expect(c.avisos.some((a) => /^(colhiveis|regioes|cutscenes):/.test(a))).toBe(false);
  });
  it("missing kinds and templates are warnings, not errors", () => {
    expect(c.poderes).toEqual([]);
    expect(c.avisos.some((a) => a.startsWith("poderes:"))).toBe(true);
    expect(c.avisos.some((a) => a.includes("repetiveis.yaml"))).toBe(true);
  });
  it("a quest the engine schema refuses is kept, with the complaint attached", () => {
    const q = c.missoes.find((m) => m.id === "quebrada")!;
    expect(q.passos).toEqual([]);
    expect(q.avisos[0]).toMatch(/schema do engine/);
    expect(c.missoes.find((m) => m.id === "bolo")!.avisos).toEqual([]);
  });
  it("dialogue lines keep the speaker (file default or per line)", () => {
    const d = c.dialogos.find((d) => d.id === "bolo-oferta")!;
    expect(d.falas.map((f) => f.quem)).toEqual(["Nina", "Vovô"]);
    expect(d.retrato).toBe("nina");
  });
});

describe("lerLugaresTs", () => {
  const l = lerLugaresTs(`export const PLACES = {
  /** Her house. */
  casa: spot(0, 640, 36),
  /** The village: a flat terrace
   * west of the centre. */
  vila: { ...spot(1, 2, 150, 0), floor: 18 },
  pomares: [spot(600, 120, 30), spot(820, 60, 30)],
  paths: [
    [[1, 2], [3, 4]],
  ] as [number, number][][],
  // ---- version 2 ----
  caverna: spot(1, 2, 3),
};`);
  it("reads the first-level keys, their comment, and marks lists", () => {
    expect(l.map((x) => x.id)).toEqual(["casa", "vila", "pomares", "paths", "caverna"]);
    expect(l[0].descricao).toBe("Her house.");
    expect(l[1].descricao).toBe("The village: a flat terrace west of the centre.");
    expect(l[2].lista).toBe(true);
    expect(l[4].descricao).toBeUndefined();
  });
  it("reads the Dragão's layout (a plain `};` end) and the Três Ilhas' (`} satisfies`)", () => {
    expect(lerLugaresTs("export const PLACES = {\n  lake: spot(1,2,3),\n  island: spot(1,2,3),\n};\nconst X = 1;").map((x) => x.id)).toEqual(["lake", "island"]);
  });
  it("complains when there is no PLACES", () => {
    expect(() => lerLugaresTs("const nada = 1;")).toThrow(/PLACES/);
  });
});

describe("lerPessoasTs (the Dragão's PESSOAS)", () => {
  it("reads id, nome and dialogo of each entry", () => {
    expect(lerPessoasTs(`export const PESSOAS: Pessoa[] = [
  {
    id: "crianca", nome: "a criança", dialogo: "morador-crianca", kind: "crianca",
    look: { height: 1.2 },
  },
  { id: "vovo", nome: "o vovô", dialogo: "morador-vovo", kind: "comum", look: {} },
];`)).toEqual([{ id: "crianca", nome: "a criança", dialogo: "morador-crianca" }, { id: "vovo", nome: "o vovô", dialogo: "morador-vovo" }]);
  });
});

describe("lerMissao", () => {
  it("accepts the games' own step types (achar, domar, apagar_incendio, levar_voando)", () => {
    const m = lerMissao({
      id: "x", titulo: "X", descricao: "d", quem: "a", dialogo_oferta: "o", dialogo_andamento: "a", dialogo_feito: "f",
      passos: [
        { tipo: "achar", texto: "t", objeto: "porco", lugar: "lago", raio: 6 },
        { tipo: "apagar_incendio", texto: "t", incendio: "feno", lugar: "incendio-feno", raio: 40 },
        { tipo: "levar_voando", texto: "t", npc: "moca", lugar: "tower", raio: 30, dialogo_monta: "m", dialogo: "d" },
      ],
    }, "x.yaml");
    expect(m.avisos).toEqual([]);
    expect(m.dificuldade).toBe("facil");
  });
  it("refuses what is not a quest at all", () => {
    expect(() => lerMissao({ quem: 1 }, "x.yaml")).toThrow(/não é uma missão/);
  });
});

describe("montarGrafo", () => {
  const g = montarGrafo(lerJogo(jogoDeMentira()));
  const ids = new Set(g.nos.map((n) => n.id));
  it("every edge points at nodes that exist", () => {
    for (const a of g.arestas) {
      expect(ids.has(a.de), `${a.id} de ${a.de}`).toBe(true);
      expect(ids.has(a.para), `${a.id} para ${a.para}`).toBe(true);
    }
  });
  it("an unknown id becomes a dashed placeholder and a visible warning, never an error", () => {
    const pico = g.nos.find((n) => n.id === noId("lugar", "pico"))!;
    expect(pico.desconhecido).toBe(true);
    expect(g.avisos).toContainEqual('missão "Até o pico", passo 1: lugar "pico" não existe em nada que eu li');
    expect(g.avisos).toContainEqual('missão "Sem passos": não passou no schema do engine: ✖ Too small: expected array to have >=1 items → at passos');
  });
  it("draws the quest's links: giver, requirement, conversations, steps and rewards", () => {
    const tipo = (t: string) => g.arestas.filter((a) => a.tipo === t).map((a) => `${a.de}→${a.para}`);
    expect(tipo("da")).toContain("pessoa:nina→missao:bolo");
    expect(tipo("destrava")).toEqual(["missao:bolo→missao:pico"]);
    expect(tipo("coleta")).toEqual(["missao:bolo→item:maca"]);
    expect(tipo("leva")).toEqual(["missao:bolo→item:maca"]);
    expect(tipo("leva_para")).toEqual(["missao:bolo→pessoa:nina"]);
    expect(tipo("vai_a")).toEqual(["missao:pico→lugar:pico"]);
    expect(tipo("recompensa")).toEqual(["missao:pico→item:bolo-de-fruta"]);
    expect(g.arestas.filter((a) => a.tipo === "conversa" && a.de === "missao:bolo").map((a) => a.rotulo)).toEqual(["oferta", "andamento", "feito", "passo 2", "passo 2"]);
    expect(tipo("usa")).toEqual(["item:morango→receita:bolo-de-fruta", "item:maca→receita:bolo-de-fruta"]);
    expect(tipo("faz")).toEqual(["receita:bolo-de-fruta→item:bolo-de-fruta"]);
    expect(tipo("mora_em")).toEqual(["pessoa:nina→lugar:vila", "pessoa:vovo→lugar:vila"]);
  });
  it("story mode finds the targets of each step in order", () => {
    expect(alvosDoPasso(g, "bolo", 0).map((a) => a.para)).toEqual(["item:maca"]);
    expect(alvosDoPasso(g, "bolo", 1).map((a) => a.para)).toEqual(["item:maca", "pessoa:nina", "dialogo:bolo-entrega", "dialogo:bolo-falta"]);
    expect(alvosDoPasso(g, "pico", 1)).toEqual([]);
  });
  it("neighbours are unique and go both ways", () => {
    expect(vizinhos(g, "item:maca").sort()).toEqual(["missao:bolo", "receita:bolo-de-fruta"]);
  });
});

/** The same tiny game moved around and described by a manifest: other paths, its own step types, colhíveis, regiões, a cena. */
function jogoComManifesto() {
  const raiz = mkdtempSync(join(tmpdir(), "jogo-m-"));
  const w = (rel: string, txt: string) => { mkdirSync(join(raiz, rel, ".."), { recursive: true }); writeFileSync(join(raiz, rel), txt); };
  w("jogo.yaml", `
nome: Ilha de Mentira
conteudo:
  missoes: dados/missoes/*.yaml
  dialogos: dados/falas/*.yml
  moradores: dados/gente.yaml
  itens: dados/coisas.yaml
  lugares: mapa/lugares.ts
  colhiveis: dados/colhiveis.yaml
  regioes: dados/regioes.yaml
  cutscenes: dados/cenas/*.yaml
  receitas: dados/nao-existe.yaml
passos_extras:
  achar: { icone: "🔍", descricao: "achar {objeto} em {lugar}", campos: { objeto: id, lugar: lugar, raio: numero } }
  levar_voando: { icone: "🪽", descricao: "levar {npc} voando até {lugar}", campos: { npc: pessoa, lugar: lugar, raio: numero, dialogo_monta: id, dialogo: id } }
  domar: { descricao: "domar" }
`);
  w("dados/missoes/porco.yaml", `
id: porco
titulo: "O porco"
descricao: "Ache o porco."
quem: nina
dialogo_oferta: oi
dialogo_andamento: oi
dialogo_feito: oi
passos:
  - { tipo: achar, texto: "ache o porco", objeto: porco, lugar: lago, raio: 6 }
  - { tipo: levar_voando, texto: "leve a Nina", npc: nina, lugar: casa, raio: 30, dialogo_monta: monta, dialogo: oi }
  - { tipo: domar, texto: "dome" }
`);
  w("dados/missoes/LEIA.md", "não é missão");
  for (const d of ["oi", "monta"]) w(`dados/falas/${d}.yml`, `personagem: Nina\nfalas:\n  - texto: "Oi"\n`);
  w("dados/gente.yaml", "moradores:\n  - { id: nina, nome: Nina, lugar: casa, dialogo: oi }\n");
  w("dados/coisas.yaml", "itens:\n  - { id: maca, nome: maçã }\n  - { id: cogumelo, nome: cogumelo }\n");
  w("mapa/lugares.ts", "export const PLACES = {\n  casa: spot(0, 0, 10),\n  lago: spot(1, 1, 50),\n  pomares: [spot(1, 2, 3)],\n};\n");
  w("dados/colhiveis.yaml", `colhiveis:
  - { item: maca, onde: pomares, arranjo: macieiras, quantos: [4, 5], semente: 1 }
  - { item: cogumelo, onde: pomares, arranjo: aneis, quantos: 2, semente: 1, em: [0] }
  - { item: cogumelo, onde: pomares, arranjo: tufos, quantos: [6, 10], semente: 2 }
  - { item: abacaxi, onde: lua, arranjo: coqueiros, quantos: 3, semente: 1 }
`);
  w("dados/regioes.yaml", `regioes:
  - { id: lago, nome: o lago, quando: [{ perto_de: lago, fator: 0.8 }, { altura_acima: 75 }] }
  - { id: campo, nome: o campo, padrao: true }
`);
  w("dados/cenas/chegada.yaml", `# The arrival: she sees the lake.
# Short.
id: chegada
pulavel: segurar
gatilho: { tipo: lugar, lugar: lago, raio: 20 }
ritual: { esconder_hud: true, salvar_ao_fim: false }
cameras: { a: { pos: [0, 1, 2] }, b: { pos: [0, 1, 2] } }
passos:
  - esperar: 1
  - esperar: 2
`);
  w("dados/cenas/porco.yaml", "id: porco-cena\ngatilho: { tipo: missao, missao: porco, passo: domar }\npassos: [{ esperar: 1 }]\n");
  w("dados/cenas/sem-gatilho.yaml", "id: sem-gatilho\npassos: [{ esperar: 1 }]\n");
  return raiz;
}

describe("lerJogo with jogo.yaml", () => {
  const c = lerJogo(jogoComManifesto());
  const g = montarGrafo(c);
  it("reads the paths the manifest gives (globs, other names) and its title", () => {
    expect(c.jogo.titulo).toBe("Ilha de Mentira");
    expect(c.lidos.manifesto).toBe("jogo.yaml");
    expect(c.lidos.missoes).toBe("dados/missoes/*.yaml");
    expect(c.lidos.pessoas).toBe("dados/gente.yaml");
    expect(c.missoes.map((m) => m.id)).toEqual(["porco"]);
    expect(c.missoes[0].arquivo).toBe("dados/missoes/porco.yaml");
    expect(c.dialogos.map((d) => d.id)).toEqual(["monta", "oi"]);
    expect(c.pessoas.map((p) => p.id)).toEqual(["nina"]);
    expect(c.avisos).not.toContain(SEM_MANIFESTO);
  });
  it("a path the manifest gives and nothing is there is a warning; a kind it does not list is silent", () => {
    expect(c.avisos).toContainEqual("receitas: jogo.yaml diz dados/nao-existe.yaml, mas não há nada lá");
    expect(c.avisos.some((a) => a.startsWith("poderes"))).toBe(false);
  });
  it("the game's own step types come from passos_extras (schema, text, icon)", () => {
    const m = c.missoes[0];
    expect(m.avisos).toEqual([]);
    expect(m.passos[1].dialogo_monta).toBe("monta");
    const nome = (_t: string, k: string) => k.toUpperCase();
    expect(m.passos.map((p) => descreverPasso(p, nome, c.passosExtras))).toEqual(["achar porco em LAGO", "levar NINA voando até CASA", "domar"]);
    expect(m.passos.map((p) => iconePasso(p.tipo, c.passosExtras))).toEqual(["🔍", "🪽", "▫️"]);
    expect(iconePasso("ir", c.passosExtras)).toBe("🧭");
  });
  it("achar is the engine's (batch 3): described and iconed without a manifest entry; an older manifest's entry is ignored by the schema", () => {
    const nome = (_t: string, k: string) => k.toUpperCase();
    expect(descreverPasso({ tipo: "achar", texto: "t", objeto: "porco", lugar: "lago" }, nome)).toBe("achar porco em LAGO");
    expect(iconePasso("achar")).toBe("🔍");
  });
  it("a step's fields link by their manifest type; every dialogo_* field is a conversation", () => {
    expect(alvosDoPasso(g, "porco", 0).map((a) => `${a.tipo}→${a.para}`)).toEqual(["vai_a→lugar:lago"]);
    expect(alvosDoPasso(g, "porco", 1).map((a) => `${a.tipo}→${a.para}`)).toEqual(["fala_com→pessoa:nina", "vai_a→lugar:casa", "conversa→dialogo:oi", "conversa→dialogo:monta"]);
  });
  it("colhíveis: one node per entry (item → place), with what the panel shows", () => {
    expect(c.colhiveis.map((x) => x.id)).toEqual(["maca-pomares", "cogumelo-pomares", "cogumelo-pomares-2", "abacaxi-lua"]);
    expect(c.colhiveis[1]).toEqual({ id: "cogumelo-pomares", item: "cogumelo", onde: "pomares", arranjo: "aneis", quantos: 2, semente: 1, em: [0] });
    const de = (id: string) => g.arestas.filter((a) => a.de === `colhivel:${id}`).map((a) => `${a.tipo}→${a.para}`);
    expect(de("maca-pomares")).toEqual(["colhe→item:maca", "colhe_em→lugar:pomares"]);
    expect(g.nos.find((n) => n.id === "colhivel:maca-pomares")!.nome).toBe("maçã em pomares");
    expect(g.avisos.some((a) => a.includes('"abacaxi"'))).toBe(true);
    expect(g.avisos.some((a) => a.includes('"lua"'))).toBe(true);
  });
  it("regiões: one node each, linked to the places they are near", () => {
    expect(c.regioes.map((r) => r.id)).toEqual(["lago", "campo"]);
    expect(c.regioes[1].padrao).toBe(true);
    expect(g.arestas.filter((a) => a.tipo === "cobre").map((a) => `${a.de}→${a.para}`)).toEqual(["regiao:lago→lugar:lago"]);
  });
  it("cutscenes: id, size, trigger (to the place or the quest), ritual, top comment", () => {
    const chegada = c.cutscenes.find((x) => x.id === "chegada")!;
    expect(chegada).toMatchObject({ pulavel: "segurar", passos: 2, cameras: 2, gatilho: { tipo: "lugar", lugar: "lago", raio: 20 }, ritual: { esconder_hud: true, salvar_ao_fim: false }, descricao: "The arrival: she sees the lake. Short.", arquivo: "dados/cenas/chegada.yaml" });
    expect(c.cutscenes.map((x) => x.id)).toEqual(["chegada", "porco-cena", "sem-gatilho"]);
    const dispara = g.arestas.filter((a) => a.tipo === "dispara").map((a) => `${a.de}→${a.para}:${a.rotulo}`);
    expect(dispara).toEqual(["cutscene:chegada→lugar:lago:toca perto de (20 m)", "cutscene:porco-cena→missao:porco:toca no passo domar"]);
  });
  it("every edge points at nodes that exist", () => {
    const ids = new Set(g.nos.map((n) => n.id));
    for (const a of g.arestas) expect(ids.has(a.de) && ids.has(a.para), a.id).toBe(true);
  });
  it("a manifest that does not parse is a warning, and the default paths are used", () => {
    const raiz = jogoDeMentira();
    writeFileSync(join(raiz, "jogo.yaml"), "conteudo: 3\n");
    const r = lerJogo(raiz);
    expect(r.avisos.some((a) => a.startsWith("jogo.yaml:"))).toBe(true);
    expect(r.lidos.manifesto).toBe(SEM_MANIFESTO);
    expect(r.missoes.map((m) => m.id)).toEqual(["bolo", "pico", "quebrada"]);
  });
});

describe("arquivosDoCaminho", () => {
  const raiz = jogoComManifesto();
  it("a file, a folder (its YAMLs) and a glob", () => {
    const rel = (xs: string[]) => xs.map((x) => x.slice(raiz.length + 1));
    expect(rel(arquivosDoCaminho(raiz, "dados/gente.yaml"))).toEqual(["dados/gente.yaml"]);
    expect(rel(arquivosDoCaminho(raiz, "dados/missoes"))).toEqual(["dados/missoes/porco.yaml"]);
    expect(rel(arquivosDoCaminho(raiz, "dados/cenas/*.yaml"))).toEqual(["dados/cenas/chegada.yaml", "dados/cenas/porco.yaml", "dados/cenas/sem-gatilho.yaml"]);
    expect(arquivosDoCaminho(raiz, "dados/nada/*.yaml")).toEqual([]);
    expect(arquivosDoCaminho(raiz, "nada.yaml")).toEqual([]);
  });
});

describe("the example game, and the one in JOGO if set", () => {
  for (const pasta of [fileURLToPath(new URL("../../../exemplos/missoes-dos-jogos", import.meta.url)), ...(process.env.JOGO ? [process.env.JOGO] : [])]) {
    it.skipIf(!existsSync(pasta))(`${pasta}: loads, and every edge points at a node`, () => {
      const g = montarGrafo(lerJogo(pasta));
      const ids = new Set(g.nos.map((n) => n.id));
      expect(g.nos.filter((n) => n.tipo === "missao").length).toBeGreaterThan(0);
      for (const a of g.arestas) expect(ids.has(a.de) && ids.has(a.para)).toBe(true);
    });
  }
});
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("o mundo mudou (oferecer_apos, ao_concluir.mundo)", () => {
  const doc = {
    id: "racao", titulo: "Ração", descricao: "As galinhas não comem.", quem: "maria", oferecer_apos: "ovo_acabou",
    dialogo_oferta: "o", dialogo_andamento: "a", dialogo_feito: "f",
    passos: [{ tipo: "coletar", texto: "t", item: "racao", qtd: 3 }],
    ao_concluir: { coracoes: 1, mundo: { ovos_por_vez: 3, galinhas_com_fome: false } },
  };
  it("reads both fields, with the engine schema and with the loose shape", () => {
    const m = lerMissao(doc, "racao.yaml");
    expect(m.avisos).toEqual([]);
    expect(m.oferecer_apos).toBe("ovo_acabou");
    expect(m.ao_concluir.mundo).toEqual({ ovos_por_vez: 3, galinhas_com_fome: false });
    const solta = lerMissao({ ...doc, passos: [] }, "racao.yaml");
    expect(solta.avisos.length).toBe(1);
    expect(solta.oferecer_apos).toBe("ovo_acabou");
    expect(solta.ao_concluir.mundo).toEqual({ ovos_por_vez: 3, galinhas_com_fome: false });
  });
  it("the reward line says what changed in the world", () => {
    expect(descreverRecompensa(doc.ao_concluir, (_t, k) => k)).toBe("1 ❤️, 🌍 ovos_por_vez=3, 🌍 galinhas_com_fome=false");
    expect(descreverRecompensa({ mundo: { quadro: "joana" } }, (_t, k) => k)).toBe('🌍 quadro="joana"');
  });
  it("one node per world key: the quest changes it, a quest waits for one", () => {
    const vazio: Conteudo = {
      jogo: { nome: "t", pasta: "/t", titulo: "T" }, missoes: [lerMissao(doc, "racao.yaml")], dialogos: [], pessoas: [], lugares: [],
      itens: [], receitas: [], poderes: [], novidades: [], ajuda: [], colhiveis: [], cutscenes: [], regioes: [], passosExtras: {}, lidos: {}, avisos: [],
    };
    const g = montarGrafo(vazio);
    const mundo = g.nos.filter((n) => n.tipo === "mundo");
    expect(mundo.map((n) => n.chave).sort()).toEqual(["galinhas_com_fome", "ovo_acabou", "ovos_por_vez"]);
    expect(mundo.every((n) => !n.desconhecido)).toBe(true);
    const tipo = (t: string) => g.arestas.filter((a) => a.tipo === t).map((a) => `${a.de}→${a.para} ${a.rotulo}`);
    expect(tipo("muda")).toEqual(["missao:racao→mundo:ovos_por_vez muda ovos_por_vez=3", "missao:racao→mundo:galinhas_com_fome muda galinhas_com_fome=false"]);
    expect(tipo("espera")).toEqual(["mundo:ovo_acabou→missao:racao só depois de"]);
    expect(g.avisos.filter((a) => /mundo/.test(a))).toEqual([]);
  });
});
