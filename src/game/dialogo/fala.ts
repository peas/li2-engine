/**
 * One line of a conversation: who speaks, which portrait, what they say. `texto` may mark key words in colour:
 * `*palavra*` = colour 1, `_palavra_` = colour 2 (at most two colours on screen, by the polish rules); "\n" = manual
 * line break. The typewriter counts only visible letters.
 */
export interface Fala {
  quem: string;
  retrato: string;
  texto: string;
}

export type FimDoDialogo = "fim" | "pulado";
