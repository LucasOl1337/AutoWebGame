import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Engine/bot-ai.ts", import.meta.url), "utf8");
const suddenDeathStart = source.indexOf("function getSuddenDeathPressureDirection");
const patrolStart = source.indexOf("function getPatrolDirection", suddenDeathStart);
const body = source.slice(suddenDeathStart, patrolStart);

const passesCommittedDirectionTieBreaker = body.includes("desiredSafetyWindowMs,")
  && body.includes("firstDirection === context.botCommittedDirection[player.id] ? 1 : 0");
const bfsRestrictsTieBreakToSameDistance = /const distance = queue\[0\]\?\.distance;[\s\S]*?const candidates = queue\.filter\(\(entry\) => entry\.distance === distance\)/.test(source);
const predicateRunsBeforeTieBreaker = /isTileSafeForArrivalWithWindow\([\s\S]*?&& predicate\(candidate\.tile\)[\s\S]*?const score = tieBreakerScore/.test(source);

const report = {
  passesCommittedDirectionTieBreaker,
  bfsRestrictsTieBreakToSameDistance,
  predicateRunsBeforeTieBreaker,
};
console.log(JSON.stringify(report, null, 2));

if (!Object.values(report).every(Boolean)) {
  process.exit(1);
}
