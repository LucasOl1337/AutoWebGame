const {
  SITE_LANGUAGE_STORAGE_KEY,
  getInitialSiteLanguage,
  getStoredSiteLanguage,
  persistSiteLanguage,
} = await import("../output/esm/UiLayouts/i18n.js");

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    language: "pt-BR",
    languages: ["pt-BR", "en-US"],
  },
});

function setWindow(windowValue) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  });
}

function createWindow(localStorage, pathname = "/") {
  return {
    localStorage,
    location: {
      hostname: "example.com",
      href: `https://example.com${pathname}`,
      pathname,
    },
  };
}

const blockedAccessWindow = {
  get localStorage() {
    throw new Error("localStorage blocked");
  },
  location: {
    hostname: "example.com",
    href: "https://example.com/",
    pathname: "/",
  },
};

const blockedAccessWindowWithPathLanguage = {
  get localStorage() {
    throw new Error("localStorage blocked");
  },
  location: {
    hostname: "example.com",
    href: "https://example.com/en/play",
    pathname: "/en/play",
  },
};

let blockedAccessRead = "not-run";
let blockedAccessPersisted = false;
try {
  setWindow(blockedAccessWindow);
  blockedAccessRead = getStoredSiteLanguage();
  persistSiteLanguage("en");
  blockedAccessPersisted = true;
} catch (error) {
  blockedAccessRead = error instanceof Error ? error.message : String(error);
}

let throwingMethodRead = "not-run";
let throwingMethodPersisted = false;
try {
  setWindow(createWindow({
    getItem() {
      throw new Error("getItem blocked");
    },
    setItem() {
      throw new Error("setItem blocked");
    },
  }));
  throwingMethodRead = getStoredSiteLanguage();
  persistSiteLanguage("pt");
  throwingMethodPersisted = true;
} catch (error) {
  throwingMethodRead = error instanceof Error ? error.message : String(error);
}

const writes = [];
setWindow(createWindow({
  getItem(key) {
    return key === SITE_LANGUAGE_STORAGE_KEY ? "EN-us" : null;
  },
  setItem(key, value) {
    writes.push([key, value]);
  },
}));
const storedLanguage = getStoredSiteLanguage();
persistSiteLanguage("pt");

setWindow(blockedAccessWindow);
const fallbackInitialLanguage = getInitialSiteLanguage();

setWindow(blockedAccessWindowWithPathLanguage);
const pathLanguageWins = getInitialSiteLanguage();

const checks = {
  blockedAccessReturnsNull: blockedAccessRead === null,
  blockedAccessPersistDoesNotThrow: blockedAccessPersisted,
  throwingMethodsReturnNull: throwingMethodRead === null,
  throwingMethodsPersistDoesNotThrow: throwingMethodPersisted,
  readsStoredLanguageWhenAvailable: storedLanguage === "en",
  writesStoredLanguageWhenAvailable: writes.length === 1
    && writes[0][0] === SITE_LANGUAGE_STORAGE_KEY
    && writes[0][1] === "pt",
  fallsBackToDetectedLanguageWhenStorageBlocked: fallbackInitialLanguage === "pt",
  keepsPathLanguagePriority: pathLanguageWins === "en",
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  checks,
  writes,
  blockedAccessRead,
  throwingMethodRead,
  fallbackInitialLanguage,
  pathLanguageWins,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
