import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js");
const persistenceDir = await mkdtemp(path.join(os.tmpdir(), "bomba-late-join-"));
const LATE_JOIN_REJECTION = "Match already in progress. Pick another open room.";

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Wrangler exited before becoming ready (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The local socket is not accepting requests yet.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the local Worker.");
}

function createClient(url, label) {
  const websocket = new WebSocket(url);
  const messages = [];
  const waiters = new Set();

  websocket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    messages.push(message);
    for (const waiter of waiters) {
      waiter();
    }
  });

  const waitFor = (predicate, timeoutMs = 4_000) => new Promise((resolve, reject) => {
    const findMatch = () => {
      const message = messages.find(predicate);
      if (!message) {
        return false;
      }
      cleanup();
      resolve(message);
      return true;
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(
        `${label} timed out waiting for a server message. Received: ${messages.map((message) => message.type).join(", ") || "none"}.`,
      ));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      waiters.delete(findMatch);
    };
    waiters.add(findMatch);
    findMatch();
  });

  const send = (payload) => websocket.send(JSON.stringify(payload));
  return { label, websocket, messages, waitFor, send };
}

function summarizeMessage(message) {
  const summary = { type: message.type };
  if (message.message) summary.message = message.message;
  if (message.lobby) {
    summary.roomCode = message.lobby.roomCode;
    summary.status = message.lobby.status;
    summary.selfSeat = message.lobby.selfSeat;
  }
  if (message.config) {
    summary.localPlayerId = message.config.localPlayerId;
    summary.activePlayerIds = message.config.activePlayerIds;
  }
  if (message.sessionState) summary.sessionState = message.sessionState.kind;
  if (message.snapshot) summary.snapshotPlayers = message.snapshot.activePlayerIds;
  return summary;
}

