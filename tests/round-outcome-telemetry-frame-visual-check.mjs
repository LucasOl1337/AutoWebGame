import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const methodStart = source.indexOf("  private drawCenterOverlayTelemetryFrame(");
const methodEnd = source.indexOf("  private renderGameToText(", methodStart);
const method = methodStart >= 0 && methodEnd > methodStart ? source.slice(methodStart, methodEnd) : "";
const drawOverlayStart = source.indexOf("  private drawCenterOverlay(");
const drawOverlayEnd = source.indexOf("  private drawCenterOverlayTelemetryFrame(", drawOverlayStart);
const drawOverlay = drawOverlayStart >= 0 && drawOverlayEnd > drawOverlayStart
  ? source.slice(drawOverlayStart, drawOverlayEnd)
  : "";

const report = {
  hasDedicatedTelemetryFrame: method.length > 0,
  calledByCenterOverlay: drawOverlay.includes("this.drawCenterOverlayTelemetryFrame(showVictoryEmblem, showStalemateEmblem)"),
  distinguishesVictoryAndStalemate: method.includes("showVictoryEmblem") && method.includes("showStalemateEmblem"),
  usesSegmentedRail: method.includes("segmentCount = 8") && method.includes("segmentGap = 4") && method.includes("for (let index = 0"),
  usesPixelArtPrimitives: method.includes("fillRect") && !method.includes("arc(") && !method.includes("ellipse("),
  isolatesCanvasState: method.includes("this.ctx.save()") && method.includes("this.ctx.restore()"),
  avoidsGameplayMutation: !/player\.[A-Za-z_$][\w$]*\s*=|roundOutcome\s*=|score\s*=/.test(method),
};

report.pass = Object.values(report).every(Boolean);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
