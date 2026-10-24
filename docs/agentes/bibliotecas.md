# Bibliotecas para jogo 3D no browser

Este arquivo diz que biblioteca usar para cada necessidade de um jogo three.js + TypeScript sem React, o que vale
escrever à mão e o que recusar. Leia antes de instalar qualquer pacote ou antes de escrever um sistema que talvez já
exista pronto. A regra que gerou tudo: **antes de implementar um sistema de jogo, procurar biblioteca viva e usada**;
se não houver, escrever o mínimo.

Os números vêm de três pesquisas: bibliotecas de jogo para three.js (17 e 18/10/2026), cutscenes (21/10/2026) e
visualizador de conteúdo (22/10/2026). Versões e downloads envelhecem em meses: trate cada número como "medido naquela
data" e remeça antes de decidir algo grande.

## Critério de "biblioteca viva"

Uma biblioteca entra só se cumprir os quatro:

1. Release ou commit nos últimos ~12 meses.
2. Downloads por semana relevantes (não é um projeto de uma pessoa só que ninguém usa).
3. Tipos TypeScript (próprios ou `@types`).
4. Funciona sem React (React como peer opcional serve, se houver API vanilla).

Exceção aceita: algoritmo fechado sem bug aberto relevante. `simplex-noise` 4.0.3 é de 26/07/2024 e fica, porque
ruído simplex não muda.

Como medir (o que as pesquisas fizeram, nada estimado):

| O quê | Como |
|---|---|
| Versão e data da última release | `npm view <pkg> version` + `time[<versão>]` |
| Downloads por semana | `https://api.npmjs.org/downloads/point/last-week/<pkg>` |
| Último commit, issues abertas e fechadas | GitHub API (`defaultBranchRef.committedDate`, `issues(states: OPEN\|CLOSED)`) |
| Tamanho min + gzip | bundlephobia; quando dá rate limit (HTTP 429), esbuild local com `export * from 'pkg'`, three externo |

Sinais de alerta: mais issues abertas que fechadas, repo arquivado, "o desenvolvimento foi para um repo privado",
o próprio autor chamando de "very experimental". Downloads altos não provam vida: `stats.js` tinha 2,7 M por semana em
10/2026 com release de 2016 (dependência transitiva).

## O que de fato ficou no motor

O motor é código-fonte TypeScript consumido direto, sem build. As bibliotecas são `peerDependencies`: o jogo instala.

| Pacote | Versão | Para quê |
|---|---|---|
| `three` | ^0.186.1 | render, loaders e addons oficiais |
| `zustand` | ^5.0.15 | store único (`zustand/vanilla`); o save é o próprio estado |
| `zod` | ^4.6.7 | schema do save (com `versao` e migrações) e de todo conteúdo YAML |
| `nanoevents` | ^10.0.0 | eventos tipados ("o que aconteceu") |
| `preact` | ^11.0.1 | telas (mochila, missões, aparência, ajuda); o HUD simples é DOM |
| `zzfx` | ^1.4.0 | efeitos sonoros gerados por código (sem tipos: `src/types/zzfx.d.ts`) |
| `simplex-noise` | ^4.0.3 | ruído do terreno, da vegetação e do tremor |
| `js-yaml` | ^5.5.0 | ler o conteúdo no browser (`import.meta.glob` + `load`) |
| `lil-gui` | ^0.21.0 | painel de ajuste dos parâmetros de "feel" |

Dev: `vite` 8, `vitest` 4, `typescript` 7, `happy-dom` 21. Os jogos acrescentam em dev `stats-gl` e
`@gltf-transform/cli`; o Dragão usa `camera-controls` só numa vitrine de aparência.

O `visualizador/` (grafo do conteúdo do jogo) tem as suas: `cytoscape` ^3.34.4, `cytoscape-dagre` ^4.0.1, `zod`,
`js-yaml` para ler e `yaml` ^2.9.1 para escrever de volta nos YAML preservando comentários, ordem das chaves e aspas
(`parseDocument`, coisa que o `dump` do js-yaml não faz).

## Tabela por necessidade

"Agora" = adotado nos jogos. "Depois" = não recusado, entra quando o gatilho aparecer. "Não" = recusado (motivo na
seção seguinte).

