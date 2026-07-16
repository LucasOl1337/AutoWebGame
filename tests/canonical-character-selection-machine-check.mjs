import assert from "node:assert/strict";

import { CHARACTER_ROSTER_MANIFEST } from "../output/esm/Characters/Animations/character-roster-manifest.js";
import {
  BrowserLegacySelectionEntryAdapter,
  BrowserSelectionPreferenceStore,
  InMemorySelectionEntryAdapter,
  InMemorySelectionPreferenceStore,
} from "../output/esm/FrontendKernel/CharacterSelection/selection-adapters.js";
import { ContinuousRoomSelectionMachine } from "../output/esm/FrontendKernel/CharacterSelection/continuous-room-selection-machine.js";
import { TrainingSelectionMachine } from "../output/esm/FrontendKernel/CharacterSelection/training-selection-machine.js";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const expectedRoster = CHARACTER_ROSTER_MANIFEST
  .slice()
  .sort((left, right) => (left.order ?? 999) - (right.order ?? 999))
  .map(({ id, name }) => ({ id, name }));

{
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const store = new BrowserSelectionPreferenceStore(storage);
  assert.equal(store.has("continuous-room"), false);
  store.write("continuous-room", { characterId: expectedRoster[1].id, nick: "  Fagulha  " });
  assert.equal(store.has("continuous-room"), true);
  assert.equal(store.has("training"), false, "journey preferences stay namespaced");
  assert.deepEqual(store.read("continuous-room"), {
    characterId: expectedRoster[1].id,
    nick: "Fagulha",
  });
  assert.deepEqual(JSON.parse(values.get("bomba-pvp:character-selection:v1:continuous-room")), {
    version: 1,
    journey: "continuous-room",
    characterId: expectedRoster[1].id,
    nick: "Fagulha",
  });

  const key = "bomba-pvp:character-selection:v1:training";
  for (const unsafe of [
    "{broken",
    JSON.stringify({ version: 2, journey: "training", characterId: expectedRoster[2].id, nick: "Nara_7" }),
    JSON.stringify({ version: 1, journey: "continuous-room", characterId: expectedRoster[2].id, nick: "Nara_7" }),
    JSON.stringify({ version: 1, journey: "training", characterId: "unknown", nick: "Nara_7" }),
    JSON.stringify({ version: 1, journey: "training", characterId: expectedRoster[2].id, nick: "x" }),
  ]) {
    values.set(key, unsafe);
    assert.equal(store.has("training"), false);
  }
  values.set(key, JSON.stringify({
    version: 1,
    journey: "training",
    characterId: "unknown",
    nick: "x",
  }));
  assert.deepEqual(store.read("training"), {
    characterId: expectedRoster[0].id,
    nick: "Visitante",
  }, "invalid persisted fields are sanitized to approved defaults");

  const denied = new BrowserSelectionPreferenceStore({
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
  });
  assert.equal(denied.has("training"), false);
  assert.deepEqual(denied.read("training"), {
    characterId: expectedRoster[0].id,
    nick: "Visitante",
  });
  assert.doesNotThrow(() => denied.write("training", {
    characterId: expectedRoster[0].id,
    nick: "Nara_7",
  }));

  const memory = new InMemorySelectionPreferenceStore();
  assert.equal(memory.has("training"), false);
  memory.write("training", { characterId: expectedRoster[3].id, nick: "Nara_7" });
  assert.equal(memory.has("training"), true);
}

