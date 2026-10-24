# Cutscenes puláveis com roteiro em YAML

Este arquivo explica como fazer cenas de história (abertura sem fala, diálogo encenado, "a dragoa dorme e acorda") num
jogo three.js, com roteiro como dados, câmeras com nome e um "pular" que nunca deixa o mundo num estado errado. Leia
antes de escrever a primeira cena de um jogo, antes de propor uma biblioteca de timeline e quando uma cena pulada deixar
algo fora do lugar. O formato saiu da pesquisa de cutscenes (21/10/2026) e foi testado na abertura das Três Ilhas
(naufrágio, 58 passos, 64 s). O código está em `src/cutscene/` (leia o `README.md` de lá para a API).

## A decisão

**Lista de comandos, não timeline.** Um roteiro é uma sequência de passos executados em ordem, como os eventos do RPG
Maker e os comandos do Yarn Spinner. Timeline com tracks (Unity Timeline, Theatre.js) só compensa com editor visual; uma
lista com bloco `junto` cobre quase tudo e se escreve à mão em YAML, por um agente ou ditada por uma criança.

O que foi copiado de cada referência:

| De | O quê |
|---|---|
| RPG Maker MZ | lista de comandos com a caixa "Wait for Completion" por passo: aqui, `fundo: true` = não esperar |
| Yarn Spinner | um passo é um comando nomeado com argumentos, e o runtime dá `await` nele |
| Dialogic 2 (Godot) | o evento "Signal" que chama código do jogo: aqui, o passo `evento` |
| Unity Cinemachine | câmeras virtuais declaradas com nome; trocar = blend; blend 0 = corte; trilho como tipo de câmera |
| Godot `AnimationPlayer.seek()` | pular chega ao estado final **sem** tocar os sons e callbacks do meio: separar estado de efeito |
| Ren'Py | o próprio autor chama de "rude" prender o jogador sem saída: toda cena tem um jeito de pular |

## O formato

Regras do schema (`src/cutscene/schema.ts`, zod):

- Um passo = um objeto com **uma** chave de tipo.
- Valores sempre **absolutos** (posição final, volume final, câmera alvo), nunca "mais 3 metros". É isso que torna o
  estado final de cada passo calculável, e o pular sai de graça.
- `junto:` roda os passos filhos em paralelo e espera todos.
- `fundo: true` (no passo, ao lado da chave de tipo) não espera; `atraso:` atrasa o início em segundos.
- `marca:` divide a cena em trechos; → pula até a próxima marca.
- Tipo desconhecido do motor (`mar`, `chuva`, `ceu`) é um handler registrado pelo jogo. Um tipo do motor com payload
  errado falha na validação, não cai no handler genérico.

Tipos do motor:

| Tipo | Payload | Faz |
|---|---|---|
| `marca` | nome | início de trecho |
| `esperar` | segundos | pausa no relógio do jogo (pausar o jogo congela a cena) |
| `camera` | `usar`, `blend`, `ease`, `dur` | troca de câmera virtual; `blend: 0` = corte |
| `mover` | `alvo`, `para` [x, y, z], `dur`, `ease` | posição final de um objeto |
| `girar` | `alvo`, `para` (graus XYZ), `dur`, `ease` | rotação final |
| `animar` | `alvo` (um ou vários), `clipe`, `laco`, `dur` | toca um clipe |
| `trocar` | `mostrar`, `esconder` | visibilidade |
| `fala` | `quem`, `retrato`, `texto`, `bloqueia` | caixa de diálogo do jogo; `bloqueia: false` não espera |
| `som` | `nome`, `atraso` | efeito; nunca toca no pulo |
| `musica` | `faixa`, `volume`, `dur` | crossfade |
| `fade` | `para` (preto, branco, nada), `dur` | |
| `letterbox` | `ligar`, `dur` | barras de cinema |
| `palpebras` | `para` (0 fechado a 1 aberto) ou `roteiro` [..], `dur` | olhos fechando e abrindo |
| `desfoque` | `para` (px), `dur` | `filter: blur()` no canvas |
| `tremor` | `forca`, `dur` | tremor da câmera |
| `evento` | `nome` | emite para o código do jogo |
| `junto` | lista de passos | paralelo |

Eases: `linear`, `suave` (padrão), `entra`, `sai`, `back-out` (ultrapassa e volta: "levanta de repente").

### Câmeras virtuais

Declaradas no topo, cada uma com nome:

