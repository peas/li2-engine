import { describe, expect, it } from "vitest";
import { carregarVozes, presetsDasVozes } from "./vozes";

const YAML = `
novidades: coruja
mudos: [placa]
vozes:
  coruja:  { motor: kokoro, voz: pm_santa }
  padeira: { motor: piper,  voz: pt_BR-faber-medium, tom: 1.26, velocidade: 1.07 }
`;

describe("vozes.yaml", () => {
  it("loads the table with defaults and builds the system-voice presets", () => {
    const v = carregarVozes(YAML);
    expect(v.novidades).toBe("coruja");
    expect(v.extras).toEqual([]);
    expect(v.vozes.coruja).toEqual({ motor: "kokoro", voz: "pm_santa", tom: 1, velocidade: 1 });
    expect(presetsDasVozes(v)).toEqual({ coruja: { pitch: 1, rate: 1 }, padeira: { pitch: 1.26, rate: 1.07 }, placa: null });
    expect(carregarVozes("vozes: {}").mudos).toEqual([]);
  });

  it("refuses an unknown engine, a missing voice and an upper-case portrait, naming the file", () => {
    expect(() => carregarVozes("vozes:\n  a: { motor: say, voz: x }", "x.yaml")).toThrow(/x\.yaml/);
    expect(() => carregarVozes("vozes:\n  a: { motor: piper }")).toThrow();
    expect(() => carregarVozes("vozes:\n  Clara: { motor: piper, voz: x }")).toThrow(/minúsculo/);
    expect(() => carregarVozes("mudos: [a]\nvozes:\n  a: { motor: piper, voz: x }")).toThrow(/vozes e em mudos/);
  });
});
