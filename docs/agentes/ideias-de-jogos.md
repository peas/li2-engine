# Ideias de jogos e de missões

Repertório para quando uma família começa um jogo novo ou precisa de missões: os tipos de missão que os dois jogos já
usam, como montar uma vila em que cada morador pede algo que combina com ele, o que torna uma missão boa para 8 a 10
anos e algumas sementes de jogo para começar. Vem da pesquisa de missões de vila, da pesquisa de polimento e do que
o Dragão e As Três Ilhas aprenderam. O formato dos dados está em [missoes-como-dados.md](missoes-como-dados.md); o
processo com a criança, em [co-criacao.md](co-criacao.md).

## A ideia por trás

Doran e Parberry analisaram mais de 750 missões de MMORPGs: quase todas são um **motivo** do personagem mais uma
sequência de poucas ações atômicas (pegar, ir, dar, ouvir, contar, consertar). O que diferencia uma missão da outra
não é o verbo, é o motivo e o lugar. Para a criança isso vira um diagrama de estados: **nova → aceita → um estado por
passo → concluída**, às vezes com uma volta ("ainda faltam 2") e às vezes com um evento no fim que muda o mundo. É o
mesmo desenho que ela aprende a fazer no papel (ver [co-criacao.md](co-criacao.md)).

## Tipos de missão

| Tipo | O que a criança faz | Passo(s) no motor | Exemplo nos jogos | Inspiração |
|---|---|---|---|---|
| **Ir** | chegar a um lugar (ou a vários, em qualquer ordem) | `ir` (aceita lista de lugares) | conhecer a ilha; visitar três mirantes para a pintora | A Short Hike: devolver a vontade de pintar |
| **Falar** | conversar com alguém, levar um recado | `falar` | a mãe pede para chamar o filho para o almoço; ele só desce se ganhar um coco | Wind Waker: carta do correio |
| **Coletar** | juntar N de algo no mundo | `coletar` | 3 frutas para o bolo; 3 cogumelos para a tinta | Animal Crossing: favores |
| **Levar** | entregar algo a alguém | `levar` | um peixe para o dragão da ilha; 3 rações para as galinhas | Stardew: pedido de entrega |
| **Achar** | encontrar algo perdido perto de um lugar | `achar` (raio + dica) | o porco sumido; o chapéu que o vento levou | Animal Crossing: item perdido; Ocarina: as galinhas fugidas |
| **Responder** | resolver charada ou conta | `responder` | uma charada e uma conta de vezes dão uma roupa especial | pedido da Elisa |
| **Domar** | fazer amizade com um bicho em encontros | `domar` / contador de encontros | dragão raro em 3 encontros; a dragoa da caverna com comida e carinho | pedido das duas |
| **Apagar incêndio** | usar um poder no lugar certo | `apagar_incendio` | fogo no feno do ferreiro, com gelo ou vento | tipo pedido na rodada 0 do Dragão |
| **Levar voando** | levar alguém na garupa | `levar_voando` | a moça até a torre; a menina até a ilha | tipo pedido na rodada 0 do Dragão |
| **O mundo mudou** | o fim muda algo para sempre | `ao_concluir.mundo` | o galinheiro passa a dar 3 ovos; o dragão domado mora no estábulo; um quadro na parede | BotW: Tarrey Town cresce missão a missão |
| **Começa por uma pista no mundo** | ela nota o problema antes de alguém pedir | `oferecer_apos` (evento) | um dia não há ovo; o aviso na cerca leva à dona do galinheiro | Animal Crossing New Leaf: item no chão, pergunte quem perdeu |
| **Repetível por molde** | pedidinho novo quando não há missão ativa | molde de repetíveis | o personagem-guia pede "colher N", "levar algo a alguém", "visitar dois lugares" | Stardew: quadro de pedidos, sem o prazo |
| **Encadeada** | uma missão abre a seguinte | `requer` | o lugar mais bonito só depois do chapéu (a cachoeira já é conhecida) | — |
| **Quest grande** | três missões em qualquer ordem abrem uma final | `requer` com várias | proposta: couro, fivela e tecido para fazer uma sela | Zelda |

Ainda no banco, só se a criança pedir: **escolha** (duas setas saindo do mesmo estado, prêmio muda conforme o
caminho), **corrida contra alguém** (tentar de novo sem castigo), **só de noite**, **enigma de lugares** (uma placa com
três pistas, um baú), **contar** ("quantas ovelhas tem no campo?", com três números e sem punir o erro) e **esperar
um dia**. Cada um pede um passo ou uma tela nova.

## O que faz uma missão boa para 8 a 10 anos

1. **Curta e com o que já existe**: 3 a 8 minutos, no máximo 4 passos, nenhum código novo. É a regra do Chris
   Avellone para missão secundária (rápida, com as mecânicas centrais), em escala de criança.
