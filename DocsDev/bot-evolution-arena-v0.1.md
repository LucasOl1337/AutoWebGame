# BotEvolutionArena v0.1 — contrato experimental

Status: especificação normativa do marco v0.1, produzida para a [issue #25](https://github.com/LucasOl1337/AutoWebGame/issues/25) e subordinada ao [mapa #24](https://github.com/LucasOl1337/AutoWebGame/issues/24).

## 1. Objetivo e força normativa

A `BotEvolutionArena` é um módulo profundo, agent-first, para comparar e evoluir políticas de bot em rodadas completas do Bomba PvP. Ela deve usar o mesmo `GameApp` headless e o mesmo ruleset do produto, produzir evidência reproduzível e falhar fechada quando não puder provar o que executou.

Neste documento:

- **DEVE / NÃO DEVE** indica requisito obrigatório;
- **DEVERIA** indica padrão recomendado que exige justificativa registrada para ser desviado;
- **PODE** indica capacidade opcional;
- blocos TypeScript são contratos ilustrativos normativos: nomes internos podem variar, mas semântica, campos obrigatórios e invariantes não podem variar silenciosamente.

O identificador do contrato é `botevolutionarena.v0.1`. Qualquer mudança incompatível exige outro `schemaVersion`; não se altera o significado de um campo v0.1 depois de haver evidência gravada com ele.

## 2. Capacidade atual versus contrato recomendado

| Assunto | Capacidade comprovada hoje | Recomendação v0.1 |
|---|---|---|
| Simulação | `GameApp` entra em modo headless sem DOM e já expõe `startServerAuthoritativeMatch`, `advanceServerSimulation` e `exportOnlineSnapshot`. | Construir o runner sobre esse seam; não criar simulador paralelo. |
| Política local | `src/Engine/bot-ai.ts` oferece política determinística com mapa de perigo, fuga, alvos, bombas e power-ups. | Adaptá-la como baseline versionado e injetável, sem duplicar suas regras. |
| Controle externo | `auto-improvement-bridge.ts` envia telemetria e acks de microações e consome planos temporários. | Transformar cada camada `requested -> safety -> executed -> outcome` em evidência persistente. |
| Laboratório | O broker e o Worker expõem `/api/lab/*`, sessão temporária, catálogo de modelos, health, telemetria, decisões e relatório. | Não tratar essa sessão como arena evolutiva: faltam matriz pareada, estado inicial/randomness comprovados, runner em lote, evidência causal, holdout e avaliador. |
| Providers | `model_manager.py` possui adapters para Codex, Claude, OpenRouter, 9Router e Ollama; a sessão Lab atual aceita somente `9router`. | `describe()` só anuncia um adapter como executável depois de probe real e informa separadamente configurado, saudável e verificado. |
| Personalidade | Perfis persistem `playstyle` e `aggressionBias`; hoje esses campos aparecem apenas na gestão de perfil, sem consumo comprovado no controlador. | Um gene só é válido se um adapter declarar que o consome; campo ignorado gera `unsupported_gene`. |
| Configuração de sessão | O broker aceita `rounds`, `map` e `modifier` e os coloca na URL. | Não alegar aplicação: `rounds` e `labModifier` não são consumidos hoje, e IDs como `classic` não são temas oficiais. O runner deve confirmar configuração solicitada e efetiva. |
| Histórico | O broker guarda vencedor, jogadores e tick final das últimas execuções observadas. | Registrar autoria e cadeia causal das mortes, origem das ações, build/ruleset/policy, randomness/estado inicial efetivos, terminal real, hashes e custo. |
| Evidence core em construção | `src/BotLab/round-evidence.ts` já ordena eventos, registra ações/mortes e materializa Self-KO tri-state com `selfKoUnknown`. | Integrar a captura ao `GameApp` e completar envelope, causal chain e hashes antes de alegar compatibilidade `roundevidence.v0.1`. |
| Processos | O broker tenta `terminate`, espera e então usa `kill` nos agentes conhecidos. A auditoria anterior encontrou 172 processos órfãos. | Supervisor com ledger de recursos owned, cancelamento propagado e gate terminal de zero recursos próprios vivos após cleanup final. |
| Agent-first | O seam puro `describe/execute/observe` e o Action Registry `arena.*` existem em `src/BotLab`, com idempotência e challenge injetável; ainda não há adapter HTTP, persistência nem `/api/actions` da arena no runtime. | Integrar adapters privados derivados do mesmo registry, auditoria persistente e autorização da sessão admin sem expor a arena ao bundle público. |

As referências para essas conclusões são a auditoria local de 2026-07-15, [GameApp](../src/Engine/game-app.ts), [bot determinístico](../src/Engine/bot-ai.ts), [bridge](../src/Engine/auto-improvement-bridge.ts), [broker](../auto-improvements/game_broker.py) e [gestão de modelos](../auto-improvements/model_manager.py).

## 3. Vocabulário ubíquo da arena

Este vocabulário complementa o vocabulário de produto documentado no `CONTEXT.md` local. Dentro da arena, **Rodada** mantém o significado canônico do produto; não usar “match” ou “partida” para esse conceito em contratos novos.

| Termo | Definição | Evitar |
|---|---|---|
| **Experimento** | Especificação imutável que congela hipótese, artefatos, matriz, orçamento, métricas, gates e parada. | job genérico, tentativa |
| **Execução** | Instância operacional de um Experimento, identificada por `runId`. Pode ser pausada, cancelada ou falhar sem alterar o Experimento. | sessão como sinônimo de experimento |
| **Genoma** | Configuração declarativa, versionada e content-addressed de uma política. Na v0.1 nunca contém patch de código-fonte. | bot como arquivo mutável |
| **Política** | Comportamento executável produzido por um adapter a partir de um Genoma. | modelo como sinônimo de política |
| **Família de política** | `deterministic`, `preset`, `model` ou `hybrid`. | provider, personalidade |
| **Adapter** | Implementação que transforma um Genoma de uma família em decisões no seam de política. | provider como controller completo |
| **Personalidade** | Parâmetros de preferência que alteram decisões observáveis, como aversão a risco ou pressão ofensiva. Não é apenas texto de prompt. | label cosmético |
| **Baseline** | Genoma de referência congelado contra o qual todo candidato é pareado. | versão “anterior” implícita |
| **Candidato** | Genoma sob avaliação. Só se torna elegível para promoção após baseline pareado e holdout. | vencedor antes dos gates |
| **Célula de cenário** | Combinação congelada de arena, ruleset, randomness/estado inicial, assento, adversários e repetição. | fixture repetida como várias arenas |
| **Par pareado** | Duas observações, Baseline e Candidato, executadas sobre a mesma Célula de cenário e com os mesmos adversários congelados. | comparar médias de matrizes diferentes |
| **Treino** | Partição visível ao processo de busca e usada para selecionar/mutar candidatos. | validação final |
| **Holdout** | Partição comprometida antes da busca, mantida invisível ao mutador e revelada somente após congelar o candidato final. | segundo treino |
| **Evidência de rodada** | Registro append-only de identidade, eventos, ações, mortes, término e integridade de uma Rodada. | screenshot ou log solto como prova suficiente |
| **Conclusão real** | Rodada que alcança um estado terminal do ruleset e emite exatamente um evento `round-completed`. | encerrar por timeout e chamar de concluída |
| **Timeout operacional** | Interrupção por orçamento/saúde sem terminal do ruleset. É `incomplete`, nunca empate nem Conclusão real. | draw artificial |
| **Self-KO** | Morte por explosão de bomba atribuída ao próprio jogador vítima. A atribuição deve identificar bomba e proprietário; sem isso a morte fica `unknown`, não `false`. | inferir self-KO só porque o bot plantou bomba recentemente |
| **Comportamento bruto** | Ações solicitadas pelo controlador primário, antes de Safety Shield, reparo e fallback. | dar ao modelo o mérito do executor seguro |
| **Comportamento protegido** | Ações realmente executadas após Safety Shield, executor e fallback. | ocultar intervenções |
| **Hard gate** | Condição obrigatória, predeclarada, cujo descumprimento impede elegibilidade mesmo com fitness maior. | métrica ponderada |
| **Veredito** | Resultado separado para infraestrutura, comportamento bruto e comportamento protegido. | único score “100/100” |
| **Promoção** | Ato humano confirmado que torna um Genoma aprovado disponível fora da arena. | seleção automática |

## 4. Seam externo: três operações

A arena expõe uma única Interface com três operações. HTTP, CLI, Action Registry e testes são adapters desse seam; não ganham regras próprias.

```ts
interface BotEvolutionArena {
  describe(): Promise<ArenaDescriptor>;
  execute(command: ArenaCommand, context: ArenaExecutionContext): Promise<ArenaReceipt>;
  observe(query: ArenaQuery): Promise<ArenaView>;
}

interface ArenaExecutionContext {
  requestId: string;
  principal: { actorId: string; sessionIdHash: `sha256:${string}`; permissions: string[] } | null;
  promotionAuthorizer: PromotionAuthorizer;
}

interface ArenaDescriptor {
  schemaVersion: "botevolutionarena.v0.1";
  implementationVersion: string;
  capabilities: {
    policyFamilies: Array<"deterministic" | "preset" | "model" | "hybrid">;
    adapters: AdapterDescriptor[];
    actions: ArenaActionDescriptor[];
    artifactRoot: string;
    limits: Record<string, number>;
    limitations: string[];
  };
  health: {
    status: "ready" | "degraded" | "unavailable";
    checkedAt: string;
    reasons: string[];
  };
}

interface AdapterDescriptor {
  adapter: ArtifactRef;
  family: "deterministic" | "preset" | "model" | "hybrid";
  status: "configured" | "verified" | "unhealthy" | "unavailable";
  lastProbeAt: string | null;
  consumedGenePaths: string[];
  supportedActions: string[];
  effectiveIdentities: Array<{ provider: string; model: string }>;
}

interface ArenaActionDescriptor {
  id: ArenaCommand["action"];
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  allowedStates: Array<RunState | "none">;
  readOnly: false;
  destructive: boolean;
  disruptive: boolean;
  requiresHumanConfirmation: boolean;
  confirmationMechanism: "none" | "admin-session-challenge-v0.1";
  requiredPermission: string;
  errorCodes: string[];
}

type ArenaCommand =
  | { action: "arena.experiment.start"; idempotencyKey: string; spec: ExperimentSpec }
  | { action: "arena.run.pause"; idempotencyKey: string; runId: string; expectedState: "running" | "holdout-running" }
  | { action: "arena.run.resume"; idempotencyKey: string; runId: string; expectedState: "paused" }
  | { action: "arena.run.cancel"; idempotencyKey: string; runId: string; expectedState: RunState; reason: string }
  | { action: "arena.evaluation.request"; idempotencyKey: string; runId: string; evidenceManifestHash: string }
  | {
      action: "arena.promotion.challenge.issue";
      idempotencyKey: string;
      runId: string;
      candidateGenomeId: string;
      evaluationHash: string;
      expectedCurrentGenomeId: string | null;
    }
  | {
      action: "arena.candidate.promote";
      idempotencyKey: string;
      runId: string;
      candidateGenomeId: string;
      evaluationHash: string;
      expectedCurrentGenomeId: string | null;
      adminChallengeId: string;
      adminChallengeNonce: string;
    };

type ArenaQuery =
  | { view: "arena.status" }
  | { view: "experiment"; experimentId: string }
  | { view: "run"; runId: string }
  | { view: "evidence"; runId: string; cursor?: string; limit?: number }
  | { view: "evaluation"; runId: string }
  | { view: "processes"; runId: string };

interface IssuedPromotionChallenge {
  challengeId: string;
  canonicalCommandHash: string;
  nonce: string;
  expiresAt: string;
}

interface PromotionChallengeRecord {
  challengeId: string;
  canonicalCommandHash: string;
  nonceHash: `sha256:${string}`;
  actorId: string;
  sessionIdHash: `sha256:${string}`;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
}

interface PromotionAuthorizer {
  issueChallenge(input: {
    principal: NonNullable<ArenaExecutionContext["principal"]>;
    canonicalCommandHash: `sha256:${string}`;
    expiresInMs: number;
  }): Promise<{ issued: IssuedPromotionChallenge; record: PromotionChallengeRecord }>;
  consumeChallenge(input: {
    principal: NonNullable<ArenaExecutionContext["principal"]>;
    challengeId: string;
    nonce: string;
    canonicalCommandHash: `sha256:${string}`;
  }): Promise<{ authorized: true; actorId: string; consumedAt: string } | { authorized: false; reasonCode: string }>;
}

interface ArenaReceipt {
  receiptId: string;
  action: ArenaCommand["action"];
  idempotencyKey: string;
  status: "accepted" | "rejected";
  acceptedAt: string;
  runId: string | null;
  stateBefore: RunState | null;
  stateAfter: RunState | null;
  resourceHash: string | null;
  result: { promotionChallenge?: IssuedPromotionChallenge } | null;
  error: ArenaError | null;
}

type ArenaView =
  | { kind: "arena.status"; descriptor: ArenaDescriptor }
  | { kind: "experiment"; spec: ExperimentSpec }
  | { kind: "run"; run: RunRecord }
  | { kind: "evidence"; items: RoundEvidence[]; nextCursor: string | null }
  | { kind: "evaluation"; report: EvaluationReport | null }
  | { kind: "processes"; items: ProcessRecord[] };
```

Regras da Interface:

1. `describe()` é side-effect free e nunca anuncia catálogo estático como saúde comprovada.
2. `execute()` valida primeiro, persiste um recibo e só então inicia efeito assíncrono. Repetir a mesma `idempotencyKey` com o mesmo payload retorna byte a byte o recibo original, preservando `receiptId` e `status: "accepted" | "rejected"`, sem novo efeito e sem inventar status `replayed`; payload diferente gera `idempotency_conflict`.
3. `observe()` é leitura consistente por cursor. Nunca altera estado nem inicia probe caro implicitamente.
4. Erros esperados são dados estruturados, não texto ou exceção. Exceção fica reservada a falha de transporte/processo sem resposta.
5. Toda mutação gera evento de auditoria com ator, ação, alvo, `beforeHash`, `afterHash`, horário e recibo.
6. Promoção é uma ação separada, disruptiva, autorizada pela sessão admin e por challenge server-side de uso único; concluir avaliação não promove nada.
7. `ArenaExecutionContext` é construído pelo adapter confiável depois de autenticar a request; `principal` e `promotionAuthorizer` nunca são desserializados do body de `ArenaCommand` nem substituíveis pelo chamador.

Projeção HTTP recomendada, ainda inexistente:

- `GET /api/arena` -> `describe()`;
- `POST /api/arena/commands` -> `execute()`;
- `GET /api/arena/runs/:runId` e sub-recursos -> `observe()`;
- `GET /api/actions` -> descritores agent-first de `arena.*`.

## 5. Identidade, canonicalização e imutabilidade

`ExperimentSpec`, `BotGenome`, manifests e avaliações usam JSON Canonicalization Scheme (RFC 8785) e SHA-256. Hashes têm formato `sha256:<64-hex>`. IDs derivados não podem depender de caminho local, timestamp, ordem de propriedades ou segredo.

```ts
type ArtifactRef = {
  id: string;
  version: string;
  hash: `sha256:${string}`;
};

type RandomnessMode = "deterministic" | "seeded";

type ScenarioRandomness =
  | {
      randomnessMode: "deterministic";
      expectedInitialStateHash: `sha256:${string}`;
    }
  | {
      randomnessMode: "seeded";
      requestedSeed: string;
      rngAlgorithm: string;
      rngVersion: string;
      expectedInitialStateHash: `sha256:${string}`;
    };

type RandomnessReceipt =
  | {
      randomnessMode: "deterministic";
      expectedInitialStateHash: `sha256:${string}`;
      effectiveInitialStateHash: `sha256:${string}`;
      requestedSeed: null;
      effectiveSeed: null;
      rngAlgorithm: null;
      rngVersion: null;
    }
  | {
      randomnessMode: "seeded";
      expectedInitialStateHash: `sha256:${string}`;
      effectiveInitialStateHash: `sha256:${string}`;
      requestedSeed: string;
      effectiveSeed: string;
      rngAlgorithm: string;
      rngVersion: string;
    };
```

Em `deterministic`, o runner não inventa uma seed: ele congela o estado inicial esperado e captura o estado inicial efetivo depois da inicialização do `GameApp`. Os dois hashes devem coincidir. Variar um label de seed não cria diversidade e é proibido nesse modo.

Em `seeded`, a `requestedSeed` DEVE ser injetada em toda fonte de aleatoriedade que afete a simulação — arena, spawn, drops e regras — por um RNG com algoritmo/versão congelados. O runner captura `effectiveSeed` e `effectiveInitialStateHash`. Seed, RNG ou estado divergente gera `randomness_mismatch`; aleatoriedade de apresentação, como variação de áudio, não participa do estado semântico.

Depois que `arena.experiment.start` aceita um `ExperimentSpec`, seu `experimentId` e conteúdo ficam imutáveis. Pausa, progresso e veredito pertencem à Execução, nunca reescrevem o spec.

## 6. `ExperimentSpec`

```ts
interface ExperimentSpec {
  schemaVersion: "botevolutionarena.v0.1";
  experimentId: string; // hash do conteúdo sem este campo
  profile: "conformance" | "promotion";
  title: string;
  hypothesis: string;
  createdBy: string;
  artifacts: {
    gameBuild: ArtifactRef;
    ruleset: ArtifactRef;
    runner: ArtifactRef;
    evaluator: ArtifactRef;
  };
  baselineGenomeId: string;
  explicitCandidateGenomeIds: string[];
  seedGenomes: BotGenome[];
  search: SearchPlan;
  train: ScenarioManifest;
  holdout: HoldoutCommitment;
  sampleSize: SampleSizePlan | null;
  diversity: DiversityFloor;
  metrics: MetricSpec[];
  gates: GateSpec[];
  budget: BudgetSpec;
  stopping: StoppingSpec;
  processPolicy: ProcessPolicy;
}

type SearchPlan =
  | { mode: "explicit"; orderedCandidateGenomeIds: string[] }
  | {
      mode: "finite-mutation-grid";
      parentGenomeIds: string[];
      mutationOperators: MutationOperator[];
      maxGeneratedGenomes: number;
      selection: "lexicographic-v0.1";
    };

interface ScenarioCell {
  cellId: string;
  partition: "train" | "holdout";
  arena: ArtifactRef;
  ruleset: ArtifactRef;
  randomness: ScenarioRandomness;
  testedSeat: 1 | 2 | 3 | 4;
  opponentGenomeIds: string[];
  opponentSeatOrder: string[];
  characterSelection: Record<string, string>;
  repetition: number;
}

interface ScenarioManifest {
  manifestHash: string;
  cells: ScenarioCell[];
}

interface HoldoutCommitment {
  vaultId: string;
  commitmentHash: string;
  expectedCellCount: number;
  minimumDistinctArenas: number;
  minimumDistinctEffectiveStates: number;
}

interface HoldoutRevealReceipt {
  vaultId: string;
  commitmentHash: string;
  revealedManifestHash: string;
  runId: string;
  candidateGenomeId: string;
  candidateFrozenAt: string;
  revealedByActorId: string;
  revealedByRole: "evaluator";
  revealedAt: string;
}

interface HoldoutVault {
  commit(manifest: ScenarioManifest): Promise<HoldoutCommitment>;
  reveal(input: {
    vaultId: string;
    runId: string;
    candidateGenomeId: string;
    expectedCommitmentHash: string;
    runState: "candidate-frozen";
    actorRole: "evaluator";
  }): Promise<{ manifest: ScenarioManifest; receipt: HoldoutRevealReceipt }>;
}

interface SampleSizePlan {
  method: "paired-binary-power-v0.1";
  alpha: number;
  power: number;
  minimumCompetitiveEffect: number;
  assumedDiscordantPairRate: number;
  requiredTrainPairs: number;
  requiredHoldoutPairs: number;
  calculation: ArtifactRef;
}

interface DiversityFloor {
  minimumDistinctArenas: number;
  minimumDistinctEffectiveStates: number;
  minimumOpponentRosters: number;
  requireBalancedSeats: boolean;
}

interface MutationOperator {
  id: string;
  targetPath: string;
  operation: "set" | "add" | "multiply" | "choose";
  allowedValues: Array<string | number | boolean>;
}

interface MetricSpec {
  id: string;
  layer: "infrastructure" | "raw" | "protected";
  direction: "minimize" | "maximize";
  aggregation: "count" | "rate" | "paired-delta" | "percentile";
  nonRegressionGate: boolean;
  minimumCompetitiveEffect: number | null;
}

interface GateSpec {
  id: string;
  metricId: string;
  partitions: Array<"train" | "holdout">;
  comparison: "absolute" | "candidate-lte-baseline" | "candidate-gte-baseline" | "paired-ci-lower-bound-gte";
  threshold: number;
}

interface BudgetSpec {
  maxConcurrentRounds: number;
  maxTicksPerRound: number;
  maxWallClockMsPerRound: number;
  maxProviderCallsPerRound: number;
  maxTokensPerRun: number | null;
  maxCostPerRun: number | null;
}

interface ProcessPolicy {
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  gracefulShutdownMs: number;
  forcedShutdownMs: number;
  leakCheckDelayMs: number;
  requireOwnedProcessGroup: true;
}
```

O validator v0.1 rejeita um spec que:

- não contenha exatamente um Baseline presente em `seedGenomes`;
- reutilize `genomeId` com conteúdo diferente;
- não congele build, ruleset, runner e evaluator por hash;
- omita budget, gates ou critérios de parada;
- tenha Células duplicadas por fingerprint sem marcá-las como `repetition`;
- permita mutação de código-fonte, comando de shell, URL arbitrária ou segredo dentro de um Genoma.

Regras condicionais por profile:

- `conformance` usa entre 2 e 8 Células de Treino e entre 2 e 8 de Holdout, exercita commit/reveal e avaliação de ponta a ponta, pode usar `sampleSize: null` e sempre produz `promotionEligibility: "not-eligible"`;
- `promotion` exige `sampleSize` com `0 < alpha <= 0.1`, `0.8 <= power < 1` e efeito positivo; o evaluator recalcula o plano pelo artefato versionado e rejeita números divergentes; `MetricSpec.minimumCompetitiveEffect` de `win_rate` deve ser igual ao plano; quantidades planejadas devem ser iguais ou maiores que `requiredTrainPairs/requiredHoldoutPairs`; e cada partição deve ter pelo menos 3 arenas efetivas, 12 estados iniciais efetivos distintos, 2 rosters de adversários e rotação de assento cuja contagem difira em no máximo 1;
- em ambos os profiles, `holdout.expectedCellCount` precisa corresponder ao manifest comprometido.

O fingerprint declarado de uma Célula inclui arena/ruleset por hash, `ScenarioRandomness`, assento, adversários e ordem, personagens e repetição. O fingerprint efetivo substitui a expectativa por `effectiveInitialStateHash` comprovado. No modo `deterministic`, nenhum valor de seed participa do fingerprint. No modo `seeded`, seeds diferentes só contam como diversidade quando produzem estados iniciais efetivos diferentes. Repetir a mesma fixture 100 vezes continua sendo um fingerprint com 100 repetições, não 100 cenários distintos.

## 7. `BotGenome` e famílias

```ts
interface BotGenome {
  schemaVersion: "botgenome.v0.1";
  genomeId: string; // hash canônico do conteúdo sem este campo
  lineage: {
    parentGenomeIds: string[];
    generation: number;
    mutationId: string | null;
  };
  family: "deterministic" | "preset" | "model" | "hybrid";
  adapter: ArtifactRef;
  personality: {
    aggression: number;       // [0, 1]
    riskAversion: number;     // [0, 1]
    exploration: number;      // [0, 1]
    powerUpPriority: number;  // [0, 1]
    opponentPressure: number; // [0, 1]
    minimumEscapeMarginMs: number;
  };
  controller: DeterministicGenes | PresetGenes | ModelGenes | HybridGenes;
}

interface DeterministicGenes {
  kind: "deterministic";
  policyVersion: string;
  parameters: Record<string, string | number | boolean>;
}

interface PresetGenes {
  kind: "preset";
  intentLibrary: ArtifactRef;
  priorityOrder: string[];
  parameters: Record<string, string | number | boolean>;
}

interface ModelGenes {
  kind: "model";
  providerAdapter: ArtifactRef;
  requestedProvider: string;
  requestedModel: string;
  prompt: ArtifactRef;
  reasoning: string;
  decisionCadenceMs: number;
  maxPlanHorizonMs: number;
  temperature: number | null;
  fallbackGenomeId: string | null;
}

interface HybridGenes {
  kind: "hybrid";
  planner: ModelGenes | PresetGenes;
  executorGenomeId: string;
  safetyGenomeId: string;
  fallbackGenomeId: string;
}

interface GeneratedGenomeRecord {
  schemaVersion: "generatedgenome.v0.1";
  runId: string;
  experimentId: string;
  genome: BotGenome;
  parentGenomeIds: string[];
  mutationOperatorIds: string[];
  generatedAt: string;
  recordHash: `sha256:${string}`;
}
```

Invariantes de Genoma:

1. Todo campo DEVE ser declarado como consumido pelo `AdapterDescriptor`; campo desconhecido ou ignorado falha com `unsupported_gene`.
2. A família efetiva e todos os adapters executados são gravados na evidência. Um fallback muda a proveniência da ação, não a identidade nominal do Genoma.
3. `model` pode emitir ações diretamente; `hybrid` separa intenção/plano, Safety Shield, executor determinístico e fallback.
4. Na v0.1, mutação altera apenas dados declarativos allowlisted. Código, prompts fora do `ArtifactRef`, dependências e executáveis não são mutáveis.
5. Parâmetros fora do domínio aceito falham na validação; não são silenciosamente clampados pelo adapter.
6. `seedGenomes` e regras/limites de busca pertencem ao Experimento. Cada Genoma produzido por `finite-mutation-grid` pertence à Execução como `GeneratedGenomeRecord` append-only; gerar um candidato nunca reescreve o `ExperimentSpec`.

## 8. Matriz pareada, Treino e Holdout

Para cada Candidato explícito ou `GeneratedGenomeRecord` selecionado e Célula de Treino, o scheduler DEVE executar uma observação do Baseline e uma do Candidato com:

- mesmo build, ruleset, arena e estado inicial efetivo; em `seeded`, também a mesma seed efetivamente aplicada;
- mesmo assento testado, personagens e adversários congelados;
- mesmo limite de ticks e orçamento por Rodada;
- ordem de execução alternada de forma determinística para reduzir viés temporal;
- `pairId` comum e recibos independentes.

O Baseline pode ser cacheado somente quando todos os hashes e a Célula forem idênticos e o recibo cacheado tiver integridade válida. Provider/model não determinístico exige `attemptIndex` e a mesma quantidade predeclarada de tentativas para Baseline e Candidato.

O Holdout segue estas regras:

1. Seu manifest é gerado e comprometido por hash no `HoldoutVault` antes da primeira mutação; o `ExperimentSpec` e `observe()` expõem somente o compromisso e metadados de contagem, nunca um resolver.
2. Randomness, Células e detalhes ficam inacessíveis ao mutador, ao planner, ao seletor e ao runner durante o Treino.
3. Após a seleção, congela-se um único Candidato final por linhagem e a Execução entra em `candidate-frozen`; somente o papel autenticado `evaluator` pode então chamar `HoldoutVault.reveal` e iniciar `holdout-running`.
4. O hash do manifest revelado DEVE coincidir com `commitmentHash`; qualquer divergência é `holdout_commitment_mismatch`.
5. Nenhuma métrica de Holdout volta ao processo de mutação. Reusar o Holdout para corrigir o Candidato contamina a partição e exige novo Experimento e novo compromisso.
6. O reveal produz `HoldoutRevealReceipt` com Candidato congelado, ator/role e horários auditáveis.
7. Promoção exige profile `promotion`, Candidato e Baseline na matriz Holdout completa e pareada. Profile `conformance` nunca promove.

`HoldoutVault` é um seam interno e privado, não uma rota listável pelo mutador. O `actorRole: "evaluator"` é derivado pelo servidor da identidade/capability do evaluator da Execução e nunca aceito como autoridade autodeclarada no body.

## 9. Evidência de rodada

`RoundEvidence` é append-only, ordenada por sequência monotônica e fechada por hash. O evento terminal não pode apagar eventos anteriores.

```ts
interface RoundEvidence {
  schemaVersion: "roundevidence.v0.1";
  experimentId: string;
  runId: string;
  roundId: string;
  pairId: string;
  attemptIndex: number;
  candidateRole: "baseline" | "candidate";
  partition: "train" | "holdout";
  scenarioCellId: string;
  build: ArtifactRef;
  ruleset: ArtifactRef;
  runner: ArtifactRef;
  policy: { genomeId: string; family: BotGenome["family"]; adapter: ArtifactRef };
  randomness: RandomnessReceipt;
  startedAt: string;
  endedAt: string;
  termination: RoundTermination;
  modelInvocations: ModelInvocationEvidence[];
  events: RoundEvent[];
  counters: RoundCounters;
  semanticEvidenceHash: `sha256:${string}`;
  previousRecordHash: `sha256:${string}` | null;
  recordHash: `sha256:${string}`;
}

type RoundTermination =
  | { status: "completed"; reason: "elimination" | "timer" | "double-ko"; terminalTick: number }
  | { status: "incomplete"; reason: "operational-timeout" | "cancelled" | "runner-failure" | "telemetry-gap"; terminalTick: null };

interface ControllerIdentity {
  id: string;
  kind: "deterministic" | "preset" | "model" | "hybrid" | "safety";
  version: string;
  provider: string | null;
  model: string | null;
}

interface BotAction {
  kind: string;
  parameters: Record<string, string | number | boolean | null>;
}

interface ActionEvent {
  type: "action";
  sequence: number;
  tick: number;
  playerId: string;
  requestedAction: BotAction | null;
  safetyDecision: { verdict: "allow" | "replace" | "block" | "invalid"; reasonCode: string | null };
  executedAction: BotAction | null;
  outcome: {
    status: "executed" | "blocked" | "stalled" | "invalid" | "skipped" | "timeout";
    reasonCode: string | null;
    fallbackUsed: boolean;
    timedOut: boolean;
  };
  provenance: {
    requester: ControllerIdentity;
    safety: ControllerIdentity | null;
    executor: ControllerIdentity | null;
  };
}

interface DeathEvent {
  type: "death";
  sequence: number;
  tick: number;
  victimId: string;
  cause: "bomb-blast" | "sudden-death" | "skill" | "disconnect" | "environment" | "unknown";
  fatalSourceBombId: string | null;
  fatalSourceOwnerId: string | null;
  causalBombChain: Array<{ bombId: string; ownerId: string; triggeredByBombId: string | null }>;
  attribution: "complete" | "partial" | "unknown";
  selfKo: true | false | null;
  selfContributedKo: true | false | null;
}

interface RoundCompletedEvent {
  type: "round-completed";
  sequence: number;
  tick: number;
  reason: "elimination" | "timer" | "double-ko";
  winnerIds: string[];
  finalSnapshotHash: `sha256:${string}`;
}

type RoundEvent = ActionEvent | DeathEvent | RoundCompletedEvent;

interface ModelInvocationEvidence {
  requestId: string;
  requestedProvider: string;
  requestedModel: string;
  effectiveProvider: string | null;
  effectiveModel: string | null;
  providerRequestId: string | null;
  promptHash: string;
  responseHash: string | null;
  status: "ok" | "timeout" | "rejected" | "error";
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
}

interface RoundCounters {
  completedRounds: 0 | 1;
  deaths: number;
  selfKOs: number;
  selfKoUnknown: number;
  selfContributedKOs: number;
  actions: number;
  invalidRequestedActions: number;
  invalidExecutedActions: number;
  fallbackActions: number;
  safetyInterventions: number;
  timeouts: number;
  stalledActions: number;
  bombsPlaced: number;
  eliminations: number;
}
```

Semântica obrigatória:

- `selfKo === true` quando a morte por `bomb-blast` tem `fatalSourceOwnerId === victimId`. Se uma cadeia contiver bomba da vítima, mas a fonte letal for outra, isso também é contado separadamente como `selfContributedKo`; não se altera silenciosamente `selfKo`.
- `selfKo === null` quando houve explosão, mas bomba/proprietário não puderam ser atribuídos. O evaluator trata `null` como telemetria incompleta, nunca como `false`.
- `selfContributedKo === true` quando qualquer bomba da cadeia causal pertence à vítima; fica `null` se a cadeia necessária à atribuição estiver incompleta.
- Uma Conclusão real exige exatamente um evento `round-completed`, estado terminal coerente no snapshot final e `termination.status === "completed"`.
- Atingir limite de ticks, wall clock, custo ou provider timeout sem terminal do ruleset produz `incomplete/operational-timeout`. Não soma empate, vitória, sobrevivência nem Rodada concluída.
- Toda chamada de modelo citada DEVE ter `effectiveProvider` e `effectiveModel` comprovados. Ausência impede comparação de modelos; um label pedido não é prova de execução.
- Requested action, decisão do Safety Shield, ação executada e outcome permanecem distinguíveis. Intervenção e fallback são contados mesmo quando salvam o bot.
- Lacuna de sequência, evento duplicado, hash inválido, snapshot terminal ausente, randomness divergente ou morte sem atribuição obrigatória invalidam a Célula e falham fechados.
- `semanticEvidenceHash` cobre somente identidade semântica do experimento/cenário/política, randomness efetiva, término, provider/modelo/prompt/response efetivos, eventos e counters. Exclui `runId`, `roundId`, `pairId`, horários, IDs de request do provider, latência/custo, `previousRecordHash` e os próprios campos de hash.
- `recordHash` cobre o envelope canônico inteiro, exceto o próprio campo, incluindo IDs operacionais, horários, custos e `previousRecordHash`. A chain usa ordem determinística `(partition, scenarioCellId, candidateRole, attemptIndex)`, nunca ordem de término concorrente.
- Reexecutar uma política determinística sobre o mesmo estado inicial deve reproduzir `semanticEvidenceHash`; `recordHash` deve mudar para preservar a nova execução auditável.

Compatibilidade pendente: [`src/BotLab/round-evidence.ts`](../src/BotLab/round-evidence.ts) já aceita `selfKo: true | false | null`, conta `selfKoUnknown` e prova que explosão sem bomba/proprietário atribuídos não vira `false`. Ele ainda não satisfaz sozinho `roundevidence.v0.1`: faltam integração causal com o `GameApp`, envelope completo, randomness receipt e os hashes semântico/operacional.

## 10. Métricas e agregação

Métricas são predeclaradas em `ExperimentSpec.metrics`; não se adiciona métrica decisiva depois de observar resultados.

Métricas mínimas por partição e por família:

| Métrica | Unidade e fórmula |
|---|---|
| `round_completion_rate` | Conclusões reais / Rodadas planejadas. Timeout operacional fica no denominador e não no numerador. |
| `win_rate` | Rodadas com vitória / Conclusões reais. Também reportar denominador planejado para evitar sobrevivorship bias. |
| `survival_rate` | Conclusões reais em que o avaliado termina vivo / Rodadas planejadas. |
| `self_ko_rate` | `selfKo === true` / Rodadas planejadas. `null` invalida o gate, não reduz a taxa. |
| `self_contributed_ko_rate` | Mortes em cuja cadeia existe bomba da vítima / Rodadas planejadas. |
| `eliminations` | Eliminações atribuídas ao avaliado por Rodada planejada. |
| `bomb_efficiency` | Bombas que quebram crate, coletam valor estratégico ou contribuem para eliminação / bombas plantadas; componentes também são reportados. |
| `invalid_action_rate` | Solicitações inválidas / solicitações totais no Bruto; ações inválidas executadas / ações executadas no Protegido. |
| `stall_rate` | Ações de movimento sem progresso após janela predeclarada / ações de movimento. |
| `fallback_rate` | Ações fornecidas por fallback / decisões executadas. |
| `safety_intervention_rate` | `replace + block + invalid` / solicitações. |
| `timeout_rate` | Chamadas/planos com timeout / chamadas/planos. |
| `latency_ms` | p50, p95 e máximo por adapter; média isolada não basta. |
| `model_cost` | Tokens e custo total, por Rodada planejada e por Conclusão real. |

O evaluator agrega primeiro por Célula pareada, depois entre Células; ticks e microações nunca são tratados como amostras independentes de qualidade jogável. Intervalos de 95% usam bootstrap pareado de Células com 10.000 reamostragens e seed derivada de `evaluationHash`, tornando o cálculo reproduzível.

Fitness de Treino v0.1 é lexicográfica:

1. integridade e segurança;
2. menor `self_ko_rate` e `self_contributed_ko_rate`;
3. maior Conclusão real e sobrevivência;
4. maior delta competitivo pareado;
5. menor intervenção/fallback;
6. menor custo e latência.

Uma soma ponderada única é proibida porque permitiria “comprar” suicídios com vitórias ou UI/latência.

## 11. Vereditos e hard gates

Toda avaliação produz três vereditos independentes:

```ts
interface EvaluationReport {
  profile: "conformance" | "promotion";
  infrastructure: "pass" | "fail" | "inconclusive";
  rawBehavior: "pass" | "reject" | "inconclusive" | "not-applicable";
  protectedBehavior: "pass" | "reject" | "inconclusive";
  promotionEligibility: "eligible" | "not-eligible";
  train: PartitionEvaluation;
  holdout: PartitionEvaluation;
  failedGates: GateResult[];
  evidenceManifestHash: string;
  evaluationHash: string;
}

interface PartitionEvaluation {
  partition: "train" | "holdout";
  plannedCells: number;
  completedPairs: number;
  baselineMetrics: Record<string, number>;
  candidateMetrics: Record<string, number>;
  pairedDeltas: Record<string, { effect: number; ci95Low: number; ci95High: number }>;
}

interface GateResult {
  gateId: string;
  status: "pass" | "fail" | "inconclusive";
  observed: number | null;
  threshold: number | null;
  evidenceRefs: string[];
  reasonCode: string;
}
```

Hard gates de infraestrutura obrigatórios em ambos os profiles:

1. **Integridade:** 100% das Rodadas planejadas têm evidência íntegra, randomness esperada igual à efetiva, exatamente um término e par Baseline/Candidato correspondente. Qualquer lacuna torna infraestrutura `fail` ou `inconclusive`, nunca `pass`.
2. **Conclusão:** 100% das Rodadas usadas no cálculo atingem Conclusão real. Timeout operacional não pode ser convertido em empate. Falha do provider antes do terminal torna a comparação comportamental inconclusiva.
3. **Identidade:** build, ruleset, runner, evaluator, adapter, provider e modelo efetivamente executados conferem com o spec. Identidade de modelo não comprovada impede alegação comparativa sobre modelo.
4. **Execução protegida:** zero ação inválida pode alcançar o `GameApp`; toda substituição, bloqueio, timeout e fallback permanece contabilizada.
5. **Processos:** ao terminar/cancelar, zero recurso registrado como owned pela Execução permanece ativo após o cleanup final.
6. **Holdout:** commitment válido, nenhum overlap com Treino, Candidato congelado antes da revelação, reveal pelo role `evaluator` e matriz pareada completa.

Hard gates adicionais do profile `promotion`:

7. **Self-KO:** o Candidato NÃO PODE ter mais Self-KOs que o Baseline em Treino nem em Holdout. Qualquer `selfKo === null` impede o gate de passar.
8. **Fallback honesto:** a taxa de fallback deve respeitar o máximo predeclarado. Se o fallback determinístico controla a maioria das decisões, o relatório não pode atribuir o resultado ao modelo.
9. **Competitividade:** no Holdout, a amostra deve satisfazer `SampleSizePlan`, o delta pareado de `win_rate` deve alcançar `minimumCompetitiveEffect` e o limite inferior do intervalo de 95% não pode ser negativo. Amostra insuficiente é `inconclusive`.
10. **Diversidade:** os fingerprints efetivos devem satisfazer `DiversityFloor`; seed nominal ou repetição não aumenta diversidade.
11. **Regressões predeclaradas:** métricas adicionais marcadas `nonRegressionGate` no spec devem passar separadamente; não podem ser compensadas por score global.

Para política `hybrid`, um Bruto rejeitado e um Protegido aprovado significa: “a política integrada protegida é elegível”, nunca “o modelo bruto ficou seguro”. Em `promotion`, só há `eligible` quando infraestrutura e comportamento protegido passam no Treino e no Holdout, o Baseline foi pareado e nenhum hard gate falhou. Em `conformance`, `promotionEligibility` é sempre `not-eligible`, mesmo com todos os checks verdes. Toda promoção ainda exige sessão admin, challenge válido e hash esperado atual.

## 12. Estados e transições

```ts
type RunState =
  | "accepted"
  | "queued"
  | "running"
  | "paused"
  | "candidate-frozen"
  | "holdout-running"
  | "evaluating"
  | "completed"
  | "failed"
  | "cancelled";

interface RunRecord {
  runId: string;
  experimentId: string;
  state: RunState;
  resumeState: "running" | "holdout-running" | null;
  stateVersion: number;
  startedAt: string | null;
  endedAt: string | null;
  plannedRounds: number;
  completedRounds: number;
  generatedGenomes: GeneratedGenomeRecord[];
  holdoutReveal: HoldoutRevealReceipt | null;
  budgetConsumed: Record<string, number>;
  evidenceManifestHash: string | null;
  evaluationHash: string | null;
  terminalError: ArenaError | null;
}
```

Transições permitidas:

```text
accepted -> queued -> running
running | holdout-running -> paused -> resumeState
running -> candidate-frozen -> holdout-running -> evaluating -> completed
accepted | queued | running | paused | candidate-frozen | holdout-running | evaluating -> cancelled
queued | running | paused | candidate-frozen | holdout-running | evaluating -> failed
```

Estados terminais são `completed`, `failed` e `cancelled`. `completed` significa que a pipeline terminou e possui `EvaluationReport`; não significa que o Candidato passou. Estado terminal nunca volta a ativo. Repetição exige novo `runId`, preservando o anterior.

Uma pausa grava `resumeState`, interrompe novos agendamentos e cancela/fecha de maneira registrada chamadas que não podem ser suspensas; não deixa processos sem dono. `cancel` é idempotente. `failed` exige `ArenaError` terminal e manifesto parcial de evidência. Entrar em `candidate-frozen` persiste o Genoma selecionado e seu hash antes de qualquer reveal do Holdout.

## 13. Erros estáveis

```ts
type ArenaErrorCode =
  | "unsupported_schema"
  | "invalid_spec"
  | "unsupported_gene"
  | "unknown_adapter"
  | "adapter_unhealthy"
  | "idempotency_conflict"
  | "run_state_conflict"
  | "build_mismatch"
  | "randomness_mismatch"
  | "provider_identity_unverified"
  | "telemetry_incomplete"
  | "evidence_corrupt"
  | "pair_incomplete"
  | "holdout_commitment_mismatch"
  | "holdout_contaminated"
  | "budget_exhausted"
  | "process_leak"
  | "hard_gate_failed"
  | "admin_session_required"
  | "promotion_challenge_invalid"
  | "profile_not_promotable"
  | "promotion_stale";

interface ArenaError {
  code: ArenaErrorCode;
  category: "validation" | "conflict" | "infrastructure" | "evidence" | "budget" | "authorization";
  message: string;
  retryable: boolean;
  details: Record<string, string | number | boolean | null>;
  causeReceiptId: string | null;
}
```

| Código | Semântica | Retry |
|---|---|---|
| `unsupported_schema` | Versão de contrato não suportada. | não |
| `invalid_spec` | Campo/invariante do Experimento inválido. | não |
| `unsupported_gene` | Gene não consumido ou valor fora do domínio do adapter. | não |
| `unknown_adapter` | Adapter não descrito pelo runtime. | não |
| `adapter_unhealthy` | Adapter conhecido, mas probe/saúde falhou. | sim, nova Execução |
| `idempotency_conflict` | Chave reapareceu com payload diferente. | não |
| `run_state_conflict` | `expectedState` não coincide com o estado atual. | sim após observar |
| `build_mismatch` | Build/ruleset/runner efetivo diverge do spec. | não na mesma Execução |
| `randomness_mismatch` | Estado determinístico divergiu ou seed/RNG/estado efetivo não conferiu. | não na Célula |
| `provider_identity_unverified` | Provider/modelo efetivo não comprovado. | sim após corrigir adapter |
| `telemetry_incomplete` | Sequência, terminal, morte ou ação obrigatória não observável. | não na mesma evidência |
| `evidence_corrupt` | Hash, canonicalização ou sequência inválida. | não |
| `pair_incomplete` | Falta Baseline ou Candidato correspondente. | sim antes de avaliar |
| `holdout_commitment_mismatch` | Manifest revelado não corresponde ao compromisso. | não |
| `holdout_contaminated` | Holdout vazou ou retroalimentou a busca. | não; novo Experimento |
| `budget_exhausted` | Limite predeclarado atingido. | não na Execução |
| `process_leak` | Recurso owned pela Execução continua vivo após cleanup final. A Execução fica terminal e irrecuperável. | não; nova Execução |
| `hard_gate_failed` | Avaliação completa reprovou gate. | não; novo Candidato |
| `admin_session_required` | Challenge ou promoção sem sessão admin autenticada. | sim após autenticar |
| `promotion_challenge_invalid` | Challenge ausente, expirado, usado ou não vinculado ao comando canônico. | sim com novo challenge |
| `profile_not_promotable` | Promoção solicitada para profile `conformance`. | não; novo Experimento `promotion` |
| `promotion_stale` | Genoma atual mudou desde `expectedCurrentGenomeId`. | sim após observar/reavaliar |

Mensagens de provider, prompts, respostas e variáveis de ambiente são redigidos antes de entrar em `details`. Segredos nunca entram em recibos ou hashes públicos.

## 14. Critérios de parada

`StoppingSpec` DEVE declarar todos os limites antes de iniciar:

```ts
interface StoppingSpec {
  maxGenerations: number;
  maxGeneratedGenomes: number;
  maxPlannedRounds: number;
  maxWallClockMs: number;
  maxModelInvocations: number;
  maxTokens: number | null;
  maxCost: number | null;
  plateau: { generations: number; minimumFitnessDelta: number };
  stopWhenTrainTargetReached: boolean;
}
```

A busca para por, nesta ordem auditável:

1. cancelamento humano;
2. falha de integridade, randomness, processo ou holdout;
3. exaustão de qualquer orçamento;
4. objetivo de Treino atingido, congelando o Candidato e iniciando Holdout;
5. plateau predeclarado;
6. máximo de gerações/genomas/Rodadas.

“Até dar certo”, número de gerações alterado após observar métricas e continuar depois de reprovar Holdout são proibidos. Reprovação de Holdout encerra o Experimento; aprender com ela exige novo Experimento e novo Holdout.

## 15. Lifecycle e propriedade de processos

Cada Execução possui um único supervisor, um `processGroupId` e um ledger de recursos owned. Todo worker, adapter de provider, subprocesso, task/thread dedicada, stream, arquivo temporário, porta, claim e reservation criado para a Execução recebe `runId` e owner explícito. Threads de housekeeping compartilhadas do supervisor não pertencem a uma Execução e não entram no gate.

```ts
interface ProcessRecord {
  runId: string;
  processGroupId: string;
  pid: number;
  parentPid: number | null;
  role: string;
  startedAt: string;
  heartbeatAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  termination: "natural" | "graceful" | "forced" | "lost" | null;
}
```

Lifecycle obrigatório:

1. validar spec e budgets sem iniciar processos;
2. criar recibo `accepted`, diretório isolado e registro de ownership;
3. iniciar workers dentro de process group/Windows Job Object equivalente, com heartbeat e deadline;
4. propagar pausa/cancelamento e `AbortSignal` até chamadas de provider;
5. no teardown, parar agendamento, solicitar encerramento gracioso, esperar até grace period predeclarado, terminar, aguardar exit e só então fechar logs/handles;
6. enumerar somente processos/tasks e recursos registrados como owned pelo `runId`; nunca matar processos globalmente por nome;
7. liberar claims/reservations em `finally` idempotente;
8. registrar PID, parent PID, start/end, exit code, motivo e método de encerramento;
9. executar uma tentativa final de cleanup e depois o leak check; qualquer recurso owned sobrevivente gera `process_leak`, torna a Execução terminal/irrecuperável e impede `completed/pass`. A limpeza posterior pode remover o recurso, mas nunca reclassifica aquela Execução.

Reinício do supervisor pode adotar uma Execução somente se comprovar ownership pelo registro persistido e identidade do processo. Caso contrário, marca a Execução `failed` e faz cleanup conservador dos recursos comprovadamente próprios.

## 16. Isolamento do produto público e retenção

- O módulo da arena não é rota de jogador, entrada Vite pública nem requisito para iniciar o jogo.
- Evidências, modelos, logs e replays NÃO DEVEM ficar em `public/`, `dist/` ou assets importados pelo cliente.
- O root local recomendado é `output/bot-evolution-arena/v0.1/<runId>/`, configurável para storage externo.
- Cada Execução produz `experiment.json`, `run.json`, `evidence/`, `evaluation.json`, `processes.json` e `manifest.json` com hashes relativos, sem caminhos absolutos como identidade.
- Evidência grande pode permanecer fora do Git, mas o `manifest.json` deve ser portátil e verificável. Uma promoção precisa preservar ou publicar o manifest e os artefatos referenciados em storage auditável.
- A política definitiva de retenção continua aberta no mapa #24; até ela existir, artefatos de uma Execução ligada a promoção não podem ser apagados.
- Nenhum segredo, auth header, cookie, chave, prompt privado bruto ou response payload sensível é persistido. Guardam-se hashes e metadados redigidos suficientes para auditoria.

## 17. Action Registry agent-first

O Action Registry é a fonte de verdade operacional. `describe().capabilities.actions` e `GET /api/actions` devem derivar do mesmo registro, nunca de listas duplicadas.

Cada `ArenaActionDescriptor` inclui:

- `id`, título e descrição sem ambiguidade;
- JSON Schema de entrada e saída;
- estados em que a ação é permitida;
- `readOnly`, `destructive`, `disruptive`, `requiresHumanConfirmation` e `confirmationMechanism`;
- regra de idempotência e campos de optimistic concurrency;
- permissões necessárias;
- erros possíveis e retryability;
- versão do contrato e exemplo mínimo válido.

Ações mínimas são as sete variantes de `ArenaCommand` definidas na seção 4. `arena.run.cancel` é disruptiva; `arena.promotion.challenge.issue` exige sessão admin; `arena.candidate.promote` é disruptiva e exige a mesma sessão admin mais challenge válido. O registry não pode anunciar uma ação cuja implementação retorna sucesso fictício ou ignora campos.

O actor da confirmação é derivado da sessão admin existente no Worker, nunca aceito do body. O adapter autenticado constrói `ArenaExecutionContext` e injeta a dependência `PromotionAuthorizer`; a arena falha fechada se principal, permissão ou authorizer verificável estiver ausente. `arena.promotion.challenge.issue` pede ao authorizer um nonce criptograficamente aleatório, expiração curta e `canonicalCommandHash` sobre `action + runId + candidateGenomeId + evaluationHash + expectedCurrentGenomeId + actorId`. O nonce é devolvido uma única vez, armazenado hashed e vinculado à sessão. Na promoção, `PromotionAuthorizer.consumeChallenge` verifica autorização, sessão, permissão, correspondência integral, consumo atômico e `usedAt === null`; challenge usado, expirado, de outro ator ou para outro payload falha. Não há `signature` vaga nem autorização por campos não vazios fornecidos pelo cliente. A arena ainda verifica profile `promotion`, todos os gates e `expectedCurrentGenomeId` no momento da escrita.

## 18. Critérios de aceite por módulo subsequente

### 18.1 Runner

O runner está aceito quando:

- usa `GameApp` headless e seus métodos server-authoritative; não reimplementa bombas, flames, colisão, skills, Sudden Death ou término;
- injeta políticas por seam explícito e suporta ao menos dois adapters reais antes de generalizar o seam;
- executa Rodadas completas em tick fixo, sem render obrigatório;
- em `deterministic`, comprova estado inicial esperado/efetivo sem fabricar seed; em `seeded`, aplica e comprova seed/RNG requested/effective em toda aleatoriedade de simulação;
- materializa matriz pareada com rotação de assentos e adversários congelados;
- distingue terminal do ruleset de timeout operacional;
- reproduz uma Célula determinística com o mesmo `semanticEvidenceHash` e novo `recordHash` auditável;
- cancela e fecha todos os recursos sob teste de falha/timeout.

### 18.2 Evidence recorder

O recorder está aceito quando:

- registra build/ruleset/arena/policy/adapter por hash;
- registra ação solicitada, Safety Shield, ação executada, outcome e proveniência;
- atribui morte a vítima, causa, bomba, proprietário e cadeia causal; Self-KO sem atribuição completa fica `null`;
- registra provider/modelo solicitado e efetivo, latency, timeout, tokens/custo quando disponíveis;
- garante sequência monotônica, canonicalização, hash chain e exatamente um término;
- calcula separadamente `semanticEvidenceHash` e `recordHash`, com chain em ordem determinística;
- falha fechada para lacuna, duplicação, randomness divergente, Self-KO desconhecido em gate ou terminal incoerente;
- não contém segredo e pode ser verificado sem o processo original.

### 18.3 Evaluator

O evaluator está aceito quando:

- consome somente manifests/evidências imutáveis e verifica todos os hashes antes de calcular;
- pareia por Célula e rejeita denominadores diferentes ou pares faltantes;
- calcula métricas por Rodada/Célula, não por tick como amostra independente;
- separa infraestrutura, Bruto e Protegido;
- aplica gates lexicograficamente, incluindo Self-KO, conclusão, integridade, processo e holdout;
- usa bootstrap pareado reproduzível e informa efeito, intervalo e denominador;
- produz `inconclusive`, não `pass`, quando amostra, identidade ou telemetria são insuficientes;
- em `conformance`, exercita a pipeline mas fixa `promotionEligibility: "not-eligible"`; em `promotion`, valida `SampleSizePlan` e `DiversityFloor` antes dos gates competitivos;
- nunca promove automaticamente e assina `evaluationHash` sobre spec + manifest + resultados.

### 18.4 Action Registry e adapters externos

Estão aceitos quando:

- `describe/execute/observe` são o único seam de regras e HTTP/CLI/testes são adapters finos;
- schemas, estados, confirmação, idempotência, auditoria e erros estão visíveis no registry;
- repetir comando idempotente não duplica Execução nem promoção;
- optimistic concurrency rejeita ação stale;
- challenge de promoção é emitido/consumido por `PromotionAuthorizer` server-side sob sessão admin verificada e vinculado ao comando canônico; campos do body não concedem autoridade;
- `observe()` permite ao Codex acompanhar progresso, budgets, processos, evidência e gates sem ler arquivos internos;
- capacidades e saúde distinguem “configurado”, “probe verificado” e “executado nesta Rodada”;
- rotas da arena permanecem fora da experiência pública e falham fechadas sem autorização.

## 19. Critérios de aceite integrados da v0.1

### 19.1 Profile `conformance`: arena funcional

A v0.1 pode ser declarada funcional quando uma Execução pequena, de ponta a ponta, demonstrar:

1. spec `conformance`, Baseline e Candidato imutáveis aceitos por `execute()`;
2. entre 2 e 8 Células de Treino e entre 2 e 8 de Holdout, todas pareadas; esse tamanho prova integração, não qualidade estatística;
3. `deterministic` com estado inicial esperado/efetivo idêntico ou `seeded` com seed/RNG/estado requested/effective comprovados;
4. Candidato congelado em `candidate-frozen`, seguido de reveal do `HoldoutVault` pelo role `evaluator` e transição para `holdout-running`;
5. evidência causal auditável, Self-KO tri-state, camadas de decisão, `semanticEvidenceHash` reproduzível e `recordHash` de auditoria;
6. três vereditos separados e gates de infraestrutura predeclarados;
7. nenhum timeout contado como Conclusão real;
8. zero recurso owned pela Execução restante após cleanup final;
9. `promotionEligibility: "not-eligible"` e tentativa de promoção rejeitada com `profile_not_promotable`;
10. artefatos verificáveis fora do bundle público.

### 19.2 Profile `promotion`: evidência comportamental suficiente

Além das garantias funcionais já demonstradas pelo profile `conformance` — sem herdar seus limites pequenos de amostra — uma promoção exige uma Execução `promotion` que demonstre:

1. `SampleSizePlan` predeclarado, com cálculo versionado, `alpha`, power, efeito mínimo e pares planejados suficientes em Treino e Holdout;
2. `DiversityFloor` satisfeito por fingerprints efetivos — no mínimo 3 arenas, 12 estados iniciais efetivos, 2 rosters e seats balanceados por partição;
3. Baseline e Candidato na matriz completa e pareada, sem feedback do Holdout para a busca;
4. todos os hard gates de infraestrutura e comportamento aprovados, inclusive Self-KO, fallback honesto, competitividade e não regressões;
5. tentativa sem sessão admin, com challenge ausente/usado/expirado, hash stale ou gate reprovado rejeitada por testes;
6. promoção bem-sucedida somente após challenge server-side vinculado ao comando canônico e consumido atomicamente.

Até o `conformance` passar, a formulação correta é “infraestrutura da arena em construção”. Depois dele, mas antes de um profile `promotion` aprovado, a formulação é “arena funcional, qualidade comportamental ainda não comprovada”. Testes focais de bot, número de microações, catálogo de providers, HUD, seeds nominais e fixtures repetidas não constituem prova de evolução comportamental.

## 20. Fora de escopo da v0.1

- mutação automática de código-fonte;
- deploy ou promoção automática;
- UI administrativa final;
- algoritmo evolutivo aberto/autoalterável além de lista explícita ou grid finito declarativo;
- simulador paralelo ao `GameApp`;
- hospedar a arena no Sharingan;
- escolher agora a retenção definitiva de replays grandes;
- habilitar provider apenas porque aparece num catálogo sem probe e chamada efetiva.
