# Vozes, música e efeitos

Para que serve: decidir como os personagens falam (voz de verdade, voz do sistema ou blip), de onde vem a música e como
ela muda pelo mundo, e como fazer efeitos sem arquivo. Tudo aqui foi usado nos dois jogos (Dragão e Três Ilhas) e está
no motor em `src/audio/` e `src/game/dialogo/`. Preços e licenças são de out/2026 (pesquisa "voz falada para os NPCs",
17 e 18/10/2026).

## Vozes de NPC: o que usar

| Opção | Qualidade em pt-BR | Licença da saída | Custo | Papel |
|---|---|---|---|---|
| **Piper** (`piper-tts` 1.8) | clara, neutra, um pouco "GPS" | vozes faber, cadu, jeff: datasets CC0; edresson: CC BY 4.0 | zero, CPU, rápido | fala curta; padrão |
| **Kokoro-82M** | melhor entonação; vozes `pf_dora` (feminina), `pm_alex`, `pm_santa` | Apache-2.0 | zero, local | quem conta história, quem precisa de expressão |
| **Web Speech** (`speechSynthesis`) | "robótica simpática"; no Mac, Luciana | nada é distribuído (gera na máquina de quem joga) | zero | fallback quando falta o arquivo |
| **Blip por letra** | não fala palavras | sem licença | zero | NPC secundário, jogo sem voz |
| ElevenLabs | a melhor para voz de personagem (Voice Design) | plano pago dá direito comercial; Free é não comercial com atribuição | US$ 0,08 por mil caracteres (v2/v3) | se Piper e Kokoro não bastarem |
| OpenAI `gpt-4o-mini-tts` | aceita instruções de estilo; vozes otimizadas para inglês | exige avisar que a voz é IA | ~US$ 0,015/min (estimativa) | alternativa paga |
| Google Chirp 3 HD | muito natural | | US$ 30 por milhão de caracteres, 1 milhão grátis/mês | sem controle de personagem |
| Chatterbox Multilingual (MIT) | candidato open mais forte, clona voz | MIT | zero, torch | não testado; plano B |

Fora: **XTTS-v2, F5-TTS, Fish Speech** (pesos ou saídas não comerciais: risco num repo público); **edge-tts** (endpoint
não oficial); **vozes do macOS gravadas em arquivo** (direito de distribuir incerto, e soaram mal).

As quatro vozes Piper pt-BR são masculinas. Personagem feminina ou criança com Piper = mudar o tom no ffmpeg; com
Kokoro, `pf_dora`.

## O gosto que deu certo

Paulo ouviu amostras numeradas da mesma fala em cada voz (out/2026):

- **Kokoro para quem conta história**: `pm_santa` foi a melhor ("entonação curiosa"), `pm_alex` ótima, `pf_dora` ok.
- **Piper puro para fala curta**: faber ótimo, cadu boa, jeff "meio triste".
- **Faixa de tom que soa artificial**: entre 1,05 e 1,2. Ou a voz pura, ou um salto grande (≥ 1,25): faber com tom
  1,26 e velocidade 1,07 ficou "muito bom" numa personagem feminina; faber com 1,19 ficou "médio ruim".
- Vozes do macOS gravadas: horríveis. Ficam só ao vivo, como fallback.
- Para escolher: tocar amostras numeradas da mesma fala e pedir notas (vale deixar a criança votar também).

## Falas pré-renderizadas por hash

Cada fala dos diálogos vira um mp3 em `public/audio/falas/<retrato>/<hash>.mp3` (mono, 48 kbps, 22 kHz). O hash cobre
retrato + texto + configuração da voz: mudou a fala ou a voz, muda o arquivo, e o script só gera o que mudou. O jogo
toca o arquivo; se não houver, fala com a voz do sistema.

### `vozes.yaml`: uma voz por retrato

Caminho em `conteudo.vozes` do `jogo.yaml` (padrão `src/game/dialogo/vozes.yaml`; schema em
`src/game/dialogo/vozes.ts`):

