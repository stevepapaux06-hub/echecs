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
  let queens = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      if (piece.type === "q") queens += 1;
      if (piece.type in NON_PAWN_VALUES) {
        nonPawnMaterial += NON_PAWN_VALUES[piece.type as keyof typeof NON_PAWN_VALUES];
      }
    }
  }

  if (ply < 20 && nonPawnMaterial >= 4_800) return "opening";
  if (queens === 0 || nonPawnMaterial <= 2_600) return "endgame";
  return "middlegame";
}
