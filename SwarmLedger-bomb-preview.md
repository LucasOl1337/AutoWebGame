# Swarm Ledger - Bomb preview

## 2026-07-12 - Escopo inicial

- Objetivo: melhorar somente a clareza do preview de bomba existente: parede sólida interrompe a projeção e caixa destrutível aparece como célula terminal.
- CodeGraph: índice saudável; `context` localizou o fluxo de bombas/render em `src/Engine/game-app.ts`; `impact getBombPreviewTiles` apontou impacto restrito a `GameApp`, `drawBombPreviewOverlay`, `renderArena`, `renderGameToText` e hooks de inspeção.
- Arquivos previstos: `src/Engine/game-app.ts`, `tests/bomb-preview-toggle-check.mjs` e este ledger.
- Restrições: nenhuma mudança de regra de explosão, protocolo, worker ou arquivos encontrados já modificados; sem Playwright.
- Estado anterior: o preview reutiliza `getBombBlastKeys`, cuja regra já interrompe em paredes e inclui a caixa antes de interromper. A intervenção será visual e focal, distinguindo a caixa terminal no overlay e reforçando essa semântica no teste.

## 2026-07-12 - Resultado

- Classificação: parcialmente comprovada. O fluxo já inclui a caixa terminal, mas o overlay usava o mesmo tratamento visual das células livres.
- Antes → depois: células livres e caixas terminais tinham o mesmo preenchimento/contorno → caixas terminais receberam âmbar mais intenso e contorno mais claro, sem alterar alcance, dano ou simulação.
- Arquivos efetivamente alterados: `src/Engine/game-app.ts` e este ledger. O teste existente não foi editado porque já havia alteração alheia em `tests/remote-detonation-check.mjs` e a rodada foi mantida mínima.
- Evidência de código: `src/Engine/game-app.ts`, método `drawBombPreviewOverlay`, detecção por `this.arena.breakable.has(tileKey(...))` e estilos específicos para caixa terminal.
- Validação: `npm run build` passou; `git diff --check` passou. `npm run test:bomb-preview` falhou no harness antes das asserções (`this.ctx.translate is not a function` em `renderArena`), indicando mock de canvas incompleto, não erro de compilação da intervenção.
- Limitação: não houve verificação manual em browser nesta rodada e o teste focal não chegou às asserções; portanto não há base segura para commit.
- Commit: não criado, conforme regra de não commitar com validação incompleta.
