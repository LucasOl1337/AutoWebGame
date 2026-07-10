import { readFile } from "node:fs/promises";

const {
  getLobbyJoinBlockReason,
  isLobbyCardJoinDisabled,
} = await import("../output/esm/NetCode/lobby-rules.js");
const { configureLobbyCardAction } = await import("../output/esm/NetCode/session-client.js");

const cases = [
  { name: "fresh visitor can join open room with vacancy", status: "open", alreadySeated: false, seatsFull: false, expected: null },
  { name: "fresh visitor cannot join full open room", status: "open", alreadySeated: false, seatsFull: true, expected: "full" },
  { name: "fresh visitor cannot join playing room with vacancy", status: "playing", alreadySeated: false, seatsFull: false, expected: "match-in-progress" },
  { name: "playing reason wins when room is also full", status: "playing", alreadySeated: false, seatsFull: true, expected: "match-in-progress" },
  { name: "seated occupant can resume playing room", status: "playing", alreadySeated: true, seatsFull: true, expected: null },
  { name: "seated occupant remains eligible in full open room", status: "open", alreadySeated: true, seatsFull: true, expected: null },
];

const behaviorResults = cases.map((entry) => ({
  ...entry,
  actual: getLobbyJoinBlockReason(entry.status, entry.alreadySeated, entry.seatsFull),
}));

function createActionTarget() {
  return {
    disabled: false,
    listeners: [],
    addEventListener(type, listener) {
      this.listeners.push({ type, listener });
    },
  };
}

let openJoinCalls = 0;
let liveJoinCalls = 0;
const openCard = createActionTarget();
const liveCard = createActionTarget();
configureLobbyCardAction(openCard, isLobbyCardJoinDisabled("open"), () => {
  openJoinCalls += 1;
});
configureLobbyCardAction(liveCard, isLobbyCardJoinDisabled("playing"), () => {
  liveJoinCalls += 1;
});
openCard.listeners[0]?.listener();

const cardBehaviorChecks = {
  openCardRemainsEnabled: openCard.disabled === false,
  openCardBindsOneJoinAction: openCard.listeners.length === 1 && openCard.listeners[0].type === "click",
  openCardActionRunsOnce: openJoinCalls === 1,
  liveCardIsDisabled: liveCard.disabled === true,
  liveCardBindsNoJoinAction: liveCard.listeners.length === 0,
  liveCardActionNeverRuns: liveJoinCalls === 0,
};

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
const clientSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const joinStart = workerSource.indexOf("async handleJoinLobby(clientId, rawRoomCode)");
const joinEnd = workerSource.indexOf("async handleLeaveLobby(clientId)", joinStart);
const joinSource = workerSource.slice(joinStart, joinEnd);
const renderStart = clientSource.indexOf("private renderLobbyList(): void");
const renderEnd = clientSource.indexOf("private renderSetup(): void", renderStart);
const renderSource = clientSource.slice(renderStart, renderEnd);
const guardIndex = joinSource.indexOf("const joinBlockReason = getLobbyJoinBlockReason(");
const quickMatchDeleteIndex = joinSource.indexOf("this.quickMatchPendingClients.delete(clientId);");
const intentIndex = joinSource.indexOf("this.setClientIntent(");
const membershipIndex = joinSource.indexOf("room.clients.add(clientId);");
const disabledRule = cssSource.match(/\.experience-room-card:disabled\s*\{([^}]*)\}/)?.[1] ?? "";

const integrationChecks = {
  workerUsesSharedEligibilityRule: guardIndex >= 0,
  workerPreservesQuickMatchQueueUntilJoinAccepted: quickMatchDeleteIndex > guardIndex
    && quickMatchDeleteIndex < intentIndex,
  workerGuardsBeforeIntentMutation: guardIndex >= 0 && guardIndex < intentIndex,
  workerGuardsBeforeRoomMembershipMutation: guardIndex >= 0 && guardIndex < membershipIndex,
  workerReturnsSpecificPlayingError: joinSource.includes('joinBlockReason === "match-in-progress"')
    && joinSource.includes("Match already in progress. Pick another open room."),
  seatedResumeStillSendsMatchConfiguration: joinSource.includes("if (room.status === \"playing\" && resumedSeatId && activeMatch)")
    && joinSource.includes("this.sendMatchStartedToSeat(")
    && joinSource.includes("this.sendSnapshotToClient(clientId, room.roomCode);"),
  clientUsesBehavioralCardPolicy: renderSource.includes("configureLobbyCardAction(card, isLobbyCardJoinDisabled(lobby.status)"),
  liveStatusRemainsVisible: renderSource.includes('lobby.status === "playing" ? copy.lobbies.roomStatusLive'),
  disabledCardKeepsReadableText: disabledRule.includes("cursor: default;")
    && !disabledRule.includes("opacity"),
};

const failedChecks = [
  ...behaviorResults.filter((entry) => entry.actual !== entry.expected).map((entry) => entry.name),
  ...Object.entries(cardBehaviorChecks).filter(([, passed]) => !passed).map(([name]) => name),
  ...Object.entries(integrationChecks).filter(([, passed]) => !passed).map(([name]) => name),
];
const pass = failedChecks.length === 0;

console.log(JSON.stringify({
  behaviorResults,
  cardBehaviorChecks,
  integrationChecks,
  failedChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}