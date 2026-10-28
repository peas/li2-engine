# Co-criação com a criança

Este é o playbook para quando você, agente, ajuda uma família a fazer o jogo de uma criança de 7 a 12 anos. Ele vem
de dois jogos feitos pelo Paulo com as filhas (o Dragão, da Elisa, e As Três Ilhas, da Olivia, crianças entre 8 e 10
anos) e da pesquisa de co-criação que acompanhou os dois. Use para decidir como ouvir a criança, o que construir
agora, o que guardar e como mostrar a ela que a ideia foi levada a sério. A parte técnica fica em
[arquitetura.md](arquitetura.md) e [missoes-como-dados.md](missoes-como-dados.md).

## O achado que muda tudo

A literatura de co-design com crianças foi escrita num mundo em que construir era o gargalo. Com um agente fazendo
uma versão por dia, o gargalo inverte. O recurso escasso passa a ser:

1. a **atenção da criança** para testar com calma;
2. o **acabamento** do que já existe;
3. a **revisão do adulto**.

Medido no Dragão: o plano estimava uns dois meses até a quarta fase, e ela saiu em cinco dias. A criança terminou
todas as missões em minutos e pediu mais. Sem freio de propósito, o ciclo vira esteira de novidade: cada versão
fica mais larga e mais rasa. A própria criança percebe: "não pode ser muita coisa". Seu trabalho é segurar o ritmo,
não acelerar.

## Os papéis

Allison Druin descreve quatro papéis da criança em design: usuária, testadora, informante e parceira. Nenhum serve
para tudo. Separe dois momentos:

- **testadora**: ela joga, o adulto observa e não conversa;
- **parceira**: ela inventa junto, no papel, sem filtro.

No estudo de co-design com famílias (Yip et al., CHI 2016), as crianças viraram parceiras rápido; quem demorou foram
os pais, presos ao papel de "gerente" ou "advogado" da criança. O risco aqui é o adulto agir como gerente de produto
(filtra, decide, entrega) e a criança virar cliente. Você é um terceiro que nunca discorda dela: lembre o adulto de
inventar junto também.

## Canais de entrada (do mais rico ao mais pontual)

| Canal | Quando | Como usar |
|---|---|---|
| **Conversa de rodada 0** | antes de qualquer código | Lista de perguntas lida em voz alta pelo adulto, conversa e não formulário. Marque com ★ as que mudam o que se constrói primeiro (protagonista, poder, casa, mapa, onde joga, que jogos ela gosta). Inclua perguntas para o adulto: aparelho, controle, repo público ou privado, como ela vai dar retorno. |
| **Vídeo dela explicando desenhos** | começo e a cada ideia grande | O canal mais rico. Transcreva (Whisper com `--condition-on-previous-text False --word-timestamps True --hallucination-silence-threshold 2`), tire um quadro a cada 3 s e **corrija a transcrição pelo que está escrito no papel**: palavras do mapa saem trocadas. Marque `[?]` na dúvida. |
| **Áudio curto com dúvidas** | quando há 5 a 8 perguntas que travam a próxima versão | O adulto faz as perguntas em voz alta e grava. No Dragão voltou respondido numa noite. Faça as perguntas de decisão antes de ela jogar e as de reação depois. |
| **Página de perguntas** | rodadas numeradas, perguntas menores | Responder desenhando, escrevendo ou com foto; um botão "Mandar para o papai" exporta um JSON. As respostas ficam só no navegador até exportar. Não force: é complemento. |
| **Desenho de missão no papel** | quando ela já entende o que é missão | Ensine o formato (abaixo) numa página impressa. O desenho vira dados quase direto. Pergunte só o que faltou no papel. |
| **Vídeo depois de jogar** | depois de cada versão | A rodada mais útil: pedidos concretos sobre o que ela acabou de ver. De preferência no dia seguinte, quando as ideias decantam e o vídeo fica menos "lista de compras". |