2. **Motivo antes do pedido**, numa frase, ligado a quem pede: o pescador quer peixe, a costureira dá roupa.
3. **Um lugar novo por missão**: cada uma mostra a cachoeira, o lago, a horta ou um mirante.
4. **O mundo lembra depois**: uma fala nova do morador ou um objeto que muda. A Short Hike monta o final a partir das
   missões feitas.
5. **Recompensa que serve**: moeda que compra roupa, coração a mais, receita nova (as penas de A Short Hike aumentam a
   estamina; o Alba foi criticado por missões sem recompensa).
6. **Humor bobo e literal**, nunca ironia: o pescador que só pesca bota.
7. **Dificuldade marcada** (`facil`, `media`): no Dragão, três missões médias dão um poder novo.

**Evitar**: escolta (NPC lento, ninguém gosta), timer punitivo, fetch em série sem motivo, texto longo, coisa
importante escondida sem dica (o `achar` com raio generoso, uns 6 m, e a estrela no lugar), e `coletar` de item comum
que ela já tem na mochila (conta a partir do início do passo e parece bug; use `levar`, que conta o que ela tiver).

## Estrutura de vila: quem pede o quê

Ligue o pedido ao ofício ou ao jeito do morador (Animal Crossing liga ao hobby). Deixe o morador sempre no mesmo
lugar, com um balão "!" quando tem missão. Nomes provisórios até a criança batizar.

| Quem | Pede | Prêmio que combina | Lugar que a missão mostra |
|---|---|---|---|
| Personagem-guia (a coruja) | a primeira missão, que ensina um poder; pedidinhos repetíveis; uma dica de baú por dia | moedas, enfeites, um poder | a ilha toda |
| Padeira | frutas para um bolo, frutas para geleia | moedas | pomares |
| Pescador | um peixe para alguém; peixe assado porque "os peixes o reconhecem" | moedas, receita | lago, píer |
| Ferreiro | apagar o fogo no feno; uma charada | enfeite de metal | saída da vila |
| Criança | o brinquedo perdido, o chapéu que o vento levou, esconde-esconde, sonhar com um filhote | moedas, um bicho para ela | torre, cachoeira, horta |
| Mãe ou pai de uma criança | chamar o filho que não desce do alto da cachoeira | roupa feita em casa | alto da cachoeira, praia |
| Costureira ou pastora | ingredientes para tricotar ou costurar | cobertorzinho, roupa nova | campo das ovelhas |
| Pintora | o lugar mais bonito da ilha | coração, quadro que aparece na parede | mirantes |
| Criador de bichos | o porco sumido; as galinhas que pararam de comer | moedas, coração, bônus para sempre | lago, galinheiro, fazenda |
| Horteiro ou fazendeiro | água para a horta (ensina o poder da água); palha para o espantalho | o poder, colheita | horta, fazenda |
| Avô ou avó | charada e conta; peixes para o vovô | roupa especial | vila |
| Mercearia | encomenda do dia (repetível) | moedas | onde cada coisa nasce |
| Bichos domados | pedem algo depois de virarem amigos | enfeites | onde moram |
| Pessoas da praia | missões de praia | roupas de praia com função | praia, píer |
| Uma vila remota | festa do pijama na casa de um parente | pijama | um penhasco longe |

## Referências citadas nas fontes

- **A Short Hike** (Adam Robinson-Yu): mundo aberto pequeno feito por uma pessoa; landmarks, placas, barreiras
  naturais (altitude e penas), música por lugar, diálogo escrito como conversa por mensagem. A referência de tamanho.
- **Lil Gator Game**: ilha pequena, faz de conta de parquinho, humor e cara de papelão.
- **Animal Crossing**: favores ligados ao hobby, esconde-esconde, a voz por letra, a recepção calorosa quando você
  volta.
- **Zelda**: Ocarina (as galinhas fugidas, repetível), Wind Waker (a carta, os olhos do Link que olham o que importa),
  Breath of the Wild (Tarrey Town, iscas visíveis, regra do triângulo), Tears of the Kingdom (o jogo que as crianças
  conhecem; tutorial do poder num santuário curto).
- **Stardew Valley**: pedidos de entrega do quadro da mercearia (sem copiar o prazo).
- **Spiritfarer**: cada personagem tem prato favorito.
- **Alba**: consertar coisas na ilha, sem pressão de tempo.
- **Untitled Goose Game**: o jogo inteiro numa lista de afazeres riscada.
- **Journey**: a montanha sempre à vista, tutorial sem texto.
- **Mario Odyssey** e **Kirby**: sem vidas, fácil como padrão. **Toca Boca**: brinquedo sem vencer nem perder.
- **Super Chibi Knight** e **Sick Hug Bro**: jogos de pai com filha (ela desenhou, decidiu fases e história).

## Sementes de jogo novo

Pontos de partida para a rodada 0, não roteiros: a criança muda tudo. Cada uma usa só o que o motor já tem e ensina
uma ideia de estados ou eventos.

