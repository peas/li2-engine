import type { Cena, Gatilho } from "./schema";
import type { Cutscenes } from "./cutscenes";

/**
 * The scene director: the game registers each mounted scene once, and the director runs the ritual round it (hide the
 * HUD, remember it seen, save, snap the camera) and its trigger (the YAML `gatilho:`), so a game's scenes system is
 * only the list of its scenes. The stage of each scene stays code (`montarX` returns a `CenaMontada`).
 *
 * Ritual of `tocar`, in this order: `antes()` → `rodando` → `hud.modoCinema(true)` (esconder_hud) → `jaVista =
 * store.cenaVista(id)` → `await montada.tocar({ jaVista })` → `store.verCena(id)` (lembrar_vista) → `salvar(id)`
 * (salvar_ao_fim) → not `rodando`, `hud.modoCinema(false)` → `cena:terminou` (+ `cena:pulada`) → `await depois()` →
 * `camera.snap()` (snap_camera).
 *
 * Triggers (`disparar`, also at the start of every `update`): `inicio` plays once, the first time it is evaluated after
 * `registrar`, without waiting for `quieto()`; `lugar`, `missao` and `evento` play only with `quieto()` and the scene's
 * `podeTocar()`, nothing running, and (with lembrar_vista) not seen. A trigger that played fires again only after its
 * condition was false once (matters only when `lembrar_vista` is off); an `evento` waits for the next emission.
 */

/** What a mounted scene gives the director. */
export interface CenaMontada {
  /** The parsed YAML (with gatilho/ritual). */
  cena: Cena;
  cs: Pick<Cutscenes, "rig" | "ativa">;
  tocar(o: { jaVista: boolean }): Promise<{ pulada: boolean }>;
  update(dt: number): void;
  /** Music track the scene wants while it plays (absent = the game's). */
  readonly faixa?: string;
}

export interface OpcoesCena {
  /** Before the ritual starts (hide the real player...). A promise is awaited; a plain return keeps `tocar` synchronous up to the scene. */
  antes?(): void | Promise<void>;
  /**
   * After the scene and its ritual's save; MAY be async (a scene can keep its rig alive during lines that follow it by
   * setting `cs.rig.ativo` itself). `snap_camera` runs after it resolves.
   */
  depois?(r: { pulada: boolean; jaVista: boolean }): void | Promise<void>;
  /** Extra guard for the trigger (on top of the director's `quieto()`). */
  podeTocar?(): boolean;
  /** Call `montada.update(dt)` every frame, playing or not (a stage that drives something of the game all the time). */
  sempre?: boolean;
}

export interface Provedores {
  store: { cenaVista(id: string): boolean; verCena(id: string): void };
  salvar(motivo: string): void;
  hud: { modoCinema(on: boolean): void };
  camera: { snap(): void };
  /** Where the player is (feet, xz), for `lugar` triggers. */
  posicao(): { x: number; z: number };
  /** Time of day 0..1, for `lugar` triggers with `hora`. */
  hora(): number;
  lugares: Record<string, { x: number; z: number }>;
  missoes: { status(id: string): string | null | undefined; passoAtivo(id: string): { tipo: string } | null | undefined };
  /** For `evento` triggers (nanoevents-like `on`). */
  eventos?: { on(nome: string, f: () => void): () => void };
  /** The game is quiet (no dialogue, no screen, not asleep...): every trigger but `inicio` waits for it. */
  quieto(): boolean;
}

export type EventoDiretor = "cena:comecou" | "cena:terminou" | "cena:pulada";

interface Registro {
  id: string;
  montada: CenaMontada;
  o: OpcoesCena;
  armado: boolean;
  /** The condition was true when it last played: wait for it to go false (rising edge). */
  travado: boolean;
  /** An `evento` trigger heard its event and waits for a quiet moment. */
  pendente: boolean;
}

/** `hora` in the window [de, ate] (0..1); de > ate wraps midnight. */
export function naJanela(hora: number, [de, ate]: readonly [number, number]) {
  return de <= ate ? hora >= de && hora <= ate : hora >= de || hora <= ate;
}

export class Diretor {
  private cenas = new Map<string, Registro>();
  private ouvintes = new Map<EventoDiretor, Set<(id: string) => void>>();
  private _atual: string | null = null;

  constructor(private p: Provedores) {}

  /** Registers a mounted scene under `id` (its YAML's id); arms its trigger if it has one. */
  registrar(id: string, montada: CenaMontada, o: OpcoesCena = {}) {
    if (this.cenas.has(id)) throw new Error(`diretor: cena "${id}" registrada duas vezes`);
    if (montada.cena.id !== id) throw new Error(`diretor: cena registrada como "${id}" tem id "${montada.cena.id}"`);
    const g = montada.cena.gatilho;
    const r: Registro = { id, montada, o, armado: !!g, travado: false, pendente: false };
    if (g?.tipo === "lugar" && !(g.lugar in this.p.lugares)) throw new Error(`diretor: cena "${id}": lugar "${g.lugar}" não existe`);
    if (g?.tipo === "evento") {
      if (!this.p.eventos) throw new Error(`diretor: cena "${id}" tem gatilho de evento e o diretor não tem eventos`);
      this.p.eventos.on(g.nome, () => { if (r.armado) r.pendente = true; });
    }
    this.cenas.set(id, r);
  }

