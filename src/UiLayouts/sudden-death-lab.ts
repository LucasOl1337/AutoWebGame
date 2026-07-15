import { getSuddenDeathPressureSignal } from "../Engine/bot-sudden-death-pressure";
import { SUDDEN_DEATH_LAB_EVIDENCE as evidence } from "./sudden-death-lab-evidence";

const labRoot = document.querySelector<HTMLElement>("#sudden-death-lab");
if (!labRoot) throw new Error("sudden-death-lab root ausente");
const root: HTMLElement = labRoot;

const scenario = {
  botTile: { x: 3, y: 2 },
  centerTile: { x: 5, y: 4 },
  transitTile: { x: 2, y: 2 },
  destinationTile: { x: 2, y: 3 },
  closesInMs: evidence.route.closingTileEtaMs,
};

function render(): void {
  const startedAt = performance.now();
  const decisionSignal = getSuddenDeathPressureSignal({
    candidateTile: scenario.destinationTile,
    centerTile: scenario.centerTile,
    currentDistanceToCenter: 4,
    routeContinuity: false,
  });
  const latencyMs = performance.now() - startedAt;
  const measuredAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

  root.innerHTML = `
    <section class="sd-shell" aria-labelledby="sd-title">
      <header class="sd-header">
        <div>
          <p class="sd-eyebrow">AUTOWEBGAME · SNAPSHOT CONTROLADO</p>
          <h1 id="sd-title">Rota viva no Sudden Death</h1>
          <p>O bot pode cruzar uma passagem que fecha em breve quando alcança o destino seguro antes do impacto.</p>
        </div>
        <button type="button" data-replay>Recalcular sinal</button>
      </header>

      <section class="sd-observer" aria-label="Bot observado, controlador e saúde">
        <div class="sd-avatar" aria-hidden="true">P2</div>
        <div><span>BOT OBSERVADO</span><strong>Bot P2 · treino</strong></div>
        <div><span>CONTROLADOR</span><strong>IA determinística local</strong></div>
        <div class="sd-health"><span>SAÚDE</span><strong>BENCHMARK VERIFICADO</strong></div>
      </section>

      <section class="sd-stage" aria-label="Zona de fechamento e rota escolhida">
        <div class="sd-board" aria-hidden="true">
          <span class="sd-edge">BORDA FECHANDO</span>
          <div class="sd-lane">
            <span class="sd-danger"></span>
            <span class="sd-tile sd-tile--out">PASSAGEM</span>
            <span class="sd-bot">P2</span>
            <span class="sd-tile sd-tile--in">DESTINO</span>
            <span class="sd-center">SEGURO</span>
          </div>
          <div class="sd-arrow">← <small>depois</small> ↓</div>
        </div>
        <div class="sd-intention">
          <span>ÚLTIMA INTENÇÃO</span>
          <h2>${decisionSignal.intention}</h2>
          <p>${decisionSignal.reason}</p>
          <dl>
            <div><dt>Zona percebida</dt><dd>Passagem (2,2) fechando</dd></div>
            <div><dt>Próximo impacto</dt><dd>${scenario.closesInMs} ms</dd></div>
            <div><dt>Rota executada</dt><dd>esquerda → baixo</dd></div>
            <div><dt>Validade</dt><dd>saída prevista antes do impacto</dd></div>
            <div><dt>Custo deste sinal</dt><dd>${latencyMs < 0.01 ? "<0,01" : latencyMs.toFixed(2).replace(".", ",")} ms</dd></div>
            <div><dt>Sinal recalculado às</dt><dd>${measuredAt}</dd></div>
          </dl>
        </div>
      </section>

      <section class="sd-comparison" aria-label="Comparação antes e depois">
        <article class="sd-card sd-card--before">
          <span>ANTES · UMA JANELA PARA TUDO</span>
          <strong>${evidence.before.survivalCount}/${evidence.sampleSize} sobreviveram</strong>
          <p>A janela final de 2,1 s também bloqueava a passagem transitória; P2 morreu aos ${evidence.before.deathAtMs.toLocaleString("pt-BR")} ms.</p>
          <small>primeiro comando: nenhum · fuga abortada</small>
        </article>
        <article class="sd-card sd-card--after">
          <span>AGORA · JANELAS POR ETAPA</span>
          <strong>${evidence.after.survivalCount}/${evidence.sampleSize} sobreviveram</strong>
          <p>A passagem usa janela de chegada; o destino mantém a janela estratégica de 2,1 s.</p>
          <small>destino pontuado: ${evidence.route.destination} · rota ${evidence.route.start} ← ${evidence.route.transit} ↓ ${evidence.route.destination} · score ${decisionSignal.score}</small>
        </article>
      </section>

      <footer class="sd-result">
        <div><span>RESULTADO OBSERVADO</span><strong>Fuga concluída · P2 vivo</strong></div>
        <p>O bot não plantou bomba, alcançou ${evidence.route.destination} em ${evidence.after.destinationReachedAtMs} ms e permaneceu vivo por ${evidence.after.observedForMs / 1000} s. Nenhum modelo 9Router participou deste cenário.</p>
        <small>Ação humana: nenhuma. Compare a intenção e a ETA se este comportamento regredir.</small>
      </footer>
    </section>
  `;

  root.querySelector<HTMLButtonElement>("[data-replay]")?.addEventListener("click", render);
}

render();
