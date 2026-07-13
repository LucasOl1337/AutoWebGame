# v0.4.1 — Estabilidade de input, áudio e integração auditada (13/07/2026)

Release patch oficial do AutoWebGame/BOMBA PvP, baseada em 0.4.0. Consolida correções locais pós-release sem alterar protocolo, dados persistidos ou infraestrutura de produção.

## Destaques

- Input local preserva a direção mais recente durante repetição de teclas e ignora repetições órfãs.
- Áudio remove listeners de desbloqueio corretamente e volta a tentar reprodução após falhas transitórias.
- Telemetria de crescimento ganhou recuperação de UUID e retry mais resiliente.
- Landing/dev lab, guia Como Jogar, carregamento de sprites e dispatch do Worker receberam ajustes e cobertura.
- O diretório interno .swarm foi removido da unidade de release; sua evidência já está preservada em snapshot.

## Baseline e escopo

- Baseline oficial: 0.4.0 / da613c7.
- Branch: integrate/audited-v0.4.0-20260713.
- Commits integrados: 6a23325, 8a71bdc, 70c00bd, 8343a7, 2481547, 8ce079a, c7d79ba, 7a88003.
- O protótipo Agent API de 8343a7 foi revertido por c7d79ba; não integra o produto.
- Nenhuma arte nova foi gerada.

## Auditoria multiagente

| Agente | Evidência | Resultado |
|---|---|---|
| CLAUDE | branches, commits e arquivos versionados | Nenhuma sessão atribuível encontrada |
| CODEX | histórico, branches codex/*, snapshots e commits | Correções de input/áudio e melhorias locais; Agent API revertida |
| ZCODE | branches, commits e arquivos versionados | Nenhuma sessão atribuível encontrada |
| TRAEWORK | branch swarm/autowebgame/documentacao e histórico | Trabalho paralelo preservado fora deste patch |
| OPENCODE | branches, commits e arquivos versionados | Nenhuma sessão atribuível encontrada |
| WISPR FLOW | branches, commits e arquivos versionados | Nenhuma sessão atribuível encontrada |

A ausência de evidência significa apenas que não há alteração versionada atribuível no repositório inspecionado. O detalhamento por agente e sessão está no JSON da release.

## Compatibilidade e segurança

- Sem breaking changes, migração de Durable Object ou alteração de protocolo.
- Sem leitura, alteração ou rotação de secrets.
- Sem push, deploy ou geração de arte.
- .swarm não integra o patch oficial.

## Estado de publicação

**Preparada e commitada localmente; ainda não publicada.** Push, tag, GitHub Release e deploy permanecem pendentes.

## Validação

Os resultados finais dos gates constam no JSON desta release.
