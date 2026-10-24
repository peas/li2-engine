# Lições técnicas medidas

Este arquivo junta o que os dois jogos (o Dragão, a partir de 17/10/2026, e As Três Ilhas, a partir de 21/10/2026)
aprenderam medindo, quebrando e consertando. Cada lição tem o fato, a linha "Aplicar" para um jogo novo e, quando existe,
o arquivo do motor que já resolve. Leia antes de escrever câmera, loop, colisão, save ou testes de browser, e de novo
quando um bug parecer "instabilidade": quase todas as lições abaixo começaram assim. A arquitetura geral está em
[arquitetura.md](arquitetura.md); o diagnóstico completo da suavidade, em [engines.md](engines.md).

Quando um jogo novo medir algo diferente, corrija a lição aqui em vez de acrescentar uma contradição.

## Loop, câmera e suavidade

- **Passo fixo de 1/60 s com interpolação.** Até 4 passos por quadro; depois disso descarta (travada vira salto, não câmera
  lenta); render interpolado por `alpha`; um passo que move mais de 30 m é teleporte e não interpola; o mouse do quadro é
  dividido entre os passos e guardado se o quadro não teve passo. *Aplicar:* toda simulação (locomoção, NPCs, bichos,
  missões) no passo; câmera, pose, efeitos e render no quadro, sobre a pose interpolada. `src/core/loop.ts` (`Loop`,
  `Interpolado`).
- **Câmera presa ao alvo com mola crítica.** Lerp de 1ª ordem em coordenadas do mundo atrasava ~9 m a 38 m/s e fazia a
  dragoa tremer na tela; com posição = alvo + offset, rumo e distância por `smoothDamp`, o desvio na tela foi de 0,44 px
  para 0 em cruzeiro e de 4,58 px para 0 correndo (medido no Dragão). *Aplicar:* nunca `camera.position.lerp(desejado, k)`;
  suavize ângulos e distância, não a posição. `src/core/camera.ts` (`FollowCamera`), `src/core/math.ts` (`smoothDamp`,
  `smoothDampAngle`).
- **Mouse filtrado pela taxa.** Um mouse de 125 Hz numa tela de 60 Hz entrega 1 a 3 eventos por quadro (±20% de rotação).
  Média exponencial de 20 ms sobre px/s, vezes dt, conserva o percurso e tira o tremor; pointer lock com
  `unadjustedMovement: true` e fallback; órbita no chão com `dampAngle` a 20/s. *Aplicar:* nunca aplique o delta cru do
  quadro. `src/core/input.ts`.
- **Roll vem da velocidade da mola**, nunca de `(yaw − prevYaw)/dt`, que herda o ruído do dt. *Aplicar:* derive inclinação
  e efeitos de curva do estado da mola. `src/locomotion/flight.ts`.
- **Altura do corpo amortecida.** A altura seguindo a pata mais baixa, com um quadro de atraso, fazia quinas a cada passo;
  com `damp` a 3/s o desvio caiu de 0,054 m para 0,007 m andando. *Aplicar:* o sobe-e-desce do andar mora só no balanço da
  pose, nunca na altura do controlador.
- **Nada de alocar no loop; HUD de texto a 4 Hz.** `textContent` por quadro força layout; `new Vector3` por quadro vira
  lixo. *Aplicar:* vetores reutilizados, texto do HUD atualizado poucas vezes por segundo. `src/game/steering.ts` escreve
  em `out` por isso.
- **Medir antes e depois, uma correção por commit.** Chromium headless com GPU real, 240 quadros: desvio padrão da posição
  do personagem em px de tela, distância da câmera, altura do corpo. *Aplicar:* testes que fixam o comportamento antes de
  mexer; o número decide, não a impressão.
- **Câmera a pé precisa de pitch orbital e de colisão com parede.** A câmera do voo não tinha nenhum dos dois. Numa casa
  num morro, a oclusão puxava a câmera para a nuca quando o terreno subia atrás da parede; um preset mais alto e olhando
  para baixo resolveu sem desligar a oclusão. *Aplicar:* parâmetros de câmera por lugar, em metros. `src/core/camera.ts`.

## Input e bordas de tecla

- **Borda de tecla lida no quadro e consumida no passo se perde.** `justPressed` dura até o fim do quadro, mas um quadro
  pode rodar 0 passos; um toque de E em ~60 não chegava à simulação (medido nas Três Ilhas, parecia teste instável).
  *Aplicar:* `note()` por quadro, `take()` por passo. `src/core/press.ts` (`PressLatch`).
