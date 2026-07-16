import assert from "node:assert/strict";

import {
  FrontendKernel,
  InMemoryNavigationAdapter,
} from "../output/esm/FrontendKernel/frontend-kernel.js";
import {
  PUBLIC_ROUTE_POINTER,
  resolvePublicRoutePointer,
} from "../output/esm/FrontendKernel/public-route-pointer.js";

assert.equal(resolvePublicRoutePointer("canonical"), "canonical");
assert.equal(resolvePublicRoutePointer("legacy"), "legacy");
assert.equal(resolvePublicRoutePointer(undefined), "legacy");
assert.equal(resolvePublicRoutePointer("unexpected"), "legacy");
assert.equal(PUBLIC_ROUTE_POINTER, "legacy", "an implicit build stays on the rollback surface");

{
  const navigation = new InMemoryNavigationAdapter("/");
  const kernel = new FrontendKernel(navigation);
  const snapshots = [];
  kernel.subscribe((snapshot) => snapshots.push(snapshot));

  const ready = kernel.getSnapshot();
  assert.equal(ready.screen, "launcher");
  assert.deepEqual(
    ready.experiences.map(({ experience, label }) => ({ experience, label })),
    [
      { experience: "continuous-room", label: "Sala contínua" },
      { experience: "training", label: "Treino contra bots" },
      { experience: "lab", label: "Laboratório Bot vs Bot" },
    ],
    "the Snapshot is the single Launcher catalog projection",
  );

  kernel.dispatch({ type: "activate-experience", experience: "continuous-room" });
  kernel.dispatch({ type: "activate-experience", experience: "continuous-room" });

  assert.deepEqual(navigation.visits, ["/jogar/personagem"]);
  assert.equal(kernel.getSnapshot().screen, "character-selection");
  assert.equal(kernel.getSnapshot().journey, "continuous-room");
  assert.equal(snapshots.length, 1, "double activation enters one stable Selection route");

  kernel.dispatch({ type: "navigate-back" });
  assert.equal(kernel.getSnapshot().screen, "launcher");
  assert.deepEqual(navigation.replacements, ["/"], "Back restores the Launcher from stable Selection");
  assert.equal(navigation.backRequests, 0, "Selection return is deterministic on a direct deep link");
}

{
  const navigation = new InMemoryNavigationAdapter("/game/training");
  const refreshed = new FrontendKernel(navigation);

  assert.deepEqual(refreshed.getSnapshot(), {
    screen: "delegated",
    route: "/game/training",
    experience: "training",
    operation: null,
  });
  assert.deepEqual(navigation.requests, [], "refresh does not repeat navigation");

  refreshed.dispatch({ type: "navigate-back" });
  assert.equal(navigation.backRequests, 1, "back is reserved for stable delegated routes");
}

{
  const navigation = new InMemoryNavigationAdapter("/", ["lab"]);
  const kernel = new FrontendKernel(navigation);

  kernel.dispatch({ type: "activate-experience", experience: "lab" });

  assert.deepEqual(kernel.getSnapshot().operation, {
    experience: "lab",
    label: "Laboratório Bot vs Bot indisponível",
    status: "unavailable",
  });
  assert.deepEqual(navigation.requests, []);

  kernel.dispatch({ type: "navigate-back" });
  assert.equal(kernel.getSnapshot().operation, null);
  assert.equal(navigation.backRequests, 0);
}

{
  const navigation = new InMemoryNavigationAdapter("/");
  const kernel = new FrontendKernel(navigation);
  let notifications = 0;
  const unsubscribe = kernel.subscribe(() => {
    notifications += 1;
  });

  unsubscribe();
  kernel.dispatch({ type: "activate-experience", experience: "training" });
  assert.equal(notifications, 0, "unsubscribe detaches the listener");

  kernel.dispose();
  const disposedSnapshot = kernel.getSnapshot();
  kernel.dispatch({ type: "navigate-back" });
  navigation.visit("/");
  assert.deepEqual(kernel.getSnapshot(), disposedSnapshot, "dispose makes the kernel inert");
}

console.log("frontend kernel intent-to-snapshot contract: ok");
