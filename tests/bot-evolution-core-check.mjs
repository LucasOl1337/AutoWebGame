await import("./bot-evolution-action-registry-check.mjs");
await import("./bot-evolution-headless-round-runner-check.mjs");
await import("./bot-evolution-round-evidence-check.mjs");

console.log(JSON.stringify({ suite: "bot-evolution-core", pass: true }, null, 2));
