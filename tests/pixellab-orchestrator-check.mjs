import { readFile } from "node:fs/promises";
import path from "node:path";

import { applyApprovalDecision, createInitialState } from "../scripts/pixellab_orchestrator.mjs";

const projectRoot = process.cwd();
const specPath = path.join(projectRoot, "configs", "pixellab-pack.v1.json");
const spec = JSON.parse(await readFile(specPath, "utf8"));

const state = createInitialState(spec);
const asset = state.assets.find((entry) => entry.key === "arena-tiles");
asset.status = "review_pending";
asset.stagedOutputs = [
  {
    key: "floor-base",
    stagePath: "output/pixellab-orchestrator/review/arena-tiles/floor-base.png",
    targetPath: "public/assets/tiles/floor-base.png",
  },
];

applyApprovalDecision(state, "arena-tiles", "approved", "looks good");

const disabledCount = state.assets.filter((entry) => entry.status === "disabled").length;
const pass = state.assets.length === spec.assets.length
  && disabledCount === 2
  && state.assets.find((entry) => entry.key === "arena-tiles")?.status === "approved"
  && state.assets.find((entry) => entry.key === "arena-tiles")?.review.note === "looks good";

console.log(JSON.stringify({
  assetCount: state.assets.length,
  disabledCount,
  approvedAsset: state.assets.find((entry) => entry.key === "arena-tiles"),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
