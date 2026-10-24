import type * as THREE from "three";
import { load } from "js-yaml";
import { z } from "zod";
import type { Contextos } from "../core/contextos";
import { CenaSchema, PAYLOADS, passoSchema, tipoDoPasso, type Cena, type PassoCena, type TipoPassoMotor } from "./schema";
import { CameraRig } from "./camera";
import { UiCena, TEXTOS_PULAR, type TextosPular } from "./ui";
import { handlersPadrao, marcaAFrente, pular, rodarCena, type AudioCena, type Ctx, type Exec, type FalaCena } from "./rodar";

export interface OpcoesCutscenes {
  camera: THREE.PerspectiveCamera;
  /** The canvas (gets the blur). */
  canvas: HTMLElement;
  contextos: Contextos;
  /** Named scene objects (`barco`, `cama`...: the game's business). */
  obj(id: string): THREE.Object3D;
  /** The game's dialogue box: resolves when the player advances the line; close it when `sinal` aborts. */
  fala(f: FalaCena, sinal: AbortSignal): Promise<void>;
  fecharFala?(): void;
  audio: AudioCena;
  /** Clip player (AnimationMixer or procedural); needed only by scenes with `animar` steps. */
  animar?: Ctx["animar"];
  /** Scene events: `cena:<id>:inicio`, `cena:<id>:fim` and every `evento:` step (`dados.pulado` on a skip). */
  emit(nome: string, dados?: { pulado: boolean }): void;
  /** Scene clock in seconds (the game's sim time: pausing it freezes the scene). */
  relogio: () => number;
  textos?: TextosPular;
}

export interface OpcoesTocar {
  /** Overrides the scene's `pulavel`. */
  pulavel?: Cena["pulavel"];
  /** Already seen (save): one tap of Esc skips even when the scene says `segurar`. */
  jaVista?: boolean;
}

/** Seconds of the opening when skipping is locked (accidental key press). */
const TRAVA = 0.5;
/** Seconds Esc must be held to skip a `segurar` scene. */
const SEGURAR = 1;
/** Seconds the prompt stays after the last key. */
const AVISO = 4;

/**
 * The cutscene player the game uses: `carregar` a YAML scene, `tocar` it, call `update(dt)` every frame. While a
 * scene plays, the `cutscene` input context is on top (the game zeroes its controls), the camera rig drives the
 * camera, and Esc (hold, or tap) / → skip it. Hiding the cursor and the HUD is the game's job (`cena:<id>:inicio`).
 */
export class Cutscenes {
  readonly rig: CameraRig;
  readonly ui: UiCena;
  private handlers = handlersPadrao();
  private ouvintes = new Set<() => void>();
  private ctx: Ctx | null = null;
  private cena: Cena | null = null;
  private modoPulo: Cena["pulavel"] = "segurar";
  private t0 = 0;
  private segurando = false;
  private segurado = 0;
  private avisoT = 0;

  constructor(private o: OpcoesCutscenes) {
    this.rig = new CameraRig(o.camera, o.obj);
    this.ui = new UiCena(o.canvas, o.textos ?? TEXTOS_PULAR);
  }

  /** Is a scene playing? */
  get ativa() {
    return this.ctx !== null;
  }

  /** Adds (or replaces) a step type: the game's `mar`, `chuva`, `ceu`... */
  registrar<P = any>(tipo: string, e: Exec<P>) {
    this.handlers[tipo] = e;
  }

  /** Validates a scene (YAML string or already parsed object); the error says which step is wrong. */
  carregar(raw: string | object): Cena {
    const dados = typeof raw === "string" ? load(raw) : raw;
    const r = CenaSchema.safeParse(dados);
    if (!r.success) throw new Error(`cutscene inválida:\n${explicar(dados, r.error)}`);
    const cena = r.data;
    const faltam = new Set<string>();
    percorrer(cena.passos, (p) => {
      if ("camera" in p) {
        const nome = (p.camera as { usar: string }).usar;
        if (!(nome in cena.cameras)) faltam.add(nome);
      }
    });
    if (faltam.size) throw new Error(`cutscene "${cena.id}": câmera(s) usada(s) e não declarada(s): ${[...faltam].join(", ")}`);
    return cena;
  }

