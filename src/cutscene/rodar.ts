import * as THREE from "three";
import type { Cena, PassoCena } from "./schema";
import { tipoDoPasso } from "./schema";
import { animar, ateAbortar, ease, esperar, type Relogio } from "./animar";
import type { CameraRig } from "./camera";
import type { UiCena } from "./ui";

/** Sounds and music of a scene (the game's audio module behind it). */
export interface AudioCena {
  /** One-shot effect (`atraso` in seconds). Never played when the scene is skipped. */
  tocar(nome: string, atraso?: number): void;
  /** Music: crossfade to `faixa` (absent = keep the current one) at `volume` over `dur` seconds (0 = now). */
  musica(faixa: string | undefined, volume: number | undefined, dur: number): void;
}

/** A spoken line as the scene hands it to the game's dialogue box. */
export interface FalaCena {
  quem: string;
  retrato?: string;
  texto: string;
}

export type ModoPulo = "normal" | "marca" | "fim";

/** Everything a step handler can touch. Built by `Cutscenes` for each scene. */
export interface Ctx {
  relogio: Relogio;
  rig: CameraRig;
  ui: UiCena;
  /** Named scene object (throws or returns a placeholder for unknown ids: the game decides). */
  obj(id: string): THREE.Object3D;
  audio: AudioCena;
  /** Shows a line in the game's dialogue box; resolves when the player advances it. The signal aborts on skip. */
  fala(f: FalaCena, sinal: AbortSignal): Promise<void>;
  /** Closes the box at once (skip). */
  fecharFala?(): void;
  /** Plays animation `clipe` on object `alvo`; `saltarAoFim` = skip: pose it at the clip's end (or start the loop). */
  animar?(alvo: string, clipe: string, laco: boolean, saltarAoFim: boolean): void | Promise<void>;
  /** `dados.pulado` = fired by a skip (apply the outcome, no effects). */
  emit(nome: string, dados?: { pulado: boolean }): void;
  /** Step handlers by type (engine + game). */
  handlers: Record<string, Exec>;
  /** What the player asked for: run normally, skip to the next `marca`, or to the end. */
  modo: ModoPulo;
  /** Aborted = everything playing jumps to its end. Renewed at each `marca` reached while skipping. */
  corte: AbortController;
  /** Index of the top-level step running. */
  pos: number;
  /** Steps running in the background (`fundo: true`). */
  fundos: Set<Promise<void>>;
  /** Was anything skipped? */
  pulada: boolean;
}

/**
 * A step type: `run` plays it (resolves when done; must honour `c.corte`, which `animar`/`esperar` already do), `fim`
 * applies its final state at once with no sound or effect (used for every remaining step on a skip).
 */
export interface Exec<P = any> {
  run(p: P, c: Ctx): Promise<void> | void;
  fim(p: P, c: Ctx): void;
}

const vec = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const lista = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const quatDeGraus = (a: readonly number[]) => new THREE.Quaternion().setFromEuler(
  new THREE.Euler(THREE.MathUtils.degToRad(a[0]), THREE.MathUtils.degToRad(a[1]), THREE.MathUtils.degToRad(a[2])));

const nada: Exec = { run: () => {}, fim: () => {} };

function trocar(p: { mostrar?: string | string[]; esconder?: string | string[] }, c: Ctx) {
  for (const id of lista(p.esconder)) c.obj(id).visible = false;
  for (const id of lista(p.mostrar)) c.obj(id).visible = true;
}

