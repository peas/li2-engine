# Ideias para o visualizador

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
