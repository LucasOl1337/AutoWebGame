# ShipSwarm coordination

Shared coordination log for the continuous commercial shipping swarm. Each session should claim a narrow, disjoint scope before editing and append concrete evidence before closing.

## Active claims

None.

## Completed work

- 2026-07-08T17:17:02-03:00 - Automation `enxame-cont-nuo-ship-comercial-autowebgame`
  - Area: QA real do fluxo comercial completo.
  - Before: commercial checks were split between focused account/billing tests and manual confidence that landing, game route, legal pages, account creation, checkout and telemetry still formed one sellable flow.
  - After: added `npm run test:commercial-release-flow`, a release smoke that validates visitor promise, `/game` entry, published legal/trust pages, quick account creation, external checkout gating, webhook-paid access model, localized purchase copy and conversion telemetry.
  - Files touched: `tests/commercial-release-flow-check.mjs`, `package.json`, `ShipSwarm.md`.
  - Evidence: `npm run test:commercial-release-flow` passed; `npm run test:account-username` passed; `npm run test:billing-commercial` passed; `npm run build` passed and emitted `dist/index.html`, `dist/game.html`, `dist/privacy.html` and `dist/terms.html`.
  - Collision note: active claims were empty when claimed; no other files were touched.

- 2026-07-08T13:01:47-03:00 - Automation `enxame-cont-nuo-ship-comercial-autowebgame`
  - Area: Checkout, webhook, plan status and purchase confirmation.
  - Before: account existed as username-only; no billing model, no checkout handoff, no webhook confirmation path, no landing plan status.
  - After: added shared billing status model, Worker endpoints for `/api/billing/status`, `/api/billing/checkout`, `/api/billing/webhook`, landing early-access plan panel, billing telemetry events, operational doc and focused contract test.
  - Files touched: `src/NetCode/billing.ts`, `worker/index.js`, `src/NetCode/session-client.ts`, `src/NetCode/growth-telemetry.ts`, `src/UiLayouts/i18n.ts`, `src/UiLayouts/main.css`, `tests/billing-commercial-flow-check.mjs`, `DocsDev/releases/billing-checkout-readiness.md`, `package.json`.
  - Evidence: `npm run test:billing-commercial` passed; `npm run build` passed; `node --check worker/index.js` passed.
  - Collision note: no previous `ShipSwarm.md` existed in this worktree; scope created and completed in this session.

- 2026-07-08T13:37:42-03:00 - Collector integration `trust-legal-faq-20260708-1311`
  - Area: Termos, privacidade, FAQ e confianca minima.
  - Before: landing nao tinha FAQ de confianca, links legais publicos nem paginas de privacidade/termos publicadas no build.
  - After: landing ganhou secao Confianca com FAQ, footer links, paginas `privacy.html`/`terms.html` e entradas Vite para publicar os arquivos em `dist`.
  - Files touched: `index.html`, `privacy.html`, `terms.html`, `vite.config.ts`, `ShipSwarm.md`, `EnxameTalk.md`.
  - Evidence: `npm run build` passed and emitted `dist/privacy.html` and `dist/terms.html`.
  - Collision note: preserved the existing billing checkout readiness entry in `ShipSwarm.md`.