  /** Arms or disarms a scene's own trigger (e.g. the opening on `?intro=0/1`). */
  armar(id: string, on: boolean) {
    const r = this.registro(id);
    r.armado = on && !!r.montada.cena.gatilho;
    if (!r.armado) r.pendente = false;
  }

  /** A scene is playing (its ritual included, `depois` excluded). */
  get rodando() {
    return this._atual !== null;
  }

  /** Id of the scene playing, or null. */
  get atual() {
    return this._atual;
  }

  /** Some scene's rig drives the camera (also during an async `depois` that keeps the rig alive). */
  cameraOcupada() {
    for (const r of this.cenas.values()) if (r.montada.cs.rig.ativo) return true;
    return false;
  }

  /** The music track of the running scene, or null (none running, or it has no track of its own). */
  faixa(): string | null {
    return this._atual ? this.cenas.get(this._atual)!.montada.faixa ?? null : null;
  }

  /** Plays now, ignoring the trigger: the ritual round `montada.tocar`. Rejects while another scene runs. */
  tocar(id: string): Promise<{ pulada: boolean; jaVista: boolean }> {
    const r = this.registro(id);
    if (this._atual) return Promise.reject(new Error(`diretor: "${id}" pedida com "${this._atual}" tocando`));
    this._atual = id; // taken before `antes`, so nothing else starts in between
    let antes: void | Promise<void>;
    try {
      antes = r.o.antes?.();
    } catch (e) {
      this._atual = null;
      return Promise.reject(e);
    }
    return antes && typeof (antes as Promise<void>).then === "function"
      ? (antes as Promise<void>).then(() => this.ritual(r), (e) => { this._atual = null; throw e; })
      : this.ritual(r);
  }

  /** Evaluates the armed triggers now and plays the first that fires (`update` does it every frame). */
  disparar() {
    for (const r of this.cenas.values()) {
      if (!r.armado || this._atual) continue;
      const g = r.montada.cena.gatilho!;
      if (r.montada.cena.ritual.lembrar_vista && this.p.store.cenaVista(r.id)) {
        if (g.tipo === "inicio") r.armado = false; // once: seen at start-up, it never plays by itself
        continue;
      }
      if (g.tipo === "inicio") {
        r.armado = false;
        this.disparada(r.id);
        return;
      }
      const cond = this.condicao(r, g);
      if (!cond) { r.travado = false; continue; }
      if (r.travado || !this.p.quieto() || (r.o.podeTocar && !r.o.podeTocar())) continue;
      r.travado = true;
      r.pendente = false;
      this.disparada(r.id);
      return;
    }
  }

  /** Every frame: the triggers, then `update(dt)` of the running scene (and of any whose rig is active, or `sempre`). */
  update(dt: number) {
    this.disparar();
    for (const r of this.cenas.values()) {
      if (r.o.sempre || r.montada.cs.ativa || r.montada.cs.rig.ativo) r.montada.update(dt);
    }
  }

  on(evento: EventoDiretor, f: (id: string) => void): () => void {
    let s = this.ouvintes.get(evento);
    if (!s) this.ouvintes.set(evento, (s = new Set()));
    s.add(f);
    return () => s!.delete(f);
  }

  private registro(id: string) {
    const r = this.cenas.get(id);
    if (!r) throw new Error(`diretor: cena "${id}" não registrada (tem: ${[...this.cenas.keys()].join(", ")})`);
    return r;
  }

  private condicao(r: Registro, g: Gatilho): boolean {
    switch (g.tipo) {
      case "lugar": {
        const l = this.p.lugares[g.lugar], p = this.p.posicao();
        return Math.hypot(p.x - l.x, p.z - l.z) <= g.raio && (!g.hora || naJanela(this.p.hora(), g.hora));
      }
      case "missao":
        return g.passo ? this.p.missoes.passoAtivo(g.missao)?.tipo === g.passo : this.p.missoes.status(g.missao) === "ativa";
      case "evento":
        return r.pendente;
      default:
        return false;
    }
  }

  /** A trigger's play: nobody awaits it, so its failure is logged instead of left unhandled. */
  private disparada(id: string) {
    this.tocar(id).catch((e) => console.error(e));
  }

  private emitir(evento: EventoDiretor, id: string) {
    for (const f of [...(this.ouvintes.get(evento) ?? [])]) f(id);
  }

  private async ritual(r: Registro): Promise<{ pulada: boolean; jaVista: boolean }> {
    const { id, montada, o } = r, ritual = montada.cena.ritual, p = this.p;
    let pulada = false, jaVista = false;
    try {
      if (ritual.esconder_hud) p.hud.modoCinema(true);
      this.emitir("cena:comecou", id);
      jaVista = p.store.cenaVista(id);
      ({ pulada } = await montada.tocar({ jaVista }));
      if (ritual.lembrar_vista) p.store.verCena(id);
      if (ritual.salvar_ao_fim) p.salvar(id);
    } finally {
      this._atual = null;
      if (ritual.esconder_hud) p.hud.modoCinema(false);
    }
    this.emitir("cena:terminou", id);
    if (pulada) this.emitir("cena:pulada", id);
    await o.depois?.({ pulada, jaVista });
    if (ritual.snap_camera) p.camera.snap();
    return { pulada, jaVista };
  }
}