- **fixa**: `pos` + `alvo` (objeto) ou `olhar` (ponto);
- **presa**: `presa: <objeto>` + `offset` no espaço local dele (e `olhar` local);
- **trilho**: `trilho: [[x,y,z], ...]`, curva `CatmullRomCurve3` percorrida durante o `blend`/`dur` do passo `camera`.

Todas aceitam `fov` e `roll` (graus). O rig (`src/cutscene/camera.ts`) avalia a pose de cada câmera a cada quadro e mistura
da pose viva da anterior (lerp na posição, slerp na orientação, fov e roll lineares). Por isso uma câmera presa a um
objeto que se move segue certo mesmo no meio de um blend. Fora da cena, a câmera do jogo volta a mandar.

## Pular

Cada tipo de passo tem `run()` (toca, resolve quando termina, respeita o sinal de abort) e `fim()` (aplica o estado final
de uma vez, sem som nem efeito). **Pular = abortar o que está tocando e aplicar `fim()` de cada passo restante**, até o fim
da cena ou até a próxima `marca`. Som e efeito somem no pulo; estado (posição, visibilidade, câmera, música, letterbox)
chega ao valor final.

O teste que fixa isso (`src/cutscene/cutscenes.test.ts`): pular desde o início deixa o mesmo estado final que tocar a cena
inteira. Escreva o mesmo teste para os handlers do seu jogo.

UX do pular, já implementada em `src/cutscene/cutscenes.ts`:

- `pulavel: segurar` (padrão): segurar Esc 1 s, com anel de progresso. O aviso "segure Esc para pular" só aparece depois
  do primeiro toque.
- Trava de 0,5 s no começo da cena contra o pulo acidental.
- Cena já vista (o save guarda `cenasVistas`): um toque basta.
- → pula só até a próxima `marca`. `pulavel: nao` ignora Esc (use pouco).
- Enquanto a cena toca, o contexto `cutscene` fica no topo da pilha de input (`src/core/contextos.ts`): só Esc, Espaço e →
  chegam, e o jogo zera os controles.
- `escalaTremor` no rig é a opção de acessibilidade "reduzir tremor" (0 = sem tremor).

## O diretor: quando a cena toca

O jogo monta o palco de cada cena em código e a registra uma vez no `Diretor` (`src/cutscene/diretor.ts`). O YAML diz
quando e como:

```yaml
gatilho: { tipo: lugar, lugar: caverna, raio: 12, hora: [0.8, 0.2] }   # ou inicio | missao | evento
ritual: { esconder_hud: true, salvar_ao_fim: true, lembrar_vista: true, snap_camera: true }   # tudo true por padrão
```

O ritual em volta de cada cena: esconde o HUD, toca, marca como vista, salva, devolve o HUD, emite `cena:terminou`
(e `cena:pulada`), roda o `depois()` do jogo e encaixa a câmera do jogo sem balanço. Gatilhos, menos `inicio`, esperam o
jogo ficar quieto (o `quieto()` que o jogo fornece) e não tocam cena já vista.

## Pálpebras, desfoque e tremor: linguagem de sensação

Três efeitos baratos de tela contam sono, tontura, susto, frio e calor sem uma palavra. Na abertura das Três Ilhas toda
a história do naufrágio é câmera, tremor, som e pálpebras; a primeira fala vem só depois, já no quarto. Funcionou melhor
que qualquer legenda. A receita, com os números que foram usados:

- **Pálpebras**: dois retângulos pretos com borda arredondada sobre o canvas, altura `calc((1 - var(--abertura)) * 56%)`.
  `roteiro: [0.3, 0.1, 0.6, 0.2, 1]` em 4 s = quem acorda (abre um pouco, fecha, abre mais, fecha, abre).
  `roteiro: [0.6, 0.8, 0.4, 0.5, 0]` em 5 s = quem desmaia.
- **Desfoque**: 1,5 px por 5 s na água (tontura), 6 px em 1 s na pancada, 10 px junto com as pálpebras fechando, de volta
  a 0 em 4 s ao acordar.
- **Pancada**: um `junto` de quatro coisas em 0,25 s (som, tremor 1,0, música a volume 0, desfoque subindo); depois fade
  preto em 0,5 s e 2,5 s de silêncio.
- **Crescendo em três degraus**: tremor 0,2 → 0,5 → 1,0 (1,2 s, 1,5 s, 2 s). Foi um pedido da própria criança.
- **Letterbox** ligado no primeiro passo (dur 0) e desligado no último (dur 0,8): a barra saindo é o sinal de "agora é você".

