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
const profile = await mkdtemp(path.join(tmpdir(), "awg-character-selection-"));
const captureDirectory = process.env.CHARACTER_SELECTION_CAPTURE_DIR
  ? path.resolve(process.env.CHARACTER_SELECTION_CAPTURE_DIR)
  : null;
if (captureDirectory && !captureDirectory.startsWith(path.resolve(tmpdir()))) {
  throw new Error("CHARACTER_SELECTION_CAPTURE_DIR must stay inside the OS temp directory");
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
  const tab = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${appUrl}jogar/personagem`)}`, {
    method: "PUT",
  }).then((response) => response.json());
  const cdp = await createCdp(tab.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        if (!url.endsWith("/api/auth/session")) return nativeFetch(input, init);
        return Promise.resolve(new Response(JSON.stringify({ account: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      };
    `,
  });
  await cdp.send("Page.navigate", { url: `${appUrl}jogar/personagem` });
  await waitForExpression(cdp, "document.querySelectorAll('[data-selection-character]').length === 4");
  const actualRoute = await evaluateJson(cdp, `({
    pathname: location.pathname,
    journey: document.querySelector('.canonical-selection')?.textContent.includes('Sala contínua'),
    cards: document.querySelectorAll('[data-selection-character]').length,
    labControls: document.querySelectorAll('[data-laboratory], [data-competitor]').length,
    sourceImages: [...document.querySelectorAll('[data-selection-character] img')].map((image) => image.getAttribute('src')),
  })`);
  assert.equal(actualRoute.pathname, "/jogar/personagem");
  assert.equal(actualRoute.journey, true);
  assert.equal(actualRoute.cards, 4);
  assert.equal(actualRoute.labControls, 0);
  assert.ok(actualRoute.sourceImages.every((source) => /Assets\/Characters\/Animations\/.+\/idle-south-0\.png/.test(source)));

  const harnessEvaluation = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const [{ CanonicalLauncherView }, { CANONICAL_CHARACTER_CATALOG }] = await Promise.all([
        import('/src/FrontendKernel/canonical-launcher-view.ts'),
        import('/src/FrontendKernel/CharacterSelection/selection-contract.ts'),
      ]);
      const appRoot = document.querySelector('#app');
      const fixture = document.createElement('div');
      fixture.id = 'selection-fixture';
      fixture.addEventListener('click', (event) => event.stopPropagation());
      fixture.addEventListener('input', (event) => event.stopPropagation());
      appRoot.replaceChildren(fixture);
      const base = {
        screen: 'character-selection',
        journey: 'continuous-room',
        route: '/jogar/personagem',
        title: 'Escolha para a Sala contínua',
        actionLabel: 'Continuar',
        status: 'choosing',
        roster: CANONICAL_CHARACTER_CATALOG,
        selectedCharacterId: CANONICAL_CHARACTER_CATALOG[0].id,
        nick: 'Fagulha',
        operation: null,
        errorMessage: null,
        validationMessage: null,
        focusTarget: null,
      };
      const listeners = new Set();
      window.__selectionHarness = {
        snapshot: base,
        intents: [],
        set(patch) {
          this.snapshot = Object.freeze({ ...base, ...patch });
          listeners.forEach((listener) => listener(this.snapshot));
        },
      };
      const kernel = {
        dispatch(intent) {
          window.__selectionHarness.intents.push(intent);
          if (intent.type === 'edit-selection-nick') {
            window.__selectionHarness.snapshot = Object.freeze({
              ...window.__selectionHarness.snapshot,
              nick: intent.value,
            });
            listeners.forEach((listener) => listener(window.__selectionHarness.snapshot));
          }
          if (intent.type === 'choose-character') {
            window.__selectionHarness.snapshot = Object.freeze({
              ...window.__selectionHarness.snapshot,
              selectedCharacterId: intent.characterId,
            });
            listeners.forEach((listener) => listener(window.__selectionHarness.snapshot));
          }
          if (intent.type === 'confirm-selection') {
            window.__selectionHarness.snapshot = Object.freeze({
              ...window.__selectionHarness.snapshot,
              status: 'pending',
              operation: Object.freeze({ requestId: 'continuous-room-keyboard', label: 'Procurando próxima sala…' }),
            });
            listeners.forEach((listener) => listener(window.__selectionHarness.snapshot));
          }
        },
        getSnapshot() { return window.__selectionHarness.snapshot; },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        dispose() { listeners.clear(); },
      };
      const view = new CanonicalLauncherView(fixture, kernel);
      view.mount();
      window.__selectionHarness.view = view;
    })()`,
    awaitPromise: true,
  });
  if (harnessEvaluation.exceptionDetails) {
    throw new Error(`Selection fixture failed: ${harnessEvaluation.exceptionDetails.exception?.description ?? harnessEvaluation.exceptionDetails.text}`);
  }
  await waitForExpression(cdp, "Boolean(document.querySelector('#selection-fixture [data-selection-character]'))");

  const states = [
    { name: "normal", patch: { status: "choosing", operation: null, errorMessage: null, focusTarget: null } },
    { name: "pending", patch: { status: "pending", operation: { requestId: "continuous-room-7", label: "Procurando próxima sala…" }, errorMessage: null, focusTarget: null } },
    { name: "error", patch: { status: "error", operation: null, errorMessage: "Não entramos em nenhuma sala. Sua escolha foi preservada.", focusTarget: "error" } },
  ];
  const viewports = [
    { width: 1440, height: 900, name: "wide" },
    { width: 360, height: 800, name: "portrait" },
    { width: 800, height: 360, name: "short-landscape" },
    { width: 320, height: 568, name: "touch-portrait-floor" },
    { width: 568, height: 320, name: "touch-landscape-floor" },
    { width: 768, height: 1024, name: "tablet-portrait" },
    { width: 1024, height: 768, name: "tablet-landscape" },
  ];
  const viewportEvidence = [];
  for (const state of states) {
    await cdp.send("Runtime.evaluate", {
      expression: `window.__selectionHarness.set(${JSON.stringify(state.patch)})`,
    });
    await waitForExpression(cdp, "[...document.querySelectorAll('#selection-fixture [data-selection-character] img')].every((image) => image.complete && image.naturalWidth > 0)");
    for (const viewport of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width <= 800,
      });
      const layout = await evaluateJson(cdp, `(() => {
        const actions = [...document.querySelectorAll('#selection-fixture button, #selection-fixture input')];
        const visible = actions.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth,
          cards: document.querySelectorAll('#selection-fixture [data-selection-character]').length,
          smallestTarget: Math.min(...visible.map((element) => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height))),
          clipped: visible.filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -0.5 || rect.right > innerWidth + 0.5;
          }).length,
          busy: document.querySelector('#selection-fixture main')?.getAttribute('aria-busy'),
          alert: document.querySelector('#selection-fixture [role=alert]')?.textContent ?? null,
          status: document.querySelector('#selection-fixture [role=status]')?.textContent,
          disabledCards: [...document.querySelectorAll('#selection-fixture [data-selection-character]')].filter((button) => button.disabled).length,
        };
      })()`);
      assert.ok(layout.scrollWidth <= viewport.width, `${state.name}/${viewport.name} has no horizontal overflow`);
      assert.equal(layout.cards, 4);
      assert.ok(layout.smallestTarget >= 44, `${state.name}/${viewport.name} keeps 44px targets`);
      assert.equal(layout.clipped, 0, `${state.name}/${viewport.name} has no clipped horizontal action`);
      assert.equal(layout.busy, String(state.name === "pending"));
      if (state.name === "pending") {
        assert.match(layout.status, /Procurando próxima sala/i);
        assert.equal(layout.disabledCards, 4);
      }
      if (state.name === "error") assert.match(layout.alert, /escolha foi preservada/i);
      const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const bytes = Buffer.from(capture.data, "base64");
      assert.ok(bytes.length > 8_000);
      const screenshotPath = captureDirectory
        ? path.join(captureDirectory, `${state.name}-${viewport.name}-${viewport.width}x${viewport.height}.png`)
        : null;
      if (screenshotPath) await writeFile(screenshotPath, bytes);
      viewportEvidence.push({ state: state.name, ...viewport, screenshotBytes: bytes.length, ...(screenshotPath ? { screenshotPath } : {}) });
    }
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 450,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send("Runtime.evaluate", { expression: `window.__selectionHarness.set(${JSON.stringify(states[0].patch)})` });
  const zoom = await evaluateJson(cdp, `({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll('#selection-fixture button, #selection-fixture input')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -0.5 || rect.right > innerWidth + 0.5);
    }).length,
  })`);
  assert.equal(zoom.innerWidth, 720);
  assert.ok(zoom.scrollWidth <= 720, "200% reflow has no horizontal overflow");
  assert.equal(zoom.clipped, 0);
  const zoomCapture = await cdp.send("Page.captureScreenshot", { format: "png" });
  const zoomBytes = Buffer.from(zoomCapture.data, "base64");
  assert.equal(zoomBytes.readUInt32BE(16), 1440);
  assert.equal(zoomBytes.readUInt32BE(20), 900);
  const zoomPath = captureDirectory ? path.join(captureDirectory, "normal-zoom-200-1440x900.png") : null;
  if (zoomPath) await writeFile(zoomPath, zoomBytes);
  viewportEvidence.push({ state: "normal", name: "zoom-200", width: 1440, height: 900, cssWidth: 720, cssHeight: 450, screenshotBytes: zoomBytes.length, ...(zoomPath ? { screenshotPath: zoomPath } : {}) });

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const reduced = await evaluateJson(cdp, `({
    transition: getComputedStyle(document.querySelector('#selection-fixture [data-selection-character]')).transitionDuration,
    animation: getComputedStyle(document.querySelector('#selection-fixture [data-selection-character]')).animationName,
  })`);
  assert.match(reduced.transition, /^0s/);
  assert.equal(reduced.animation, "none");

  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "forced-colors", value: "active" }],
  });
  const forced = await evaluateJson(cdp, `({
    active: matchMedia('(forced-colors: active)').matches,
    outline: getComputedStyle(document.querySelector('#selection-fixture [aria-checked=true]')).outlineStyle,
  })`);
  assert.equal(forced.active, true);
  assert.notEqual(forced.outline, "none");

  await cdp.send("Emulation.setEmulatedMedia", { media: "screen", features: [] });
  const semantics = await evaluateJson(cdp, `(() => {
    const selected = document.querySelector('#selection-fixture [aria-checked=true]');
    selected.focus();
    const label = document.querySelector('#selection-fixture label[for=selection-nick]');
    const input = document.querySelector('#selection-fixture [data-selection-nick]');
    const fg = getComputedStyle(document.querySelector('#selection-fixture .canonical-selection')).color;
    const bg = getComputedStyle(document.querySelector('#selection-fixture .canonical-selection')).backgroundColor;
    return {
      radioGroup: document.querySelector('#selection-fixture [role=radiogroup]')?.getAttribute('aria-label'),
      selectedRole: selected?.getAttribute('role'),
      selectedState: selected?.getAttribute('aria-checked'),
      focused: document.activeElement === selected,
      radioTabIndexes: [...document.querySelectorAll('#selection-fixture [role=radio]')].map((radio) => radio.tabIndex),
      label: label?.textContent,
      inputLabelled: label?.htmlFor === input?.id,
      foreground: fg,
      background: bg,
    };
  })()`);
  assert.equal(semantics.radioGroup, "Personagens aprovados");
  assert.equal(semantics.selectedRole, "radio");
  assert.equal(semantics.selectedState, "true");
  assert.equal(semantics.focused, true);
  assert.deepEqual(semantics.radioTabIndexes, [0, -1, -1, -1]);
  assert.equal(semantics.label, "Nick temporário");
  assert.equal(semantics.inputLabelled, true);
  assert.ok(contrastRatio(semantics.foreground, semantics.background) >= 4.5, "body text meets 4.5:1 contrast");

  const intentsBeforeArrow = await evaluateJson(cdp, "window.__selectionHarness.intents.length");
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
  const arrowNavigation = await evaluateJson(cdp, `(() => ({
    selectedIndex: [...document.querySelectorAll('#selection-fixture [role=radio]')].findIndex((radio) => radio.getAttribute('aria-checked') === 'true'),
    focusedIndex: [...document.querySelectorAll('#selection-fixture [role=radio]')].indexOf(document.activeElement),
    tabIndexes: [...document.querySelectorAll('#selection-fixture [role=radio]')].map((radio) => radio.tabIndex),
    intents: window.__selectionHarness.intents.slice(${intentsBeforeArrow}),
  }))()`);
  assert.equal(arrowNavigation.selectedIndex, 1);
  assert.equal(arrowNavigation.focusedIndex, 1);
  assert.deepEqual(arrowNavigation.tabIndexes, [-1, 0, -1, -1]);
  assert.deepEqual(arrowNavigation.intents.map((intent) => intent.type), ["choose-character"]);

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#selection-fixture [data-selection-nick]');
      input.focus();
      input.setSelectionRange(2, 2);
    })()`,
  });
  await typeText(cdp, "XY");
  const nickTyping = await evaluateJson(cdp, `(() => {
    const input = document.querySelector('#selection-fixture [data-selection-nick]');
    return {
      value: input.value,
      focused: document.activeElement === input,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    };
  })()`);
  assert.deepEqual(nickTyping, {
    value: "FaXYgulha",
    focused: true,
    selectionStart: 4,
    selectionEnd: 4,
  });

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('#selection-fixture [data-selection-nick]');
      input.value = 'Nara_7';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      document.querySelector('#selection-fixture [data-selection-character]:nth-child(2)').focus();
    })()`,
  });
  await cdp.send("Page.bringToFront");
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await cdp.send("Input.dispatchKeyEvent", { type: "char", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: " " });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await cdp.send("Runtime.evaluate", { expression: `document.querySelector('#selection-fixture [data-selection-intent=confirm-selection]').focus()` });
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  const pendingFocus = await evaluateJson(cdp, `({
    pending: document.querySelector('#selection-fixture main')?.getAttribute('aria-busy'),
    focusedCancel: document.activeElement === document.querySelector('#selection-fixture [data-selection-cancel-focus]'),
    activeTag: document.activeElement?.tagName,
  })`);
  assert.deepEqual(pendingFocus, { pending: "true", focusedCancel: true, activeTag: "BUTTON" });
  const intents = await evaluateJson(cdp, `window.__selectionHarness.intents`);
  assert.ok(intents.some((intent) => intent.type === "edit-selection-nick" && intent.value === "Nara_7"));
  assert.ok(intents.some((intent) => intent.type === "choose-character"));
  assert.ok(intents.some((intent) => intent.type === "confirm-selection"), "shared View emits Intents instead of mutating session state");
  assert.equal(intents.some((intent) => intent.type === "navigate-back"), false, "transferred Enter activation never cancels the new pending operation");

  await cdp.send("Page.navigate", { url: `${appUrl}laboratorio` });
  await waitForExpression(cdp, "document.querySelector('[data-route-heading]')?.textContent === 'Laboratório Bot vs Bot'");
  const lab = await evaluateJson(cdp, `({
    pathname: location.pathname,
    selectionViews: document.querySelectorAll('.canonical-selection').length,
    characterCards: document.querySelectorAll('[data-selection-character]').length,
  })`);
  assert.deepEqual(lab, { pathname: "/laboratorio", selectionViews: 0, characterCards: 0 });

  cdp.close();
  console.log(JSON.stringify({
    contract: "canonical Selection real DOM states, accessibility and responsive envelope",
    viewportEvidence,
    pass: true,
  }));
} finally {
  killTree(browser);
  killTree(app);
  if (profile.startsWith(tmpdir())) await rm(profile, { recursive: true, force: true });
}

function contrastRatio(foreground, background) {
  const luminance = (rgb) => {
    const values = rgb.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const linear = values.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const left = luminance(foreground);
  const right = luminance(background);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
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
  if (!found) throw new Error("Chrome is required for the canonical Selection DOM gate");
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
    close() { socket.close(); },
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

async function typeText(cdp, value) {
  await cdp.send("Page.bringToFront");
  for (const character of value) {
    const keyCode = character.toUpperCase().charCodeAt(0);
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: character,
      code: `Key${character.toUpperCase()}`,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "char",
      key: character,
      text: character,
      unmodifiedText: character,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: character,
      code: `Key${character.toUpperCase()}`,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
  }
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}
