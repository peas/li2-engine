# Auditoria de privacidade antes da publicação

Data: 24/10/2026. Auditor independente (agente), a pedido do Paulo, antes de tornar o repositório público e ligar o
GitHub Pages em `docs/`. Este arquivo descreve os achados **sem repetir o conteúdo sensível**: onde há um caminho, nome,
endereço ou palavra proibida, ele é descrito pelo tipo, não copiado.

## Escopo e método

- **Arquivos**: os 308 arquivos rastreados (`git ls-files`) e o estado da árvore (`git status --short --ignored`: nada
  rastreável fora do git; só `.claude/` e `visualizador/dist-missoes-dos-jogos/` ignorados, fora do push).
- **Lidos inteiros**: `AGENTS.md`, `README.md`, `CLAUDE.md`, `LICENCAS.md`, `LICENSE`, `LICENSE-DOCS.md`,
  `package.json` (raiz e visualizador), os 14 guias de `docs/agentes/`, `docs/index.html`, `docs/visualizador/index.html`,
  `exemplos/missoes-dos-jogos/**` (manifesto, catálogos, 5 missões, 26 diálogos, `lugares.ts`), `src/cutscene/README.md`,
  `visualizador/docs/IDEIAS.md`, `scripts/exportar-do-motor.sh`, `scripts/publicar-visualizador.sh`,
  `docs/img/capturas.json`.
- **Código** (`src/`, `visualizador/`, `scripts/`): grep amplo por caminhos (`/Users/`, `/home/`, `~/`, `$HOME`,
  `homedir`), nomes próprios (lista de todas as palavras capitalizadas do código, cada uma conferida), e-mails, telefones,
  CEP, CPF, tokens e chaves, URLs, palavras da lista proibida; leitura dos comentários que citam pessoas, lugares ou
  caminhos. Lockfiles: só `registry.npmjs.org`, sem caminho local.
- **Bundle** `docs/visualizador/assets/*.js`: grep por caminhos absolutos, nomes, URLs e palavras proibidas. A pasta do
  jogo aparece como caminho relativo; nenhum caminho de máquina; os comentários dos YAML não entram no bundle.
- **Imagens**: as **40** imagens `.webp` abertas e olhadas uma a uma (HUD, caixas de diálogo, placas, paredes, retratos,
  minimapa, bússola, listas de missões, grafos). Uma pintura de parede de caverna foi ampliada e conferida no código do
  jogo (desenhada por código, não é desenho de criança). Metadados: `magick identify -verbose` e inspeção dos chunks
  RIFF: todas são WebP simples (VP8), sem chunk EXIF/XMP, sem GPS, sem nome, sem caminho.
- **Histórico**: `git log -p --all` (6 commits, um branch, sem tags, sem stash, sem objetos soltos, sem remoto). Versões
  antigas dos arquivos modificados conferidas: nada sensível foi apagado no caminho. Metadados dos commits conferidos.
- **Links externos**: todos os links da página, do README e do AGENTS.md foram abertos (`curl`), e os bundles JS das
  três páginas vivas do blog para onde eles apontam foram baixados e varridos com os mesmos padrões.

## Achados

### 1. Palavras proibidas e descrição do módulo privado no script de exportação

- **Severidade**: bloqueia publicação.
- **Onde**: `scripts/exportar-do-motor.sh`, linhas 36 e 131 (duas palavras da lista proibida 7, escritas por extenso
  como padrões de varredura); linhas 4-5, 22, 28, 34, 64, 86, 92-95, 102, 121-122
  (descrevem o módulo privado excluído: o que ele contém e por que ficou de fora); linha 28 (diz que um modelo de
  teste deixado de fora tem origem pessoal).
- **Também no histórico**: o arquivo entrou no commit `7e213fd`; apagar só no último commit não basta.
- **Correção sugerida**: tirar a lista de padrões proibidos do arquivo versionado (ler de um arquivo em `local/`, fora
  do git) e reescrever o texto de ajuda sem descrever o que ficou de fora; depois refazer o histórico antes do primeiro
  push (o repositório ainda não tem remoto).
- status: corrigido

### 2. Caminhos de máquina no script de exportação

- **Severidade**: corrigir.
- **Onde**: `scripts/exportar-do-motor.sh`, linhas 2, 12, 16 e 40 (a pasta privada de trabalho do motor, na home); linhas
  96-98 (a pasta do blog na home, como origem do Playwright); linhas 36 e 131 (o prefixo de home do macOS e a pasta do
  blog como padrões); linha 2 (o nome do pacote privado de origem).
- **Correção sugerida**: some junto com o achado 1 se o script deixar de citar a origem; senão, padrão sem home
  (`--origem` obrigatório).
- status: corrigido

### 3. Caminhos de máquina no visualizador

