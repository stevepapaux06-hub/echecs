import { Chess, type Square } from "chess.js";

export type LegalMoveTarget = {
  square: string;
  capture: boolean;
};

/**
 * react-chessboard expects an immediate boolean from onPieceDrop. Validate the
 * move synchronously so the board never commits a drop that ChessPath rejects.
 */
export function isLegalTrainingDrop(
  fen: string,
  sourceSquare: string,
  targetSquare: string | null,
): boolean {
  if (!targetSquare) return false;

  try {
    const chess = new Chess(fen);
    chess.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
      promotion: "q",
    });
    return true;
  } catch {
    return false;
  }
}

/** Shared click/touch selection model for both the lesson board and the lab. */
export function legalMoveTargets(fen: string, sourceSquare: string): LegalMoveTarget[] {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(sourceSquare as Square);
    if (!piece || piece.color !== chess.turn()) return [];
    return chess.moves({ square: sourceSquare as Square, verbose: true }).map((move) => ({
      square: move.to,
      capture: Boolean(move.captured),
    }));
  } catch {
    return [];
  }
}
