# Swarm Ledger - migracao-visual

## 2026-07-09T08:33:40-03:00

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: exposto `test:landing-visual-token` no `package.json` para rodar o contrato visual da landing via npm.
- Validacao: `npm run test:landing-visual-token` passou.
- Risco: baixo; altera apenas script npm e ledger.

## 2026-07-09T06:10:21-03:00 - Governor

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: normalizou `letter-spacing` negativo em titulos e nomes do shell visual para `0`, preservando tamanhos, layout e tokens existentes.
- Validacao: `npm run test:touch-focus-css` passou; varredura `rg "letter-spacing:\s*-" src\UiLayouts\main.css` sem ocorrencias.
- Risco: baixo; alteracao CSS pontual sem tocar fluxo de jogo, online ou worker.

## 2026-07-09 - governor

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: adicionado gate `tests/landing-visual-token-check.mjs` para proteger tokens visuais semanticos da landing e impedir retorno das cores gold legadas.
- Validacao: `node tests/landing-visual-token-check.mjs`
- Risco: baixo; teste textual novo, sem alteracao de runtime.
- Proxima sugestao: adicionar script npm dedicado quando houver outro gate de migracao visual relacionado.
