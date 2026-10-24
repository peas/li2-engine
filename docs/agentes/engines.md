# Engines: ficar em three.js ou migrar

Este arquivo responde duas perguntas que aparecem cedo em todo jogo caseiro: "não seria melhor fazer em Godot, Unity ou
Babylon?" e "por que o movimento não está suave?". Leia antes de propor troca de engine, antes de adotar um toolkit sobre
three.js e quando alguém (a criança, inclusive) disser que o jogo "treme". A base é a análise de engines do jogo do Dragão
(18/10/2026) e a passada de suavidade medida no mesmo dia.

## Decisão: ficar em three.js

Para um jogo deste tamanho (um mundo aberto low-poly de ~2,8 km, uma protagonista, dezenas de bichos e NPCs, missões
em YAML), three.js puro ganha. Os motivos, em ordem de peso:

1. **O ciclo com a criança é o maior ativo.** Tudo é texto: o agente edita, o Vite recarrega na hora, um script abre o
   Chromium headless e confere. Esse fluxo entregou as Fases 0 a 2 do Dragão em 2 dias. "A criança pede, a gente muda,
   ela vê" morre com build de minutos ou com um humano operando o editor.
2. **Nenhum sistema que o jogo pede exige engine.** Bichos, poderes, missões, itens, polimento por shader: tudo coube em
   three.js. O motor deste repositório é o resultado.
3. **O teto é o mesmo.** No browser, o gargalo de "mais polígonos" é draw call e sombra, não a engine: Babylon e PlayCanvas
   batem no mesmo WebGL2/WebGPU que o three.js. Medido no Dragão: 60 fps no limite do vsync no Chromium a 1440×900 num
   Apple M5, pior quadro de 23 ms na praia, 53 a 78 mil triângulos de terreno visíveis.
4. **Licença não decide nada** para um jogo de família gratuito: three.js MIT, Babylon Apache-2.0, PlayCanvas engine MIT
   (editor grátis só com projeto público), Godot MIT, Unity Personal grátis até US$ 200 mil de receita (runtime fee
   cancelada em 12/09/2024), Unreal com royalty de 5% só acima de US$ 1 milhão por produto.

Tamanho de referência: o Dragão tinha 6.846 linhas de TypeScript em 18/10/2026, das quais 3.291 em `world/` e `fx/`, todas
presas ao three.js (10 arquivos com shader próprio).

## O que cada engine dá de graça

Versões em 18/10/2026: three.js 0.186.1, Babylon.js 9.31.0, PlayCanvas 2.23.3, Unreal 5.8, Unity 6.6, Godot 4.7.

| Sistema | three.js (o motor) | Babylon.js 9 | PlayCanvas 2 | Unreal 5.8 | Unity 6.6 | Godot 4.7 |
|---|---|---|---|---|---|---|
| Controlador 3ª pessoa | à mão (`src/locomotion/`) | `PhysicsCharacterController` (Havok) | scripts de exemplo | Character Movement Component | CharacterController + Starter Assets | CharacterBody3D + `move_and_slide` |
| Câmera suavizada | à mão (`src/core/camera.ts`) | ArcRotate/Follow com inércia | script de exemplo | SpringArm com lag | Cinemachine | SpringArm3D (lag no script) |
| Terreno com LOD | à mão (`src/world/terrain.ts`) | heightmap; LOD dinâmico é comunidade | não nativo | Landscape | Terrain | plugin Terrain3D (comunidade) |
| Física | nenhuma, de propósito | Havok (WASM) | integrada | Chaos | PhysX | Jolt (padrão desde a 4.6) |
| Blend de animação | `AnimationMixer` + pose procedural | grupos, blend, retargeting (9.0) | anim state graph | AnimBP, blend spaces, root motion | Mecanim, blend trees | AnimationTree, root motion |
| Partículas | à mão (`src/fx/`) | GPU + Node Particle Editor | sim | Niagara | Shuriken / VFX Graph | GPUParticles3D |
| GUI | DOM + preact | Babylon GUI | UI de tela | UMG | UI Toolkit / uGUI | Control nodes |
| Editor de cena | nenhum (cena é código) | Inspector, Playground | editor web (frontend MIT, backend fechado) | obrigatório | obrigatório | sim, cena `.tscn` em texto |
| Suavidade | nada de graça | `fixedTimeStep` só na física | idem | tick variável + interpolação de física | `FixedUpdate` + `Rigidbody.interpolation` | `physics_interpolation` (desligada por padrão) |