{
  const handoff = new Map();
  const legacy = new Map();
  const destinations = [];
  const adapter = new BrowserLegacySelectionEntryAdapter(
    { getItem: (key) => handoff.get(key) ?? null, setItem: (key, value) => handoff.set(key, value) },
    { getItem: (key) => legacy.get(key) ?? null, setItem: (key, value) => legacy.set(key, value) },
    { assign: (destination) => destinations.push(destination) },
  );
  await adapter.enter({
    journey: "training",
    destination: "/game/training",
    requestId: "training-17",
    characterId: expectedRoster[2].id,
    nick: "Fagulha",
  }, new AbortController().signal);
  assert.equal(legacy.get("mistbridge-preferred-character-index"), "2", "legacy cutover receives the approved roster index");
  assert.deepEqual(destinations, ["/game/training"]);
  assert.deepEqual(JSON.parse(handoff.get("bomba-pvp:character-selection:v1:handoff")), {
    version: 1,
    journey: "training",
    destination: "/game/training",
    requestId: "training-17",
    characterId: expectedRoster[2].id,
    nick: "Fagulha",
  });
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const entry = new InMemorySelectionEntryAdapter();
  const machine = new ContinuousRoomSelectionMachine(preferences, entry);

  assert.deepEqual(machine.getSnapshot(), {
    screen: "character-selection",
    journey: "continuous-room",
    route: "/jogar/personagem",
    title: "Escolha para a Sala contínua",
    actionLabel: "Continuar",
    status: "choosing",
    roster: expectedRoster,
    selectedCharacterId: expectedRoster[0].id,
    nick: "Visitante",
    operation: null,
    errorMessage: null,
    validationMessage: null,
    focusTarget: null,
  }, "Sala contínua starts at its own recoverable Selection route");

  machine.dispatch({ type: "choose-character", characterId: expectedRoster[1].id });
  machine.dispatch({ type: "edit-selection-nick", value: "  Fagulha  " });
  machine.dispatch({ type: "confirm-selection" });
  machine.dispatch({ type: "confirm-selection" });

  assert.equal(entry.requests.length, 1, "double confirm creates one entry operation");
  assert.deepEqual(entry.requests[0].request, {
    journey: "continuous-room",
    destination: "/game/play",
    requestId: "continuous-room-1",
    characterId: expectedRoster[1].id,
    nick: "Fagulha",
  });
  assert.equal(machine.getSnapshot().status, "pending");
  assert.equal(machine.getSnapshot().operation?.label, "Procurando próxima sala…");

  entry.reject(0, new Error("offline"));
  await flush();
  assert.equal(machine.getSnapshot().status, "error");
  assert.equal(machine.getSnapshot().selectedCharacterId, expectedRoster[1].id);
  assert.equal(machine.getSnapshot().nick, "Fagulha");
  assert.match(machine.getSnapshot().errorMessage ?? "", /nenhuma sala/i);

  machine.dispatch({ type: "retry-selection" });
  assert.equal(entry.requests.length, 2);
  assert.equal(entry.requests[1].request.requestId, "continuous-room-2");
  entry.resolve(1);
  await flush();
  assert.equal(machine.getSnapshot().status, "completed");
  assert.equal(machine.getSnapshot().operation, null);

  const recovered = new ContinuousRoomSelectionMachine(preferences, new InMemorySelectionEntryAdapter());
  assert.equal(recovered.getSnapshot().selectedCharacterId, expectedRoster[1].id);
  assert.equal(recovered.getSnapshot().nick, "Fagulha", "refresh recovers nick and character from versioned state");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const first = new TrainingSelectionMachine(preferences, new InMemorySelectionEntryAdapter());
  first.dispatch({ type: "choose-character", characterId: expectedRoster[2].id });
  first.dispatch({ type: "edit-selection-nick", value: "VoltaLocal" });
  first.dispose();
  const returned = new TrainingSelectionMachine(preferences, new InMemorySelectionEntryAdapter());
  assert.equal(returned.getSnapshot().selectedCharacterId, expectedRoster[2].id);
  assert.equal(returned.getSnapshot().nick, "VoltaLocal", "local Back preserves a valid draft without confirming");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const entry = new InMemorySelectionEntryAdapter();
  const machine = new ContinuousRoomSelectionMachine(preferences, entry);
  machine.dispatch({ type: "confirm-selection" });
  machine.dispatch({ type: "cancel-selection" });
  machine.dispatch({ type: "choose-character", characterId: expectedRoster[2].id });
  machine.dispatch({ type: "confirm-selection" });

  entry.resolve(0);
  await flush();
  assert.equal(machine.getSnapshot().status, "pending", "stale response cannot complete the newer operation");
  assert.equal(machine.getSnapshot().operation?.requestId, "continuous-room-2");
  entry.resolve(1);
  await flush();
  assert.equal(machine.getSnapshot().status, "completed");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const entry = new InMemorySelectionEntryAdapter();
  const training = new TrainingSelectionMachine(preferences, entry);

  assert.notEqual(
    training.constructor,
    ContinuousRoomSelectionMachine,
    "Treino uses a distinct journey machine rather than a generic domain machine",
  );
  assert.equal(training.getSnapshot().route, "/treino/personagem");
  assert.equal(training.getSnapshot().title, "Escolha para o Treino contra bots");
  assert.equal(training.getSnapshot().actionLabel, "Iniciar treino");
  training.dispatch({ type: "choose-character", characterId: expectedRoster[3].id });
  training.dispatch({ type: "edit-selection-nick", value: "Nara_7" });
  training.dispatch({ type: "confirm-selection" });
  training.dispatch({ type: "confirm-selection" });
  assert.equal(entry.requests.length, 1);
  assert.deepEqual(entry.requests[0].request, {
    journey: "training",
    destination: "/game/training",
    requestId: "training-1",
    characterId: expectedRoster[3].id,
    nick: "Nara_7",
  });
  assert.equal(training.getSnapshot().operation?.label, "Preparando treino…");

  entry.reject(0, new Error("asset unavailable"));
  await flush();
  assert.equal(training.getSnapshot().status, "error");
  assert.match(training.getSnapshot().errorMessage ?? "", /treino não iniciou/i);
  training.dispatch({ type: "retry-selection" });
  assert.equal(entry.requests.length, 2);
  entry.resolve(1);
  await flush();
  assert.equal(training.getSnapshot().status, "completed");
}

{
  const entry = new InMemorySelectionEntryAdapter();
  const machine = new TrainingSelectionMachine(new InMemorySelectionPreferenceStore(), entry);
  let notifications = 0;
  machine.subscribe(() => { notifications += 1; });
  machine.dispatch({ type: "confirm-selection" });
  machine.dispose();
  const disposed = machine.getSnapshot();
  entry.resolve(0);
  await flush();
  machine.dispatch({ type: "retry-selection" });
  assert.deepEqual(machine.getSnapshot(), disposed);
  assert.equal(notifications, 1, "dispose aborts entry and makes the machine inert");
}

console.log("canonical character Selection journey machines: ok");
