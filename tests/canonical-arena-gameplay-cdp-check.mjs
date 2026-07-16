import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const url = process.env.ARENA_PREVIEW_URL;
assert.ok(url, "ARENA_PREVIEW_URL is required");
const chromePath = process.env.CHROME_PATH
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? "9232");
const artifactRoot = process.env.ARENA_GAMEPLAY_ARTIFACTS
  ?? path.join(os.tmpdir(), "autowebgame-issue-40", "gameplay-cdp");
const userDataDir = path.join(os.tmpdir(), `autowebgame-issue-40-gameplay-${process.pid}`);
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
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { method, resolve, reject }));
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

const expectedDigests = Object.freeze({
  "/Assets/TileMaps/canonical/cidadela-arcana/r1/tile-atlas.svg": "sha256:ecf456e38e98f19fcc3b6612ba358b10a3780b54be22f4a68bdee68770f4601f",
  "/Assets/VisualEffects/bomb.png": "sha256:c030c6db626ceb2041728eaca27c340d2d2c3522493cfff2f7ce21ac6cd41417",
  "/Assets/VisualEffects/flame.png": "sha256:de845dc4c3dfc1f65829f0a941005dd922d8e28882541507818260f81598823f",
  "/Assets/UiLayouts/power-bomb.png": "sha256:7166c855d05923552b6fe944ceea1ca9d3725f1e42f7b940589039ae0e327adb",
});

