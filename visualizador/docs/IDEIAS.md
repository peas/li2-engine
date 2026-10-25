# Ideias para o MDM (Mapa de Dependência de Missões) e o MDM editor

## Decisões do Paulo para o MDM editor (25/10/2026)

- **Onde roda**: só no Mac. O "💾 Salvar no jogo" continua aceitando só pedidos do próprio computador.
- **O que ensina**: dados (YAML com schema), sem chegar ao TypeScript. O YAML **aparece de leve**: está ali para quem
  quiser olhar, mas a criança edita pelo painel.
- **Visual**: desenhado à mão, num **pergaminho simples, com tons e sombras**, para parecer parte do jogo, e não uma
  ferramenta.
- **Um MDM por jogo** (o do Dragão e o das Três Ilhas, separados; sem remix entre eles por enquanto).
- **Próximo item**: o **painel de propriedades** à la Visual Basic (clicar numa caixinha e mexer nos campos dela).
- **Referência visual**: as missões que a criança desenha no papel. Ali, cada coisa é uma palavra numa caixinha, as
  setas são curvas e levam a frase escrita ao longo delas ("quer que", "dê eles para a", "eles ficam na"), o prêmio fica
  numa nuvem no fim, e uma seta que dá a volta numa caixinha diz "faça 3 desses". A missão se lê como uma frase seguindo
  as setas.

### O plano do painel (respostas do Paulo e decisões, 25/10/2026)

1. **O YAML aparece de leve** (decisão nossa; o Paulo só quer que a parte "programação" não pese): embaixo do painel,
   uma linha recolhida "📜 ver como está escrito no jogo"; aberta, mostra o trecho do YAML da missão em cinza, só para
   ler, com a linha do campo que ela está mexendo acesa. Editar é sempre pelo painel.
2. **Pergaminho lúdico, sem fonte manuscrita** (decisão nossa a partir da resposta): o fundo do MDM em tom de papel
   claro, as caixinhas como etiquetas de papel com borda levemente irregular, sombra suave e a faixa de cor por tipo
   que já existe; o painel como uma ficha do mesmo papel. Nada que pese na leitura: as letras continuam as de hoje.
3. **Setas como estão**, com os nomes do YAML como rótulos e palavras-chave (`quem`, `passos`, `levar`, `npc`,
   `item`) em fonte monoespaçada nesses pedaços, para a criança ir reconhecendo o que vê escrito no arquivo.
4. **O painel edita só missões**; falas, se ficar fácil. Pessoas, itens e lugares ainda não. Mas um passo pode passar
   a citar **qualquer item, pessoa ou lugar que já exista no jogo**, mesmo que nenhuma missão o use ainda: as escolhas
   vêm do catálogo inteiro (com o emoji de cada tipo), não só do que a missão já tinha.
5. **O painel abre ao lado**, como hoje.
6. **Começa pelas Três Ilhas**, com a Olivia testando; o Dragão vem depois.
7. **Passo combinado: fica de fora.** Era uma ideia da pesquisa: a criança juntar dois passos que já existem num passo
   novo com nome (por exemplo, "fazer e entregar" = cozinhar 3 rações + levar para a dona Maria) e reusar esse nome
   em outras missões, como o "criar um bloco" do Scratch. Não é necessária agora; volta só se ela pedir algo assim.

### Plano de execução do painel (proposta de 25/10/2026; executar só com o ok do Paulo)

O painel de hoje já edita sete coisas (quem dá, título, descrição, recompensa em corações e moedas, para quem/onde/o
quê de um passo, quantidade, ordem dos passos, texto de uma fala). Cada uma é uma **operação** do motor
(`src/game/edicoes/`), com o valor de antes (`de`) para detectar conflito, e o gravador (`yaml.ts`) sabe escrevê-la. O
painel à la VB é estender isso, em cinco etapas, cada uma testada e fechada antes da próxima:

1. **Operações novas no motor** (uma sessão). Hoje faltam, para mostrar a missão inteira como propriedades:
   - qualquer campo simples de um passo (`texto`, `raio`, `dialogo`, `lugar`), numa operação `passo.campo` genérica;
   - `dificuldade`;
   - os itens do prêmio (`ao_concluir.itens`);
   - **passo novo** e **apagar passo**.

   Cada uma com `de` e `para`, testes de conflito e o texto em português (`descreverOp`). `requer`, `oferecer_apos`
   e "o mundo mudou" ficam de fora desta rodada: aparecem só para ler.
2. **O gravador** (meia sessão). As operações novas viram edições cirúrgicas:
   - valor no lugar, pelo `porValor` que já existe;
   - passo novo = um bloco de linhas com o recuo dos outros;
   - apagar passo = remover o bloco dele.

   Tudo conferido contra o motor, como hoje, e testado nas 44 missões reais.
3. **O painel** (uma a duas sessões), ao lado como hoje e guiado pelo schema:
   - um campo por propriedade, do tipo certo: texto, número com limite, ou lista de escolha;
   - pessoas, itens e lugares escolhidos do **catálogo inteiro**, com o emoji do tipo;
   - os tipos de passo do motor, mais os `passos_extras` do `jogo.yaml`;
   - "outras coisas que o arquivo tem", só para ler (o que o painel não edita);
   - "📜 ver como está escrito no jogo", recolhido, com a linha do campo acesa. O carregador passa a mandar o texto e
     a linha de cada campo, pelo `range` do `yaml`.
4. **O visual** (uma sessão):
   - papel claro no fundo; caixinhas como etiquetas de papel com sombra suave e a faixa de cor por tipo; o painel
     como uma ficha;
   - nas setas e no painel, as palavras do YAML (`quem`, `passos`, `levar`, `npc`) em fonte monoespaçada;
   - nas missões estreitas, o diagrama vertical "amarrado" da página das crianças.
5. **Com a Olivia** (15 minutos, Três Ilhas):
   - antes: as perguntas da pesquisa;
   - durante: ela muda uma missão dela pelo painel e salva no jogo;
   - depois: anotar o que ela tenta clicar e não acontece nada.

   O que sair disso vira a etapa seguinte. O Dragão entra depois.

Testes em toda etapa: vitest (motor, gravador, painel), as checagens do `npm run capturar` (que crescem com o painel),
a fumaça das Três Ilhas depois de salvar uma missão de verdade numa cópia do jogo, e nada é gravado nos jogos de
verdade sem a Olivia ou o Paulo clicarem em "Salvar no jogo".


## TODO: pesquisa do MDM editor (Paulo, 25/10/2026)

**Itens 1 e 2 feitos em 25/10/2026** (gravação fiel do YAML e "💾 Salvar no jogo", só no computador; ver o README). **Pesquisa feita em 25/10/2026**: [docs/agentes/pesquisa-mdm-editor.md](../../docs/agentes/pesquisa-mdm-editor.md) (recomendação, o que adiar, o que não fazer; aguarda a escolha do Paulo). Antes dela, a regra era: **antes de qualquer código, uma pesquisa aprofundada** (com fontes, comparação e recomendação, no formato da KB de
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
