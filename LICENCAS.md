# Licenças e créditos de terceiros

O código deste repositório é MIT (`LICENSE`); textos e imagens próprias são CC BY 4.0 (`LICENSE-DOCS.md`). Este
arquivo lista o que é de outras pessoas e aparece aqui, nas capturas de tela da página ou nos jogos de onde elas saíram.

## Nada de terceiros no repositório

O repositório não traz modelos 3D, músicas nem sons de terceiros: os efeitos são sintetizados com zzfx e Web Audio,
e as pessoas, bichos, casas e plantas dos jogos são geometria feita por código. Os modelos e as músicas abaixo só
aparecem **nas capturas de tela** (`docs/img/`) e nos jogos publicados.

## Modelos 3D que aparecem nas capturas

| Modelo | Onde aparece | Autor | Licença | Origem |
|---|---|---|---|---|
| "Dragon" e "Dragon Evolved" (pack Ultimate Monsters) | a Mila e os dragões do Dragão; a Brasa das Três Ilhas | Quaternius | CC0 1.0 | https://poly.pizza/m/VBvzjFIYws, https://poly.pizza/m/LlwD0QNUPj, https://quaternius.com/packs/ultimatemonsters.html |
| "Mage" (KayKit Adventurers Character Pack 1.0) | a protagonista das Três Ilhas (com o chapéu, o cajado e os livros escondidos por código) | Kay Lousberg | CC0 1.0 | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0, https://kaylousberg.itch.io/kaykit-adventurers |

CC0 não exige crédito; agradecemos a Quaternius e a Kay Lousberg mesmo assim.

## Músicas dos jogos (não estão neste repositório)

Os dois jogos usam músicas de Kevin MacLeod (incompetech.com), licenciadas sob Creative Commons: By Attribution 4.0
License (http://creativecommons.org/licenses/by/4.0/): "Shores of Avalon", "Fireflies and Stardust", "Carefree",
"Village Consort", "Island Meet and Greet", "Enchanted Valley", "Call to Adventure", "Thatched Villagers" e
"Frost Waltz". Como creditar música CC BY num jogo seu: [docs/agentes/vozes-e-musica.md](docs/agentes/vozes-e-musica.md).

## Vozes dos personagens (não estão neste repositório)

Geradas por síntese, sem voz humana gravada: Piper (vozes `pt_BR-faber-medium` e `pt_BR-cadu-medium`, datasets CC0,
https://huggingface.co/rhasspy/piper-voices) e Kokoro-82M (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M).

## Bibliotecas

As dependências de `package.json` e `visualizador/package.json` (three.js, zustand, zod, nanoevents, preact, js-yaml,
zzfx, simplex-noise, lil-gui, Cytoscape.js, cytoscape-dagre, yaml, Vite, Vitest, TypeScript) têm as próprias licenças
(MIT na maioria), instaladas pelo npm e não copiadas para cá. As fontes da página (Baloo 2 e Nunito) vêm do Google
Fonts, sob a SIL Open Font License.
