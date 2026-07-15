const {
  CHARACTER_SKILL_DEFINITIONS,
  CROCODILO_CHARACTER_ID,
  CROCODILO_SKILL_COOLDOWN_MS,
  KILLER_BEE_CHARACTER_ID,
  KILLER_BEE_SKILL_COOLDOWN_MS,
  NICO_CHARACTER_ID,
  NICO_SKILL_COOLDOWN_MS,
  RANNI_CHARACTER_ID,
  RANNI_SKILL_COOLDOWN_MS,
  advancePlayerSkillTimers,
  getCharacterSkillDefinition,
  getCharacterSkillId,
} = await import("../output/esm/ultimate/skill-system.js");

const expected = [
  {
    characterId: RANNI_CHARACTER_ID,
    skillId: "ranni-ice-blink",
    cooldownMs: 8_000,
  },
  {
    characterId: KILLER_BEE_CHARACTER_ID,
    skillId: "killer-bee-wing-dash",
    cooldownMs: 4_000,
  },
  {
    characterId: NICO_CHARACTER_ID,
    skillId: "nico-arcane-beam",
    cooldownMs: 8_000,
  },
  {
    characterId: CROCODILO_CHARACTER_ID,
    skillId: "crocodilo-emerald-surge",
    cooldownMs: 6_000,
  },
];

const exportedCooldownsMatch = (
  RANNI_SKILL_COOLDOWN_MS === 8_000
  && KILLER_BEE_SKILL_COOLDOWN_MS === 4_000
  && NICO_SKILL_COOLDOWN_MS === 8_000
  && CROCODILO_SKILL_COOLDOWN_MS === 6_000
);

const idsUnique = new Set(CHARACTER_SKILL_DEFINITIONS.map((definition) => definition.characterId)).size === CHARACTER_SKILL_DEFINITIONS.length;
const skillIdsUnique = new Set(CHARACTER_SKILL_DEFINITIONS.map((definition) => definition.skillId)).size === CHARACTER_SKILL_DEFINITIONS.length;
const definitionsMatchExpected = expected.every((entry) => {
  const definition = getCharacterSkillDefinition(entry.characterId);
  return definition
    && definition.skillId === entry.skillId
    && definition.cooldownMs === entry.cooldownMs
    && getCharacterSkillId(entry.characterId) === entry.skillId;
});

const createCooldownPlayer = (cooldownRemainingMs = 1_000) => ({
  skill: {
    phase: "cooldown",
    cooldownRemainingMs,
    castElapsedMs: 275,
  },
});

const zeroDeltaPlayer = createCooldownPlayer();
advancePlayerSkillTimers(zeroDeltaPlayer, 0);
const zeroDeltaIgnored = zeroDeltaPlayer.skill.phase === "cooldown"
  && zeroDeltaPlayer.skill.cooldownRemainingMs === 1_000
  && zeroDeltaPlayer.skill.castElapsedMs === 275;

const negativeDeltaPlayer = createCooldownPlayer();
advancePlayerSkillTimers(negativeDeltaPlayer, -250);
const negativeDeltaIgnored = negativeDeltaPlayer.skill.phase === "cooldown"
  && negativeDeltaPlayer.skill.cooldownRemainingMs === 1_000
  && negativeDeltaPlayer.skill.castElapsedMs === 275;

const positiveDeltaPlayer = createCooldownPlayer();
advancePlayerSkillTimers(positiveDeltaPlayer, 250);
const positiveDeltaAdvances = positiveDeltaPlayer.skill.phase === "cooldown"
  && positiveDeltaPlayer.skill.cooldownRemainingMs === 750
  && positiveDeltaPlayer.skill.castElapsedMs === 275;

const exhaustedCooldownPlayer = createCooldownPlayer(250);
advancePlayerSkillTimers(exhaustedCooldownPlayer, 250);
const exhaustedCooldownReturnsIdle = exhaustedCooldownPlayer.skill.phase === "idle"
  && exhaustedCooldownPlayer.skill.cooldownRemainingMs === 0
  && exhaustedCooldownPlayer.skill.castElapsedMs === 0;

const report = {
  definitions: CHARACTER_SKILL_DEFINITIONS,
  exportedCooldownsMatch,
  idsUnique,
  skillIdsUnique,
  definitionsMatchExpected,
  zeroDeltaIgnored,
  negativeDeltaIgnored,
  positiveDeltaAdvances,
  exhaustedCooldownReturnsIdle,
  pass: exportedCooldownsMatch
    && idsUnique
    && skillIdsUnique
    && definitionsMatchExpected
    && zeroDeltaIgnored
    && negativeDeltaIgnored
    && positiveDeltaAdvances
    && exhaustedCooldownReturnsIdle,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
