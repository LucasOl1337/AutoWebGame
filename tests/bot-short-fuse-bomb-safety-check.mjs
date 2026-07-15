const { runBotShortFuseLabScenario } = await import("../output/esm/Engine/bot-short-fuse-lab-scenario.js");

const defaultFuse = runBotShortFuseLabScenario(2, 0, 0);
const shortFuseLevelOne = runBotShortFuseLabScenario(2, 1, 0);
const shortFuseLevelTwo = runBotShortFuseLabScenario(2, 2, 0);
const shortFuseWithSpeed = runBotShortFuseLabScenario(3, 2, 1);

const summarize = (snapshot) => ({
  shortFuseLevel: snapshot.shortFuseLevel,
  speedLevel: snapshot.speedLevel,
  actualFuseMs: snapshot.budget.fuseMs,
  moveDurationMs: snapshot.budget.moveDurationMs,
  maxEscapeSteps: snapshot.budget.maxEscapeSteps,
  referenceBeforeDecision: snapshot.referenceBeforeDecision,
  decision: snapshot.decision,
});

const report = {
  bot: "P2",
  controller: "deterministic",
  requiredEscapeSteps: shortFuseLevelTwo.requiredEscapeSteps,
  legacyMaxEscapeSteps: shortFuseLevelTwo.legacyMaxEscapeSteps,
  baselineReproduced: shortFuseLevelTwo.referenceBeforeDecision.placeBomb === true,
  cases: {
    defaultFuse: summarize(defaultFuse),
    shortFuseLevelOne: summarize(shortFuseLevelOne),
    shortFuseLevelTwo: summarize(shortFuseLevelTwo),
    shortFuseWithSpeed: summarize(shortFuseWithSpeed),
  },
  keepsSafeBombs: defaultFuse.decision.placeBomb === true
    && shortFuseLevelOne.decision.placeBomb === true
    && shortFuseWithSpeed.decision.placeBomb === true,
  rejectsUnsafeBomb: shortFuseLevelTwo.decision.placeBomb === false,
  emitsSafeCommand: shortFuseLevelTwo.decision.placeBomb === false
    && shortFuseLevelTwo.decision.direction === "right",
};

console.log(JSON.stringify(report, null, 2));

if (
  !report.baselineReproduced
  || !report.keepsSafeBombs
  || !report.rejectsUnsafeBomb
  || !report.emitsSafeCommand
) process.exit(1);
