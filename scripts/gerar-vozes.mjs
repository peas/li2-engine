#!/usr/bin/env node
// Pre-renders every dialogue line of a game to <jogo>/public/audio/falas/<retrato>/<hash>.mp3 with the voice its
// vozes.yaml gives each portrait, and writes <jogo>/public/audio/falas/index.json (portrait → text → file), the format
// the engine's game/dialogo/arquivos.ts reads (Voz plays the file, else the system voice). The game is found through
// its manifest (jogo.yaml): conteudo.dialogos (glob), conteudo.novidades, conteudo.vozes; plus --extra YAML files (lines that
// live outside the dialogues). The hash covers portrait + text + voice settings, so only changed lines are
// rendered again; files no longer in the index are deleted. From the Dragão's scripts/gerar-vozes.mjs (same hashing,
// same index), made generic in batch 3 of the refactor (23/10/2026).
// Engines: Piper (`piper` from `pipx install piper-tts`; models in <jogo>/local/vozes-modelos/, downloaded on first
// use) and Kokoro (<jogo>/local/kokoro-venv/bin/python + scripts/kokoro-fala.py). Pitch and mono 48 kbps mp3 via ffmpeg.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { chaveDoRetrato, normalizarTexto } from "../src/game/dialogo/arquivos.ts";
import { carregarVozes } from "../src/game/dialogo/vozes.ts";
import { lerManifesto } from "../src/game/manifesto.ts";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/gerar-vozes.mjs [--jogo DIR] [options]
   (from a game: npx --prefix node_modules/li2-engine ... or npm run vozes -- --jogo ~/meujogo in the engine)

Reads the game's manifest (DIR/jogo.yaml): every conversation of conteudo.dialogos (glob, e.g. src/game/dialogos/*.yaml:
\`personagem\`, \`retrato\`, \`falas: [{ quem?, retrato?, texto }]\`), the news of conteudo.novidades (read by the
portrait that vozes.yaml names in \`novidades:\`; none = not recorded) and the voice table of conteudo.vozes (default
src/game/dialogo/vozes.yaml; schema: the engine's game/dialogo/vozes.ts). Renders one mp3 per line (mono, 48 kbps,
pitch-shifted per character) into DIR/public/audio/falas/<retrato>/<hash>.mp3 and rewrites DIR/public/audio/falas/index.json.
A line whose file exists is skipped (the hash covers text + voice), so a normal run after editing a YAML renders only
what changed. Files no line uses any more are deleted. Portraits without a voice are listed at the end (system voice).

  --jogo DIR           the game's root, where jogo.yaml is (default: the current directory)
  --extra ARQ[=RET]    one more YAML of lines (repeatable; relative to DIR; vozes.yaml's \`extras:\` adds the same way):
                       every string under a \`texto\` key (string or list) and every top-level list of strings, spoken
                       by RET (default: the file's \`retrato\`)
                       e.g. --extra src/game/extras/placas.yaml
                            --extra src/game/extras/cartas.yaml=narrador
  --tudo               render everything again, even lines whose file exists
  --so RETRATO         only the lines of that portrait; the index still covers everything already rendered
  --listar             dry run: print what would be rendered and deleted, change nothing
  --sem-apagar         keep files that are not in the index
  --modelos DIR        Piper .onnx models (default <jogo>/local/vozes-modelos; downloaded there on first use)
  --kokoro-python PATH python of the Kokoro venv (default <jogo>/local/kokoro-venv/bin/python;
                       python3.12 -m venv local/kokoro-venv && local/kokoro-venv/bin/pip install kokoro soundfile)

Needs: piper on the PATH (pipx install piper-tts), ffmpeg (brew install ffmpeg); for Kokoro voices also the venv and
Homebrew's espeak-ng. Licences of the voices: the game's public/audio/LICENCAS.md.`);
  process.exit(0);
}
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const opts = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JOGO = resolve(opt("--jogo", "."));
const TUDO = args.includes("--tudo");
const LISTAR = args.includes("--listar");
const SEM_APAGAR = args.includes("--sem-apagar");
const SO = opt("--so", null);
const MODELOS = resolve(JOGO, opt("--modelos", "local/vozes-modelos"));
const KOKORO_PY = resolve(JOGO, opt("--kokoro-python", "local/kokoro-venv/bin/python"));
const SAIDA = join(JOGO, "public/audio/falas");
const TMP = join(tmpdir(), `meninas-vozes-${process.pid}`);
const SR = 22050;