Use os mesmos efeitos, curtos, nas cenas seguintes, não só na abertura.

## Regras para criança

- **Curta**: blocos de 20 a 60 s separados por `marca`; uma abertura muito visual pode ter ~70 s se o pular funcionar.
  Cenas menores com 10 a 30 s.
- **Falas** até 2 linhas, ~70 caracteres, uma ideia por caixa. Criança de 3º ano lê 83 a 112 palavras por minuto.
  Typewriter a ~35 caracteres/s; Espaço na 1ª vez completa o texto, na 2ª avança. **Fala nunca some sozinha**, a não ser
  `bloqueia: false` andando.
- **Pular sempre existe** (segurar na primeira vez, toque depois). Menu "rever cenas".
- **Tremor nunca passa de 1,0 e nada pisca** (sem flash branco no raio). Opção "reduzir tremor".
- **Não tire o controle sem precisar**: um aviso pode ser walk-and-talk, com a criança andando e a caixa no rodapé. Tire o
  controle só quando a câmera precisa contar algo.

## Exemplo de roteiro

Trecho adaptado da abertura das Três Ilhas. `mar` é um handler do jogo (intensidade das ondas); o resto é do motor.

```yaml
id: abertura
pulavel: segurar
gatilho: { tipo: inicio }
cameras:
  mar_largo: { pos: [-60, 18, 90], alvo: barco, fov: 45 }
  conves:    { presa: barco, offset: [0, 3, -6], olhar: [0, 1.5, 4], fov: 60 }
  teto:      { pos: [0, 0.9, 0], olhar: [0, 3, 0.2], roll: 12, fov: 70 }
  sentada:   { pos: [0, 1.4, 0.2], olhar: [0, 1.2, 3], fov: 65 }
  quarto:    { pos: [2.6, 1.7, 2.6], alvo: cama, fov: 50 }
passos:
  - marca: barco
  - fade: { para: preto, dur: 0 }
  - letterbox: { ligar: true, dur: 0 }
  - camera: { usar: mar_largo }
  - musica: { faixa: mar-calmo, volume: 0.6, dur: 3 }
  - fade: { para: nada, dur: 2.5 }
  - camera: { usar: conves }                  # corte (blend 0)
  - esperar: 2.5
  - marca: tempestade
  - junto:
      - mar: { intensidade: 0.7, dur: 6 }
      - tremor: { forca: 0.3, dur: 6 }
  - som: { nome: trovao, atraso: 1.5 }
    fundo: true                               # não espera o trovão
  - junto:                                    # a pancada
      - som: { nome: pancada }
      - tremor: { forca: 1.0, dur: 0.25 }
      - musica: { volume: 0, dur: 0.8 }
      - desfoque: { para: 10, dur: 1.5 }
      - palpebras: { para: 0, dur: 1.8 }
  - fade: { para: preto, dur: 0.5 }
  - esperar: 2.5
  - marca: acordar
  - trocar: { esconder: [mar, barco], mostrar: casa_ilha }
  - camera: { usar: teto }
  - fade: { para: nada, dur: 0 }
  - junto:
      - palpebras: { roteiro: [0.3, 0.1, 0.6, 0.2, 1], dur: 4 }
      - desfoque: { para: 0, dur: 4 }
  - esperar: 1.5
  - junto:
      - camera: { usar: sentada, blend: 0.35, ease: back-out }   # levanta de repente
      - som: { nome: respiracao }
  - camera: { usar: quarto }
  - musica: { faixa: ilha-tema, volume: 0.5, dur: 3 }
    fundo: true
  - letterbox: { ligar: false, dur: 0.8 }
  - evento: { nome: abertura-fim }            # o jogo devolve o controle
```

No jogo:

```ts
const cs = new Cutscenes({ camera, canvas, contextos, obj, fala, audio, emit, relogio });
cs.registrar("mar", {
  run: (p, c) => {
    const de = mar.intensidade;
    return animar(c, p.dur, "suave", (k) => { mar.intensidade = de + (p.intensidade - de) * k; });
  },
  fim: (p) => { mar.intensidade = p.intensidade; },     // estado final, sem efeito
});
const cena = cs.carregar(textoDoYaml);                    // valida com o schema
const erros = cs.verificar(cena);                         // tipos sem handler e objetos desconhecidos: use num teste
```

## Palco e técnicas

- **Palco próprio, longe do mundo**: um `Group` em (0, 0, −8000) com mar, barco e quarto; câmeras fixas deslocadas ao
  carregar. Mostrar e esconder com `trocar`.
