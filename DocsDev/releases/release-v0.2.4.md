# v0.2.4 - Comercial, confianca e entrada mais rapida (08/07/2026)

Patch oficial do AutoWebGame/BOMBA consolidando o trabalho local feito depois do release `v0.2.3`, com foco em prontidao comercial, transparencia publica, performance do primeiro carregamento, feedback de rodada e resiliencia de lobby.

## Novidades

- **Fluxo comercial preparado:** modelo compartilhado de billing, painel de plano na landing do jogo, endpoints de status/checkout/webhook e telemetria de funil.
- **Centro de confianca publico:** landing ganhou secao de confianca, FAQ, links de privacidade/termos e paginas `privacy.html` e `terms.html` publicadas no build.
- **Feedback de partida mais claro:** cues de inicio de rodada, acoes pos-fim de partida e HUD de perigo critico deixam a leitura do combate mais direta.
- **Entrada online mais compreensivel:** tela de setup mostra etapas de conexao/fila/sala e permite cancelar ou voltar para o inicio sem perder contexto local.

## Performance

- **Bundle inicial menor:** bootstrap do jogo foi separado de `GameApp`, assets e `OnlineSessionClient`, adiando chunks mais pesados ate a entrada real no jogo.
- **SFX sob demanda:** `SoundManager.loadSounds()` deixou de chamar `audio.load()` para os 12 SFX no start.
- **Sprites de caminhada aquecidos em segundo plano:** sprites cardinais ficam disponiveis imediatamente e walk cycles hidratam depois.
- **Cache imutavel para assets versionados:** Worker passa a servir chunks/assets hashed com headers de cache longos.

## Correcoes e estabilidade

- **Arena ativa invalida:** payload invalido de `/api/arena/active` cai para arena default validada.
- **Fallback de sprite de personagem:** pacote vazio por falha de loading tardio usa sprites aprovados de fallback.
- **Telemetry retry:** falhas temporarias de envio recolocam eventos na fila em vez de descarta-los.
- **Chrome/local match:** controles locais e scroll da pagina ficam mais previsiveis no navegador.
- **Power-up pickup sprint:** coleta de power-up ganhou burst curto e feedback de HUD.

## Local vs nuvem

- Nuvem verificada com `git fetch --all --tags --prune` e `gh release list --repo LucasOl1337/AutoWebGame`.
- Ultimo release oficial antes deste patch: `v0.2.3`, publicado em 2026-07-07T17:35:06Z.
- Tag local `v0.2.3` aponta para `6a7cf7016cc29f390c4ac2facfad08b0936d3b54`.
- `origin/main` antes deste patch estava em `3e04149bb65234d12d33ec55571be1cf0680e178`.
- `main` local antes das patch notes estava em `3f1f5ed34a5a213cafa559a005089bff5230d503`, 46 commits a frente de `origin/main`.

## Validacao de release

Checks executados e aprovados durante a preparacao deste patch:

- `npm run test:asset-loader-walk-cycle-warm`
- `npm run test:setup-loading-brief`
- `npm run test:billing-commercial`
- `npm run test:account-username`
- `npm run test:lobby-rules`
- `npm run test:room-invite-link`
- `node tests/sound-manager-lazy-load-check.mjs`
- `npm run test:online-audio`
- `node --check worker/index.js`
- `npm run build`
- `git diff --cached --check`
- Busca especifica por marcadores de conflito Git
- `codegraph status .`
- `npm run test:worker-cache-headers`
- `git diff --check`

## Artefatos

- `DocsDev/releases/release-v0.2.4.md`
- `DocsDev/releases/release-v0.2.4.json`

---

Notas completas geradas para o GitHub Release oficial `v0.2.4`.
