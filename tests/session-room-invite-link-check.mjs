const {
  buildRoomInviteUrl,
  normalizeRoomCode,
  readRoomCodeFromUrl,
} = await import("../output/esm/NetCode/session-client.js");

const normalizedCases = [
  { input: "ab12cd", expected: "AB12CD" },
  { input: " ab-12 c ", expected: "AB12C" },
  { input: "room-code-123", expected: "ROOMCO" },
  { input: null, expected: "" },
];

const normalizationPass = normalizedCases.every((entry) => normalizeRoomCode(entry.input) === entry.expected);

const urlCases = [
  {
    name: "reads and normalizes room query",
    actual: readRoomCodeFromUrl("https://bomba.test/en/play?room=%20ab-12%20c%20"),
    expected: "AB12C",
  },
  {
    name: "ignores missing room query",
    actual: readRoomCodeFromUrl("https://bomba.test/play"),
    expected: null,
  },
  {
    name: "ignores invalid href",
    actual: readRoomCodeFromUrl("http://%"),
    expected: null,
  },
];

const urlReadPass = urlCases.every((entry) => entry.actual === entry.expected);

const ptInvite = new URL(buildRoomInviteUrl("pt", " ab-12 c ", "https://bomba.test/en/play?utm=friend"));
const enInvite = new URL(buildRoomInviteUrl("en", "", "https://bomba.test/play?room=OLD999&utm=friend"));

const invitePass = ptInvite.pathname === "/play"
  && ptInvite.searchParams.get("room") === "AB12C"
  && ptInvite.searchParams.get("utm") === "friend"
  && enInvite.pathname === "/en/play"
  && enInvite.searchParams.get("room") === null
  && enInvite.searchParams.get("utm") === "friend";

const pass = normalizationPass && urlReadPass && invitePass;

console.log(JSON.stringify({
  normalizedCases: normalizedCases.map((entry) => ({
    ...entry,
    actual: normalizeRoomCode(entry.input),
  })),
  urlCases,
  invites: {
    pt: ptInvite.toString(),
    en: enInvite.toString(),
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
