# v0.4.4 — Consolidação canônica e feedback de arena (16/07/2026)

Patch oficial que parte exatamente da versão em produção no commit `88d4aa3069c631a136c2b1cd5cb9ea05f3040995`. A integração preserva as regras atuais e incorpora somente módulos e melhorias aditivas, sem migrações, mudanças de DNS, dados remotos ou segredos.

## Integrado

- Feedback visual e sonoro aditivo para explosões, perigo, powerups, auras e resultado de rodada.
- Camadas responsivas de launcher, seleção de personagem, conta, roster, palco da partida, guia e labs.
- Arena procedural `aurora-switchyard`, décimo tema da biblioteca pública.
- Bot Evolution Arena v0.1 como módulo privado, com registro de ações, interface de arena, evidências de rodada e gates explícitos.
- Correções de concorrência e validação compartilhada na automação de melhorias.
- Localização de erros de lobby e áudio remoto condicionado à coleta observável.

## Removido

- Experimento visual legado que competia com o launcher canônico.
- Teste CDP dependente de preview ignorado e servidor localhost externo.
- Relatórios e ledgers temporários de coordenação sem valor para o produto final.
- Branch de corte obsoleta, tags de arquivo/backup e demais referências paralelas após a publicação.

## Validação

- Build Vite com `VITE_PUBLIC_ROUTE_POINTER=canonical` e `VITE_CONTINUOUS_ROOM_POINTER=canary`.
- Compilação ESM e checks focados de gameplay, online, UI, assets, temas e Bot Evolution.
- Testes Python de roteamento de conta e auditoria npm sem vulnerabilidades conhecidas.
- Smoke de produção e correspondência dos artefatos publicados executados após o deploy.

## Publicação

- GitHub Release: `v0.4.4`; o tag identifica o commit exato desta consolidação.
- Produção: `https://bombapvp.com/` e `https://bombpvp.com/`.
- Backend: Cloudflare Worker `autowebgame-online`.