```yaml
novidades: coruja            # opcional: quem lê as novidades da versão em voz alta
mudos: [placa, mila]         # nunca falam em voz alta (placas, pensamentos da heroína)
extras: [src/game/extras/cartas.yaml=narrador]   # mais arquivos de falas
vozes:
  coruja:  { motor: kokoro, voz: pm_santa,           tom: 1.0,  velocidade: 1.0 }
  padeira: { motor: piper,  voz: pt_BR-faber-medium, tom: 1.26, velocidade: 1.07 }
```

`tom` muda a altura sem mudar a duração (ffmpeg `asetrate` + `atempo`). Retratos em minúsculas. Retrato fora da tabela
não ganha arquivo e fala com a voz do sistema. `presetsDasVozes` dá os mesmos `tom`/`velocidade` à Web Speech, para o
fallback soar parecido.

### `scripts/gerar-vozes.mjs`

```sh
npm run vozes -- --jogo ~/meujogo            # dentro do motor
node scripts/gerar-vozes.mjs --jogo . --listar   # o que geraria e apagaria, sem mudar nada
```

| Opção | Faz |
|---|---|
| `--jogo DIR` | raiz do jogo, onde está o `jogo.yaml` (padrão: diretório atual) |
| `--extra ARQ[=RET]` | mais um YAML de falas (repetível): toda string sob `texto` e toda lista de strings no topo, falada por `RET` (ou pelo `retrato` do arquivo) |
| `--tudo` | gera tudo de novo |
| `--so RETRATO` | só um retrato |
| `--listar` | ensaio, não muda nada |
| `--sem-apagar` | mantém arquivos fora do índice |
| `--modelos DIR` | modelos `.onnx` do Piper (padrão `<jogo>/local/vozes-modelos`, baixados no primeiro uso) |
| `--kokoro-python PATH` | python do venv do Kokoro (padrão `<jogo>/local/kokoro-venv/bin/python`) |

O script lê o manifesto: `conteudo.dialogos` (glob), `conteudo.novidades`, `conteudo.vozes`. Escreve
`public/audio/falas/index.json` (retrato → texto → arquivo), o formato que `src/game/dialogo/arquivos.ts` lê, e apaga os
mp3 que nenhuma fala usa. No fim, lista os retratos sem voz. Emojis ficam no texto mas não são lidos.

Instalação (macOS):

```sh
pipx install piper-tts && brew install ffmpeg espeak-ng
python3.12 -m venv local/kokoro-venv && local/kokoro-venv/bin/pip install kokoro soundfile
```

- O Piper 1.8 não baixa modelo sozinho pelo CLI; o script baixa com `python -m piper.download_voices` (63 MB por voz).
- Kokoro precisa de Python 3.12 (não há torch para 3.14) e do `espeak-ng` do Homebrew. Se der "phontab: No such file",
  aponte `ESPEAK_DATA_PATH` para `/opt/homebrew/share/espeak-ng-data`.
- Medido: Piper, 129 falas em 180 s (3,2 MB); Kokoro, 133 falas em 170 s, gerando em lote.
- Modelos e venv ficam em `local/`, fora do git. O programa Piper é GPL-3.0, mas é só a ferramenta: o áudio segue a
  licença da voz.

### No jogo: `Voz`

`src/game/dialogo/voz.ts`: modo `arquivo` (mp3 quando existe, senão sistema), `sistema` ou `mudo`. Uma fala por vez;
fala nova corta a anterior. Pegadinhas da Web Speech: Chrome carrega as vozes de forma assíncrona (`voiceschanged`),
pode cortar a fala se o objeto for coletado, pede gesto antes da primeira fala; Safari trata pitch ≤ 0,5 tudo igual.
Browser headless não tem voz pt-BR (os arquivos tocam mesmo assim).

Ritmo: a Luciana fala ~13 caracteres/s; o datilógrafo do `Dialogo` escreve 40 letras/s. Com voz ligada, ~15 c/s casa
melhor. A fala nunca avança sozinha.

## Blips por letra (sem voz)

À la Undertale e Animal Crossing: cada letra visível toca um som curto com o tom do personagem; nenhuma palavra real.

