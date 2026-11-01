# worker-diario: o diário de uso chega sozinho

Um Cloudflare Worker de uma rota, `POST /diario`, que recebe o diário de uso de um jogo publicado
(`criarDiario({ enviar: { url } })`, [src/game/diario.ts](../src/game/diario.ts)) e grava no bucket R2 **privado**
`paulo-diarios` como `<jogo>/<dispositivo>/<AAAA-MM-DD>.json`. O adulto lê do próprio computador com
`node scripts/diario.mjs --r2` (raiz do motor), sem pegar o dispositivo da criança.

## Por que assim (e não uma chave no jogo)

- O jogo é estático e público: qualquer credencial embutida nele vaza. O Worker escreve no bucket por **binding**
  (`env.BUCKET.put`): não existe chave de acesso nem no browser nem neste repositório.
- O bucket é **novo e privado** (sem domínio público, sem r2.dev): o `paulo-midia` é servido em `midia.paulo.com.br`
  e não serve para isso.
- Só `POST /diario`; nenhuma rota de leitura ou listagem. Aceita só `Origin: https://paulo.com.br` (var `ORIGENS`),
  corpo até 64 KB, JSON com `versao: 1`, `jogo` na lista fixa (var `JOGOS`: os cinco jogos, 3D, 2D e o RPG) e `dispositivo` uuid v4
  (o id anônimo que o jogo gera uma vez por browser). O caminho do objeto é montado **pelo Worker** com a data do
  servidor; nada que o cliente nomeia vira caminho.
- Limite por IP com o binding de Rate Limiting do Workers (12 por minuto): cada dispositivo envia no máximo a cada
  5 min, mais um ao esconder a aba.
- O que chega: só contadores (ids de missões, itens e recursos, contagens, tempos) e um uuid. Nada pessoal.

## Subir pela primeira vez (uma vez, com login do dono da conta)

```bash
cd worker-diario && npm install
npx wrangler login                    # abre o browser na conta Cloudflare
npx wrangler r2 bucket create paulo-diarios
npx wrangler deploy                   # cria também o DNS diario.paulo.com.br (rota em wrangler.jsonc)
```

A URL que os jogos usam é `https://diario.paulo.com.br/diario` (`DIARIO_URL` nos `scripts/publicar.sh` dos jogos, que
passam `VITE_DIARIO_URL` ao build). Sem a variável, o jogo não envia nada (o painel dos adultos continua baixando o JSON).

Para ler o bucket do Mac: um token S3 do R2 com leitura em `paulo-diarios` (painel R2 → Manage API tokens), guardado
num arquivo no formato do `~/.config/paulo-midia/r2.env` (ver `scripts/diario.mjs --help`).

## Testar sem conta

```bash
npm test                 # validação pura (vitest)
npm run dev              # Worker local com R2 simulado (Miniflare)
curl -X POST localhost:8787/diario -H 'Origin: https://paulo.com.br' -d '{"versao":1,"jogo":"dragao","dispositivo":"<uuid v4>","criado":1,"atualizado":2,"segundos":3,"sessoes":[]}'
```
