import { z } from "zod";

/**
 * A cutscene is a YAML script: a list of commands run in order (RPG Maker / Yarn model), never a timeline. Rules
 * (research `cutscenes-threejs.md` §6): one step = an object with ONE type key; values are always absolute (final
 * position, final volume), never relative, so `fim()` can be computed when the scene is skipped; `fundo: true` does
 * not wait; `junto:` runs its steps in parallel; `marca:` divides the scene in chapters (→ skips to the next one).
 * Named virtual cameras are declared at the top: fixed (`pos` + `alvo`/`olhar`), attached (`presa` + `offset`), or
 * on a rail (`trilho`). Step types the engine does not know (`mar`, `chuva`...) are registered by the game.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
export const Ease = z.enum(["linear", "suave", "entra", "sai", "back-out"]).default("suave");

export const CameraVirtualSchema = z.object({
  pos: V3.optional(),
  /** Look at a named object... */
  alvo: z.string().optional(),
  /** ...or at a point (world; local to `presa` when attached). */
  olhar: V3.optional(),
  /** Attached to a named object: `offset` in its local space. */
  presa: z.string().optional(),
  offset: V3.optional(),
  /** Rail: points of a CatmullRom curve; the camera travels it during the blend/`dur` of the `camera` step. */
  trilho: z.array(V3).min(2).optional(),
  fov: z.number().positive().default(60),
  /** Roll in degrees. */
  roll: z.number().default(0),
});
export type CameraVirtual = z.infer<typeof CameraVirtualSchema>;

const Comum = { fundo: z.boolean().optional(), atraso: z.number().min(0).optional() };
/** Keys every step may carry besides its type key. */
export const CHAVES_COMUNS = Object.keys(Comum);
const umOuVarios = z.union([z.string(), z.array(z.string())]);

/** Payload schema of each engine step type (the value under the type key). */
export const PAYLOADS = {
  marca: z.string().min(1),
  esperar: z.number().min(0),
  camera: z.object({ usar: z.string(), blend: z.number().min(0).default(0), ease: Ease, dur: z.number().min(0).optional() }),
  mover: z.object({ alvo: z.string(), para: V3, dur: z.number().min(0).default(0), ease: Ease }),
  /** `para` = Euler angles in degrees (XYZ). */
  girar: z.object({ alvo: z.string(), para: V3, dur: z.number().min(0).default(0), ease: Ease }),
  animar: z.object({ alvo: umOuVarios, clipe: z.string(), laco: z.boolean().optional(), dur: z.number().min(0).optional() }),
  trocar: z.object({ mostrar: umOuVarios.optional(), esconder: umOuVarios.optional() }),
  fala: z.object({ quem: z.string(), retrato: z.string().optional(), texto: z.string().min(1), bloqueia: z.boolean().default(true) }),
  som: z.object({ nome: z.string(), atraso: z.number().min(0).optional() }),
  musica: z.object({ faixa: z.string().optional(), volume: z.number().min(0).max(1).optional(), dur: z.number().min(0).default(1) }),
  fade: z.object({ para: z.enum(["preto", "branco", "nada"]), dur: z.number().min(0).default(0.5) }),
  letterbox: z.object({ ligar: z.boolean(), dur: z.number().min(0).default(0.6) }),
  palpebras: z.object({ para: z.number().min(0).max(1).optional(), roteiro: z.array(z.number().min(0).max(1)).optional(), dur: z.number().min(0).default(1) }),
  desfoque: z.object({ para: z.number().min(0), dur: z.number().min(0).default(1) }),
  tremor: z.object({ forca: z.number().min(0), dur: z.number().min(0) }),
  evento: z.object({ nome: z.string() }),
  junto: z.array(z.lazy(() => PassoCenaSchema)).min(1),
} as const;
export type TipoPassoMotor = keyof typeof PAYLOADS;
export const TIPOS_DO_MOTOR = Object.keys(PAYLOADS) as TipoPassoMotor[];

