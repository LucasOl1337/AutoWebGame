## 2026-07-15 — short-fuse-label-standardization
- Antes → depois: o power-up `short-fuse-up` usava o label `Faster Fuse`; agora usa `Short Fuse`, alinhado ao nome canônico, preservando `shortLabel: SF` e o efeito de reduzir o pavio em 400 ms.
- Classificação: Comprovada — mudança focal de copy/contrato, sem alteração de balanceamento ou comportamento.
- Evidências: `src/Gameplay/powerups.ts` contém `label: "Short Fuse"`; `tests/short-fuse-label-effect-check.mjs` exige o novo label e confirma tipo, abreviação, fusível base e redução de 400 ms (`pass=true`).
- Validações já aprovadas: `compile:esm`, teste focal `short-fuse-label-effect-check.mjs` e build. Commit local seletivo somente de runtime/teste; este ledger e o de coordenação ficam fora do commit por conterem alterações concorrentes; sem push/deploy.

## 2026-07-15 — online-input-sequence-deduplication
- Claim/escopo: impedir retransmissões online com o mesmo `inputSeq` de rearmarem bomba, detonação ou ultimate já consumidas; alterar somente `src/NetCode/input-latch.ts`, `tests/online-input-latching-check.mjs` e este registro append-only; preservar todos os diffs concorrentes; commit local seletivo somente runtime/teste; sem push/deploy/branch/worktree.
- Classificação final: Comprovada. RED: após consumir os pulsos de `inputSeq: 10`, retransmitir a mesma sequência rearmou `bombPressed`, `detonatePressed` e `skillPressed` (`pass=false`, exit 1). GREEN: sequências iguais ou menores retornam o estado atual; sequência maior mantém o latch existente (`duplicateIgnored` preservou os três pulsos em `false`, `pass=true`).
- Antes → depois: pacote duplicado podia executar novamente uma ação discreta online; agora cada sequência é aceita no máximo uma vez, sem mudar o fluxo local, o visual ou os assets. Evidência focal em `src/NetCode/input-latch.ts:22-25` e `tests/online-input-latching-check.mjs:23-38,70-88`.
- Validações: `test:online-input-latch`, `test:online-4p`, `test:server-tick`, `test:online-skill-reconcile`, `test:remote`, `npm run build` (98 módulos), `git diff --check` e revisão seletiva aprovados. Preview visual/manual não se aplica à invariância de protocolo; o harness reproduz consumo e retransmissão deterministicamente. Ledger mantido fora do commit por conter mudanças concorrentes; sem push/deploy.

## 2026-07-15 — killer-bee-nonfinite-delta-noop
- Claim/escopo: fazer `updateKillerBeeDash` ignorar `deltaMs` não finito, alterando somente `src/Characters/CustomMechanics/killer-bee-skill.ts`, `tests/killer-bee-ult-dash-check.mjs` e este registro; preservar toda mudança concorrente; commit local seletivo somente runtime/teste; sem push/deploy.
- RED → GREEN: antes, `NaN`, `Infinity` e `-Infinity` corrompiam posição/timers do dash (`nonFiniteDeltaNoop=false`, exit 1); depois, os três valores preservam posição, timers e fase, zeram velocidade e retornam tratados (`nonFiniteDeltaNoop=true`, `pass=true`).
- Validações: `test:killer-bee-ult`, `test:skill-contract`, `test:online-skill-reconcile`, `test:server-character-skill`, typecheck/build Vite (97 módulos) e diff-check seletivo aprovados. Harness server-authoritative exerceu o gameplay; lint não existe em `package.json`. Diffs alheios preservados; sem push/deploy.

## 2026-07-15 — nico-invalid-delta-preserve-velocity
- Resultado/antes → depois: `updateNicoArcaneBeamChannel` zerava a velocidade ao receber `deltaMs` zero, negativo ou não finito, embora não avançasse a skill; agora a entrada inválida é um no-op integral tratado, preservando velocidade, fase e timers sem criar feixe.
- Evidências: guarda focal em `src/Characters/CustomMechanics/nico-skill.ts:61-63`; cenários de `channeling` e `releasing` para `0`, `-17`, `NaN`, `Infinity` e `-Infinity` em `tests/nico-ult-arcane-beam-check.mjs:346-382`, todos com `scenarioPass=true`, `invalidDeltaNoop=true` e `pass=true`.
- Validações: teste focal via `node tests/nico-ult-arcane-beam-check.mjs`, `npm run build` (98 módulos), `git diff --check` seletivo, `git show --check` e revisão integral do diff aprovados. Commit local seletivo `262bedf`, contendo somente runtime/teste; ledgers mantidos fora por conteúdo concorrente; sem push/deploy.

## 2026-07-15 — crocodilo-invalid-delta-preserve-velocity
- Claim/escopo: tornar `updateCrocodiloEmeraldSurgeChannel` um no-op integral para `deltaMs` zero, negativo ou não finito, alterando somente `src/Characters/CustomMechanics/crocodilo-skill.ts`, `tests/crocodilo-ult-emerald-surge-check.mjs` e este append; evitar todos os arquivos sujos e orquestradores.
- Classificação final: Comprovada. RED: os 10 cenários de `channeling`/`releasing` para `0`, `-17`, `NaN`, `Infinity` e `-Infinity` preservavam fase/timers, mas zeravam a velocidade (`nonPositiveDeltaNoop=false`, exit 1). GREEN: a guarda retorna tratada sem mutar velocidade, fase ou timers (`nonPositiveDeltaNoop=true`, `pass=true`).
- Antes → depois: um tick temporal inválido podia introduzir uma parada espúria durante o Emerald Surge; agora não altera estado de gameplay. Validações: `npm run test:crocodilo-ult`, `npm run build` (98 módulos), `git diff --check` e revisão seletiva aprovados; sem commit/push/deploy.
