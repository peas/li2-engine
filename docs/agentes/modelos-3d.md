# Modelos 3D: de onde tirar e como preparar

Para que serve: escolher de onde vêm os personagens e bichos de um jogo three.js de família, preparar o `.glb` para
o motor e registrar a licença. O motor não sabe de onde o modelo veio (CC0, Blender, IA, comprado): ele pede um `.glb`
que cumpra o **contrato** abaixo. Preços e licenças são de out/2026 (pesquisa "personagens estilizados low-poly",
23/10/2026); confira antes de comprar.

## Decisão rápida

| Precisa de | Comece por | Por quê |
|---|---|---|
| Protagonista humana já animada, grátis | KayKit Adventurers 1.0 (CC0) | glTF, rig, 76 clipes embutidos; usada como protagonista nas Três Ilhas |
| Humanos adultos, mesmo esqueleto para todos, grátis | Quaternius UBC + Outfits Fantasy + Universal Animation Library (CC0) | 43 clipes grátis no mesmo rig; roupa e cabelo skinned trocáveis |
| Dragão animado | Quaternius Ultimate Monsters (via Poly Pizza, CC0) | o do jogo do Dragão; nenhum outro pacote pesquisado tem dragão animado |
| Bichos | Quaternius Ultimate Animated Animal Pack (CC0, glTF) ou bichos por código | os dois jogos fazem os bichos por código |
| Look facetado "POLYGON" exato | Synty (pago, EULA proíbe os arquivos em repo público) | é o visual; mas FBX, sem animações |
| Personagem igual ao desenho da criança | Tripo ou Meshy (gerar) ou repintar um pacote CC0 | geração dá a forma; repintar é previsível |
| Gente na vila sem asset nenhum | `Humanoide` do motor (primitivas) | ~500 triângulos, olha, acena, anda, monta |

## Polígonos não são o problema

Medido numa bancada (Chromium headless com GPU, Mac M5, 1600 × 900, sombras ligadas), um `AnimationMixer` por cópia:

| Modelo | Triângulos | 20 cópias | 40 cópias |
|---|---|---|---|
| KayKit Mage | 4.113 | 60 fps | 60 fps (656 draw calls) |
| Quaternius UBC + cabelo + roupa Ranger | 44.932 | 60 fps (656 draw calls, 1,98 milhão de tris) | 43 fps (1.216 draw calls, 3,8 milhões de tris) |
| `Humanoide` por primitivas | ~500 | 60 fps | 60 fps |

O teto chegou perto de 1.200 draw calls, não dos esqueletos. Instancing de skinned mesh não é necessário para 15 a 20
aldeões. Um personagem estilizado fica entre 5 e 15 mil triângulos: o jogo nem nota. "Muitos polígonos, então
Godot/Unity" não se aplica nessa faixa ([engines.md](engines.md)).

## Pacotes

### Grátis (CC0: pode no jogo e no repo público)

