# Testes: vitest para a lógica, Chromium headless para o resto

Para o agente que vai garantir que a versão nova não quebrou nada antes de a criança abrir. A criança é a pior
pessoa para achar bug: ela trava, perde a vontade e não sabe dizer o que aconteceu. Os dois jogos daqui terminaram com
centenas de testes de lógica e quase 200 checagens de browser em blocos (Três Ilhas, versão 8), e todo bug sério das
últimas versões foi achado por um teste, não por ela.

## Duas camadas

| Camada | Ferramenta | O que cobre | Tempo |
|---|---|---|---|
| Lógica | vitest + happy-dom (`npm test` aqui: 283 testes) | store e save (migrar, sanear, goldens), missões, catálogos cruzados, steering, histerese, cutscene pulada = mesmo estado final, edições do MDM editor | segundos |
| Browser | Playwright no Chromium real, **headless** (`channel: "chromium"`) | o jogo inteiro: câmera, colisão, diálogo que abre, missão de ponta a ponta, fps, música | minutos |

Tudo que precisa de GPU vai para a segunda. Toda regra de jogo que dá para tirar do loop vira função pura testada
na primeira.

## Por que teleportar em vez de jogar

Um teste que joga de verdade (andar até a vila, pegar 3 frutas, voltar) leva minutos, falha por um pé preso numa pedra
e não diz o que quebrou. O jogo expõe `window.<jogo>` com ajudantes de teste e o teste **pula para o estado que quer
verificar**:

- `teleport(lugar)` e `pertoDe(npc)`: a protagonista aparece onde o passo acontece.
- `darItem(id, n)`, `hora(h)`, `fazerMissao(id)`: o estado chega pronto, pelas ações do store (nunca `setState` cru,
  que pula a validação).
- **Fixtures de save** (`fixtures/*.json`): cada bloco abre de um save conhecido, gravado no localStorage por
  `page.addInitScript` antes do `goto`. Os fixtures são validados por vitest com o mesmo `migrar` + schema do jogo.

O que se joga de verdade é o trecho que se quer provar: apertar E perto da pessoa, segurar a tecla, andar pela porta.

## Testes em blocos

```
scripts/testar/
  nucleo.mjs        o kit: abrir o browser, T(fn) = page.evaluate, check(nome, ok, detalhe), tap, wait
  ajudantes.mjs     rotinas: teleport, pertoDe, conversarCom, avancarDialogo, colherEm, status(missao)
  fixtures/*.json   saves de partida ("depois-da-abertura", "jaula-alimentado"...)
  blocos/<nome>.mjs { nome, descricao, fixture, rodar(t) }
scripts/testar-<jogo>.mjs   o runner, ~70 linhas: --so bloco, relatório JSON
```

Trecho real de um bloco (Três Ilhas, a missão "As galinhas não comem"):

```js
export default {
  nome: "galinhas",
  descricao: "a missão de ponta a ponta: os ovos acabam, o aviso, a dona Maria, 3 rações, entrega, 3 ovos",
  fixture: "depois-da-abertura",
  async rodar(t) {
    let g = await galinheiro(t);
    t.check("no começo, 2 ovos no galinheiro e nenhum aviso", g.ovos === 2 && !g.aviso, g);
    await colherEm(t, "ovo", "ovo");
    await colherEm(t, "ovo", "ovo");
    g = await galinheiro(t);
    t.check("a dica da primeira vez e o aviso na cerca aparecem", g.aviso && g.dicas.includes("sem-ovos"), g);
    t.check("antes de ler o aviso a missão está bloqueada", (await status(t, MISSAO)) === "bloqueada");
    // ... lê o aviso, conversa, cozinha, entrega, confere ovos_por_vez === 3
  },
};
```

Cada `check` tem uma frase em português que diz o que deveria ser verdade: o relatório se lê como uma lista do que o
jogo promete. Cada bloco recarrega da própria fixture, então nada vaza de um bloco para outro e `--so galinhas` roda
em segundos enquanto se trabalha nela.

## Regras que custaram caro

- **Headless sempre**. O Chromium novo headless tem GPU e pointer lock; janela aberta rouba o foco de quem está no
  computador. O painel de browser de um app de agente roda a página em segundo plano: fps de lá não valem.
- **Um Chromium de teste por vez** por máquina: dois com GPU ao mesmo tempo dão falhas fantasma (fps, altitude,
  diálogo que não abre).
- **Não editar `src/` com o teste rodando**: o Vite recarrega e mata o teste. Para comparar com o estado anterior,
  `git show HEAD:arquivo > /tmp/antes.ts`, nunca `git stash`.
- **Esperar condição, não tempo**: `waitForFunction(() => telas.aberta === "novidades")` em vez de `wait(3000)`;
  depois de um pulo de escalada, esperar `grounded`.
- **Andar no teste = apontar a câmera**: no chão o W segue a órbita da câmera, não o rumo do corpo.
- **O áudio só começa no primeiro gesto**: teste de música clica antes de medir.
- **Falha "instável" que se repete com a mesma assinatura é bug.** A "instabilidade" de um diálogo que às vezes não
  abria era um toque de E perdido num quadro sem passo de simulação (resolvido com `PressLatch`, `src/core/press.ts`).
- **Teste de regressão carrega o save com a coisa já aberta e anda por ela.** Um bug de porta ficou duas versões
  escondido porque os testes abriam a porta no próprio teste; o save real carregava depois de quem lia o estado.

## No 2D

Os esboços 2D ([2d-pixel-art.md](2d-pixel-art.md)) seguem as mesmas duas camadas: vitest para o mapa em texto, o
YAML do 3D e as missões passo a passo; Chromium headless em blocos independentes (14 blocos e 78 checagens num, 20
blocos e 210 checagens no outro). Diferenças que valem anotar:

- **Teclas de verdade para andar.** Em grade, andar é barato e determinístico: o teste aperta as setas e confere o
  tile de chegada. O estado (save, mochila, missão) é preparado pela cena exposta em `window.jogo`.
- **Regressão de input com fases.** O passo a mais ao soltar a seta só aparecia quando a tecla subia no fim de um
  passo; o teste solta em 16 fases do passo, inclusive logo depois de um auto-repeat.
- **Falha que se explica**: o bloco para na primeira checagem errada, grava um diagnóstico em texto e uma captura e
  imprime o comando para rodar só ele (`--so voo`).
- **O teste nunca visita nem fotografa o que é privado da família**, e as capturas que vão para docs públicos saem do
  build publicado, não da pasta de trabalho.

## Capturas

`scripts/capturar.mjs` de cada jogo abre a página headless, roda um trecho contra `window.<jogo>`, espera e salva um
PNG (`--js`, `--wait`, `--keys`, `--size`). Capturas datadas em `docs/capturas/AAAA-MM-DD-<tema>-*.png` antes de cada
publicação servem para o adulto e para a criança compararem versões. As imagens da página das crianças deste
repositório saíram assim.

O MDM tem o seu (`npm run capturar -- --jogo PASTA`): abre o grafo, liga o modo de edição e confere 23 coisas.
