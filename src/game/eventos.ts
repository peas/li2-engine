import { createNanoEvents, type Emitter } from "nanoevents";

/**
 * "Something just happened" (UX pattern 4): the store says how things are, these events say what changed, so sound,
 * particles and the "+1 maçã" text subscribe here and the HUD subscribes to the store. The engine defines the events
 * its own modules emit or listen to; a game extends the interface with its own (`criarEventos<MeusEventos>()`).
 */
export interface EventosBase {
  pegouItem: (item: string, qtd: number) => void;
  /** An item left the inventory by use (eaten, handed over, cooked). */
  usouItem: (item: string, qtd: number) => void;
  /** She slept; the day number after, and whether the day turned. */
  dormiu: (dia: number, novoDia: boolean) => void;
  /** The game opened: how many real calendar days passed since the last save (each advanced the day), and the day now. */
  voltou: (diasReais: number, dia: number) => void;
  missaoIniciada: (id: string) => void;
  /** Quest step advanced: quest id and the new step index (the HUD and the compass follow). */
  missaoPasso: (id: string, passo: number) => void;
  /** Progress inside a step (a place reached, an item counted): quest id and the counter key. */
  missaoAvancou: (id: string, chave: string) => void;
  missaoConcluida: (id: string) => void;
  /** An `achar` step found `objeto` (the game answered `mundo.achou`); the find is also kept in the quest's counters. */
  achou: (objeto: string) => void;
  /** She handed `qtd` of `item` to an NPC (a levar step). */
  entregou: (npc: string, item: string, qtd: number) => void;
  /** The save was written (`motivo`: dormiu, missao, menu, manual...). */
  salvou: (motivo: string) => void;
  carregou: () => void;
  /** The world changed for good (the `mundo` slice): the key, its new value and why (a quest id, or "mundo"). */
  mundoMudou: (chave: string, valor: unknown, motivo?: string) => void;
  /** A cutscene started / ended (its id). */
  cenaComecou: (id: string) => void;
  cenaAcabou: (id: string, pulada: boolean) => void;
}

export type Eventos<E extends object = {}> = Emitter<EventosBase & E>;

export const criarEventos = <E extends object = {}>(): Eventos<E> => createNanoEvents<EventosBase & E>();
