# Swarm Ledger - migracao-visual

## 2026-07-09 - governor

- Branch: `swarm-gov/autowebgame/migracao-visual`
- Mudanca: adicionado gate `tests/landing-visual-token-check.mjs` para proteger tokens visuais semanticos da landing e impedir retorno das cores gold legadas.
- Validacao: `node tests/landing-visual-token-check.mjs`
- Risco: baixo; teste textual novo, sem alteracao de runtime.
- Proxima sugestao: adicionar script npm dedicado quando houver outro gate de migracao visual relacionado.
