import { load } from "js-yaml";
import { z } from "zod";
import type { PresetVoz } from "./voz";

/**
 * The voice table of a game (`vozes.yaml`, path in the manifest's `conteudo.vozes`): one recorded voice per portrait,
 * used by the engine's `scripts/gerar-vozes.mjs` to render every line to an mp3, and by the game to build the
 * `Voz` presets (Web Speech fallback: `tom` → pitch, `velocidade` → rate). A portrait not in the table gets no file
 * and speaks with the system voice.
 *
 * ```yaml
 * novidades: coruja            # optional: the portrait that reads novidades.yaml aloud (none = the news are not recorded)
 * mudos: [placa, mila]         # optional: portraits never read aloud (signs, the heroine's thoughts): no file, no system voice
 * extras: [src/game/extras/cartas.yaml=narrador]   # optional: more line files (gerar-vozes --extra)
 * vozes:
 *   coruja:  { motor: kokoro, voz: pm_santa,           tom: 1.0,  velocidade: 1.0 }
 *   padeira: { motor: piper,  voz: pt_BR-faber-medium, tom: 1.26, velocidade: 1.07 }
 * ```
 * `motor`: piper (models in `local/vozes-modelos/`) or kokoro (venv in `local/kokoro-venv/`); `voz`: the model / voice
 * name; `tom`: 1 = as it comes, > 1 higher (ffmpeg shifts the pitch, not the duration); `velocidade`: 1 = normal.
 */
export const VozGravadaSchema = z.object({
  motor: z.enum(["piper", "kokoro"]),
  voz: z.string().min(1),
  tom: z.number().positive().default(1),
  velocidade: z.number().positive().default(1),
});
export type VozGravada = z.infer<typeof VozGravadaSchema>;

export const VozesSchema = z.object({
  novidades: z.string().min(1).optional(),
  mudos: z.array(z.string().min(1)).default([]),
  /** More YAML files of lines for `gerar-vozes.mjs`, as its `--extra ARQ[=RETRATO]` (relative to the game's root). */
  extras: z.array(z.string().min(1)).default([]),
  vozes: z.record(z.string().min(1), VozGravadaSchema),
});
export type Vozes = z.infer<typeof VozesSchema>;

/** Parses and validates a vozes.yaml (portrait keys in lower case, as the dialogues derive them). */
export function carregarVozes(text: string, arquivo = "vozes.yaml"): Vozes {
  const r = VozesSchema.safeParse(load(text));
  if (!r.success) throw new Error(`${arquivo}: ${z.prettifyError(r.error)}`);
  for (const k of [...Object.keys(r.data.vozes), ...r.data.mudos]) if (k !== k.trim().toLowerCase()) throw new Error(`${arquivo}: retrato "${k}" tem que ser minúsculo`);
  const repetidos = r.data.mudos.filter((k) => k in r.data.vozes);
  if (repetidos.length) throw new Error(`${arquivo}: ${repetidos.join(", ")} está em vozes e em mudos`);
  return r.data;
}

/**
 * The `Voz` presets of the table: the system voice follows the recorded one (`tom` → pitch, `velocidade` → rate); the
 * `mudos` are null (never read aloud).
 */
export function presetsDasVozes(v: Vozes): Record<string, PresetVoz | null> {
  return {
    ...Object.fromEntries(Object.entries(v.vozes).map(([k, x]) => [k, { pitch: x.tom, rate: x.velocidade }])),
    ...Object.fromEntries(v.mudos.map((k) => [k, null])),
  };
}
