import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const wranglerBin = path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js");

const port = String(process.env.PORT || "8788");
const host = process.env.HOST || "0.0.0.0";

const child = spawn(
  process.execPath,
  [wranglerBin, "dev", "--local", "--port", port, "--ip", host],
  {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      BROWSER: "none",
      NO_COLOR: process.env.NO_COLOR || "1",
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