### O formato de desenho de missão

Uma missão é uma história com estados: começa **nova**, fica **aceita**, cada **passo** é uma coisa que ela faz, e no
fim fica **concluída** e dá o **prêmio**. Às vezes **o mundo muda** para sempre. Ensine assim:

- **Caixinhas com uma cor por tipo**: pessoa (quem pede, com a fala numa nuvem em cima), lugar (onde a coisa nasce
  ou aonde ir), item (sempre com o número), receita (ingredientes viram prato), prêmio, estado (bolinha) e "o mundo
  mudou" (o que fica diferente depois).
- **Setas sempre com um verbo ou uma condição**: "falar", "colher 3", "levar", "achar", "ir"; "se tiver 3", "de
  noite".
- **Volta (loop)**: "ainda não tem 3? volta para a floresta". **Escolha**: duas setas saindo da mesma bolinha.
- **"NOVO"** escrito em tudo que o jogo ainda não tem (item, bicho, receita): o adulto precisa criar antes.
- Para a criança menor: três caixinhas e um prêmio já é uma missão.

Mostre na mesma página como o desenho vira texto no jogo (cada caixinha vira uma linha de YAML). É aqui que ela
aprende diagrama de estados sem ouvir o nome. Nas Três Ilhas, a primeira folha que ela desenhou já tinha setas com
verbos e prêmio no fim; com o formato, as duas missões entraram na versão seguinte com três perguntas de
complemento cada.

## O ritual de versões

1. **Etiqueta "versão N" sempre visível na tela.** O número é o da entrada de novidades (só cresce), não o do
   `package.json`. Todo retorno é anotado com a versão: "jogou a versão 6, pediu X → versão 7".
2. **Uma novidade grande por versão + polimento** do que já existia. Orçamento: 1 grande e até 3 pequenas.
3. **Nada novo entra enquanto houver bug que ela viu.** O bug dela vai na frente de qualquer novidade.
4. **Novidades contadas dentro do jogo** por um personagem (a coruja no Dragão), na primeira abertura da versão
   nova, com o nome dela e o que ela pediu. Uma tecla reabre a lista.
