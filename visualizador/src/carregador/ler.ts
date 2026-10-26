/**
 * Reads a game folder (the folder with its `jogo.yaml`) into a `Conteudo`. Node only (fs). Where each kind of content lives
 * comes from the game's manifest (`jogo.yaml`, engine `game/manifesto.ts`); without one, from the paths the two games
 * used before it (`CAMINHOS`) and a warning. A kind that is missing becomes a warning, never an error, so the page
 * always opens. Quests are validated with the engine's schema plus the game's own step shapes (from the manifest's
 * `passos_extras`, or `PASSOS_DOS_JOGOS` without one); a quest that fails is still shown, with the complaint attached.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { Id, LugarId, PassoBase, criarMissaoSchema } from "../../../src/game/missoes/schema.ts";
import { passosDoManifesto } from "./esquema.ts";
import { carregarRepetiveis, gerarRepetivel } from "../../../src/game/missoes/repetiveis.ts";
import { lerManifesto, type Manifesto } from "../../../src/game/manifesto.ts";
import type {
  Colhivel, Conteudo, Cutscene, Dialogo, Item, Lugar, Missao, Novidade, PassoBruto, PassoExtra, Pessoa, Poder, Receita, Regiao, SecaoAjuda,
} from "./tipos.ts";

/** Without a manifest: the step shapes the two games registered (tresilhas: domar; dragão: apagar_incendio, levar_voando). `achar` is the engine's since batch 3. */
export const PASSOS_DOS_JOGOS = [
  PassoBase.extend({ tipo: z.literal("domar") }),
  PassoBase.extend({ tipo: z.literal("apagar_incendio"), incendio: Id, lugar: LugarId, raio: z.number().positive() }),
  PassoBase.extend({ tipo: z.literal("levar_voando"), npc: Id, lugar: LugarId, raio: z.number().positive(), dialogo_monta: Id, dialogo: Id }),
] as const;
export const MissaoSchema = criarMissaoSchema([...PASSOS_DOS_JOGOS]);

export { passosDoManifesto } from "./esquema.ts";

/** The loose shape we fall back to when the engine schema refuses a quest: enough to draw it and say what is wrong. */
const MissaoSolta = z.looseObject({
  id: z.string(),
  titulo: z.string().default("(sem título)"),
  descricao: z.string().default(""),
  quem: z.string().default("?"),
  dificuldade: z.enum(["facil", "media", "dificil"]).catch("facil"),
  requer: z.array(z.string()).default([]),
  oferecer_apos: z.string().optional(),
  dialogo_oferta: z.string().default(""),
  dialogo_andamento: z.string().default(""),
  dialogo_feito: z.string().default(""),
  passos: z.array(z.looseObject({ tipo: z.string().default("?"), texto: z.string().default("") })).default([]),
  ao_concluir: z.looseObject({}).default({}),
});

/** Without a manifest: where each game kept each kind of content, in the order we try (the kinds of before jogo.yaml). */
export const CAMINHOS = {
  missoes: ["src/game/missoes"],
  dialogos: ["src/game/dialogos"],
  pessoas: ["src/game/moradores.yaml", "src/game/moradores.ts"],
  lugares: ["src/world/lugares.ts", "src/world/map.ts"],
  itens: ["src/game/itens.yaml", "src/game/itens/itens.yaml"],
  receitas: ["src/game/receitas.yaml"],
  poderes: ["src/game/poderes/poderes.yaml", "src/game/poderes.yaml"],
  novidades: ["src/game/novidades/novidades.yaml", "src/game/novidades.yaml"],
  ajuda: ["src/game/ui/ajuda.yaml"],
} as const;
type Tipo = keyof typeof CAMINHOS | "colhiveis" | "regioes" | "cutscenes";
/** The manifest's name for a kind, when it differs (`moradores` are the viewer's `pessoas`). */
const NO_MANIFESTO: Partial<Record<Tipo, string>> = { pessoas: "moradores" };
export const SEM_MANIFESTO = "sem jogo.yaml: caminhos padrão";

