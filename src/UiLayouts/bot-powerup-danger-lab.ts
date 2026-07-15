import { getPowerUpDefinition } from "../Gameplay/powerups";
import { runBotPowerUpDangerLabScenario } from "../Engine/bot-powerup-danger-lab-scenario";

const labRoot = document.querySelector<HTMLElement>("#bot-powerup-danger-lab");
if (!labRoot) throw new Error("bot-powerup-danger-lab root ausente");
const root: HTMLElement = labRoot;

function formatMs(value: number): string {
  return `${value.toLocaleString("pt-BR")} ms`;
}

function render(): void {
  const scenario = runBotPowerUpDangerLabScenario();
  const emptyRoute = scenario.emptyRouteSignal;
  const pickupRoute = scenario.pickupRouteSignal;
  const measuredAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
  const objective = getPowerUpDefinition("shield-up");

  root.innerHTML = `
    <section class="pu-shell" aria-labelledby="pu-title">
      <header class="pu-header">
        <div>
          <p class="pu-eyebrow">AUTOWEBGAME · CENÁRIO CONTROLADO</p>
          <h1 id="pu-title">Fugir sem desperdiçar o escudo</h1>
          <p>Entre rotas igualmente seguras, a IA determinística aproveita o power-up no caminho sem trocar sobrevivência por recompensa.</p>
        </div>
        <button type="button" data-replay>Recalcular sinal</button>
      </header>

      <section class="pu-observer" aria-label="Bot observado, controlador e validade">
        <div class="pu-avatar" aria-hidden="true">P2</div>
        <div><span>BOT OBSERVADO</span><strong>Bot P2 · treino</strong></div>
        <div><span>CONTROLADOR</span><strong>IA determinística local</strong></div>
        <div class="pu-health"><span>SAÚDE</span><strong>DECISÃO RESPONDENDO</strong></div>
        <div><span>VALIDADE</span><strong>SNAPSHOT VERIFICADO</strong></div>
      </section>

      <section class="pu-stage" aria-label="Perigo, rotas seguras e objetivo">
        <div class="pu-board" aria-hidden="true">
          <div class="pu-bomb">BOMBA<br><small>1,00 s</small></div>
          <div class="pu-blast">LINHA DE EXPLOSÃO</div>
          <div class="pu-bot">P2</div>
          <div class="pu-route pu-route--empty">↑<small>rota vazia</small></div>
          <div class="pu-route pu-route--pickup">↓<small>rota + escudo</small></div>
          <div class="pu-shield">SH</div>
        </div>

        <article class="pu-decision">
          <p class="pu-state"><span aria-hidden="true">✓</span> FUGIR COLETANDO ESCUDO</p>
          <h2>${objective.label} · tile (3,4)</h2>
          <p>${pickupRoute.reason}</p>
          <dl>
            <div><dt>Utilidade relativa</dt><dd>${pickupRoute.utility} pontos ordinais</dd></div>
            <div><dt>ETA planejada</dt><dd>${pickupRoute.distanceSteps} passo · ${formatMs(pickupRoute.arrivalEtaMs)}</dd></div>
            <div><dt>Perigo percebido</dt><dd>explosão em ${formatMs(pickupRoute.dangerEtaMs ?? 0)}</dd></div>
            <div><dt>Margem de fuga</dt><dd>+${formatMs(pickupRoute.escapeMarginMs ?? 0)}</dd></div>
            <div><dt>Saídas seguras</dt><dd>${pickupRoute.safeNeighborCount} na rota com escudo · ${emptyRoute.safeNeighborCount} na vazia</dd></div>
            <div><dt>Comando emitido</dt><dd>${scenario.decision.direction === "down" ? "baixo" : scenario.decision.direction ?? "nenhum"} · ${scenario.decision.placeBomb ? "com bomba" : "sem bomba"}</dd></div>
            <div><dt>Custo por decisão</dt><dd>mediana ${scenario.medianDecisionMs.toFixed(3).replace(".", ",")} ms · p95 ${scenario.p95DecisionMs.toFixed(3).replace(".", ",")} ms</dd></div>
            <div><dt>Recalculado às</dt><dd>${measuredAt}</dd></div>
          </dl>
        </article>
      </section>

      <section class="pu-comparison" aria-label="Comparação antes e depois">
        <article class="pu-card pu-card--before">
          <span>ANTES · ORDEM FIXA</span>
          <strong>${scenario.legacyPickupRouteCount}/${scenario.samples} fugas pelo escudo</strong>
          <p>O avaliador executável da ordem antiga escolhe a rota vazia em ${scenario.legacyEmptyRouteCount}/${scenario.samples} decisões.</p>
          <small>comando: cima · coleta durante a fuga: 0%</small>
        </article>
        <article class="pu-card pu-card--after">
          <span>AGORA · SEGURANÇA, DEPOIS UTILIDADE</span>
          <strong>${scenario.pickupRouteCount}/${scenario.samples} fugas pelo escudo</strong>
          <p>O número de saídas seguras continua dominante; o escudo só vence quando a topologia empata.</p>
          <small>comando: baixo · intenção: fugir coletando escudo</small>
        </article>
      </section>

      <footer class="pu-result">
        <div><span>RESULTADO APÓS O COMANDO</span><strong>NÃO OBSERVADO · snapshot de decisão</strong></div>
        <p>O benchmark mede escolha de rota, não confirma que o escudo foi coletado. Nenhum modelo 9Router participou deste cenário.</p>
        <small>Ação humana: nenhuma. Investigue se a rota escolhida tiver menos saídas seguras que a alternativa.</small>
      </footer>
    </section>
  `;

  root.querySelector<HTMLButtonElement>("[data-replay]")?.addEventListener("click", render);
}

render();