## Fluxo com agentes

- **three.js, Babylon, PlayCanvas sem editor**: tudo TS em texto, recarga instantânea, teste no Chromium. PlayCanvas
  **com** editor muda isso: cena e assets vivem no servidor deles e o git deixa de ser a fonte única.
- **Godot 4.7**: `.tscn`, `.tres` e GDScript são texto; `godot --headless` roda e exporta; há MCPs comunitários
  (godot-mcp, MIT). Pede humano na primeira importação de assets e no ajuste visual fino.
- **Unity 6**: cena e prefab são YAML com `fileID`/GUID, editáveis mas frágeis (um GUID errado quebra a referência em
  silêncio). Compilar e testar exige o editor aberto ou batchmode lento. O MCP oficial (beta, 11/05/2026) pede projeto no
  Unity Cloud e assinatura do Unity AI.
- **Unreal 5.8**: `.uasset` e Blueprints binários (o agente não lê nem escreve); C++ com compilação longa. Alguém
  precisaria operar o editor para nível, material, animação e Landscape.

Exemplos de porte parecido: Shell Shockers (FPS no browser) é Babylon; SWOOOP (biplano voando numa ilha, feito por
2 pessoas em ~4 semanas, 2014) é PlayCanvas e é o caso mais próximo; o Dragon Simulator 3D, referência visual do Dragão, é
Unity 2022 exportado para WebGL; Road to Vostok migrou de Unity para Godot em 2023 (port de 615 h, um desenvolvedor).

Como chega na criança: link no browser com three.js, Babylon e PlayCanvas (WebGL2 e WebGPU; Safari 26 ligou WebGPU por
padrão); Unity web (WebGL2, builds de dezenas de MB são o habitual relatado); Godot web só em WebGL2/Compatibility, sem
Forward+, sem WebGPU, sem C#; Unreal **não** exporta para web desde a 4.24 (12/2019), só Pixel Streaming ou app nativo.

## Quando migrar: gatilhos concretos

Migre só quando um destes aparecer de verdade, não por antecipação.

| Gatilho | Para onde | Por quê |
|---|---|---|
| Física de verdade (empurrar coisas, árvore que cai, cavalo com suspensão) | **ficar** + Rapier; se crescer muito, Babylon (Havok) | Rapier em three já resolve; Babylon traz física e controlador integrados sem sair do browser |
| Montaria com animação complexa (blend por velocidade, root motion, IK de pata no relevo) | Babylon ou Godot | blend e retargeting prontos; AnimationTree e root motion maduros no Godot |
| Muito mais polígonos e textura | Godot nativo ou Unity | o browser vira o teto; Godot mantém o fluxo em texto |
| Multiplayer (duas crianças no mesmo mundo) | Godot ou Unity (three/Babylon + servidor próprio é possível) | rede de alto nível pronta |
| Console ou loja de app | Godot (console via terceiros) ou Unity | export nativo |
| Equipe humana no editor (artista, level designer) | Unity ou Godot | o editor vira vantagem em vez de atrito |
| Visual AAA (Lumen, Nanite) como objetivo | Unreal | único caso; perde o link no browser |

PlayCanvas só vale sobre Babylon se o editor web deles com projeto público for desejado; sem editor, Babylon tem mais
sistemas prontos.

### Custo de migrar

Estimativa da análise (não medida), em sessões de agente para voltar ao ponto em que o Dragão estava em 18/10/2026:

| Destino | Sessões | Observação |
|---|---|---|
| Babylon.js | 3 a 5 | mesmo fluxo; risco: API menos conhecida pelos agentes |
| PlayCanvas (sem editor) | 4 a 6 | menos exemplos sem editor |
| Godot 4.7 | 6 a 10 | reescrever em GDScript; terreno via Terrain3D ou malha própria |
| Unity 6.6 | 8 a 12 + humano | editor aberto para cena, import, Terrain, build web |
| Unreal 5.8 | 15+ + humano constante | não recomendado para este tipo de jogo |

