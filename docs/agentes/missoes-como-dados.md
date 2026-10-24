# Missões como dados (e como diagramas de estados)

Para o agente que vai criar missões com uma criança. Uma missão é um arquivo YAML que a criança consegue ler e, aos
poucos, editar; um interpretador pequeno no motor (`src/game/missoes/missoes.ts`) a executa. O mesmo arquivo vira o
diagrama de estados que a [página das crianças](../index.html) desenha. Exemplos completos, com as falas, em
[`exemplos/missoes-dos-jogos/`](../../exemplos/missoes-dos-jogos/).

## O diagrama que a criança desenha é o código

O interpretador tem poucos estados por missão, e são os mesmos que a criança desenha como bolinhas:

| Estado no motor | Na bolinha | Muda quando |
|---|---|---|
| `bloqueada` | trancada (escondida) | as missões de `requer` terminam e, com `oferecer_apos`, o mundo diz que o evento aconteceu |
| `nova` | alguém tem uma missão (o "!") | a criança fala com `quem` e ouve `dialogo_oferta` |
| `ativa`, passo N | "fazendo o passo N" | o passo N termina (cada tipo de passo sabe quando, abaixo) |
| `feita` | prêmio | o último passo terminou; `ao_concluir` é entregue e o jogo salva |

O save guarda só `{ passo, contadores, concluida }` por missão. Um passo que "volta" (ainda não tem 3 cogumelos,
errou a charada) não muda de estado: a seta de volta no desenho é a missão continuar no mesmo passo, com uma fala
diferente (`dialogo_falta`, `dialogo_errou`).

As setas do diagrama são "quando acontece X". No código, X é quase sempre um **evento**: `pegouItem` conta um
`coletar`, `entregou` fecha um `levar`, chegar perto de um lugar fecha um `ir`, `mundoMudou` destrava um
`oferecer_apos`. É por isso que diagrama de estados e sistema de eventos aparecem juntos na página das crianças.

## O formato

```yaml
id: as-galinhas-nao-comem          # minúsculas e hífens; o nome do arquivo
titulo: "As galinhas não comem"    # aparece na tela de missões
descricao: "As galinhas da dona Maria pararam de comer e não botam mais ovos. Que comida será que elas adoram?"
quem: galinheiro                   # id de quem oferece
dificuldade: media                 # facil | media | dificil
requer: [porco-perdido]            # opcional: missões antes desta
oferecer_apos: ovo_acabou          # opcional: um evento do mundo antes desta (a pista)
dialogo_oferta: galinhas-oferta    # conversa que oferece; a missão começa depois dela
dialogo_andamento: galinhas-andamento   # se falar de novo com quem pediu, no meio
dialogo_feito: galinhas-feito      # depois de feita
passos:
  - tipo: coletar
    texto: "faça 3 rações de galinha na panela: 2 trigos + 1 milho cada"   # a linha "o que fazer agora" do HUD
    item: racao-de-galinha
    qtd: 3
  - tipo: levar
    texto: "leve as 3 rações para a dona Maria, no galinheiro"
    npc: galinheiro
    item: racao-de-galinha
    qtd: 3
    dialogo: galinhas-entrega      # tem as 3: entrega e avança
    dialogo_falta: galinhas-falta  # não tem: fica no mesmo passo
ao_concluir:                       # o motor não conhece; o jogo valida e entrega
  coracoes: 1
  moedas: 3
  mundo: { ovos_por_vez: 3, galinhas_com_fome: false }
```

Diálogo (`dialogos/<id>.yaml`): `personagem`, `retrato`, `falas: [{ quem?, retrato?, texto }]`. Até 2 linhas de
~38 caracteres por fala; `*palavra*` e `_palavra_` ganham cor (no máximo duas cores); a fala nunca avança sozinha.
Sem escolhas: ramificação é por arquivos diferentes escolhidos pelo interpretador (oferta, andamento, falta, feito).

## Tipos de passo

| Tipo | Campos | Termina quando | Do motor? |
|---|---|---|---|
| `ir` | `lugar` (um ou lista, em qualquer ordem), `raio` em metros, `sem_marco?`, `dialogos?` por lugar | a protagonista chega a menos de `raio` m | sim |
| `falar` | `npc`, `dialogo` | a conversa termina | sim |
| `coletar` | `item`, `qtd` | pegou `qtd` desde o começo do passo (evento `pegouItem`) | sim |
| `levar` | `npc`, `item`, `qtd`, `dialogo`, `dialogo_falta` | falou com `npc` tendo `qtd`; os itens saem da mochila | sim |
| `achar` | `objeto`, `lugar`, `raio` | o mundo responde `achou(objeto)` (a bússola aponta o lugar) | sim |
| `responder` | `npc`, `pergunta`, `respostas`, `numerico?`, `dialogo_pergunta`, `dialogo_errou` | a resposta digitada bate com uma das `respostas` | Dragão |
| `domar` | — | a amizade com a criatura fecha (2 visitas com comida e carinho) | Três Ilhas |
| `apagar_incendio` | `incendio`, `lugar`, `raio` | o fogo apaga (sopro de gelo ou vento) | Dragão |
| `levar_voando` | `npc`, `lugar`, `raio`, `dialogo_monta`, `dialogo` | pousou no lugar com o passageiro | Dragão |

