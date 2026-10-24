import { z } from "zod";
import type { Fatia } from "./fatias";

/**
 * "The world changed" (As Três Ilhas, version 8, from Olivia's hand-drawn quests): a quest, or the world itself, may
 * change something for good (the hen house gives 3 eggs instead of 2, a picture hangs on the wall, the hens stopped
 * eating), and the save keeps it. The game REGISTERS its keys (`RegistroMundo`: schema, default and, optionally, how the
 * help screen tells the change), the slice keeps only registered keys with valid values, the systems read
 * `lerMundo(chave)` and the quests write `mudarMundo(chave, valor)` (`ao_concluir.mundo` in the game's reward schema),
 * which emits `mundoMudou`. A quest may also wait for a world event (`oferecer_apos` in missoes/schema.ts): the game
 * answers `MundoMissoes.aconteceu(evento)` from a boolean key of this slice.
 */

/** One key of the world: its schema, its default and, optionally, the line the help screen shows once it changed. */
export interface ChaveMundo<T = unknown> {
  schema: z.ZodType<T>;
  padrao: T;
  /** What the help screen says about this value (null = nothing to tell: the default, or a change nobody earned). */
  conta?(valor: T): string | null;
}

export type RegistroMundo = Record<string, ChaveMundo<any>>;

export const CAMPOS_MUNDO = {
  /** What the world's quests changed for good: registered key → value (only keys that differ from the default are kept). */
  mundo: z.record(z.string(), z.unknown()),
};
export type CamposMundo = typeof CAMPOS_MUNDO;

export interface AcoesMundo {
  /** The value of a registered key (its default until something changed it). An unregistered key throws. */
  lerMundo<T = unknown>(chave: string): T;
  /**
   * Change a registered key (the value is validated by its schema; invalid or unregistered throws). Emits
   * `mundoMudou(chave, valor, motivo)` when the value actually changes (`motivo`: the quest id, or "mundo").
   */
  mudarMundo(chave: string, valor: unknown, motivo?: string): void;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Keeps only registered keys whose value is valid for their schema (what `sanear` and `mudarMundo` agree on). */
export function sanearMundo(mundo: Record<string, unknown>, registro: RegistroMundo): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mundo ?? {})) {
    const c = registro[k];
    if (c && c.schema.safeParse(v).success) out[k] = v;
  }
  return out;
}

/** The world's value of `chave`: the saved one, else the default. */
export function valorDoMundo<T>(mundo: Record<string, unknown>, registro: RegistroMundo, chave: string): T {
  const c = registro[chave];
  if (!c) throw new Error(`mundo: chave "${chave}" não registrada (há: ${Object.keys(registro).join(", ") || "nenhuma"})`);
  return (chave in mundo ? mundo[chave] : c.padrao) as T;
}

/** The lines for the help screen: every key whose value differs from its default and whose `conta` says something. */
export function linhasDoMundo(mundo: Record<string, unknown>, registro: RegistroMundo): string[] {
  const out: string[] = [];
  for (const [k, c] of Object.entries(registro)) {
    const v = valorDoMundo(mundo, registro, k);
    if (igual(v, c.padrao) || !c.conta) continue;
    const t = c.conta(v);
    if (t) out.push(t);
  }
  return out;
}

/** The slice `mundo` for a game's registry: field `mundo`, actions `lerMundo` / `mudarMundo`, `sanear`. */
export function criarFatiaMundo(registro: RegistroMundo): Fatia<{ mundo: Record<string, unknown> }, AcoesMundo, { mundo: Record<string, unknown> } & AcoesMundo> {
  return {
    nome: "mundo",
    schema: CAMPOS_MUNDO,
    inicial: { mundo: {} },
    acoes: (set, get, { eventos }) => ({
      lerMundo: (chave) => valorDoMundo(get().mundo, registro, chave),
      mudarMundo(chave, valor, motivo) {
        const c = registro[chave];
        if (!c) throw new Error(`mundo: chave "${chave}" não registrada (há: ${Object.keys(registro).join(", ") || "nenhuma"})`);
        const r = c.schema.safeParse(valor);
        if (!r.success) throw new Error(`mundo: valor inválido para "${chave}": ${z.prettifyError(r.error)}`);
        const antes = valorDoMundo(get().mundo, registro, chave);
        if (igual(antes, r.data)) return;
        const mundo = { ...get().mundo };
        if (igual(r.data, c.padrao)) delete mundo[chave]; else mundo[chave] = r.data;
        set({ mundo });
        eventos.emit("mundoMudou", chave, r.data, motivo);
      },
    }),
    sanear: (save) => ({ ...save, mundo: sanearMundo(save.mundo, registro) }),
  };
}
