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
  "master-king_activity-1ca87e1cf058b3",
  "master-king_activity-8549aacb3ca499",
  "master-convert_small_advantage-fb724bed8e1a17",
  "master-convert_small_advantage-ad8c25968803c5",
  "master-restrict_counterplay-60c77871653dd4",
  "master-weak_pawn-588c5cf8da00e2",
  "master-pawn_break-82cb6258eba9cf",
  "master-king_and_pawn-210a2869d19f86",
  "master-king_and_pawn-b67f90579aa30f",
  "master-king_and_pawn-119bd6c1d862d5",
  "master-rule_of_square-3c64e9bb7573da",
  "master-rule_of_square-47ae1aa5126814",
  "master-passed_pawn-53b157a94e436d",
  "master-passed_pawn-423b69efa755f6",
  "master-passed_pawn-6471e69615a795",
  "master-rook_activity-15f90fdeef01ed",
  "master-rook_activity-7e89fb32d0aba9",
  "master-rook_behind_pawn-d699b5203c1c2e",
  "master-rook_behind_pawn-0c13477454cdfd",
  "master-rook_behind_pawn-60b6fb79e571cb",
  "master-knight_endgame-2628d76af1489a",
  "master-king_activity-a8a20dbf07aee6",
  "master-king_activity-adb73269c3d9e6",
  "master-king_activity-753bad2edc85ea",
  "master-simplify_when_ahead-040309ecf60040",
  "master-restrict_counterplay-0e02fd9639b3b7",
  "master-use_material_advantage-de3711aa4a8731",
  "master-use_material_advantage-d6f8137fd58fe2",
  "master-use_material_advantage-d4d23b61704025",
  "master-preserve_activity-6fb6ca82eef7ff",
  "master-preserve_activity-9369c1c6fe4b9c",
  "master-preserve_activity-514c17e1273c61",
  "master-king_and_pawn-93b21923abb7d2",
  "master-king_and_pawn-d1a9ffc3f68073",
  "master-king_and_pawn-e1bd553d381518",
  "master-passed_pawn-4047fb3bf062cb",
  "master-passed_pawn-a12bd0c5d86730",
  "master-passed_pawn-bbacbe22e5e3e4",
  "master-rook_endgame-c372621010cc00",
  "master-rook_endgame-33f426c851d362",
  "master-rook_activity-911394b0815d1d",
  "master-rook_activity-8c0a005d12479c",
  "master-rook_activity-c4eb89d6d62249",
  "master-rook_behind_pawn-ebbffeb7496067",
  "master-knight_endgame-72d437b9e6176e",
  "master-king_activity-c46507595e3e0f",
  "master-convert_small_advantage-74da481be72c5a",
  "master-convert_small_advantage-9859203d4f57a5",
  "master-restrict_counterplay-f270ed29978e18",
  "master-restrict_counterplay-ed3172d06c99a7",
  "master-restrict_counterplay-9255e1049ebf74",
  "master-preserve_activity-dcf449e6d7aeac",
  "master-preserve_activity-7085d9d427c601",
  "master-king_and_pawn-f77a6c1ebefcf9",
  "master-rule_of_square-e04b88ab76a6c6",
  "master-passed_pawn-79285533637334",
  "master-passed_pawn-826264b8c3d689",
  "master-rook_endgame-c5bee4e297eba2",
  "master-rook_behind_pawn-e2e4175e3b9230",
  "master-knight_endgame-15d6c4b0f174af",
  "master-king_activity-e22dade41fb44f",
  "master-king_activity-770fcf387e3aeb",
  "master-king_activity-a33dfd2b8b0d19",
  "master-convert_small_advantage-1326cd06281bef",
  "master-use_material_advantage-1cb7858e003b2d",
  "master-use_material_advantage-61cfe83a59973e",
  "master-favorable_endgame_transition-642c1feb1a3a11",
  "master-preserve_activity-261a79da53f38d",
  "master-opposition-421b81ca229373",
  "master-passed_pawn-534507afe9d603",
  "master-passed_pawn-0b668859f0ae9b",
  "master-rook_endgame-84e1ba67e869e9",
  "master-rook_behind_pawn-f349b810f47dbd",
  "master-bishop_endgame-f07e536510358a",
  "master-king_activity-bee9593f2ca4d4",
  "master-king_activity-4a34fb8a99cc12",
  "master-king_activity-5d431ccd02f417",
  "master-convert_small_advantage-c9857125e83d5c",
  "master-simplify_when_ahead-baaf3cabcb7a51",
  "master-restrict_counterplay-c79d9d8e09b3c0",
  "master-use_material_advantage-897eca6c7dceed",
  "master-rook_activity-be8fa25255d8f3",
  "master-rook_behind_pawn-60e102e258eff1",
  "master-rook_behind_pawn-472f46548c7361",
  "master-rook_behind_pawn-01a5ba212e122c",
  "master-convert_small_advantage-99d7a7515d7c62",
  "master-restrict_counterplay-8004f29a1b4381",
  "master-bishop_endgame-26ab9b37d91f47",
  "master-convert_small_advantage-afd288856cbdd6",
  "master-rook_behind_pawn-44bc41ac0c98bf",
  "master-bishop_endgame-281926d387e3e2",
  "master-king_activity-586393055a3008",
  "master-restrict_counterplay-ecaa3f3c56df87",
  "master-use_material_advantage-adaec7ce6ea3f2",
  "master-rook_behind_pawn-55665f120dceab",
  "master-open_file-794a59bd1a92d7",
  "master-weak_square-491327af8f46d1",
  "master-weak_pawn-fa0cfb346471f8",
  "master-weak_pawn-a895d0758c4321",
  "master-weak_pawn-5ab9ee78d2a27e",
  "master-favorable_exchange-17715938a7e509",
  "master-opposition-8a9f553438f273",
  "master-opposition-65c5efcfca6922",
  "master-passed_pawn-d8b1148428c6a4",
  "master-passed_pawn-f38490b634942c",
  "master-king_activity-6eeab79bfe97f3",
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
  if (taxonomy.domain === "defense" && exercise.source === "lichess" && !(
    exercise.sourceThemes?.includes("defensiveMove")
    && exercise.sourceThemes.includes("equality")
  )) {
    reasons.push("defense_outcome_not_verified");
  }
  if (!hasTrustedVerification(exercise)) reasons.push("verification_metadata_missing");
  if (ENGINE_REVIEW_HOLD.has(exercise.id)) reasons.push("stockfish_regression_review_required");

  const rejected = reasons.some((reason) => [
    "fen_or_solution_line_illegal",
    "accepted_move_illegal",
    "endgame_phase_mismatch",
    "opening_phase_mismatch",
    "conversion_already_overwhelming",
    "defense_outcome_not_verified",
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
  const sourceMoments = new Map<string, number[]>();
  for (const exercise of exercises) {
    const duplicateKey = canonicalExerciseKey(exercise);
    if (seen.has(duplicateKey)) {
      rejected.push({ ...exercise, verificationStatus: "rejected" });
      continue;
    }
    seen.add(duplicateKey);
    // Older master seeds encode game/ply only in sourceId (Capablanca-3-105).
    // They must not escape the same-game/same-mechanism duplicate gate.
    const legacySource = ["master_game", "lichess_standard"].includes(exercise.source ?? "")
      ? exercise.sourceId?.match(/^(.+)-(\d+)$/) : null;
    const gameId = exercise.sourceGameId ?? legacySource?.[1];
    const positionPly = exercise.positionPly ?? (legacySource ? Number(legacySource[2]) : undefined);
    if (gameId && Number.isFinite(positionPly)) {
      const mechanism = exercise.pedagogicalMechanism ?? trainingTaxonomy(exercise).primaryConcept;
      const momentKey = `${gameId}|${mechanism}`;
      const neighbouringPlies = sourceMoments.get(momentKey) ?? [];
      if (neighbouringPlies.some((ply) => Math.abs(ply - positionPly!) <= 6)) {
        rejected.push({ ...exercise, verificationStatus: "rejected" });
        continue;
      }
      neighbouringPlies.push(positionPly!);
      sourceMoments.set(momentKey, neighbouringPlies);
    }
    const validation = validateTrainingExercise(exercise);
    const candidate = { ...exercise, verificationStatus: validation.status };
    if (validation.status === "active") active.push(candidate);
    else if (validation.status === "needs_verification") needsVerification.push(candidate);
    else rejected.push(candidate);
  }
  return { active, needsVerification, rejected };
}
