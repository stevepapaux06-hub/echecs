import type { TrainingExercise } from "@/domain/chess/types";
import { pedagogicalUnitFor } from "./contract";
import { milestoneReached } from "./milestones";

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
  playedMoveUcis = [],
  decisionLossCp,
  totalLossCp,
  afterPlayerCp,
  isGameOver,
  isCheckmate,
  promoted,
  captured,
  pedagogicalMove = "concept",
  afterFen,
  decisionFen,
}: {
  exercise: TrainingExercise;
  playerMoves: number;
  playedMoveUcis?: string[];
  decisionLossCp: number;
  totalLossCp: number;
  afterPlayerCp: number;
  isGameOver: boolean;
  isCheckmate: boolean;
  promoted: boolean;
  captured: boolean;
  pedagogicalMove?: PedagogicalMoveResult;
  afterFen?: string;
  decisionFen?: string;
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
      result: exercise.type === "defense" || exercise.trainingAssessment?.outcome?.root === "draw" ? "success" : "partial",
      reason: "terminal",
    };
  }

  if (exercise.pedagogicalMilestone || exercise.category === "endgame") {
    // Neither centipawns nor a fixed move budget establishes a technical method.
    // Legacy persisted endings without a milestone can finish only at a terminal
    // result, never claim a successful method after an arbitrary number of moves.
    if (milestoneReached(exercise, afterFen, playerMoves, decisionFen, playedMoveUcis.at(-1))) {
      return { finished: true, result: pedagogicalMove === "concept" ? "success" : "partial", reason: "target" };
    }
    return { finished: false, reason: "continue" };
  }

  const threshold = exercise.successThresholdCp;
  const targetReached = threshold === undefined || afterPlayerCp >= threshold;
  const pedagogicalUnit = pedagogicalUnitFor(exercise);
  const requiredStepsReached = !exercise.requiredSteps?.length || exercise.requiredSteps.every((step, index) => (
    Boolean(playedMoveUcis[index]) && step.acceptedMoveUcis.includes(playedMoveUcis[index])
  ));

  if (pedagogicalUnit === "single_move") {
    return {
      finished: true,
      result: pedagogicalMove === "concept" && targetReached ? "success" : "partial",
      reason: "target",
    };
  }

  if (promoted && (pedagogicalUnit === "theoretical_method" || exercise.type === "conversion")) {
    return {
      finished: true,
      result: targetReached && pedagogicalMove === "concept" ? "success" : "partial",
      reason: "target",
    };
  }

  if (pedagogicalUnit === "decision_then_continuation" && playerMoves >= 2 && (
    captured || requiredStepsReached
  )) {
    return {
      finished: true,
      result: targetReached && pedagogicalMove === "concept" ? "success" : "partial",
      reason: "target",
    };
  }

  if (exercise.type === "defense" && playerMoves >= 2 && targetReached && requiredStepsReached) {
    return {
      finished: true,
      result: pedagogicalMove === "concept" ? "success" : "partial",
      reason: "target",
    };
  }

  if (playerMoves >= exercise.maxPlayerMoves) {
    return {
      finished: true,
      result: targetReached && requiredStepsReached && totalLossCp <= 140 && pedagogicalMove === "concept"
        ? "success"
        : "partial",
      reason: "length",
    };
  }

  return { finished: false, reason: "continue" };
}
