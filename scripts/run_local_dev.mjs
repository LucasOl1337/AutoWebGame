import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const wranglerBin = path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js");

/**
 * @param {string} label
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function runBlocking(label, args) {
  return new Promise((resolve, reject) => {
    const child = process.platform === "win32"
      ? spawn(process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", ["/d", "/s", "/c", args.join(" ")], {
        cwd: rootDir,
        stdio: "inherit",
        env: process.env,
      })
      : spawn(args[0], args.slice(1), {
        cwd: rootDir,
        stdio: "inherit",
        env: process.env,
      });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} terminou por sinal ${signal}.`));
        return;
      }
      if ((code ?? 0) !== 0) {
        reject(new Error(`${label} terminou com codigo ${code ?? 0}.`));
        return;
      }
      resolve();
    });
    child.on("error", reject);
  });
}

/**
 * @param {string} label
 * @param {string[]} command
 * @returns {import("node:child_process").ChildProcess}
 */
function spawnManaged(label, command) {
  const child = spawn(command[0], command.slice(1), {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      BROWSER: "none",
    },
  });
  child.on("error", (error) => {
    console.error(`[${label}]`, error);
  });
  return child;
}

const children = [];
let shuttingDown = false;

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function attachExit(label, child) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[${label}] finalizou (${signal ?? code ?? 0}). Encerrando dev local.`);
    stopAll(signal ?? "SIGTERM");
    process.exit(code ?? 0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopAll(signal);
    process.exit(0);
  });
}

await runBlocking("build", [npmBin, "run", "build"]);

const worker = spawnManaged("worker", [
  process.execPath,
  wranglerBin,
  "dev",
  "--local",
  "--port",
  "8787",
]);
children.push(worker);
attachExit("worker", worker);

const vite = spawnManaged("frontend", [
  process.execPath,
  viteBin,
  "--host",
  "127.0.0.1",
  "--port",
  "5174",
]);
children.push(vite);
attachExit("frontend", vite);

console.log("Dev local pronto:");
console.log("  Frontend: http://127.0.0.1:5174");
console.log("  Worker:   http://127.0.0.1:8787");
