import { Chess, type Square } from "chess.js";
import type { TrainingExercise } from "../chess/types";
import { causalFeatures, outsidePawnSquare } from "../patterns/concept-specifications";
import { attackedSquaresByPiece, isPawnEndgame, pieces, rookBehindPassedPawn, squareCoordinates } from "../patterns/position-features";

export type PedagogicalMilestone = {
  kind: "promotion" | "pawn_race_resolved" | "pawn_square_secured" | "opposition" | "rook_behind_passer" | "concept_state" | "theoretical_position";
  proof: "structural" | "theoretical" | "syzygy";
  minimumPlayerMoves: number;
  signal?: string;
  /** Only a verified canonical position may use an exact target. */
  targetFen?: string;
};

export function milestoneReached(exercise: TrainingExercise, afterFen: string | undefined,
  playerMoves: number, decisionFen?: string, playedMove?: string): boolean {
  const milestone = exercise.pedagogicalMilestone;
  if (!milestone || !afterFen || playerMoves < milestone.minimumPlayerMoves) return false;
  const after = new Chess(afterFen); const before = new Chess(exercise.fen);
  const color = exercise.playerColor === "white" ? "w" : "b";
  const own = pieces(after).filter((p) => p.color === color);
  if (milestone.kind === "promotion") return own.filter((p) => p.type === "q").length
    > pieces(before).filter((p) => p.color === color && p.type === "q").length;
  if (milestone.kind === "theoretical_position") return !!milestone.targetFen
    && afterFen.split(" ").slice(0, 2).join(" ") === milestone.targetFen.split(" ").slice(0, 2).join(" ");
  if (milestone.kind === "pawn_race_resolved") return isPawnEndgame(afterFen)
    && outsidePawnSquare(after, color) && !outsidePawnSquare(after, color === "w" ? "b" : "w");
  if (milestone.kind === "pawn_square_secured") return isPawnEndgame(afterFen)
    && outsidePawnSquare(before, color === "w" ? "b" : "w")
    && !outsidePawnSquare(after, color === "w" ? "b" : "w");
  if (milestone.kind === "rook_behind_passer") return own.some((p) => {
    if (p.type !== "r") return false;
    const pawn = rookBehindPassedPawn(afterFen, p.square);
    return !!pawn && attackedSquaresByPiece(after, p.square).includes(pawn.square)
      && !after.isAttacked(p.square, color === "w" ? "b" : "w");
  });
  if (milestone.kind === "opposition") {
    if (!isPawnEndgame(afterFen)) return false;
    const kings = pieces(after).filter((p) => p.type === "k");
    const [f1, r1] = squareCoordinates(kings[0].square); const [f2, r2] = squareCoordinates(kings[1].square);
    const king = own.find((p) => p.type === "k")!;
    // The player has just handed the move to the opponent. Opposition must
    // concern a nearby pawn, not just two aligned kings on the empty wing.
    return after.turn() !== color && ((f1 === f2 && Math.abs(r1 - r2) === 2) || (r1 === r2 && Math.abs(f1 - f2) === 2))
      && own.some((p) => p.type === "p" && Math.abs(Number(p.square[1]) - Number(king.square[1])) <= 2
        && Math.abs(p.square.charCodeAt(0) - king.square.charCodeAt(0)) <= 1);
  }
  if (milestone.kind === "concept_state" && decisionFen && playedMove && milestone.signal) {
    return Boolean(causalFeatures(decisionFen, playedMove)?.signals.includes(milestone.signal));
  }
  return false;
}

export function referenceMilestoneIndex(exercise: TrainingExercise): number | null {
  const chess = new Chess(exercise.fen);
  for (const [i, uci] of (exercise.solutionLine ?? []).entries()) {
    const before = chess.fen();
    try { chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); } catch { return null; }
    if (i % 2 === 0 && milestoneReached(exercise, chess.fen(), (i + 2) / 2 | 0, before, uci)) return i;
  }
  return null;
}
