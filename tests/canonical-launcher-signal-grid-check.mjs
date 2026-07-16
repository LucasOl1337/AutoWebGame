import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const root = path.resolve(new URL("..", import.meta.url).pathname.slice(1));
const chrome = findChrome();
const appPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(path.join(tmpdir(), "awg-launcher-signals-"));
const app = spawn(process.env.ComSpec ?? "cmd.exe", [
  "/d", "/s", "/c",
  `npm.cmd run dev:frontend -- --host 127.0.0.1 --port ${appPort}`,
], {
  cwd: root,
  env: { ...process.env, VITE_PUBLIC_ROUTE_POINTER: "canonical" },
  stdio: "ignore",
});
let browser;

try {
  await waitForHttp(`http://127.0.0.1:${appPort}/`);
  browser = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const tab = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${appPort}/`)}`,
    { method: "PUT" },
  ).then((response) => response.json());
  const cdp = await createCdp(tab.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await waitForExpression(cdp, "Boolean(document.querySelector('.canonical-launcher__grid'))");

  const canonical = await evaluateJson(cdp, `(() => {
    const grid = document.querySelector('.canonical-launcher__grid');
    const primary = document.querySelector('.canonical-launcher__experience--primary');
    const before = getComputedStyle(grid, '::before');
    const signal = getComputedStyle(primary, '::after');
    return {
      label: before.content,
      pointerEvents: before.pointerEvents,
      animation: signal.animationName,
      accent: getComputedStyle(primary).borderTopColor,
    };
  })()`);
  assert.match(canonical.label, /EXPERIENCE MATRIX/);
  assert.equal(canonical.pointerEvents, "none");
  assert.equal(canonical.animation, "canonical-launcher-signal-pulse");
  assert.notEqual(canonical.accent, "rgba(0, 0, 0, 0)");

  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  assert.ok(Buffer.from(screenshot.data, "base64").length > 10_000);
  cdp.close();
  console.log(JSON.stringify({ pass: true, canonical }));
} finally {
  killTree(browser);
  killTree(app);
  if (profile.startsWith(tmpdir())) await rm(profile, { recursive: true, force: true });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error("Chrome is required for the Launcher signal gate");
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
    close() { socket.close(); },
  };
}

async function waitForExpression(cdp, expression) {
  const deadline = Date.now() + 15_000;
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
  spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