Um tipo novo é um `PassoHandler` (`alvo` para a bússola, `update` por passo, `aoFalar` quando conversa, `progresso`
para o "2/3") passado em `passosExtras` de `new Missoes`, mais o formato YAML em `criarMissaoSchema([...])` e uma linha
em `passos_extras` do `jogo.yaml` para o visualizador descrevê-lo. É um `case`, não um sistema novo.

**Repetíveis**: quando as missões escritas acabam rápido demais (aconteceu: a criança terminou todas em poucos dias),
moldes com seed determinística geram `rep-<n>` (`carregarRepetiveis`, `gerarRepetivel`); mesma seed, mesma rotação.

## As cinco missões de exemplo e seus diagramas

| Missão | Jogo | Estados (bolinhas) | Setas | O que ensina |
|---|---|---|---|---|
| Um cobertorzinho para o ovo | Dragão | ovo com frio → nova → levar 2 frutas → feita | falou com a coruja; tem 2 frutas e falou com a pastora; volta: "ainda não tem 2" | o `levar` e o "volta" |
| O mapa do tesouro | Dragão | nova → procurando o X → feita | falou com a tia; abriu o baú (a tiara entra na mochila) | lugar sem marco: a pista é o mapa |
| A charada do vovô | Dragão | nova → charada → conta → feita | acertou; volta: "errou? ganha uma dica e tenta de novo" | passo do jogo (`responder`), loop de erro |
| As galinhas não comem | Três Ilhas | trancada → nova → cozinhar 3 → levar 3 → feita, e o mundo mudou | leu o aviso (evento `ovo_acabou`); fez 3 rações; entregou | missão que começa pelo mundo; mudança permanente |
| Os roncos da caverna | Três Ilhas | nova → subir até a caverna → fazer amizade → feita | chegou perto; 2 visitas com comida e carinho | `ir` e um passo de amizade |

O dragão perigoso da jaula (Dragão) aparece na página como diagrama, mas no código não é missão: é um `Encontro`
(`src/game/encontro.ts`, ruge, barra do E, acalma) mais uma `Amizade` por visitas. Vale mostrar à criança que um
sistema também tem estados, mesmo sem YAML de missão.

## Do papel para o YAML

O formato de desenho que funcionou com a criança (Três Ilhas, versão 8):

- **Caixinhas por tipo, uma cor cada**: pessoa (laranja), lugar (verde), item com número (amarelo), receita (rosa),
  prêmio (azul), estado da missão (roxo, em bolinha), o mundo mudou (verde-água).
- **Setas sempre com verbo ou condição**: "colher 3", "levar", "se tiver 3", "de noite"; volta ("ainda não tem 3?
  volta para a floresta"); escolha = duas setas saindo da mesma bolinha.
- **"NOVO"** escrito em tudo que o jogo ainda não tem (item, bicho, receita): é o que o adulto precisa criar antes.
- **Prêmio no fim** e, se houver, a caixinha "o mundo mudou".

O desenho vira YAML quase linha a linha. O que **sempre falta no papel** e se pergunta antes de codar: a quantidade,
onde a coisa nasce, a fala de entrega, o que acontece se a criança não fizer (a missão fica esperando? o mundo
continua quebrado?). A página tem um modelo para imprimir (seção "Agora desenhe a sua missão").

## A linguagem visual (vale para papel, página, jogo e visualizador)

Funcionou bem com as crianças e com o Paulo, e é para usar sempre:

- **Cada tipo de coisa tem uma cor**: pessoa laranja, lugar verde, item amarelo, receita rosa, prêmio azul, estado
  roxo, o mundo mudou verde-água, evento vermelho-rosado. A cor aparece no **fundo do balão** (chips) ou numa
  **faixa no canto do cartão**, e é a mesma no papel, na [página](../index.html) e no visualizador.
- **Um emoji diz o que a coisa é antes de ler**: 🧑 pessoa, 📍 lugar, 🍎 item, 🍲 receita, 🎁 prêmio, 🌍 o mundo
  mudou, 📣 evento, ❗ missão nova, ⭐ feita, ↺ volta. Uma criança de 8 anos lê o diagrama pelos ícones.
- **Não deixar tudo igual**: dentro do mesmo tipo, troque o emoji pelo da coisa de verdade (🦉 a coruja, 🧶 a
  pastora, 🐔 o galinheiro, ⛰️ a caverna) e mantenha a cor. A cor diz o tipo; o emoji diz qual.

## Testes que pagam

- Um `registro.test` cruza todo id citado (missão → pessoa, item, diálogo, lugar, recompensa) com os catálogos.
  Erro de digitação quebra o `npm test`.
- Um teste exige uma fonte para todo item bloqueado (loja, prêmio de missão, baú): item que ninguém dá nunca fica sem dica.
- O bloco de browser da missão a percorre inteira por teleporte ([testes.md](testes.md)).
- `visualizador/scripts/missoes-md.ts` gera a tabela das missões em Markdown para o adulto rabiscar as próximas.
