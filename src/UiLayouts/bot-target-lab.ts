import { runBotTargetLabScenario } from "../Engine/bot-target-lab-scenario";
import type { BotTargetCandidateSignal } from "../Engine/bot-target-selection";

const labRoot = document.querySelector<HTMLElement>("#bot-target-lab");
if (!labRoot) throw new Error("bot-target-lab root ausente");
const root: HTMLElement = labRoot;

const directionLabels: Record<string, string> = {
  up: "cima",
  down: "baixo",
  left: "esquerda",
  right: "direita",
  hold: "aguardar",
};

function targetReason(signal: BotTargetCandidateSignal): string {
  if (signal.reasonCode === "exposed-capacity-committed") {
    return `P${signal.targetId} está sem escudo e com a capacidade de plantar ocupada; o mapa atual projeta ETA efetiva de ${((signal.commitmentRemainingMs ?? 0) / 1000).toFixed(1).replace(".", ",")} s e não há detonação remota.`;
  }
  if (signal.reasonCode === "exposed-contained") {
    return `P${signal.targetId} está exposto e possui apenas ${signal.openEscapeRoutes} saída livre.`;
  }
  if (signal.reasonCode === "nearest-exposed") return `P${signal.targetId} é o alvo exposto de menor custo.`;
  if (signal.reasonCode === "shielded-fallback") return `P${signal.targetId} ainda possui escudo, mas é a melhor alternativa disponível.`;
  return `P${signal.targetId} está protegido; perseguir é apenas um fallback de patrulha.`;
}

function formatCost(value: number): string {
  return value.toFixed(3).replace(".", ",");
}

function render(): void {
  const scenario = runBotTargetLabScenario();
  const selected = scenario.selected;
  const closeTarget = scenario.signal.candidates.find((candidate) => candidate.targetId === 1);
  const measuredAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

  root.innerHTML = `
    <section class="target-shell" aria-labelledby="target-title">
      <header class="target-header">
        <div>
          <p class="target-eyebrow">AUTOWEBGAME · CENÁRIO CONTROLADO</p>
          <h1 id="target-title">Atacar a janela, não só o mais perto</h1>
          <p>A IA determinística compara distância, proteção, rotas de fuga e disponibilidade de bombas antes de comprometer a perseguição.</p>
        </div>
        <button type="button" data-replay>Recalcular decisão</button>
      </header>

      <section class="target-observer" aria-label="Bot observado, controlador, saúde e validade">
        <div class="target-avatar" aria-hidden="true">P2</div>
        <div><span>BOT OBSERVADO</span><strong>Bot P2 · treino</strong></div>
        <div><span>CONTROLADOR ATUAL</span><strong>IA determinística local</strong></div>
        <div class="target-health"><span>SAÚDE</span><strong>DECISÃO RESPONDENDO</strong></div>
        <div><span>VALIDADE</span><strong>SNAPSHOT VERIFICADO</strong></div>
      </section>

      <section class="target-stage" aria-label="Arena e decisão de alvo">
        <div class="target-board" aria-label="P2 entre P1 com escudo e P3 exposto">
          <div class="target-player target-player--shielded"><b>P1</b><small>ESCUDO · 2 passos</small></div>
          <div class="target-route target-route--old">← antes</div>
          <div class="target-player target-player--bot"><b>P2</b><small>BOT OBSERVADO</small></div>
          <div class="target-route target-route--new">agora →</div>
          <div class="target-player target-player--exposed"><b>P3</b><small>EXPOSTO · CAPACIDADE OCUPADA</small></div>
        </div>

        <article class="target-decision">
          <p class="target-state"><span aria-hidden="true">✓</span> ALVO P${selected.targetId} · CAPACIDADE OCUPADA</p>
          <h2>${scenario.decision.intent === "chase-enemy" && scenario.decision.targetId === selected.targetId ? `Perseguir P${selected.targetId}` : "Decisão sem perseguição"} para a ${directionLabels[scenario.decision.direction ?? "hold"]}</h2>
          <p>${targetReason(selected)}</p>
          <dl>
            <div><dt>Objetivo atual</dt><dd>P${selected.targetId} · ${selected.defenseState === "exposed" ? "sem proteção" : selected.defenseState}</dd></div>
            <div><dt>Distância</dt><dd>${selected.distanceSteps} passos</dd></div>
            <div><dt>Rotas de fuga do alvo</dt><dd>${selected.openEscapeRoutes} livres</dd></div>
            <div><dt>Capacidade de plantar</dt><dd>${selected.bombCapacityCommitted ? `ocupada · ETA efetiva ${((selected.commitmentRemainingMs ?? 0) / 1000).toFixed(1).replace(".", ",")} s · sem remoto` : "não confirmada como ocupada"}</dd></div>
            <div><dt>Custo de prioridade</dt><dd>${selected.score.toFixed(1).replace(".", ",")} · menor vence</dd></div>
            <div><dt>Comando emitido</dt><dd>${directionLabels[scenario.decision.direction ?? "hold"]} · ${scenario.decision.placeBomb ? "plantar bomba" : "sem bomba"}</dd></div>
            <div><dt>Custo da avaliação</dt><dd>mediana ${formatCost(scenario.medianDecisionMs)} ms · p95 ${formatCost(scenario.p95DecisionMs)} ms</dd></div>
            <div><dt>Recalculado às</dt><dd>${measuredAt}</dd></div>
          </dl>
        </article>
      </section>

      <section class="target-comparison" aria-label="Comparação antes e depois">
        <article class="target-card target-card--before">
          <span>ANTES · SOMENTE DISTÂNCIA</span>
          <strong>${scenario.legacyTargetCounts.P1 ?? 0}/${scenario.samples} escolhiam P1</strong>
          <p>O alvo dois passos mais perto vencia mesmo com um escudo pronto para absorver o ataque.</p>
          <small>P1 · custo legado 2 · janela defensiva ignorada</small>
        </article>
        <article class="target-card target-card--after">
          <span>AGORA · VULNERABILIDADE + DISTÂNCIA</span>
          <strong>${scenario.selectedTargetCounts.P3 ?? 0}/${scenario.samples} escolhem P3</strong>
          <p>P3 está um passo mais longe, sem escudo e não pode plantar outra bomba neste snapshot.</p>
          <small>P3 ${selected.score.toFixed(1).replace(".", ",")} pontos · P1 ${closeTarget?.score.toFixed(1).replace(".", ",") ?? "?"} pontos</small>
        </article>
      </section>

      <footer class="target-result">
        <div><span>RESULTADO APÓS O COMANDO</span><strong>NÃO OBSERVADO · snapshot de decisão</strong></div>
        <p>O benchmark confirma escolha e direção, não uma eliminação. Nenhum modelo 9Router participou deste cenário.</p>
        <small>Ação humana: nenhuma. Compare novamente se o alvo recuperar escudo ou bombas.</small>
      </footer>
    </section>
  `;

  root.querySelector<HTMLButtonElement>("[data-replay]")?.addEventListener("click", render);
}

render();