- O `Dialogo` do motor chama `onLetra(quem, char)` a cada letra; o jogo toca o blip (zzfx ou oscilador).
- Altura variando alguns % ao acaso, intervalo mínimo de ~30 ms entre blips, pular espaços.
- Pausa em vírgula ~120 ms e em ponto ~350 ms (`pausaVirgula`, `pausaPonto` do `Dialogo`); pausa longa parece travamento
  para criança.
- Tom por personagem; subir o tom quando feliz, baixar quando triste.
- Pacote pronto: `animalese-tts` (MIT, Web Audio). Do zero: oscilador + envelope, umas 80 linhas.
- Vantagem: a criança continua lendo. Desvantagem: não ajuda quem ainda não lê.

## Música CC BY

### De onde tirar

| Fonte | Licença | Crédito | Para jogo |
|---|---|---|---|
| **incompetech** (Kevin MacLeod) | CC BY 4.0 | obrigatório, formato do FAQ | sim; é a fonte de todas as músicas dos dois jogos |
| Scott Buckley | CC BY 4.0 | sim | sim (cinemático) |
| Free Music Archive | várias CC + FMA-Limited | sim | só faixas sem ND e sem NC |
| Kenney (Music Jingles e outros packs de áudio) | CC0 | não | jingles curtos |
| Mixkit (música) | própria | não | **não**: a licença de música proíbe jogos |

O incompetech tem um `pieces.json` com 1.443 peças e filtros por coleção e "feel" (out/2026); o MP3 sai de
`mp3-royaltyfree/<arquivo>`.

### Como creditar

Uma linha por faixa no `public/audio/LICENCAS.md` (arquivo, faixa, autor, licença, URL de origem, data) e o texto na
tela de créditos ou de ajuda do jogo:

> "Shores of Avalon", "Fireflies and Stardust", "Carefree", "Village Consort", "Island Meet and Greet" e "Enchanted
> Valley" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License,
> http://creativecommons.org/licenses/by/4.0/.

Faixas usadas (todas Kevin MacLeod, CC BY 4.0):

| Jogo | Região | Faixa |
|---|---|---|
| Dragão | campo / calma / manhã / vila / praia / subsolo | Shores of Avalon, Fireflies and Stardust, Carefree, Village Consort, Island Meet and Greet, Enchanted Valley |
| Três Ilhas | abertura / ilha / vila / montanhas / noite | Call to Adventure, Shores of Avalon, Thatched Villagers, Frost Waltz, Fireflies and Stardust |

Recodificar a 112 kbps deixa o repo leve (sem editar a música; a capa embutida e os metadados saem).

## Música por região

`Music` (`src/audio/music.ts`): todas as faixas tocam em loop o tempo todo; só os ganhos mudam. `update(dt, faixa)`
faz o crossfade (3 s por padrão), `fadeIn` de 4 s depois de carregar. Arquivo que falta só silencia a música.

- **Histerese**: na fronteira entre duas regiões a música vai e volta. `SeletorComHisterese` (`src/core/histerese.ts`,
  puro, testado) só troca quando a nova região se mantém por `dwell` segundos seguidos; nas Três Ilhas, 4 s. A região
  sai dos lugares do mapa e do bioma; a noite, da hora do dia.
- **Primeiro gesto**: o `AudioContext` só nasce em `pointerdown`/`keydown`. Um contexto só, compartilhado
  (`setContext`). Teste de browser que mede música precisa clicar antes.
- **Arquivo novo, nome novo**: com cache longo, trocar a música exige outro nome de arquivo. Música servida de outro
  domínio precisa de CORS (`fetch` + `decodeAudioData`). `configurarAudio({ base })` diz de onde o áudio vem.
- **Cutscene não mexe no volume fora de hora**: um `update` de cena que roda sempre deixou o volume em 0 e silenciou o
  jogo inteiro num reload com a cena já vista. Só mexer em música quando a cena está ativa ([cutscenes.md](cutscenes.md)).
- Ideias de polimento: abaixar a música 30 a 50% enquanto a caixa de diálogo está aberta; camada extra no voo (como
  A Short Hike); som ambiente acima da música ([polimento.md](polimento.md)).

