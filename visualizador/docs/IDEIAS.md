# Ideias para o MDM (Mapa de Dependência de Missões) e o MDM editor

## TODO: pesquisa do MDM editor (Paulo, 25/10/2026)

**Pesquisa feita em 25/10/2026**: [docs/agentes/pesquisa-mdm-editor.md](../../docs/agentes/pesquisa-mdm-editor.md) (recomendação, o que adiar, o que não fazer; aguarda a escolha do Paulo). Antes dela, a regra era: **antes de qualquer código, uma pesquisa aprofundada** (com fontes, comparação e recomendação, no formato da KB de
pesquisas do Paulo). Nada abaixo é decisão; são as perguntas que a pesquisa precisa responder:

1. **Bonito e amigável para 10 anos**: como o MDM pode ser bonito e fácil para uma criança de 10 anos (referências de
   interfaces para crianças, como os editores de blocos e os jogos de construção; a linguagem de cor e emoji por tipo
   que já funcionou na página "Como nasce um jogo")?
2. **Uma tradução real dos YAML**: como o MDM pode ser o espelho fiel dos arquivos que ele mapeia, à la Visual Basic:
   inspecionar uma caixinha e mexer nos atributos menores dela num painel de propriedades, ou até editar o YAML dali
   mesmo, sem perder nada que o arquivo tem (comentários, campos que a interface não conhece)?
3. **YAML editável com ajuda**: se o YAML for editável, como corrigir e autocompletar (o schema zod do motor virando
   JSON Schema, validação ao digitar, sugestões de ids de pessoas, lugares e itens que existem, mensagens de erro em
   português para criança)?
4. **Que editor**: Electron, ou algo web que já existe para grafos e diagramas (e quais: editores de nós, bibliotecas
   de grafos editáveis, editores de código no browser)? O que cada opção custa e o que dá de graça.
5. **O foco**: usar o MDM editor como forma de **ensinar programação para crianças**: estados, eventos, condições,
   dados com schema. Como a progressão poderia ir do arrastar setas até escrever um passo novo?

## Edição, etapa 2 (depois da etapa 1 de 23/10/2026: setas, textos, quantidades, recompensa, ordem dos passos)

A etapa 1 só muda o que já existe. O que ela vai pedir em seguida, na ordem provável:

- **Criar uma fala** numa conversa (botão "+ fala" no painel, com o mesmo contador) e **apagar** uma: operações
  `fala.nova {dialogo, depois_de, texto}` e `fala.apagar {dialogo, indice, de}` no mesmo formato (engine `game/edicoes`);
  no jogo, só o tamanho da lista muda. Vozes: a fala nova toca na voz do sistema até o `gerar-vozes.mjs` rodar.
- **Criar uma missão** a partir de um molde (quem, 1 a 3 passos escolhidos de uma lista com ícone, recompensa) e as três
  conversas dela: `missao.nova` cria um nó novo no grafo (id gerado do título, tracejado até o papai aplicar). Precisa do
  `aplicar-edicoes.mjs` escrever arquivos novos (`missoes/<id>.yaml` + `dialogos/<id>-oferta.yaml`...). Deixar a Olivia
  gravar o áudio da fala pela página (como a página de perguntas do Dragão) e o JSON levar o áudio junto.
- **Criar uma pessoa** (nome, papel, lugar da vila, cores do look pela tela de aparência): `morador.novo`; o jogo precisa
  de um ponto livre na vila (lista de vagas em `world/vila.ts`).
- **Mudar quem fala** uma fala (`quem`/`retrato`) e **adicionar palavra em cor** por botão (seleciona e clica 🎨, em vez
  de digitar `*`).
- **Editar a cutscene no storyboard** (abaixo): tempos e textos primeiro.
- UX a observar com ela: se o arrasto da seta é descoberto sozinho (senão, mostrar a mãozinha na primeira seta ao ligar
  o modo); se o menu de escolha do painel basta no trackpad; se "precisa revisar" faz sentido ou é melhor "o papai mudou
  isto, quer refazer?".

## Cutscenes como storyboard em linha do tempo (Paulo, 23/10/2026)

Mostrar cada cena (`src/game/cutscenes/*.yaml`) como linha do tempo: uma pista por tipo (câmera, falas, som e música,
efeitos de tela como pálpebras/desfoque/tremor/letterbox, movimentos e animações de objetos), passos como cartões
proporcionais à duração, `marca`s como divisões, `junto` empilhado, `fundo` em pista própria. Clicar num cartão abre os
parâmetros em português; clicar numa câmera nomeada mostra posição/alvo/trilho. Com o jogo rodando, "tocar a partir desta
marca" pela bancada de cutscene do engine. Depois do diretor de cenas (lote 2 da refatoração), a linha do tempo mostra
também o gatilho (lugar, missão, hora) e o ritual (HUD, save).

Etapa 2, edição: formulário gerado do schema zod de cada passo (duração, texto da fala, câmera, força) gravando o YAML de
volta; primeiro textos e tempos, depois mover/criar passos. O palco (objetos da cena) continua código, fora do editor.
Objetivo: a Olivia entender e, aos poucos, editar as cenas dela.
