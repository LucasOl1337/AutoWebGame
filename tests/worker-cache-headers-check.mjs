import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

const constantsMatch = workerSource.match(
  /const HASHED_VITE_ASSET_RE[\s\S]*?const IMMUTABLE_STATIC_CACHE_CONTROL = "public, max-age=31536000, immutable";/,
);
const helperMatch = workerSource.match(/function getStaticAssetCacheControl\(pathname, contentType\) \{[\s\S]*?\n\}/);

if (!constantsMatch || !helperMatch) {
  console.error("Could not find static asset cache helper in worker/index.js");
  process.exit(1);
}

const getStaticAssetCacheControl = Function(`
  ${constantsMatch[0]}
  ${helperMatch[0]}
  return getStaticAssetCacheControl;
`)();

const cases = [
  {
    label: "hashed js chunk",
    pathname: "/Assets/game-app-CX670W2N.js",
    contentType: "application/javascript",
    before: "public, max-age=86400, stale-while-revalidate=604800",
    expected: "public, max-age=31536000, immutable",
  },
  {
    label: "hashed css chunk",
    pathname: "/Assets/game-BFrr1qZI.css",
    contentType: "text/css",
    before: "public, max-age=86400, stale-while-revalidate=604800",
    expected: "public, max-age=31536000, immutable",
  },
  {
    label: "public image asset",
    pathname: "/Assets/UiLayouts/ICON.png",
    contentType: "image/png",
    before: "public, max-age=86400, stale-while-revalidate=604800",
    expected: "public, max-age=86400, stale-while-revalidate=604800",
  },
  {
    label: "character manifest",
    pathname: "/Assets/Characters/Animations/manifest.json",
    contentType: "application/json",
    before: "no-store",
    expected: "no-store",
  },
  {
    label: "html shell",
    pathname: "/game.html",
    contentType: "text/html; charset=utf-8",
    before: "no-store",
    expected: "no-store",
  },
];

const results = cases.map((entry) => ({
  ...entry,
  actual: getStaticAssetCacheControl(entry.pathname, entry.contentType),
}));

const pass = results.every((entry) => entry.actual === entry.expected);

console.log(JSON.stringify({ pass, results }, null, 2));

if (!pass) {
  process.exit(1);
}