## Efeitos com zzfx

`Sfx` (`src/audio/sfx.ts`): cada som é uma lista de parâmetros ZzFX ou uma sequência deles. `SONS_BASE` traz pegar,
comer, abrir/fechar menu, missão, dormir, acordar, pulo, pouso, pescar, trovão, onda e passos. O jogo espalha numa
tabela própria (`new Sfx({ ...SONS_BASE, ...meus })`), assina os próprios eventos e chama `tocar(nome)`. Antes do
`start()` (primeiro gesto), `tocar` fica mudo sem erro.

- **Passos por superfície**: 4 variações por superfície (`passo-grama-1..4`, areia, pedra), para não soar como
  metrônomo.
- Formas suaves (seno, triângulo), envelopes curtos, pouco ruído: nada estridente.
- Som de coleta subindo um semitom por item seguido, zerando depois de 1 a 2 s.
- Jingles em níveis (item comum, importante, de história) e o mesmo motivo para o mesmo significado.
- Nada importante só por som: todo aviso sonoro tem par visual.
- Ambiente sem arquivo: `Nature` (pássaros, água, chuva) e `WindSound` em Web Audio.
- Gerar WAV de zzfx no Node: o pacote instancia `AudioContext` ao carregar; faça um stub
  (`globalThis.AudioContext = class { sampleRate = 44100 }`) antes do import e use `ZZFX.buildSamples(...)`.

## Fontes

- Pesquisa "Voz falada para os NPCs do jogo da Elisa" (17 e 18/10/2026)
- Pesquisa "Polimento em jogos 3D de exploração para crianças" (21/10/2026), seções de diálogo e áudio
- Pesquisa "Sfx e música com licença" (09/10/2026), tabela de fontes
- `LICENCAS.md` de áudio do Dragão e das Três Ilhas (créditos reais)
- Código do motor: `scripts/gerar-vozes.mjs`, `src/game/dialogo/vozes.ts`, `voz.ts`, `arquivos.ts`, `dialogo.ts`,
  `src/audio/music.ts`, `sfx.ts`, `src/core/histerese.ts`
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
- https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/
- https://dev.to/jankapunkt/cross-browser-speech-synthesis-the-hard-way-and-the-easy-way-353
- https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR
- https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/faber/medium/MODEL_CARD
- https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/cadu/medium/MODEL_CARD
- https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/faber/medium
- https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/cadu/medium
- https://pypi.org/project/piper-tts/
- https://github.com/OHF-voice/piper1-gpl
- https://github.com/OHF-Voice/voice-datasets
- https://huggingface.co/hexgrad/Kokoro-82M
- https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- https://github.com/resemble-ai/chatterbox
- https://huggingface.co/vokra/xtts-v2
- https://huggingface.co/fishaudio/s1-mini
- https://elevenlabs.io/pricing/api
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://cloud.google.com/text-to-speech/pricing
- https://www.jsdelivr.com/package/npm/animalese-tts
- https://nookipedia.com/wiki/Animalese
- https://winterbitestudios.itch.io/plugin-rpg-maker-mz-dialogue-bleep
- https://incompetech.com/music/royalty-free/faq.html
- https://incompetech.com/music/royalty-free/pieces.json
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Shores%20of%20Avalon.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fireflies%20and%20Stardust.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Village%20Consort.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Island%20Meet%20and%20Greet.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Enchanted%20Valley.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Call%20to%20Adventure.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Thatched%20Villagers.mp3
- https://incompetech.com/music/royalty-free/mp3-royaltyfree/Frost%20Waltz.mp3
- http://creativecommons.org/licenses/by/4.0/
- https://www.scottbuckley.com.au/library/using-this-music/
- https://freemusicarchive.org/License_Guide
- https://mixkit.co/license/#musicFree
- https://kenney.nl/assets/category:Audio
- https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/
- https://bugnet.io/blog/footstep-sounds-matter-more-than-you-think
- https://gameaccessibilityguidelines.com/basic/
- https://github.com/KilledByAPixel/ZzFX
