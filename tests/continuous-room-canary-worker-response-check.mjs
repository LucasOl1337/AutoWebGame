import assert from "node:assert/strict";
import { ContinuousRoomCanaryAuthority } from "../output/esm/ContinuousRoom/continuous-room-canary-authority.js";
import { createContinuousRoomCanaryCommandResponse } from "../output/esm/ContinuousRoom/continuous-room-canary-worker.js";

class Storage {
  values = new Map();
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async list({prefix}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
  async delete(key) { return this.values.delete(key); }
  async setAlarm() {}
}
const authority = new ContinuousRoomCanaryAuthority(new Storage(), {create: (kind) => `${kind}_worker_response_opaque`});
const send = (body, method = "POST") => createContinuousRoomCanaryCommandResponse(new Request("https://example.test/internal/canonical/continuous-room/canary/commands", {
  method,
  headers: {"content-type": "application/json"},
  ...(method === "POST" ? {body: typeof body === "string" ? body : JSON.stringify(body)} : {}),
}), authority);

const method = await send(null, "GET");
assert.equal(method.status, 405);
assert.equal(method.headers.get("cache-control"), "no-store");
const malformed = await send("{");
assert.equal(malformed.status, 400);
assert.deepEqual(await malformed.json(), {ok: false, code: "invalid_command", message: "invalid lifecycle command", snapshot: null});
const oversized = await send(JSON.stringify({padding: "x".repeat(17 * 1024)}));
assert.equal(oversized.status, 413);
const unknown = await send({
  protocol: "continuous-room.lifecycle.v1",
  operationId: "operation_worker_0001",
  commandId: "command_worker_0001",
  expectedServerRevision: 0,
  type: "prepare-entry",
  characterId: "03a976fb-7313-4064-a477-5bb9b0760034",
  nick: "Worker",
  surprise: true,
});
assert.equal(unknown.status, 400);
const created = await send({
  protocol: "continuous-room.lifecycle.v1",
  operationId: "operation_worker_0001",
  commandId: "command_worker_0001",
  expectedServerRevision: 0,
  type: "prepare-entry",
  characterId: "03a976fb-7313-4064-a477-5bb9b0760034",
  nick: "Worker",
});
assert.equal(created.status, 200);
assert.equal((await created.json()).snapshot.state, "prepared");
const stale = await send({
  protocol: "continuous-room.lifecycle.v1",
  operationId: "operation_worker_0001",
  commandId: "command_worker_stale",
  expectedServerRevision: 0,
  type: "cancel-entry",
});
assert.equal(stale.status, 409);
assert.equal((await stale.json()).code, "stale_revision");

console.log("continuous-room-canary-worker-response-check: ok");
