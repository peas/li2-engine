# AGENTS.md: como ajudar uma família a fazer o próprio jogo

Você é um agente (Claude Code, Codex, Cursor ou outro) e alguém pediu ajuda para fazer um jogo com uma criança. Este
repositório é o que aprendemos fazendo dois jogos 3D de browser com duas meninas, Elisa (o Dragão) e Olivia
(As Três Ilhas), em outubro de 2026, e depois um esboço 2D em pixel art de cada um: um motor em three.js + TypeScript,
o processo com elas, as pesquisas que decidiram cada escolha e uma página que ensina à criança o que é uma missão, um
diagrama de estados e um sistema de eventos.

**O valor está nos docs e nos exemplos, não no motor como dependência.** Leia o que serve, copie as peças que fizerem
sentido e adapte ao jogo da família.

Os jogos, todos em <https://paulo.com.br/jogos/>: em 3D, <https://paulo.com.br/dragao/> e
<https://paulo.com.br/tresilhas/>; em 2D, <https://paulo.com.br/dragao2d/> e <https://paulo.com.br/tresilhas2d/>.
A página para a criança: <https://peas.github.io/li2-engine/> (fonte em `docs/index.html`).

## Por onde começar

1. Leia [docs/agentes/co-criacao.md](docs/agentes/co-criacao.md) inteiro **antes de escrever código**. O gargalo
   não é programar: é a atenção da criança para testar, e o ritual de versões que a mantém dona do jogo.