/** Schema of one engine step of type `tipo` (with `fundo`/`atraso`; `marca` takes neither). */
export function passoSchema(tipo: TipoPassoMotor) {
  return tipo === "marca"
    ? z.object({ marca: PAYLOADS.marca }).strict()
    : z.object({ [tipo]: PAYLOADS[tipo], ...Comum }).strict();
}

export const PassoCenaSchema: z.ZodType<PassoCena> = z.lazy((): z.ZodType<PassoCena> => z.union([
  ...TIPOS_DO_MOTOR.map(passoSchema),
  // anything else: a game-registered handler (`mar`, `chuva`, `ceu`...): one key, any payload. An engine type with a
  // wrong payload must fail above, never fall through to here.
  z.record(z.string(), z.unknown()).refine((o) => {
    const tipos = Object.keys(o).filter((k) => !CHAVES_COMUNS.includes(k));
    return tipos.length === 1 && !(tipos[0] in PAYLOADS);
  }, "um passo tem uma chave de tipo"),
] as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]) as z.ZodType<PassoCena>);
export type PassoCena = Record<string, unknown>;

/**
 * When the director (`diretor.ts`) plays a scene by itself; absent = only by code (`diretor.tocar(id)`). Every trigger
 * but `inicio` waits for the game to be quiet (the director's `quieto()` and the scene's `podeTocar`).
 */
export const GatilhoSchema = z.discriminatedUnion("tipo", [
  /** At start-up: the first `update` after `registrar` (once). */
  z.object({ tipo: z.literal("inicio") }).strict(),
  /** Within `raio` m of the place (xz); `hora` = [de, ate] of the time of day 0..1 (de > ate wraps midnight). */
  z.object({
    tipo: z.literal("lugar"), lugar: z.string().min(1), raio: z.number().positive(),
    hora: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  }).strict(),
  /** The quest is active (status "ativa"); with `passo`, its active step has this `tipo`. */
  z.object({ tipo: z.literal("missao"), missao: z.string().min(1), passo: z.string().min(1).optional() }).strict(),
  /** When the game's events emit `nome` (played at the first quiet moment after it). */
  z.object({ tipo: z.literal("evento"), nome: z.string().min(1) }).strict(),
]);
export type Gatilho = z.infer<typeof GatilhoSchema>;

/** The ritual the director runs round a scene; every key defaults to true. */
export const RitualSchema = z.object({
  /** Hide the HUD (Provedores.hud.modoCinema) while it plays. */
  esconder_hud: z.boolean().default(true),
  /** Save at the end (motive = the scene id). */
  salvar_ao_fim: z.boolean().default(true),
  /** Mark it seen at the end (store.verCena); a trigger never plays a seen scene. */
  lembrar_vista: z.boolean().default(true),
  /** Snap the game camera after the scene (and after `depois`). */
  snap_camera: z.boolean().default(true),
}).strict();
export type Ritual = z.infer<typeof RitualSchema>;
const RITUAL_PADRAO: Ritual = { esconder_hud: true, salvar_ao_fim: true, lembrar_vista: true, snap_camera: true };

export const CenaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** segurar = hold Esc 1 s (ring); toque = one tap; nao = cannot be skipped. */
  pulavel: z.enum(["segurar", "toque", "nao"]).default("segurar"),
  /** When the director plays it by itself (absent = only by code). */
  gatilho: GatilhoSchema.optional(),
  /** The ritual round the scene (absent keys = true). */
  ritual: RitualSchema.default(() => ({ ...RITUAL_PADRAO })),
  cameras: z.record(z.string(), CameraVirtualSchema).default({}),
  passos: z.array(PassoCenaSchema).min(1),
});
export type Cena = z.infer<typeof CenaSchema>;

/** The type key of a step (the one key that is not `fundo`/`atraso`). */
export const tipoDoPasso = (p: PassoCena) => Object.keys(p).find((k) => !CHAVES_COMUNS.includes(k)) ?? "";
