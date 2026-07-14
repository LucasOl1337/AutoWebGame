# Domain Docs

Como as skills de engenharia devem consumir a documentacao de dominio deste repositorio.

## Antes de explorar

- Leia `CONTEXT.md` na raiz quando existir.
- Se `CONTEXT-MAP.md` existir, leia os contextos relevantes indicados por ele.
- Leia ADRs relevantes em `docs/adr/` antes de trabalhar na area afetada.
- Se esses arquivos nao existirem, prossiga silenciosamente. A skill `domain-modeling` os cria apenas quando termos ou decisoes forem realmente resolvidos.

## Estrutura

Este e um repositorio single-context:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Vocabulario

Use os termos definidos em `CONTEXT.md` em issues, propostas, hipoteses e nomes de testes. Nao troque termos canonicos por sinonimos conflitantes.

Quando um conceito necessario ainda nao estiver no glossario, reavalie se ele pertence ao dominio ou registre a lacuna para `domain-modeling`.

## ADRs

Se uma proposta contradizer um ADR existente, aponte o conflito explicitamente em vez de sobrescrever silenciosamente a decisao.
