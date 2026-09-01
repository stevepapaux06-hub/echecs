import type { TrainingExercise } from "@/domain/chess/types";

export type TrainingResult = "success" | "partial" | "failed";
export type PedagogicalMoveResult = "concept" | "good-alternative" | "error";

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

/**
 * Stockfish first decides whether the move is objectively sound. Only then do
 * we check whether it demonstrates the precise concept selected by the coach.
 */
export function classifyPedagogicalMove(
  exercise: TrainingExercise,
  playedMove: string,
  decisionLossCp: number,
  runtimeConceptMoves: string[] = [],
): PedagogicalMoveResult {
  if (decisionLossCp > 100) return "error";
  const conceptMoves = exercise.pedagogy?.conceptMoveUcis?.length
    ? exercise.pedagogy.conceptMoveUcis
    : [
        ...(exercise.acceptedConceptMoveUcis ?? []),
        ...runtimeConceptMoves,
        exercise.solutionLine?.[0] || exercise.bestMove,
      ].filter(Boolean);
  return conceptMoves.includes(playedMove) ? "concept" : "good-alternative";
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
  pedagogicalMove = "concept",
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
  pedagogicalMove?: PedagogicalMoveResult;
}): SequenceDecision {
  if (pedagogicalMove === "error") {
    return { finished: true, result: "failed", reason: "mistake" };
  }
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
      result: pedagogicalMove === "concept" && targetReached ? "success" : "partial",
      reason: "target",
    };
  }

  if (promoted && (exercise.type === "endgame" || exercise.type === "conversion")) {
    return {
      finished: true,
      result: targetReached && pedagogicalMove === "concept" ? "success" : "partial",
      reason: "target",
    };
  }

  if (exercise.type === "tactic" && captured && playerMoves >= 2) {
    return {
      finished: true,
      result: targetReached && pedagogicalMove === "concept" ? "success" : "partial",
      reason: "target",
    };
  }

  if (exercise.type === "defense" && playerMoves >= 2 && targetReached) {
    return {
      finished: true,
      result: pedagogicalMove === "concept" ? "success" : "partial",
      reason: "target",
    };
  }

  if (playerMoves >= exercise.maxPlayerMoves) {
    return {
      finished: true,
      result: targetReached && totalLossCp <= 140 && pedagogicalMove === "concept"
        ? "success"
        : "partial",
      reason: "length",
    };
  }

  return { finished: false, reason: "continue" };
}
