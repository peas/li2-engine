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
`scripts/aplicar-edicoes.mjs` as escreve nos YAML do repositório do jogo.

**A ficha** (desde 26/10/2026): no MDM editor, uma missão abre como ficha de propriedades, à la Visual Basic. Cada campo
da missão e de cada passo aparece com o nome que tem no YAML (`titulo`, `quem`, `passos`, `npc`, `qtd`), com o
controle certo: texto, número com limite ou escolha do catálogo inteiro do jogo, com o emoji do tipo. Dá para criar e
apagar passos, mudar a dificuldade e pôr itens no prêmio. O que o jogo exige e está vazio aparece como **⚠️ falta**, e
o "Salvar no jogo" espera até tudo estar completo. "O mundo mudou" e o resto do arquivo aparecem só para ler. Embaixo,
recolhido, **📜 ver como está escrito no jogo** mostra o arquivo como vai ficar, com as linhas mudadas acesas. Esse
trecho só existe no MDM local; a cópia publicada não leva o texto dos arquivos.

**O visual** é de pergaminho: fundo com tons e um grão de papel leve, caixinhas como etiquetas com sombra, setas com a
palavra do YAML antes do texto (`npc: leva para`, `quem: dá a missão`), em letra de máquina.

**💾 Salvar no jogo** (desde 25/10/2026): com o MDM rodando no próprio computador (`npm run dev`), o botão mostra uma
prévia (quais arquivos, quantas mudanças, o que precisa revisar) e grava direto nos YAML do jogo pelo dev server. Só
aceita pedidos do próprio computador: quem abre o MDM pela rede (o tablet) olha, mas não grava. Na cópia publicada o
botão não existe. Depois de salvar, as mudanças gravadas saem do navegador, as que precisam revisar ficam, e a página
reabre com o conteúdo novo. O "📤 Mandar para o papai" continua para quem está em outro aparelho.

**A gravação muda só o que ela mudou** (`src/edicoes/yaml.ts`): cada mudança é uma edição cirúrgica no texto, no lugar
exato do valor e no estilo dele (aspas, número, lista entre colchetes); trocar a ordem dos passos move blocos de linhas
inteiros, cada passo com o comentário logo acima; zerar uma recompensa apaga só a linha dela. Comentários, alinhamento e
linhas em branco ficam como estavam. O resultado é conferido contra o que o motor calculou; se não bater (um formato que
o gravador não conhece, como uma recompensa entre chaves), o arquivo é regravado pelo `yaml` Document, que mantém os
comentários mas pode mexer no alinhamento, e o relatório avisa.

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
