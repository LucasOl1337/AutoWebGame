# Swarm Ledger - documentacao

## 2026-07-09T08:35Z - docs index

- Branch: `swarm-gov/autowebgame/documentacao`
- Change: added `docs/INDEX.md` as the first-stop documentation map for product, gameplay, visual, operations, releases, and CodeGraph docs.
- Validation: passed local markdown link existence check for `docs/INDEX.md` (`22` links).
- Risk: low; documentation-only change.

## 2026-07-09T09:19Z - release readiness links

- Branch: `swarm-gov/autowebgame/documentacao`
- Change: linked the documentation index to the repository README gates and the existing billing checkout readiness record.
- Validation: passed local markdown link existence check for `docs/INDEX.md` (`24` links) and `node tests/readme-release-gates-check.mjs`; `npm run test:readme-release-gates` is not registered on this branch.
- Risk: low; documentation-only navigation update.

## 2026-07-09T12:14Z - docs index link gate

- Branch: `swarm-gov/autowebgame/documentacao`
- Change: added `npm run test:docs-index-links` to verify every relative link in `docs/INDEX.md` resolves to a local file.
- Validation: passed `npm run test:docs-index-links` (`24` links checked).
- Risk: low; documentation test only.
