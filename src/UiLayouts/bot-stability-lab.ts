import "./bot-stability-lab.css";
import { getStableBotDirection, type BotContext } from "../Engine/bot-ai";
import {
  getBotDirectionStabilitySignal,
  type BotDirectionStabilityPhase,
} from "../Engine/bot-direction-stability";
import { BASE_MOVE_MS, TILE_SIZE } from "../PersonalConfig/config";
import type { Direction, PlayerState } from "../Gameplay/types";

const root = document.querySelector<HTMLElement>("#bot-stability-lab");
if (!root) {
  throw new Error("Bot stability lab root not found");
}

root.innerHTML = `
  <header class="route-lab__header">
    <div>
      <p class="route-lab__eyebrow">AUTOWEBGAME · CENÁRIO CONTROLADO</p>
      <h1>Rota firme sem meia-volta</h1>
      <p>Observe quando a IA determinística mantém a rota e quando aceita uma inversão.</p>
    </div>
    <span class="route-lab__controller">IA DETERMINÍSTICA LOCAL</span>
  </header>

  <section class="route-lab__identity" aria-label="Bot observado e saúde">
    <div><span>Bot observado</span><strong>Bot P2 · treino</strong></div>
    <div><span>Saúde</span><strong data-health>ESTÁVEL</strong></div>
    <div><span>Decisão válida</span><strong data-valid>SIM</strong></div>
    <div><span>Custo da decisão</span><strong data-latency>—</strong></div>
  </section>

  <section class="route-lab__stage" aria-label="Simulação da rota">
    <div class="route-lab__track" aria-hidden="true">
      <span class="route-lab__center route-lab__center--origin"></span>
      <span class="route-lab__center route-lab__center--target"></span>
      <span class="route-lab__bot" data-bot-marker>P2</span>
    </div>
    <div class="route-lab__decision">
      <span data-phase>PREPARANDO</span>
      <h2 data-intention>Virar para cima</h2>
      <p data-reason>A política ainda não executou o primeiro passo.</p>
      <dl>
        <div><dt>Direção executada</dt><dd data-committed>baixo</dd></div>
        <div><dt>Direção solicitada</dt><dd data-requested>cima</dd></div>
        <div><dt>Confirmações</dt><dd data-pending>0</dd></div>
        <div><dt>Distância do centro</dt><dd data-offset>—</dd></div>
      </dl>
    </div>
  </section>

  <section class="route-lab__comparison" aria-label="Comparação antes e depois">
    <article class="route-lab__card route-lab__card--before">
      <span>REFERÊNCIA ANTES</span>
      <strong>11,5 px fora do centro</strong>
      <p>Virava no frame 2 após apenas 1 frame de avanço.</p>
    </article>
    <article class="route-lab__card route-lab__card--after">
      <span>POLÍTICA ATUAL</span>
      <strong data-result>Aguardando execução</strong>
      <p data-outcome>Mantém a rota enquanto avançar for seguro.</p>
    </article>
  </section>

  <section class="route-lab__footer">
    <div>
      <strong>O que o operador precisa fazer?</strong>
      <p>Nada durante a partida. Use este cenário para verificar regressões de oscilação.</p>
    </div>
    <button type="button" data-replay>Repetir cenário</button>
  </section>
`;

const labels: Record<BotDirectionStabilityPhase, { status: string; reason: string }> = {
  idle: { status: "SEM INTENÇÃO", reason: "Nenhuma direção foi solicitada." },
  aligned: { status: "ROTA ALINHADA", reason: "A direção solicitada já coincide com a rota atual." },
  "holding-route": {
    status: "ESTABILIZANDO ROTA",
    reason: "A inversão é válida, mas aguarda o centro do tile para evitar oscilação.",
  },
  "turn-ready": { status: "VIRADA ACEITA", reason: "O bot alcançou um ponto de virada estável." },
  "danger-override": { status: "FUGA IMEDIATA", reason: "Perigo próximo libera a inversão sem espera." },
  "blocked-override": { status: "ROTA BLOQUEADA", reason: "Sem avanço possível; a inversão foi liberada." },
};

const directionLabels: Record<Direction, string> = {
  up: "cima",
  down: "baixo",
  left: "esquerda",
  right: "direita",
};

