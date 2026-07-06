const {
  buildRoomInviteUrl,
  copyTextWithFallback,
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

const clipboardWrites = [];
const clipboardPass = await copyTextWithFallback("https://bomba.test/?room=AB12C", {
  clipboard: {
    async writeText(text) {
      clipboardWrites.push(text);
    },
  },
  document: null,
});

let fallbackTextarea = null;
const fallbackDocument = {
  body: {
    appendChild(element) {
      fallbackTextarea = element;
    },
  },
  createElement(tagName) {
    if (tagName !== "textarea") {
      throw new Error(`Unexpected element: ${tagName}`);
    }
    return {
      value: "",
      style: {},
      setAttribute(name, value) {
        this[name] = value;
      },
      focusCalled: false,
      selectCalled: false,
      removed: false,
      focus() {
        this.focusCalled = true;
      },
      select() {
        this.selectCalled = true;
      },
      remove() {
        this.removed = true;
      },
    };
  },
  execCommand(command) {
    return command === "copy";
  },
};

const fallbackPass = await copyTextWithFallback("fallback-link", {
  clipboard: {
    async writeText() {
      throw new Error("blocked");
    },
  },
  document: fallbackDocument,
});

const unavailablePass = await copyTextWithFallback("no-copy", {
  clipboard: null,
  document: null,
}) === false;

const copyPass = clipboardPass
  && clipboardWrites[0] === "https://bomba.test/?room=AB12C"
  && fallbackPass
  && fallbackTextarea?.value === "fallback-link"
  && fallbackTextarea?.readonly === "true"
  && fallbackTextarea?.focusCalled
  && fallbackTextarea?.selectCalled
  && fallbackTextarea?.removed
  && unavailablePass;

const pass = normalizationPass && urlReadPass && invitePass && copyPass;

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
  copy: {
    clipboardWrites,
    fallback: {
      value: fallbackTextarea?.value,
      readonly: fallbackTextarea?.readonly,
      focusCalled: fallbackTextarea?.focusCalled,
      selectCalled: fallbackTextarea?.selectCalled,
      removed: fallbackTextarea?.removed,
    },
    unavailablePass,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
