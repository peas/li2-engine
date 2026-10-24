import * as THREE from "three";
import type GUI from "lil-gui";
import type { Collider } from "../../core/types";
import type { WorldMap } from "../../world/map";
import type { Marco } from "../bussola";
import { BICHO_PARAMS, Bicho, type Contexto, type EstadoBicho, type Protagonista } from "./bicho";
import type { Especie, Regiao } from "./especies";
import { Matilha } from "./lobo";

export interface OpcoesBichos {
  onCacou?: (pos: THREE.Vector3, cor: THREE.Color) => void;
  onSplash?: (pos: THREE.Vector3) => void;
  /** A wolf set off to test the protagonist (growl, first-time hint); the testing wolf bit them. */
  onRosnou?: (lobo: Bicho) => void;
  onMordeu?: (lobo: Bicho) => void;
  /** The protagonist's body (m) when `update` does not say (`Protagonista.corpo`): the pack measures in bodies. Default 8. */
  corpo?: number;
  /** Keeps the ground animals out of solid scenery (houses, trees). None = they only avoid the water. */
  colisor?: Collider;
  /** Spawn reach as a fraction of the region radius, per region key (default: pasta 0.5, pula 1.35, others 0.8). */
  nascerAte?: Record<string, number>;
}

/**
 * The animals of the world: spawns every species of the game's bichos.yaml (`carregarEspecies`) in its regions,
 * updates them, answers "what can the protagonist hunt here" and makes them vanish (in sparkles, drawn by the caller
 * through `onCacou`) and come back later. No combat, no blood: hunting is the animal disappearing and the meat going to
 * the bag. A wolf pack (`bando` with `testa`) sends one wolf at a time to test the protagonist up close (`onRosnou`);
 * he bites if they do nothing (`onMordeu`). A `segue` animal waits until `chamar()` and follows them home.
 */
export class Bichos {
  readonly params = {
    ...BICHO_PARAMS,
    /** Animals farther than this from the camera are hidden and frozen (m). */
    verAte: 500,
    /** In the air the protagonist can catch anything (not only birds) when less than this above it (m). */
    vooBaixo: 18,
    /** A hunted animal comes back after this many seconds (min, max). */
    voltaMin: 60,
    voltaMax: 120,
  };
  /** Region names for the compass. */
  readonly marcos: Marco[] = [];
  /** Live animals per species id. */
  readonly counts: Record<string, number> = {};
  readonly todos: Bicho[] = [];
  readonly group = new THREE.Group();
  readonly especies: Especie[];
  private bandos: Bicho[][] = [];
  /** One per pack of `bando` species (same index as `bandos`; null for herds and flocks). */
  private matilhas: (Matilha | null)[] = [];
  private time = 0;
  private ctx: Contexto;
  private estados = { texto: "" };
  private nextEstados = 0;

  constructor(scene: THREE.Scene, private map: WorldMap, especies: readonly Especie[], private opts: OpcoesBichos = {}) {
    this.group.name = "bichos";
    // a copy: lil-gui tunes the speeds live
    this.especies = especies.map((e) => ({ ...e, grupos: e.grupos.map((g) => ({ ...g })) }));
    this.ctx = {
      protagonista: { x: 0, y: 0, z: 0, grounded: true, speed: 0 }, posicao: new THREE.Vector3(),
      alturaSobreChao: 0, corpo: opts.corpo ?? 8, time: 0, params: this.params, map, colisor: opts.colisor,
      onSplash: opts.onSplash, onMordeu: opts.onMordeu,
    };
    this.especies.forEach((e, si) => {
      this.counts[e.id] = 0;
      if (e.marco) this.marcos.push({ nome: e.marco.nome, icone: e.marco.icone, x: e.grupos[0].regiao.x, z: e.grupos[0].regiao.z });
      e.grupos.forEach((g, gi) => {
        const bando: Bicho[] = [];
        const flockDir = gi % 2 ? -1 : 1;
        for (let i = 0; i < g.quantidade; i++) {
          const b = new Bicho(e, g.regiao, i, (si + 1) * 10007 + gi * 1009 + i * 31);
          // a wolf pack starts together around its leader
          const perto = e.comportamento === "bando" && i > 0 ? bando[0].position : undefined;
          this.spawn(b, flockDir, perto);
          bando.push(b);
          this.todos.push(b);
          this.group.add(b.group);
          this.counts[e.id]++;
        }
        // a pack that does not test (`testa: false`) has no Matilha: it only circles at `foge` and flees
        const matilha = e.comportamento === "bando" && e.testa ? new Matilha(this.params.lobo) : null;
        for (const b of bando) b.setBando(bando, matilha);
        this.bandos.push(bando);
        this.matilhas.push(matilha);
      });
    });
    scene.add(this.group);
  }

