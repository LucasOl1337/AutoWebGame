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
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        document.documentElement.dataset.unavailableExperiences = "lab";
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    `,
  });
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForExpression(cdp, "document.querySelectorAll('[data-experience]').length === 3");

  const viewportEvidence = [];
  for (const viewport of [
    { width: 1440, height: 900, name: "wide" },
    { width: 360, height: 800, name: "portrait" },
    { width: 800, height: 360, name: "short-landscape" },
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
    })`);
    const capture = await cdp.send("Page.captureScreenshot", { format: "png" });
    assert.equal(layout.innerWidth, viewport.width);
    assert.ok(layout.scrollWidth <= viewport.width, `${viewport.name} has no horizontal overflow`);
    assert.equal(layout.buttonCount, 3);
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
  assert.equal(initial.utilityLinks, 0, "auxiliary journeys remain outside #37");
  assert.equal(initial.landmark, "canonical-launcher-title");
  assert.equal(initial.live, "polite");

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-experience=lab]').click()`,
  });
  const unavailable = await evaluateJson(cdp, `({
    status: document.querySelector('[role=status]').textContent,
    focused: document.activeElement?.textContent,
    disabled: [...document.querySelectorAll('[data-experience]')].every((button) => button.disabled),
    pathname: location.pathname,
  })`);
  assert.equal(unavailable.status, "Laboratório Bot vs Bot indisponível");
  assert.equal(unavailable.focused, "Laboratório Bot vs Bot indisponível");
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
    "Laboratório Bot vs Bot indisponível",
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
  await waitForExpression(cdp, "document.activeElement?.dataset.experience === 'lab'");
  const restored = await evaluateJson(cdp, `({
    status: document.querySelector('[role=status]').textContent,
    focusedExperience: document.activeElement?.dataset.experience,
    disabled: [...document.querySelectorAll('[data-experience]')].some((button) => button.disabled),
  })`);
  assert.equal(restored.status, "Escolha sua próxima experiência");
  assert.equal(restored.focusedExperience, "lab");
  assert.equal(restored.disabled, false);

  const cancellation = await evaluateJson(cdp, `(() => {
    document.querySelector('[data-experience=training]').click();
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
  assert.equal(cancellation.pendingStatus, "Abrindo Treino contra bots");
  assert.equal(cancellation.statusFocused, true);
  assert.equal(cancellation.restoredFocus, "training");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await evaluateJson(cdp, "({ pathname: location.pathname })")).pathname, "/");

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