  /**
   * Problems that would break `tocar` (for the game's tests): step types without a handler, unknown objects
   * (`obj(id)` throwing), `animar` steps without a clip player.
   */
  verificar(cena: Cena): string[] {
    const erros = new Set<string>();
    const ids = new Set<string>();
    const add = (v: unknown) => { for (const id of [v].flat()) if (typeof id === "string") ids.add(id); };
    for (const cv of Object.values(cena.cameras)) { add(cv.alvo); add(cv.presa); }
    percorrer(cena.passos, (p) => {
      const t = tipoDoPasso(p);
      if (!this.handlers[t]) erros.add(`passo "${t}" sem handler`);
      const v = p[t] as Record<string, unknown>;
      if (t === "mover" || t === "girar" || t === "animar") add(v.alvo);
      if (t === "trocar") { add(v.mostrar); add(v.esconder); }
      if (t === "animar" && !this.o.animar) erros.add("passo animar sem a opção animar");
    });
    for (const id of ids) {
      try { if (!this.o.obj(id)) erros.add(`objeto "${id}" não existe`); } catch { erros.add(`objeto "${id}" não existe`); }
    }
    return [...erros];
  }

  /** Plays a scene. Resolves at its end, saying whether the player skipped any of it. */
  async tocar(cena: Cena, opcoes: OpcoesTocar = {}): Promise<{ pulada: boolean }> {
    if (this.ctx) throw new Error(`cutscene: "${cena.id}" pedida com "${this.cena?.id}" tocando`);
    const o = this.o;
    let modo = opcoes.pulavel ?? cena.pulavel;
    if (modo === "segurar" && opcoes.jaVista) modo = "toque";
    this.modoPulo = modo;
    this.rig.limpar();
    for (const [nome, cv] of Object.entries(cena.cameras)) this.rig.declarar(nome, cv);
    const fov = o.camera.fov;
    const ctx: Ctx = {
      relogio: { agora: () => o.relogio(), on: (f) => this.ouvintes.add(f), off: (f) => this.ouvintes.delete(f) },
      rig: this.rig,
      ui: this.ui,
      obj: o.obj,
      audio: o.audio,
      fala: o.fala,
      fecharFala: o.fecharFala,
      animar: o.animar,
      emit: o.emit,
      handlers: this.handlers,
      modo: "normal",
      corte: new AbortController(),
      pos: 0,
      fundos: new Set(),
      pulada: false,
    };
    this.ctx = ctx;
    this.cena = cena;
    this.t0 = o.relogio();
    this.segurando = false;
    this.segurado = 0;
    this.avisoT = 0;
    o.contextos.push("cutscene");
    this.rig.ativo = true;
    addEventListener("keydown", this.tecla, true);
    addEventListener("keyup", this.soltar, true);
    // second time: the prompt is already there
    if (opcoes.jaVista && modo !== "nao") this.mostrarAviso(this.ui.textos.tocar);
    o.emit(`cena:${cena.id}:inicio`);
    try {
      await rodarCena(cena, ctx);
    } finally {
      removeEventListener("keydown", this.tecla, true);
      removeEventListener("keyup", this.soltar, true);
      this.ouvintes.clear();
      this.rig.ativo = false;
      o.camera.fov = fov;
      o.camera.updateProjectionMatrix();
      // bars follow the context, not the script: they never stay stuck after a scene
      this.ui.letterbox(false, 0, ctx);
      this.ui.avisoPular(null);
      this.ui.anel(0);
      this.ui.proximaParte(false);
      o.contextos.pop("cutscene");
      this.ctx = null;
      this.cena = null;
    }
    return { pulada: ctx.pulada };
  }