/** Files inside the quests folder that are not quests (templates, code). */
const NAO_SAO_MISSOES = new Set(["repetiveis.yaml"]);

const yamls = (dir: string) => readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
const lerYaml = (caminho: string): unknown => load(readFileSync(caminho, "utf8"));
const semExtensao = (f: string) => basename(f).replace(/\.ya?ml$/, "");
const ehPasta = (abs: string) => existsSync(abs) && statSync(abs).isDirectory();

/**
 * The files a path names: a file; a folder (its YAMLs); or a glob whose last part has `*` (`src/game/missoes/*.yaml`).
 * Sorted; empty when nothing is there.
 */
export function arquivosDoCaminho(raiz: string, rel: string): string[] {
  const abs = join(raiz, rel);
  if (rel.includes("*")) {
    const dir = dirname(abs);
    const re = new RegExp(`^${basename(rel).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
    return ehPasta(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => join(dir, f)) : [];
  }
  if (ehPasta(abs)) return yamls(abs).map((f) => join(abs, f));
  return existsSync(abs) ? [abs] : [];
}

export function lerJogo(pasta: string): Conteudo {
  const raiz = resolve(pasta.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  const lidos: Record<string, string> = {};
  const avisos: string[] = [];
  let manifesto: Manifesto | null = null;
  if (existsSync(join(raiz, "jogo.yaml"))) {
    try { manifesto = lerManifesto(readFileSync(join(raiz, "jogo.yaml"), "utf8")); lidos.manifesto = "jogo.yaml"; }
    catch (e) { avisos.push(`${(e as Error).message} (uso os caminhos padrão)`); }
  }
  if (!manifesto) { avisos.push(SEM_MANIFESTO); lidos.manifesto = SEM_MANIFESTO; }
  const schemaMissao = manifesto ? criarMissaoSchema(passosDoManifesto(manifesto.passos_extras)) : MissaoSchema;

  /** The files of `tipo` (several for a folder or glob), or null with a warning (none without manifest for the new kinds). */
  const acha = (tipo: Tipo): string[] | null => {
    if (manifesto) {
      const rel = manifesto.conteudo[NO_MANIFESTO[tipo] ?? tipo] ?? manifesto.conteudo[tipo];
      if (rel === undefined) return null; // the game does not have it: nothing to say
      const abs = arquivosDoCaminho(raiz, rel);
      if (!abs.length) { avisos.push(`${tipo}: jogo.yaml diz ${rel}, mas não há nada lá`); return null; }
      lidos[tipo] = rel;
      return abs;
    }
    if (!(tipo in CAMINHOS)) return null;
    for (const rel of CAMINHOS[tipo as keyof typeof CAMINHOS]) {
      const abs = join(raiz, rel);
      if (existsSync(abs)) { lidos[tipo] = ehPasta(abs) ? `${rel}/*.yaml` : rel; return ehPasta(abs) ? yamls(abs).map((f) => join(abs, f)) : [abs]; }
    }
    avisos.push(`${tipo}: não achei nenhum de ${CAMINHOS[tipo as keyof typeof CAMINHOS].join(", ")}`);
    return null;
  };
  /** Runs `fn` on the first file of `tipo`; a file that does not parse is a warning and yields `vazio`. */
  const le = <T>(tipo: Tipo, vazio: T, fn: (abs: string) => T): T => {
    const abs = acha(tipo)?.[0];
    if (!abs) return vazio;
    try { return fn(abs); } catch (e) {
      avisos.push(`${tipo} (${lidos[tipo]}): ${(e as Error).message}`);
      return vazio;
    }
  };
  /** Runs `fn` on every file of `tipo` (folders, globs); a file that fails is a warning, the others still load. */
  const cada = <T>(tipo: Tipo, fn: (abs: string, f: string) => T | null): T[] => {
    const out: T[] = [];
    for (const abs of acha(tipo) ?? []) {
      const f = basename(abs);
      try { const x = fn(abs, f); if (x !== null) out.push(x); } catch (e) { avisos.push(`${tipo}/${f}: ${(e as Error).message}`); }
    }
    return out;
  };
  const relDe = (tipo: Tipo, f: string) => `${dirname(lidos[tipo] ?? "")}/${f}`.replace(/^\.\//, "");

  // the repeatable quests' templates become one example quest per template (`rep-1`, `rep-2`...: what the game would offer)
  const repetiveis: Missao[] = [];
  const missoes = cada<Missao>("missoes", (abs, f) => {
    if (NAO_SAO_MISSOES.has(f)) {
      const cfg = carregarRepetiveis(readFileSync(abs, "utf8"), relDe("missoes", f));
      for (let n = 1; n <= cfg.moldes.length; n++) repetiveis.push(lerMissao(gerarRepetivel(n, cfg), relDe("missoes", f), schemaMissao));
      return null;
    }
    return { ...lerMissao(lerYaml(abs), relDe("missoes", f), schemaMissao), fonte: readFileSync(abs, "utf8") };
  });
  missoes.push(...repetiveis);
  const dialogos = cada("dialogos", (abs, f) => lerDialogo(lerYaml(abs), semExtensao(f), relDe("dialogos", f)));
  const cutscenes = cada("cutscenes", (abs, f) => lerCutscene(readFileSync(abs, "utf8"), semExtensao(f), relDe("cutscenes", f)));

  const pessoas = le("pessoas", [] as Pessoa[], (abs) => abs.endsWith(".ts") ? lerPessoasTs(readFileSync(abs, "utf8")) : lerPessoasYaml(lerYaml(abs)));
  const lugares = le("lugares", [] as Lugar[], (abs) => lerLugaresTs(readFileSync(abs, "utf8")));
  // the manifest's extras: people and places that live in the game's code
  for (const p of manifesto?.extras?.pessoas ?? []) if (!pessoas.some((x) => x.id === p.id)) pessoas.push({ ...p });
  for (const l of manifesto?.extras?.lugares ?? []) if (!lugares.some((x) => x.id === l.id)) lugares.push({ ...l });
  const itens = le("itens", [] as Item[], (abs) => lerLista(lerYaml(abs), "itens", (x) => ({
    id: str(x.id), nome: str(x.nome, str(x.id)), tipo: opt(x.tipo), descricao: opt(x.descricao), coracoes: num(x.coracoes), fome: num(x.fome), preco: num(x.preco),
  })));
  const receitas = le("receitas", [] as Receita[], (abs) => lerLista(lerYaml(abs), "receitas", (x) => ({
    id: str(x.id), nome: str(x.nome, str(x.id)), ingredientes: registro(x.ingredientes), resultado: str((x.resultado as Record<string, unknown>)?.item, ""), descricao: opt(x.descricao),
  })));
  const poderes = le("poderes", [] as Poder[], (abs) => lerLista(lerYaml(abs), "poderes", (x) => ({ id: str(x.id), nome: str(x.nome, str(x.id)), descricao: opt(x.descricao), cor: opt(x.cor) })));
  const novidades = le("novidades", [] as Novidade[], (abs) => lerLista(lerYaml(abs), "novidades", (x) => ({
    versao: num(x.versao) ?? 0, data: String(x.data instanceof Date ? x.data.toISOString().slice(0, 10) : x.data ?? ""), titulo: str(x.titulo, ""), falas: (x.falas as string[] ?? []).map(String),
  })).sort((a, b) => b.versao - a.versao));
  const ajuda = le("ajuda", [] as SecaoAjuda[], (abs) => lerLista(lerYaml(abs), "secoes", (s) => ({
    titulo: str(s.titulo, ""), linhas: ((s.linhas as Record<string, unknown>[]) ?? []).map((l) => ({ tecla: opt(l.tecla), titulo: opt(l.titulo), texto: str(l.texto, "") })),
  })));
  const colhiveis = le("colhiveis", [] as Colhivel[], (abs) => lerColhiveis(lerYaml(abs)));
  const regioes = le("regioes", [] as Regiao[], (abs) => lerLista(lerYaml(abs), "regioes", (x) => ({
    id: str(x.id), nome: str(x.nome, str(x.id)), quando: Array.isArray(x.quando) ? (x.quando as Record<string, unknown>[]) : [], ...(x.padrao === true && { padrao: true }),
  })));

  return {
    jogo: { nome: basename(raiz), pasta: raiz, titulo: manifesto?.nome ?? basename(raiz) },
    missoes, dialogos, pessoas, lugares, itens, receitas, poderes, novidades, ajuda, colhiveis, cutscenes, regioes,
    passosExtras: manifesto?.passos_extras ?? {}, lidos, avisos,
  };
}

/** colhiveis.yaml: one node per entry, id `${item}-${onde}` (a suffix when the same item grows twice in one place). */
export function lerColhiveis(doc: unknown): Colhivel[] {
  const vistos = new Map<string, number>();
  return lerLista(doc, "colhiveis", (x) => {
    const base = `${str(x.item)}-${str(x.onde)}`, n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return {
      id: n > 1 ? `${base}-${n}` : base, item: str(x.item), onde: str(x.onde), arranjo: str(x.arranjo, "?"),
      quantos: Array.isArray(x.quantos) ? (x.quantos as unknown[]).map(Number) : num(x.quantos) ?? 1,
      ...(num(x.semente) !== undefined && { semente: num(x.semente) }),
      ...(Array.isArray(x.em) && { em: (x.em as unknown[]).map(Number) }),
      ...(num(x.regrow) !== undefined && { regrow: num(x.regrow) }),
    };
  });
}

/** A cutscene file: id, pulavel, how many steps and cameras, the trigger and the ritual, and the top comment as its description. */
export function lerCutscene(fonte: string, id: string, arquivo: string): Cutscene {
  const d = (load(fonte) ?? {}) as Record<string, unknown>;
  if (typeof d !== "object" || !Array.isArray(d.passos)) throw new Error("não é uma cena (falta a lista `passos`)");
  const topo: string[] = [];
  for (const linha of fonte.split("\n")) { const m = linha.match(/^#\s?(.*)$/); if (!m) break; topo.push(m[1]); }
  const descricao = topo.join(" ").replace(/\s+/g, " ").trim() || undefined;
  const gatilho = d.gatilho && typeof d.gatilho === "object" ? d.gatilho as Cutscene["gatilho"] : undefined;
  const ritual = d.ritual && typeof d.ritual === "object" ? d.ritual as Record<string, boolean> : undefined;
  return {
    id: str(d.id, id), pulavel: opt(d.pulavel), passos: d.passos.length, cameras: Object.keys((d.cameras as object) ?? {}).length,
    ...(gatilho && { gatilho }), ...(ritual && { ritual }), descricao, arquivo,
  };
}

// ---- helpers over the raw YAML (a game file may be missing an optional key; never throw on that) ----
const str = (v: unknown, padrao?: string): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : padrao ?? "");
const opt = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const registro = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, n] of Object.entries(v as Record<string, unknown>)) out[k] = typeof n === "number" ? n : 1;
  return out;
};
function lerLista<T>(doc: unknown, chave: string, fn: (x: Record<string, unknown>) => T): T[] {
  const lista = (doc as Record<string, unknown> | null)?.[chave];
  if (!Array.isArray(lista)) throw new Error(`falta a lista "${chave}"`);
  return lista.map((x) => fn(x as Record<string, unknown>));
}

export function lerMissao(doc: unknown, arquivo: string, schema: z.ZodType = MissaoSchema): Missao {
  const r = schema.safeParse(doc) as z.ZodSafeParseResult<z.infer<typeof MissaoSchema>>;
  if (r.success) {
    const d = r.data;
    return { ...d, requer: d.requer ?? [], passos: d.passos as PassoBruto[], ao_concluir: (d.ao_concluir ?? {}) as Missao["ao_concluir"], arquivo, avisos: [] };
  }
  const solto = MissaoSolta.safeParse(doc);
  if (!solto.success) throw new Error(`não é uma missão: ${z.prettifyError(solto.error)}`);
  const d = solto.data;
  return { ...d, passos: d.passos as PassoBruto[], ao_concluir: d.ao_concluir as Missao["ao_concluir"], arquivo, avisos: [`não passou no schema do engine: ${z.prettifyError(r.error).replace(/\n\s*/g, " ")}`] };
}

export function lerDialogo(doc: unknown, id: string, arquivo: string): Dialogo {
  const d = (doc ?? {}) as { personagem?: string; retrato?: string; falas?: { quem?: string; texto?: string }[] };
  const personagem = d.personagem ?? "";
  const falas = Array.isArray(d.falas) ? d.falas.map((f) => ({ quem: f?.quem ?? personagem, texto: String(f?.texto ?? "").trim() })) : [];
  return { id, personagem, retrato: d.retrato ?? personagem.toLowerCase(), falas, arquivo };
}

export function lerPessoasYaml(doc: unknown): Pessoa[] {
  return lerLista(doc, "moradores", (x) => ({ id: str(x.id), nome: str(x.nome, str(x.id)), papel: opt(x.papel), lugar: opt(x.lugar), dialogo: opt(x.dialogo) }));
}

/** The Dragão keeps its villagers in TS (`PESSOAS: Pessoa[]`): one object per entry, `id`, `nome` and `dialogo` as string literals. */
export function lerPessoasTs(fonte: string): Pessoa[] {
  const out: Pessoa[] = [];
  const re = /id:\s*"([a-z0-9-]+)"\s*,\s*nome:\s*"([^"]*)"\s*,\s*dialogo:\s*"([a-z0-9-]+)"/g;
  for (const m of fonte.matchAll(re)) out.push({ id: m[1], nome: m[2], dialogo: m[3] });
  if (!out.length) throw new Error("não achei entradas `id: \"...\", nome: \"...\", dialogo: \"...\"`");
  return out;
}

