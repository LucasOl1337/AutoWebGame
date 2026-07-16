import { runBotShortFuseLabScenario } from "../Engine/bot-short-fuse-lab-scenario";
import type { Direction } from "../Gameplay/types";

const directionLabels: Record<Direction, string> = {
  up: "para cima",
  down: "para baixo",
  left: "à esquerda",
  right: "à direita",
};

const root = document.querySelector<HTMLElement>("#bot-short-fuse-lab");
if (!root) throw new Error("Bot short fuse lab root not found");

root.innerHTML = `
  <header class="fuse-lab__header">
    <div>
      <p class="fuse-lab__eyebrow">AUTOWEBGAME · CENÁRIO CONTROLADO</p>
      <h1>Fuga antes do pavio curto</h1>
      <p>Veja por que a IA recusa uma bomba quando o Short Fuse encurta a rota disponível.</p>
    </div>
    <span class="fuse-lab__controller">IA DETERMINÍSTICA LOCAL</span>
  </header>

  <section class="fuse-lab__identity" aria-label="Bot observado e saúde">
    <div><span>Bot observado</span><strong data-bot>—</strong></div>
    <div><span>Controlador</span><strong>Política local</strong></div>
    <div><span>Saúde</span><strong>SAUDÁVEL</strong></div>
    <div><span>Decisão válida</span><strong>SIM · SNAPSHOT</strong></div>
    <div><span>Custo</span><strong data-latency>—</strong></div>
  </section>

  <section class="fuse-lab__stage" aria-label="Orçamento da fuga">
    <div class="fuse-lab__route" aria-label="Rota de fuga necessária">
      <div class="fuse-lab__route-label"><span>ROTA DE FUGA NECESSÁRIA</span><strong data-required-steps>—</strong></div>
      <div class="fuse-lab__tiles">
        <span class="fuse-lab__tile fuse-lab__tile--bomb"><b data-bot-marker>—</b><small>BOMBA</small></span>
        <span class="fuse-lab__tile fuse-lab__tile--blast">1<small>EXPLOSÃO</small></span>
        <span class="fuse-lab__tile fuse-lab__tile--limit">2<small>LIMITE</small></span>
        <span class="fuse-lab__tile fuse-lab__tile--safe"><b data-safe-step>—</b><small>SEGURO</small></span>
      </div>
      <div class="fuse-lab__timeline"><span data-budget-bar></span></div>
      <p data-budget-caption>Calculando orçamento real…</p>
    </div>

    <div class="fuse-lab__decision">
      <div class="fuse-lab__telemetry" aria-label="Leitura visual do orçamento do pavio">
        <div class="fuse-lab__dial" data-budget-dial style="--budget-ratio: 0" aria-hidden="true">
          <strong data-budget-percent>—</strong><small>FUSE</small>
        </div>
        <div class="fuse-lab__telemetry-copy">
          <span data-budget-state>ORÇAMENTO EM LEITURA</span>
          <strong data-budget-read>Calculando rota</strong>
          <p data-budget-note>O anel compara passos disponíveis e passos exigidos.</p>
        </div>
      </div>
      <span data-status>ANALISANDO</span>
      <h2 data-intention>Revalidando a rota</h2>
      <p data-reason>A política mede fuse, velocidade e reserva antes de atacar.</p>
      <dl>
        <div><dt>Fuse real</dt><dd data-fuse>—</dd></div>
        <div><dt>Tempo por passo</dt><dd data-step-ms>—</dd></div>
        <div><dt>Reserva</dt><dd data-reserve>—</dd></div>
        <div><dt>Passos disponíveis</dt><dd data-steps>—</dd></div>
        <div><dt>Comando emitido</dt><dd data-last-decision>—</dd></div>
        <div><dt>Pós-comando</dt><dd data-outcome>—</dd></div>
      </dl>
    </div>
  </section>

  <section class="fuse-lab__comparison" aria-label="Comparação antes e depois">
    <article class="fuse-lab__card fuse-lab__card--before">
      <span>REFERÊNCIA ANTES</span>
      <strong data-before>—</strong>
      <p>O avaliador de referência usa o fuse padrão da política anterior.</p>
    </article>
    <article class="fuse-lab__card fuse-lab__card--after">
      <span data-observed-card>POLÍTICA ATUAL</span>
      <strong data-after>—</strong>
      <p>Usa o fuse real do Short Fuse e recusa a autoarmadilha.</p>
    </article>
    <article class="fuse-lab__card fuse-lab__card--peer">
      <span data-peer-card>MESMO MAPA</span>
      <strong data-peer>—</strong>
      <p>Com deslocamento suficiente, a bomba continua permitida.</p>
    </article>
  </section>

  <footer class="fuse-lab__footer">
    <div><strong>Ação humana</strong><p>Nenhuma durante a partida. Investigue se o fuse exibido não combinar com o power-up do bot.</p></div>
    <button type="button" data-replay>Recalcular snapshot</button>
  </footer>
`;

