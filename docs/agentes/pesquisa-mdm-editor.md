# Pesquisa: o MDM editor

Pesquisa de 25/10/2026, feita antes de qualquer código da etapa 2 do MDM editor (o TODO em
[visualizador/docs/IDEIAS.md](../../visualizador/docs/IDEIAS.md)). O MDM (Mapa de Dependência de Missões, em
[visualizador/](../../visualizador/)) mostra missões, pessoas, lugares e itens de um jogo como grafo (Cytoscape.js +
dagre). O nome vem do [Puzzle Dependency Chart](https://grumpygamer.com/puzzle_dependency_charts) do Ron Gilbert.

Na etapa 1 do editor, a criança já arrasta a ponta de uma seta, muda textos, quantidades, recompensas e falas, e pode
desfazer e refazer. As mudanças viram operações declarativas ([src/game/edicoes/](../../src/game/edicoes/edicoes.ts))
no localStorage, e um script as escreve no YAML com a biblioteca `yaml`, mantendo os comentários.

Versões, licenças e datas foram conferidas no npm e no GitHub em 25/10/2026. Os tamanhos vêm do bundlephobia e de
bundles feitos com esbuild. Os comportamentos do `yaml` 2.9.1 e do `zod` 4.6.7 foram testados com o schema real do
motor.

## As perguntas

1. Como deixar o MDM bonito e amigável para uma criança de 10 anos?
2. Como fazer dele uma tradução real dos YAML, à la Visual Basic: inspecionar a caixinha, mexer nos atributos num
   painel de propriedades e até editar o YAML ali, sem perder comentários nem campos desconhecidos?
3. Se o YAML for editável, como corrigir e autocompletar?
4. Que editor usar: Electron, Tauri ou web puro? Quais bibliotecas de grafo editável servem sem React?
5. Como usar o MDM para ensinar programação, numa progressão que vai de arrastar setas até escrever um passo novo?

## 1. Bonito e amigável para 10 anos

- **A forma diz o papel, a cor diz o tipo.** Os blocos do Scratch "encaixam só de jeitos que fazem sentido
  sintático": o `if` tem um buraco hexagonal onde só cabe condição ([Resnick et al., CACM
  2009](https://web.media.mit.edu/~mres/papers/Scratch-CACM-final.pdf)). O MDM já tem cor + emoji por tipo
  ([a linguagem visual](missoes-como-dados.md#a-linguagem-visual-vale-para-papel-página-jogo-e-mdm)). Falta a forma:
  - o gatilho (`requer`, `oferecer_apos`) com um formato, o passo com outro, o prêmio com outro;
  - a ponta da seta só grudando em caixinha válida, com o alvo inválido apagado durante o arrasto.
- **Tipos parecidos precisam de cores bem diferentes.** Em ["Ten Things We've Learned from
  Blockly"](https://docs.blockly.com/publications/papers/TenThingsWeveLearnedFromBlockly.pdf) (Fraser, 2015), a
  confusão com condicionais sumiu quando o `if` ganhou cor e categoria próprias. No MDM, `coletar` e `levar` merecem
  emoji e tom bem distintos.
- **Bordas e sombras ajudam.** O mesmo artigo pede para não cair no flat design. Ele chama de "erro de sintaxe
  invisível" a peça que parece ligada sem estar. No MDM, a seta solta perto de uma caixinha deve voltar ao lugar com
  animação.
- **Criança não lê instrução.** No Blockly, "students would not read them". O que funcionou foi o popup que só some
  quando a criança faz a ação pedida. O [NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)
  (2019) diz que de 9 a 12 anos a criança escaneia, pula parágrafos de instrução, gosta de animação e som e percebe
  quando a interface é "de bebê".
- **Toda mudança tem resultado visível.** No piloto do
  [ScratchJr](https://sites.bc.edu/devtech/wp-content/uploads/sites/181/2018/02/scratchjr_idc_2013.pdf) (IDC 2013),
  instrução sem efeito visível impedia a criança de ligar código e efeito, e números livres demais viravam valores
  gigantes. O MDM já limita os valores. Falta o "jogar esta missão agora".
- **Execução ao vivo.** Nos
  [Blueprints](https://docs.unrealengine.com/4.27/ProgrammingAndScripting/Blueprints/BP_HowTo/Debugging) da Unreal,
  os fios do caminho executado pulsam durante o jogo. No MDM, com o jogo aberto, a missão e o passo atuais acendem
  (["liveness"](https://homes.cs.washington.edu/~tanimoto/site/wp-content/uploads/2024/10/LiveProgramming2013.pdf),
  Tanimoto).
- **Pontas soltas à vista.** O [inklewriter](https://www.inklestudios.com/inklewriter/education/) mostra as "loose
  ends", e o [Puzzlon](https://ifwiki.org/Puzzlon) checa o gráfico de dependência. No MDM, um selo "⚠️ falta" marca
  missão inalcançável, item que ninguém dá e conversa órfã.
- **Personagens para os tipos.** No Game Builder Garage, cada tipo de nó é um bicho com personalidade
  ([GameSpot](https://www.gamespot.com/reviews/game-builder-garage-review-building-blocks/1900-6417690/)). É a versão
  forte do emoji por tipo.
- **Grafo grande polui.** Resenhas do Flowlab dizem que os fluxogramas ficam "extremely cluttered"
  ([Common Sense](https://www.commonsense.org/education/reviews/flowlab)). O MDM deve continuar começando por uma
  missão e expandindo vizinhos.
- **Mexer sem medo.** A Toca Boca faz "brinquedos, não jogos", sem perder
  ([Joan Ganz Cooney Center](https://joanganzcooneycenter.org/?p=18640)). O desfazer e o "voltar ao original" da etapa
  1 já fazem isso.

## 2. Tradução real dos YAML

O que foi medido com o `yaml` 2.9.1 (ISC, 2026-09-11):

- **A API de Document não reescreve byte a byte.**
  - `id: x   # nota` vira `id: x # nota`, o que desalinha os comentários inline alinhados dos YAML de missão.
  - `lugar: [a, b]` vira `lugar: [ a, b ]`. Isso se corrige com a opção `flowCollectionPadding: false`.
- **Trocar a ordem dos passos perde um comentário.** O comentário acima do primeiro passo pertence à sequência, não
  ao item. Na troca, ele fica no topo e o passo movido o perde. É preciso levá-lo junto com o item.
- **A camada CST resolve as trocas de valor.** Com `CST.setScalarValue` e `keepSourceTokens`, só a linha editada
  muda. Fica a CST para trocas de valor e a API de Document para mudanças de estrutura (passo novo, ordem)
  ([docs](https://eemeli.org/yaml/)).
- **Cada campo sabe onde está no texto.** `node.range` com `LineCounter` dá linha e coluna de cada campo. Com isso se
  liga campo do painel ↔ linha do YAML ↔ erro do zod (`doc.getIn(issue.path, true).range`).
- `js-yaml` não guarda comentários ("impossible without full parser rewrite",
  [issue 624](https://github.com/nodeca/js-yaml/issues/624)).

Os precedentes:

- **Configurações do VS Code (o modelo certo).** Cada edição no formulário vira uma edição no texto
  (`jsonc-parser`: `modify` → `applyEdits`), e o texto continua sendo a única verdade.
- **Home Assistant (o anti-modelo).** A troca visual ↔ YAML regera o texto com js-yaml e perde comentários.

Formulário gerado do schema sem React: nada serve pronto.
- `@jsonforms/vanilla-renderers` 3.8.0 tem peer React.
- `@rjsf/core` e `uniforms` são React.
- O Formily só tem UI em React ou Vue.
- `@json-editor/json-editor` 2.17.3 é vanilla, mas pesa 105 KB gz e não faz o patch no texto.

Com cerca de 10 campos de missão, 5 tipos de passo e os `passos_extras` do manifesto (que já dizem o tipo de cada
campo), **um painel escrito à mão em preact, guiado pelo schema e pelo manifesto, sai mais barato**. Os campos que o
painel não conhece ficam numa seção "outras coisas que o arquivo tem", só leitura. É isso que faz do painel um
espelho.

## 3. Corrigir e autocompletar

- **zod 4.6.7 tem [`z.toJSONSchema()`](https://zod.dev/json-schema) nativo.** No `MissaoSchema` real, o
  `discriminatedUnion` vira `oneOf` com `tipo: {const}`, a regex vira `pattern`, aparecem o default e o enum, e
  `.describe()`/`.meta()` viram `description` (passando chaves extras como `markdownDescription`).
  - Usar `io: 'input'`, porque o modo output acusaria campos que o zod só ignora.
  - Os JSDoc do schema não são `.describe()`, então hoje nenhuma descrição chega ao JSON Schema.
- **Erros em português.** `z.config(z.locales.ptBR())` funciona, mas as mensagens são técnicas ("Valor de discriminação
  inválido"). Um `customError` por código de erro dá frases de criança (`Falta escrever "titulo"`).
- **Como escrever erro para iniciante:**
  - Becker et al., ["Compiler Error Messages Considered
    Unhelpful"](https://neverworkintheory.org/2021/09/02/compiler-error-messages-considered-unhelpful.html) (2019),
    e Denny, Prather & Becker ([2020](https://eprints.teachingandlearning.ie/id/eprint/4768/)) pedem legibilidade,
    pouco jargão, contexto, tom positivo e dica de solução.
  - O Elm, em ["Compiler Errors for Humans"](https://elm-lang.org/news/compiler-errors-for-humans), mostra o código
    da própria pessoa.
  - Nos estudos do [Hedy](https://www.hedy.org/research/Introducing_the_Gradual_Feedback_Model_2021.pdf), as crianças
    reenviavam o código sem ler o erro.

  Tradução para o MDM: uma frase, apontando a linha, com a correção como botão ("você quis dizer 🧑 vovó?").

| Editor | Versão (data) | Licença | Tamanho gz | Prós | Contras |
|---|---|---|---|---|---|
| **CodeMirror 6** + `@codemirror/lang-yaml` 6.1.3 (2026-03-24), `autocomplete` 6.20.4, `lint` 6.9.7 | 2026 | MIT | ~141 KB | leve, vanilla; lint e completion são funções nossas (zod + `yaml` + índice do MDM) | o schema não vem de graça |
| CodeMirror + `codemirror-json-schema` 0.8.1 | 2025-04-21 | MIT | ~338 KB | lint e completion pelo JSON Schema | parado; puxa shiki e markdown-it |
| [monaco-yaml](https://github.com/remcohaszing/monaco-yaml) 5.5.1 + monaco-editor | 2026-06-03 | MIT | ~1,09 MB | validação, completion, hover, snippets e `errorMessage` por campo | pesado; quebra com monaco-editor 0.55+ (a 0.57.0 mudou os `exports`), é preciso fixar a 0.54; sem pt-BR |
| [yaml-language-server](https://github.com/redhat-developer/yaml-language-server) 2.0.0 num worker + `@codemirror/lsp-client` 6.3.0 | 2026-10 / 2026-09 | MIT | ~300 KB só o servidor | o motor do VS Code | não testado de ponta a ponta |

- **Ids existentes.** Pôr um `enum` no schema exige regerá-lo a cada mudança. Uma fonte de completion própria, lendo
  o índice do MDM, dá rótulos como "🧑 vovó (pessoa)" sem mexer no schema.
- **A gaveta continua mesmo no modo texto.** No [Pencil Code](https://ccl.northwestern.edu/2017/HolbertWeintrop.pdf),
  quem estava no texto voltava aos blocos sobretudo para acrescentar comandos que ainda não tinha usado. Por isso, no
  modo YAML, a gaveta de tipos de passo continua clicável e insere um trecho válido.

## 4. Que editor

| Shell | Custo | Ganho | Veredito |
|---|---|---|---|
| **Web puro + plugin do dev server do Vite** ([`configureServer`](https://vite.dev/guide/api-plugin.html#configureserver), um `POST` que aplica as operações com o código que já existe) | muito baixo | grava direto no repositório do jogo, o git fica com o adulto, qualquer navegador, tablet pela rede de casa | **fazer**; o JSON exportado fica como reserva. Hosts explícitos e token ([server options](https://vite.dev/config/server-options.html)) |
| [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) | baixo | sem servidor | só Chromium; não existe no Safari nem no iPad |
| Electron 45.0.0 (2026-10-21) | ~120 MB, assinatura, atualizações | fs e git completos | **não** |
| [Tauri](https://v2.tauri.app/start/) 2.12.4 (2026-10-21) | toolchain Rust; WKWebView no macOS | app pequeno | adiar; só se o editor precisar rodar sem o computador do adulto |

| Biblioteca | Versão (data) | Licença | Viva? | React? | O que dá | Veredito |
|---|---|---|---|---|---|---|
| **cytoscape** | 3.34.4 (2026-10-15) | MIT | sim | não | layout em camadas, toque, nós compostos; o arrasto de seta do MDM é próprio | **ficar** |
| cytoscape-edgehandles | 4.0.1 (2021-07-28) | MIT | release velha | não | desenhar seta nova | só se faltar "criar seta" |
| React Flow (`@xyflow/react`) | 12.12.0 (2026-09-24) | MIT | sim | **sim** | nós HTML, handles, minimapa | não (React) |
| Svelte Flow | 1.7.0 (2026-09-24) | MIT | sim | Svelte 5 | o mesmo | traria Svelte |
| [Rete.js](https://retejs.org/docs/) | 2.0.6 (2025-06-30) | MIT | sim | renderizadores React/Vue/Angular/Svelte/Lit | sockets e engines de fluxo de dados | não: modelo de portas, sem renderizador vanilla vivo |
| litegraph.js | 0.7.18 (2024-01-08) | MIT | não | não | canvas de nós | morto; o fork `@comfyorg/litegraph` foi deprecado no npm |
| JointJS (`@joint/core`) | 4.3.3 (2026-09-04) | MPL-2.0 | sim | não | portas, links, roteadores | reserva para um diagrama livre |
| maxGraph | 0.25.1 (2026-10-21) | Apache-2.0 | sim | não | sucessor do mxGraph (draw.io) | ainda 0.x |
| AntV X6 | 3.1.8 (2026-08-11) | MIT | sim | não | editor de diagramas | docs em chinês primeiro |
| LogicFlow | 2.2.5 (2026-07-30) | Apache-2.0 | sim | usa preact 10 dentro | editor de fluxograma | duas cópias de preact |
| Drawflow | 0.0.60 (2024-09-03) | MIT | não | não | editor de nós mínimo | parado |
| BaklavaJS | 2.8.1 (2025-11-02) | MIT | sim | renderizador Vue 3 | nós com engine | não (Vue) |
| tldraw | 5.5.2 (2026-10-02) | [licença própria](https://github.com/tldraw/tldraw/blob/main/LICENSE.md): produção exige chave ([hobby grátis por pedido](https://tldraw.dev/pricing)) | sim | **sim** | canvas infinito | não |
| Excalidraw | 0.18.1 (2026-04-20) | MIT | sim | **sim** | quadro branco à mão livre | não; inspiração estética (`roughjs`) |
| **Blockly** | 13.4.0 (2026-10-13) | Apache-2.0 | sim ([agora na Raspberry Pi Foundation](https://www.raspberrypi.org/blog/new-home-for-blockly/)) | não | blocos que só encaixam certo | não para o grafo; talvez para os passos de uma missão, num degrau futuro |

Conclusão: nenhum editor de nós vivo e sem React faz melhor que o Cytoscape **para este grafo**. O que falta está no
painel, no texto e na gravação.

## 5. Ensinar programação

- **Usar, modificar, criar.** [Use-Modify-Create](https://k12cs.org/computational-thinking/) (Lee et al., 2011):
  usar, modificar até virar seu, criar. Foi [testado](https://par.nsf.gov/biblio/10122993) no fundamental 2 (Lytle et
  al., 2019).
- **Ler antes de escrever.** [PRIMM](https://static.teachcomputing.org/pedagogy/QR11-PRIMM.pdf) (Sentance et al.,
  2019; 493 alunos de 11 a 14 anos): prever, rodar, investigar, modificar, criar. Daqui vem o modo "Adivinhe": antes de
  jogar, a criança aposta o que destrava.
- **Partir do que é dela.** No Blockly, exercício de lacuna com blocos travados "students hated". Começar sempre pela
  missão que ela desenhou.
- **Projetos e personagens.** No construcionismo de Papert, a tartaruga é um "objeto para pensar com"; aqui é a
  protagonista do jogo. Resnick ([4 Ps](https://web.media.mit.edu/~mres/papers/constructionism-2014.pdf)) defende
  projetos, paixão, pares e brincadeira, não só quebra-cabeças. Kafai ([Minds in
  Play](https://www.yasminkafai.com/minds-in-play)) estudou crianças do 4º ano fazendo jogos.
- **Estados e eventos (Kodu).** As regras são WHEN → DO, as páginas são estados e "switch to page" é a transição
  ([Touretzky](https://www.cs.cmu.edu/afs/cs/user/dst/www/Kodu/Essays/kodu-principles.html)). O [módulo de máquinas
  de estado](https://www.kodugamelab.com/resources/state_machines) (9 a 14 anos) desenha estados como círculos e
  transições como setas rotuladas. Também há o [Treasure
  Hunt](https://classic.csunplugged.org/activities/finite-state-automata/) do CS Unplugged. Não achei estudo
  controlado sobre crianças de 9 a 10 anos entendendo máquinas de estado.
- **O que é difícil aos 8-10 anos.** Condicionais são o ponto fraco no 3º e 4º ano
  ([NSF](https://par.nsf.gov/search/award_ids:1932920)). Em variáveis, o erro comum é esperar que as "relacionadas"
  se atualizem sozinhas
  ([Rich & Strickland](https://www.raspberrypi.org/app/uploads/2023/01/Raspberry-Pi_Variables_Rich_Strickland_Jan10-2023.pdf)).
  No MDM, `requer` e `oferecer_apos` chegam por último, com desenho.
- **Do bloco ao texto.**
  - Blocos dão ganho, mas a vantagem some depois da transição
    ([Weintrop & Wilensky](https://ccl.northwestern.edu/2017/a3_weintrop_wilensky.pdf),
    [resumo](https://www.raspberrypi.org/blog/block-based-programming-does-it-help-students-learn-research-seminar/)).
  - O editor por frames ([Stride](https://isnap.csc.ncsu.edu/home/public/publication/price-2016-icer)) reduz o tempo
    perdido com sintaxe.
  - O Blockly Games termina trocando os blocos por texto, o [Bitsy](https://make.bitsy.org/docs/tools/dialog/) tem
    "Show code" e o [MakeCode Arcade](https://arcade.makecode.com/ide-tour) alterna Blocks/JS/Python.
- **Peças novas.**
  - O MakeCode gera blocos de funções anotadas ([`//% block`](https://makecode.com/defining-blocks)).
  - No GDevelop, a própria pessoa [cria extensões](https://wiki.gdevelop.io/gdevelop5/extensions/create/).
  - O [Snap!](https://snap.berkeley.edu/about) e os [behaviors do Sprite
    Lab](https://curriculum.code.org/docs/spritelab/codestudio_defining-behaviors/) transformam uma sequência em peça
    nova.

  O motor já tem metade disso: `passos_extras` no `jogo.yaml` declara ícone, descrição e campos de um passo. A lógica
  ainda é TypeScript (`registrarPasso`).
- **Riscos.** O Scratch induz programar sem planejar ([Meerbaum-Salant et
  al.](https://cris.iucc.ac.il/en/publications/habits-of-programming-in-scratch/)); o remédio é papel e diagrama
  primeiro, como o Gilbert. Semântica paralela confunde (Kodu,
  [KidSim](https://acypher.com/Publications/CACM/KidSimCACM.html)).

A progressão proposta (síntese a partir de Use-Modify-Create e PRIMM; um degrau por versão):

| Degrau | A criança faz | Conceito |
|---|---|---|
| 0. Usar e prever | joga a missão e, antes, aposta o que destrava | sequência, estado |
| 1. Mexer no que existe (etapa 1, feita) | arrasta setas; muda texto, quantidade, prêmio, fala | dados, valores |
| 2. Inspecionar | painel com todos os campos, até os que ela não edita | registro, campos, tipos |
| 3. Ver o código | aba "📜 o arquivo de verdade", só leitura, com o campo piscando no texto | texto = dados = grafo |
| 4. Missão nova | escolhe quem, 1 a 3 passos da gaveta e o prêmio | sequência, tipos |
| 5. Condições e eventos | "só depois de" (`requer`), "quando o mundo…" (`oferecer_apos`), com o diagrama de estados ao lado | condição, evento |
| 6. Editar o texto | YAML com autocompletar e erro em uma frase | sintaxe, schema |
| 7. Passo novo | (a) passo combinado: dar nome a uma sequência de passos existentes, só com dados; (b) um tipo de verdade no `passos_extras`, com o adulto escrevendo o TypeScript junto | abstração, função |

O passo combinado (7a) é uma proposta, não está no motor: o interpretador de missões precisaria expandi-lo ao
carregar.

## Recomendação

**Fazer primeiro:**
1. Fidelidade do round-trip:
   - `flowCollectionPadding: false`;
   - levar junto o comentário do primeiro passo ao trocar a ordem;
   - trocas de valor pela CST, para não desalinhar comentários inline;
   - testes de diff com os YAML de exemplo.
2. Gravação direta por um plugin do dev server do Vite, com diff, token e hosts explícitos.
3. Painel de propriedades em preact, guiado pelo schema e pelo manifesto:
   - `<select>` com emoji para os ids;
   - a seção "outras coisas que o arquivo tem";
   - o destaque campo ↔ linha.
4. Visual para criança, testado com ela:
   - forma por papel;
   - alvo inválido apagado e seta solta que volta;
   - dica que espera a ação;
   - cores bem distintas para tipos parecidos;
   - selo "⚠️ falta";
   - "jogar esta missão agora".

**Adiar:**
- a aba de YAML editável (CodeMirror 6 + lint zod em pt-BR + completion própria, cerca de 141 KB gz);
- a missão nova pelo molde;
- o passo combinado;
- Blockly para os passos;
- Tauri;
- yaml-language-server num worker.

**Não fazer:**
- Electron;
- trocar o Cytoscape por React Flow, tldraw ou Excalidraw;
- Rete, LiteGraph, Drawflow ou Baklava;
- JSON Forms ou rjsf;
- monaco-yaml agora;
- `js-yaml` para gravar;
- YAML livre antes do painel;
- exercícios de lacuna travados.

**Riscos:**
- a CST dá mais trabalho que a API de Document;
- servidor de gravação aberto na rede de casa;
- a criança não descobrir o arrasto;
- o grafo poluir com muitas missões;
- condições e eventos cedo demais para 8 anos (os degraus 5 a 7 são para a mais velha, e mesmo assim sem estudo que
  garanta).

## Perguntas abertas

Para o Paulo:
- O editor roda só no computador ou também no tablet?
- O objetivo é chegar ao TypeScript ou parar nos dados (YAML + schema)?
- Traço "desenhado à mão" ou o visual limpo de hoje?
- Remix entre os dois jogos?

Para a Olivia:
- O que você tentou clicar e não aconteceu nada?
- Se cada tipo de caixinha fosse um bicho, que bicho seria o lugar?
- Montar uma missão escolhendo peças ou escrevendo como no papel?
- Quando aparece "precisa revisar", o que você acha que aconteceu?
- Qual missão sua você queria que a Elisa mudasse?

## Fontes

Além das que estão no texto:
- Scratch Wiki, [Blocks](https://en.scratch-wiki.info/wiki/Blocks);
- [Blockly Games](https://blockly.games/about);
- [Blockly, aparência da toolbox](https://docs.blockly.com/guides/configure/toolboxes/appearance/);
- [MakeCode, julho de 2020](https://makecode.com/blog/arcade/update-july-2020);
- [Minecraft Education, NPC](https://edusupport.minecraft.net/hc/en-us/articles/360047555651);
- [Sprite Lab](https://curriculum.code.org/documentation/spritelab);
- [Kodu Curriculum](https://www.cs.cmu.edu/afs/cs/user/dst/www/Kodu/Curriculum/);
- [Twine, links](https://twinery.org/reference/en/editing-stories/linking-passages.html);
- [GDevelop, eventos](https://wiki.gdevelop.io/gdevelop5/events/);
- [Construct, iniciantes](https://construct.net/en/tutorials/beginners-guide-construct-1/page-4);
- [Unity Visual Scripting](https://docs.unity3d.com/Packages/com.unity.visualscripting@1.9/manual/vs-graph-types.html);
- [Flowlab](https://flowlab.io/features);
- [Machinations](https://ojs.aaai.org/index.php/AIIDE/article/view/12477);
- [Roblox Education](https://create.roblox.com/docs/education/support/education-content);
- [PRIMM, artigo](https://qmro.qmul.ac.uk/xmlui/handle/123456789/57800);
- [Constructionism (MIT OCW)](https://ocw.mit.edu/courses/mas-714j-technologies-for-creative-learning-fall-2009/pages/readings/constructionism);
- [BlockPy](https://people.cs.vt.edu/~tilevich/papers/IEEEComputer2017.pdf);
- [Kafai & Burke 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4784508/);
- [Mario Maker 2 em sala](https://papers.academic-conferences.org/index.php/ecgbl/article/view/4148);
- [Blockly saiu do Google](https://opensource.googleblog.com/2025/10/blockly-graduates-from-google.html);
- [Hedy, primeiro estudo](https://www.hedy.org/research/Gradual_Programming_in_Hedy_A_First_User_Study_2021.pdf);
- [js-yaml issue 549](https://github.com/nodeca/js-yaml/issues/549);
- [Home Assistant, editor](https://www.home-assistant.io/docs/automation/editor/);
- [lang-yaml](https://code.haverbeke.berlin/codemirror/lang-yaml);
- [codemirror-json-schema](https://github.com/jsonnext/codemirror-json-schema);
- [Tauri, webviews](https://v2.tauri.app/reference/webview-versions/);
- [caniuse, File System Access](https://caniuse.com/native-filesystem-api);
- [@xyflow/system](https://npmjs.com/package/@xyflow/system).

Versões, datas, licenças e dependências: npm registry e GitHub API em 25/10/2026; tamanhos pelo bundlephobia e por
bundles com esbuild.