const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing bot lab element: ${selector}`);
  return element;
};

const phaseElement = getElement<HTMLElement>("[data-phase]");
const reasonElement = getElement<HTMLElement>("[data-reason]");
const healthElement = getElement<HTMLElement>("[data-health]");
const validElement = getElement<HTMLElement>("[data-valid]");
const latencyElement = getElement<HTMLElement>("[data-latency]");
const committedElement = getElement<HTMLElement>("[data-committed]");
const requestedElement = getElement<HTMLElement>("[data-requested]");
const pendingElement = getElement<HTMLElement>("[data-pending]");
const offsetElement = getElement<HTMLElement>("[data-offset]");
const resultElement = getElement<HTMLElement>("[data-result]");
const outcomeElement = getElement<HTMLElement>("[data-outcome]");
const marker = getElement<HTMLElement>("[data-bot-marker]");
const replayButton = getElement<HTMLButtonElement>("[data-replay]");

let timer: number | null = null;

function runScenario(): void {
  if (timer !== null) window.clearInterval(timer);

  const player = {
    id: 2,
    tile: { x: 5, y: 5 },
    position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE * 0.75 },
    direction: "down",
    lastMoveDirection: "down",
    speedLevel: 0,
  } as PlayerState;
  const context = {
    botCommittedDirection: { 2: "down" },
    botPendingReverseDirection: { 2: null },
    botPendingReverseFrames: { 2: 0 },
    dangerMap: new Map(),
    evaluateMovementOption: () => ({ advances: true }),
    canMovementOptionAdvance: () => true,
    areOppositeDirections: (a: Direction, b: Direction) => (
      (a === "up" && b === "down") || (a === "down" && b === "up")
      || (a === "left" && b === "right") || (a === "right" && b === "left")
    ),
  } as unknown as BotContext;

  let frame = 0;
  let forwardFrames = 0;
  replayButton.disabled = true;
  healthElement.textContent = "ESTÁVEL";
  validElement.textContent = "SIM";
  resultElement.textContent = "Aguardando ponto de virada";
  outcomeElement.textContent = "Mantém a rota enquanto avançar for seguro.";

  const step = (): void => {
    frame += 1;
    const committedDirection = context.botCommittedDirection[player.id];
    const requestedDirection: Direction = "up";
    const signal = getBotDirectionStabilitySignal({
      position: player.position,
      committedDirection,
      requestedDirection,
      pendingFrames: context.botPendingReverseFrames[player.id],
      oppositeRequest: true,
      immediateDanger: false,
      canContinueForward: true,
      centerTolerancePx: TILE_SIZE * (1000 / 60) / BASE_MOVE_MS,
      requestConfirmed: context.botPendingReverseDirection[player.id] === requestedDirection
        ? context.botPendingReverseFrames[player.id] + 1 >= 2
        : false,
    });
    const startedAt = performance.now();
    const stableDirection = getStableBotDirection(player, requestedDirection, 1000 / 60, context);
    const latencyMs = performance.now() - startedAt;
    const presentation = labels[signal.phase];

    phaseElement.textContent = presentation.status;
    phaseElement.dataset.phase = signal.phase;
    reasonElement.textContent = presentation.reason;
    latencyElement.textContent = `${latencyMs.toFixed(2)} ms`;
    committedElement.textContent = stableDirection ? directionLabels[stableDirection] : "nenhuma";
    requestedElement.textContent = directionLabels[requestedDirection];
    pendingElement.textContent = String(context.botPendingReverseFrames[player.id]);
    offsetElement.textContent = `${signal.centerOffsetPx.toFixed(1)} px`;
    validElement.textContent = signal.decisionStillValid ? "SIM" : "NÃO";

    const progress = Math.min(1, Math.max(0, (player.position.y - (5 * TILE_SIZE + TILE_SIZE / 2)) / TILE_SIZE));
    marker.style.setProperty("--route-progress", progress.toFixed(3));

    if (stableDirection === "up") {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      phaseElement.textContent = labels["turn-ready"].status;
      phaseElement.dataset.phase = "turn-ready";
      reasonElement.textContent = labels["turn-ready"].reason;
      resultElement.textContent = `${signal.centerOffsetPx.toFixed(1)} px do centro · frame ${frame}`;
      outcomeElement.textContent = `A rota anterior foi preservada por ${forwardFrames} frames antes da inversão.`;
      replayButton.disabled = false;
      return;
    }

    forwardFrames += 1;
    player.position.y += 1.5;
    player.tile.y = Math.floor(player.position.y / TILE_SIZE);
  };

  step();
  timer = window.setInterval(step, 90);
}

replayButton.addEventListener("click", runScenario);
runScenario();