| Necessidade | Agora | Depois (gatilho) | Não |
|---|---|---|---|
| Render | three.js puro; `three/addons` antes de qualquer pacote de terceiros | | three-stdlib (cópia dos addons para o mundo r3f), toolkits sobre three (ver [engines.md](engines.md)) |
| Estado e save | `zustand/vanilla` (0,3 KB; 37 M DL/sem em 10/2026) + `localStorage` | `idb-keyval` 6.3 (vários slots, miniaturas do save) | localforage (parado desde 2021), valtio (proxies mais mágicos para depurar), superjson (só vale com Map/Set/Date no estado) |
| Validação | `zod` 4 (save e conteúdo, mesmo schema no carregamento e no teste) | | valibot é a alternativa menor; agentes conhecem menos |
| Eventos | `nanoevents` 10 (0,2 KB, release 22/07/2026) | | mitt (parado desde 2023), eventemitter3 (API de Node, tipagem fraca), `EventTarget` + `CustomEvent` (tipar o `detail` é verboso) |
| UI e HUD | HTML/CSS para o HUD; `preact` 11 (4,9 KB) nas telas | `@preact/signals-core` se o HUD precisar atualizar fora do Preact | lit e solid (não acrescentam), @pmndrs/uikit (UI dentro da cena, para VR), three-mesh-ui (parado em 2023) |
| Texto no mundo | HTML sobre o canvas | `troika-three-text` (nome sobre NPC, placa) | three-msdf-text-utils (exige atlas MSDF antes) |
| Áudio | WebAudio próprio + `THREE.PositionalAudio`; `zzfx` para efeitos | `howler` se sprites de áudio derem trabalho; `tone` para música procedural | typeit e afins (ver cutscenes) |
| Ruído e procedural | `simplex-noise`; PRNG com semente em `src/core/math.ts` | `fastnoise-lite` (celular, domain warp); Poisson disk (ou Bridson em ~60 linhas) | wavefunctioncollapse (morto; WFC não serve a mapa desenhado), seedrandom/alea (um mulberry32 de 5 linhas faz o mesmo) |
| Tween | `damp` e `smoothDamp` próprios (`src/core/math.ts`); `animar()` da cutscene | `@tweenjs/tween.js` 25 para sequências encadeadas (foi instalado e removido no Dragão: nenhum encadeamento apareceu) | GSAP (licença), motion (feito para DOM), Theatre.js (parado) |
| Partículas e pós | pool próprio (`src/fx/dust.ts`, um `Points` por pool) | `three.quarks` 0.17 se os efeitos ficarem muitos; `postprocessing` (pmndrs) para bloom e vinheta no polimento | three-nebula (pouco uso) |
| Física e colisão | `heightAt` + esferas numa grade hash (`src/world/obstacles.ts`) | `three-mesh-bvh` 0.9 quando houver malha (caverna por dentro, casas, câmera que não atravessa parede); Rapier só com física de verdade (1,6 MB gzip) | cannon-es (parado desde 2022), jolt-physics (pesado para o caso) |
| Steering e pathfinding | steering 2D à mão (`src/game/steering.ts`: seek, flee, arrive, wander, separation) | `three-pathfinding` ou `navcat` se uma vila ou caverna pedir navmesh | yuka (parado desde 2023; vale ler o código), @recast-navigation/three (Recast em WASM, exagero), Kompute (morto) |
| Máquina de estados | `Fsm` própria (`src/game/steering.ts`): enum + `switch` + tempo no estado | `xstate` v5 se uma missão virar fluxo com muitos ramos e espera | |
| Entidades | classes simples + arrays por tipo | `bitecs` só acima de centenas de entidades | koota (React-first), miniplex (release 2023), ecsy (arquivado) |
| Missões, itens, inventário | dados em YAML + interpretador próprio (ver [missoes-como-dados.md](missoes-como-dados.md)) | | não existe lib viva: `quest` (2018), `quest-js` (0 DL), `questmark-yarn` (experimental) |
| Diálogo e linguagem de conteúdo | YAML + zod; TypeScript como dado (`as const satisfies`) para catálogos | `inkjs` 2.4 se os diálogos ganharem escolhas e variáveis | Lua (wasmoon, fengari), Yarn Spinner em JS, Twine, Tiled/LDtk, JSON5 |
| Input | `src/core/input.ts` (teclado, mouse filtrado, gamepad) + `src/core/contextos.ts` (pilha) | | tinykeys e hotkeys-js (atalho de app, não input por quadro), mousetrap (morto), @hmans/controlfreak (ideia certa, parado) |
| Câmera | `FollowCamera` própria (`src/core/camera.ts`) e rig de cutscene (`src/cutscene/camera.ts`) | `camera-controls` só para órbita numa vitrine | ecctrl (React Three Fiber) |
| Céu e dia/noite | paletas interpoladas (`src/world/sky.ts`) | | `Sky` dos addons e @takram/three-atmosphere (realistas, destoam do low-poly) |
| Minimapa | canvas 2D pintado uma vez do `heightAt` (`src/game/minimapa.ts`) | | segunda câmera ortográfica (um render extra da cena por quadro); não há lib viva |
| Debug e painel | `lil-gui`; `stats-gl` em dev; `renderer.info` no painel; Spector.js como extensão do navegador | | stats.js (2016), tweakpane (não acrescenta ao lil-gui), three-perf, three-devtools |
| Carregar e otimizar glTF | `GLTFLoader` + `MeshoptDecoder`/`KTX2Loader` dos addons, `LoadingManager` para a barra; `@gltf-transform/cli` em dev (weld, simplify, meshopt, KTX2) | `@three.ez/instanced-mesh` (culling e LOD por instância); `@dgreenheck/ez-tree` (árvores sem Blender) | lib de carregamento dedicada (nenhuma viva para three puro) |
| YAML | `js-yaml` 5 no browser; `yaml` 2.9 quando for preciso escrever preservando comentários | | |
| Visualização de grafos | `cytoscape` 3.34 + `cytoscape-dagre` 4.0 (MIT, ~150 KB gzip juntos) | `elkjs` se o dagre embolar arestas (427 KB gzip, EPL/GPL) | vis-network, sigma, d3-force, @antv/g6, @xyflow, mermaid, cytoscape-expand-collapse |
| Vozes dos NPCs | ver [vozes-e-musica.md](vozes-e-musica.md) | | |

