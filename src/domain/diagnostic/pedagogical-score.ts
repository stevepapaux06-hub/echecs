import type { GamePhase } from "@/domain/chess/types";
import type { PatternOccurrence } from "@/domain/patterns/engine";

export type EvaluationState =
  | "clearly_winning"
  | "winning"
  | "slightly_better"
  | "equal"
  | "slightly_worse"
  | "losing"
  | "clearly_lost";

export type PedagogicalMomentKind =
  | "low_value"
  | "stable_pattern"
  | "conversion"
  | "collapse"
  | "defensive_miss"
  | "defensive_resource";

export type PedagogicalAssessment = {
  beforeState: EvaluationState;
  afterState: EvaluationState;
  score: number;
  kind: PedagogicalMomentKind;
  reliablePatternConfidence: number;
  worthy: boolean;
};

const STATE_RANK: Record<EvaluationState, number> = {
  clearly_winning: 3,
  winning: 2,
  slightly_better: 1,
  equal: 0,
  slightly_worse: -1,
  losing: -2,
  clearly_lost: -3,
};

const TACTICAL_CONCEPTS = new Set([
  "loose_piece",
  "fork",
  "pin",
  "forcing_moves",
  "opponent_threat",
]);

export function evaluationState(playerCp: number): EvaluationState {
  if (playerCp >= 600) return "clearly_winning";
  if (playerCp >= 180) return "winning";
  if (playerCp >= 60) return "slightly_better";
  if (playerCp > -60) return "equal";
  if (playerCp > -180) return "slightly_worse";
  if (playerCp > -600) return "losing";
  return "clearly_lost";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Rates the learning value of a decision, not the size of a centipawn delta.
 * Crossing a practical state boundary matters most. Further deterioration in
 * an already lost position is deliberately worth almost nothing.
 */
export function scorePedagogicalMoment({
  beforeCp,
  afterCp,
  patterns = [],
  phase = "middlegame",
  ply = 20,
  playerRating,
}: {
  beforeCp: number;
  afterCp: number;
  patterns?: PatternOccurrence[];
  phase?: GamePhase;
  ply?: number;
  playerRating?: number;
}): PedagogicalAssessment {
  const beforeState = evaluationState(beforeCp);
  const afterState = evaluationState(afterCp);
  const beforeRank = STATE_RANK[beforeState];
  const afterRank = STATE_RANK[afterState];
  const deterioration = Math.max(0, beforeCp - afterCp);
  const improvement = Math.max(0, afterCp - beforeCp);
  const stateDrop = Math.max(0, beforeRank - afterRank);
  const stateGain = Math.max(0, afterRank - beforeRank);
  const reliableFailures = patterns.filter((pattern) => (
    pattern.opportunity && !pattern.success && pattern.confidence >= 0.84
  ));
  const reliablePatternConfidence = reliableFailures.reduce(
    (best, pattern) => Math.max(best, pattern.confidence),
    0,
  );
  const hasTacticalFailure = reliableFailures.some((pattern) => TACTICAL_CONCEPTS.has(pattern.conceptSlug));

  let kind: PedagogicalMomentKind = "low_value";
  let score = 0;

  if (improvement > 0 && beforeRank <= -1 && stateGain > 0) {
    kind = "defensive_resource";
    score = 48 + stateGain * 12 + Math.min(20, improvement / 10);
  } else if (deterioration > 0) {
    if (beforeState === "clearly_lost" && afterRank <= beforeRank) {
      score = 0;
    } else if (beforeCp >= 600 && afterCp >= 180) {
      // +10 -> +6 and +6 -> +4 remain winning positions, even if the raw
      // centipawn change looks spectacular.
      score = 8 + Math.min(12, deterioration / 50);
    } else {
      score = stateDrop * 28 + Math.min(30, deterioration / 8);
      if (beforeRank >= 0 && afterRank < 0) score += 12;
      if (afterRank <= -2 && beforeRank > -2) score += 14;
      if (beforeRank >= 1 && afterRank <= 0) {
        kind = "conversion";
        score += 8;
      } else if (beforeRank >= 0 && afterRank <= -1) {
        kind = "collapse";
      } else if (beforeRank === -1 && afterRank <= -2) {
        kind = "defensive_miss";
      }
    }
  }

  if (reliablePatternConfidence > 0) {
    const patternFloor = 55 + reliablePatternConfidence * 20;
    if (score < patternFloor) kind = "stable_pattern";
    score = Math.max(score, patternFloor);
    // Quiet opening moves should not flood an intermediate player's reserve.
    if (phase === "opening" && ply < 16 && !hasTacticalFailure && (playerRating ?? 1200) >= 1000) {
      score -= 25;
    }
  }

  score = clampScore(score);
  return {
    beforeState,
    afterState,
    score,
    kind,
    reliablePatternConfidence,
    worthy: score >= 55,
  };
}
