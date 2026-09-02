import { Chess, type Square } from "chess.js";
import type {
  ExerciseVerificationStatus,
  TrainingExercise,
} from "@/domain/chess/types";
import { trainingTaxonomy } from "./taxonomy";

export type ExerciseValidation = {
  status: ExerciseVerificationStatus;
  reasons: string[];
};

/** Positions that failed the latest deterministic Stockfish regression pass. */
const ENGINE_REVIEW_HOLD = new Set([
  "master-passed_pawn-3d7a79b94cba46",
  "master-preserve_activity-751e6163386c5c",
]);

function legalLine(exercise: TrainingExercise): boolean {
  try {
    const chess = new Chess(exercise.fen);
    const expected = exercise.playerColor === "white" ? "w" : "b";
    if (chess.turn() !== expected) return false;
    const line = exercise.solutionLine?.length ? exercise.solutionLine : [exercise.bestMove];
    for (const uci of line) {
      chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.slice(4, 5) || "q",
      });
    }
    return true;
  } catch {
    return false;
  }
}

function acceptedMovesAreLegal(exercise: TrainingExercise): boolean {
  try {
    const chess = new Chess(exercise.fen);
    const moves = new Set([
      exercise.bestMove,
      ...(exercise.acceptedConceptMoveUcis ?? []),
      ...(exercise.requiredSteps?.[0]?.acceptedMoveUcis ?? []),
    ].filter(Boolean));
    return [...moves].every((uci) => {
      try {
        const position = new Chess(chess.fen());
        position.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci.slice(4, 5) || "q",
        });
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function hasTrustedVerification(exercise: TrainingExercise): boolean {
  if (!exercise.isVerified || !exercise.verification) return false;
  if (exercise.source === "lichess") return Boolean(exercise.sourceId && exercise.qualityScore);
  if (exercise.source === "lichess_tablebase") {
    return Boolean(exercise.tablebaseWdl && exercise.verificationSource);
  }
  if (exercise.source === "personal_game") return Boolean(exercise.sourceId && exercise.engineCandidates?.length);
  return Boolean(exercise.verificationSource);
}

export function validateTrainingExercise(exercise: TrainingExercise): ExerciseValidation {
  const reasons: string[] = [];
  const taxonomy = trainingTaxonomy(exercise);
  if (!legalLine(exercise)) reasons.push("fen_or_solution_line_illegal");
  if (!acceptedMovesAreLegal(exercise)) reasons.push("accepted_move_illegal");
  if (taxonomy.confidence < 0.8) reasons.push("classification_confidence_below_0_8");
  if (taxonomy.domain === "endgame" && taxonomy.phase !== "endgame") reasons.push("endgame_phase_mismatch");
  if (taxonomy.domain === "opening" && taxonomy.phase !== "opening") reasons.push("opening_phase_mismatch");
  if (exercise.category === "conversion" && Math.abs(exercise.baselinePlayerCp) > 700) {
    reasons.push("conversion_already_overwhelming");
  }
  if (!hasTrustedVerification(exercise)) reasons.push("verification_metadata_missing");
  if (ENGINE_REVIEW_HOLD.has(exercise.id)) reasons.push("stockfish_regression_review_required");

  const rejected = reasons.some((reason) => [
    "fen_or_solution_line_illegal",
    "accepted_move_illegal",
    "endgame_phase_mismatch",
    "opening_phase_mismatch",
    "conversion_already_overwhelming",
  ].includes(reason));
  return {
    status: rejected ? "rejected" : reasons.length ? "needs_verification" : "active",
    reasons,
  };
}

export function canonicalExerciseKey(exercise: TrainingExercise): string {
  return [
    exercise.fen.split(/\s+/).slice(0, 4).join(" "),
    trainingTaxonomy(exercise).primaryConcept,
    exercise.source ?? "unknown",
  ].join("|");
}

export function gateTrainingExercises(exercises: TrainingExercise[]): {
  active: TrainingExercise[];
  needsVerification: TrainingExercise[];
  rejected: TrainingExercise[];
} {
  const active: TrainingExercise[] = [];
  const needsVerification: TrainingExercise[] = [];
  const rejected: TrainingExercise[] = [];
  const seen = new Set<string>();
  for (const exercise of exercises) {
    const duplicateKey = canonicalExerciseKey(exercise);
    if (seen.has(duplicateKey)) {
      rejected.push({ ...exercise, verificationStatus: "rejected" });
      continue;
    }
    seen.add(duplicateKey);
    const validation = validateTrainingExercise(exercise);
    const candidate = { ...exercise, verificationStatus: validation.status };
    if (validation.status === "active") active.push(candidate);
    else if (validation.status === "needs_verification") needsVerification.push(candidate);
    else rejected.push(candidate);
  }
  return { active, needsVerification, rejected };
}
