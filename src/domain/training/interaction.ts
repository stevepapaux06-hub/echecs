import { Chess, type Square } from "chess.js";

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
