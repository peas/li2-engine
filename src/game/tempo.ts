/**
 * Game time that must stay visible (rule of the first game, 21/10/2026): the day advances when the player sleeps, but
 * a day only counts if at least `minutosPorDia` were played in it ("não vale dormir direto"), OR when real calendar
 * days pass while the game is closed (Animal Crossing style: the save keeps the wall-clock of the last session).
 * Pure functions so vitest fixes the rule; the store (`criarStore`) calls them and the game shows the result.
 */
export const MINUTOS_POR_DIA = 10;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Seconds still to play before sleeping turns the day (0 = it counts now). */
export function faltaParaODia(segundosHoje: number, minutosPorDia = MINUTOS_POR_DIA): number {
  return Math.max(0, minutosPorDia * 60 - segundosHoje);
}

/** Does sleeping now turn the day? */
export function diaConta(segundosHoje: number, minutosPorDia = MINUTOS_POR_DIA): boolean {
  return faltaParaODia(segundosHoje, minutosPorDia) === 0;
}

/** Whole calendar days between the last time she played (`ultimaVez`, ms epoch; 0 = never) and `agora` (ms). */
export function diasReaisDesde(ultimaVez: number, agora: number): number {
  if (!ultimaVez || agora <= ultimaVez) return 0;
  // calendar days, not 24 h blocks: played at 22:00, back at 08:00 = 1 day away
  const dia = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / MS_POR_DIA);
  return Math.max(0, dia(agora) - dia(ultimaVez));
}

/** "faltam 7 minutos" / "falta 1 minuto" / "" when the day counts. Rounds up so it never says 0. */
export function textoFalta(segundosHoje: number, minutosPorDia = MINUTOS_POR_DIA): string {
  const s = faltaParaODia(segundosHoje, minutosPorDia);
  if (s <= 0) return "";
  const m = Math.ceil(s / 60);
  return m === 1 ? "falta 1 minuto" : `faltam ${m} minutos`;
}

/** "1 dia" / "3 dias" / "1 dormida" / "2 dormidas". */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
