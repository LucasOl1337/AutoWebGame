# Issue tracker: GitHub

Issues e PRDs deste repositorio vivem como GitHub Issues. Use o `gh` CLI para todas as operacoes.

## Convencoes

- Criar issue: `gh issue create --title "..." --body "..."`.
- Ler issue: `gh issue view <numero> --comments`.
- Listar issues: `gh issue list --state open --json number,title,body,labels,comments`.
- Comentar: `gh issue comment <numero> --body "..."`.
- Aplicar ou remover labels: `gh issue edit <numero> --add-label "..."` / `--remove-label "..."`.
- Fechar: `gh issue close <numero> --comment "..."`.

O repositorio e inferido pelo remoto Git do checkout canonico.

## Pull requests como superficie de triagem

**PRs como superficie de solicitacao: nao.**

GitHub compartilha a numeracao entre issues e pull requests. Quando houver ambiguidade, tente `gh pr view <numero>` e depois `gh issue view <numero>`.

## Publicacao e leitura por skills

- Quando uma skill disser "publish to the issue tracker", crie uma GitHub Issue.
- Quando uma skill disser "fetch the relevant ticket", execute `gh issue view <numero> --comments`.

## Operacoes de Wayfinding

O mapa e uma issue unica e seus tickets sao issues filhas.

- **Mapa:** issue com label `wayfinder:map`, contendo Destination, Notes, Decisions so far, Not yet specified e Out of scope.
- **Ticket filho:** sub-issue do mapa, com label `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` ou `wayfinder:task`.
- **Fallback de sub-issue:** quando sub-issues nao estiverem disponiveis, use task list no mapa e inclua `Part of #<mapa>` no ticket.
- **Bloqueio:** use dependencias nativas do GitHub. Quando indisponiveis, inclua `Blocked by: #<numero>` no corpo do ticket.
- **Fronteira:** tickets filhos abertos, sem bloqueadores abertos e sem responsavel.
- **Claim:** `gh issue edit <numero> --add-assignee @me` antes de trabalhar no ticket.
- **Resolucao:** comente a resposta, feche o ticket e acrescente ao mapa um ponteiro curto com link em Decisions so far.

Ao criar dependencias pela API, use o database id numerico do blocker, obtido com `gh api repos/<owner>/<repo>/issues/<numero> --jq .id`.
