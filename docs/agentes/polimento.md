# Polimento para crianças

Game feel, "juice" e UX para jogos 3D de exploração com crianças de 8 a 10 anos. Use este arquivo para decidir quando
uma parte do jogo está pronta, o que polir primeiro com pouco tempo e o que nunca fazer nessa idade. Vem da pesquisa
de polimento que alimentou o Dragão e As Três Ilhas (cerca de 100 detalhes em 12 categorias) e do que as duas versões
"brilho" ensinaram. Onde há som, os jogos usam zzfx ([bibliotecas.md](bibliotecas.md)); vozes e música estão em
[vozes-e-musica.md](vozes-e-musica.md); cutscenes, em [cutscenes.md](cutscenes.md).

## O princípio

Juice é **feedback redundante**: uma ação dispara várias reações (som, partícula, animação, texto). Steve Swink
define game feel como controle em tempo real de objetos num espaço simulado, realçado por polimento. Excesso também
piora: o critério é "a criança entende melhor o que aconteceu?", não "tem mais efeito?". Para criança de 8 anos, som
e resposta visual a cada ação são o polimento de maior retorno por hora. E controle vem antes de tudo: na Nintendo, o
Mario correndo bem numa sala de blocos foi considerado "metade do projeto".

## Checklist "lapidado"

Uma parte só sai do polimento quando tudo isto vale:

1. **Ela descobre sozinha**: no máximo uma fala do personagem ensina. Está explicada no jogo (barra de teclas do
   contexto, dica na primeira vez, "ainda não pode" com o motivo) e no README.
2. **Toda ação responde**: som curto, partícula ou movimento, e um resultado que ela nota ("+1" flutuante, carimbo,
   fanfarra, algo que muda no mundo).
3. **Nenhum bug conhecido que ela viu**, e a parte é coberta por teste ([testes.md](testes.md)).
4. **Testada duas vezes sem ajuda**, em estreias diferentes, e ela voltou a usar sem ninguém pedir.
5. **Nada que já existia quebrou.**
6. **Texto na medida**: fonte ≥ 46 px a 1080p, ≤ 38 caracteres por linha, fala nunca avança sozinha.
7. **Autoria visível**, se a ideia foi dela (novidade anunciada, créditos).

O que falha no item 4 é candidato a refazer ou cortar, não a ganhar mais conteúdo.

## Os 15 de maior impacto por custo

Custo: **B** = até meia sessão, **M** = uma sessão.

| # | Detalhe | Custo | Por que |
|---|---|---|---|
| 1 | **Palavra-chave em cor e negrito** nas falas, no máximo 2 cores (ex.: laranja = coisa ou lugar, azul = pessoa). O typewriter conta só as letras visíveis, senão aparece o marcador letra por letra | B | ela acha o que importa sem ler tudo |
| 2 | **Blip de voz por letra**, tom próprio por personagem, com **pausa na pontuação** | B | ritmo e personalidade (Animal Crossing) |
| 3 | **Linha "o que fazer agora"** sempre visível, com contador ("levar 3 peixes para a vovó, 1 de 3") | B | mata o "esqueci o que era" |
| 4 | **Barra das teclas que fazem algo ali**, mudando com o contexto ("E falar · Espaço voar") | B | ensina sem tutorial |
| 5 | **"Ainda não pode" com o motivo e quem ajuda** ("a ponte caiu; o carpinteiro sabe consertar") | B | bloqueio vira missão, não frustração (A Short Hike) |
| 6 | **Fanfarra em 3 níveis** (comum, importante, grande) e **carimbo** com pausa curta ao concluir missão | B | o momento grande parece grande (Zelda, Sakurai) |
| 7 | **Poeira e squash/stretch** na aterrissagem, no pulo e na decolagem | B | peso do personagem |
| 8 | **Item que voa até o ícone do HUD** + "+1" subindo do lugar onde foi pego | B | liga causa e efeito |
| 9 | **Coyote time e buffer de pulo** | B | perdoa sem ela perceber (Celeste) |
| 10 | **Fade com som** em toda transição; tela de carregamento mostra o mapa do destino | B | corte seco desorienta (TotK) |
| 11 | **Landmark sempre à vista** (vulcão, torre) e a regra do triângulo ao colocar coisas | M | orientação sem minimapa (Journey, BotW) |
| 12 | **Música por região com crossfade** e uma camada a mais no voo | M | A Short Hike, Banjo-Kazooie |
| 13 | **Passos por superfície**, 4 a 8 variações sem repetir, tom variando alguns % | M | "eu estou aqui" |
| 14 | **A cabeça vira para o que importa** por perto | M | dica sem texto (olhos do Link em Wind Waker) |
| 15 | **Autosave com ícone** + um personagem dizendo "bem-vinda de volta, você ficou fora 2 dias", com resumo da missão | B | sem punir a ausência (Animal Crossing) |

Atenção ao 14: nas Três Ilhas, a cabeça ficou rodando entre dois alvos perto de placas e da montaria, e a criança
achou na primeira estreia. A correção foi um alvo por vez com histerese. Polimento mal feito vira bug visível.

## Os números