  /** A valid spawn point inside the region (or within 12 m of `perto`): dry, not steep (fish: water at least 0.6 m deep). Deterministic. */
  private spawn(b: Bicho, flockDir?: number, perto?: { x: number; z: number }) {
    const r: Regiao = b.regiao, c = b.especie.comportamento, m = this.map;
    // herds start in the middle half of their region; fish around the spot (the island: in the water around it)
    const reach = perto ? 12 : r.raio * (this.opts.nascerAte?.[r.chave] ?? (c === "pula" ? 1.35 : c === "pasta" ? 0.5 : 0.8));
    const ox = perto?.x ?? r.x, oz = perto?.z ?? r.z;
    let x = ox, z = oz;
    for (let k = 0; k < 60; k++) {
      const a = b.rand() * Math.PI * 2, d = Math.sqrt(b.rand()) * reach;
      const px = ox + Math.cos(a) * d, pz = oz + Math.sin(a) * d;
      const ok = c === "voa" || (c === "pula"
        ? m.heightAt(px, pz) < m.waterLevel - 0.6
        : m.onLand(px, pz) && m.heightAt(px, pz) > m.waterLevel + 1 && m.slopeAt(px, pz) < 0.6);
      if (ok) { x = px; z = pz; break; }
    }
    b.placeAt(x, z, m, flockDir);
  }

  update(dt: number, protagonista: Protagonista, cameraPosition: THREE.Vector3, time: number) {
    this.time = time;
    const ctx = this.ctx, see2 = this.params.verAte ** 2, p = protagonista;
    ctx.protagonista = p;
    ctx.posicao.set(p.x, p.y, p.z);
    ctx.corpo = p.corpo ?? this.opts.corpo ?? 8;
    ctx.time = time;
    ctx.alturaSobreChao = p.y - Math.max(this.map.heightAt(p.x, p.z), this.map.waterLevel);
    dt = Math.min(dt, 0.1);
    this.bandos.forEach((bando, i) => {
      let cx = 0, cz = 0, n = 0;
      for (const b of bando) if (!b.sumido) { cx += b.position.x; cz += b.position.z; n++; }
      if (n) { cx /= n; cz /= n; }
      for (const b of bando) {
        if (b.sumido) {
          if (time >= b.voltaEm) this.voltar(b);
          continue;
        }
        if (b.position.distanceToSquared(cameraPosition) > see2) { b.group.visible = false; continue; }
        b.centroX = cx;
        b.centroZ = cz;
        b.update(dt, ctx);
        if (b.especie.comportamento !== "pula") b.group.visible = true;
      }
      const matilha = this.matilhas[i];
      if (matilha) this.testar(bando, matilha, time);
    });
    if (time > this.nextEstados) {
      this.nextEstados = time + 0.5;
      this.estados.texto = this.resumoEstados();
    }
  }

  /** While the pack circles the protagonist, every 20-40 s one circling wolf sets off to test them (lobo.ts decides when). */
  private testar(bando: Bicho[], matilha: Matilha, time: number) {
    const rondando = bando.filter((b) => !b.sumido && b.estado === "rondando");
    const testando = bando.some((b) => b.teste);
    if (!rondando.length && !testando) { matilha.semRonda(); return; }
    if (!rondando.length || !matilha.deveTestar(time, bando[0].rand)) return;
    const lobo = rondando[Math.floor(bando[0].rand() * rondando.length)];
    lobo.testar(this.params.lobo);
    this.opts.onRosnou?.(lobo);
  }

  /** The wolf testing the protagonist right now (the target of a hit), or null. */
  get loboTestando(): Bicho | null {
    return this.todos.find((b) => b.teste && !b.sumido) ?? null;
  }

  /** Every fish within `raio` m of `center` jumps in the next half second (the water breath). Returns how many. */
  pularAgora(center: THREE.Vector3, raio: number): number {
    let n = 0;
    for (const b of this.todos) {
      if (b.especie.comportamento !== "pula" || b.sumido) continue;
      if (Math.hypot(b.position.x - center.x, b.position.z - center.z) > raio) continue;
      b.pularJa(this.time);
      n++;
    }
    return n;
  }