- **Pilha de contextos.** `jogo` embaixo; `dialogo`, `menu`, `cutscene` em cima; só o topo recebe input; Esc fecha o topo e
  nada mais; abrir menu solta o pointer lock; teclas com um `<input>` focado são ignoradas. *Aplicar:* nenhum listener de
  tecla fora da pilha. `src/core/contextos.ts`.
- **Interações por registro.** Cada sistema registra uma fonte que diz o que oferece na posição da jogadora, com
  prioridade (a maior ganha), em vez do `if/else` longo que o Dragão tinha no `main.ts`. `src/game/interacoes.ts`.

## Locomoção e controle

- **Auto-nivelamento só depois de 0,3 s sem input**, senão anula o empurrão lento do mouse. `src/locomotion/flight.ts`.
- **Abaixo da velocidade de cruzeiro, afundar**, senão a criatura plana para sempre e nunca pousa.
- **Ação à frente inclinada 20° para baixo no chão**: um raio horizontal nunca encontra o chão.
- **Escalar cabe num controlador só de matemática.** Entra quando o andar empurra contra gradiente > 1,0 (medido 0,7 m à
  frente), anda no plano tangente, `heightAt` continua sendo a única colisão, sai quando o gradiente cai abaixo de 0,65,
  Espaço pula para trás. Depois do pulo a personagem desliza encosta abaixo por segundos: o teste espera `grounded`, não
  um tempo fixo. `src/locomotion/climber.ts`, `src/locomotion/walker.ts`.
- **Companheiro que segue.** `arrive` até 1,8 m atrás na velocidade da líder (teto 8 m/s), pique mínimo de 3 m/s quando
  fica para trás, reaparece 6 m atrás se passar de 60 m. Sem isso o teste, e a criança correndo, perdem o bicho para
  sempre. `src/game/seguidor.ts`.
- **Barreira natural em vez de parede invisível.** Na neve sem casaco, a encosta empurra a menina para baixo com um aviso
  do motivo (ideia de A Short Hike).

## Mundo e colisão

- **Mapa por composição, não heightmap em imagem.** Lugares + funções de altura paramétricas: "caverna mais perto do
  lago" é editar uma constante. Para um segundo mapa, cada ilha implementa a mesma interface. `src/world/map.ts`
  (`WorldMap`).
- **`heightAt` é a única fonte de colisão do chão.** Obstáculos são esferas numa grade hash (~21 mil no Dragão); algo
  especial (caverna) é um `Collider` próprio. *Aplicar:* gelo é chão (`heightAt` = topo do gelo, "é água" falso);
  pier andável = `heightAt` lê a altura do pier antes do mapa. `src/world/obstacles.ts`, `src/core/types.ts` (`Ground`,
  `Collider`).
- **Água rasa é chão.** Até 3 m de fundo (Dragão) ou 1,5 m abaixo do nível (riacho das Três Ilhas) se anda; mais fundo, a
  água empurra pelo gradiente.
- **Lugar novo: conferir altura, bioma e inclinação antes de construir.** Um platô a 60 m virou um penhasco de 40 m sobre o
  campo. *Aplicar:* um script que amostra o terreno em volta do lugar e falha fora dos limites.
- **Trilha e parede esculpidas no `heightAt`.** Polilinha `[x, z, altura]` com faixa de mistura que alarga com o desnível.
  A linha reta até um platô tinha inclinação 1,8 (o andar desliza acima de 0,9); a trilha é medida para nunca passar de
  0,7. A parede escalável é aplicada antes da trilha, a ≥ 45 m dela, alinhada à grade de 10 m dos chunks para a malha
  desenhada bater com a colisão.
- **Colisor composto por regiões se sobrepõe.** Salão, passagem e rampa precisam se sobrepor pelo menos o raio do maior
  corpo, senão sobra uma fresta onde nenhuma região aceita o corpo e o empurrão de cada quadro trava o movimento.
  *Aplicar:* teste varrendo a junção com os raios de todos os tamanhos.

## Render e desempenho

- **Terreno em chunks com LOD.** 10 m por quad, 3 níveis, saias de 30 m; troca de nível a 900 e 1700 m (650/1400
  serrilhava as cristas); pedras só até 650 m, senão flutuam sobre o LOD grosso. Todos os níveis nascem no construtor:
  carregar chunk no quadro nunca foi causa de travada. `src/world/terrain.ts`.
- **Partículas com tamanho em metros.** Multiplicar por 60 virou borrão. Um pool fixo, um `Points` por pool.
  `src/fx/dust.ts`.
- **Sombra só na protagonista.** `PCFShadowMap` + `radius` (o PCFSoft saiu do three na r18x); sol a 30°, não 14°, senão a
  sombra cai atrás da câmera; o terreno só recebe, então o passe de sombra desenha ~1,3 mil triângulos e não há acne.
  `src/world/shadows.ts`.