| O quê | Valor | Origem |
|---|---|---|
| Fonte na tela | ≥ 46 px a 1080p (~4,3 % da altura), fundo sólido ou semi-opaco | Game Accessibility Guidelines |
| Largura da fala | ≤ 38 caracteres por linha; 2 a 3 linhas por caixa; falante sempre indicado | IGDA, top ten de acessibilidade |
| Pausa na pontuação | 120 ms na vírgula, 350 ms no ponto (plugins usam 500/1.000: longo demais, parece travado) | sugestão da pesquisa |
| Blip de voz | intervalo mínimo ~30 ms, pula espaços, altura variando alguns % | plugin de blip, Animalese |
| Trava anti-pulo | ignorar "avançar" nos primeiros ~200 ms da caixa | sugestão (criança martela a tecla) |
| Avançar fala | primeira tecla completa, segunda avança; nunca sozinha | GAG |
| Leitura | 3º ano: mediana de 83 a 112 palavras por minuto em voz alta; 10º percentil 40 a 63; fala de 12 palavras ≈ 7 s | Hasbrouck e Tindal |
| Coyote time e buffer de pulo | 100 a 150 ms | sugestão a partir de Celeste |
| Resposta a qualquer tecla | ≤ 100 ms (som ou movimento já começa) | Swink |
| Squash/stretch | 80 a 150 ms, escalando o grupo inteiro, não ossos | sugestão |
| Poeira | anel de 6 a 12 partículas na cor do chão | talks de juice |
| Pausa de impacto | 60 a 100 ms só no momento grande (carimbo ~80 ms), congelando só os objetos envolvidos | Sakurai, "boss stop" |
| "+1" no mundo | some em ~600 ms | sugestão |
| Brilho no interativo | pulsando a ~1 Hz ao entrar no raio | A Short Hike usa contorno suave |
| Cabeça que olha | alvo a até ~8 m, com limite e mola | sugestão |
| Fade de transição | 250 a 400 ms de preto, com som | sugestão |
| Música na fala | abaixar 30 a 50 % enquanto a caixa está aberta | sugestão |
| Cutscene | abertura de 60 a 90 s no máximo; 2 a 4 s por linha curta; pular segurando ~1 s com anel | Minecraft Legends, sugestão |
| Piscar | nunca mais de 3 vezes por segundo, cuidado com vermelho | WCAG 2.2 |

Números marcados "sugestão" são ponto de partida: deixe no painel de ajustes e calibre com a criança olhando.

## O que NÃO fazer com 8 a 10 anos

- **Morte, game over, perder progresso**. Mario Odyssey tirou as vidas porque iniciantes desanimavam; Kirby fez o
  fácil ser o padrão; Toca Boca faz brinquedo sem vencer nem perder. Cair na lava = reaparecer perto, sem tela de
  derrota.
- **Timer punitivo**: missão contra o relógio, comida estragando enquanto ela está fora, bicho que morre de fome. O
  Alba foi elogiado por deixar progredir no próprio ritmo.
- **Texto que avança sozinho ou rápido**, e paredão de texto antes de jogar. Tutorial em texto não funciona.
- **Leitura obrigatória** para saber o que fazer: tudo tem ícone, cor, seta ou o personagem apontando.
- **Tremor de tela forte ou longo**: fraco, só em evento grande, com chave para desligar.
- **FOV pequeno e câmera nervosa**: enjoa.
- **Informação só por som ou só por cor.**
- **Coisa perdida para sempre**: item ou missão que some se ela não fizer na hora.
- **Parede invisível**: use barreira natural com motivo.
- **Excesso de efeito**: ela precisa distinguir o importante.
- **Ironia e sarcasmo** nos personagens: ela lê literal. Humor físico e bobo.
- **Controle invertido por padrão.**
- **Cutscene que não pula** (a partir da segunda vez, sempre).
- **Fonte pequena.**

## O que as versões "brilho" ensinaram

- A cada 3 versões, uma só de polimento, anunciada como presente. Nas Três Ilhas ela achou dois bugs reais de carona:
  um toque de tecla que se perdia num quadro em sessenta e a música que ficava muda depois da abertura.
- No Dragão, a passada de suavidade do voo foi: medir antes de mexer (passo fixo, filtro do mouse, alocação no loop,
  picos de carregamento), uma correção por commit.
- O que ela não nota não existe: um efeito de roupa gasta ficou fraco demais e passou despercebido.
- Proporção é polimento: pessoas e bichos pequenos demais perto da protagonista foram a reclamação mais repetida.
- "Um ponto de interesse a cada 30 s" não tem fonte primária: cronometre quanto tempo ela anda sem achar nada.

## Talks e ensaios recomendados

