import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const baseUrl = new URL(process.env.CONTINUOUS_ROOM_CANARY_URL ?? "http://127.0.0.1:8787/");
const chromePath = process.env.CHROME_PATH
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? await freePort());
const artifactRoot = process.env.CONTINUOUS_ROOM_CANARY_ARTIFACTS
  ?? path.join(os.tmpdir(), "autowebgame-issue-41", `cdp-${process.pid}`);
const userDataDir = path.join(os.tmpdir(), `autowebgame-issue-41-chrome-${process.pid}`);
await mkdir(artifactRoot, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

async function main() {
let cdp;
try {
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
  cdp = new CdpConnection(version.webSocketDebuggerUrl);
  const { browserContextId } = await cdp.send("Target.createBrowserContext");
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => cdp.send(method, params, sessionId);
  await Promise.all([
    send("Page.enable"),
    send("Runtime.enable"),
    send("Log.enable"),
    send("Network.enable"),
    send("Emulation.setDeviceMetricsOverride", {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    }),
  ]);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__canaryErrors=[];
      window.__canaryTrace={fetches:[],digests:0,uuids:0};
      addEventListener("error",event=>window.__canaryErrors.push(String(event.error?.message??event.message)));
      addEventListener("unhandledrejection",event=>window.__canaryErrors.push(String(event.reason?.message??event.reason)));
      const nativeFetch=window.fetch.bind(window);
      window.fetch=(input,init)=>{window.__canaryTrace.fetches.push(typeof input==="string"?input:input.url);return nativeFetch(input,init)};
      const nativeDigest=crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest=(...args)=>{window.__canaryTrace.digests+=1;return nativeDigest(...args)};
      const nativeUuid=crypto.randomUUID.bind(crypto);
      crypto.randomUUID=()=>{window.__canaryTrace.uuids+=1;return nativeUuid()};
    `,
  });

  const eventStart = cdp.events.length;
  await send("Page.navigate", { url: new URL("jogar/personagem", baseUrl).href });
  await waitForExpression(send, `document.querySelectorAll("[data-selection-character]").length === 4`);
  const selection = await evaluate(send, `({
    pathname: location.pathname,
    heading: document.querySelector("h1")?.textContent,
    continuous: document.querySelector(".canonical-selection")?.textContent.includes("Sala contínua"),
  })`);
  assert.equal(selection.pathname, "/jogar/personagem");
  assert.equal(selection.continuous, true, "the canary rollout must own the continuous-room journey");
  assert.match(selection.heading, /Sala contínua/i);

  const clickEvidence = await evaluate(send, `(() => {
    const button = document.querySelector("[data-selection-confirm]");
    button.click();
    const current = document.querySelector("[data-selection-confirm]");
    current?.click();
    return {
      originalDisabled: button.disabled,
      currentDisabled: current?.disabled,
      busy: document.querySelector(".canonical-selection")?.getAttribute("aria-busy"),
      status: document.querySelector(".canonical-selection [role=status]")?.textContent,
    };
  })()`);
  assert.equal(clickEvidence.originalDisabled, false);
  assert.equal(clickEvidence.currentDisabled, true);
  assert.equal(clickEvidence.busy, "true");
  assert.match(clickEvidence.status, /Procurando próxima sala|Criando nova sala/);
  await waitForExpression(send, `location.pathname.startsWith("/sala/") && Boolean(document.querySelector(".continuous-room"))`, 400);
  const roomUrl = await evaluate(send, "location.href");
  const roomPath = new URL(roomUrl).pathname;
  assert.match(roomPath, /^\/sala\/[A-Za-z0-9_-]{8,128}$/);

  const commandsAfterEntry = canaryCommands(cdp.events.slice(eventStart), sessionId);
  assert.equal(commandsAfterEntry.filter((command) => command.type === "prepare-entry").length, 1, "double submit prepares once");
  assert.equal(commandsAfterEntry.filter((command) => command.type === "commit-entry").length, 1, "double submit commits once");

  await waitForExpression(send, `document.querySelectorAll(".continuous-room__participant").length === 4`, 1_200);
  const preparing = await inspectRoom(send);
  assert.equal(preparing.participants, 4);
  assert.equal(preparing.completers, 3);
  assert.equal(preparing.humans, 1);
  assert.match(preparing.text, /Nara/);
  assert.match(preparing.text, /Bento/);
  assert.match(preparing.text, /Luma/);
  assert.match(preparing.text, /Ivo .* reserva/);
  assert.equal(preparing.horizontalOverflow, false);

  const acceptsLiveInput = await evaluate(send, `Boolean(document.querySelector('[data-room-input="right"]'))`);
  if (acceptsLiveInput) {
    for (const input of ["right", "bomb"]) {
      await evaluate(send, `document.querySelector('[data-room-input="${input}"]').click()`);
      await delay(80);
    }
  }

  await waitForExpression(send, `Boolean(document.querySelector(".continuous-room__result"))`, 1_200);
  const resultDesktop = await inspectRoom(send);
  assert.equal(resultDesktop.cells, 99);
  assert.equal(resultDesktop.hasResult, true);
  assert.match(resultDesktop.text, /Resultado autoritativo da primeira Rodada/);
  assert.match(resultDesktop.text, /prova sha256:/);
  const commandsAfterResult = canaryCommands(cdp.events.slice(eventStart), sessionId);
  if (acceptsLiveInput) {
    assert.equal(commandsAfterResult.filter((command) => command.type === "input").length, 2,
      "visible input controls must produce exactly two authoritative input commands");
  } else {
    assert.equal(resultDesktop.inputControls, 0, "a result cannot fabricate stale input controls");
    assert.equal(commandsAfterResult.some((command) => command.type === "input"), false,
      "the browser test cannot fabricate input after the local deadline");
  }
  assertNoTokenLeak(resultDesktop);
  const desktopShot = await screenshot(send, path.join(artifactRoot, "result-desktop-1440x900.png"));

  const revisionBeforeReload = resultDesktop.revision;
  await send("Page.reload", { ignoreCache: true });
  await waitForExpression(send, `location.pathname === ${JSON.stringify(roomPath)} && Boolean(document.querySelector(".continuous-room__result"))`, 1_200);
  const recovered = await inspectRoom(send);
  assert.ok(recovered.revision > revisionBeforeReload, "reload rotates credentials and accepts a newer authoritative revision");
  assert.equal(recovered.cells, 99);
  assertNoTokenLeak(recovered);

  await send("Emulation.setDeviceMetricsOverride", {
    width: 360, height: 800, deviceScaleFactor: 1, mobile: true,
  });
  const mobile = await inspectRoom(send);
  assert.equal(mobile.horizontalOverflow, false, "mobile room has no horizontal overflow");
  assert.ok(mobile.smallestTarget >= 44, "mobile room keeps a 44px leave target");
  const mobileShot = await screenshot(send, path.join(artifactRoot, "result-mobile-360x800.png"));

  const completedExit = await evaluate(send, `({
    href: document.querySelector('.continuous-room__actions a')?.getAttribute('href'),
    label: document.querySelector('.continuous-room__actions a')?.textContent,
    leaveButtons: document.querySelectorAll('[data-room-action="leave"]').length,
  })`);
  assert.deepEqual(completedExit, { href: "/", label: "Voltar ao Launcher", leaveButtons: 0 },
    "a completed round exits normally instead of fabricating a compensating command");
  await evaluate(send, `document.querySelector('.continuous-room__actions a').click()`);
  await waitForExpression(send, `location.pathname === "/" && Boolean(document.querySelector(".canonical-launcher"))`);
  const commandsAfterExit = canaryCommands(cdp.events.slice(eventStart), sessionId);
  assert.equal(commandsAfterExit.some((command) => command.type === "cancel-entry"), false,
    "completed-round exit cannot emit entry compensation");

  const browserErrors = cdp.events.slice(eventStart).filter((event) => event.sessionId === sessionId && (
    event.method === "Runtime.exceptionThrown"
    || (event.method === "Log.entryAdded" && event.params.entry.level === "error")
  ));
  const pageErrors = await evaluate(send, "window.__canaryErrors");
  assert.deepEqual(pageErrors, []);
  assert.equal(browserErrors.length, 0, JSON.stringify(browserErrors));
  const serializedLogs = JSON.stringify(cdp.events.slice(eventStart).filter((event) => (
    event.method === "Runtime.consoleAPICalled" || event.method === "Log.entryAdded"
  )));
  assert.doesNotMatch(serializedLogs, /token_[A-Za-z0-9_-]{20,}/, "recovery token never reaches console or browser log events");

  console.log("continuous-room-canary-cdp-check: ok", JSON.stringify({
    baseUrl: baseUrl.origin,
    roomPath,
    entryCommands: commandsAfterEntry.map((command) => command.type),
    acceptsLiveInput,
    recoveredRevision: recovered.revision,
    desktopScreenshotBytes: desktopShot,
    mobileScreenshotBytes: mobileShot,
    artifactRoot,
  }));
} finally {
  cdp?.close();
  chrome.kill();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}
}

function assertNoTokenLeak(inspection) {
  assert.doesNotMatch(inspection.html, /token_[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(inspection.href, /token_[A-Za-z0-9_-]{20,}/);
  assert.equal(inspection.resourceUrls.some((url) => /token_[A-Za-z0-9_-]{20,}/.test(url)), false);
}

async function inspectRoom(send) {
  return evaluate(send, `(() => {
    const root = document.querySelector(".continuous-room");
    const visibleTargets = [...root.querySelectorAll("button,a")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      href: location.href,
      html: root?.outerHTML ?? "",
      text: root?.textContent ?? "",
      revision: Number(root?.querySelector(".continuous-room__header > span")?.textContent.replace(/\\D/g, "")),
      participants: root?.querySelectorAll(".continuous-room__participant").length ?? 0,
      completers: root?.querySelectorAll('.continuous-room__participant[data-kind="completer"]').length ?? 0,
      humans: root?.querySelectorAll('.continuous-room__participant[data-kind="human"]').length ?? 0,
      cells: root?.querySelectorAll(".continuous-room__arena > span").length ?? 0,
      hasResult: Boolean(root?.querySelector(".continuous-room__result")),
      inputControls: root?.querySelectorAll("[data-room-input]").length ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      smallestTarget: visibleTargets.length ? Math.min(...visibleTargets.map((element) => {
        const rect = element.getBoundingClientRect();
        return Math.min(rect.width, rect.height);
      })) : 0,
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name),
    };
  })()`);
}

function canaryCommands(events, sessionId) {
  return events.filter((event) => event.sessionId === sessionId
    && event.method === "Network.requestWillBeSent"
    && event.params.request.url.includes("/api/canonical/continuous-room/canary/commands"))
    .flatMap((event) => {
      try { return [JSON.parse(event.params.request.postData ?? "null")]; } catch { return []; }
    });
}

async function screenshot(send, outputPath) {
  const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const bytes = Buffer.from(capture.data, "base64");
  assert.ok(bytes.length > 8_000, `${outputPath} is unexpectedly small`);
  await writeFile(outputPath, bytes);
  return bytes.length;
}

async function evaluate(send, expression) {
  const evaluation = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);
  }
  return evaluation.result.value;
}

async function waitForExpression(send, expression, attempts = 400) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (last.result.value === true) return;
    await delay(50);
  }
  const diagnostic = await evaluate(send, `({
    href: location.href,
    title: document.title,
    body: document.body?.innerText?.slice(0, 800),
    errors: window.__canaryErrors ?? [],
    trace: window.__canaryTrace ?? null,
  })`);
  throw new Error(`Timed out waiting for: ${expression}; last=${JSON.stringify(last)}; page=${JSON.stringify(diagnostic)}`);
}

async function waitForHttp(url) {
  let lastError;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) { lastError = error; }
    await delay(50);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { method, resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return result;
  }

  close() { this.socket.close(); }
}

await main();
