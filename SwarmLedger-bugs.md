# Swarm Ledger - bugs

## 2026-07-09T09:54:58-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:short-fuse-powerup` em `package.json` para tornar executavel o guard de regressao do powerup de fuse reduzido.
- Validacao: `npm run test:short-fuse-powerup` passou.
- Risco: baixo; mudanca limitada a script de teste existente e ledger do assunto.

## 2026-07-09T06:28:00-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:server-player-removal` em `package.json` para tornar executavel o guard de regressao da remocao de jogador em partida server-authoritative.
- Validacao: `npm run test:server-player-removal` passou.
- Risco: baixo; mudanca limitada a script de teste existente e ledger do assunto.

## 2026-07-09T05:55:03-03:00 - GOVERNOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:growth-telemetry-uuid-fallback` em `package.json` para tornar executavel o guard de fallback de UUID da telemetria quando `crypto.randomUUID` nao existe.
- Validacao: `npm run test:growth-telemetry-uuid-fallback` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.

## 2026-07-09T03:14:20-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:roster-invalid-public-manifest` em `package.json` para tornar executavel o guard contra manifesto publico de personagens invalido.
- Validacao: `npm run test:roster-invalid-public-manifest` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.

## 2026-07-09T04:32:00-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:room-code-entry-normalization` em `package.json` para tornar executavel o guard de normalizacao de codigo de sala e links de convite colados.
- Validacao: `npm run test:room-code-entry-normalization` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.
