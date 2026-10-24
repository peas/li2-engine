import { afterEach, describe, expect, it } from "vitest";
import { audioUrl, configurarAudio } from "./base";

describe("audioUrl", () => {
  afterEach(() => configurarAudio({ base: "" }));

  it("defaults to audio/ relative to the page", () => {
    expect(audioUrl("musica-campo.mp3")).toBe("audio/musica-campo.mp3");
  });

  it("serves from the base the game configures (dev: BASE_URL + audio/)", () => {
    configurarAudio({ base: "/tresilhas/audio/" });
    expect(audioUrl("falas/index.json")).toBe("/tresilhas/audio/falas/index.json");
  });

  it("works with or without the trailing slash (published: the R2 bucket)", () => {
    configurarAudio({ base: "https://midia.paulo.com.br/tresilhas/audio/" });
    expect(audioUrl("falas/a/abc.mp3")).toBe("https://midia.paulo.com.br/tresilhas/audio/falas/a/abc.mp3");
    configurarAudio({ base: "https://midia.paulo.com.br/tresilhas/audio" });
    expect(audioUrl("musica-calma.mp3")).toBe("https://midia.paulo.com.br/tresilhas/audio/musica-calma.mp3");
  });

  it("an empty base falls back to the default", () => {
    configurarAudio({ base: "" });
    expect(audioUrl("x.mp3")).toBe("audio/x.mp3");
  });
});
