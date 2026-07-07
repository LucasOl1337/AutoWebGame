import {
  USERNAME_ALLOWED_PATTERN_SOURCE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsername,
} from "../output/esm/NetCode/account.js";
import {
  applyUsernameInputConstraints,
  formatUsernameInputTitle,
  formatUsernameValidationMessage,
} from "../output/esm/NetCode/session-client.js";

const tooShort = validateUsername("ab");
const tooLong = validateUsername("abcdefghijklmnopq");
const invalidCharacters = validateUsername("player-name");
const validTrimmed = validateUsername(" Player_1 ");

const englishMessages = {
  tooShort: formatUsernameValidationMessage(tooShort, "en"),
  tooLong: formatUsernameValidationMessage(tooLong, "en"),
  invalidCharacters: formatUsernameValidationMessage(invalidCharacters, "en"),
};

const portugueseMessages = {
  tooShort: formatUsernameValidationMessage(tooShort, "pt"),
  tooLong: formatUsernameValidationMessage(tooLong, "pt"),
  invalidCharacters: formatUsernameValidationMessage(invalidCharacters, "pt"),
};

const fakeInput = {};
applyUsernameInputConstraints(fakeInput, "en");

const checks = {
  keepsUsernameLimits: USERNAME_MIN_LENGTH === 3 && USERNAME_MAX_LENGTH === 16,
  keepsAllowedPattern: USERNAME_ALLOWED_PATTERN_SOURCE === "[A-Za-z0-9_]+",
  reportsTooShortReason: tooShort.reason === "too-short" && tooShort.message?.includes("3"),
  reportsTooLongReason: tooLong.reason === "too-long" && tooLong.message?.includes("16"),
  reportsInvalidCharacterReason: invalidCharacters.reason === "invalid-characters",
  acceptsTrimmedUsername: validTrimmed.ok
    && validTrimmed.username === "Player_1"
    && validTrimmed.normalizedUsername === "player_1"
    && validTrimmed.reason === null,
  localizesEnglishMessages: englishMessages.tooShort === "Use at least 3 characters."
    && englishMessages.tooLong === "Use at most 16 characters."
    && englishMessages.invalidCharacters === "Use only letters, numbers, and underscore.",
  keepsPortugueseMessages: portugueseMessages.tooShort === "Use pelo menos 3 caracteres."
    && portugueseMessages.tooLong === "Use no maximo 16 caracteres."
    && portugueseMessages.invalidCharacters === "Use apenas letras, numeros e underscore.",
  exposesNativeInputConstraints: fakeInput.minLength === 3
    && fakeInput.maxLength === 16
    && fakeInput.pattern === "[A-Za-z0-9_]+"
    && fakeInput.autocomplete === "username"
    && fakeInput.spellcheck === false,
  localizesInputTitle: fakeInput.title === formatUsernameInputTitle("en")
    && formatUsernameInputTitle("pt").includes("3 a 16"),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  checks,
  englishMessages,
  portugueseMessages,
  fakeInput,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