async function inspectViewport(cdp, viewport) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext");
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => cdp.send(method, params, sessionId);
  await Promise.all([
    send("Page.enable"),
    send("Runtime.enable"),
    send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    }),
  ]);
  await send("Page.navigate", { url });
  await delay(250);
  const evaluation = await send("Runtime.evaluate", {
    returnByValue: true,
    awaitPromise: true,
    expression: `(async () => {
      const [{GameApp}, assetsModule, catalog] = await Promise.all([
        import("/src/Engine/game-app.ts"),
        import("/src/Engine/assets.ts"),
        import("/src/Arenas/canonical-arena-catalog.ts"),
      ]);
      const map = catalog.getCanonicalArenaMap();
      const arena = {...catalog.toArenaDefinition(map),randomSeed:"gameplay-visual-v1"};
      const atlas = new Image();
      atlas.src = map.assets.atlas.path;
      await atlas.decode();
      const atlasCanvas = document.createElement("canvas");
      atlasCanvas.width = 384;
      atlasCanvas.height = 64;
      const atlasContext = atlasCanvas.getContext("2d", {willReadFrequently:true});
      atlasContext.drawImage(atlas, 0, 0);
      const atlasPixels = atlasContext.getImageData(0, 0, 384, 64).data;
      const slots = [];
      for (let slot = 0; slot < 6; slot += 1) {
        let opaque = 0;
        let transparent = 0;
        for (let y = 0; y < 64; y += 1) for (let x = slot * 64; x < (slot + 1) * 64; x += 1) {
          if (atlasPixels[(y * 384 + x) * 4 + 3] === 255) opaque += 1;
          else transparent += 1;
        }
        slots.push({slot, opaque, transparent});
      }
      const objectUrls = [];
      const slice = async (slot) => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        canvas.getContext("2d").drawImage(atlas, slot * 64, 0, 64, 64, 0, 0, 64, 64);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        return image;
      };
      const slices = await Promise.all([0,1,2,3,4,5].map(slice));
      const assets = await assetsModule.loadGameAssets("arcane-citadel");
      assets.floor.base = slices[0];
      assets.floor.lane = slices[1];
      assets.floor.spawn = slices[2];
      assets.props.wall = slices[4];
      assets.props.crate = slices[5];

      window.dispatchEvent(new Event("pagehide"));
      document.body.replaceChildren();
      document.body.style.cssText = "display:block;box-sizing:border-box;width:100%;min-width:0;margin:0;background:#030812;overflow:auto";
      const fixture = document.createElement("figure");
      fixture.dataset.canonicalArenaGameplayFixture = "real-game-app";
      fixture.style.cssText = "display:block;box-sizing:border-box;width:960px;max-width:100%;margin:0 auto;padding:0;background:#030812";
      const root = document.createElement("div");
      root.style.cssText = "display:grid;box-sizing:border-box;width:100%;min-width:0;place-items:start center;overflow:visible";
      const caption = document.createElement("figcaption");
      caption.textContent = "Cidadela Arcana r1 — GameApp real / atlas canônico / entidades publicadas";
      caption.style.cssText = "padding:8px;color:#e8f5ff;text-align:center;font:600 12px system-ui";
      fixture.append(root, caption);
      document.body.append(fixture);

      const game = new GameApp(root, assets, arena);
      game.start();
      document.querySelector("#autobot-dev-panel")?.remove();
      game.startServerAuthoritativeMatch([1,2,3,4], {1:0,2:1,3:2,4:3}, {arena, roomMode:"classic", botPlayerIds:[]});
      const neutral = {direction:null,bombPressed:false,detonatePressed:false,skillPressed:false,skillHeld:false};
      game.setServerPlayerInput(1, {...neutral,bombPressed:true});
      game.advanceServerSimulation(17);
      game.setServerPlayerInput(1, neutral);
      game.advanceServerSimulation(2000);
      game.setServerPlayerInput(2, {...neutral,bombPressed:true});
      game.advanceServerSimulation(17);
      game.setServerPlayerInput(2, {...neutral,direction:"left"});
      game.advanceServerSimulation(250);
      game.setServerPlayerInput(2, neutral);
      const composite = structuredClone(game.exportOnlineSnapshot());
      const powerUp = composite.powerUps.find((item) => item.type === "bomb-up" && !item.collected);
      if (!powerUp || composite.bombs.length === 0 || composite.flames.length === 0) {
        throw new Error("controlled GameApp state did not expose bomb/flame/powerup: " + JSON.stringify({
          bombs: composite.bombs.length,
          flames: composite.flames.length,
          powerUps: composite.powerUps,
        }));
      }
      powerUp.revealed = true;
      powerUp.collected = false;
      composite.breakableTiles = composite.breakableTiles.filter((key) => key !== powerUp.tile.x + "," + powerUp.tile.y);
      composite.showDangerOverlay = true;
      composite.paused = false;
      const base = structuredClone(composite);
      base.bombs = [];
      base.flames = [];
      base.powerUps = base.powerUps.map((item) => ({...item,revealed:false}));
      base.showDangerOverlay = false;
      game.applyOnlineSnapshot(base);
      window.advanceTime(17);
      const canvas = root.querySelector("[data-game-canvas='true']");
      const displayScale = Math.min(1, window.innerWidth / 960, Math.max(1, window.innerHeight - 52) / 690);
      const displayWidth = Math.max(1, Math.floor(960 * displayScale));
      const displayHeight = Math.max(1, Math.floor(690 * displayScale));
      fixture.style.width = displayWidth + "px";
      root.style.height = displayHeight + "px";
      canvas.style.cssText += ";display:block;width:" + displayWidth + "px;height:" + displayHeight + "px;max-width:100%";
      const context = canvas.getContext("2d", {willReadFrequently:true});
      const baselinePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      game.applyOnlineSnapshot(composite);
      window.advanceTime(17);
      const finalPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const sampleAtDisplayResolution = (pixels) => {
        const source = document.createElement("canvas");
        source.width = canvas.width;
        source.height = canvas.height;
        source.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height), 0, 0);
        const target = document.createElement("canvas");
        target.width = displayWidth;
        target.height = displayHeight;
        const targetContext = target.getContext("2d", {willReadFrequently:true});
        targetContext.drawImage(source, 0, 0, displayWidth, displayHeight);
        return targetContext.getImageData(0, 0, displayWidth, displayHeight).data;
      };
      const baselineDisplayPixels = sampleAtDisplayResolution(baselinePixels);
      const finalDisplayPixels = sampleAtDisplayResolution(finalPixels);
      const state = JSON.parse(window.render_game_to_text());
      const entityTiles = {
        bomb: state.bombs[0].tile,
        flame: state.flames[0].tile,
        powerup: powerUp.tile,
      };
      const occupied = new Set(Object.values(entityTiles).map((tile) => tile.x + "," + tile.y));
      entityTiles.danger = state.match.dangerOverlay.tiles.find((tile) => !occupied.has(tile.x + "," + tile.y));
      if (!entityTiles.danger) throw new Error("danger overlay did not expose an independent tile");
      const luminance = (r,g,b) => {
        const channel = (value) => { const c=value/255; return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4; };
        return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);
      };
      const regionEvidence = (tile) => {
        const arenaScale = (960 - 2 * state.arena.origin.x) / (state.arena.width * state.arena.tileSize);
        const cssScale = displayWidth / 960;
        const left = Math.round((state.arena.origin.x + tile.x * state.arena.tileSize * arenaScale) * cssScale);
        const top = Math.round((state.arena.origin.y + tile.y * state.arena.tileSize * arenaScale) * cssScale);
        const size = Math.round(state.arena.tileSize * arenaScale * cssScale);
        let changedPixels = 0;
        let maxContrast = 1;
        for (let y = top; y < top + size; y += 1) for (let x = left; x < left + size; x += 1) {
          const offset = (y * displayWidth + x) * 4;
          const before = [baselineDisplayPixels[offset],baselineDisplayPixels[offset+1],baselineDisplayPixels[offset+2]];
          const after = [finalDisplayPixels[offset],finalDisplayPixels[offset+1],finalDisplayPixels[offset+2]];
          if (before.some((value,index) => Math.abs(value-after[index]) >= 8)) changedPixels += 1;
          const beforeL = luminance(...before);
          const afterL = luminance(...after);
          maxContrast = Math.max(maxContrast, (Math.max(beforeL,afterL)+0.05)/(Math.min(beforeL,afterL)+0.05));
        }
        return {tile,changedPixels,maxContrast};
      };
      const contrast = Object.fromEntries(Object.entries(entityTiles).map(([name,tile]) => [name,regionEvidence(tile)]));
      const digest = async (assetPath) => {
        const bytes = await (await fetch(assetPath)).arrayBuffer();
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        return "sha256:" + [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2,"0")).join("");
      };
      const digests = Object.fromEntries(await Promise.all(Object.keys(${JSON.stringify(expectedDigests)}).map(async (assetPath) => [assetPath,await digest(assetPath)])));
      let totalChangedPixels = 0;
      const changedBounds = {left:displayWidth,top:displayHeight,right:-1,bottom:-1};
      for (let offset = 0; offset < finalDisplayPixels.length; offset += 4) {
        if ([0,1,2].some((channel) => Math.abs(finalDisplayPixels[offset+channel]-baselineDisplayPixels[offset+channel]) >= 8)) {
          totalChangedPixels += 1;
          const pixel = offset / 4;
          const x = pixel % displayWidth;
          const y = Math.floor(pixel / displayWidth);
          changedBounds.left = Math.min(changedBounds.left,x); changedBounds.right = Math.max(changedBounds.right,x);
          changedBounds.top = Math.min(changedBounds.top,y); changedBounds.bottom = Math.max(changedBounds.bottom,y);
        }
      }
      fixture.scrollIntoView({block:"start",inline:"center"});
      const rect = fixture.getBoundingClientRect();
      return {
        mapRef: map.id + "@" + map.revision,
        atlas: {naturalWidth:atlas.naturalWidth,naturalHeight:atlas.naturalHeight,slots,sliceDimensions:slices.map((image)=>[image.naturalWidth,image.naturalHeight])},
        digests,
        contrast,
        state: {bombs:state.bombs.length,flames:state.flames.length,powerups:state.powerups.filter((item)=>item.visible&&!item.collected).length,dangerTiles:state.match.dangerOverlay.tiles.length,arena:state.arena},
        changed: {totalChangedPixels,changedBounds},
        canvas: {width:canvas.width,height:canvas.height,cssWidth:canvas.getBoundingClientRect().width,cssHeight:canvas.getBoundingClientRect().height,sampledWidth:displayWidth,sampledHeight:displayHeight},
        fixture: {x:rect.left+scrollX,y:rect.top+scrollY,width:rect.width,height:rect.height},
      };
    })()`,
  });
  if (evaluation.exceptionDetails) assert.fail(JSON.stringify(evaluation.exceptionDetails));
  const result = evaluation.result.value;
  assert.equal(result.mapRef, "cidadela-arcana@r1");
  assert.deepEqual(result.digests, expectedDigests);
  assert.equal(result.atlas.naturalWidth, 384);
  assert.equal(result.atlas.naturalHeight, 64);
  assert.deepEqual(result.atlas.sliceDimensions, Array.from({ length: 6 }, () => [64, 64]));
  assert.equal(result.atlas.slots.slice(0, 4).every((slot) => slot.opaque === 4096 && slot.transparent === 0), true);
  assert.equal(result.atlas.slots.slice(4).every((slot) => slot.opaque > 2048 && slot.transparent > 0), true);
  assert.ok(
    result.state.bombs > 0 && result.state.flames > 0 && result.state.powerups > 0 && result.state.dangerTiles > 0,
    `controlled GameApp evidence incomplete: ${JSON.stringify(result.state)}`,
  );
  assert.equal(result.state.arena.width, 11);
  assert.equal(result.state.arena.height, 9);
  assert.equal(result.state.arena.tileSize, 40);
  assert.equal(result.state.arena.coordinates, "origin top-left, x to right, y to bottom");
  for (const [name, evidence] of Object.entries(result.contrast)) {
    assert.ok(evidence.changedPixels >= 24, `${name}: insufficient real rendered pixels: ${JSON.stringify({evidence,changed:result.changed,canvas:result.canvas,state:result.state})}`);
    assert.ok(evidence.maxContrast >= 3, `${name}: contrast ratio below 3:1: ${JSON.stringify(evidence)}`);
  }
  assert.ok(result.fixture.x >= -0.5 && result.fixture.x + result.fixture.width <= viewport.width + 0.5);
  assert.ok(result.fixture.width > 0 && result.fixture.height > 0, `fixture has invalid rect: ${JSON.stringify(result.fixture)}`);
  assert.ok(result.fixture.y >= -0.5 && result.fixture.y + result.fixture.height <= viewport.height + 0.5, `fixture cropped by viewport: ${JSON.stringify({viewport,fixture:result.fixture})}`);
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
    clip: { ...result.fixture, scale: 1 },
  });
  const artifact = path.join(artifactRoot, `gameplay-${viewport.width}x${viewport.height}.png`);
  await writeFile(artifact, Buffer.from(screenshot.data, "base64"));
  await cdp.send("Target.disposeBrowserContext", { browserContextId });
  return { viewport, artifact, result };
}

let cdp;
try {
  const version = await waitForJsonVersion();
  cdp = new CdpConnection(version.webSocketDebuggerUrl);
  const results = [];
  for (const viewport of viewports) results.push(await inspectViewport(cdp, viewport));
  console.log(JSON.stringify({
    pass: true,
    browser: version.Browser,
    expectedDigests,
    results: results.map(({ viewport, artifact, result }) => ({
      viewport,
      artifact,
      atlas: result.atlas,
      contrast: result.contrast,
      state: result.state,
      canvas: result.canvas,
    })),
  }, null, 2));
} finally {
  cdp?.close();
  chrome.kill();
}
