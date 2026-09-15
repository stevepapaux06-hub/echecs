import { Chess, type Color, type Square } from "chess.js";
import { classifyPhase } from "../chess/phase";
import type { ExerciseTeachingFacts, TrainingExercise } from "../chess/types";
import { causalFeatures, CONCEPT_SPECIFICATIONS } from "../patterns/concept-specifications";
import {
  fileStatus, passedPawns, pieceActivity, pieces, squareCoordinates,
} from "../patterns/position-features";

export const PRIORITY_TEACHING_FAMILIES = new Set([
  "restrict_counterplay", "king_activity", "open_file", "favorable_exchange",
]);

function fullmovePly(fen: string): number {
  const fields = fen.split(/\s+/);
  const fullmove = Number(fields[5] ?? 1);
  return Math.max(0, (Number.isFinite(fullmove) ? fullmove - 1 : 0) * 2 + (fields[1] === "b" ? 1 : 0));
}

function colorName(color: Color): "white" | "black" {
  return color === "w" ? "white" : "black";
}

function distance(first: Square, second: Square): number {
  const [firstFile, firstRank] = squareCoordinates(first);
  const [secondFile, secondRank] = squareCoordinates(second);
  return Math.max(Math.abs(firstFile - secondFile), Math.abs(firstRank - secondRank));
}

function realizedDecision(exercise: TrainingExercise): {
  uci: string;
  fen: string;
  features: NonNullable<ReturnType<typeof causalFeatures>>;
} | null {
  const required = CONCEPT_SPECIFICATIONS[exercise.conceptSlug]?.necessary_signals ?? [];
  const chess = new Chess(exercise.fen);
  for (const [index, uci] of (exercise.solutionLine?.length ? exercise.solutionLine : [exercise.bestMove]).entries()) {
    if (index % 2 === 0) {
      const fen = chess.fen();
      const features = causalFeatures(fen, uci);
      if (features && required.some((signal) => features.signals.includes(signal))) return { uci, fen, features };
    }
    try {
      chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
    } catch {
      return null;
    }
  }
  return null;
}

function openFileSubtype(before: Chess, after: Chess, moveTo: Square, color: Color, targets: string[]): string {
  const status = fileStatus(after.fen(), moveTo[0]);
  const friendlyRooks = pieces(after).filter((piece) => piece.type === "r" && piece.color === color && piece.square[0] === moveTo[0]);
  const enemyRook = pieces(after).some((piece) => piece.type === "r" && piece.color !== color && piece.square[0] === moveTo[0]);
  if (friendlyRooks.length >= 2) return "double_rooks_on_file";
  if (enemyRook) return "contest_open_file";
  if (status !== "open") return "semi_open_file_with_target";
  const entry = targets.some((square) => color === "w" ? Number(square[1]) >= 6 : Number(square[1]) <= 3);
  return entry ? "open_file_entry_square" : "open_file_with_target";
}

function kingActivitySubtype(before: Chess, moveFrom: Square, moveTo: Square, color: Color, targets: string[]): string {
  const alliedPasser = passedPawns(before.fen(), color).find((pawn) => distance(moveTo, pawn.square) < distance(moveFrom, pawn.square));
  const enemyPasser = passedPawns(before.fen(), color === "w" ? "b" : "w").find((pawn) => distance(moveTo, pawn.square) < distance(moveFrom, pawn.square));
  if (alliedPasser) return "support_passed_pawn";
  if (enemyPasser) return "king_and_pawn_race";
  if (targets.length) return "attack_weakness";
  const [, fromRank] = squareCoordinates(moveFrom);
  const [, toRank] = squareCoordinates(moveTo);
  const penetration = color === "w" ? toRank > fromRank && toRank >= 4 : toRank < fromRank && toRank <= 3;
  return penetration ? "king_penetration" : "king_centralization";
}

function exchangeSubtype(before: Chess, after: Chess, from: Square, to: Square, color: Color): string {
  if (classifyPhase(before.fen(), fullmovePly(before.fen())) !== "endgame"
    && classifyPhase(after.fen(), fullmovePly(after.fen()) + 1) === "endgame") return "transition_to_favorable_endgame";
  const captured = before.get(to);
  if (captured && ["n", "b", "r"].includes(captured.type)
    && pieceActivity(before, to) > pieceActivity(before, from)) return "remove_active_piece";
  const mover = before.get(from);
  if (mover && captured && ["n", "b"].includes(mover.type) && ["n", "b"].includes(captured.type)) {
    return "trade_bad_piece_for_active_piece";
  }
  return color === before.turn() ? "reduce_counterplay_by_exchange" : "favorable_exchange";
}

