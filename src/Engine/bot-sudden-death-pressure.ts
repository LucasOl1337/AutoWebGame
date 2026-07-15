import type { TileCoord } from "../Gameplay/types";

export type SuddenDeathPressurePhase = "recenter" | "hold-route" | "escape-only";

export interface SuddenDeathPressureSignal {
  phase: SuddenDeathPressurePhase;
  score: number;
  centerProgress: number;
  routeContinuity: boolean;
  intention: string;
  reason: string;
}

export interface SuddenDeathPressureSignalInput {
  candidateTile: TileCoord;
  centerTile: TileCoord;
  currentDistanceToCenter: number;
  routeContinuity: boolean;
}

function tileDistance(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getSuddenDeathPressureSignal(
  input: SuddenDeathPressureSignalInput,
): SuddenDeathPressureSignal {
  const candidateDistance = tileDistance(input.candidateTile, input.centerTile);
  const centerProgress = input.currentDistanceToCenter - candidateDistance;
  const score = centerProgress * 2 + (input.routeContinuity ? 1 : 0);

  if (centerProgress > 0) {
    return {
      phase: "recenter",
      score,
      centerProgress,
      routeContinuity: input.routeContinuity,
      intention: "Recuar para o centro",
      reason: input.routeContinuity
        ? "A rota atual também aumenta a distância da borda que está fechando."
        : "O passo reduz a distância ao centro antes do próximo fechamento.",
    };
  }

  if (centerProgress === 0) {
    return {
      phase: "hold-route",
      score,
      centerProgress,
      routeContinuity: input.routeContinuity,
      intention: input.routeContinuity ? "Manter rota segura" : "Contornar a borda",
      reason: input.routeContinuity
        ? "Sem ganho de centro, a continuidade evita uma troca de direção desnecessária."
        : "A rota mantém a distância ao centro e preserva uma saída segura.",
    };
  }

  return {
    phase: "escape-only",
    score,
    centerProgress,
    routeContinuity: input.routeContinuity,
    intention: "Usar passagem de fuga",
    reason: "A passagem não aproxima o centro, mas leva a um destino seguro antes do fechamento.",
  };
}
