# Swarm Ledger - bugs

## 2026-07-09T03:14:20-03:00 - EXECUTOR

- Branch: `swarm-gov/autowebgame/bugs`
- Mudanca: exposto `test:roster-invalid-public-manifest` em `package.json` para tornar executavel o guard contra manifesto publico de personagens invalido.
- Validacao: `npm run test:roster-invalid-public-manifest` passou.
- Risco: baixo; mudanca limitada a script de teste e ledger do assunto.
