import assert from "node:assert/strict";

import {
  FrontendKernel,
  InMemoryNavigationAdapter,
} from "../output/esm/FrontendKernel/frontend-kernel.js";
import {
  InMemoryIdentityAdapter,
} from "../output/esm/FrontendKernel/identity-adapter.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

{
  const identity = new InMemoryIdentityAdapter({ temporaryNick: "Brasa" });
  const navigation = new InMemoryNavigationAdapter("/");
  const kernel = new FrontendKernel(navigation, identity);
  await settle();

  assert.deepEqual(kernel.getSnapshot().identity, {
    status: "visitor",
    temporaryNick: "Brasa",
    draftNick: "Brasa",
    validationMessage: null,
  });

  kernel.dispatch({ type: "edit-temporary-nick", value: "Fagulha" });
  kernel.dispatch({ type: "save-temporary-nick" });
  assert.equal(identity.temporaryNick, "Fagulha");
  assert.equal(kernel.getSnapshot().identity.temporaryNick, "Fagulha");

  kernel.dispatch({ type: "activate-experience", experience: "lab" });
  assert.equal(kernel.getSnapshot().screen, "lab-access");
  assert.equal(kernel.getSnapshot().route, "/laboratorio");
  assert.match(kernel.getSnapshot().description, /login|conta/i);
  assert.deepEqual(navigation.visits, ["/laboratorio"]);
}

{
  const identity = new InMemoryIdentityAdapter({
    account: {
      id: "account-7",
      username: "nara",
      displayName: "Nara",
      authLevel: "email",
    },
  });
  const navigation = new InMemoryNavigationAdapter("/");
  const kernel = new FrontendKernel(navigation, identity);
  await settle();

  assert.deepEqual(kernel.getSnapshot().identity, {
    status: "authenticated",
    accountId: "account-7",
    username: "nara",
    displayName: "Nara",
  });

  kernel.dispatch({ type: "activate-experience", experience: "lab" });
  assert.equal(kernel.getSnapshot().operation?.label, "Abrindo Laboratório Bot vs Bot");
  assert.equal(navigation.requests[0]?.href, "/game/lab");
}

{
  const identity = new InMemoryIdentityAdapter({
    account: {
      id: "account-8",
      username: "luma",
      displayName: "Luma",
      authLevel: "email",
    },
  });
  const navigation = new InMemoryNavigationAdapter("/laboratorio");
  const kernel = new FrontendKernel(navigation, identity);
  await settle();

  kernel.dispatch({ type: "activate-experience", experience: "lab" });
  kernel.dispatch({ type: "activate-experience", experience: "lab" });
  assert.equal(navigation.requests.length, 1, "Lab gate emits one visible operation");
  assert.equal(kernel.getSnapshot().operation?.label, "Abrindo Laboratório Bot vs Bot");

  kernel.dispatch({ type: "navigate-back" });
  assert.equal(navigation.cancelRequests, 1);
  assert.equal(kernel.getSnapshot().screen, "lab-access");
  assert.equal(kernel.getSnapshot().operation, null);
}

{
  const identity = new InMemoryIdentityAdapter({
    account: {
      id: "account-9",
      username: "ivo",
      displayName: "Ivo",
      authLevel: "email",
    },
  });
  const navigation = new InMemoryNavigationAdapter("/laboratorio", ["lab"]);
  const kernel = new FrontendKernel(navigation, identity);
  await settle();

  kernel.dispatch({ type: "activate-experience", experience: "lab" });
  assert.deepEqual(kernel.getSnapshot().operation, {
    experience: "lab",
    label: "Laboratório Bot vs Bot indisponível",
    status: "unavailable",
  });
  assert.deepEqual(navigation.requests, []);

  kernel.dispatch({ type: "navigate-back" });
  assert.equal(kernel.getSnapshot().screen, "lab-access");
  assert.equal(kernel.getSnapshot().operation, null);
}

{
  const identity = new InMemoryIdentityAdapter({ loadError: new Error("offline") });
  const navigation = new InMemoryNavigationAdapter("/ajuda");
  const kernel = new FrontendKernel(navigation, identity);
  await settle();

  assert.equal(kernel.getSnapshot().screen, "auxiliary");
  assert.equal(kernel.getSnapshot().route, "/ajuda");
  assert.equal(kernel.getSnapshot().identity.status, "error");
  assert.match(kernel.getSnapshot().identity.message, /sessão/i);

  identity.loadError = null;
  kernel.dispatch({ type: "retry-identity" });
  assert.equal(kernel.getSnapshot().identity.status, "loading");
  await settle();
  assert.equal(kernel.getSnapshot().identity.status, "visitor");

  kernel.dispatch({ type: "navigate-back" });
  assert.equal(kernel.getSnapshot().screen, "launcher");
  assert.equal(kernel.getSnapshot().route, "/");
  assert.deepEqual(navigation.replacements, ["/"]);
  assert.deepEqual(navigation.visits, []);
}

for (const [route, auxiliary] of [
  ["/como-jogar", "how-to-play"],
  ["/conta", "account"],
  ["/ajuda", "help"],
  ["/configuracoes", "settings"],
]) {
  const kernel = new FrontendKernel(
    new InMemoryNavigationAdapter(route),
    new InMemoryIdentityAdapter(),
  );
  await settle();
  assert.equal(kernel.getSnapshot().screen, "auxiliary");
  assert.equal(kernel.getSnapshot().auxiliary, auxiliary);
  assert.equal(kernel.getSnapshot().route, route);
  kernel.dispose();
}

console.log("frontend kernel auxiliary journeys and identity contract: ok");
