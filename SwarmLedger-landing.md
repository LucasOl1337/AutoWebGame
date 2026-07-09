# Swarm Ledger - landing

## 2026-07-09T08:17:56.1716580Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: adiciona skip link focado por teclado e landmark `<main id="main-content">` envolvendo o conteudo principal da landing publica.
- Validacao:
  - `npm run test:commercial-release-flow`
  - PowerShell contract check para `skip-link`, `main-content`, CSS de foco e ordem antes do footer.
- Risco: baixo; link fica oculto fora de foco e nao altera o fluxo visual normal.
- Proxima sugestao: criar um teste dedicado de contrato estatico para acessibilidade basica da landing.

## 2026-07-09T09:05:29.2139688Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: reforca `tests/how-to-play-page-check.mjs` para validar que a landing publica mantem skip link, destino `main-content` e ordem correta antes do footer.
- Validacao:
  - `npm run test:how-to-play-page`
- Risco: baixo; altera apenas contrato estatico de HTML publico e nao muda runtime.
- Proxima sugestao: expor esse gate no checklist ready-to-ship quando a landing publica for alterada.

## 2026-07-09T11:09:32.1828003Z

- Branch: `swarm-gov/autowebgame/landing`.
- Mudanca: adiciona nome acessivel para a navegacao principal e para CTAs publicos que entram no jogo.
- Validacao:
  - `npm run test:how-to-play-page`
  - PowerShell contract check para `aria-label="Navegacao principal"` e CTAs `/game` com `aria-label="Jogar BOMBA PvP agora"`.
- Risco: baixo; altera apenas atributos semanticos no HTML da landing, sem mudar layout ou runtime.
- Proxima sugestao: promover o contrato de CTAs da landing para um teste dedicado quando houver novo gate de acessibilidade.
