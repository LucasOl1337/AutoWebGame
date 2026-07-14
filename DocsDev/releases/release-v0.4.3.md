# v0.4.3 — Bots mais espertos, online mais estável e resultados claros (14/07/2026)

![BOMBA PvP — PATCH v0.4.3](https://raw.githubusercontent.com/LucasOl1337/AutoWebGame/v0.4.3/release-assets/v0.4.3-card.png)

Patch oficial auditado do AutoWebGame/BOMBA PvP. Este documento consolida o que o código realmente entrega desde o último GitHub Release, identifica a origem multiagente e registra também o trabalho descartado ou refeito.

## Resumo executivo

- **Baseline público real:** `v0.4.1`, commit `a2eff456`, publicado em 13/07/2026 às 12:46 BRT. `adb3bb2` é o objeto do tag anotado, não o commit.
- **Nuvem antes da integração:** `origin/main` em `aa92b74`; havia um tag intermediário `v0.4.2` apontando para esse estado, mas **nenhum GitHub Release v0.4.2**.
- **Local antes da auditoria:** `main` em `3c77364`, um commit à frente da nuvem, mais alterações não commitadas e várias worktrees/branches de agentes.
- **Decisão SemVer:** publicar `v0.4.3`; não reescrever o tag público/intermediário `v0.4.2`.
- **Escopo final:** 113 arquivos, 5.359 adições e 919 remoções contra `v0.4.1`; arte binária contada como arquivo, não como LOC.
- **Compatibilidade:** sem migração de Durable Object, sem quebra do protocolo WebSocket/persistência e sem alteração de secrets. Métodos administrativos HTTP foram restringidos deliberadamente; toolchain de desenvolvimento agora exige Node.js 22+ para usar o Wrangler corrigido.

### Por que parte do histórico parece anterior ao release

O release `v0.4.1` foi publicado depois que várias sessões já haviam criado commits em branches paralelas, mas seu tag permaneceu em `adb3bb2`. Assim, alguns commits datados antes das 12:46 BRT aparecem corretamente no diff `v0.4.1..v0.4.3`: eles ainda não estavam no artefato público. A comparação de release usa o tag, enquanto a auditoria cronológica usa timestamps de logs e commits. Misturar as duas coisas inflaria ou esconderia trabalho.

## Auditoria de sessões e agentes

Os logs brutos, ledgers, branches, reflogs, worktrees e bancos locais disponíveis foram lidos em ordem cronológica. “Sem evidência” significa que não existe alteração atribuível no AutoWebGame inspecionado; não significa que a ferramenta nunca foi usada em outro diretório.

| Agente / sessão | Objetivo declarado | Arquivos ou área tocada | Resultado real no patch |
|---|---|---|---|
| CLAUDE `468fc786-6d01-44d3-b09e-88aefb23d532` (cwd direto) e menções contextuais em outros projetos | Contexto/revisão anterior | Nenhum arquivo pós-`v0.4.1` atribuível | **No-op para este patch**; nenhuma sessão direta pós-release encontrada |
| CHATGPT — executável hospedeiro do Codex | Interface onde tarefas Codex foram iniciadas | Mesmas evidências dos IDs Codex abaixo | **Não contado em dobro**; não há store de sessões independente |
| CODEX `autowebgame-1affeed128a5`, coordenador `root-bootstrap-019f5b2c`, r001 | Telemetria: storage, UUID e retry | `src/NetCode/growth-telemetry.ts`, testes | **Sucesso**, com correção adicional na auditoria para não perder eventos antigos no overflow |
| CODEX missão finita r002 | Fallback de sprites/assets | manifests, carregamento e testes de assets | **Sucesso** |
| CODEX missão finita r003 | Dispatch/cache HTTP do Worker | `worker/index.js`, testes de rota/cache | **Sucesso** |
| CODEX missão finita r004 | Robustez de input | `src/Engine/input.ts`, testes | **Sucesso** |
| CODEX missão finita r005 | Matchmaking | `src/NetCode/matchmaking.ts`, testes | **Sucesso** |
| CODEX missão finita r006 | Relógio/tick do servidor | `src/NetCode/server-tick.ts`, testes | **Sucesso** |
| CODEX missão finita r007 | Ciclo de vida WebSocket | `src/NetCode/session-client.ts`, teste dedicado | **Parcial nos logs; concluído na auditoria** com proteção contra auto-rejoin depois de `leave` explícito |
| CODEX missão finita r008 | Ciclo de vida do áudio | `src/Engine/sound-manager.ts`, teste dedicado | **Sucesso** |
| CODEX missão finita r009 | Segurança de estado dos bots | `src/Engine/bot-ai.ts`, teste dedicado | **Sucesso** |
| CODEX missão finita r010 | Rodada adicional | Nenhum arquivo | **No-op**, rodada pulada |
| CODEX automação noturna 1 | Corrigir snap de avatar remoto ao atravessar portal | `src/NetCode/online-sync.ts`, teste de wrap | **Sucesso** |
| CODEX automação noturna 2 | Interpolação monotônica sob snapshots atrasados | `src/NetCode/online-sync.ts`, teste de jitter | **Sucesso** |
| CODEX automação noturna 3 / `eed3a00` | Preservar ultimate do jogador 2 na tecla `I` | input/gameplay/teste local P2 | **Sucesso** |
| CODEX automação noturna 4 | Melhorar fluxo de resultado | Nenhum write final | **Falhou/no-op** |
| CODEX automação noturna 5 | Localizar resultado da rodada | `game-app.ts`, `i18n.ts`, teste | **Parcial no log; concluído e validado na auditoria** |
| CODEX sessões de swarm registradas em `DocsDev/swarm-coordination.md` | Micro melhorias de bot, powerup, HUD, arena, Worker e UX | gameplay, arenas, UI, worker e testes | **Consolidadas** nos grupos técnicos abaixo; commits e claims permanecem rastreáveis no ledger |
| CODEX `019f5bff-3740…` | Trabalho direto no checkout canônico em 13/07 | integração e correções locais | **Incluído conforme diff** |
| CODEX `019f601c-7b18…` e `019f601c-c548…` | Revisões de especificação e padrões | somente leitura | **No-op de código**, evidência de revisão |
| CODEX `019f6012-a0fa…` | Auditoria e release `v0.4.3` | integração, correções, testes, docs e arte | **Sucesso**, sessão atual |
| TRAEWORK `c0e82eb` | Servir shell do jogo em deep routes | `worker/index.js`, teste | **Sucesso**, incluído |
| TRAEWORK `09578ca` / `cd2b193` | Estabilizar layout responsivo pós-launch | UI/CSS/teste | **Sucesso**, duplicados semânticos consolidados |
| TRAEWORK Lab UI/broker, preservado em `archive/trae-lab-*` | Expor laboratório de agentes | launcher, `main.ts`, broker Python e testes | **Excluído**: primeiro protótipo simulava placar com aleatoriedade; versão posterior exigia broker em `127.0.0.1:8766` e credenciais Nine Router numa rota pública |
| ZCODE — logs locais até 07/07 | Atividades anteriores | Nenhum arquivo pós-release atribuível | **No-op para este patch** |
| OPENCODE — SQLite local, duas menções indiretas em Sharingan/Sennin | Contexto/orquestração | Nenhum arquivo AutoWebGame | **No-op para este patch** |
| WISPR FLOW — ditado de 13/07 16:11 BRT | Solicitar swarms no app ChatGPT | Texto de prompt, sem write direto | **Input/orquestração**, não mudança de código |

### Apêndice cronológico — micro sessões Codex pós-publicação

O ledger não registra horário para estes claims do mesmo dia; dentro de 13/07 a ordem abaixo é a ordem cronológica inferida pela inserção newest-first do arquivo, explicitando essa limitação em vez de inventar timestamps.

| Data / sessão | Objetivo declarado | Arquivos tocados | Resultado real |
|---|---|---|---|
| 13/07 `ux-how-to-play-sudden-death` | Explicar fechamento das bordas | `how-to-play.html`, teste e docs | **Sucesso**, incluído |
| 13/07 `bot-safe-deterministic-adjacent-kick` | Chutar bomba adjacente só com rota segura | `bot-ai.ts`, teste e docs | **Sucesso**, `b3aa24c`, incluído |
| 13/07 `ux-how-to-play-utility-powerups` | Explicar escolhas utilitárias | guia, teste e docs | **Sucesso**, incluído; preview visual inconclusivo no log |
| 13/07 `ux-utility-powerup-hud-labels` | Tornar labels SH/BP/SF legíveis | `powerups.ts`, teste e docs | **Sucesso**, incluído |
| 13/07 `ux-round-winner-avatar-halo` | Destacar avatar vencedor | `game-app.ts`, teste e docs | **Sucesso**, incluído; regressão bloqueada na sessão foi superada pelo gate final |
| 13/07 `default-arena-kick-up-pair` | Ajustar par de kick no drop pool | `arena.ts`, teste e docs | **Parcial na sessão**, incluído e validado depois |
| 13/07 `ux-how-to-play-round-scoring` | Explicar vencedor/Double KO | guia, teste e docs | **Sucesso**, incluído |
| 13/07 `ux-shell-prefers-reduced-motion` | Respeitar movimento reduzido | `main.css`, teste e docs | **Sucesso**, incluído |
| 13/07 `ux-how-to-play-hot-kick-risk` | Explicar perda de fuse por chute | guia, teste e docs | **Parcial na sessão**, incluído e validado depois |
| 13/07 `ux-round-start-objective-cue` | Relembrar objetivo no início | `i18n.ts`, teste e docs | **Sucesso**, incluído |
| 13/07 `ux-bootstrap-loading-feedback` | Mostrar loading acessível | `main.ts`, teste e docs | **Sucesso**, `7522b16`, incluído |
| 13/07 `bot-remote-over-bomb-pass-priority` | Priorizar remote sobre bomb-pass | `powerups.ts`, teste e docs | **Sucesso**, incluído |
| 13/07 `ux-bomb-kick-hud-label-bk` | Trocar label K por BK | `powerups.ts`, teste e docs | **Sucesso**, incluído |
| 13/07 `ux-button-press-feedback` | Feedback `:active` acessível | `main.css`, teste e docs | **Sucesso**, incluído |
| 13/07 `short-fuse-effective-pickup-feedback` | Exibir SF 1.60s/1.20s | `game-app.ts`, teste e docs | **Sucesso**, incluído via integração |
| 13/07 `nico-voluntary-cancel-short-cooldown` | Cancelar channel sem beam | skill Nico, teste e docs | **Sucesso**, incluído |
| 14/07 `bot-shield-second-charge-250` | Valorizar segunda carga de shield | `powerups.ts`, teste e docs | **Sucesso**, `3c77364`, incluído |
| 14/07 `language-switcher-pressed-state` | Sincronizar `aria-pressed` PT/EN | `session-client.ts`, teste e docs | **Sucesso**, incluído; autoria individual sem commit |

### Consolidação e divergências entre log e código

1. **Missão finita:** os nove resultados diziam “delivered”, mas r007 ainda admitia uma corrida entre `leave` e `close`; o teste novo reproduziu e a auditoria corrigiu. Os JSONs brutos estavam versionados apesar de o próprio README tratá-los como scratch; foram removidos do release e continuam recuperáveis em `v0.4.2`/histórico.
2. **Snapshots sem commit:** várias sessões registraram “sem commit” ou “pendente de coletor”, mas seus hunks aparecem no snapshot `653861c` ou em commits de reconciliação. Resultado real foi determinado por blame/diff, não pelo status narrado.
3. **Worker:** a agregação trouxe duas implementações idênticas de `sendSnapshotToClient`; uma foi removida. Deep routes e reconexão permaneceram.
4. **Temas:** duas sessões concatenaram documentos JSON completos em `configs/arena-theme-library.json`; o arquivo era inválido. Foi reduzido a um único documento válido com nove temas.
5. **Testes desatualizados:** mudanças posteriores em reconnect grace, Nico, quatro temas sprite e copy de Double KO invalidaram expectativas antigas. Os contratos foram corrigidos para o comportamento final, sem esconder regressão.
6. **Lab do TRAE:** os logs/UX sugeriam laboratório utilizável, mas o código real era fake ou dependia de localhost/secret não disponível ao usuário. Foi preservado em tags de arquivo e excluído da produção.
7. **Automação noturna:** “result flow” não deixou mudança; localização saiu parcial. O patch só credita o que está no diff final.
8. **Alterações sem log próprio:** estado `aria-pressed` do seletor de idioma e seu teste apareceram no checkout durante a integração. A mudança é pequena, consistente e testada, mas fica marcada como autoria Codex não individualizada.

## LISTA 1 — O que foi feito (técnico)

| Área não sobreposta | Arquivos | + LOC | - LOC |
|---|---:|---:|---:|
| Gameplay, arenas, personagens e engine | 12 | 295 | 76 |
| Online e Worker | 6 | 123 | 27 |
| Frontend e páginas públicas | 9 | 442 | 42 |
| Testes | 64 | 2.746 | 72 |
| Infra, dependências, config e assets | 8 | 437 | 696 |
| Docs, ledgers e release | 14 | 1.316 | 6 |
| **Total** | **113** | **5.359** | **919** |

1. **Feature — IA e escolhas de powerup** (`bot-ai.ts`, `powerups.ts`, `arena.ts` e testes)
   - Bots avaliam saturação, retornos decrescentes e utilidade de speed, flame, bomb, shield, remote, kick e bomb-pass; desempates ficam determinísticos.
   - Chutes adjacentes exigem rota segura; segunda carga de escudo e detonação remota ganharam prioridade contextual.
   - Magnitude está no agregado não sobreposto de gameplay e testes da tabela.

2. **Feature — leitura visual e ritmo de combate** (`game-app.ts`, `main.css`, áudio e testes)
   - Pop de spawn/coleta, telegraph final e pulso de bomba armada, cauda de dissipação da chama, fallback de quebra de caixas, labels compactos e cues de início/resultado.
   - Double KO deixa claro que ninguém pontua; vencedor e próxima ação ficam mais legíveis.
   - O feedback cruza engine/frontend/testes; não é somado de novo para evitar dupla contagem.

3. **Bugfix — online e Worker** (`online-sync.ts`, `session-client.ts`, `matchmaking.ts`, `server-tick.ts`, `worker/index.js`)
   - Interpolação de portal e jitter, resync/reconnect, assento de late join, deep routes, dispatch/cache, tick catch-up e proteção contra reconnect depois de saída deliberada.
   - Duplicação de função no Worker removida; fluxo real de lobby foi exercitado contra Wrangler local.
   - Núcleo online/Worker: 6 arquivos, +123/-27; cobertura relacionada está no agregado de testes.

4. **Feature/Bugfix — personagens e controles** (`CustomMechanics/*`, `input.ts`, `game-app.ts`)
   - Ultimate P2 continua em `I`; spam de dash bloqueado da Killer Bee é temperado; blink parado da Ranni recebe cooldown menor; Nico cancela voluntariamente o feixe sem dispará-lo e aplica cooldown curto.
   - Incluído no agregado de 12 arquivos de gameplay/engine, sem dupla contagem.

5. **Feature — frontend, launcher e acessibilidade** (`frontend-router.ts`, `frontend-store.ts`, `launcher-shell.*`, `i18n.ts`, `main.*`, `how-to-play.html`)
   - Launcher incremental, layout responsivo pós-jogo, estados de bootstrap, foco/pressed/disabled, volume e reduced motion; copy PT/EN e guia atualizados.
   - Resultado da rodada é derivado de motivo/vencedor sem confiar na mensagem inglesa enviada pelo servidor.
   - Frontend/páginas: 9 arquivos, +442/-42; testes relacionados separados.

6. **Refactor/Infra — configuração e resiliência interna** (`arena-theme-library.json`, telemetria, manifests, package scripts)
   - Biblioteca de nove temas volta a ser JSON válido; URLs surpresa ficam estáveis; Crocodilo respeita dimensões da arena e o manifest habilita o cast do Nico.
   - A landing ganhou links jogáveis por arena e “Arena Surpresa”; telemetria tolera storage/UUID parcial e preserva o lote mais antigo em retry com overflow.
   - Worker restringe verbos das rotas administrativas; Wrangler seguro exige Node.js 22+ e o requisito está declarado no pacote/README.
   - Scripts oficiais expõem os novos checks de lifecycle, bot safety e localização.
   - Infra/config/assets: 8 arquivos, +437/-696; a maior remoção é normalização do lockfile.

7. **Testes — contratos executáveis** (`tests/*-check.mjs`)
   - Cobertura nova para bots, online, Worker, UX, animações, temas, lifecycle, localização e acessibilidade; expectativas antigas foram alinhadas ao contrato final.
   - Validação final: 176/176 checks aprovados em dois passes finais, inclusive após upgrades de dependências.
   - Testes: 64 arquivos, +2.746/-72 — 51% das adições do patch são cobertura, não feature.

8. **Docs/Release — rastreabilidade e limpeza** (`DocsDev`, ledgers, patch notes, changelog e arte)
   - Auditoria multiagente, patch card oficial e histórico de claims; scratch `.swarm`, arquivos `*.integration.*` e protótipo UX não consumido foram retirados do produto sem destruir refs recuperáveis.
   - Docs/ledgers/release: 14 arquivos, +1.316/-6; esse volume é rastreabilidade, não funcionalidade.

## LISTA 2 — O que mudou na prática (para o humano)

1. **Bots parecem menos “burros”:** buscam upgrades que ainda valem a pena, evitam itens saturados e fazem chutes/detonações com mais contexto.
2. **Combate comunica melhor o que está acontecendo:** bombas pulsando perto da explosão, pickups saltando visualmente, chamas dissipando e HUD/cues mais claros reduzem mortes ou dúvidas sem feedback.
3. **Partidas online toleram melhor rede instável:** atravessar portal e receber snapshots atrasados causa menos snap; reconnect/resync e assentos de lobby são mais previsíveis.
4. **Sair significa sair:** clicar para deixar uma sala não deve mais ser desfeito por um `close` tardio que reentra automaticamente.
5. **Resultado da rodada fica compreensível em PT/EN:** Double KO, vencedor, placar e próxima ação não dependem de uma frase inglesa do servidor.
6. **Controles locais preservados:** o segundo jogador usa `I` para a habilidade; ajustes de Killer Bee, Ranni e Nico deixam ultimates menos frustrantes.
7. **Entrada e retorno ao jogo ficam mais polidos:** launcher, loading, responsividade, foco de teclado, volume e estados de botão dão uma interface mais acabada.
8. **Arenas têm seleção/variação mais estável:** nove temas válidos, incluindo modos sprite e Verdant Ruins procedural mais silenciosa visualmente.
9. **Invisível para o usuário, mas importante:** telemetria não perde o lote antigo em falha, Worker deixa de carregar código duplicado e os contratos automatizados cobrem mais regressões.
10. **Não mudou:** o “Lab de agentes” do TRAE **não foi lançado**; seria enganoso apresentá-lo como funcionalidade pronta.

## Auditoria de qualidade e encaixe

### Achados corrigidos antes do release

- **Alta relevância:** corrida de reconexão após saída explícita; perda de eventos antigos em overflow de retry; JSON de temas inválido.
- **Alta relevância, revisão independente:** reentrada launcher→jogo sem remontagem; rotas Treino/Lab prometendo comportamento não implementado. Voltar ao launcher agora recarrega o runtime, Treino inicia duelo local e o Lab não pronto foi removido da navegação pública.
- **Média relevância:** storage de áudio sem proteção, função duplicada no Worker, bootstrap/teste duplicados integralmente e expectativas incompatíveis com contratos posteriores.
- **Escopo/release:** protótipos e scratch acidentalmente agregados; versão intermediária sem release público; arte e versões visíveis desalinhadas.

### Riscos e débitos residuais

- `game-app.ts`, `session-client.ts` e `worker/index.js` continuam módulos de orquestração grandes e de alto risco; o patch melhora cobertura, mas não resolve o débito arquitetural.
- Muitos checks são contratos de fonte e não substituem testes de comportamento em navegador real para cada combinação de input/rede.
- A toolchain de deploy exige Node.js 22+; isso não muda o runtime do jogador, mas colaboradores em Node 20 precisam atualizar o ambiente.
- A atribuição individual de alguns snapshots é imperfeita: logs de agentes e commits não compartilham sempre o mesmo ID. O relatório prefere “autoria não individualizada” a inventar precisão.
- O tag `v0.4.2` permanece como evidência histórica sem GitHub Release. Apagá-lo ou movê-lo quebraria rastreabilidade.

### Veredito brutalmente honesto

**Valor líquido positivo, mas com ruído relevante.** O produto recebeu melhorias reais e perceptíveis em bot, leitura de combate, UX e estabilidade online. Porém, a quantidade de commits/sessões superestima o ganho: muita atividade foi teste, ledger, exposição de script, snapshot ou reconciliação. Houve rework concreto para corrigir JSON concatenado, função/teste duplicados, contratos desatualizados, corrida de reconnect e um Lab inviável para produção.

Estimativa honesta: **70–80% do resultado final é valor útil ou cobertura que reduz risco; 20–30% foi ruído, sobreposição, retrabalho ou experimento excluído**. O patch pode ser publicado depois dos gates finais; não seria responsável publicar diretamente o snapshot agregado sem esta auditoria.

## Preservação e limpeza Git

- 35 tips de branches locais/remotas foram preservados em tags anotadas `archive/pre-v0.4.3/*` antes de qualquer exclusão.
- Sete estados do Lab TRAE permanecem em `archive/trae-lab-*`.
- Oito worktrees auxiliares limpas foram removidas com `git worktree remove`; a entrada integration já ausente foi saneada com `git worktree prune`.
- O checkout local ficou com uma única worktree canônica e apenas a branch local `main`.
- Branches remotas serão removidas somente depois do push das tags de arquivo e da nova `main`.

## Publicação e validação

- Build: **aprovado**, Vite 7.3.6, 52 módulos transformados.
- Checks de contrato: **176/176 aprovados**, repetidos após o upgrade de dependências.
- Dependências: **0 vulnerabilidades** após atualizar Wrangler/Vite e transitivas compatíveis.
- Worker: syntax check e **Wrangler 4.110.0 dry-run aprovados**; deploy pendente nesta etapa do documento.
- QA local: **5/5 rotas HTTP aprovadas** em Vite/Worker. Inspeção visual automatizada ficou bloqueada por falha do plugin oficial (`Cannot redefine property: process`), sem ser substituída por Playwright.
- GitHub Release: pendente nesta etapa do documento.
