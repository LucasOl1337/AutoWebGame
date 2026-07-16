import assert from "node:assert/strict";
import { ContinuousRoomCanaryAuthority } from "../output/esm/ContinuousRoom/continuous-room-canary-authority.js";
import { ContinuousRoomCanaryClient } from "../output/esm/ContinuousRoom/continuous-room-canary-client.js";

class MemoryAuthorityStorage {
  values = new Map();
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async list({prefix}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
  async setAlarm() {}
}

class MemoryCredentialStore {
  value = null;
  read() { return this.value && structuredClone(this.value); }
  write(value) { this.value = structuredClone(value); }
  clear() { this.value = null; }
}

class AuthorityTransport {
  commands = [];
  now = 1_000;
  constructor(authority) { this.authority = authority; }
  async send(command) {
    this.commands.push(structuredClone(command));
    return this.authority.handle(command, this.now++);
  }
}

const ids = (() => { let n = 0; return {create: (kind) => `${kind}_client_${++n}_opaque`}; })();
const tokens = (() => {
  const values = ["token_client_alpha_0000000000000001", "token_client_beta_0000000000000002", "token_client_gamma_0000000000000003"];
  return {create: () => values.shift() ?? `token_client_fallback_${Date.now()}`};
})();
const authority = new ContinuousRoomCanaryAuthority(new MemoryAuthorityStorage(), ids);
const transport = new AuthorityTransport(authority);
const credentials = new MemoryCredentialStore();
const client = new ContinuousRoomCanaryClient(transport, credentials, tokens);
const progress = [];
const entered = await client.enter({
  operationId: "operation_client_normal_0001",
  characterId: "03a976fb-7313-4064-a477-5bb9b0760034",
  nick: "Cliente",
  signal: new AbortController().signal,
  onProgress: (event) => progress.push(event),
});
assert.equal(entered.state, "preparing");
assert.equal(credentials.value.roomId, entered.roomId);
assert.equal(credentials.value.recoveryToken, "token_client_alpha_0000000000000001");
assert.deepEqual(progress.map((event) => event.label), ["Criando nova sala…"]);
assert.equal(JSON.stringify(transport.commands).includes("token_client_alpha_0000000000000001"), false, "commit sends only token proof hash");

const reloadedClient = new ContinuousRoomCanaryClient(transport, credentials, tokens);
const recovered = await reloadedClient.recover();
assert.equal(recovered.operationId, entered.operationId);
assert.equal(credentials.value.recoveryToken, "token_client_beta_0000000000000002");
assert.equal(transport.commands.at(-1).recoveryToken, "token_client_alpha_0000000000000001", "raw token crosses only the recovery body");
assert.notEqual(transport.commands.at(-1).nextRecoveryProofHash, undefined);
assert.notEqual(transport.commands[0].commandId, transport.commands.at(-1).commandId, "reload cannot reuse the prepare commandId");

const input = await reloadedClient.input(1, {
  direction: "right", bombPressed: true, detonatePressed: false, skillPressed: false, skillHeld: false,
});
assert.equal(input.acceptedInputSeq, 1);
assert.equal(credentials.value.serverRevision, input.serverRevision);

// Commit-late cancellation: the client waits for the authoritative commit result,
// then compensates it instead of pretending the abort happened pre-commit.
const raceStorage = new MemoryAuthorityStorage();
const raceAuthority = new ContinuousRoomCanaryAuthority(raceStorage, ids);
let releaseCommit;
let commitSeenResolve;
const commitSeen = new Promise((resolve) => { commitSeenResolve = resolve; });
const raceCommands = [];
const raceTransport = {
  async send(command) {
    raceCommands.push(structuredClone(command));
    if (command.type === "commit-entry") {
      commitSeenResolve();
      await new Promise((resolve) => { releaseCommit = resolve; });
    }
    return raceAuthority.handle(command, 20_000 + raceCommands.length);
  },
};
const raceCredentials = new MemoryCredentialStore();
const raceClient = new ContinuousRoomCanaryClient(raceTransport, raceCredentials, {
  create: () => "token_commit_late_0000000000000001",
});
const controller = new AbortController();
const raceProgress = [];
const pending = raceClient.enter({
  operationId: "operation_commit_late_0002",
  characterId: "03a976fb-7313-4064-a477-5bb9b0760034",
  nick: "Corrida",
  signal: controller.signal,
  onProgress: (event) => raceProgress.push(event),
});
await commitSeen;
controller.abort();
releaseCommit();
await assert.rejects(pending, (error) => error?.name === "AbortError");
assert.deepEqual(raceCommands.map((item) => item.type), ["prepare-entry", "commit-entry", "cancel-entry"]);
assert.deepEqual(raceProgress.map((event) => event.label), ["Criando nova sala…", "Desfazendo entrada na Sala…"]);
assert.equal(raceCredentials.value, null);
const tombstone = [...raceStorage.values.values()][0];
assert.equal(tombstone.state, "cancelled");
assert.equal(tombstone.roomId, null);

// A delayed response from an earlier revision cannot overwrite a newer accepted snapshot.
const staleCredentials = new MemoryCredentialStore();
staleCredentials.write(credentials.value);
const staleClient = new ContinuousRoomCanaryClient({
  async send() { return {ok: true, replayed: false, snapshot: {...input, serverRevision: input.serverRevision - 1}}; },
}, staleCredentials, {create: () => "token_unused_000000000000000000001"});
staleClient["snapshot"] = input;
await assert.rejects(staleClient.observe(), /older server revision/);

console.log("continuous-room-canary-client-check: ok");
