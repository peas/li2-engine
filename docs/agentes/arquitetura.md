# Arquitetura do motor e como um jogo novo nasce dele

Para quem vai montar um jogo de browser com uma criança e quer saber como os dois jogos daqui (o Dragão da Elisa e
As Três Ilhas da Olivia) são organizados. Leia antes de escrever o primeiro arquivo do jogo novo. O motor está em
`src/`; você pode usá-lo como dependência, mas o mais provável é copiar as peças que servem e seguir as mesmas regras.

## A regra de fronteira

O motor não sabe o que é uma menina, um dragão, a Mila, uma coruja ou o nome de um lugar. Tudo o que é do jogo entra
por parâmetro ou por dados:

- **Alcances em metros por ator**, nunca em "corpos" de uma criatura. Com dois atores de tamanhos muito diferentes
  (uma menina de 1,6 m e um dragão de 9 m) só metros explícitos funcionam; o jogo converte na fronteira.
- **Lugares, catálogos, textos, ícones, retratos, sons e músicas** chegam como dados (YAML) ou parâmetros.
- **O que um módulo precisa do jogo é injetado**: um store, um `heightAt`, um `obj(id)`, uma função que diz se um
  item existe.
- Textos padrão da interface são em português neutro e substituíveis.
- As peças de tela (caixa de diálogo, avisos, barra de ação, bússola, faixa de missões, telas) têm tamanhos para ler
  do sofá; um jogo com outro visual passa `css` (regras acrescentadas depois das da peça) em vez de copiar a peça.

## Módulos

Cada pasta de `src/` tem um `index.ts` que exporta tudo dela (`li2-engine/core`, `li2-engine/game` etc.).

| Módulo | O que tem |
|---|---|
| `core` | `Loop` (passo fixo de 1/60 s, até 4 passos por quadro, interpolação), `Input` (mouse filtrado, pointer lock, gamepad, bordas de tecla), `PressLatch` (toque de tecla que sobrevive a um quadro sem passo), `Contextos` (pilha `jogo/dialogo/menu/cutscene`: só o topo recebe teclas), `FollowCamera` (molas críticas, metros, pitch orbital, oclusão pelo terreno, presets com nome), `SeletorComHisterese` e `SeletorDeAlvo` (escolha que não pisca: o que a cabeça olha), math (`smoothDamp`, `mulberry32`) |
| `world` | interface `WorldMap` (cada ilha implementa a sua) + `Biome`, `Terrain` (chunks, 3 LODs, saias), `Sky` (hora do dia, lua, estrelas), `Water`, `Weather`, `SunShadow`, `Vegetation` (instanciada, regras por parâmetro em `VegetationRules`: `clareiras`, `manterLivre`, `densidade`, pinheiros por sorteio (`pinheiros`) ou por lugar sem sorteio (`pinhal`), `palmeiras`, `bosquetes`, `floresNasClareiras`), `Obstacles` (grade hash de esferas), helpers low-poly, `criarRuido` |
| `creature` | `loadCreature` (.glb normalizado por altura ou comprimento, clipes por apelido), `Humanoide` (pessoa low-poly feita por código, com cabeça que olha, aceno, andar e pulo procedurais), `criarAparencia` (cores por partes de material e slots), `LookSchema` |
| `locomotion` | `Walker` (a pé, relativo à câmera, pulo com coyote time e buffer), `Climber` (escalar encostas à la Zelda, só matemática sobre o `heightAt`), `DragonFlight` (voo arcade com modo de chão). Só matemática, sem objetos de cena |
| `fx` | `Effects`: poeira, rastros, linhas de velocidade, anéis na água, brilhos, grama, "+1" flutuante |
| `audio` | `Sfx` (zzfx), `Music` (faixas por nome, crossfade), `MusicaPorLugar` (playlist por lugar, em streaming), `WindSound`, `Nature`, `configurarAudio` (base de URL para áudio hospedado fora) |
| `game` | eventos (`criarEventos`), store em fatias (`criarStore`, `Fatia`, `FATIAS_BASE`), "o mundo mudou" (`criarFatiaMundo`), manifesto (`lerManifesto`), missões (`Missoes`, schema, repetíveis), diálogo (`Dialogo`, retratos, `Voz`, `vozes.yaml`), HUD (avisos e o aviso grande `destaque`, barra de teclas, dica de primeira vez, carimbo, moedas, corações, indicador "salvo", modo cinema), `Npc`, `conversar`, `Interacoes` (o que o E faz aqui, com prioridade e segurar-E), `Colheita` (com o que cai: `derrubar`, queda com quique, chão, `dentroDoCone` para o vento), `Seguidor` (um companheiro que segue: no passo do líder ou no seu, calmo com `parte`), `Amizade`, `Encontro`, `Minimapa`, `Bussola`, steering, bichos por dados |
| `game/ui` | telas em preact: `montarTelas`, `Tela` (com abas por `aoLado`), `TelaMochila`, `TelaMissoes`, `TelaAjuda` (com abas), `TelaNovidades`, `TelaAparencia`; uma tela troca por outra com `ctx.abrir` |
| `game/edicoes` | as mudanças que a criança faz no MDM editor, como operações declarativas que o jogo aplica por cima dos YAML |
| `cutscene` | roteiro em YAML, câmeras virtuais, pular segurando Esc, efeitos de tela, `Diretor` com gatilhos declarativos (ver [cutscenes.md](cutscenes.md)) |