## O que ficou escrito à mão, e por quê

Nenhum destes tem biblioteca viva que sirva, ou a biblioteca custa mais do que as linhas que poupa.

- **Steering e FSM dos bichos** (`src/game/steering.ts`, `src/game/bichos/`): ~150 linhas sobre o `heightAt`. Terreno
  aberto não precisa de navmesh. yuka tem o desenho certo e parou em 2023.
- **Missões, itens, loja**: não existe sistema de quest vivo no npm. Condições e efeitos declarativos no YAML
  (`requer`, `ao_concluir`) lidas por um interpretador de ~250 linhas (`src/game/missoes/`).
- **Input com pilha de contextos**: nenhuma lib viva cobre contexto + gamepad + remapeamento.
- **Colisão**: `heightAt` + esferas. É o que um jogo de explorar precisa, sem a outra forma de pensar de um motor de física.
- **Câmeras** (de jogo e de cutscene): câmera de voo tem regras próprias (FOV com a velocidade, inclinação, mola crítica).
- **Partículas**: um pool fixo com `Points` (`src/fx/dust.ts`); o sopro e os respingos dos jogos estendem o mesmo pool.
- **Minimapa e céu**: canvas 2D e paletas. Nenhuma lib viva.
- **Interpolação**: `damp` exponencial e `smoothDamp` (mola crítica de 2ª ordem) cobrem câmera, barras e cores.
- **Typewriter de fala**: ~20 linhas (typeit é GPL-3.0).
- **Expandir vizinhos no grafo do visualizador**: `cy.add()` dos vizinhos no `tap` e relayout local. A extensão pronta
  diz no repositório que não é mais mantida.

Regra ao trocar algo feito à mão por uma biblioteca: testes antes e depois, com os mesmos números.

## O que NÃO usar, e por quê

| Não use | Por quê |
|---|---|
| Lua no browser (wasmoon, fengari) | wasmoon sem release desde 12/2023; fengari no limite. Custo: uma ponte JS↔Lua mantida à mão para cada coisa que o script toca, perda da checagem de tipos (erro só aparece em jogo), duas linguagens e dois stack traces para depurar, 70 a 110 KB a mais. O que os scripts fariam ("se tem 3 peixes, a padeira dá bolo") cabe em dados declarativos. |
| Yarn Spinner em JS (yarn-bound, bondage, yarnspinner-typescript) | bondage de 2020, yarn-bound parado desde 11/2024, yarnspinner-typescript com ~10 downloads por semana. O roadmap oficial de 2026 não tem runtime JS. A sintaxe de comandos do Yarn inspirou o formato das cutscenes; a lib, não. |
| Theatre.js (@theatre/core, studio) | npm parado em 0.7.2 (05/2024), nenhum commit público desde 11/04/2024, 1.0 anunciada num repo privado, mais issues abertas que fechadas. O roteiro viraria JSON de keyframes que só o editor entende. Substituto para movimento "desenhado no olho": Blender + `AnimationMixer`. |
| GSAP | Licença própria "Standard no charge": grátis inclusive comercial desde 30/04/2025, mas não é open source e proíbe construtor visual concorrente da Webflow. Timeline redundante com o interpretador de cutscene. Se um dia precisar de timeline com tempos absolutos, anime.js v4 (MIT) é a escolha. |
| inkjs agora | Não é recusa: é a única DSL de narrativa viva em JS (2.4.0, 17/02/2026). Entra só quando houver escolhas e variáveis; antes disso divide o estado do jogo em dois lugares. |
| mitt | 19 M downloads por semana, parado desde 07/2023. nanoevents faz o mesmo e está vivo. |
| cannon-es, yuka, ecsy, miniplex, localforage, three-mesh-ui, stats.js, popmotion | Parados (2021 a 2023) ou arquivados. |
| typeit | GPL-3.0, e typewriter são 20 linhas. |
| vis-network | Viva, mas no layout hierárquico a física decide o layout final; pacote de 84 MB descompactado. |
| sigma + graphology | WebGL para dezenas de milhares de nós, sem layout em camadas nativo; a v4 tinha acabado de sair (13/10/2026) com API de imagens mudada. Exagero para centenas de nós. |
| d3-force | Sem release desde 05/06/2021; força treme; zoom, toque e rótulos seriam à mão. |
| @xyflow (React Flow) | Exige React ou Svelte. |
| Mermaid | Diagrama estático, sem expandir nem painel. Serve para documentação. |
| Tiled, LDtk | Editores de mapa 2D por tiles; o mapa dos jogos é composto por funções (`heightAt`). |

