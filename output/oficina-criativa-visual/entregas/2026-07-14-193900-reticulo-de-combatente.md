# Retículo de Combatente Confirmado

| Campo | Conteúdo |
|---|---|
| Entrega | Retículo de Combatente Confirmado |
| Benefício | Torna inequívoco qual combatente está selecionado e dá à ficha de loadout um feedback visual mais vivo e tático. |
| Onde aparece | Menu inicial, na ficha clara de seleção de personagem antes de iniciar uma partida. |
| Estado | Integrado |
| Arquivos finais | `src/UiLayouts/match-control-experience.css`; `tests/launcher-fighter-lock-visual-check.mjs` |
| Como verificar | Abra a rota inicial, observe a moldura vermelha e o selo `FIGHTER LOCKED` sobre o retrato selecionado; ative redução de movimento para confirmar a versão estática. |
| Validações | `node tests/launcher-fighter-lock-visual-check.mjs`; `node tests/match-control-experience-contract-check.mjs`; `npm run build`; inspeção direta do consumidor CSS e das regras de acessibilidade. |
| Pendências reais | A captura ao vivo com Chrome headless não foi gerada; a inspeção visual no navegador ficou pendente. |
| Parecer | Ficou melhor de verdade: a seleção ganhou hierarquia e confirmação imediata sem competir com o nome, sem custo de novo asset e sem alterar o fluxo funcional. |

## Classificação do material

- **Integrado:** retículo, selo de confirmação, pulso discreto e fallback estático para movimento reduzido.
- **Candidato:** nenhum.
- **Descartado:** captura headless, pois o Chrome não produziu o arquivo solicitado.

## Coleta

O coletor deve revisar principalmente o enquadramento do selo em larguras estreitas. As alterações locais preexistentes em `launcher-shell.css` e `tests/launcher-farol-partida-visual-check.mjs` não foram tocadas.