const port = await reservePort();
const workerHttpUrl = `http://127.0.0.1:${port}`;
const workerWsUrl = `ws://127.0.0.1:${port}/online`;
const workerLogs = [];
const worker = spawn(process.execPath, [
  wranglerBin,
  "dev",
  "--local",
  "--ip",
  "127.0.0.1",
  "--port",
  String(port),
  "--persist-to",
  persistenceDir,
], {
  cwd: rootDir,
  env: { ...process.env, NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [worker.stdout, worker.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => workerLogs.push(chunk));
}

const clients = [];
let report;
let exitCode = 1;

try {
  await waitForServer(`${workerHttpUrl}/health`, worker);

  const first = createClient(workerWsUrl, "first");
  const second = createClient(workerWsUrl, "second");
  clients.push(first, second);
  await Promise.all([
    first.waitFor((message) => message.type === "hello"),
    second.waitFor((message) => message.type === "hello"),
  ]);

  first.send({ type: "create-lobby", title: "Late join regression" });
  const created = await first.waitFor((message) => message.type === "lobby-joined");
  const roomCode = created.lobby.roomCode;

  first.send({ type: "claim-seat", seat: 1, characterIndex: 0 });
  await first.waitFor((message) => message.type === "lobby-updated" && message.lobby.selfSeat === 1);

  second.send({ type: "join-lobby", roomCode });
  await second.waitFor((message) => message.type === "lobby-joined" && message.lobby.roomCode === roomCode);
  second.send({ type: "claim-seat", seat: 2, characterIndex: 1 });
  await second.waitFor((message) => message.type === "lobby-updated" && message.lobby.selfSeat === 2);

  first.send({ type: "set-ready", ready: true });
  await first.waitFor((message) => message.type === "lobby-updated" && message.lobby.seats[1].ready);
  second.send({ type: "set-ready", ready: true });

  const activeSnapshot = await first.waitFor((message) => message.type === "host-snapshot");
  const firstMatchStartCountBeforeRejoin = first.messages.filter((message) => message.type === "match-started").length;
  const firstSnapshotCountBeforeRejoin = first.messages.filter((message) => message.type === "host-snapshot").length;
  first.send({ type: "join-lobby", roomCode });
  await delay(250);
  const seatedClientRejoinResynced = (
    first.messages.filter((message) => message.type === "match-started").length > firstMatchStartCountBeforeRejoin
    && first.messages.filter((message) => message.type === "host-snapshot").length > firstSnapshotCountBeforeRejoin
  );

  const third = createClient(workerWsUrl, "third");
  clients.push(third);
  await third.waitFor((message) => message.type === "hello");
  third.send({ type: "join-lobby", roomCode });
  await delay(150);
  third.send({ type: "claim-seat", seat: 3, characterIndex: 2 });
  await delay(900);

  const thirdJoined = third.messages.find((message) => message.type === "lobby-joined");
  const thirdStart = third.messages.find((message) => message.type === "match-started");
  const thirdSnapshot = third.messages.find((message) => message.type === "host-snapshot");
  const thirdSeat = [...third.messages]
    .reverse()
    .find((message) => message.lobby)?.lobby?.selfSeat ?? null;
  const thirdError = third.messages.find((message) => message.type === "error");

  let inputAcknowledged = false;
  if (thirdStart && thirdSnapshot) {
    const inputSeq = 4242;
    third.send({
      type: "guest-input",
      inputSeq,
      sentAtMs: Date.now(),
      input: {
        direction: "right",
        bombPressed: false,
        detonatePressed: false,
        skillPressed: false,
        skillHeld: false,
      },
    });
    try {
      await third.waitFor((message) => (
        message.type === "host-frame"
        && message.frame.ackedInputSeq?.[thirdStart.config.localPlayerId] === inputSeq
      ), 2_000);
      inputAcknowledged = true;
    } catch {
      inputAcknowledged = false;
    }
  }

  const playableLateJoin = Boolean(
    thirdJoined
    && thirdStart
    && thirdSnapshot
    && thirdSeat === thirdStart.config.localPlayerId
    && inputAcknowledged,
  );
  const clearlyRejected = Boolean(
    !thirdJoined
    && thirdError?.message === LATE_JOIN_REJECTION,
  );

  second.send({ type: "leave-lobby" });
  await Promise.all([
    second.waitFor((message) => message.type === "lobby-left"),
    first.waitFor((message) => message.type === "peer-left"),
  ]);
  second.websocket.close();
  const replacement = createClient(workerWsUrl, "replacement");
  clients.push(replacement);
  await replacement.waitFor((message) => message.type === "hello");
  replacement.send({ type: "join-lobby", roomCode });
  const replacementJoined = await replacement.waitFor((message) => (
    message.type === "lobby-joined"
    && message.lobby.roomCode === roomCode
    && message.lobby.status === "open"
  ));
  replacement.send({ type: "claim-seat", seat: 2, characterIndex: 1 });
  const replacementSeated = await replacement.waitFor((message) => (
    message.type === "lobby-updated"
    && message.lobby.selfSeat === 2
  ));
  const replacementSocketReconnected = Boolean(
    replacementJoined.lobby.selfSeat === null
    && replacementSeated.lobby.selfSeat === 2,
  );
  const initialPlayersStarted = first.messages.some((message) => message.type === "match-started")
    && second.messages.some((message) => message.type === "match-started")
    && activeSnapshot.snapshot.activePlayerIds.join(",") === "1,2";
  const pass = initialPlayersStarted
    && seatedClientRejoinResynced
    && replacementSocketReconnected
    && (playableLateJoin || clearlyRejected);
  const finalScreen = playableLateJoin
    ? "active-match"
    : clearlyRejected
      ? "usable-pre-join-screen"
      : thirdJoined
        ? "preparation-stuck"
        : "unknown";

  report = {
    roomCode,
    initialMatch: {
      activePlayerIds: activeSnapshot.snapshot.activePlayerIds,
      firstReceivedMatchStart: first.messages.some((message) => message.type === "match-started"),
      secondReceivedMatchStart: second.messages.some((message) => message.type === "match-started"),
      seatedClientRejoinResynced,
      replacementSocketReconnected,
    },
    thirdClient: {
      messages: third.messages.map(summarizeMessage),
      joined: Boolean(thirdJoined),
      seat: thirdSeat,
      receivedMatchStart: Boolean(thirdStart),
      receivedCurrentSnapshot: Boolean(thirdSnapshot),
      inputAcknowledged,
      error: thirdError?.message ?? null,
      finalScreen,
    },
    workerErrors: workerLogs
      .join("")
      .split(/\r?\n/)
      .filter((line) => /error|referenceerror|exception|undefined/i.test(line))
      .slice(-20),
    pass,
  };
  exitCode = pass ? 0 : 1;
} catch (error) {
  report = {
    harnessError: error instanceof Error ? error.stack : String(error),
    workerTail: workerLogs.join("").split(/\r?\n/).slice(-40),
    pass: false,
  };
} finally {
  for (const client of clients) {
    try {
      client.websocket.close();
    } catch {
      // Best-effort cleanup.
    }
  }
  worker.kill();
  await Promise.race([
    new Promise((resolve) => worker.once("exit", resolve)),
    delay(2_000),
  ]);
  await rm(persistenceDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = exitCode;
