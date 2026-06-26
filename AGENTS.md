# Repository instructions

## CodeGraph

This repository has a CodeGraph index. Future agents should use CodeGraph before native file search for structural questions.

- Start with `codegraph_status` or `codegraph status .` to confirm the index is healthy.
- Use `codegraph_context` first for architecture, feature and bug-context questions.
- Use `codegraph_trace` for flow questions, `codegraph_search` for symbol lookup, `codegraph_callers`/`codegraph_callees` for one-hop relationships and `codegraph_impact` before changing shared symbols.
- Do not re-discover CodeGraph answers with grep/read loops unless a literal text detail is missing.
- Consult `DocsDev/codegraph/inventory.md` before changing major gameplay, frontend, online or worker code.
- Open `DocsDev/codegraph/codegraph-visual.html` in the browser for a clickable map of the main modules and flows.
- Keep `DocsDev/codegraph/codegraph-status.txt` and `DocsDev/codegraph/codegraph-files.json` current after major file moves or architecture changes.

Project-specific notes from the inventory:

- `src/Engine/game-app.ts`, `src/NetCode/session-client.ts` and `worker/index.js` are the highest-risk orchestration modules.
- `scripts/online_server.mjs` is a legacy relay path; prefer the Cloudflare Worker backend unless explicitly working on legacy local support.
- Avoid Playwright in this workspace. If browser inspection is required, use Chrome/Codex app tooling.
