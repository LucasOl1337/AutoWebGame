import { BOMB_FUSE_MS } from "../PersonalConfig/config";
import {
  DANGER_FORECAST_BOMB_FUSE_BUFFER_MS,
  buildDangerMap,
  getBombBlastKeys,
  type DangerMapContext,
} from "../Engine/danger-map";
import type { PlayerId } from "../Gameplay/types";

const BOMB_COUNT = 20;
const SAMPLE_COUNT = 17;
const BATCH_ITERATIONS = 30;

function createScenario(): DangerMapContext {
  const spawns = ([1, 2, 3, 4] as const).map((playerId, index) => ({
    playerId,
    tile: { x: index + 1, y: 0 },
    direction: "down" as const,
  }));
  return {
    bombs: Array.from({ length: BOMB_COUNT }, (_, index) => ({
      id: index + 1,
      ownerId: ((index % 4) + 1) as PlayerId,
      tile: { x: index + 1, y: 1 },
      fuseMs: 100 + (BOMB_COUNT - index) * 10,
      ownerCanPass: false,
      flameRange: 1,
    })),
    flames: [],
    arena: {
      config: {
        id: "danger-chain-lab",
        name: "Corrente de perigo",
        status: "active",
        themeId: "tournament-clean",
        grid: { width: BOMB_COUNT + 2, height: 3 },
        tiles: { solid: [], breakable: [] },
        spawns,
        version: "lab",
        createdAt: "",
        updatedAt: "",
        wrapPortals: [],
        suddenDeathPath: [],
        spawnMap: Object.fromEntries(spawns.map((spawn) => [spawn.playerId, spawn])) as DangerMapContext["arena"]["config"]["spawnMap"],
      },
      solid: new Set(),
      breakable: new Set(),
      powerUps: [],
    },
    suddenDeathActive: false,
    suddenDeathTickMs: 0,
    suddenDeathIndex: 0,
    suddenDeathPath: [],
    suddenDeathClosureEffects: [],
  };
}

function buildLegacyChainMap(context: DangerMapContext): Map<string, number> {
  const projected = context.bombs
    .filter((bomb) => bomb.fuseMs <= BOMB_FUSE_MS + DANGER_FORECAST_BOMB_FUSE_BUFFER_MS)
    .map((bomb) => ({
      tile: bomb.tile,
      fuseMs: Math.max(0, bomb.fuseMs),
      blastKeys: getBombBlastKeys(bomb.tile, bomb.flameRange, context.arena),
    }));

  let updated = true;
  while (updated) {
    updated = false;
    for (const source of projected) {
      for (const target of projected) {
        if (source === target || source.fuseMs >= target.fuseMs) continue;
        if (source.blastKeys.has(`${target.tile.x},${target.tile.y}`)) {
          target.fuseMs = source.fuseMs;
          updated = true;
        }
      }
    }
  }

  const danger = new Map<string, number>();
  for (const bomb of projected) {
    for (const key of bomb.blastKeys) {
      const previous = danger.get(key);
      if (previous === undefined || bomb.fuseMs < previous) danger.set(key, bomb.fuseMs);
    }
  }
  return danger;
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measureBatch(build: (context: DangerMapContext) => Map<string, number>, context: DangerMapContext): number {
  const startedAt = performance.now();
  for (let iteration = 0; iteration < BATCH_ITERATIONS; iteration += 1) {
    build(context);
  }
  return (performance.now() - startedAt) / BATCH_ITERATIONS;
}

function benchmarkPair(context: DangerMapContext): { legacyMedianMs: number; optimizedMedianMs: number } {
  for (let index = 0; index < 5; index += 1) {
    buildLegacyChainMap(context);
    buildDangerMap(context);
  }

  const legacySamples: number[] = [];
  const optimizedSamples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    if (index % 2 === 0) {
      legacySamples.push(measureBatch(buildLegacyChainMap, context));
      optimizedSamples.push(measureBatch(buildDangerMap, context));
    } else {
      optimizedSamples.push(measureBatch(buildDangerMap, context));
      legacySamples.push(measureBatch(buildLegacyChainMap, context));
    }
  }
  return {
    legacyMedianMs: median(legacySamples),
    optimizedMedianMs: median(optimizedSamples),
  };
}

function formatDuration(value: number): string {
  if (value < 0.01) return "<0,01 ms";
  return `${value.toFixed(value < 1 ? 2 : 1).replace(".", ",")} ms`;
}