function restrictSubtype(before: Chess, to: Square): string {
  const captured = before.get(to);
  if (captured?.type === "p" && passedPawns(before.fen(), captured.color).some((pawn) => pawn.square === to)) {
    return "neutralize_passed_pawn";
  }
  if (captured && captured.type !== "p") return "exchange_active_piece";
  if (before.inCheck()) return "reduce_king_threat";
  return "neutralize_concrete_threat";
}

/** Derives the exact move, piece, square, target and mechanism that the lesson
 * actually demonstrates. A missing fact means abstention, not guessed prose. */
export function deriveTeachingFacts(exercise: TrainingExercise): ExerciseTeachingFacts | null {
  if (!PRIORITY_TEACHING_FAMILIES.has(exercise.conceptSlug)) return null;
  const realized = realizedDecision(exercise);
  if (!realized) return null;
  const before = new Chess(realized.fen);
  const from = realized.features.from as Square;
  const to = realized.features.to as Square;
  const movingPiece = before.get(from);
  if (!movingPiece) return null;
  const capturedPiece = before.get(to);
  const after = new Chess(realized.fen);
  try { after.move({ from, to, promotion: realized.uci[4] || "q" }); } catch { return null; }
  const signal = CONCEPT_SPECIFICATIONS[exercise.conceptSlug].necessary_signals
    .find((candidate) => realized.features.signals.includes(candidate));
  if (!signal) return null;

  const mechanismSubtype = exercise.conceptSlug === "open_file"
    ? openFileSubtype(before, after, to, movingPiece.color, realized.features.targetSquares)
    : exercise.conceptSlug === "king_activity"
      ? kingActivitySubtype(before, from, to, movingPiece.color, realized.features.targetSquares)
      : exercise.conceptSlug === "favorable_exchange"
        ? exchangeSubtype(before, after, from, to, movingPiece.color)
        : restrictSubtype(before, to);

  return {
    version: 1,
    decisionMoveUci: exercise.bestMove,
    realizedMoveUci: realized.uci,
    signal,
    mechanismSubtype,
    phase: classifyPhase(realized.fen, fullmovePly(realized.fen)),
    subject: { square: from, piece: movingPiece.type, color: colorName(movingPiece.color) },
    destinationSquare: to,
    targetSquares: [...new Set(realized.features.targetSquares)],
    ...(capturedPiece ? { captured: { square: to, piece: capturedPiece.type, color: colorName(capturedPiece.color) } } : {}),
    ...(exercise.conceptSlug === "open_file" ? { file: to[0] } : {}),
  };
}

/** Recomputes facts from the board instead of trusting authored prose. */
export function teachingContractReasons(exercise: TrainingExercise): string[] {
  if (!PRIORITY_TEACHING_FAMILIES.has(exercise.conceptSlug)) return [];
  const expected = deriveTeachingFacts(exercise);
  const actual = exercise.explanation?.teachingFacts;
  if (!expected) return ["teaching_mechanism_not_demonstrated"];
  if (!actual) return ["structured_teaching_facts_missing"];
  const reasons: string[] = [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) reasons.push("structured_teaching_facts_stale");
  if (exercise.conceptSlug === "king_activity") {
    const board = new Chess(exercise.fen);
    if (pieces(board).some((piece) => piece.type === "q") || expected.phase !== "endgame") {
      reasons.push("king_activity_not_a_true_endgame");
    }
  }
  if (exercise.conceptSlug === "favorable_exchange" && !expected.captured) reasons.push("favorable_exchange_without_exchange");
  const primaryArrow = exercise.planArrows?.find((arrow) => arrow.color === "primary");
  if (!primaryArrow || `${primaryArrow.from}${primaryArrow.to}` !== exercise.bestMove.slice(0, 4)) {
    reasons.push("primary_annotation_move_mismatch");
  }
  if (!exercise.planSquares?.some((square) => square.square === expected.destinationSquare)) {
    reasons.push("teaching_destination_not_annotated");
  }
  return reasons;
}

export type TeachingDisposition = "promote" | "reject" | "abstain";

export function teachingDisposition(exercise: TrainingExercise): TeachingDisposition {
  if (!PRIORITY_TEACHING_FAMILIES.has(exercise.conceptSlug)) return "abstain";
  if (teachingContractReasons(exercise).length) return "reject";
  const assessment = exercise.trainingAssessment;
  if (!assessment || assessment.exerciseability !== true || assessment.contrast?.passed !== true) return "abstain";
  return "promote";
}
