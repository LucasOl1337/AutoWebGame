import type { PlayerId } from "../../Gameplay/types";

export interface CharacterRosterManifestEntry {
  id: string;
  name: string;
  defaultSlot?: PlayerId;
  order?: number;
}

export const CHARACTER_ROSTER_MANIFEST: CharacterRosterManifestEntry[] = [
  {
    id: "03a976fb-7313-4064-a477-5bb9b0760034",
    name: "Ranni",
    defaultSlot: 1,
    order: 0,
  },
  {
    id: "6ee8baa5-3277-413b-ae0e-2659b9cc52e9",
    name: "Killer Bee",
    defaultSlot: 2,
    order: 1,
  },
  {
    id: "d083c3dc-7162-4391-8628-6adde0b8d8d6",
    name: "Crocodilo Arcano",
    order: 2,
  },
  {
    id: "5474c45c-2987-43e0-af2c-a6500c836881",
    name: "Nico",
    order: 3,
  },
];