O que sobrevive em qualquer engine: os YAML de diálogo e missão, o layout do mapa (números), a função `heightAt`
(matemática pura), os parâmetros de voo e câmera (o "feel" calibrado), o `.glb` e seu contrato de ossos e clipes.
Numa engine JS sobrevivem ainda ~45% do código (locomoção, mapa, input, áudio, `game/`). Perdem-se terreno, água, céu,
clima, vegetação, grama e efeitos (~3.300 linhas, 10 shaders).

### Manter a porta aberta (vale desde o primeiro dia)

- Conteúdo em dados com schema (ver [missoes-como-dados.md](missoes-como-dados.md)), nunca em TS espalhado.
- Locomoção e mapa só matemática: `src/locomotion/*.ts` e `src/world/map.ts` usam `Vector3`/`Quaternion`/`MathUtils` e
  nada de `Object3D`, material ou câmera.
- Modelo só pelo contrato glTF (ver [modelos-3d.md](modelos-3d.md)): glTF abre nas seis.
- Parâmetros de "feel" num lugar só (os `DEFAULT_*` e o painel lil-gui): é o que se recalibra numa troca.
- Nenhuma regra de jogo em shader; `heightAt` continua a única colisão.
- Save versionado em JSON: outra engine lê o mesmo arquivo.

### Toolkits sobre three.js

Avaliados em 17/10/2026 e recusados: Needle Engine (licença grátis só não comercial, com branding visível; fluxo pensado
para Unity/Blender como editor), Enable3D (release de 03/2025, uso baixo), IWSDK da Meta e Wonderland (foco em WebXR),
Hology e Rogue Engine (licença proprietária ou código fechado), noa-engine (morto e sobre Babylon), threepipe (visualizador
preso a um fork do three 0.163). "Lattice" não existe no npm.

## Por que o voo não era suave: "fix your timestep"

Nenhuma engine resolve isso de graça. Unity, Godot e Unreal usam o mesmo padrão do artigo "Fix Your Timestep" (Glenn
Fiedler, 2004): simulação em passo fixo, render interpolado, câmera com mola de 2ª ordem. Em three.js cabe numa sessão.

### O diagnóstico (Dragão, 18/10/2026), em ordem de impacto

| | Causa | Sintoma |
|---|---|---|
| A | Câmera de 1ª ordem (`lerp` com `1 − exp(−4·dt)`) perseguindo o alvo em coordenadas do mundo | Atraso em regime ≈ v/λ: ~9,5 m a 38 m/s. Cada variação de dt mexe o atraso: a 95 m/s, 4 ms de variação dão ~0,19 m, ~7 px a 1440 de largura. A dragoa "treme" a 60 fps e "respira" no mergulho; nunca fica centrada |
| B | Delta do mouse cru, um número por quadro | Mouse a 125 Hz numa tela de 60 Hz entrega 1 a 3 eventos por quadro: ±20% de rotação quadro a quadro. No chão ia direto para a câmera; no ar um `damp` de 1ª ordem dava tranco no início e arrasto no fim. O `roll` vinha de `(yaw − prevYaw)/dt` e herdava o ruído do dt |
| C | Altura do corpo realimentada pela pata mais baixa, com um quadro de atraso | Quinas a cada passo: "o andar não é suave" |
| D | Passo variável nas integrações explícitas (`speed += a·dt`, pulo) | Picos de dt mudam a física; acima de 50 ms vira câmera lenta |
| E | Trabalho pontual no quadro (reposicionar grama, texto do HUD a cada quadro) | Pequeno; não era a causa principal. Carregar chunk no quadro **não** era suspeito: todos os LODs nascem no construtor |

### As cinco correções, uma por commit, medidas antes e depois

1. **Câmera presa ao alvo** (`src/core/camera.ts`): posição = alvo + offset; rumo e distância por mola crítica
   (`smoothDamp`/`smoothDampAngle` em `src/core/math.ts`); olhar direto no alvo. O atraso deixa de depender de v·dt.
