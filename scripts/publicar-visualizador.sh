#!/usr/bin/env bash
# Builds the content viewer for the example quests and copies it into docs/visualizador/, the GitHub Pages copy linked
# from the children's page. The loader embeds the game folder's absolute path in the bundle; it is replaced by the
# repository-relative one, and the run fails if any absolute home path is left.
set -euo pipefail

usage() {
  cat <<'EOF'
Uso: scripts/publicar-visualizador.sh [--jogo PASTA]

Gera o MDM, o Mapa de Dependência de Missões (pasta visualizador/, Vite + Cytoscape), para um jogo de dados e copia o site estático para
docs/mdm/, que o GitHub Pages serve em https://peas.github.io/li2-engine/mdm/ (o antigo docs/visualizador/ só
redireciona para lá).

  --jogo PASTA   pasta com o jogo.yaml (padrão: exemplos/missoes-dos-jogos)
  -h, --help     esta ajuda

Precisa de `npm install` feito em visualizador/. Troca o caminho absoluto da pasta do jogo (que o carregador põe no
bundle) pelo caminho relativo ao repositório e falha se sobrar algum /Users/ ou /home/ no resultado.
EOF
}

raiz="$(cd "$(dirname "$0")/.." && pwd)"
jogo="exemplos/missoes-dos-jogos"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --jogo) jogo="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; usage >&2; exit 2 ;;
  esac
done

abs="$(cd "$raiz/$jogo" && pwd)"
nome="$(basename "$abs")"
(cd "$raiz/visualizador" && npm run build --silent -- --jogo "$abs")
saida="$raiz/visualizador/dist-$nome"
{ grep -rl "$abs" "$saida" || true; } | while IFS= read -r f; do
  ABS="$abs" REL="$jogo" perl -pi -e 's/\Q$ENV{ABS}\E/$ENV{REL}/g' "$f"
done
if grep -rqE '/(Users|home)/' "$saida"; then
  echo "sobrou caminho absoluto em $saida:" >&2
  grep -rhoE '/(Users|home)/[^"`]{0,60}' "$saida" | sort -u >&2
  exit 1
fi
rm -rf "$raiz/docs/mdm"
cp -R "$saida" "$raiz/docs/mdm"
echo "docs/mdm/ pronto ($(du -sh "$raiz/docs/mdm" | cut -f1)) a partir de $jogo"