- **Efeito de clima próprio da cena**: a `Weather` do motor tem fade de 6 s e nublado automático, não serve para pular na
  hora. A chuva do palco precisa de `fim()` que a esconda já.
- **Quebrar algo**: modelar no Blender já em pedaços (o barco em 8) no mesmo .glb; no `evento`, esconder o inteiro e soltar
  os pedaços com física falsa (velocidade, giro, gravidade, boia).
- **Plano coreografado demais para passos** (um tsunami): animar no Blender e tocar com `AnimationMixer`; pular =
  `mixer.setTime(duração)`.
- **Um `update` de cena que roda sempre não mexe em música nem câmera** fora de `cs.ativa`: o roteiro parado deixa o volume
  em 0 e silencia o jogo inteiro num reload com a cena já vista.
- Pendência anotada nas Três Ilhas: ao acordar, a câmera do jogo assumia antes do diálogo seguinte; o plano final deveria
  ficar até o fim das falas.

## Bibliotecas

- **Nenhuma lib de timeline.** O sequenciamento (ordem, `junto`, esperar fala, pular) é `await` + `Promise.all`.
- Interpolação: `animar()` próprio (`src/cutscene/animar.ts`, no relógio do jogo; no abort salta para k = 1).
  `@tweenjs/tween.js` (MIT) é opção no mesmo lugar, com uma `Group` só da cena; seu `end()` salta ao valor final.
- anime.js v4 (MIT, timeline com labels e `seek`) só se um dia precisar de tempos absolutos.
- Recusados: Theatre.js (sem commit público desde 11/04/2024), GSAP (licença fechada), typeit (GPL), Yarn Spinner em JS
  (sem runtime oficial). inkjs só quando houver escolhas no diálogo. Detalhes em [bibliotecas.md](bibliotecas.md).
- Fade, letterbox, pálpebras, desfoque e legenda: CSS puro sobre o canvas.

Polimento em geral (tremor, cores, avisos): [polimento.md](polimento.md). Vozes das falas:
[vozes-e-musica.md](vozes-e-musica.md).

## Fontes

- https://github.com/theatre-js/theatre
- https://www.theatrejs.com/docs/latest/manual/projects
- https://www.theatrejs.com/docs/latest/api/core
- https://github.com/tweenjs/tween.js/blob/HEAD/docs/user_guide.md
- https://animejs.com/documentation/timeline
- https://animejs.com/documentation/engine/engine-methods/update
- https://webflow.com/blog/gsap-becomes-free
- https://gsap.com/community/standard-license/
- https://yarnspinner.dev/blog/yarn-spinner-in-2026/
- https://yarnspinner.dev/docs/yarn/02-fundamentals/10-commands/
- https://yarnspinner.dev/docs/unity/06-creating-commands-functions/
- https://deepwiki.com/dialogic-godot/documentation
- https://docs.unity3d.com/Packages/com.unity.cinemachine@2.4/manual/CinemachineTimeline.html
- https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineCamera.html
- https://unity.com/blog/engine-platform/how-to-use-timeline-signals
- https://docs.godotengine.org/en/4.2/classes/class_animationplayer.html
- https://rpgmakerofficial.com/product/MZ_help-en/01_10_10.html
- https://rpgmakerofficial.com/product/MZ_help-en/01_10_06.html
- https://lemmasoft.renai.us/forums/viewtopic.php?p=499817
- https://gameaccessibilityguidelines.com/full-list/
- https://gameaccessibilityguidelines.com/ensure-that-subtitles-captions-are-cut-down-to-and-presented-at-an-appropriate-words-per-minute-for-the-target-age-group/
- https://clevercast.com/bbc-subtitling-guidelines
- https://bugs.scummvm.org/ticket/13706
- https://twinfinite.net/guides/metro-exodus-skip-cutscenes-how/
- https://primagames.com/tips/can-you-skip-cutscenes-in-tears-of-the-kingdom
- https://en.wikipedia.org/wiki/Journey_(2012_video_game)
- https://www.axios.com/2021/10/08/sable-video-game-xbox-windows
- https://discourse.threejs.org/t/classic-ocean-shader-example-with-gestner-waves/29227
- https://codepen.io/Mamboleoo/post/tunnel-animation-1
- https://forum.shotcut.org/t/a-blinking-effect-or-a-waking-up-effect/30117
- https://heosphorus.itch.io/blink
