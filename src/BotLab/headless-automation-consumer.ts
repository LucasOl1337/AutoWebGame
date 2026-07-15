import {
  runHeadlessSeries,
  type HeadlessSeriesRun,
} from "./headless-series-runner";
import { createDefaultArenaDefinition } from "../Arenas/arena";
import { ALL_PLAYER_IDS, type PlayerId } from "../Gameplay/types";

export interface LegacyLocalEndlessGame {
  startOfflineBotMatch(botFill: number, mode: "endless"): void;
}

export interface BuiltInAutomationSeriesPlan {
  id: string;
  roundCount: number;
  botFill: 1 | 2 | 3;
  build?: string;
}

const INITIAL_STATE_HASH_BY_PLAYER_COUNT: Readonly<Record<2 | 3 | 4, `sha256:${string}`>> = Object.freeze({
  2: "sha256:10654b73194f8d5c0e112c21b8500f42bc0f73d8fd281bbd2fb152ea5b1bed01",
  3: "sha256:dd26e24a45fe34638c9e0b523a28211ff93e1af9c546f79e158155f815353a41",
  4: "sha256:88feac973abeb6a1adff6a8f764de2cb6e0daf86dd3122d56fca78afc3c90867",
});

function requireAutomationPlan(plan: BuiltInAutomationSeriesPlan): void {
  if (!plan.id.trim()) throw new Error("automation series id is required");
  if (!Number.isInteger(plan.roundCount) || plan.roundCount < 1 || plan.roundCount > 50) {
    throw new Error("automation roundCount must be an integer from 1 to 50");
  }
  if (!Number.isInteger(plan.botFill) || plan.botFill < 1 || plan.botFill > 3) {
    throw new Error("automation botFill must be an integer from 1 to 3");
  }
}

/**
 * Maintained automation consumer for the canonical series Interface.
 *
 * The second method is deliberately the only compatibility seam for the old
 * local/autobot visual flow. It does not adapt the online Worker product.
 */
export class HeadlessAutomationConsumer {
  runBuiltInSeries(plan: BuiltInAutomationSeriesPlan): HeadlessSeriesRun {
    requireAutomationPlan(plan);
    const activePlayerIds = ALL_PLAYER_IDS.slice(0, plan.botFill + 1) as PlayerId[];
    const playerCount = activePlayerIds.length as 2 | 3 | 4;
    const arena = createDefaultArenaDefinition();
    return runHeadlessSeries({
      id: plan.id,
      rounds: Array.from({ length: plan.roundCount }, (_, index) => {
        const roundId = `${plan.id}-round-${index + 1}`;
        return {
          id: roundId,
          build: plan.build?.trim() || "browser-automation-canary",
          ruleset: "classic-v1",
          arena,
          randomness: {
            requestedSeed: null,
            expectedInitialStateHash: INITIAL_STATE_HASH_BY_PLAYER_COUNT[playerCount],
          },
          spawnPlan: activePlayerIds.map((playerId) => ({
            playerId,
            spawnIndex: playerId - 1,
          })),
          activePlayerIds,
          policies: activePlayerIds.map((playerId) => ({
            id: `${roundId}-built-in-${playerId}`,
            playerId,
            mode: "built-in" as const,
          })),
          maxSteps: 30_000,
          timeoutMs: 30_000,
        };
      }),
      limits: {
        maxRounds: plan.roundCount,
        maxTotalSteps: plan.roundCount * 30_000,
        timeoutMs: plan.roundCount * 30_000,
      },
      control: {
        pause: "between-rounds",
        cancellation: "between-rounds",
      },
    });
  }

  startLegacyLocalEndless(game: LegacyLocalEndlessGame, botFill = 3): void {
    if (!Number.isInteger(botFill) || botFill < 0 || botFill > 3) {
      throw new Error("legacy local botFill must be an integer from 0 to 3");
    }
    game.startOfflineBotMatch(botFill, "endless");
  }
}

export const headlessAutomationConsumer = new HeadlessAutomationConsumer();