- **Severidade**: corrigir (baixo risco: os nomes das pastas são os mesmos dos jogos publicados, mas revelam o layout da
  home e o default só funciona naquela máquina).
- **Onde** (caminho da pasta de um dos jogos na home do usuário, em ajuda, comentário, mensagem de erro ou default):
  - `visualizador/scripts/rodar.mjs`, linhas 2, 18, 21, 22, 27;
  - `visualizador/scripts/aplicar-edicoes.mjs`, linha 20 (ajuda) e linha 33 (default: a pasta do jogo dentro da home);
  - `visualizador/scripts/missoes-md.ts`, linha 6;
  - `visualizador/src/carregador/ler.ts`, linha 2;
  - `visualizador/vite.config.ts`, linha 13;
  - `visualizador/src/carregador/carregador.test.ts`, linhas 364-365 (teste que lê os dois jogos na home "deste Mac").
- **Correção sugerida**: exemplos com `../meu-jogo` ou `exemplos/missoes-dos-jogos`; o teste dos jogos reais só pela
  variável `JOGO`.
- status: corrigido

### 4. E-mail nos metadados dos commits

- **Severidade**: corrigir.
- **Onde**: autor e committer dos 6 commits (`git log --format='%ae %ce'`): um e-mail corporativo do Paulo. No push ele
  fica público em cada commit.
- **Correção sugerida**: refazer o histórico com o e-mail `noreply` do GitHub (o mesmo passo do achado 1), ou aceitar
  conscientemente.
- status: aceito

### 5. Links da página e do README levam a páginas vivas com material proibido

- **Severidade**: corrigir antes de publicar (fora do repositório, alta prioridade). O repositório em si não contém o
  material; os links é que o tornam fácil de achar.
- **Onde**:
  - `docs/index.html`, linha 303: link para o mapa das missões das Três Ilhas no blog. O bundle JS dessa página contém um
    caminho absoluto da máquina (a pasta do jogo na home) e o nome de lugar da lista proibida 7 (lugar e textos).
  - `docs/index.html`, linha 198; `README.md`, linhas 12 e 44; `AGENTS.md`, linha 12: link para o jogo das Três Ilhas no
    blog. O bundle JS do jogo contém o módulo privado que foi excluído deste repositório (construção, letreiro com o
    nome proibido e as falas dele).
  - O link para o Dragão (mesmos arquivos) foi varrido e está limpo.
- **Correção sugerida**: republicar o mapa com a mesma troca de caminho que `scripts/publicar-visualizador.sh` faz, e
  decidir se o módulo privado sai do build público das Três Ilhas; ou tirar esses links até lá.
- status: corrigido em parte

### 6. Nomes de moradores escolhidos pela criança

- **Severidade**: aceitável, a confirmar.
- **Onde**: imagens `docs/img/missoes/galinhas/7-o-mundo-mudou.webp` (tela de ajuda) e
  `docs/img/visualizador/tresilhas-grafo.webp`, `tresilhas-o-mundo-mudou.webp` (grafo), além do bundle do visualizador
  e dos exemplos.
- **O que é**: além dos nomes autorizados, aparecem outros moradores fictícios das Três Ilhas: a dona da mercearia, o
  criador de porcos, e os moradores provisórios inventados pelo adulto. Os registros do jogo dizem que dois deles foram
  batizados pela criança, junto com dona Maria e Marcel (já autorizados); os demais são "nomes nossos e provisórios".
  Nada indica pessoa real, mas vale o Paulo confirmar os dois batizados por ela.
- status: aceito

### 7. Idades das meninas

- **Severidade**: aceitável.
- **Onde**: `docs/agentes/co-criacao.md`, linhas 4-5 (as duas idades, logo depois dos nomes); `docs/agentes/
  co-criacao.md`, linhas 79-81 ("a mais velha", "a mais nova").
- **Por quê**: idade ligada só à autoria dos jogos, sem detalhe íntimo (escola, saúde, rotina). Se o Paulo preferir,
  "8 a 10 anos" sem ordem resolve.
- status: corrigido

### 8. Citações curtas das crianças

- **Severidade**: aceitável.
- **Onde**: `docs/agentes/co-criacao.md`, linha 20; `docs/agentes/o-que-as-criancas-pedem.md`, linhas 159 e 169.
- **Por quê**: três frases de 4 a 6 palavras sobre o escopo do jogo, sem transcrição, sem detalhe pessoal.
- status: aceito

### 9. A técnica da página 2D de teste

- **Severidade**: aceitável.
- **Onde**: `docs/agentes/2d-pixel-art.md`, seções "Sprite sheets", "A técnica da página 2D de teste em canvas" e
  "Fontes" (linhas 25-30, 100-122, 222-224, 230).
