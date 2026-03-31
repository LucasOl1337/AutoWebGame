import type { CharacterSkillId } from "../Gameplay/types";

export interface CharacterSkillDefinition {
  characterId: string;
  skillId: CharacterSkillId;
  cooldownMs: number;
}

export const RANNI_CHARACTER_ID = "03a976fb-7313-4064-a477-5bb9b0760034";
export const KILLER_BEE_CHARACTER_ID = "6ee8baa5-3277-413b-ae0e-2659b9cc52e9";
export const NICO_CHARACTER_ID = "5474c45c-2987-43e0-af2c-a6500c836881";
export const CROCODILO_CHARACTER_ID = "d083c3dc-7162-4391-8628-6adde0b8d8d6";

export const RANNI_SKILL_COOLDOWN_MS = 8_000;
export const KILLER_BEE_SKILL_COOLDOWN_MS = 4_000;
export const NICO_SKILL_COOLDOWN_MS = 8_000;
export const CROCODILO_SKILL_COOLDOWN_MS = 6_000;

export const CHARACTER_SKILL_DEFINITIONS: CharacterSkillDefinition[] = [
  {
    characterId: RANNI_CHARACTER_ID,
    skillId: "ranni-ice-blink",
    cooldownMs: RANNI_SKILL_COOLDOWN_MS,
  },
  {
    characterId: KILLER_BEE_CHARACTER_ID,
    skillId: "killer-bee-wing-dash",
    cooldownMs: KILLER_BEE_SKILL_COOLDOWN_MS,
  },
  {
    characterId: NICO_CHARACTER_ID,
    skillId: "nico-arcane-beam",
    cooldownMs: NICO_SKILL_COOLDOWN_MS,
  },
  {
    characterId: CROCODILO_CHARACTER_ID,
    skillId: "crocodilo-emerald-surge",
    cooldownMs: CROCODILO_SKILL_COOLDOWN_MS,
  },
];

const SKILL_DEFINITION_BY_CHARACTER_ID = new Map(
  CHARACTER_SKILL_DEFINITIONS.map((definition) => [definition.characterId, definition]),
);

export function getCharacterSkillDefinition(characterId: string): CharacterSkillDefinition | null {
  return SKILL_DEFINITION_BY_CHARACTER_ID.get(characterId) ?? null;
}

export function getCharacterSkillId(characterId: string): CharacterSkillId | null {
  return getCharacterSkillDefinition(characterId)?.skillId ?? null;
}
