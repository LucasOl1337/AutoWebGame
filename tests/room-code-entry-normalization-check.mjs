const {
  normalizeRoomCode,
  readRoomCodeFromUrl,
} = await import("../output/esm/NetCode/session-client.js");

const normalizationCases = [
  {
    name: "keeps plain room code normalization",
    actual: normalizeRoomCode(" ab-12 c "),
    expected: "AB12C",
  },
  {
    name: "keeps legacy token fallback for loose labels",
    actual: normalizeRoomCode("room-code-123"),
    expected: "ROOMCO",
  },
  {
    name: "extracts code from pasted invite URL",
    actual: normalizeRoomCode("https://bomba.test/play?room=AB12CD"),
    expected: "AB12CD",
  },
  {
    name: "extracts code from encoded invite URL",
    actual: normalizeRoomCode("https%3A%2F%2Fbomba.test%2Fen%2Fplay%3Froom%3Def-45gh"),
    expected: "EF45GH",
  },
];

const urlCases = [
  {
    name: "extracts nested pasted invite from room query",
    actual: readRoomCodeFromUrl("https://bomba.test/play?room=https%3A%2F%2Fbomba.test%2Fen%2Fplay%3Froom%3Dcd-34ef"),
    expected: "CD34EF",
  },
  {
    name: "still ignores missing room query",
    actual: readRoomCodeFromUrl("https://bomba.test/play"),
    expected: null,
  },
];

const failedCases = [...normalizationCases, ...urlCases].filter((entry) => entry.actual !== entry.expected);
const pass = failedCases.length === 0;

console.log(JSON.stringify({
  normalizationCases,
  urlCases,
  failedCases,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