Fora do motor, mas no repositório: `visualizador/`, o **MDM (Mapa de Dependência de Missões)**: o "jogo por dentro" como grafo navegável, editável no **MDM editor** e
`scripts/gerar-vozes.mjs` (falas pré-gravadas por hash, ver [vozes-e-musica.md](vozes-e-musica.md)).

Bibliotecas: three.js, zustand (vanilla), zod, nanoevents, preact (só nas telas), js-yaml, zzfx, simplex-noise,
lil-gui. Por que essas e não outras: [bibliotecas.md](bibliotecas.md).

## Estado diz "como está", evento diz "o que aconteceu"

Esta é a ideia que a página das crianças ensina, e é a espinha do código.

- **Um store só** (`criarStore`), e o save **é** o estado: um JSON versionado, validado por zod, com `migrar()` para
  saves antigos e `sanear()` que descarta ids que saíram dos catálogos. Salva em momentos seguros (dormir, concluir
  missão, fechar menu). Save corrompido vai para `<chave>.corrompido`; o jogo nunca quebra por causa dele.
- O store é montado de **fatias** (`Fatia { nome, schema, inicial, acoes, sanear }`): inventário, missões, dia, dicas,
  cenas vistas, novidades, relógio vêm do motor (`FATIAS_BASE`); fome, poderes, ovos e amizades são fatias do jogo.
  A ordem das fatias é a ordem das chaves no JSON (importa para saves que já estão no navegador da criança).
- **Eventos tipados** (nanoevents): `pegouItem`, `missaoPasso`, `missaoConcluida`, `entregou`, `mundoMudou`,
  `cenaAcabou`... O jogo estende com os seus (`rosnou`, `ovoAchado`, `filhoteNasceu`). Som, partícula, aviso e "+1"
  assinam eventos; o HUD assina o store. Quem emite não sabe quem ouve.
- **O mundo mudou** é uma fatia, não um flag espalhado: o jogo registra cada chave (schema, padrão, a frase para a
  tela de ajuda), as missões escrevem `ao_concluir.mundo`, os sistemas leem `lerMundo(chave)`.

## Como um repositório de jogo é organizado

```
meu-jogo/
  jogo.yaml          manifesto: nome e onde mora cada tipo de conteúdo (o MDM e os scripts leem)
  CLAUDE.md          regras do jogo para agentes (aponta para o AGENTS.md deste repositório)
  DECISOES.md        uma linha por decisão, com data e quem decidiu
  DUVIDAS.md         perguntas abertas para a criança, numeradas
  docs/              NOTAS.md (diário técnico datado), IDEIAS.md (banco de ideias com nome e data), capturas/
  local/             fora do git: vídeos, áudios, desenhos e respostas da criança; modelos de voz
  public/            modelos .glb e áudio, sempre com LICENCAS.md
  scripts/           testar/ (blocos Playwright), capturar.mjs, lugares.mjs, publicar.sh
  src/
    main.ts          cola (≤ ~340 linhas): monta o contexto e percorre a lista de sistemas
    sistemas/        um arquivo por assunto: Sistema { id; instalar(ctx): Instalado }
    world/           o mapa (classe que implementa WorldMap), construções
    game/            missoes/*.yaml, dialogos/*.yaml, itens.yaml, moradores.yaml, novidades.yaml, ajuda.yaml, fatias do store
```

O `jogo.yaml` de verdade de um dos jogos:

```yaml
nome: As Três Ilhas
conteudo:
  vozes: src/game/dialogo/vozes.yaml
  missoes: src/game/missoes/*.yaml
  dialogos: src/game/dialogos/*.yaml
  moradores: src/game/moradores.yaml
  itens: src/game/itens.yaml
  receitas: src/game/receitas.yaml
  colhiveis: src/game/colhiveis.yaml
  cutscenes: src/game/cutscenes/*.yaml
  novidades: src/game/novidades/novidades.yaml
  ajuda: src/game/ui/ajuda.yaml
  lugares: src/world/lugares.ts
passos_extras:                     # tipos de passo do jogo, além dos do motor
  domar: { icone: "🐉", descricao: "domar" }
```

