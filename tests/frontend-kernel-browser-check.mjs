import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const root = path.resolve(new URL("..", import.meta.url).pathname.slice(1));
const chrome = findChrome();
const appPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(path.join(tmpdir(), "awg-frontend-kernel-"));
const captureDirectory = process.env.FRONTEND_KERNEL_CAPTURE_DIR
  ? path.resolve(process.env.FRONTEND_KERNEL_CAPTURE_DIR)
  : null;
if (captureDirectory && !captureDirectory.startsWith(path.resolve(tmpdir()))) {
  throw new Error("FRONTEND_KERNEL_CAPTURE_DIR must stay inside the OS temp directory");
}
if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const appCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : npm;
const appArguments = process.platform === "win32"
  ? ["/d", "/s", "/c", `npm.cmd run dev:frontend -- --host 127.0.0.1 --port ${appPort}`]
  : ["run", "dev:frontend", "--", "--host", "127.0.0.1", "--port", String(appPort)];
const app = spawn(appCommand, appArguments, {
  cwd: root,
  env: { ...process.env, VITE_PUBLIC_ROUTE_POINTER: "canonical" },
  stdio: "ignore",
});
let browser;

try {
  const appUrl = `http://127.0.0.1:${appPort}/`;
  await waitForHttp(appUrl);
  browser = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);

  const tab = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(appUrl)}`, {
    method: "PUT",
  }).then((response) => response.json());
  const cdp = await createCdp(tab.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        if (!url.endsWith("/api/auth/session")) return nativeFetch(input, init);
        const account = sessionStorage.getItem("bomba-pvp:test:identity");
        return new Promise((resolve) => setTimeout(() => resolve(new Response(
          JSON.stringify({ account: account ? JSON.parse(account) : null }),
          { status: 200, headers: { "content-type": "application/json" } },
        )), 2_500));
      };
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        document.documentElement.dataset.unavailableExperiences = "training";
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    `,
  });
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForExpression(cdp, "document.querySelectorAll('[data-experience]').length === 3");

  const loadingIdentity = await evaluateJson(cdp, `({
    nickDisabled: document.querySelector('[data-temporary-nick]')?.disabled,
    roomDisabled: document.querySelector('[data-experience=continuous-room]')?.disabled,
    trainingDisabled: document.querySelector('[data-experience=training]')?.disabled,
    status: document.querySelector('[role=status]')?.textContent,
  })`);
  assert.deepEqual(loadingIdentity, {
    nickDisabled: true,
    roomDisabled: false,
    trainingDisabled: false,
    status: "Confirmando sessão…",
  }, "identity loading is announced without blocking public experiences");

  const viewportEvidence = [];
  for (const viewport of [
    { width: 1440, height: 900, name: "wide" },
    { width: 360, height: 800, name: "portrait" },
    { width: 800, height: 360, name: "short-landscape" },
    { width: 320, height: 568, name: "touch-portrait-floor" },
    { width: 568, height: 320, name: "touch-landscape-floor" },
    { width: 768, height: 1024, name: "tablet-portrait" },
    { width: 1024, height: 768, name: "tablet-landscape" },
  ]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width === 360,
    });
    const layout = await evaluateJson(cdp, `({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      buttonCount: document.querySelectorAll('[data-experience]').length,
      smallestTarget: Math.min(...[...document.querySelectorAll('button')].map((button) => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))),
      clippedTargets: [...document.querySelectorAll('button')].filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left < 0 || rect.right > innerWidth + 0.5;
      }).length,
    })`);
    const capture = await cdp.send("Page.captureScreenshot", { format: "png" });
    assert.equal(layout.innerWidth, viewport.width);
    assert.ok(layout.scrollWidth <= viewport.width, `${viewport.name} has no horizontal overflow`);
    assert.equal(layout.buttonCount, 3);
    assert.ok(layout.smallestTarget >= 44, `${viewport.name} keeps every button at least 44×44 CSS px`);
    assert.equal(layout.clippedTargets, 0, `${viewport.name} has no horizontally clipped action`);
    assert.ok(capture.data.length > 10_000, `${viewport.name} produced visual evidence`);
    const screenshotBytes = Buffer.from(capture.data, "base64");
    const screenshotPath = captureDirectory
      ? path.join(captureDirectory, `${viewport.name}-${viewport.width}x${viewport.height}.png`)
      : null;
    if (screenshotPath) await writeFile(screenshotPath, screenshotBytes);
    viewportEvidence.push({
      ...viewport,
      screenshotBytes: screenshotBytes.length,
      ...(screenshotPath ? { screenshotPath } : {}),
    });
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 450,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const zoomLayout = await evaluateJson(cdp, `(() => {
    window.scrollTo(10000, 0);
    return {
      innerWidth,
      visualWidth: visualViewport?.width ?? innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX,
      smallestTarget: Math.min(...[...document.querySelectorAll('button')].map((button) => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))),
      clippedTargets: [...document.querySelectorAll('button')].filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left < 0 || rect.right > innerWidth + 0.5;
      }).length,
    };
  })()`);
  assert.equal(zoomLayout.innerWidth, 720, "200% browser zoom halves the 1440px physical layout viewport");
  assert.ok(
    zoomLayout.visualWidth <= zoomLayout.innerWidth && zoomLayout.visualWidth >= zoomLayout.innerWidth - 20,
    "200% reflow uses the reduced CSS viewport, allowing only the desktop scrollbar gutter",
  );
  assert.ok(zoomLayout.scrollWidth <= zoomLayout.innerWidth, "200% zoom does not create layout overflow");
  assert.equal(zoomLayout.scrollX, 0, "200% zoom has no horizontal document scroll");
  assert.ok(zoomLayout.smallestTarget >= 44, "200% reflow preserves 44×44 CSS px targets");
  assert.equal(zoomLayout.clippedTargets, 0, "200% zoom keeps actions inside the layout plane");
  const zoomCapture = await cdp.send("Page.captureScreenshot", { format: "png" });
  const zoomScreenshotBytes = Buffer.from(zoomCapture.data, "base64");
  assert.ok(zoomScreenshotBytes.length > 10_000, "200% zoom produced visual evidence");
  assert.equal(zoomScreenshotBytes.readUInt32BE(16), 1440, "zoom capture is 1440 physical pixels wide");
  assert.equal(zoomScreenshotBytes.readUInt32BE(20), 900, "zoom capture is 900 physical pixels high");
  const zoomScreenshotPath = captureDirectory
    ? path.join(captureDirectory, "zoom-200-1440x900.png")
    : null;
  if (zoomScreenshotPath) await writeFile(zoomScreenshotPath, zoomScreenshotBytes);
  viewportEvidence.push({
    width: 1440,
    height: 900,
    cssWidth: 720,
    cssHeight: 450,
    name: "zoom-200",
    screenshotBytes: zoomScreenshotBytes.length,
    ...(zoomScreenshotPath ? { screenshotPath: zoomScreenshotPath } : {}),
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  });

  const initial = await evaluateJson(cdp, `({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    labels: [...document.querySelectorAll('[data-experience] strong')].map((node) => node.textContent),
    utilityLinks: document.querySelectorAll('.canonical-launcher__utilities').length,
    landmark: document.querySelector('main')?.getAttribute('aria-labelledby'),
    live: document.querySelector('[role=status]')?.getAttribute('aria-live'),
  })`);
  assert.equal(initial.innerWidth, 360);
  assert.equal(initial.scrollWidth, 360, "mobile Launcher has no horizontal overflow");
  assert.deepEqual(initial.labels, ["Sala contínua", "Treino contra bots", "Laboratório Bot vs Bot"]);
  assert.equal(initial.utilityLinks, 1, "auxiliary journeys stay secondary to the experience matrix");
  assert.equal(initial.landmark, "canonical-launcher-title");
  assert.equal(initial.live, "polite");

  await waitForExpression(cdp, "document.querySelector('[data-temporary-nick]')?.disabled === false");
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-experience=training]').click()`,
  });
  const unavailable = await evaluateJson(cdp, `({
    status: document.querySelector('[role=status]').textContent,
    focused: document.activeElement?.textContent,
    disabled: [...document.querySelectorAll('[data-experience]')].every((button) => button.disabled),
    pathname: location.pathname,
  })`);
  assert.equal(unavailable.status, "Treino contra bots indisponível");
  assert.equal(unavailable.focused, "Treino contra bots indisponível");
  assert.equal(unavailable.disabled, true);
  assert.equal(unavailable.pathname, "/");

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    autoRepeat: true,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  assert.equal(
    (await evaluateJson(cdp, "({ status: document.querySelector('[role=status]').textContent })")).status,
    "Treino contra bots indisponível",
    "repeated Enter cannot dismiss the operation after focus moves to status",
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await waitForExpression(cdp, "document.activeElement?.dataset.intent === 'navigate-back'");
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
    text: " ",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await waitForExpression(cdp, "document.activeElement?.dataset.experience === 'training'");
  const restored = await evaluateJson(cdp, `({
    status: document.querySelector('[role=status]').textContent,
    focusedExperience: document.activeElement?.dataset.experience,
    disabled: [...document.querySelectorAll('[data-experience]')].some((button) => button.disabled),
  })`);
  assert.equal(restored.status, "Jogando como Visitante");
  assert.equal(restored.focusedExperience, "training");
  assert.equal(restored.disabled, false);

  const cancellation = await evaluateJson(cdp, `(() => {
    document.querySelector('[data-experience=continuous-room]').click();
    const pendingStatus = document.querySelector('[role=status]').textContent;
    const statusFocused = document.activeElement?.dataset.launcherStatus !== undefined;
    const cancel = document.querySelector('[data-intent=navigate-back]');
    cancel.focus();
    cancel.click();
    return {
      pendingStatus,
      statusFocused,
      restoredFocus: document.activeElement?.dataset.experience,
    };
  })()`);
  assert.equal(cancellation.pendingStatus, "Abrindo Sala contínua");
  assert.equal(cancellation.statusFocused, true);
  assert.equal(cancellation.restoredFocus, "continuous-room");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await evaluateJson(cdp, "({ pathname: location.pathname })")).pathname, "/");

  const nick = await evaluateJson(cdp, `(() => {
    const input = document.querySelector('[data-temporary-nick]');
    input.focus();
    input.value = 'Fagulha';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'a' }));
    const focusedAfterEdit = document.activeElement?.dataset.temporaryNick !== undefined;
    document.querySelector('[data-intent=save-temporary-nick]').click();
    return {
      value: document.querySelector('[data-temporary-nick]').value,
      stored: localStorage.getItem('bomba-pvp:launcher:v1:temporary-nick'),
      status: document.querySelector('[role=status]').textContent,
      focusedAfterEdit,
    };
  })()`);
  assert.equal(nick.value, "Fagulha");
  assert.equal(nick.stored, "Fagulha");
  assert.equal(nick.status, "Jogando como Fagulha");
  assert.equal(nick.focusedAfterEdit, true, "editing through the Snapshot preserves input focus");

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-experience=lab]').click()`,
  });
  await waitForExpression(cdp, "location.pathname === '/laboratorio'");
  const labGate = await evaluateJson(cdp, `({
    title: document.querySelector('[data-route-heading]')?.textContent,
    description: document.querySelector('.canonical-launcher__secondary-panel > p:not(.canonical-launcher__kicker)')?.textContent,
    accountAction: document.querySelector('[data-intent=open-account-access]')?.textContent,
    combatControls: document.querySelectorAll('[data-action=bomb], [data-action=skill]').length,
  })`);
  assert.equal(labGate.title, "Laboratório Bot vs Bot");
  assert.match(labGate.description, /conta/i);
  assert.match(labGate.accountAction, /Entrar|conta/i);
  assert.equal(labGate.combatControls, 0);

  const gateBack = await evaluateJson(cdp, `(() => {
    document.querySelector('[data-intent=navigate-back]').click();
    return {
      pathname: location.pathname,
      hasHelp: Boolean(document.querySelector('[data-auxiliary=help]')),
      html: document.querySelector('main')?.className,
    };
  })()`);
  assert.deepEqual(gateBack, {
    pathname: "/",
    hasHelp: true,
    html: "canonical-launcher",
  });
  await cdp.send("Runtime.evaluate", { expression: "history.back()" });
  await waitForExpression(cdp, "location.pathname === '/' && !document.querySelector('.canonical-launcher--secondary')");
  assert.equal(
    (await evaluateJson(cdp, "({ route: document.querySelector('[data-route-heading]')?.textContent })")).route,
    "Escolha o próximo confronto.",
    "browser Back cannot reopen the auxiliary route after returning to Launcher",
  );
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-auxiliary=help]').click()`,
  });
  await waitForExpression(cdp, "location.pathname === '/ajuda'");
  assert.equal(
    (await evaluateJson(cdp, "({ title: document.querySelector('[data-route-heading]').textContent })")).title,
    "Ajuda",
  );

  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForExpression(cdp, "location.pathname === '/ajuda' && document.querySelector('[data-route-heading]')?.textContent === 'Ajuda'");
  const refreshedBack = await evaluateJson(cdp, `(() => {
    document.querySelector('[data-intent=navigate-back]').click();
    return {
      pathname: location.pathname,
      hasLab: Boolean(document.querySelector('[data-experience=lab]')),
    };
  })()`);
  assert.deepEqual(refreshedBack, { pathname: "/", hasLab: true });

  await cdp.send("Runtime.evaluate", {
    expression: `sessionStorage.setItem('bomba-pvp:test:identity', JSON.stringify({ id: 'account-7', username: 'nara', displayName: 'Nara', authLevel: 'email' }))`,
  });
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForExpression(cdp, "document.querySelector('.canonical-launcher__identity strong')?.textContent === 'Nara'");
  const authenticated = await evaluateJson(cdp, `(() => {
    const label = document.querySelector('.canonical-launcher__identity strong')?.textContent;
    const access = document.querySelector('[data-experience=lab] .canonical-launcher__access')?.textContent;
    return {
      label,
      access,
    };
  })()`);
  assert.equal(authenticated.label, "Nara");
  assert.match(authenticated.access, /confirmada/i);

  await cdp.send("Page.navigate", { url: `${appUrl}laboratorio` });
  await waitForExpression(cdp, "document.querySelector('.canonical-launcher__identity strong')?.textContent === 'Nara'");
  const labContinue = await evaluateJson(cdp, `(() => {
    const button = document.querySelector('[data-experience=lab]');
    button.click();
    button.click();
    return {
      pathname: location.pathname,
      status: document.querySelector('[role=status]').textContent,
      disabled: document.querySelector('[data-experience=lab]').disabled,
    };
  })()`);
  assert.deepEqual(labContinue, {
    pathname: "/laboratorio",
    status: "Abrindo Laboratório Bot vs Bot",
    disabled: true,
  });
  const labCancel = await evaluateJson(cdp, `(() => {
    document.querySelector('[data-intent=navigate-back]').click();
    return {
      pathname: location.pathname,
      status: document.querySelector('[role=status]').textContent,
      disabled: document.querySelector('[data-experience=lab]').disabled,
    };
  })()`);
  assert.deepEqual(labCancel, {
    pathname: "/laboratorio",
    status: "Identidade ativa: Nara",
    disabled: false,
  });

  cdp.close();
  console.log(JSON.stringify({
    contract: "frontend kernel real DOM, keyboard, focus, availability and cancellation",
    viewportEvidence,
    pass: true,
  }));
} finally {
  killTree(browser);
  killTree(app);
  if (profile.startsWith(tmpdir())) {
    await rm(profile, { recursive: true, force: true });
  }
}

function findChrome() {
  const candidates = process.platform === "win32"
    ? [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : process.platform === "darwin"
      ? [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error("Chrome is required for the FrontendKernel DOM gate");
  return found;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function createCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const deferred = pending.get(message.id);
    if (!deferred) return;
    pending.delete(message.id);
    if (message.error) deferred.reject(new Error(message.error.message));
    else deferred.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function waitForExpression(cdp, expression) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.result.value === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}`);
}

async function evaluateJson(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify(${expression})`,
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}
