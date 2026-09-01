import { Chess } from "chess.js";
import type { GamePhase } from "./types";

const NON_PAWN_VALUES = {
  n: 320,
  b: 330,
  r: 500,
  q: 900,
} as const;

/**
 * A deliberately transparent phase classifier. It uses move count and remaining
 * non-pawn material, not a fabricated "strategy score". The thresholds are
 * coarse by design and can later be replaced without touching the UI.
 */
export function classifyPhase(fen: string, ply: number): GamePhase {
  const chess = new Chess(fen);
  let nonPawnMaterial = 0;
  let nonPawnPieces = 0;
  let queens = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      if (piece.type === "q") queens += 1;
      if (piece.type in NON_PAWN_VALUES) {
        nonPawnPieces += 1;
        nonPawnMaterial += NON_PAWN_VALUES[piece.type as keyof typeof NON_PAWN_VALUES];
      }
    }
  }

  if (ply < 20 && nonPawnMaterial >= 4_800) return "opening";
  // Losing the queens alone does not make a finale. Four rooks and several
  // minor pieces still form a middlegame, so queenless positions also need a
  // genuinely reduced number of non-pawn pieces.
  if (nonPawnMaterial <= 2_600 || (queens === 0 && nonPawnPieces <= 4)) return "endgame";
  return "middlegame";
}