/** The engine's step handlers (a fresh object: the game adds its own to it). */
export function handlersPadrao(): Record<string, Exec> {
  return {
    marca: nada,
    esperar: { run: (s: number, c) => esperar(c, s), fim: () => {} },
    camera: {
      run: (p, c) => c.rig.usar(p.usar, p.blend ?? 0, ease(p.ease), c, p.dur),
      fim: (p, c) => c.rig.fixar(p.usar),
    },
    mover: {
      run: (p, c) => {
        const o = c.obj(p.alvo), de = o.position.clone(), para = vec(p.para);
        return animar(c, p.dur ?? 0, ease(p.ease), (k) => { o.position.lerpVectors(de, para, k); });
      },
      fim: (p, c) => { c.obj(p.alvo).position.copy(vec(p.para)); },
    },
    girar: {
      run: (p, c) => {
        const o = c.obj(p.alvo), de = o.quaternion.clone(), para = quatDeGraus(p.para);
        return animar(c, p.dur ?? 0, ease(p.ease), (k) => { o.quaternion.slerpQuaternions(de, para, k); });
      },
      fim: (p, c) => { c.obj(p.alvo).quaternion.copy(quatDeGraus(p.para)); },
    },
    animar: {
      run: async (p, c) => {
        const ps = lista(p.alvo).map((id) => c.animar?.(id, p.clipe, !!p.laco, false));
        if (p.dur !== undefined) await esperar(c, p.dur);
        else if (!p.laco) await ateAbortar(c, Promise.all(ps));
      },
      fim: (p, c) => { for (const id of lista(p.alvo)) c.animar?.(id, p.clipe, !!p.laco, true); },
    },
    trocar: { run: trocar, fim: trocar },
    fala: {
      run: (p, c) => {
        const f: FalaCena = { quem: p.quem, retrato: p.retrato, texto: p.texto };
        const pr = c.fala(f, c.corte.signal);
        if (p.bloqueia === false) { pr.catch(console.error); return; }
        return ateAbortar(c, pr);
      },
      fim: (_p, c) => c.fecharFala?.(),
    },
    som: { run: (p, c) => c.audio.tocar(p.nome, p.atraso), fim: () => {} },
    musica: {
      // the crossfade runs in the audio module: the scene does not wait for it
      run: (p, c) => c.audio.musica(p.faixa, p.volume, p.dur ?? 1),
      fim: (p, c) => c.audio.musica(p.faixa, p.volume, 0),
    },
    fade: { run: (p, c) => c.ui.fade(p.para, p.dur ?? 0.5, c), fim: (p, c) => { c.ui.fade(p.para, 0, c); } },
    letterbox: { run: (p, c) => c.ui.letterbox(p.ligar, p.dur ?? 0.6, c), fim: (p, c) => { c.ui.letterbox(p.ligar, 0, c); } },
    palpebras: {
      run: (p, c) => c.ui.palpebras(p.roteiro ?? p.para ?? 1, p.dur ?? 1, c),
      fim: (p, c) => { const r: number[] | undefined = p.roteiro; c.ui.palpebras(r?.length ? r[r.length - 1] : p.para ?? 1, 0, c); },
    },
    desfoque: { run: (p, c) => c.ui.desfoque(p.para, p.dur ?? 1, c), fim: (p, c) => { c.ui.desfoque(p.para, 0, c); } },
    tremor: {
      run: async (p, c) => {
        c.rig.tremor(p.forca, p.dur);
        await esperar(c, p.dur);
        if (c.corte.signal.aborted) c.rig.tremor(0, 0);
      },
      fim: () => {},
    },
    evento: {
      run: (p, c) => c.emit(p.nome, { pulado: false }),
      fim: (p, c) => c.emit(p.nome, { pulado: true }),
    },
    junto: {
      run: (ps: PassoCena[], c) => Promise.all(ps.map((q) => exec(q, c))).then(() => {}),
      fim: (ps: PassoCena[], c) => { for (const q of ps) fim(q, c); },
    },
  };
}

function handler(p: PassoCena, c: Ctx): [Exec, unknown] {
  const t = tipoDoPasso(p);
  const h = c.handlers[t];
  if (!h) throw new Error(`cutscene: passo de tipo "${t}" sem handler (registre com cutscenes.registrar("${t}", ...))`);
  return [h, p[t]];
}

/** Final state of a step, no sound, no wait. */
export function fim(p: PassoCena, c: Ctx) {
  const [h, payload] = handler(p, c);
  h.fim(payload, c);
}

async function executar(p: PassoCena, c: Ctx) {
  const [h, payload] = handler(p, c);
  const atraso = p.atraso as number | undefined;
  if (atraso && !c.corte.signal.aborted) await esperar(c, atraso);
  // skipped before it began (or during its delay): only its final state
  if (c.corte.signal.aborted) return h.fim(payload, c);
  await h.run(payload, c);
}

/** Runs one step; `fundo: true` starts it and returns at once (tracked in `c.fundos`). */
export function exec(p: PassoCena, c: Ctx): Promise<void> {
  const pr = executar(p, c);
  if (!p.fundo) return pr;
  const f = pr.catch((e) => console.error(e)).finally(() => c.fundos.delete(f));
  c.fundos.add(f);
  return Promise.resolve();
}

/** Is there a `marca` after the top-level step `pos`? */
export const marcaAFrente = (cena: Cena, pos: number) => cena.passos.some((p, i) => i > pos && "marca" in p);

/** Plays a scene to its end (a skip makes it end early, in the same final state). */
export async function rodarCena(cena: Cena, c: Ctx) {
  c.modo = "normal";
  c.corte = new AbortController();
  let pulando = false;
  for (let i = 0; i < cena.passos.length; i++) {
    const p = cena.passos[i];
    c.pos = i;
    if (c.modo !== "normal") {
      if (!pulando) {
        // let the aborted background steps land on their final values before applying the rest
        pulando = true;
        await Promise.allSettled([...c.fundos]);
      }
      if (c.modo === "marca" && "marca" in p) {
        c.modo = "normal";
        c.corte = new AbortController();
        pulando = false;
      } else {
        fim(p, c);
        continue;
      }
    }
    await exec(p, c);
  }
  c.corte.abort();
  await Promise.allSettled([...c.fundos]);
  c.emit(`cena:${cena.id}:fim`);
}

/** The player asked to skip: to the end of the scene or to the next `marca`. */
export function pular(c: Ctx, ate: "fim" | "marca") {
  if (c.modo === "fim" || c.modo === ate) return;
  c.modo = ate;
  c.pulada = true;
  c.corte.abort();
}
