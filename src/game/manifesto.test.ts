import { describe, expect, it } from "vitest";
import { lerManifesto, preencherDescricao } from "./manifesto";

const OK = `
nome: Jogo de Mentira
conteudo:
  missoes: src/game/missoes/*.yaml
  itens: src/game/itens.yaml
passos_extras:
  achar: { icone: "🔍", descricao: "achar {objeto} em {lugar}", campos: { objeto: id, lugar: lugar, raio: numero } }
  domar: { descricao: "domar" }
`;

describe("lerManifesto", () => {
  it("reads the name, the content paths and the extra step types", () => {
    const m = lerManifesto(OK);
    expect(m.nome).toBe("Jogo de Mentira");
    expect(m.conteudo.missoes).toBe("src/game/missoes/*.yaml");
    expect(Object.keys(m.passos_extras)).toEqual(["achar", "domar"]);
    expect(m.passos_extras.achar.campos).toEqual({ objeto: "id", lugar: "lugar", raio: "numero" });
    expect(m.passos_extras.domar.campos).toBeUndefined();
  });
  it("passos_extras is optional", () => {
    expect(lerManifesto("nome: X\nconteudo: { itens: a.yaml }\n").passos_extras).toEqual({});
  });
  it("a wrong manifest is a readable error with the file name", () => {
    expect(() => lerManifesto("conteudo: {}\n", "x/jogo.yaml")).toThrow(/x\/jogo\.yaml/);
    expect(() => lerManifesto("nome: X\nconteudo: {}\npassos_extras: { a: { descricao: d, campos: { b: cor } } }\n")).toThrow(/jogo\.yaml/);
    expect(() => lerManifesto("nome: [\n")).toThrow(/YAML inválido/);
  });
});

describe("preencherDescricao", () => {
  const nome = (tipo: string, chave: string) => `${tipo}:${chave}`;
  it("names lugar/pessoa/item fields and leaves the others raw; a missing field reads ?", () => {
    const m = lerManifesto(OK);
    expect(preencherDescricao(m.passos_extras.achar, { objeto: "porco", lugar: "lago" }, nome)).toBe("achar porco em lugar:lago");
    expect(preencherDescricao(m.passos_extras.achar, { lugar: ["a", "b"] }, nome)).toBe("achar ? em lugar:a, lugar:b");
    expect(preencherDescricao(m.passos_extras.domar, {}, nome)).toBe("domar");
  });
});