const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing short fuse lab element: ${selector}`);
  return element;
};

function renderSnapshot(): void {
  const observed = runBotShortFuseLabScenario(2, 2, 0);
  const peer = runBotShortFuseLabScenario(3, 2, 1);
  const refusesBomb = !observed.decision.placeBomb;
  const formatSeconds = (milliseconds: number): string => `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(milliseconds / 1000)} s`;
  const movementLabel = observed.decision.direction
    ? `Avançar ${directionLabels[observed.decision.direction]} · sem bomba`
    : "Aguardar · sem bomba";
  const budgetRatio = Math.min(1, observed.budget.maxEscapeSteps / Math.max(1, observed.requiredEscapeSteps));
  const budgetPercent = Math.round(budgetRatio * 100);
  const budgetShortfall = observed.requiredEscapeSteps - observed.budget.maxEscapeSteps;

  getElement("[data-bot]").textContent = observed.botLabel;
  getElement("[data-bot-marker]").textContent = observed.botLabel.replace("Bot ", "");
  getElement("[data-required-steps]").textContent = `${observed.requiredEscapeSteps} passos`;
  getElement("[data-safe-step]").textContent = String(observed.requiredEscapeSteps);
  getElement("[data-observed-card]").textContent = `POLÍTICA ATUAL · ${observed.botLabel.replace("Bot ", "")}`;
  getElement("[data-peer-card]").textContent = `MESMO MAPA · ${peer.botLabel.replace("Bot ", "")} + VELOCIDADE ${peer.speedLevel}`;
  getElement("[data-latency]").textContent = `${observed.latencyMs.toFixed(2)} ms`;
  getElement("[data-fuse]").textContent = `${formatSeconds(observed.budget.fuseMs)} · Short Fuse ${observed.shortFuseLevel}`;
  getElement("[data-step-ms]").textContent = `${observed.budget.moveDurationMs} ms`;
  getElement("[data-reserve]").textContent = `${observed.budget.reserveMs} ms`;
  getElement("[data-steps]").textContent = `${observed.budget.maxEscapeSteps} de ${observed.requiredEscapeSteps}`;
  getElement("[data-before]").textContent = `${formatSeconds(observed.legacyFuseMs)} · ${observed.legacyMaxEscapeSteps} passos · ${observed.referenceBeforeDecision.placeBomb ? "PLANTAVA" : "RECUSAVA"}`;
  getElement("[data-after]").textContent = `${formatSeconds(observed.budget.fuseMs)} · ${observed.budget.maxEscapeSteps} passos · ${refusesBomb ? "RECUSA" : "PLANTA"}`;
  getElement("[data-peer]").textContent = `${formatSeconds(peer.budget.fuseMs)} · ${peer.budget.maxEscapeSteps} passos · ${peer.decision.placeBomb ? "PLANTA" : "RECUSA"}`;
  getElement("[data-budget-dial]").style.setProperty("--budget-ratio", String(budgetRatio));
  getElement("[data-budget-percent]").textContent = `${budgetPercent}%`;
  getElement("[data-budget-state]").textContent = budgetShortfall > 0 ? "ROTA ACIMA DO FUSE" : "ROTA DENTRO DO FUSE";
  getElement("[data-budget-state]").dataset.state = budgetShortfall > 0 ? "critical" : "viable";
  getElement("[data-budget-read]").textContent = budgetShortfall > 0
    ? `${observed.budget.maxEscapeSteps}/${observed.requiredEscapeSteps} passos cobertos`
    : `${observed.budget.maxEscapeSteps}/${observed.requiredEscapeSteps} passos cobertos · margem ${observed.budget.maxEscapeSteps - observed.requiredEscapeSteps}`;
  getElement("[data-budget-note]").textContent = budgetShortfall > 0
    ? `Faltam ${budgetShortfall} passo${budgetShortfall === 1 ? "" : "s"} para a fuga ser segura.`
    : "A reserva permite plantar e sair antes da explosão.";
  getElement("[data-budget-caption]").textContent = `${observed.budget.usableEscapeMs} ms úteis: a rota segura começa no passo ${observed.requiredEscapeSteps}.`;
  getElement("[data-budget-bar]").style.setProperty("--budget-ratio", `${observed.budget.maxEscapeSteps / observed.requiredEscapeSteps}`);
  getElement("[data-status]").textContent = refusesBomb ? "BOMBA RECUSADA" : "BOMBA AUTORIZADA";
  getElement("[data-status]").dataset.state = refusesBomb ? "refused" : "allowed";
  getElement("[data-intention]").textContent = refusesBomb ? "Contornar antes de atacar" : "Plantar e escapar";
  getElement("[data-reason]").textContent = refusesBomb
    ? `Short Fuse: a saída exige ${observed.requiredEscapeSteps} passos, mas o fuse real comporta ${observed.budget.maxEscapeSteps}.`
    : "A rota cabe no fuse real com a reserva de segurança preservada.";
  getElement("[data-last-decision]").textContent = refusesBomb ? movementLabel : "Plantar bomba";
  getElement("[data-outcome]").textContent = "NÃO OBSERVADO · snapshot de decisão";
}

getElement<HTMLButtonElement>("[data-replay]").addEventListener("click", renderSnapshot);
renderSnapshot();