2. Mostre a [página das crianças](https://peas.github.io/li2-engine/) para a criança e o adulto juntos. Ela termina
   com um modelo de missão para desenhar no papel; o desenho vira o primeiro YAML.
3. Decida 2D ou 3D com o adulto ([2d-pixel-art.md](docs/agentes/2d-pixel-art.md), [engines.md](docs/agentes/engines.md)).
   Para uma família começando, 2D com sprites é mais barato e a criança consegue desenhar os personagens. Os dois
   esboços 2D daqui (Phaser + GridEngine, com as mesmas missões em YAML dos jogos 3D) são o exemplo concreto.
4. Monte o esqueleto com [arquitetura.md](docs/agentes/arquitetura.md): manifesto `jogo.yaml`, conteúdo em YAML,
   um store só, eventos, sistemas.
5. A primeira missão em [missoes-como-dados.md](docs/agentes/missoes-como-dados.md), com o diagrama ao lado.
6. Antes de mostrar à criança: [polimento.md](docs/agentes/polimento.md) e [testes.md](docs/agentes/testes.md).

## Os documentos

| Arquivo | Para quê |
|---|---|
| [co-criacao.md](docs/agentes/co-criacao.md) | o processo com a criança: canais (conversa, desenho, vídeo, áudio), ritual de versões, perguntas, classificar pedidos, roteiro de sessão |
| [o-que-as-criancas-pedem.md](docs/agentes/o-que-as-criancas-pedem.md) | padrões do que elas pediram (colecionar, cuidar, domar, casinha, roupas, filhotes, segredos, praia) e o que não funcionou |
| [ideias-de-jogos.md](docs/agentes/ideias-de-jogos.md) | mecânicas e tipos de missão que funcionam para 8 a 10 anos, sementes de jogo novo |
| [arquitetura.md](docs/agentes/arquitetura.md) | o motor, a fronteira motor × jogo, store em fatias, eventos, sistemas, como um jogo novo nasce |
| [missoes-como-dados.md](docs/agentes/missoes-como-dados.md) | o formato YAML das missões, tipos de passo, estados, do papel para o YAML |
| [testes.md](docs/agentes/testes.md) | vitest + Playwright headless em blocos, fixtures, por que teleportar em vez de jogar |
| [licoes-tecnicas.md](docs/agentes/licoes-tecnicas.md) | câmera, mouse, passo fixo, terreno, colisão, animação: o que foi medido |
| [bibliotecas.md](docs/agentes/bibliotecas.md) | bibliotecas vivas por necessidade, e o que não usar |
| [engines.md](docs/agentes/engines.md) | ficar em three.js ou migrar (Babylon, Godot, Unity), com gatilhos |
| [2d-pixel-art.md](docs/agentes/2d-pixel-art.md) | os dois esboços 2D publicados: a pilha (Phaser + GridEngine + TypeScript + Vite + Zod), o mesmo YAML do 3D, mapa em texto com Wang tiles, arte gerada por IA com contrato, roupas e cores em pixel art, testes, e como publicar um jogo com segredos da família sem vazar; alternativas, sprite sheets, Aseprite, PixelLab |
| [modelos-3d.md](docs/agentes/modelos-3d.md) | Quaternius, KayKit, Kenney, Mixamo, geradores por IA, o contrato do .glb |
| [vozes-e-musica.md](docs/agentes/vozes-e-musica.md) | Piper, Kokoro, Web Speech, música CC BY, efeitos |
| [cutscenes.md](docs/agentes/cutscenes.md) | cutscene pulável com roteiro em YAML |
| [polimento.md](docs/agentes/polimento.md) | game feel para criança: o checklist, os 15 de maior retorno, o que não fazer |
| [pesquisa-mdm-editor.md](docs/agentes/pesquisa-mdm-editor.md) | o MDM editor: painel à la Visual Basic, YAML com round-trip fiel, autocompletar, que biblioteca usar, e como ensinar programação com ele |
| [visualizador/docs/IDEIAS.md](visualizador/docs/IDEIAS.md) | próximos passos do MDM |
| [AUDITORIA.md](docs/agentes/AUDITORIA.md) | a auditoria de privacidade feita antes de publicar este repositório |

## Regras que valem para qualquer jogo com criança

1. **Planejar com a criança antes de codar.** Nomes, lugares e personagens definitivos vêm dela.
2. **Uma novidade grande por versão**, o resto é polimento. Bug que ela viu entra antes de qualquer novidade.
3. **"versão N" sempre visível num canto da tela.** Todo feedback (vídeo, desenho, frase) é anotado com a versão.
4. **Sem sangue, sem morte da protagonista, sem game over** por padrão. Perigo vira susto, empurrão, fome; o bicho
   vencido "apaga" em partículas. Se a família quiser batalhas, que não sejam violentas.
5. **Tudo que existe é explicado dentro do jogo**: barra de teclas do lugar, dica na primeira vez, "ainda não pode"
   com o motivo, tela de ajuda, novidades da versão contadas por um personagem.
6. **Tempo sempre visível; nada acontece em silêncio.** Cada coisa que espera mostra quanto falta.
7. **Conteúdo em dados** (YAML + schema), nunca em código. Mais missões é YAML; sistema novo só quando o dado não basta.
8. **A criança é autora**: nome dela nos créditos e em cada ideia ("ideia da Olivia, 24/10"), e ela pode editar o
   conteúdo (o **MDM**, Mapa de Dependência de Missões, em `visualizador/`, tem o **MDM editor**).
9. **Verificar no browser, não só compilar**: Chromium headless, capturas datadas.
10. **Privacidade**: vídeos, áudios, desenhos, transcrições e respostas da criança ficam fora do git (`local/` no
    `.gitignore`); no repositório só a análise. Nunca o rosto, a voz ou a letra dela num commit ou num site. Se o jogo
    tiver um segredo da família (um lugar ou gente de verdade), ele é um módulo opcional em `local/` e o site recebe
    só um build feito de uma cópia limpa do commit e auditado ([2d-pixel-art.md](docs/agentes/2d-pixel-art.md),
    "Publicar um jogo com segredos da família").
11. **Modelos e músicas de terceiros sempre com licença** num `LICENCAS.md` ao lado.
12. **Sem over-engineering**: o jogo é pequeno. ECS, injeção de dependência genérica e Lua embutido sobram.

## Rodar o que está aqui

```bash
npm install && npm test && npm run typecheck          # o motor: 283 testes de lógica
cd visualizador && npm install
npm run dev -- --jogo ../exemplos/missoes-dos-jogos   # o grafo das missões de exemplo em http://localhost:5190/
```

`scripts/publicar-visualizador.sh` gera a cópia do MDM que a
página publica em `docs/mdm/`.

## Este repositório é o motor de verdade (e é público)

Os dois jogos daqui (o Dragão e As Três Ilhas, em repositórios privados) usam este motor como fonte TypeScript, por
`"li2-engine": "file:../li2-engine"`. Mexer em `src/` recarrega os dev servers deles; depois de mudar o motor, rode os
testes dos dois jogos, não só os daqui. E como o repositório é público, antes de cada commit: nenhum caminho da
máquina, nenhum nome de pessoa real além de Paulo, Olivia e Elisa, nada de material das crianças (vídeo, áudio,
desenho, transcrição), nada que seja só de um jogo (conteúdo, personagens, lugares ficam no repositório do jogo).

Os esboços 2D não usam este motor: cada um é um app Phaser numa pasta `esboco-2d/` do repositório do jogo, que lê os
YAML do jogo 3D validando com uma cópia enxuta dos schemas daqui (mesmos campos, mesmos ids). Mudar o formato do
conteúdo aqui pede mudar essa cópia; rode os testes deles também.

## Convenções deste repositório

Docs e conteúdo em português; código, identificadores do motor em português ou inglês como estão, commits em inglês.
Ao contribuir aqui, siga o mesmo cuidado de privacidade da auditoria: nada pessoal de criança nenhuma.
