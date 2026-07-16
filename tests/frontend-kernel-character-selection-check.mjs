import assert from "node:assert/strict";

import {
  FrontendKernel,
  InMemoryNavigationAdapter,
} from "../output/esm/FrontendKernel/frontend-kernel.js";
import { InMemoryIdentityAdapter } from "../output/esm/FrontendKernel/identity-adapter.js";
import {
  InMemorySelectionEntryAdapter,
  InMemorySelectionPreferenceStore,
} from "../output/esm/FrontendKernel/CharacterSelection/selection-adapters.js";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

{
  const navigation = new InMemoryNavigationAdapter("/");
  const identity = new InMemoryIdentityAdapter({ temporaryNick: "Fagulha" });
  const preferences = new InMemorySelectionPreferenceStore();
  const entry = new InMemorySelectionEntryAdapter();
  const kernel = new FrontendKernel(navigation, identity, { preferences, entry });
  await flush();

  kernel.dispatch({ type: "activate-experience", experience: "continuous-room" });
  assert.deepEqual(navigation.visits, ["/jogar/personagem"]);
  assert.equal(kernel.getSnapshot().screen, "character-selection");
  assert.equal(kernel.getSnapshot().journey, "continuous-room");
  assert.equal(kernel.getSnapshot().nick, "Fagulha", "Launcher identity crosses the Selection seam once");

  const second = kernel.getSnapshot().roster[1];
  kernel.dispatch({ type: "choose-character", characterId: second.id });
  kernel.dispatch({ type: "edit-selection-nick", value: "BombaByte" });
  kernel.dispatch({ type: "confirm-selection" });
  kernel.dispatch({ type: "confirm-selection" });
  assert.equal(entry.requests.length, 1);
  assert.equal(kernel.getSnapshot().status, "pending");

  kernel.dispatch({ type: "navigate-back" });
  assert.equal(kernel.getSnapshot().status, "choosing", "Back cancels pending without adding a history step");
  assert.equal(kernel.getSnapshot().selectedCharacterId, second.id);
  assert.equal(kernel.getSnapshot().nick, "BombaByte");
  assert.deepEqual(navigation.replacements, []);

  kernel.dispatch({ type: "navigate-back" });
  assert.deepEqual(navigation.replacements, ["/"]);
  assert.equal(kernel.getSnapshot().screen, "launcher");

  kernel.dispatch({ type: "activate-experience", experience: "continuous-room" });
  assert.equal(kernel.getSnapshot().selectedCharacterId, second.id);
  assert.equal(kernel.getSnapshot().nick, "BombaByte", "local Back restores the persisted choice");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const entry = new InMemorySelectionEntryAdapter();
  const navigation = new InMemoryNavigationAdapter("/treino/personagem");
  const refreshed = new FrontendKernel(
    navigation,
    new InMemoryIdentityAdapter(),
    { preferences, entry },
  );

  assert.equal(refreshed.getSnapshot().screen, "character-selection");
  assert.equal(refreshed.getSnapshot().journey, "training");
  assert.equal(refreshed.getSnapshot().route, "/treino/personagem");
  assert.deepEqual(entry.requests, [], "refresh rehydrates Selection without repeating entry");
  refreshed.dispatch({ type: "confirm-selection" });
  refreshed.dispatch({ type: "confirm-selection" });
  assert.equal(entry.requests.length, 1);
  entry.reject(0, new Error("local assets unavailable"));
  await flush();
  assert.equal(refreshed.getSnapshot().status, "error");
  refreshed.dispatch({ type: "retry-selection" });
  assert.equal(entry.requests.length, 2);
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const visitor = new FrontendKernel(
    new InMemoryNavigationAdapter("/jogar/personagem"),
    new InMemoryIdentityAdapter({ temporaryNick: "DeepLink" }),
    { preferences, entry: new InMemorySelectionEntryAdapter() },
  );
  await flush();
  assert.equal(visitor.getSnapshot().nick, "DeepLink", "direct route reconciles the Launcher visitor identity");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const authenticated = new FrontendKernel(
    new InMemoryNavigationAdapter("/treino/personagem"),
    new InMemoryIdentityAdapter({
      temporaryNick: "LocalNick",
      account: {
        id: "account-39",
        username: "nara",
        displayName: "Nara Oficial",
        authLevel: "email",
      },
    }),
    { preferences, entry: new InMemorySelectionEntryAdapter() },
  );
  await flush();
  assert.equal(authenticated.getSnapshot().nick, "Nara Oficial", "direct route reconciles authenticated identity after load");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  preferences.write("training", {
    characterId: preferences.read("training").characterId,
    nick: "EscolhaSalva",
  });
  const preserved = new FrontendKernel(
    new InMemoryNavigationAdapter("/treino/personagem"),
    new InMemoryIdentityAdapter({ temporaryNick: "OutroNick" }),
    { preferences, entry: new InMemorySelectionEntryAdapter() },
  );
  await flush();
  assert.equal(preserved.getSnapshot().nick, "EscolhaSalva", "valid journey preference wins on refresh");
}

{
  const navigation = new InMemoryNavigationAdapter("/laboratorio");
  const kernel = new FrontendKernel(navigation, new InMemoryIdentityAdapter());
  assert.equal(kernel.getSnapshot().screen, "lab-access");
  assert.equal("roster" in kernel.getSnapshot(), false, "Laboratório never receives the shared Selection View");
  kernel.dispatch({ type: "choose-character", characterId: "not-a-character" });
  assert.equal(kernel.getSnapshot().screen, "lab-access");
}

{
  const preferences = new InMemorySelectionPreferenceStore();
  const entry = new InMemorySelectionEntryAdapter();
  const kernel = new FrontendKernel(
    new InMemoryNavigationAdapter("/jogar/personagem"),
    new InMemoryIdentityAdapter(),
    { preferences, entry },
  );
  let notifications = 0;
  kernel.subscribe(() => { notifications += 1; });
  kernel.dispatch({ type: "confirm-selection" });
  kernel.dispose();
  const disposed = kernel.getSnapshot();
  entry.resolve(0);
  await flush();
  assert.deepEqual(kernel.getSnapshot(), disposed);
  assert.equal(notifications, 1, "dispose makes the composed FrontendKernel inert");
}

console.log("FrontendKernel canonical character Selection intent-to-snapshot: ok");
