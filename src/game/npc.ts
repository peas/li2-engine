import type * as THREE from "three";
import type { FimDoDialogo } from "./dialogo/fala";

/**
 * Someone the player can talk to (villagers, a sign, a creature). The game loop updates every NPC, shows the prompt
 * for the nearest one she can talk to, and plays `dialogo` (a dialogue name of the game) on E or click. `dialogo` can
 * be swapped at runtime (a quest changes what someone says). Reaches are in metres, given by the game per actor.
 */
export interface Npc {
  /** Stable id used by quests (`quem`, `npc` in the quest YAMLs). */
  readonly id: string;
  /** Shown in the prompt: "E · falar com <nome>". */
  nome: string;
  /** Name of the dialogue (without extension). */
  dialogo: string;
  readonly group: THREE.Group;
  readonly position: THREE.Vector3;
  update(dt: number, posJogador: THREE.Vector3, time: number): void;
  /** Is the player close enough (`alcanceM` metres, the game's talking reach) and in front of it? */
  canTalk(posJogador: THREE.Vector3, alcanceM: number): boolean;
  /** Talk reach in metres (feet to feet); the game's default when absent. */
  readonly alcance?: number;
  /** A conversation of its own (no quests, no dialogue name): `conversar` runs it instead of anything else. */
  conversar?(): Promise<FimDoDialogo>;
  /** Only its own dialogue, never a quest conversation (a sign, a board). */
  semMissoes?: boolean;
}