// ---- the game, by its manifest ----
const manifesto = lerManifesto(readFileSync(join(JOGO, "jogo.yaml"), "utf8"), join(JOGO, "jogo.yaml"));
/** A path or a glob with `*` in the file name only (`src/game/dialogos/*.yaml`), relative to the game; sorted. */
function arquivos(caminho) {
  if (!caminho) return [];
  const abs = join(JOGO, caminho);
  if (!basename(abs).includes("*")) return existsSync(abs) ? [abs] : [];
  const re = new RegExp(`^${basename(abs).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  const dir = dirname(abs);
  return existsSync(dir) ? readdirSync(dir).filter((n) => re.test(n)).sort().map((n) => join(dir, n)) : [];
}
const caminhoVozes = manifesto.conteudo.vozes ?? "src/game/dialogo/vozes.yaml";
if (!existsSync(join(JOGO, caminhoVozes))) { console.error(`falta ${caminhoVozes} em ${JOGO} (conteudo.vozes no jogo.yaml)`); process.exit(1); }
const tabela = carregarVozes(readFileSync(join(JOGO, caminhoVozes), "utf8"), caminhoVozes);
const vozes = tabela.vozes;

/** Emoji stay in the line (and the index key) but are not read aloud. */
const falado = (t) => t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
const falas = new Map(); // "retrato\ntexto" → { retrato, texto, voz, hash, nome }
function juntar(retratoBruto, textoBruto) {
  if (typeof textoBruto !== "string" || !retratoBruto) return;
  const retrato = chaveDoRetrato(retratoBruto), texto = normalizarTexto(textoBruto), k = `${retrato}\n${texto}`;
  if (!texto || falas.has(k)) return;
  const voz = vozes[retrato] ?? null;
  const hash = voz ? createHash("sha1").update(JSON.stringify({ retrato, texto, voz })).digest("hex").slice(0, 12) : null;
  falas.set(k, { retrato, texto, voz, hash, nome: hash && `${hash}.mp3` });
}
const lerYaml = (f) => load(readFileSync(f, "utf8")) ?? {};

for (const f of arquivos(manifesto.conteudo.dialogos)) {
  const doc = lerYaml(f);
  for (const fala of doc.falas ?? []) juntar(fala?.retrato ?? doc.retrato ?? fala?.quem ?? doc.personagem ?? "", fala?.texto);
}
if (tabela.novidades) for (const f of arquivos(manifesto.conteudo.novidades))
  for (const n of lerYaml(f).novidades ?? []) for (const t of n.falas ?? []) juntar(tabela.novidades, t);
/** Strings under `texto` keys (string or list) anywhere, and every top-level list of strings. */
function textosDe(doc) {
  const achados = [];
  const andar = (v, chave, topo) => {
    if (typeof v === "string") { if (chave === "texto" || topo) achados.push(v); return; }
    if (Array.isArray(v)) { for (const x of v) andar(x, chave, topo); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) andar(x, k, false);
  };
  for (const [k, v] of Object.entries(doc)) if (Array.isArray(v)) andar(v, k, v.every((x) => typeof x === "string")); else if (typeof v === "object") andar(v, k, false);
  return achados;
}
for (const e of [...tabela.extras, ...opts("--extra")]) {
  const [arq, ret] = e.split("=");
  const abs = resolve(JOGO, arq);
  if (!existsSync(abs)) { console.error(`--extra: ${abs} não existe`); process.exit(1); }
  const doc = lerYaml(abs);
  const retrato = ret ?? doc.retrato;
  if (!retrato) { console.error(`--extra ${arq}: sem \`retrato\` no arquivo; use ${arq}=RETRATO`); process.exit(1); }
  for (const t of textosDe(doc)) juntar(retrato, t);
}

const semVoz = [...new Set([...falas.values()].filter((f) => !f.voz).map((f) => f.retrato))].filter((r) => !tabela.mudos.includes(r));
const comVoz = [...falas.values()].filter((f) => f.voz);
const pendentes = comVoz.filter((f) => (TUDO || !existsSync(join(SAIDA, f.retrato, f.nome))) && (!SO || f.retrato === SO));
console.log(`${manifesto.nome}: ${falas.size} falas em ${new Set([...falas.values()].map((f) => f.retrato)).size} retratos; ${comVoz.length} com voz, ${pendentes.length} para gerar${SO ? ` (só ${SO})` : ""}`);