| Pacote | Estilo | Rig e clipes | Observações |
|---|---|---|---|
| KayKit Adventurers 1.0 (Kay Lousberg) | chibi, cabeça grande, atlas de gradiente | rig próprio; 76 clipes embutidos (Idle, Walking_*, Running_*, Jump_*, Lie_*, Sit_*, PickUp, Interact, Cheer...) | no GitHub; Mage tem 4,1 mil tris, Rogue 6,4 mil |
| KayKit Adventurers 2.0 | idem | 41 ossos, **sem clipes**; 161 no KayKit Character Animations (grátis) | Knight, Mage, Ranger, Barbarian, Rogue; Extra US$ 7,95. Os clipes do Mage 1.0 tocam no Ranger 2.0 (mesmos nomes de osso) |
| Quaternius Universal Base Characters (ago/2025) | mais liso, PBR, ~13 a 15 mil tris, proporção realista | Mannequin da Unreal (65 ossos: `pelvis`, `spine_01`, `Head`, `upperarm_l`...); clipes na Universal Animation Library (43 grátis: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Jump_*`, `Sitting_*`, `Interact`, `PickUp_Table`...) | 2 bases grátis (Superhero M/F); 20 penteados; roupas no Modular Character Outfits – Fantasy (Ranger e Peasant grátis); pacotes "Source" pagos, ≈ US$ 70 por tudo |
| Quaternius Ultimate Monsters | low-poly chapado | "Dragon": 27 ossos, clipes Attack, Death, Flying, Hit; "Dragon Evolved": Fast_Flying, Flying_Idle... | baixados via Poly Pizza; nenhum dos dois tem Idle/Walk |
| Quaternius animais | low-poly | Ultimate Animated Animal Pack: 12 bichos, 12+ animações, glTF | Farm Animal Pack e LowPoly Animated Animals em FBX/OBJ/.blend |
| Kenney | blocos | Blocky/Animated Characters (glTF); Cube Pets (16 a 24 bichos blocky) | CC0 |

### Pagos (podem no jogo; os arquivos ficam fora do git)

| Pacote | Preço (out/2026) | Cuidado |
|---|---|---|
| Synty POLYGON Modular Fantasy Hero Characters | US$ 74,99 na Unity Asset Store (promoção, de 149,99) | só Unity, Unreal e FBX fonte (FBX → Blender → glTF); sem animações; EULA: "must not share the source files… outside your team" |
| Synty POLYGON Fantasy Characters | US$ 14,99 na Unity (−50%) | 12 personagens, não modular |
| Synty Sidekick | US$ 99,99 na Unity | não exporta glTF: ruim para three.js |
| SyntyPass (assinatura) | ~US$ 30 a 40/mês | proíbe continuar usando em projeto que evolui depois de cancelar |
| Synty POLYGON Kids | esgotado | outro rig, não compartilha o dos adultos |
| Polytope Lowpoly Modular Peasants & Citizens | US$ 44,99 (Unity) | compatível com Mixamo, sem animações |

Retarget de animação para Synty passa pelo Blender e há relatos de ombro torcido. Ready Player Me foi desligado em
31/01/2026.

### Mixamo

Grátis com Adobe ID: mais de 2.000 clipes e auto-rig de bípede (uma malha só, em T ou A-pose). Pode usar no jogo;
**não pode** redistribuir os "raw files". Em repo público, deixe os FBX do Mixamo fora do git.

## Geradores por IA

| Ferramenta | Humano estilizado | Rig e clipes | Custo (out/2026) | Licença da saída |
|---|---|---|---|---|
| Tripo | boa; multiview 2 a 4 imagens; smart low-poly (~5 mil tris); Generate Parts separa partes | sim: bípede com nomes Mixamo, idle/walk/run/jump, GLB; Rig Check grátis | ~US$ 1,15 por personagem na API; Pro US$ 19,90/mês; Free 200 créditos/mês | Free: CC BY não comercial e modelos públicos; Pro: privado e comercial |
| Meshy 7.1 | boa; Smart Topology 100 a 15.000 faces; até 4 vistas | sim, rig/remesh/animação a 0 crédito; teste independente achou quadril deslocado 5 a 15 cm | US$ 0,60 a 0,80 por personagem; Pro US$ 20/mês; Free 100 créditos/mês | Free: CC BY 4.0, mas só baixa Meshy 6 Lite |
| Hunyuan3D 2.1 (pesos abertos) | média a boa; malha densa | não | grátis (Space no Hugging Face) | Tencent Community License (proíbe treinar outros modelos com a saída) |
| TRELLIS.2 (Microsoft) | média; densa, imagem única | não | grátis no Hugging Face, cota anônima curta | MIT |
| Rodin Gen-2.5 | forte em objetos duros, alucina rosto | não | ~US$ 1,50 por download | em conflito entre fontes |

Quase todas as comparações de 2026 são de vendedores.

**Teste prático** (23/10/2026, com uma imagem de referência recortada em vistas): Hunyuan3D-2 com 4 vistas deu erro no
servidor; Hunyuan3D-2.1 com forma + textura foi recusado pela cota anônima; **só forma, vista frontal, funcionou em
27 s**: 150.566 faces, sem textura, sem rig. A silhueta saiu inteira, o arco veio fundido à mão, rosto liso.

O que falha: mãos, rosto e partes finas derretem; prop fundido ao corpo mexe como bloco depois do rig; uma prancha com
4 vistas numa imagem só gera 4 bonecos (recorte antes); rabo de cavalo não ganha osso no auto-rig. O que fazer:
gerar já low-poly em vez de dizimar; separar cor por parte (Tripo Generate Parts, Meshy Auto Split, AMS Splitter no
Blender) e trocar textura assada por cor chapada; **dizimar antes do rig**; arco e aljava à parte, presos a um osso.

Alternativa barata e previsível: repintar um personagem CC0 que já tem rig e clipes.

## Preparar com gltf-transform

`@gltf-transform/cli` em dev (https://gltf-transform.dev/cli). Os passos usados nas fontes:

```sh
npx gltf-transform weld bruto.glb soldado.glb
npx gltf-transform simplify soldado.glb leve.glb --ratio 0.2     # 150 mil → 30 mil faces no teste (354 KB)
npx gltf-transform resize leve.glb r.glb --width 1024 --height 1024
npx gltf-transform webp r.glb final.glb                            # texturas em WebP
```

Cabelo e acessórios pequenos aguentam texturas de 512 px. `simplify` não garante preservar o skin: rode antes do rig.
Para inspecionar materiais, ossos e clipes sem three.js, o jogo do Dragão tem um `scripts/inspect-glb.mjs --bones`;
um equivalente vale a pena em todo jogo novo.

## O contrato do `.glb`

### Geometria e escala

- glTF 2.0 binário, de pé (**Y para cima**), olhando para **+Z**; senão, `rotationY` no `loadCreature`.
- Escala absoluta não importa: `loadCreature` normaliza. `escalarPor: "comprimento"` (padrão) mede a maior extensão
  horizontal (dragão: nariz à cauda); `escalarPor: "altura"` mede pés à cabeça (gente). `setLength` reescala depois
  (estágios de crescimento: bebê, jovem, adulta).
- Shading é chave no load (`shading: "flat" | "smooth"`), não exigência do modelo.
- `frustumCulled = false` em toda malha: a caixa de uma skinned mesh não acompanha a animação.

```ts
import { loadCreature } from "li2-engine/creature";
const menina = await loadCreature(url, {
  length: 1.4, escalarPor: "altura", shading: "flat",
  aliases: { idle: ["Idle"], walk: ["Walking_A"], run: ["Running_A"] },
});
scene.add(menina.root);
menina.mixer.clipAction(menina.clips.idle!).play();
```

### Materiais por parte (o que a tela de aparência pinta)

Um material por parte, **mesmo que a cor seja igual**: é o que permite "cor das escamas" e "cor das cristas"
separadas. Material com nome fora da tabela fica com a cor do arquivo. O dragão do jogo do Dragão usa:

| Parte | Nome canônico | Aliases (Quaternius) |
|---|---|---|
| corpo | `Corpo` | `Main`, `Dragon_Main` |
| detalhes | `Detalhes` | `Belly`, `Dragon_Secondary` |
| membrana | `Membrana` | `Wings` |
| olhos | `Olhos` | `Eyes`, `Eye_Black` |
| garras | `Garras` | `Claws` |
| chifres | `Chifres` | `Dragon_Horn` |

No motor, `criarAparencia` (`src/creature/aparencia.ts`) faz isso de forma genérica: `partes` mapeia parte → nomes de
material (o primeiro é o canônico), `slots` são ids de acessório, `aplicar(root, aparencia)` recolore, `completar()`
preenche um save antigo com o padrão. Material em duas partes é erro na hora de criar.

```ts
const aparencias = criarAparencia({
  partes: { corpo: ["Corpo", "Main", "Dragon_Main"], olhos: ["Olhos", "Eyes"] },
  slots: ["cabeca", "pescoco"],
  padrao: { corpo: "#7fb069", olhos: "#222222", cabeca: null, pescoco: null },
});
aparencias.aplicar(modelo.root, aparencias.completar(save.aparencia));
```

Modelo com um material por parte (Quaternius) + `map = null` dá o visual chapado na hora.

### Ossos nomeados

- Acessórios, olhar e poses procedurais dependem de nomes de osso. O dragão usa os do Quaternius (`Head`, `Neck`,
  `Body`, `Feet.L/R`, `Tail1..4`); gente varia por pacote (KayKit `head`, `upperarm.l`; Unreal `Head`, `upperarm_l`).
- **O `GLTFLoader` tira os pontos dos nomes**: `Feet.L` vira `FeetL`, `upperarm.l` vira `upperarml`. Procure os ossos
  pelo nome já limpo (`modelo.bones`).
- Passe os nomes de osso na spec do personagem (`cabeca: "Head"`, `bracoEsq: "upperarm_l"`): o mesmo código serviu
  para os dois rigs. É o "retarget por nome" para pose procedural.
- Ossos do Quaternius: o +Y de cada osso vai ao longo do osso; mirar (`aim`) em vez de chutar eulers.

### Clipes com aliases

- Nomes canônicos no jogo (`idle`, `walk`, `run`, `fly`, `hover`), nomes crus no arquivo. `CLIP_ALIASES` em
  `src/creature/model.ts` traz os do Quaternius; um modelo novo passa `aliases`. O prefixo `Armature|` é ignorado.
- `modelo.allClips` lista tudo o que o arquivo tem, para um painel de debug.
- **Clipes de outro arquivo**: o `AnimationMixer` resolve as tracks por nome de nó, então os clipes da UAL tocam na base
  Quaternius e os do Mage 1.0 tocam no Ranger 2.0 sem conversão. Carregue o outro `.glb` e passe o clipe ao
  `mixer.clipAction`. O `loadCreature` ainda não tem opção para isso.
- Modelo sem Idle/Walk: andar procedural como fallback. KayKit com pernas curtas: limite o `timeScale` do clipe a
  ~2,5× e ajuste a velocidade com a criança, senão os pés deslizam.

### Pose por cima da animação

Ordem no loop: controlador → `mixer.update` → pose procedural (slerp por cima). O `AnimationMixer` **não reseta osso
que o clipe não anima**: guarde o quaternion animado e desfaça o offset antes do próximo `mixer.update`, senão a
cabeça gira sem parar. Cabeça que olha: yaw ±60°, pitch ±30°, no referencial do corpo. Aceno e "escalar" sem clipe
usam o mesmo mecanismo nos ossos do braço e da perna. Detalhes em [licoes-tecnicas.md](licoes-tecnicas.md).

### Acessórios presos ao osso

Acessório = malha filha do osso, com a escala do osso cancelada, encaixe por raycast na superfície. Slots do dragão:
cabeça (`Head`: chifres, chapéus, óculos), pescoço (`Neck`: colar, lenço), costas (`Body`: sela, mochila), patas,
ponta da cauda. Cabelo e roupa skinned de outro `.glb` entram com `SkinnedMesh.bind(esqueletoDaBase, bindMatrix)` por
nome de osso (testado: cabelo longo + roupa Ranger na base feminina Quaternius).

### Recolorir modelo com atlas

`material.color.set` num modelo de atlas único (KayKit) pinta pele e botas junto. Repinte **as células** do atlas
(grade 8 × 4 no KayKit) numa cópia da textura, preservando o degradê pela luminância relativa; descubra qual célula é
qual parte por histograma de UV por malha. O cabelo do KayKit é uma célula própria (coluna 1, linha 0). `color.multiply`
serve para "encardir". Isso ainda não está no motor.

## Fallback por código: `Humanoide`

`src/creature/humanoide.ts`: uma pessoa low-poly de primitivas (Lambert chapado, pivô nos pés, frente +Z). Cabeça que
segue um alvo (±60°), corpo que vira devagar quando perto, aceno opcional, respiração, `setMarcha` (andar procedural
pela distância percorrida), `setPulo`, `montar(osso)`/`desmontar` para andar no dragão. A aparência é um `Look`
(cores, penteado, saia, barba, roupa, ferramenta, chapéu, avental) com schema zod em `look.ts`, então a vila inteira
cabe em YAML. Serve de aldeão e de protagonista provisória enquanto o modelo de verdade não chega.

## Licenças e `LICENCAS.md` por pasta

Toda pasta com assets de terceiros tem um `LICENCAS.md` com uma linha por arquivo:

| Arquivo | Origem (URL exata) | Autor | Licença | Baixado em | Observações |
|---|---|---|---|---|---|

- CC0 não exige crédito; os dois jogos agradecem Quaternius e Kay Lousberg nos créditos mesmo assim.
- Saída de IA: registrar ferramenta, versão, parâmetros e licença dos pesos. A imagem de entrada da criança fica fora do
  repo.
- Pago (Synty, Polytope, Mixamo cru): `.gitignore` e servir de outro lugar; o repo público nunca recebe os arquivos.
- Geometria feita por código (casas, bichos, frutas): dizer isso no `LICENCAS.md` ("nada a licenciar").

## Fontes

- Pesquisa "Personagens humanos estilizados low-poly" (23/10/2026), com bancada medida
- Contrato do modelo do jogo do Dragão (`docs/MODELO.md`) e `LICENCAS.md` das pastas de modelos do Dragão, das Três
  Ilhas e da bancada
- Código do motor: `src/creature/model.ts`, `src/creature/aparencia.ts`, `src/creature/humanoide.ts`, `src/creature/look.ts`
- https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- https://kaylousberg.itch.io/kaykit-adventurers
- https://kaylousberg.itch.io/kaykit-character-animations
- https://quaternius.com/packs/universalbasecharacters.html
- https://quaternius.itch.io/universal-base-characters
- https://quaternius.itch.io/modular-character-outfits-fantasy
- https://quaternius.itch.io/universal-animation-library
- https://quaternius.itch.io/universal-animation-library-2
- https://quaternius.com/packs/ultimatemonsters.html
- https://quaternius.com/packs/ultimateanimatedanimals.html
- https://quaternius.com/packs/farmanimal.html
- https://quaternius.itch.io/lowpoly-animated-animals
- https://poly.pizza/m/VBvzjFIYws
- https://poly.pizza/m/LlwD0QNUPj
- https://kenney.nl/assets/blocky-characters
- https://gamedev.net/news/2144-cube-pets/
- https://marketplace.unity.com/packages/3d/characters/humanoids/fantasy/polygon-modular-fantasy-hero-characters-low-poly-3d-art-by-synty-143468
- https://marketplace.unity.com/packages/3d/characters/humanoids/fantasy/polygon-fantasy-characters-low-poly-3d-art-by-synty-97186
- https://syntystore.com/pages/one-time-purchase-licence
- https://syntystore.com/pages/standard-subscription-licence
- https://syntystore.com/products/syntypass
- https://syntystore.com/products/polygon-kids-pack
- https://assetstore.unity.com/packages/3d/characters/fantasy-villagers-sidekick-modular-characters-by-synty-343744
- https://assetstore.unity.com/packages/3d/characters/humanoids/lowpoly-modular-peasants-citizens-medieval-fantasy-series-247827
- https://unity.com/legal/as-terms
- https://forum.godotengine.org/t/synty-studio-characters-with-mixamo-animations/110613
- https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- https://genies.com/blog/ready-player-me-shutdown
- https://developers.tripo3d.ai/en/models/rig
- https://developers.tripo3d.ai/en/pricing
- https://docs.meshy.ai/en/api/pricing
- https://docs.meshy.ai/en/api/rigging-and-animation
- https://www.meshy.ai/topics/ai-low-poly-generate-or-decimate
- https://www.strayspark.studio/blog/ai-auto-rigging-showdown-2026-tripo-meshy-cascadeur-mixamo
- https://huggingface.co/spaces/tencent/Hunyuan3D-2.1
- https://github.com/microsoft/TRELLIS.2
- https://huggingface.co/spaces/microsoft/TRELLIS.2
- https://3dtoolwiki.com/tools/rodin
- https://superhivemarket.com/products/ams-splitter/docs
- https://gltf-transform.dev/cli