| Semente | Premissa | Verbo central | Primeiras 3 missões (tipos) | Ensina |
|---|---|---|---|---|
| **Cuidar de um bicho que cresce** | você é um bicho (dragão, cavalo) que vive numa ilha, come, dorme e faz amigos | voar ou galopar, cuidar | ir (conhecer a ilha), coletar (frutas), domar (um amigo) | barras que mudam com o tempo; estágios bebê → jovem → adulto |
| **Náufraga na vila** | você chega sem nada e a vila te acolhe; missões dão corações | andar, ajudar | achar (o bicho sumido), coletar + levar (ingredientes), ir (um lugar novo) | missão como máquina de estados; corações como recompensa |
| **A trilha da montanha** | subir até o topo, ajudando quem encontra no caminho | escalar, planar | falar (quem está travado), achar (uma pena), ir (o mirante) | barreira natural: só passa quando tem o que precisa |
| **A horta e a panela da vila** | plantar, colher e cozinhar o prato favorito de cada morador | colher, cozinhar | coletar (sementes), levar (o prato), o mundo mudou (a horta cresce) | receita como regra; evento "colheu" alimenta a missão |
| **O correio voador** | levar cartas e pessoas entre ilhas | voar, entregar | levar voando, falar A → falar B, levar (resposta) | eventos de chegada; a carta-resposta que chega depois |
| **Colecionador de ovos raros** | ninhos com ovos pela ilha; alguns chocam | explorar, achar | achar (ninho), coletar (ovos), domar (o filhote) | o que muda por dia; coleção visível |
| **O mistério da vila** | algo está errado e o mundo dá pistas antes de alguém pedir | observar, perguntar | começa por pista, responder (charada), o mundo mudou | evento no mundo que libera a missão |
| **Esconde-esconde no parquinho** | as crianças da vila brincam e você entra na brincadeira | achar, correr | achar × 3, falar, repetível com outros esconderijos | o mesmo molde com dados diferentes |

Para qualquer semente: comece pelo controle (andar, voar ou escalar gostoso numa sala vazia, como Mario 64), depois o
mapa da criança ([arquitetura.md](arquitetura.md)), depois a primeira missão. Uma abertura curta ajuda a criança mais
velha a contar a história ([cutscenes.md](cutscenes.md)).

## Fontes

- Pesquisa de missões de vila para crianças (Paulo, 23/10/2026, não publicada) e as missões em YAML dos dois jogos.
- https://ianparberry.com/pubs/pcg2011.pdf (Doran e Parberry, estrutura de missões)
- https://nookipedia.com/wiki/favor · https://nookipedia.com/wiki/Hide-and-seek (Animal Crossing)
- https://stardewvalleywiki.com/Help_Wanted (Stardew Valley)
- https://zeldauniverse.net/guides/ocarina-of-time/sidequests/returning-the-cucco-ladys-cuccos-in-ocarina-of-time/
- https://www.zeldadungeon.net/wiki/Part-Time_Job (Wind Waker)
- https://www.thegamer.com/spiritfarer-spirit-location-perks-likes-dislikes/ (Spiritfarer)
- https://www.pockettactics.com/alba-a-wildlife-adventure/review (Alba)
- https://www.zeldadungeon.net/?p=126583 (Tarrey Town)
- https://media.gdcvault.com/gdc2024/GNR/Papers/Copas+GNR+-+A+Short+Hike.docx.pdf (A Short Hike, análise narrativa)
- https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/
- https://gdcvault.com/play/1026613/Independent-Games-Summit-Crafting-A (A Short Hike, GDC 2020)
- https://neverendingbacklog.substack.com/p/lil-gator-game-2022 · https://en.wikipedia.org/wiki/Lil_Gator_Game
- https://gamebanshee.com/k4wqq (regras de missão secundária do Avellone)
- https://gamedeveloper.com/design/what-are-the-defining-qualities-of-a-good-side-quest-
- https://www.montecookgames.com/?p=119028 (jogos para crianças: escolher a faixa primeiro)
- https://www.gamedeveloper.com/design/can-we-fix-escort-mission-game-design- (escolta)
- https://gmtk.substack.com/p/how-nintendo-solved-zeldas-open-world (iscas e triângulos)
- https://mechanicsofmagic.com/?p=53406 (Journey)
- https://gamingbolt.com/nintendo-explains-why-the-lives-system-is-gone-in-super-mario-odyssey
- https://www.nintendo.com/sg/interview/arzg/04.html (Kirby)
- https://www.killscreen.com/secret-smart-kids-entertainment-give-them-toy-not-game/ (Toca Boca)
- https://www.engadget.com/2013-07-01-super-chibi-knight-a-2d-adventure-game-from-dad-and-daughter.html
- https://matthewschmidt.itch.io/sick-hug-bro
- https://shmuplations.com/mario64/ (controle primeiro)