/**
 * Both games keep their places in TS: `export const PLACES = { chave: spot(...), ... }`. We do not run the file (it
 * imports three.js and the engine); we read the keys of the object's first level and the `/** ... *\/` comment right
 * above each one as the description. A key whose value starts with `[` is a list of points (groves, paths).
 */
export function lerLugaresTs(fonte: string): Lugar[] {
  const inicio = fonte.search(/export const PLACES\s*=\s*\{/);
  if (inicio < 0) throw new Error("não achei `export const PLACES = {`");
  const corpo = fonte.slice(fonte.indexOf("{", inicio) + 1);
  const out: Lugar[] = [];
  let comentario: string | undefined;
  let nivel = 0;
  for (const linha of corpo.split("\n")) {
    const t = linha.trim();
    if (nivel === 0 && (t.startsWith("}") && !t.startsWith("},"))) break;
    if (nivel === 0) {
      const c = t.match(/^\/\*\*\s*(.*?)\s*(\*\/)?$/);
      if (c) { comentario = c[1]; if (!c[2]) comentario += " "; }
      else if (t.startsWith("*") && comentario !== undefined && !t.startsWith("*/")) comentario += t.replace(/^\*\s?/, "").replace(/\*\/\s*$/, "").trim() + " ";
      else if (t.startsWith("*/")) { /* end of a multi-line comment */ }
      else if (t.startsWith("//")) comentario = undefined;
      else {
        const m = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.)/);
        if (m) out.push({ id: m[1], descricao: comentario?.replace(/\s+/g, " ").trim() || undefined, lista: m[2] === "[" || undefined });
        comentario = undefined;
      }
    }
    // track nesting so a multi-line value (a list of paths) does not leak its inner lines as keys
    for (const ch of t) { if (ch === "{" || ch === "[") nivel++; else if (ch === "}" || ch === "]") nivel--; }
    if (nivel < 0) break;
  }
  if (!out.length) throw new Error("PLACES sem chaves que eu reconheça");
  return out;
}
