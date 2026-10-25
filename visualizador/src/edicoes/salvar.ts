/**
 * Writes a document of edits (the MDM editor's ops) into a game folder: finds each quest and dialogue file through the
 * game's `jogo.yaml`, groups the ops by file, applies them with the surgical writer (`yaml.ts`) and, unless `gravar` is
 * false, writes the files that changed. Shared by the CLI (`scripts/aplicar-edicoes.mjs`) and the dev server's
 * "Salvar no jogo" endpoint (`vite.config.ts`). Node only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parse } from "yaml";
import type { Conflito, DocumentoEdicoes, Op } from "../../../src/game/edicoes/edicoes.ts";
import { lerManifesto } from "../../../src/game/manifesto.ts";
import { arquivosDoCaminho } from "../carregador/ler.ts";
import { aplicarNoYaml, diffLinhas } from "./yaml.ts";

export interface ArquivoSalvo {
  /** Relative to the game folder. */
  arquivo: string;
  aplicadas: Op[];
  /** Changed lines with two of context (`diffLinhas`). */
  diff: string[];
  /** The Document rewrite was used (a file shape the surgical writer does not handle). */
  reescrito?: boolean;
}

export interface RelatorioSalvar {
  arquivos: ArquivoSalvo[];
  /** Ops whose `de` no longer matches the repo: never written. */
  conflitos: (Conflito & { arquivo: string })[];
  /** Ops whose quest or dialogue file is not in the game any more. */
  semArquivo: Op[];
  /** Whether the files were written (false for a preview). */
  gravou: boolean;
}

/** Every quest and dialogue file the manifest lists, by `missao:<id>` / `dialogo:<id>`. */
function arquivosDoJogo(raiz: string): Map<string, { arquivo: string; tipo: "missao" | "dialogo"; id: string }> {
  const manifesto = lerManifesto(readFileSync(join(raiz, "jogo.yaml"), "utf8"));
  const porAlvo = new Map<string, { arquivo: string; tipo: "missao" | "dialogo"; id: string }>();
  for (const f of arquivosDoCaminho(raiz, manifesto.conteudo.missoes ?? "")) {
    const id = (parse(readFileSync(f, "utf8")) as { id?: unknown } | null)?.id;
    if (typeof id === "string") porAlvo.set(`missao:${id}`, { arquivo: f, tipo: "missao", id });
  }
  for (const f of arquivosDoCaminho(raiz, manifesto.conteudo.dialogos ?? "")) {
    const id = basename(f).replace(/\.ya?ml$/, "");
    porAlvo.set(`dialogo:${id}`, { arquivo: f, tipo: "dialogo", id });
  }
  return porAlvo;
}

export function salvarNoJogo(raiz: string, doc: DocumentoEdicoes, { gravar }: { gravar: boolean }): RelatorioSalvar {
  const porAlvo = arquivosDoJogo(raiz);
  const grupos = new Map<string, Op[]>();
  const semArquivo: Op[] = [];
  for (const op of doc.ops) {
    const alvo = op.tipo === "fala.texto" ? `dialogo:${op.dialogo}` : `missao:${op.missao}`;
    if (!porAlvo.has(alvo)) { semArquivo.push(op); continue; }
    grupos.set(alvo, [...(grupos.get(alvo) ?? []), op]);
  }
  const arquivos: ArquivoSalvo[] = [];
  const conflitos: RelatorioSalvar["conflitos"] = [];
  for (const [alvo, ops] of grupos) {
    const { arquivo, tipo, id } = porAlvo.get(alvo)!;
    const rel = relative(raiz, arquivo);
    const antes = readFileSync(arquivo, "utf8");
    const r = aplicarNoYaml(antes, tipo, id, ops);
    conflitos.push(...r.conflitos.map((c) => ({ ...c, arquivo: rel })));
    if (!r.aplicadas.length) continue;
    arquivos.push({ arquivo: rel, aplicadas: r.aplicadas, diff: diffLinhas(antes, r.fonte), ...(r.reescrito && { reescrito: true }) });
    if (gravar) writeFileSync(arquivo, r.fonte);
  }
  return { arquivos, conflitos, semArquivo, gravou: gravar };
}
