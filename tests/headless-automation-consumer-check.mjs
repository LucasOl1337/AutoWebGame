import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const { headlessAutomationConsumer } = await import(
  "../output/esm/BotLab/headless-automation-consumer.js"
);
const completeRun = headlessAutomationConsumer.runBuiltInSeries({
  id: "automation-complete",
  roundCount: 1,
  botFill: 1,
});
const complete = await completeRun.result;
assert.equal(complete.status, "complete");
assert.equal(complete.completedRounds, 1);

const partialRun = headlessAutomationConsumer.runBuiltInSeries({
  id: "automation-partial",
  roundCount: 2,
  botFill: 1,
});
let cancelled = false;
const unsubscribe = partialRun.subscribe((snapshot) => {
  if (!cancelled && snapshot.completedRounds === 1 && snapshot.phase === "running") {
    cancelled = true;
    partialRun.dispatch("cancel");
  }
});
const partial = await partialRun.result;
unsubscribe();
assert.equal(partial.status, "cancelled-partial");
assert.equal(partial.completedRounds, 1);

const legacyCalls = [];
headlessAutomationConsumer.startLegacyLocalEndless({
  startOfflineBotMatch(botFill, mode) {
    legacyCalls.push({ botFill, mode });
  },
}, 3);
assert.deepEqual(legacyCalls, [{ botFill: 3, mode: "endless" }]);

const [mainSource, bridgeSource, workerSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/Engine/auto-improvement-bridge.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/BotLab/headless-series-browser-worker.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/BotLab/headless-series-worker-controller.ts", import.meta.url), "utf8"),
]);

function calledMethods(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methods = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      methods.push(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return methods;
}

function directEndlessCalls(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let count = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "startOfflineBotMatch"
      && ts.isStringLiteral(node.arguments[1])
      && node.arguments[1].text === "endless"
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

function stringLiterals(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node)) values.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return values;
}

const mainCalls = calledMethods(mainSource, "main.ts");
const bridgeCalls = calledMethods(bridgeSource, "auto-improvement-bridge.ts");
const workerCalls = calledMethods(workerSource, "headless-series-browser-worker.ts");
const controllerCalls = calledMethods(controllerSource, "headless-series-worker-controller.ts");
assert.ok(mainCalls.includes("startLegacyLocalEndless"));
assert.ok(bridgeCalls.includes("startLegacyLocalEndless"));
assert.ok(bridgeCalls.includes("postMessage"));
assert.ok(bridgeCalls.includes("terminate"));
assert.ok(workerCalls.includes("handle"));
assert.ok(controllerCalls.includes("runBuiltInSeries"));
assert.ok(stringLiterals(controllerSource, "headless-series-worker-controller.ts").includes("headless_series_already_active"));
assert.ok(stringLiterals(bridgeSource, "auto-improvement-bridge.ts").includes("cancel"));
assert.equal(directEndlessCalls(mainSource, "main.ts"), 0);
assert.equal(directEndlessCalls(bridgeSource, "auto-improvement-bridge.ts"), 0);

console.log(JSON.stringify({
  complete: complete.status,
  partial: partial.status,
  legacyCalls,
  pass: true,
}, null, 2));
