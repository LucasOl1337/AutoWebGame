# Swarm Ledger - ready-to-ship

## 2026-07-09 - Runnable README release gate

- Branch: `swarm-gov/autowebgame/ready-to-ship`
- Change: exposed the existing README release gate as `npm run test:readme-release-gates` so release hygiene can be run through the normal script surface.
- Validation: `npm --prefix C:\Projetos\AutoWebGame-swarm-governor run test:readme-release-gates` passed.
- Risk: low; package script only, no runtime behavior change.

## 2026-07-09 - README release gate

- Branch: `swarm-gov/autowebgame/ready-to-ship`
- Change: added `tests/readme-release-gates-check.mjs` to verify that README release-oriented `npm run` commands still exist in `package.json`, include the build gate, and do not include deploy/publish/seed/migration commands.
- Validation: `node tests/readme-release-gates-check.mjs` passed.
- Risk: low; test-only release hygiene gate.