- **`PointLight` nasce com intensidade 0.** Acender depois não recompila shader; criar a luz na hora, sim.
- **Minimapa pintado uma vez.** Canvas 2D a partir de `heightAt`/bioma (no Dragão, em fatias de 3 ms), depois só um recorte
  girado por quadro. Nunca uma segunda câmera. `src/game/minimapa.ts`.
- **Bichos longe dormem.** A mais de 500 m, escondidos e congelados; modelos feitos por código com até 5 draw calls cada
  (~45 bichos no Dragão). `src/game/bichos/bichos.ts` (`verAte`).
- **Referência de desempenho**: 60 fps no Chromium headless com a GPU de um Apple M5 a 1440×900, em todas as regiões do
  Dragão, com 53 a 81 mil triângulos de terreno visíveis.

## Escala e alcances

- **Alcances em metros explícitos por ator.** No Dragão, câmera, efeitos e fuga dos bichos eram medidos em "corpos" da
  dragoa (que cresce), e voando a altura soma à distância (decolar é fugir). Com uma menina de 1,6 m e uma dragoa de 9 m
  no mesmo jogo, isso quebra. *Aplicar:* o motor só vê metros; o jogo converte corpos em metros na fronteira, a cada passo.
  `src/core/camera.ts` diz isso no cabeçalho.
- **Escalar modelo humano por altura**, não por comprimento (`escalarPor: "altura"`). `src/creature/model.ts`.
- **Pernas curtas deslizam.** A 3,5 e 7 m/s os pés do modelo humano deslizavam; limitar o `timeScale` do clipe a ~2,5× e
  ajustar a velocidade com a criança.

## Modelos e animação

- **O `GLTFLoader` tira os pontos dos nomes** (`Feet.L` vira `FeetL`). Procure ossos pelo nome sem ponto.
- **Ossos: +Y de cada osso vai ao longo do osso** (modelos Quaternius). Mire (`aim`) em vez de chutar eulers.
- **Ordem no quadro**: controlador → `mixer.update` → pose procedural por cima (slerp).
- **O `AnimationMixer` não reseta osso que o clipe não anima.** Um offset aplicado na cabeça por `premultiply` a cada
  quadro acumulou quando o clipe corrente não tinha track da cabeça: a cabeça girava sem parar. *Aplicar:* guarde o
  quaternion animado e desfaça o offset antes do próximo `mixer.update`. Vale para qualquer pose por cima do clipe (os
  braços de escalar também).
- **Sem clipe pronto, pose a partir de um quadro parado.** O pacote de humanos usado não tinha clipe de escalar: um quadro
  parado de outro clipe + rotação dos ossos de braço e perna, alternando em diagonal com a velocidade.
- **Recolorir roupa com atlas**: `material.color.set` pinta pele e botas junto; recolora só os pixels da cor da roupa num
  clone da textura.
- **Acessório = malha presa ao osso**, com a escala do osso cancelada e encaixe por raycast.
- Mais sobre modelos, contratos de ossos e licenças: [modelos-3d.md](modelos-3d.md).

## Atenção e escolhas sem tremor

- **Cabeça que olha "o que importa" precisa de UM alvo com histerese.** Entre uma placa e a dragoa a cabeça ficava trocando.
  O alvo só troca quando o novo é claramente melhor (70% da distância, ou prioridade maior) por 0,4 a 0,5 s seguidos; um
  alvo perdido só é largado depois de 0,3 a 0,5 s; o giro tem teto de 3 rad/s; o cone à frente dá folga de 20° para quem
  já é o alvo. *Aplicar:* o jogo dá os candidatos por quadro, o seletor decide. `src/core/alvo.ts` (`SeletorDeAlvo`).
- **Medir flicker**: amostrar alvo e ângulo a 20 Hz; flicker = duas trocas a menos de 0,5 s; tranco = passo acima do teto
  de velocidade. "Trocas totais" engana: passar entre duas coisas troca de alvo legitimamente.
- **Música por região com histerese de 4 s** na frente do crossfade evita vaivém na fronteira. `src/core/histerese.ts`.

## Estado e save

- **Um store, e o save é o estado.** Fábrica (`criarStore`), nunca singleton de módulo; salvo em momentos seguros (dormiu,
  missão concluída, menu fechado), nunca por quadro; zod com `migrar()` que descarta ids fora do catálogo; save corrompido
  vai para uma chave `.corrompido`. `src/game/estado/store.ts`, `src/game/estado/fatias.ts`.
- **Estado diz "como está", evento diz "o que aconteceu".** O HUD assina o store; som e avisos assinam os eventos. Listener
  registrado em construtor acumula entre testes. `src/game/eventos.ts`.