function render(): void {
  const root = document.querySelector<HTMLElement>("#danger-chain-lab");
  if (!root) throw new Error("danger-chain-lab root ausente");

  const context = createScenario();
  const { legacyMedianMs, optimizedMedianMs } = benchmarkPair(context);
  const danger = buildDangerMap(context);
  const earliestEtaMs = Math.min(...danger.values());
  const threatenedBombs = context.bombs.filter((bomb) => danger.get(`${bomb.tile.x},${bomb.tile.y}`) === earliestEtaMs);
  const parity = JSON.stringify([...danger.entries()].sort())
    === JSON.stringify([...buildLegacyChainMap(context).entries()].sort());
  const deltaPercent = (optimizedMedianMs / legacyMedianMs - 1) * 100;
  const performanceState = deltaPercent <= -5
    ? { value: `${Math.abs(deltaPercent).toFixed(0)}%`, label: "menos tempo", className: "gain--better" }
    : deltaPercent >= 5
      ? { value: `+${deltaPercent.toFixed(0)}%`, label: "regressão observada", className: "gain--worse" }
      : { value: `${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(0)}%`, label: "variação inconclusiva", className: "gain--neutral" };
  const resultSummary = !parity
    ? "ETAs divergiram; não usar esta implementação."
    : deltaPercent <= -5
      ? `${threatenedBombs.length}/${context.bombs.length} ETAs idênticas; menor custo computacional nesta amostra.`
      : deltaPercent >= 5
        ? `${threatenedBombs.length}/${context.bombs.length} ETAs idênticas; regressão de custo nesta amostra.`
        : `${threatenedBombs.length}/${context.bombs.length} ETAs idênticas; variação de custo inconclusiva.`;
  const measuredAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

  root.innerHTML = `
    <section class="lab-shell" aria-labelledby="lab-title">
      <header class="lab-header">
        <div>
          <p class="lab-context">Cenário controlado · pico jogável (4 × 5 bombas)</p>
          <h1 id="lab-title">Corrente de perigo</h1>
          <p class="lab-summary">O bot recebe a mesma previsão de explosões; a comparação abaixo classifica o custo desta amostra.</p>
        </div>
        <button class="lab-replay" type="button" data-replay>Medir novamente</button>
      </header>

      <section class="observer" aria-label="Bot observado e controlador">
        <div class="observer-avatar" aria-hidden="true">P2</div>
        <div class="observer-copy">
          <span>BOT OBSERVADO</span>
          <strong>Bot P2</strong>
          <small>IA determinística local</small>
        </div>
        <div class="health ${parity ? "health--ok" : "health--error"}">
          <span>${parity ? "ETAs PRESERVADAS" : "ETAs DIVERGENTES"}</span>
          <small>${parity ? "neste cenário" : "revisão necessária"}</small>
        </div>
      </section>

      <section class="decision" aria-label="Sinal atual do mapa de perigo">
        <div class="decision-main">
          <span class="decision-label">SINAL OBSERVADO</span>
          <strong>Mapa de perigo atualizado</strong>
          <p>A primeira bomba propaga a menor ETA para ${threatenedBombs.length} ameaças: ${earliestEtaMs} ms.</p>
          <p class="decision-boundary"><b>Decisão do bot:</b> não avaliada neste benchmark de custo.</p>
        </div>
        <dl class="decision-facts">
          <div><dt>Validade</dt><dd>Esta amostra</dd></div>
          <div><dt>Custo do mapa</dt><dd>${formatDuration(optimizedMedianMs)}</dd></div>
          <div><dt>Medido às</dt><dd>${measuredAt}</dd></div>
        </dl>
      </section>

      <section class="chain" aria-label="Linha de bombas ameaçadas">
        <div class="chain-track">
          ${context.bombs.map((bomb, index) => `
            <span class="chain-node ${index === context.bombs.length - 1 ? "chain-node--source" : ""}"
              title="Bomba ${bomb.id}: perigo em ${danger.get(`${bomb.tile.x},${bomb.tile.y}`)} ms"></span>
          `).join("")}
        </div>
        <div class="chain-legend">
          <span>Rota observada</span>
          <strong>${threatenedBombs.length}/${context.bombs.length} bombas sincronizadas em ${earliestEtaMs} ms</strong>
        </div>
      </section>

      <section class="comparison" aria-label="Comparação de custo">
        <article>
          <span>ANTES · REVARREDURA</span>
          <strong>${formatDuration(legacyMedianMs)}</strong>
          <p>Repassava toda a lista até a corrente estabilizar.</p>
        </article>
        <div class="gain ${performanceState.className}" aria-label="Variação de custo medida">
          <strong>${performanceState.value}</strong>
          <span>${performanceState.label}</span>
        </div>
        <article class="comparison-current">
          <span>AGORA · FILA DE EVENTOS</span>
          <strong>${formatDuration(optimizedMedianMs)}</strong>
          <p>Propaga somente para bombas realmente alcançadas.</p>
        </article>
      </section>

      <footer class="lab-note">
        <strong>Resultado</strong>
        <span>${resultSummary}</span>
        <small>${SAMPLE_COUNT} lotes alternados de ${BATCH_ITERATIONS} execuções; não compara modelos 9Router.</small>
      </footer>
    </section>
  `;

  root.querySelector<HTMLButtonElement>("[data-replay]")?.addEventListener("click", render);
}

render();
