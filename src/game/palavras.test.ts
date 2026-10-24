import { describe, expect, it } from "vitest";
import { FEMININOS_PADRAO, comArtigo, pluralDe, textoCoracoes } from "./palavras";

describe("palavras", () => {
  it("hearts in quarters", () => {
    expect([0.25, 0.5, 0.75, 1, 1.5, 2.75, 0, 3, -1, 1.3].map(textoCoracoes)).toEqual(["¼", "½", "¾", "1", "1½", "2¾", "0", "3", "0", "1¼"]);
  });

  it("the article by the first word; a game can pass its feminine nouns", () => {
    expect(comArtigo("maçã")).toBe("a maçã");
    expect(comArtigo("banana")).toBe("a banana");
    expect(comArtigo("peixe")).toBe("o peixe");
    expect(comArtigo("carne de vaca")).toBe("a carne de vaca");
    expect(FEMININOS_PADRAO.has("carne")).toBe(true);
    expect(comArtigo("flor azul")).toBe("o flor azul");
    expect(comArtigo("flor azul", new Set(["flor"]))).toBe("a flor azul");
  });

  it("plural of a name, keeping what follows de/do/da", () => {
    expect(pluralDe("maçã", 1)).toBe("maçã");
    expect(pluralDe("maçã", 3)).toBe("maçãs");
    expect(pluralDe("peixe assado", 2)).toBe("peixes assados");
    expect(pluralDe("doce de coco", 2)).toBe("doces de coco");
    expect(pluralDe("flor", 2)).toBe("flores");
    expect(pluralDe("pão", 0)).toBe("pãos");
  });
});
