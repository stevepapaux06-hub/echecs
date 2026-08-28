import type { TrainingExercise } from "@/domain/chess/types";

export type TrainingResult = "success" | "partial" | "failed";

export type SequenceDecision = {
  finished: boolean;
  result?: TrainingResult;
  reason: "continue" | "mistake" | "target" | "length" | "terminal";
};

/**
 * A curated reply is deterministic only while the played moves remain an exact
 * prefix of the validated reference line. Sound alternatives are answered by
 * Stockfish instead of being rejected for not matching a memorized script.
 */
export function referenceReply(
  exercise: TrainingExercise,
  playedPlies: string[],
): string | null {
  const line = exercise.solutionLine;
  if (!line || playedPlies.some((move, index) => line[index] !== move)) return null;
  return line[playedPlies.length] ?? null;
}

export function decideSequence({
  exercise,
  playerMoves,
  decisionLossCp,
  totalLossCp,
  afterPlayerCp,
  isGameOver,
  isCheckmate,
  promoted,
  captured,
}: {
  exercise: TrainingExercise;
  playerMoves: number;
  decisionLossCp: number;
  totalLossCp: number;
  afterPlayerCp: number;
  isGameOver: boolean;
  isCheckmate: boolean;
  promoted: boolean;
  captured: boolean;
}): SequenceDecision {
  // A true tactical/evaluative error ends the attempt immediately. Small
  // inaccuracies remain playable so a technical exercise can still unfold.
  if (decisionLossCp > 180 || totalLossCp > 240) {
    return { finished: true, result: "failed", reason: "mistake" };
  }

  if (isGameOver) {
    if (isCheckmate) return { finished: true, result: "success", reason: "terminal" };
    return {
      finished: true,
      result: exercise.type === "defense" ? "success" : "partial",
      reason: "terminal",
    };
  }

  const threshold = exercise.successThresholdCp;
  const targetReached = threshold === undefined || afterPlayerCp >= threshold;

  if (exercise.mode === "one-move") {
    return {
      finished: true,
      result: decisionLossCp <= 100 && targetReached ? "success" : "partial",
      reason: "target",
    };
  }

  if (promoted && (exercise.type === "endgame" || exercise.type === "conversion")) {
    return { finished: true, result: targetReached ? "success" : "partial", reason: "target" };
  }

  if (exercise.type === "tactic" && captured && playerMoves >= 2) {
    return { finished: true, result: targetReached ? "success" : "partial", reason: "target" };
  }

  if (exercise.type === "defense" && playerMoves >= 2 && targetReached) {
    return { finished: true, result: "success", reason: "target" };
  }

  if (playerMoves >= exercise.maxPlayerMoves) {
    return {
      finished: true,
      result: targetReached && totalLossCp <= 140 ? "success" : "partial",
      reason: "length",
    };
  }

  return { finished: false, reason: "continue" };
}
