import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { DevelopmentReference } from "./types";

const FILES = "abcdefgh";

export function squareIsValid(square: string): square is Square {
  return /^[a-h][1-8]$/.test(square);
}

export function pieceAt(fen: string, square: string): { type: PieceSymbol; color: "white" | "black" } | null {
  if (!squareIsValid(square)) return null;
  const piece = new Chess(fen).get(square);
  return piece ? { type: piece.type, color: piece.color === "w" ? "white" : "black" } : null;
}

export function pawnsOnFile(fen: string, file: string): Square[] {
  if (!/^[a-h]$/.test(file)) return [];
  const chess = new Chess(fen);
  return chess.board().flat().filter((piece) => piece?.type === "p" && piece.square[0] === file).map((piece) => piece!.square);
}

export function isOpenFile(fen: string, file: string): boolean {
  return pawnsOnFile(fen, file).length === 0;
}

export function replayLine(fen: string, line: readonly string[]): Chess | null {
  const chess = new Chess(fen);
  try {
    for (const uci of line) chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: (uci[4] as PieceSymbol | undefined) ?? "q",
    });
    return chess;
  } catch {
    return null;
  }
}

export function isLegalLine(fen: string, line: readonly string[]): boolean {
  return replayLine(fen, line) !== null;
}

export function resourceAvailableAfter(fen: string, playerMove: string, opponentResource: string): boolean {
  const after = replayLine(fen, [playerMove]);
  if (!after) return false;
  try {
    return Boolean(after.move({
      from: opponentResource.slice(0, 2) as Square,
      to: opponentResource.slice(2, 4) as Square,
      promotion: (opponentResource[4] as PieceSymbol | undefined) ?? "q",
    }));
  } catch {
    return false;
  }
}

export function oppositionGeometry(fen: string): { present: boolean; kings: [Square, Square] | null } {
  const chess = new Chess(fen);
  const kings = chess.board().flat().filter((piece) => piece?.type === "k").map((piece) => piece!.square);
  if (kings.length !== 2) return { present: false, kings: null };
  const [first, second] = kings as [Square, Square];
  const fileDistance = Math.abs(FILES.indexOf(first[0]) - FILES.indexOf(second[0]));
  const rankDistance = Math.abs(Number(first[1]) - Number(second[1]));
  return {
    present: (fileDistance === 0 && rankDistance === 2) || (rankDistance === 0 && fileDistance === 2),
    kings: [first, second],
  };
}

/** Conservative geometric chase test. `true` means an enemy pawn already
 * attacks the square or can advance on an adjacent file until it does. It does
 * not claim that the pawn advance is objectively good. */
export function enemyPawnCanGeometricallyChase(fen: string, square: string, occupantColor: "white" | "black"): boolean {
  if (!squareIsValid(square)) return false;
  const chess = new Chess(fen);
  const targetFile = FILES.indexOf(square[0]);
  const targetRank = Number(square[1]);
  const enemy: Color = occupantColor === "white" ? "b" : "w";
  return chess.board().flat().some((piece) => {
    if (!piece || piece.type !== "p" || piece.color !== enemy) return false;
    const fileDistance = Math.abs(FILES.indexOf(piece.square[0]) - targetFile);
    if (fileDistance !== 1) return false;
    const pawnRank = Number(piece.square[1]);
    return enemy === "w" ? pawnRank < targetRank : pawnRank > targetRank;
  });
}

export function pawnSupportsSquare(fen: string, square: string, color: "white" | "black"): boolean {
  if (!squareIsValid(square)) return false;
  const chess = new Chess(fen);
  const targetFile = FILES.indexOf(square[0]);
  const targetRank = Number(square[1]);
  const sourceRank = color === "white" ? targetRank - 1 : targetRank + 1;
  return [-1, 1].some((delta) => {
    const file = FILES[targetFile + delta];
    if (!file || sourceRank < 1 || sourceRank > 8) return false;
    const piece = chess.get(`${file}${sourceRank}` as Square);
    return piece?.type === "p" && piece.color === (color === "white" ? "w" : "b");
  });
}

export function afterFirstMove(fen: string, move: string): Chess | null {
  return replayLine(fen, [move]);
}

export function semanticBoardErrors(reference: DevelopmentReference): string[] {
  const errors: string[] = [];
  const claims = reference.semantic_claims;
  const line = reference.line_uci ?? (reference.move_uci ? [reference.move_uci] : []);
  if (!isLegalLine(reference.fen, line)) errors.push("illegal_line");
  if (claims.subject_piece) {
    const actual = pieceAt(reference.fen, claims.subject_piece.square);
    if (!actual || actual.type !== claims.subject_piece.type || actual.color !== claims.subject_piece.color) errors.push("subject_piece_mismatch");
  }
  if (claims.open_file && !isOpenFile(reference.fen, claims.open_file)) errors.push("open_file_contains_pawn");
  if (claims.destination_square && reference.move_uci?.slice(2, 4) !== claims.destination_square) errors.push("destination_mismatch");
  for (const square of claims.target_squares ?? []) if (!squareIsValid(square)) errors.push("invalid_target_square");
  if (claims.attacker_before) {
    const actual = pieceAt(reference.fen, claims.attacker_before.square);
    if (!actual || actual.type !== claims.attacker_before.type || actual.color !== claims.attacker_before.color) errors.push("attacker_mismatch");
  }
  if (claims.exchange_action && reference.move_uci !== claims.exchange_action) errors.push("exchange_action_mismatch");
  if (claims.opposition_kings) {
    const geometry = oppositionGeometry(reference.fen);
    if (!geometry.kings || !claims.opposition_kings.every((square) => geometry.kings!.includes(square as Square))) errors.push("opposition_king_mismatch");
  }
  return errors;
}
