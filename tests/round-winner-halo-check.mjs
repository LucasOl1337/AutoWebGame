import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const methodStart = source.indexOf("  private drawRoundWinnerHalo(");
const methodEnd = source.indexOf("  private getActiveSkillAnimationFrames(", methodStart);
const method = methodStart >= 0 && methodEnd > methodStart ? source.slice(methodStart, methodEnd) : "";
const drawPlayerStart = source.indexOf("  private drawPlayer(");
const drawPlayer = drawPlayerStart >= 0 && methodStart > drawPlayerStart
  ? source.slice(drawPlayerStart, methodStart)
  : "";

const report = {
  hasDedicatedHalo: method.length > 0,
  gatedByCurrentOutcomeWinner: method.includes("this.roundOutcome?.winner !== player.id"),
  usesExistingPalette: method.includes("CANVAS_UI_GOLD") && method.includes("CANVAS_UI_GOLD_BRIGHT"),
  staysPixelArt: method.includes("fillRect") && !method.includes("arc(") && !method.includes("ellipse("),
  drawnBeforeAvatar: drawPlayer.indexOf("this.drawRoundWinnerHalo(player, x, y)") < drawPlayer.indexOf("this.ctx.drawImage("),
  avoidsGameplayMutation: !/player\.[A-Za-z_$][\w$]*\s*=|roundOutcome\s*=/.test(method),
};

report.pass = Object.values(report).every(Boolean);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
