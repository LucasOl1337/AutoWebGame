import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const url = process.env.ARENA_PREVIEW_URL;
assert.ok(url, "ARENA_PREVIEW_URL is required");

const chromePath = process.env.CHROME_PATH
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? "9231");
const artifactRoot = process.env.ARENA_PREVIEW_ARTIFACTS
  ?? path.join(os.tmpdir(), "autowebgame-issue-40", "launcher-cdp");
const userDataDir = path.join(os.tmpdir(), `autowebgame-issue-40-chrome-${process.pid}`);
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForJsonVersion() {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw lastError ?? new Error("Chrome DevTools endpoint did not start");
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
        return;
      }
      this.events.push(message);
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return result;
  }

  close() {
    this.socket.close();
  }
}

const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 600 },
  { width: 800, height: 360 },
  { width: 568, height: 320 },
];

async function inspectScenario(cdp, scenario, viewport) {
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
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    }),
  ]);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__arenaCspViolations=[];document.addEventListener("securitypolicyviolation",event=>window.__arenaCspViolations.push({blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective}));`,
  });
  if (scenario === "fallback") {
    await send("Network.setBlockedURLs", { urls: ["*thumbnail.svg"] });
  }
  const eventStart = cdp.events.length;
  await send("Page.navigate", { url });

  let inspection;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const evaluation = await send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(async () => {
        const figure = document.querySelector("[data-canonical-arena-preview]");
        const image = figure?.querySelector("img");
        if (!figure || !image) return null;
        try { await image.decode(); } catch { return null; }
        if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return null;
        figure.scrollIntoView({block:"center",inline:"center"});
        const figureRect = figure.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        const canvas = document.createElement("canvas");
        canvas.width = 552;
        canvas.height = 456;
        const context = canvas.getContext("2d", {willReadFrequently:true});
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const sample = (x, y) => [...context.getImageData(x, y, 1, 1).data];
        return {
          catalogStatus: document.documentElement.dataset.canonicalArenaCatalog,
          catalogRef: document.documentElement.dataset.canonicalArenaRef,
          renderMode: figure.dataset.canonicalArenaPreview,
          degraded: figure.dataset.degraded,
          fallbackUsed: figure.dataset.fallbackUsed,
          source: image.currentSrc || image.src,
          viewport: {width: innerWidth,height: innerHeight},
          documentScrollWidth: document.documentElement.scrollWidth,
          figure: {
            left:figureRect.left,
            top:figureRect.top,
            right:figureRect.right,
            bottom:figureRect.bottom,
            width:figureRect.width,
            height:figureRect.height,
            documentX:figureRect.left + scrollX,
            documentY:figureRect.top + scrollY,
          },
          image: {width:imageRect.width,height:imageRect.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,objectFit:style.objectFit},
          pixels: {
            solid: sample(35, 35),
            breakable: sample(131, 131),
            portal: sample(275, 35),
          },
          cspViolations: window.__arenaCspViolations ?? [],
        };
      })()`,
    });
    inspection = evaluation.result.value;
    if (inspection) break;
    await delay(50);
  }
  if (!inspection) {
    const diagnostic = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `({href:location.href,title:document.title,bodyClass:document.body?.className,htmlDataset:{...document.documentElement.dataset},bodyText:document.body?.innerText?.slice(0,500)})`,
    });
    const eventDiagnostic = cdp.events.slice(eventStart).filter((event) => (
      event.sessionId === sessionId
      && (event.method === "Runtime.exceptionThrown" || event.method === "Log.entryAdded")
    ));
    assert.fail(`${scenario} ${viewport.width}x${viewport.height}: preview did not render: ${JSON.stringify({ page: diagnostic.result.value, events: eventDiagnostic })}`);
  }
  assert.equal(inspection.catalogStatus, "ready");
  assert.equal(inspection.catalogRef, "cidadela-arcana@r1");
  assert.equal(inspection.renderMode, scenario === "asset" ? "assets" : "procedural");
  assert.equal(inspection.degraded, String(scenario === "fallback"));
  assert.equal(inspection.fallbackUsed, String(scenario === "fallback"));
  assert.equal(inspection.image.objectFit, "contain");
  assert.ok(inspection.figure.left >= -0.5 && inspection.figure.right <= inspection.viewport.width + 0.5);
  assert.ok(inspection.documentScrollWidth <= inspection.viewport.width);
  const naturalRatio = inspection.image.naturalWidth / inspection.image.naturalHeight;
  const renderedRatio = inspection.image.width / inspection.image.height;
  assert.ok(Math.abs(naturalRatio - renderedRatio) < 0.01, `${scenario}: image aspect ratio was cropped`);
  assert.deepEqual(inspection.pixels.solid, [121, 123, 125, 255], `${scenario}: solid pixel did not decode`);
  assert.deepEqual(inspection.pixels.breakable, [207, 123, 69, 255], `${scenario}: breakable pixel did not decode`);
  assert.deepEqual(inspection.pixels.portal, [34, 211, 238, 255], `${scenario}: portal pixel did not decode`);
  assert.equal(new Set(Object.values(inspection.pixels).map((rgba) => rgba.join(","))).size, 3);
  assert.deepEqual(inspection.cspViolations, []);
  if (scenario === "asset") assert.match(inspection.source, /\/Assets\/TileMaps\/canonical\/cidadela-arcana\/r1\/thumbnail\.svg$/);
  else assert.match(inspection.source, /^blob:/);

  let lifecycle = null;
  if (scenario === "fallback") {
    const lifecycleEvaluation = await send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(async () => {
        const replacements = [];
        for (let iteration = 0; iteration < 2; iteration += 1) {
          const previous = document.querySelector("[data-canonical-arena-preview] img")?.src;
          const nick = document.querySelector("[data-temporary-nick]");
          nick.value = "BlobGate" + iteration;
          nick.dispatchEvent(new Event("input", {bubbles:true}));
          const currentImage = document.querySelector("[data-canonical-arena-preview] img");
          await currentImage.decode();
          const current = currentImage.src;
          const previousReachable = await fetch(previous).then(() => true, () => false);
          const currentReachable = await fetch(current).then((response) => response.ok, () => false);
          replacements.push({previous, current, previousReachable, currentReachable});
        }
        return {replacements, current: document.querySelector("[data-canonical-arena-preview] img")?.src};
      })()`,
    });
    lifecycle = lifecycleEvaluation.result.value;
    assert.equal(lifecycle.replacements.length, 2);
    for (const replacement of lifecycle.replacements) {
      assert.match(replacement.previous, /^blob:/);
      assert.match(replacement.current, /^blob:/);
      assert.notEqual(replacement.current, replacement.previous);
      assert.equal(replacement.previousReachable, false, "replaced Blob URL must be revoked");
      assert.equal(replacement.currentReachable, true, "current Blob URL must remain decodable");
    }
  }

  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
    clip: {
      x: inspection.figure.documentX,
      y: inspection.figure.documentY,
      width: inspection.figure.width,
      height: inspection.figure.height,
      scale: 1,
    },
  });
  const artifact = path.join(artifactRoot, `${scenario}-${viewport.width}x${viewport.height}.png`);
  await writeFile(artifact, Buffer.from(screenshot.data, "base64"));

  if (scenario === "fallback") {
    const disposalEvaluation = await send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(async () => {
        const current = document.querySelector("[data-canonical-arena-preview] img")?.src;
        window.dispatchEvent(new PageTransitionEvent("pagehide", {persisted:false}));
        const reachableAfterDispose = await fetch(current).then(() => true, () => false);
        return {current, reachableAfterDispose, rootChildren: document.querySelector("#app")?.childElementCount};
      })()`,
    });
    const disposal = disposalEvaluation.result.value;
    assert.equal(disposal.current, lifecycle.current);
    assert.equal(disposal.reachableAfterDispose, false, "disposed Blob URL must be revoked");
    assert.equal(disposal.rootChildren, 0);
  }

  const relevantEvents = cdp.events.slice(eventStart).filter((event) => event.sessionId === sessionId);
  const securityErrors = relevantEvents.filter((event) => (
    event.method === "Log.entryAdded"
    && event.params.entry.level === "error"
    && /content security policy|refused to (load|execute)/i.test(event.params.entry.text)
  ));
  const exceptions = relevantEvents.filter((event) => event.method === "Runtime.exceptionThrown");
  assert.deepEqual(securityErrors, []);
  assert.deepEqual(exceptions, []);
  await cdp.send("Target.disposeBrowserContext", { browserContextId });
  return { scenario, viewport, inspection, lifecycle, artifact };
}

let cdp;
try {
  const version = await waitForJsonVersion();
  cdp = new CdpConnection(version.webSocketDebuggerUrl);
  const results = [];
  for (const scenario of ["asset", "fallback"]) {
    for (const viewport of viewports) {
      results.push(await inspectScenario(cdp, scenario, viewport));
    }
  }
  console.log(JSON.stringify({
    pass: true,
    browser: version.Browser,
    results: results.map(({ scenario, viewport, inspection, artifact }) => ({
      scenario,
      viewport,
      renderMode: inspection.renderMode,
      degraded: inspection.degraded,
      fallbackUsed: inspection.fallbackUsed,
      source: inspection.source.startsWith("blob:") ? "trusted-blob-url" : inspection.source,
      dimensions: inspection.image,
      artifact,
    })),
  }, null, 2));
} finally {
  cdp?.close();
  chrome.kill();
}
