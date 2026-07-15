import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/bot-remote-control-lab.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const expectedSignals = [
  "BOT OBSERVADO · P2",
  "CONTROLADOR · IA DETERMINÍSTICA LOCAL",
  "ESTADO · SAUDÁVEL",
  "DECISÃO · VÁLIDA PARA ESTE SNAPSHOT",
  "INTENÇÃO · COLETAR DETONAÇÃO REMOTA",
  "ANTES · SHORT FUSE 100/100",
  "DEPOIS · REMOTE DETONATION 100/100",
  "SATURAÇÃO · Remote adquirido → Short Fuse OK · Short Fuse máximo → Remote OK",
  "RESULTADO · NÃO OBSERVADO",
  "MODELOS AVALIADOS · NENHUM",
  "AÇÃO HUMANA · NENHUMA",
];

const missingSignals = expectedSignals.filter((signal) => !output.includes(signal));
const report = {
  exitCode: result.status,
  expectedSignals: expectedSignals.length,
  missingSignals,
  pass: result.status === 0 && missingSignals.length === 0,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) process.exit(1);