// ---- tools ----
function run(cmd, cmdArgs, input) {
  const r = spawnSync(cmd, cmdArgs, { input, encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} saiu com ${r.status}:\n${r.stderr}`);
  return r.stdout;
}
function piperPython() {
  const venvs = spawnSync("pipx", ["environment", "--value", "PIPX_LOCAL_VENVS"], { encoding: "utf8" }).stdout?.trim();
  const py = venvs && join(venvs, "piper-tts/bin/python");
  if (!py || !existsSync(py)) throw new Error("piper-tts não está instalado pelo pipx (pipx install piper-tts)");
  return py;
}
function garantirModeloPiper(voz) {
  if (existsSync(join(MODELOS, `${voz}.onnx`))) return;
  console.log(`baixando o modelo Piper ${voz} para ${MODELOS}`);
  mkdirSync(MODELOS, { recursive: true });
  run(piperPython(), ["-m", "piper.download_voices", "--download-dir", MODELOS, voz]);
}
function renderPiper(f, wav) {
  garantirModeloPiper(f.voz.voz);
  run("piper", ["-m", f.voz.voz, "--data-dir", MODELOS, "-f", wav, "--length-scale", (1 / (f.voz.velocidade ?? 1)).toFixed(3), "--sentence-silence", "0.2"], falado(f.texto) + "\n");
}
function renderKokoro(lista) {
  if (!existsSync(KOKORO_PY)) throw new Error(`Kokoro: ${KOKORO_PY} não existe (--help diz como criar o venv)`);
  const jobs = lista.map(({ f, wav }) => ({ texto: falado(f.texto), voz: f.voz.voz, velocidade: f.voz.velocidade ?? 1, saida: wav }));
  run(KOKORO_PY, ["-I", join(ENGINE, "scripts/kokoro-fala.py")], JSON.stringify(jobs));
}
/** wav → mono 48 kbps mp3 at 22 kHz; `tom` shifts the pitch without changing the duration (asetrate + atempo). */
function paraMp3(wav, mp3, tom) {
  const filtros = [`aresample=${SR}`];
  if (tom && tom !== 1) filtros.push(`asetrate=${Math.round(SR * tom)}`, `aresample=${SR}`, `atempo=${(1 / tom).toFixed(4)}`);
  mkdirSync(dirname(mp3), { recursive: true });
  run("ffmpeg", ["-loglevel", "error", "-y", "-i", wav, "-af", filtros.join(","), "-ac", "1", "-ar", String(SR), "-codec:a", "libmp3lame", "-b:a", "48k", mp3]);
}

// ---- render ----
const t0 = Date.now();
if (!LISTAR && pendentes.length) {
  mkdirSync(TMP, { recursive: true });
  const kokoro = [];
  let n = 0;
  for (const f of pendentes) {
    const wav = join(TMP, `${f.hash}.wav`);
    const mp3 = join(SAIDA, f.retrato, f.nome);
    const motor = f.voz.motor ?? "piper";
    console.log(`${++n} de ${pendentes.length} · ${f.retrato} (${motor} ${f.voz.voz}) · ${f.texto.slice(0, 60)}${f.texto.length > 60 ? "…" : ""}`);
    if (motor === "kokoro") { kokoro.push({ f, wav, mp3 }); continue; }
    renderPiper(f, wav);
    paraMp3(wav, mp3, f.voz.tom);
  }
  if (kokoro.length) {
    console.log(`Kokoro: ${kokoro.length} falas num lote`);
    renderKokoro(kokoro);
    for (const { f, wav, mp3 } of kokoro) paraMp3(wav, mp3, f.voz.tom);
  }
  rmSync(TMP, { recursive: true, force: true });
} else if (LISTAR) {
  for (const f of pendentes) console.log(`  geraria ${f.retrato}/${f.nome} · ${f.texto.slice(0, 70)}`);
}

// ---- index and clean-up ----
const indice = { versao: 1, falas: {} };
for (const f of comVoz.sort((a, b) => a.retrato.localeCompare(b.retrato) || a.texto.localeCompare(b.texto))) {
  if (!existsSync(join(SAIDA, f.retrato, f.nome))) continue; // --so or --listar left it out: the game falls back
  (indice.falas[f.retrato] ??= {})[f.texto] = f.nome;
}
const usados = new Set(Object.entries(indice.falas).flatMap(([r, m]) => Object.values(m).map((n) => `${r}/${n}`)));
let apagados = 0, bytes = 0, total = 0;
if (existsSync(SAIDA)) {
  for (const dir of readdirSync(SAIDA, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const nome of readdirSync(join(SAIDA, dir.name))) {
      const rel = `${dir.name}/${nome}`;
      if (usados.has(rel)) { total++; bytes += statSync(join(SAIDA, rel)).size; continue; }
      if (!/^[0-9a-f]{12}\.mp3$/.test(nome)) continue; // not ours
      apagados++;
      if (LISTAR) console.log(`  apagaria ${rel}`);
      else if (!SEM_APAGAR) rmSync(join(SAIDA, rel));
    }
    if (!LISTAR && readdirSync(join(SAIDA, dir.name)).length === 0) rmSync(join(SAIDA, dir.name), { recursive: true });
  }
}
if (!LISTAR) {
  mkdirSync(SAIDA, { recursive: true });
  writeFileSync(join(SAIDA, "index.json"), JSON.stringify(indice, null, 1) + "\n");
}
console.log(`${LISTAR ? "(listar) " : ""}${total} arquivos, ${(bytes / 1048576).toFixed(2)} MB em ${relative(process.cwd(), SAIDA) || SAIDA}; ${apagados} ${LISTAR ? "a apagar" : SEM_APAGAR ? "sobrando (--sem-apagar)" : "apagados"}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (semVoz.length) console.log(`sem voz em ${caminhoVozes} (ficam na voz do sistema): ${semVoz.join(", ")}`);