2. **Mouse filtrado pela taxa** (`src/core/input.ts`): média exponencial de 20 ms sobre px/s, vezes dt (o percurso total
   se conserva); `requestPointerLock({ unadjustedMovement: true })` com fallback; órbita no chão com `dampAngle` a 20/s.
3. **Mola no rumo e no pitch do ar** (`src/locomotion/flight.ts`): o `roll` sai da velocidade da mola, não da derivada.
4. **Altura do corpo amortecida** (`damp` a 3/s); o sobe-e-desce do passo fica só no balanço da pose.
5. **Passo fixo de 1/60 s com interpolação** (`src/core/loop.ts`, classes `Loop` e `Interpolado`): até 4 passos por
   quadro (depois disso descarta: travada vira salto, não câmera lenta), render interpolado por `alpha`, teleporte acima
   de 30 m sem interpolar, mouse do quadro dividido entre os passos, HUD de texto a 4 Hz.

Medido com Chromium headless e GPU real, 240 quadros por medida:

| Medida | Antes | Depois |
|---|---|---|
| Posição da dragoa na tela em cruzeiro reto (px, desvio padrão x/y) | 0,44 / 0,28 | 0 / 0 |
| Distância da câmera em cruzeiro (m, desvio padrão) | 0,14 (média 32,4) | 0 (média 27,9) |
| Posição na tela andando (px, desvio padrão y) | 1,31 | 0 |
| Posição na tela correndo (px, desvio padrão y) | 4,58 | 0 |
| Altura do corpo andando (m, desvio padrão) | 0,054 | 0,007 |

O dt por quadro ficou igual (vsync, média 16,7 ms): o loop simplesmente deixou de depender dele. A taxa real do mouse do
iMac não dá para emular no Playwright. Detalhes de cada lição em [licoes-tecnicas.md](licoes-tecnicas.md).

**Como aplicar num jogo novo**: comece já com `Loop` + `Interpolado` + `FollowCamera` do motor. Se algo tremer, meça
antes de mexer (desvio padrão da posição do personagem em px de tela, distância da câmera, histograma de dt) e corrija
uma causa por commit.

## Fontes

- https://gafferongames.com/post/fix_your_timestep/
- https://godotengine.org/releases/4.6/
- https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/physics_interpolation_introduction.html
- https://app.cinevva.com/de/news/2026-06-19-godot-4-7-released
- https://gamedev.net/news/godot-47-released-r4011/
- https://github.com/Coding-Solo/godot-mcp
- https://unity.com/products/pricing-updates
- https://app.cinevva.com/news/2026-09-01-unity-6-6-webgpu-production
- https://unity.com/blog/unity-ai-mcp-how-to-get-started
- https://www.unrealengine.com/en-US/news/unreal-engine-5-8-is-now-available
- https://www.invenglobal.com/articles/23006/unreal-engine-58-released-enhanced-large-scale-open-world-and-ai-workflows
- https://www.unrealengine.com/news/unreal-engine-5-7-is-now-available
- https://www.unrealengine.com/en-US/faq
- https://roadtovr.com/unreal-engine-royalty-free-first-1-million-revenue/
- https://forums.unrealengine.com/t/ue5-export-webgl/2039053
- https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/
- https://doc.babylonjs.com/features/featuresDeepDive/physics/characterController
- https://babylonjs.com/games/
- https://en.wikipedia.org/wiki/Shell_Shockers
- https://playcanvas.com/plans
- https://github.com/playcanvas/editor
- https://blog.playcanvas.com/playcanvas-editor-frontend-is-now-open-source
- https://blog.playcanvas.com/swooop
- https://www.crazygames.com/br/game/dragon-simulator-3d
- https://gamefromscratch.com/developer-experiences-moving-to-godot-from-unity/
- https://app.cinevva.com/news/2025-09-15-safari-webgpu
- https://needle.tools/eula
- https://engine.needle.tools/docs/
- https://github.com/BabylonJS/Babylon.js
- https://github.com/playcanvas/engine
- https://github.com/enable3d/enable3d
- https://github.com/facebook/immersive-web-sdk
- https://github.com/fenomas/noa