  /** Call every frame with the same dt that advanced the clock. */
  update(dt: number) {
    const ctx = this.ctx;
    if (ctx) {
      for (const f of [...this.ouvintes]) f();
      if (this.segurando) {
        this.segurado += dt;
        this.ui.anel(this.segurado / SEGURAR);
        if (this.segurado >= SEGURAR) {
          this.segurando = false;
          pular(ctx, "fim");
        }
      }
      if (this.avisoT > 0) {
        this.avisoT -= dt;
        if (this.avisoT <= 0 && !this.segurando) this.ui.avisoPular(null);
      }
      this.ui.proximaParte(this.modoPulo !== "nao" && ctx.modo === "normal" && this.destravado && !!this.cena && marcaAFrente(this.cena, ctx.pos));
    }
    this.rig.update(dt);
  }

  /** Skips by code (a menu button, a test): to the end or to the next `marca`. */
  pular(ate: "fim" | "marca" = "fim") {
    if (!this.ctx || !this.cena) return;
    if (ate === "marca" && !marcaAFrente(this.cena, this.ctx.pos)) return;
    pular(this.ctx, ate);
  }

  private get destravado() {
    return this.o.relogio() - this.t0 >= TRAVA;
  }

  private mostrarAviso(texto: string) {
    this.ui.avisoPular(texto);
    this.avisoT = AVISO;
  }

  private tecla = (e: KeyboardEvent) => {
    if (!this.ctx || this.o.contextos.topo !== "cutscene") return;
    if (e.code !== "Escape" && e.code !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || this.modoPulo === "nao" || !this.destravado) return;
    if (e.code === "ArrowRight") return this.pular("marca");
    if (this.modoPulo === "toque") return this.pular("fim");
    this.segurando = true;
    this.segurado = 0;
    this.mostrarAviso(this.ui.textos.segurar);
  };

  private soltar = (e: KeyboardEvent) => {
    if (e.code !== "Escape" || !this.segurando) return;
    this.segurando = false;
    this.segurado = 0;
    this.ui.anel(0);
    this.avisoT = AVISO;
  };
}

/** Visits every step, inside `junto` too. */
function percorrer(passos: PassoCena[], f: (p: PassoCena) => void) {
  for (const p of passos) {
    f(p);
    if ("junto" in p) percorrer(p.junto as PassoCena[], f);
  }
}

/** Readable error: for each wrong step, the issues of the schema of its own type (not the whole union's). */
function explicar(dados: unknown, erro: z.ZodError): string {
  const linhas: string[] = [];
  const passos = (dados as { passos?: unknown })?.passos;
  const vistos = new Set<string>();
  for (const iss of erro.issues) {
    const [a, i] = iss.path;
    if (a === "passos" && typeof i === "number" && Array.isArray(passos)) {
      const chave = `${i}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      linhas.push(...explicarPasso(passos[i], `passos[${i}]`));
    } else linhas.push(`- ${iss.path.join(".") || "(raiz)"}: ${iss.message}`);
  }
  return linhas.join("\n");
}

function explicarPasso(p: unknown, onde: string): string[] {
  if (!p || typeof p !== "object" || Array.isArray(p)) return [`- ${onde}: um passo é um objeto com uma chave de tipo`];
  const t = tipoDoPasso(p as PassoCena);
  const extras = Object.keys(p).filter((k) => k !== t && k !== "fundo" && k !== "atraso");
  if (!t || extras.length) return [`- ${onde}: um passo tem uma chave de tipo só (achei: ${Object.keys(p).join(", ")})`];
  if (!(t in PAYLOADS)) return [`- ${onde} (${t}): inválido`];
  if (t === "junto" && Array.isArray((p as PassoCena).junto)) {
    const filhos = (p as { junto: unknown[] }).junto;
    const r = filhos.flatMap((q, j) => explicarFilho(q, `${onde}.junto[${j}]`));
    if (r.length) return r;
  }
  const r = passoSchema(t as TipoPassoMotor).safeParse(p);
  return r.success ? [] : r.error.issues.map((iss) => `- ${onde} (${t}) ${iss.path.join(".")}: ${iss.message}`);
}

function explicarFilho(q: unknown, onde: string): string[] {
  const t = q && typeof q === "object" ? tipoDoPasso(q as PassoCena) : "";
  if (t && !(t in PAYLOADS) && Object.keys(q as object).filter((k) => k !== "fundo" && k !== "atraso").length === 1) return [];
  return explicarPasso(q, onde);
}
