import { runBotRemoteControlGameAppScenario } from "../scripts/bot-remote-control-gameapp-scenario.mjs";

const report = runBotRemoteControlGameAppScenario();
console.log(JSON.stringify(report, null, 2));

if (!report.pass) process.exit(1);