  /** Nearest huntable animal within `range` m of `posicao` (the protagonist); null if none. On the ground every
   * meat animal counts; in the air only birds, or anything when flying less than `vooBaixo` m above it. Fish only while
   * out of the water; a pack animal (wolf) only while it is the one testing. */
  cacavel(posicao: THREE.Vector3, range: number, grounded: boolean): Bicho | null {
    let best: Bicho | null = null, bestD = range * range;
    for (const b of this.todos) {
      if (b.sumido || !b.item || !b.group.visible) continue;
      if (b.especie.comportamento === "pula" && b.estado !== "pulando") continue;
      if (b.especie.comportamento === "bando" && !b.teste) continue;
      if (!grounded && b.especie.comportamento !== "voa" && posicao.y - b.position.y > this.params.vooBaixo) continue;
      const d = b.position.distanceToSquared(posicao);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** The animal vanishes (onCacou gets its position and main colour) and comes back 60-120 s later in its region.
   * Returns the meat item id ("" for an animal that is not hunted, which `cacavel` never returns). */
  cacar(b: Bicho): string {
    if (b.sumido || !b.item) return b.item ?? "";
    b.sumido = true;
    b.estado = "sumindo";
    b.group.visible = false;
    b.voltaEm = this.time + this.params.voltaMin + b.rand() * (this.params.voltaMax - this.params.voltaMin);
    // the testing wolf got the claw: his test is over and the pack keeps away for a while
    if (b.matilha) { b.teste = null; b.matilha.afastar(this.time, b.rand); }
    this.counts[b.especie.id]--;
    this.opts.onCacou?.(b.position.clone(), b.cor.clone());
    return b.item;
  }

  /** Every animal with `foge` > 0 within `raio` m of `center` runs away from it. Returns how many reacted. */
  assustar(center: THREE.Vector3, raio: number): number {
    let n = 0;
    for (const b of this.todos) {
      if (b.sumido || b.especie.foge <= 0 || b.position.distanceTo(center) > raio) continue;
      b.assustar(center, this.time, this.params);
      n++;
    }
    return n;
  }

  private voltar(b: Bicho) {
    b.sumido = false;
    this.spawn(b);
    this.counts[b.especie.id]++;
  }

  private resumoEstados() {
    const parts: string[] = [];
    for (const e of this.especies) {
      const c: Partial<Record<EstadoBicho, number>> = {};
      for (const b of this.todos) if (b.especie === e) c[b.estado] = (c[b.estado] ?? 0) + 1;
      parts.push(`${e.id}: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    }
    return parts.join(" | ");
  }

  addGui(folder: GUI) {
    const p = this.params;
    folder.add(p, "verAte", 100, 1500, 10).name("mostra até (m)");
    folder.add(p, "calma", 0, 10, 0.5).name("foge por mais (s)");
    folder.add(p, "rondaRaio", 20, 150, 1).name("lobos rondam a (m)");
    folder.add(p, "sustoTempo", 1, 20, 0.5).name("susto dura (s)");
    folder.add(p, "separacao", 0.5, 6, 0.1).name("espaço entre eles");
    folder.add(p, "vooBaixo", 2, 60, 1).name("voo baixo caça (m)");
    folder.add(p, "puloMin", 0.5, 10, 0.5).name("peixe pula de (s)");
    folder.add(p, "puloMax", 1, 20, 0.5).name("peixe pula até (s)");
    const l = folder.addFolder("lobo testa").close();
    l.add(p.lobo, "testaMin", 5, 120, 1).name("testa a cada (s), de");
    l.add(p.lobo, "testaMax", 5, 180, 1).name("até");
    l.add(p.lobo, "testaDura", 0.5, 10, 0.5).name("fica perto (s)");
    l.add(p.lobo, "mordeA", 0.3, 3, 0.1).name("morde a (corpos)");
    l.add(p.lobo, "garraAlcance", 0.5, 4, 0.1).name("garrinha alcança (corpos)");
    l.add(p.lobo, "mordidaEnergia", 0, 50, 1).name("mordida tira (energia)");
    l.add(p.lobo, "afastaTempo", 0, 120, 1).name("bando se afasta por (s)");
    for (const e of this.especies) {
      const f = folder.addFolder(e.nome).close();
      f.add(e, "velocidade", 0.2, 20, 0.1).name("anda (m/s)");
      f.add(e, "velocidadeFuga", 0.5, 30, 0.5).name("corre (m/s)");
      f.add(e, "foge", 0, 80, 1).name(e.comportamento === "bando" ? "distância (m)" : "foge a (m)");
      f.add(this.counts, e.id).name("vivos").disable().listen();
    }
    folder.add(this.estados, "texto").name("estados").disable().listen();
  }
}
