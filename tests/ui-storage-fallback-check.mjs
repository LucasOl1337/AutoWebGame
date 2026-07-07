const storageCalls = {
  getItem: 0,
  setItem: 0,
  removeItem: 0,
};

const blockedLocalStorage = {
  getItem() {
    storageCalls.getItem += 1;
    throw new Error("localStorage blocked");
  },
  setItem() {
    storageCalls.setItem += 1;
    throw new Error("localStorage blocked");
  },
  removeItem() {
    storageCalls.removeItem += 1;
    throw new Error("localStorage blocked");
  },
};

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      pathname: "/arena",
      hostname: "bombpvp.com",
    },
    localStorage: blockedLocalStorage,
  },
  configurable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: {
    language: "en-US",
    languages: ["en-US"],
  },
  configurable: true,
});

function capture(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const {
  readLocalStorageItem,
  writeLocalStorageItem,
  removeLocalStorageItem,
} = await import("../output/esm/UiLayouts/browser-storage.js");
const {
  getInitialSiteLanguage,
  getStoredSiteLanguage,
  persistSiteLanguage,
} = await import("../output/esm/UiLayouts/i18n.js");
const {
  OnlineSessionClient,
  BOT_MATCH_FILL_STORAGE_KEY,
  SESSION_RETURN_BRIEF_STORAGE_KEY,
} = await import("../output/esm/NetCode/session-client.js");

const fakeClient = Object.create(OnlineSessionClient.prototype);
fakeClient.roster = [{ name: "Ranni" }, { name: "Nico" }];
fakeClient.preferredCharacterIndex = 1;
fakeClient.botMatchFill = 2;
fakeClient.sessionReturnBrief = null;
let renderLandingReturnBriefCount = 0;
fakeClient.renderLandingReturnBrief = () => {
  renderLandingReturnBriefCount += 1;
};

const storedBrief = {
  version: 1,
  type: "entry",
  mode: "bot-match",
  savedAtMs: Date.UTC(2026, 0, 2, 12, 0, 0),
  characterName: "Ranni",
};

const preferredRead = capture(() => fakeClient.readPreferredCharacterIndex());
const preferredPersist = capture(() => fakeClient.persistPreferredCharacterIndex());
const botFillRead = capture(() => fakeClient.readBotMatchFill());
const botFillPersist = capture(() => fakeClient.persistBotMatchFill());
const briefRead = capture(() => fakeClient.readSessionReturnBrief());
const briefPersist = capture(() => fakeClient.persistSessionReturnBrief(storedBrief));
const languagePersist = capture(() => persistSiteLanguage("pt"));

const checks = {
  helperReadReturnsNull: readLocalStorageItem("blocked-key") === null,
  helperWriteDoesNotThrow: capture(() => writeLocalStorageItem("blocked-key", "value")).ok,
  helperRemoveDoesNotThrow: capture(() => removeLocalStorageItem("blocked-key")).ok,
  storedLanguageReturnsNull: getStoredSiteLanguage() === null,
  initialLanguageUsesDetector: getInitialSiteLanguage() === "en",
  languagePersistDoesNotThrow: languagePersist.ok,
  preferredCharacterDefaults: preferredRead.ok && preferredRead.value === 0,
  preferredCharacterPersistDoesNotThrow: preferredPersist.ok,
  botMatchFillDefaults: botFillRead.ok && botFillRead.value === 3,
  botMatchFillPersistDoesNotThrow: botFillPersist.ok,
  sessionBriefReadReturnsNull: briefRead.ok && briefRead.value === null,
  sessionBriefPersistKeepsMemory: briefPersist.ok
    && fakeClient.sessionReturnBrief === storedBrief
    && renderLandingReturnBriefCount === 1,
  storageWasExercised: storageCalls.getItem >= 5
    && storageCalls.setItem >= 4
    && storageCalls.removeItem >= 1,
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  checks,
  storageCalls,
  storageKeys: {
    botMatchFill: BOT_MATCH_FILL_STORAGE_KEY,
    sessionReturnBrief: SESSION_RETURN_BRIEF_STORAGE_KEY,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
