import { describe, expect, it } from "vitest";
import { MINUTOS_POR_DIA, diaConta, diasReaisDesde, faltaParaODia, textoFalta } from "./tempo";

describe("tempo: a day counts only after 10 minutes of play, or when real days pass", () => {
  it("counts the minutes still missing and rounds up", () => {
    expect(MINUTOS_POR_DIA).toBe(10);
    expect(faltaParaODia(0)).toBe(600);
    expect(faltaParaODia(599)).toBe(1);
    expect(faltaParaODia(600)).toBe(0);
    expect(faltaParaODia(5000)).toBe(0);
    expect(diaConta(599)).toBe(false);
    expect(diaConta(600)).toBe(true);
    expect(textoFalta(0)).toBe("faltam 10 minutos");
    expect(textoFalta(599)).toBe("falta 1 minuto");
    expect(textoFalta(541)).toBe("falta 1 minuto");
    expect(textoFalta(540)).toBe("falta 1 minuto");
    expect(textoFalta(539)).toBe("faltam 2 minutos");
    expect(textoFalta(600)).toBe("");
  });

  it("real days are calendar days, never counted before the first play", () => {
    const noite = new Date(2026, 9, 21, 22, 0).getTime();
    const manha = new Date(2026, 9, 22, 8, 0).getTime();
    expect(diasReaisDesde(0, manha)).toBe(0);
    expect(diasReaisDesde(noite, noite + 60000)).toBe(0);
    expect(diasReaisDesde(noite, manha)).toBe(1);
    expect(diasReaisDesde(noite, manha + 2 * 86400000)).toBe(3);
    expect(diasReaisDesde(manha, noite)).toBe(0);
  });
});