5. **A cada 3 versões, uma versão "brilho"**: só som, resposta visual, bugs, suavidade. Anuncie como presente ("hoje
   o jogo ficou mais gostoso"). Nas Três Ilhas, a versão brilho achou dois bugs reais que ninguém tinha visto.
6. **Dia de estreia**: a pesquisa propõe versão nova só em dias fixos (duas por semana por criança) e nada mostrado
   entre eles. Nos dois jogos as versões saíram quase diárias; o que segurou o escopo foi o item 2. Se a criança
   começar a consumir em minutos, proponha os dias fixos ao adulto.
7. A próxima novidade grande é **escolhida por ela entre 3** que o adulto pré-seleciona. A mais velha pode ver o
   orçamento e gastar (é como ela aprende escopo); para a mais nova, o orçamento fica com o adulto.

## Perguntas curtas e objetivas

Sugestionabilidade cai perto dos 8 a 9 anos, mas não some. Sim/não gera resposta curta e aumenta o chute. Escala de
carinhas dá nota máxima quase sempre (efeito teto, Read e MacFarlane). Pensar em voz alta jogando não é natural para
criança: observe primeiro, converse depois, com o jogo aberto.

**As 5 perguntas** (depois de jogar):

1. "Me mostra a parte que você mais curtiu."
2. "Teve alguma hora que você não sabia o que fazer? Me leva lá."
3. "Como você explicaria esse jogo para uma amiga que nunca jogou?"
4. "Se você só pudesse mudar UMA coisa na novidade de hoje, qual seria?"
5. "Amanhã você jogaria isso de novo: sim, talvez ou não? Qual parte?"

A quinta é a Again-Again table do Fun Toolkit: a menos inflada. Evite "gostou?", "foi difícil?", "não ficou legal o
X?", nota de 1 a 5. **Observe em vez de perguntar**: onde trava, o que ignora, o que repete sem ninguém pedir, onde
ri, o que mostra para alguém, quando quer sair. Anote só comportamento, com o minuto. Repetir sem pedir vale mais
que qualquer resposta (Mario 64: as crianças queriam jogar de novo mesmo sem progredir).

Quando ela pedir ajuda durante o teste: "não sei, o que você acha?". Elogie a ideia concreta e o trabalho, não a
pessoa (Mueller e Dweck).

## Como classificar cada pedido

Adulto e agente classificam no mesmo dia, em uns 10 minutos. Quatro destinos:

| Destino | O que entra | Para onde vai |
|---|---|---|
| **Agora** | atrito ou bug que apareceu no teste; ajuste pequeno da novidade; dado que ela já ditou | próxima versão |
| **Próxima** | candidata a ser a novidade grande | uma das 3 que ela escolhe |
| **Banco de ideias** | todo o resto | `docs/IDEIAS.md` com nome dela, data, motivo e quando entra |
| **Não** | raro: não combina com o jogo, ou há um jeito mais simples de dar o mesmo sentimento | coluna "viraram outra coisa"; nunca some |

Regras: **sempre diga o motivo à criança**; prometa o adiado como "a próxima" ou "está no banco", nunca suma com ele;
ideia do vídeo **nunca vai direto para o código**; o banco é visível para ela (mural no jogo ou cartaz na parede com
colunas "no banco / a próxima / no forno / já no jogo!").

### Modelo de tabela (copie para `docs/<crianca>/AAAA-MM-DD-<tema>.md`)

```markdown
Versão jogada: N · canal: vídeo depois de jogar · data: AAAA-MM-DD

| # | Pedido (resumido, sem transcrição) | Onde (minuto, quadro, região do mapa) | O que já existe | Destino (agora / próxima / banco / não) | Como encaixa ou por quê | Dito a ela? |
|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |

Onde contradiz o que já foi decidido e como conciliar:

| Pedido | Decisão anterior | Conciliação |
|---|---|---|
|  |  |  |

Perguntas novas (numeradas, vão para DUVIDAS.md):
1.
```

## Conciliar pedidos violentos

Padrão dos dois jogos: **sem morte da protagonista, sem sangue, sem game over**. O tom do conflito é decisão por
jogo, com a criança: o Dragão é explorar e cuidar, sem combate; As Três Ilhas têm batalhas, mas não violentas. Em
todos, o bicho vencido "apaga" em partículas.

Reenquadre com o próprio desenho dela. O que funcionou:

- Bicho perigoso que ataca → já estava numa gaiola no desenho dela: ruge, bate nas grades, a protagonista é
  empurrada com um susto.
- Pedido de bicho ferido → fome e cansaço; a árvore que cura recarrega as barras.
- Pedido de afundar no rio → a água puxa e devolve para a margem.
- Pedido de matar o lobo para comer → um gesto de garra de 0,3 s que transforma o lobo em comida, em brilhos.
- Pedido de perder vida → perde um pouco de energia e dá um pulinho para trás; nunca morre.

Converse com o adulto antes; registre a regra no `CLAUDE.md` do jogo.

## Ler o pedido pela emoção

MDA (Hunicke, LeBlanc e Zubek): mecânica gera dinâmica, que gera emoção. A criança pede mecânica; você entrega a
emoção. O pedido de acasalar dragões é cuidar e ver crescer. Vinte dragões no estábulo querem dizer "tem mais para achar". Quinze
bolinhas de poder no desenho viram quatro orbes que mudam o mundo. Às vezes um pedaço pequeno da mecânica entrega a
emoção inteira.

## Conteúdo por dados antes de sistema novo

"Mais missões" é YAML: missões escritas mais um molde de repetíveis que nunca acaba. Só crie sistema novo quando o
pedido não cabe nos passos e catálogos que existem. Nomes provisórios ficam em YAML com as alternativas dela em
comentário; nomes definitivos vêm dela (às vezes ela delega a escolha ao adulto).

## Tempo, versão e explicação sempre visíveis

- **Tempo**: ao abrir, uma fala diz quanto tempo passou; tudo que espera mostra quanto falta ("faltam 7 minutos").
  No Dragão a criança percebeu pouco o dia virando, e o aviso precisou crescer.
- **Explicar toda feature dentro do jogo**: barra das teclas que fazem algo ali, dica na primeira vez, "ainda não
  pode" com o motivo e quem ajuda, tela de ajuda. Quando ela não achar algo, uma aba "missões e onde achar as
  coisas", com spoiler mesmo, resolve por ora. Feature sem explicação é feature pela metade.

## Autoria visível

A criança valoriza a coisa porque é dela, não porque deu trabalho (efeito IKEA em crianças, Marsh et al. 2018).
Então: nome dela nos créditos e em cada ideia ("ideia da Olivia, data"), o mensageiro diz quem pediu a novidade,
decisões dela aparecem no jogo, ela pode renomear personagens dentro do jogo.

## Deixar a criança editar o conteúdo

- **A menor**: pelo jogo, não pelo arquivo (renomear dragões na tela do estábulo, escolher cores).
- **A maior**: o MDM, Mapa de Dependência de Missões (`visualizador/` na raiz deste repositório), mostra missões, pessoas, lugares e
  itens como grafo. O botão **"MDM editor: quero mudar o jogo"** liga a edição: religar setas (quem dá a missão, para onde o
  passo aponta), trocar textos, quantidades, recompensas e ordem dos passos, com limites para criança (fala de até 2
  linhas de 38 letras; moedas, corações e quantidades com teto). Tem desfazer, "Ver no jogo" e "Mandar para o papai",
  que exporta as mudanças para o adulto aplicar. As edições ficam no navegador dela.
- Um YAML só dela, aberto com o adulto e recarregado ao vivo, é o primeiro contato com "jogo é regra + dado".
- **Num jogo 2D, o mapa é texto**: uma letra por tile, com uma legenda. A criança troca letras e vê a ilha mudar
  ([2d-pixel-art.md](2d-pixel-art.md)).

## O mesmo jogo em outro estilo

Com o conteúdo em dados, um segundo jogo com as mesmas missões custa dias, não semanas: os dois jogos daqui ganharam
um esboço 2D em pixel art que lê os mesmos YAML do 3D. Serve para a criança sentir se a ideia vale. Mostre os dois e
deixe que ela diga, sem induzir, qual quer continuar; o estilo da arte pode ser escolhido numa folha com três direções
bem diferentes, antes de pedir a arte inteira.

## Duas crianças na mesma casa

Jogos e rituais separados, sem comparar ritmo ou número de versões em voz alta. Uma testa o jogo da outra só a
convite da dona (pares que se conhecem acham mais problemas, Als, Jensen e Skov). Ideia copiada da irmã é homenagem,
com crédito.

## Privacidade

Trate todo repo como público. Vídeos, áudios, desenhos, fotos, transcrições e respostas ficam fora do git (pasta
`local/` no `.gitignore`); em `docs/<crianca>/` entra só a análise, generalizada. Nunca o rosto, a voz ou a mão dela
em commit. Ao escrever a análise, deixe de fora tudo que não é sobre o jogo. Se o jogo ganhar um segredo da família
(um lugar escondido, gente de verdade), ele mora em `local/` como módulo opcional e o site só recebe um build feito de
uma cópia limpa do commit e auditado ([2d-pixel-art.md](2d-pixel-art.md), "Publicar um jogo com segredos da
família").

## Roteiro de sessão

**Antes** (adulto e agente)
- [ ] Versão nova passou no checklist de [polimento.md](polimento.md) e nos testes ([testes.md](testes.md)).
- [ ] Etiqueta "versão N" na tela; entrada de novidades escrita, com o nome dela.
- [ ] Gravação de tela pronta (sem rosto); caderno para anotar comportamento com o minuto.
- [ ] Lista curta "o que ela precisa olhar" (3 a 5 itens) + as 5 perguntas.
- [ ] 3 candidatas para a próxima novidade, pré-selecionadas do banco.

**Durante** (uns 25 minutos)
- [ ] O personagem conta as novidades na abertura.
- [ ] 15 minutos de jogo; adulto ao lado e um pouco atrás, sem ajudar ("não sei, o que você acha?").
- [ ] Anotar: travou, ignorou, repetiu sem pedir, riu, mostrou para alguém, quis sair.
- [ ] As 5 perguntas, com o jogo aberto.
- [ ] Ela escolhe a próxima entre as 3.

**Depois** (no mesmo dia)
- [ ] Vídeo de ideias, de preferência no dia seguinte.
- [ ] Análise em `docs/<crianca>/AAAA-MM-DD-<tema>.md` com a tabela de classificação e a versão jogada.
- [ ] Decisões em `DECISOES.md` (data, quem decidiu); dúvidas numeradas em `DUVIDAS.md`; o resto em `IDEIAS.md`.
- [ ] Contar à criança o destino de cada pedido e o motivo.
- [ ] Mídia bruta fora do repo.
- [ ] Uma vez por semana: prints impressos, ela desenha por cima e o adulto desenha junto, sem corrigir (Layered
      Elaboration); comparar com a versão de duas semanas atrás ("o que ficou diferente?").

Para a criança ver o processo, aponte a página das crianças em [../index.html](../index.html).

## Fontes

- Pesquisa de co-criação e escopo dos dois jogos (Paulo, 21/10/2026, não publicada) e os registros de decisões,
  dúvidas e análises do Dragão e das Três Ilhas.
- https://drum.lib.umd.edu/bitstream/handle/1903/1028/CS-TR-4058.pdf (Druin, papéis da criança)
- https://hcil.umd.edu/?p=1745 · https://hcil.umd.edu/?p=227 (KidsTeam, Cooperative Inquiry)
- https://www.kidsteam.ischool.uw.edu · https://www.kidsteam.ischool.uw.edu/chapter03
- https://mdsoar.org/handle/11603/7264 (Layered Elaboration, CHI 2010)
- https://www.kidsteam.ischool.uw.edu/_files/ugd/a5df69_446e6f714c1b42398846a4c1b8f8cfff.pdf (Yip et al., CHI 2016)
- https://doi.org/10.1145/3025453.3025787 (Yip et al., CHI 2017)
- https://experience.aalto.fi/fun-toolkit/ (Fun Toolkit, Again-Again)
- https://clok.uclan.ac.uk/9234 (Read e Horton, efeito teto)
- https://homes.cs.aau.dk/~dubois/papers/p443-als.pdf (Als, Jensen e Skov, pares)
- https://justice.gc.ca/eng/rp-pr/csj-sjc/ccs-ajc/rr02_6/p5.html (sugestionabilidade e idade)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC3655123 (elogio de processo)
- https://joanganzcooneycenter.org/2014/11/14/qa-with-sago-sagos-jason-krogh/ (Sago, o que observar)
- https://shmuplations.com/mario64/ (Miyamoto, 1997)
- https://users.cs.northwestern.edu/%7Ehunicke/MDA.pdf (MDA)
- https://ctlonline.org/parking-lot/ (banco de ideias visível)
- https://thereader.mitpress.mit.edu/ten-tips-for-cultivating-creativity (Resnick, espiral)
- https://eprints.nottingham.ac.uk/47966/ (efeito IKEA em crianças)
- https://scratched.gse.harvard.edu/resources/family-creative-learning-facilitator-guide.html (Roque)
