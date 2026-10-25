# MDM: Mapa de Dependência de Missões

Página web que lê a pasta de um jogo (pelo `jogo.yaml`) e mostra o conteúdo como um grafo navegável: missões,
pessoas, lugares, itens, receitas, diálogos, poderes, onde colher, cenas e regiões, com as setas do que depende do
quê (quem dá a missão, o que ela exige, aonde cada passo vai, o que ganha, o que muda no mundo). Feito para a criança
clicar e entender como o jogo é montado por dentro, e para o adulto pensar as próximas missões.

O nome vem do *Puzzle Dependency Chart* de Ron Gilbert, o diagrama com que ele planejava os adventures da LucasArts:
<https://grumpygamer.com/puzzle_dependency_charts>.

O modo de edição se chama **MDM editor**: com o botão "✏️ MDM editor: quero mudar o jogo", a criança arrasta a ponta
de uma seta para outra caixinha (outra pessoa dá a missão, o passo vai a outro lugar), muda textos, quantidades,
recompensas e falas (com o limite de 2 linhas de 38 letras), desfaz e refaz. As mudanças ficam no navegador como
operações declarativas (`src/game/edicoes/` do motor), o jogo pode aplicá-las por cima dos YAML, e
`scripts/aplicar-edicoes.mjs` as escreve nos YAML do repositório do jogo, preservando comentários.

## Rodar

```bash
npm install
npm run dev -- --jogo ../exemplos/missoes-dos-jogos     # http://localhost:5190/ (mudar um YAML recarrega a página)
npm run build -- --jogo ../meu-jogo                     # site estático em dist-meu-jogo/ (caminhos relativos)
npm run missoes-md -- --jogo ../meu-jogo                # a tabela das missões em Markdown, para rabiscar as próximas
npm run capturar -- --jogo ../meu-jogo                  # Chromium headless: checagens e capturas, MDM editor incluído
npm test                                                # vitest: carregador, montagem do grafo, escrita das edições no YAML
node scripts/aplicar-edicoes.mjs --jogo ../meu-jogo --json edicoes.json [--dry-run]
```

Todos os scripts têm `--help`. Ideias e próximos passos, incluindo a pesquisa do MDM editor: [docs/IDEIAS.md](docs/IDEIAS.md).
A cópia publicada com as missões de exemplo: <https://peas.github.io/li2-engine/mdm/>.