- **O save carrega antes de qualquer construtor que leia o estado.** No Dragão, as construções eram criadas antes do
  `carregar()`: a cada recarga a vila secreta voltava fechada e um colisor invisível entalava a dragoa na porta. Ninguém
  viu por duas versões porque os testes abriam com fixture e quebravam as pedras no próprio teste. *Aplicar:* teste de
  regressão que carrega um save com a coisa já aberta e **anda** por ela.
- **`carregar()` roda antes de existir HUD ou diálogo.** Um evento do carregamento ("você ficou 2 dias fora") é guardado e
  dito no fim do arranque.
- **"O mundo mudou" é uma fatia do save, não um flag espalhado.** O jogo registra cada chave (schema, padrão, frase para a
  ajuda); missões escrevem por `ao_concluir.mundo`; só o que difere do padrão vai para o JSON; chave fora do registro é
  descartada. `src/game/estado/mundo.ts`. Ver [missoes-como-dados.md](missoes-como-dados.md).
- **Quantidade variável não se reconstrói.** Os pontos de colheita nascem no máximo e `limitar(item, n)` liga só os `n`
  primeiros. `src/game/colheita.ts`.
- **Compatibilidade de save**: campo novo entra no fim com `versao`++ e um passo de `migrar`; fixtures de saves antigos
  ficam velhas de propósito.

## Conteúdo e UI

- **YAML no browser**: `import.meta.glob` + `load` do js-yaml (o `import yaml from` não funciona com o v5).
- **Um teste cruza todos os ids** (recompensa, loja, baú, fala, ícone) com os catálogos; outro quebra se uma fala ficar sem
  áudio. Erro de digitação vira erro de teste, não bug na frente da criança. `src/game/catalogo.ts` (`criarCatalogo`)
  valida o YAML no carregamento e dá erro legível para id inexistente.
- **Dica de "onde ganhar" lida das fontes de verdade** (lojas, prêmios, baús), com teste exigindo fonte para todo item.
- **preact sem plugin do Vite** (`jsxImportSource` no tsconfig); alvos ≥ 64 px e fonte ≥ 18 px para criança.
- **Tela de ajuda com abas**: o listener das abas é registrado no render para rodar antes da navegação da tela, que captura
  as setas. `src/game/ui/`.
- **Registros uma entrada por linha** (sistemas, fontes de E, telas, teclas, blocos de teste) antes de trabalho em paralelo:
  a mescla de cinco branches virou mecânica.

## Testes no browser

- **Chromium headless real** (channel chromium) tem GPU e pointer lock; nunca headful por padrão (rouba o foco de quem está
  no computador). Pointer lock às vezes recusa o primeiro pedido: engula o erro e clique de novo.
- **Um browser de teste com GPU por vez** na mesma máquina: dois juntos dão falhas fantasmas (fps, altitude, diálogo que
  não abre).
- **Não edite `src/` com o teste rodando**: o reload do Vite mata o teste. Mexer no motor recarrega todo dev server que o
  linka.
- **Fixture por bloco de teste**: `page.addInitScript` grava o save antes do `goto`, e uma marca no sessionStorage evita
  regravar nos reloads. Acabou o estado vazando entre blocos e a rodada caiu pela metade. Ver [testes.md](testes.md).
- **O áudio só começa no primeiro gesto**: um teste de música clica antes de medir.
- **Andar no teste = apontar a câmera**: no chão o W segue a órbita da câmera, não o corpo; um teste que só gira o corpo
  anda reto, bate numa pedra e parece o bug que se procura.
- **Espere estados, não tempos**: `waitForFunction` na tela aberta ou no `grounded`, nunca `wait(3000)`.
- **Falha "instável" que se repete com a mesma assinatura é bug.** A do `PressLatch` foi assim.
- **Golden antes de refatorar**: snapshot ordenado e arredondado (clareiras da floresta, saves por versão, simulação dos
  bichos) gravado ANTES, igualdade exigida depois. Quatro vezes o golden disse "não troque" e o jogo manteve o seu.
- **Subagente nunca roda `git stash` nem `checkout` de arquivo** para medir o "antes": com outros escrevendo na mesma
  árvore, o stash tira o trabalho deles do disco. Use `git show HEAD:caminho > /tmp/antes.ts`.
- **Lógica nova = classe pura sem THREE, com vitest**; o `main.ts` só liga. `localStorage` no vitest 4 + happy-dom vem de um
  `vitest.setup.ts` em memória (o deste repositório).

## Fontes

Estas lições foram medidas nos próprios jogos (diários técnicos do Dragão e das Três Ilhas, 17 a 24/10/2026). As
referências externas citadas:

- https://gafferongames.com/post/fix_your_timestep/
- https://github.com/mrdoob/three.js