| Talk | Por quê | Link |
|---|---|---|
| "Juice it or lose it", Martin Jonasson e Petri Purho | o mesmo Breakout fica gostoso só com camadas de efeito | https://www.youtube.com/watch?v=Fy0aCDmgnxg |
| "The Art of Screenshake", Jan Willem Nijman | por que um jogo parece ótimo e o parecido parece ruim | https://www.youtube.com/watch?v=AJdEqssNZ-U |
| "Celeste & Forgiveness", Maddy Thorson | coyote time, buffer, quinas: trapacear a favor do jogador | https://maddymakesgames.com/articles/celeste_and_forgiveness/ |
| "How Nintendo Solved Zelda's Open World Problem", Game Maker's Toolkit | iscas visíveis, triângulos, revelação gradual | https://gmtk.substack.com/p/how-nintendo-solved-zeldas-open-world |
| "Change and Constant: Breaking Conventions with BotW", GDC 2017 | poucas ferramentas que valem no mundo todo | https://www.gdcvault.com/play/1024562/ |
| "50 Game Camera Mistakes", John Nesky, GDC 2014 | erros de câmera 3D e o conserto | https://www.youtube.com/watch?v=C7307qRmlMI |
| "Designing Journey", Jenova Chen, GDC 2013 | arco emocional sem palavras; protótipo pela música | https://gdcvault.com/play/1017700/Designing |
| "Crafting a Tiny Open World", Adam Robinson-Yu, 2020 | mundo aberto pequeno feito por uma pessoa: o tamanho mais próximo | https://gdcvault.com/play/1026613/Independent-Games-Summit-Crafting-A |
| "Juicing Your Cameras With Math", Squirrel Eiserloh, GDC 2016 | tremor por trauma ao quadrado com ruído suave | https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math |
| Masahiro Sakurai sobre hit-stop | pausa no impacto vale para todo gênero | https://nintendowire.com/news/2022/12/12/this-week-in-sakurai-12-5-12-11-fine-tuning-hit-stop-and-cheating-the-system/ |
| Platformer Toolkit, Game Maker's Toolkit | ensaio jogável com 30+ parâmetros; bom para calibrar com a criança ao lado | https://gmtk.itch.io/platformer-toolkit |
| Livros: *Game Feel* (Swink, 2008) e *Designing Games for Children* (Carla Fisher, 2015) | definição de feel; faixas 6-8 e 9-12 | https://www.routledge.com/products/9780415729178 |

A pesquisa leu resumos das três primeiras; vale assistir e anotar números que os resumos não trazem.

## Fontes

- Pesquisa de polimento em jogos indie para crianças (Paulo, 21/10/2026, não publicada) e as notas das versões brilho
  dos dois jogos.
- https://www.youtube.com/watch?v=Fy0aCDmgnxg
- https://www.youtube.com/watch?v=AJdEqssNZ-U
- https://maddymakesgames.com/articles/celeste_and_forgiveness/
- https://en.wikipedia.org/wiki/Game_feel
- https://unpaywall.org/10.1145%2F3311350.3347171 (Hicks et al., juicy game design)
- https://nintendowire.com/news/2022/12/12/this-week-in-sakurai-12-5-12-11-fine-tuning-hit-stop-and-cheating-the-system/
- https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math
- https://www.youtube.com/watch?v=C7307qRmlMI
- https://gamedeveloper.com/production/the-12-principles-of-animation-in-video-games
- https://gmtk.substack.com/p/how-nintendo-solved-zeldas-open-world
- https://www.gdcvault.com/play/1024562/
- https://nintendoeverything.com/zelda-breath-of-the-wild-and-tears-of-the-kingdom-dev/ (UI do BotW e TotK)
- https://gdcvault.com/play/1017700/Designing
- https://mechanicsofmagic.com/?p=53406 (Journey)
- https://gdcvault.com/play/1026613/Independent-Games-Summit-Crafting-A
- https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/
- https://blog.playstation.com/2021/11/13/the-award-winning-a-short-hike-hits-ps4-november-16/
- https://nookipedia.com/wiki/Animalese
- https://winterbitestudios.itch.io/plugin-rpg-maker-mz-dialogue-bleep
- https://docs.unrealengine.com/marketplace/ko/product/typewriter-style-system-with-precise-delays-based-on-dot-and-comma-punctuation
- https://www.tvtropes.org/pmwiki/pmwiki.php/Main/ItemGet
- https://www.zeldadungeon.net/wiki/Masanao_Arimoto (olhos do Link)
- https://kotaku.com/i-love-how-banjo-kazooie-s-music-changes-as-i-play-1845544436
- https://bugnet.io/blog/footstep-sounds-matter-more-than-you-think
- https://www.killscreen.com/rip-animal-crossing-weeds/
- https://gamingbolt.com/nintendo-explains-why-the-lives-system-is-gone-in-super-mario-odyssey
- https://www.nintendo.com/sg/interview/arzg/04.html
- https://www.killscreen.com/secret-smart-kids-entertainment-give-them-toy-not-game/
- https://www.commonsensemedia.org/game-reviews/alba-a-wildlife-adventure
- https://www.readingrockets.org/article/fluency-norms-chart-2017-update
- https://gameaccessibilityguidelines.com/basic/
- https://igda-gasig.org/how/game-accessibility-top-ten-se/
- https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- https://diamondlobby.com/minecraft-legends/how-to-skip-cinematics-ml/
- https://gdevelop.io/blog/improve-game-tutorials
- https://gmtk.itch.io/platformer-toolkit
- https://www.routledge.com/products/9780415729178
- https://shmuplations.com/mario64/