- **Por quê**: descreve só a técnica (grade de quadros, ciclos por estado, fumaça em pixel, som sintetizado, cenário
  com double buffer, acessibilidade), sem tema, personagens, textos ou imagens da página. Pequenas pistas indiretas
  (o título da pesquisa sobre pixel art de pessoas a partir de fotos, linha 222; o aviso sobre "foto pessoal e íntima",
  linha 68) não revelam o conteúdo; podem ser generalizadas se o Paulo quiser.
- status: corrigido

### 10. Ideia de gravar a voz da criança pelo visualizador

- **Severidade**: aceitável (é um plano, não há áudio).
- **Onde**: `visualizador/docs/IDEIAS.md`, linhas 12-13.
- **Observação**: se a ideia for implementada, o JSON exportado passa a carregar a voz da criança; ele não pode entrar
  no git (regra 10 do AGENTS.md). Vale anotar isso na própria ideia.
- status: aceito

### 11. Itens conferidos e aceitáveis

- `docs/agentes/vozes-e-musica.md`, linha 65, e `scripts/gerar-vozes.mjs`, linha 25: caminho genérico de exemplo
  ("meu jogo" na home), não é pasta real.
- `scripts/publicar-visualizador.sh`, linhas 18, 39 e 41: os prefixos de home aparecem como padrão de varredura, não
  como caminho.
- `scripts/kokoro-fala.py`, linhas 10 e 22-24: caminhos padrão do Homebrew, iguais em qualquer Mac.
- `src/audio/base.test.ts`, linhas 17-20: domínio público de mídia do blog, num teste.
- `docs/agentes/engines.md` e `licoes-tecnicas.md`: o modelo do computador usado nas medições (chip e tipo de máquina).
  Dado de hardware, não pessoal.
- `docs/agentes/modelos-3d.md`, linhas 78-80: um teste de geração 3D "com uma imagem de referência"; não diz de quem é
  a referência nem publica a imagem.
- Nomes em testes do código (uma dúzia de nomes curtos de NPC genéricos, uma "Dona Rosa" de mercearia, "Fofo"): dados
  de teste inventados.
- Autores públicos citados (Paul Kellet, Kay Lousberg, Quaternius, Kevin MacLeod, autores de talks e livros) e vozes
  do sistema do macOS: exceção prevista.
- Imagens: nenhuma mostra rosto, mão, desenho escaneado ou foto real; os retratos dos NPCs são ilustrações do jogo; as
  pinturas da caverna são desenhadas por código; o mapa do tesouro é desenho vetorial do jogo; a etiqueta de versão
  e a data no canto são do jogo.
- Chaves, tokens, segredos, e-mails, telefones, CEP, CPF, endereço: nenhum no conteúdo dos arquivos nem no bundle.

## Status

Preenchido em 24/10/2026, depois das correções e antes do primeiro push:

| # | Achado | Status | O que foi feito |
|---|---|---|---|
| 1 | palavras proibidas e módulo privado no script de exportação (e no histórico) | corrigido | o script saiu do repositório (fica só na cópia local, fora do git) e o histórico foi refeito sem ele antes do primeiro push; com a migração dos jogos para este repositório ele fica obsoleto |
| 2 | caminhos de máquina no script de exportação | corrigido | idem: o script não está mais no repositório nem no histórico |
| 3 | caminhos de máquina no visualizador | corrigido | exemplos de pasta trocados por `../meu-jogo`; o teste do carregador usa `exemplos/missoes-dos-jogos` (e `JOGO` se definido); o build do visualizador não embute mais a pasta absoluta do jogo (`visualizador/vite.config.ts`) |
| 4 | e-mail nos metadados dos commits | aceito | o mesmo e-mail já é público nos commits de outros repositórios públicos do Paulo; não há exposição nova |
| 5 | links para páginas vivas com material proibido | corrigido em parte | o link para o mapa publicado das Três Ilhas saiu da página (o bundle de lá ainda tem um caminho de máquina; a correção do `vite.config.ts` acima resolve na próxima publicação do mapa). Os links para os jogos ficam: o jogo das Três Ilhas, com o café, foi publicado pelo próprio Paulo no site dele, e o link não publica nada novo |
| 6 | nomes de moradores batizados pela criança | aceito | o Paulo confirmou em 24/10/2026 que os nomes dos moradores podem aparecer, sempre com o papel de cada um |
| 7 | idades das meninas | corrigido | "crianças de 8 e 10 anos" virou "crianças entre 8 e 10 anos", sem ligar idade a nome |
| 8 | citações curtas das crianças | aceito | três frases curtas, só sobre o jogo |
| 9 | técnica da página 2D | corrigido | a pista indireta (foto de pessoa real, título da pesquisa) foi generalizada; só a técnica ficou |
| 10 | ideia de gravar a voz da criança | aceito | é um plano, sem áudio; se um dia existir, o áudio fica fora do git como os outros materiais da criança |