Gente e lugares que nascem no código do jogo (um personagem com classe própria, um lugar que aparece durante uma missão)
entram em `extras: { pessoas: [{ id, nome, papel? }], lugares: [{ id, descricao? }] }`, para o MDM reconhecê-los quando
uma missão os cita. Os campos de um passo extra podem ser `id`, `lugar`, `pessoa`, `item`, `numero`, `texto`, `textos`
(lista de textos, como as respostas aceitas de uma charada) e `sim_nao` (pode faltar: quer dizer não).

Um exemplo completo que abre no MDM está em [`exemplos/missoes-dos-jogos/`](../../exemplos/missoes-dos-jogos/).

### Sistemas: o main não cresce

Cada feature que cola interação, update, marco, painel e tecla à mão faz o `main.ts` crescer 30 a 50 linhas por
versão. O que segurou (nas Três Ilhas, de 532 para 245 linhas sem mudar comportamento):

```ts
interface Sistema { id: string; instalar(ctx: Ctx): Instalado }
interface Instalado {            // tudo opcional
  interacoes?: FonteDeE[];       // o que o E faz perto disto
  interesses?(): Alvo[];         // o que a cabeça da protagonista olha
  simular?(dt: number): void;    // dentro do passo fixo
  renderizar?(alpha: number): void;
  marcos?: Marco[];              // bússola e minimapa
  teclas?(): Contexto;           // a barra de teclas do lugar
  ajudaAgora?(): string[];       // linhas da tela de ajuda
  expor?(): object;              // o que entra em window.<jogo> para os testes
}
```

A **ordem da lista de sistemas é comportamento** (ordem das interações, dos NPCs, do simular): comente-a no `index.ts`.
Regra que precisa de teste vira função pura ao lado, com vitest.

## Como nasce um jogo novo

1. **Rodada 0 com a criança** antes de qualquer código: conversa, mapa desenhado, o que ela quer fazer no jogo
   ([co-criacao.md](co-criacao.md)).
2. **Controle e sensação primeiro**: a protagonista andando (ou voando) bem numa sala vazia vale metade do projeto.
   Use `Loop`, `FollowCamera`, `Walker` e meça a suavidade antes de pôr conteúdo ([licoes-tecnicas.md](licoes-tecnicas.md)).
3. **Dados antes de sistema**: crie `jogo.yaml`, `itens.yaml`, `moradores.yaml` e a primeira missão em YAML
   ([missoes-como-dados.md](missoes-como-dados.md)). Um teste cruza todos os ids: erro de digitação quebra o `npm test`,
   não a tarde da criança.
4. **Lógica como classe pura** (sem THREE) com vitest; depois a cola num `Sistema`; depois o browser.
5. **Teste de browser em blocos** com fixtures de save e teleporte ([testes.md](testes.md)).
6. **Publicar com a etiqueta "versão N"** visível na tela e as novidades contadas dentro do jogo.

Se você só copiar peças: o primeiro jogo daqui nasceu sozinho; o segundo nasceu por **cópia seletiva** do primeiro
(um terço serviu sem mexer, metade depois de desacoplar), e o motor comum só apareceu quando as duas cópias
estabilizaram a mesma peça. Pacote compartilhado antes do segundo jogo existir é custo sem retorno.

### Usar o motor como dependência (se quiser)

O motor é consumido como **fonte TypeScript**, sem build: `"li2-engine": "file:../li2-engine"` no `package.json` do
jogo. No `vite.config.ts` do jogo: `resolve.dedupe` com `three`, `preact`, `zustand`, `zod`, `nanoevents` (sem isso há
dois `three` e `instanceof` quebra), `server.fs.allow` incluindo a pasta do motor e `optimizeDeps.exclude: ["li2-engine"]`;
no vitest, `server.deps.inline: [/li2-engine/]`. Mexer no motor recarrega todo dev server que o linka.

## Forma de trabalho com agentes

- **Uma versão = uma coisa nova grande + polimento do que já existia**, e termina publicada para a criança testar.
- **Contratos antes de paralelizar**: tipos, formato do save, ids e lugares commitados antes de abrir subagentes;
  cada subagente numa pasta disjunta, sem commit, devolvendo "o que o main precisa mudar". A sessão principal integra.
- **Fixar antes, trocar depois**: antes de uma refatoração, grave um golden (save, posições da floresta, simulação
  dos bichos) e exija igualdade depois. Quatro vezes o golden disse "não troque" e o jogo manteve a peça própria.
- **Um commit por passo**, rodada completa de testes entre passos. Nunca `git add -A` com subagente escrevendo;
  subagente nunca roda `git stash` (tira o trabalho dos outros do disco).
- **Um Chromium de teste por vez** na mesma máquina: dois com GPU dão falhas fantasma.