## Antes de adotar algo novo

1. Procure nos catálogos vivos (abaixo) e no npm.
2. Meça os quatro critérios com os comandos da tabela de medição. Anote a data.
3. Confira a licença no campo `license` do npm e no repositório (GSAP e Needle Engine pegariam aqui).
4. Pergunte se o gatilho já apareceu. "Pode ser útil um dia" não é gatilho; tween.js foi instalado e removido na mesma
   sessão por isso.
5. Se adotar, troque o código à mão com testes antes e depois.

## Fontes

Catálogos (vivos em 10/2026):
- https://github.com/0xAxiome/awesome-threejs
- https://github.com/Calinou/awesome-gamedev
- https://github.com/ellisonleao/magictools
- https://github.com/proyecto26/awesome-jsgames
- https://github.com/pmndrs
- https://threejsresources.com/tools
- https://js13kgames.com/resources
- https://gamedevjs.com/tools/

Medições:
- https://registry.npmjs.org/<pacote> (ex.: https://registry.npmjs.org/inkjs)
- https://api.npmjs.org/downloads/point/last-week/<pacote> (ex.: https://api.npmjs.org/downloads/point/last-week/zustand)
- https://bundlephobia.com/api/size?package=<pacote>

Licenças:
- https://gsap.com/standard-license
- https://gsap.com/community/standard-license/
- https://webflow.com/blog/gsap-becomes-free
- https://needle.tools/eula
- https://github.com/pmndrs/uikit

Repositórios citados:
- https://github.com/mrdoob/three.js
- https://github.com/pmndrs/zustand
- https://github.com/colinhacks/zod
- https://github.com/open-circle/valibot
- https://github.com/ai/nanoevents
- https://github.com/developit/mitt
- https://github.com/preactjs/preact
- https://github.com/preactjs/signals
- https://github.com/y-lohse/inkjs
- https://github.com/inkle/ink
- https://github.com/mnbroatch/yarn-bound
- https://github.com/hylyh/bondage.js
- https://github.com/ceifa/wasmoon
- https://github.com/fengari-lua/fengari
- https://github.com/eemeli/yaml
- https://github.com/Mugen87/yuka
- https://github.com/donmccurdy/three-pathfinding
- https://github.com/isaac-mason/navcat
- https://github.com/statelyai/xstate
- https://github.com/gkjohnson/three-mesh-bvh
- https://github.com/dimforge/rapier
- https://github.com/pmndrs/cannon-es
- https://github.com/tweenjs/tween.js
- https://github.com/theatre-js/theatre
- https://github.com/Alchemist0823/three.quarks
- https://github.com/pmndrs/postprocessing
- https://github.com/goldfire/howler.js
- https://github.com/Tonejs/Tone.js
- https://github.com/jwagner/simplex-noise.js
- https://github.com/Auburn/FastNoiseLite
- https://github.com/yomotsu/camera-controls
- https://github.com/protectwise/troika
- https://github.com/RenaudRohlinger/stats-gl
- https://github.com/BabylonJS/Spector.js
- https://github.com/georgealways/lil-gui
- https://github.com/donmccurdy/glTF-Transform
- https://github.com/zeux/meshoptimizer
- https://github.com/agargaro/instanced-mesh

Visualização de grafos:
- https://js.cytoscape.org/
- https://visjs.github.io/vis-network/docs/network/layout.html
- https://v4.sigmajs.org/embed/styling/node-images/
- https://www.jsdelivr.com/package/npm/cytoscape-expand-collapse
- https://cambridge-intelligence.com/10-rules-great-graph-design/

Theatre.js e Yarn Spinner (estado em 2026):
- https://www.theatrejs.com/docs/latest/api/core
- https://yarnspinner.dev/blog/yarn-spinner-in-2026/
