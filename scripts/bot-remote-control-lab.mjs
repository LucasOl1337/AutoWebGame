import { runBotRemoteControlLabScenario } from "../output/esm/Engine/bot-remote-control-lab-scenario.js";
import { runBotRemoteControlGameAppScenario } from "./bot-remote-control-gameapp-scenario.mjs";

function formatMs(value) {
  return `${value.toFixed(4)} ms`;
}

function formatSeconds(value) {
  return `${(value / 1000).toFixed(2)} s`;
}

export function renderBotRemoteControlLab(
  scenario = runBotRemoteControlLabScenario(),
  gameAppScenario = runBotRemoteControlGameAppScenario(),
) {
  const healthy = gameAppScenario.pass;
  return [
    "AUTO WEB GAME · LABORATÓRIO DE CONTROLE DE BOMBA",
    `BOT OBSERVADO · ${scenario.botLabel}`,
    `CONTROLADOR · ${scenario.controller}`,
    `ESTADO · ${healthy ? "SAUDÁVEL" : "REGRESSÃO DETECTADA"}`,
    `DECISÃO · ${healthy ? "VÁLIDA PARA ESTE SNAPSHOT" : "INVÁLIDA"}`,
    `INTENÇÃO · ${scenario.intent}`,
    `PLACAR · REMOTE ${scenario.currentScores.remote} · SHORT FUSE ${scenario.currentScores.shortFuse}`,
    `JANELA DE FUGA · ${formatSeconds(scenario.currentFuseMs)} preservada · Short Fuse ${formatSeconds(scenario.shortFuseCandidateFuseMs)}`,
    `MARGEM PRESERVADA · +${formatSeconds(scenario.escapeWindowPreservedMs)}`,
    `LATÊNCIA DA DECISÃO · mediana ${formatMs(gameAppScenario.medianDecisionMs)} · p95 ${formatMs(gameAppScenario.p95DecisionMs)}`,
    `CUSTO DO COMPARADOR · mediana ${formatMs(scenario.medianComparatorMs)} · p95 ${formatMs(scenario.p95ComparatorMs)}`,
    `MOTIVO · ${scenario.reason}`,
    `ANTES · SHORT FUSE ${scenario.referenceCounts.shortFuse}/${scenario.samples}`,
    `DEPOIS · REMOTE DETONATION ${gameAppScenario.directionCounts.up}/${gameAppScenario.samples}`,
    `SATURAÇÃO · Remote adquirido → Short Fuse ${gameAppScenario.ignoresSaturatedRemote ? "OK" : "FALHOU"} · Short Fuse máximo → Remote ${gameAppScenario.ignoresSaturatedShortFuse ? "OK" : "FALHOU"}`,
    "RESULTADO · NÃO OBSERVADO · aquisição e detonação não foram simuladas",
    "MODELOS AVALIADOS · NENHUM · 9Router não participou desta decisão",
    "AÇÃO HUMANA · NENHUMA",
  ].join("\n");
}

const gameAppScenario = runBotRemoteControlGameAppScenario();
console.log(renderBotRemoteControlLab(runBotRemoteControlLabScenario(), gameAppScenario));
if (!gameAppScenario.pass) process.exitCode = 1;
