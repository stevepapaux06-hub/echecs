import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export type BoardPiece = { square: Square; type: PieceSymbol; color: Color };
export type FileStatus = "open" | "white-semi-open" | "black-semi-open" | "closed";

const FILES = "abcdefgh";

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export function pieces(chess: Chess): BoardPiece[] {
  return chess.board().flatMap((row) => row.filter((piece): piece is BoardPiece => Boolean(piece)));
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function attackersAndDefenders(fen: string, square: Square, owner: Color): { attackers: Square[]; defenders: Square[] } {
  const chess = new Chess(fen);
  return {
    attackers: chess.attackers(square, opposite(owner)),
    defenders: chess.attackers(square, owner),
  };
}

export function loosePieces(fen: string, color: Color): BoardPiece[] {
  const chess = new Chess(fen);
  return pieces(chess).filter((piece) => {
    if (piece.color !== color || piece.type === "k") return false;
    return chess.attackers(piece.square, opposite(color)).length > 0
      && chess.attackers(piece.square, color).length === 0;
  });
}

export function fileStatus(fen: string, file: string): FileStatus {
  const pawns = pieces(new Chess(fen)).filter((piece) => piece.type === "p" && piece.square[0] === file);
  const white = pawns.some((pawn) => pawn.color === "w");
  const black = pawns.some((pawn) => pawn.color === "b");
  if (!white && !black) return "open";
  if (!white) return "white-semi-open";
  if (!black) return "black-semi-open";
  return "closed";
}

export function openAndSemiOpenFiles(fen: string): Array<{ file: string; status: FileStatus }> {
  return [...FILES].map((file) => ({ file, status: fileStatus(fen, file) }));
}

function coordinates(square: Square): [number, number] {
  return [FILES.indexOf(square[0]), Number(square[1]) - 1];
}

function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

export function pawnAttackSquares(fen: string, color: Color): Set<Square> {
  const attacks = new Set<Square>();
  for (const pawn of pieces(new Chess(fen)).filter((piece) => piece.type === "p" && piece.color === color)) {
    const [file, rank] = coordinates(pawn.square);
    const nextRank = rank + (color === "w" ? 1 : -1);
    for (const nextFile of [file - 1, file + 1]) {
      const square = squareAt(nextFile, nextRank);
      if (square) attacks.add(square);
    }
  }
  return attacks;
}

export function squaresNotAttackableByPawns(fen: string, color: Color): Set<Square> {
  const attacked = pawnAttackSquares(fen, opposite(color));
  const result = new Set<Square>();
  for (const file of FILES) for (let rank = 1; rank <= 8; rank += 1) {
    const square = `${file}${rank}` as Square;
    if (!attacked.has(square)) result.add(square);
  }
  return result;
}

export function passedPawns(fen: string, color: Color): BoardPiece[] {
  const allPieces = pieces(new Chess(fen));
  const enemyPawns = allPieces.filter((piece) => piece.type === "p" && piece.color === opposite(color));
  return allPieces.filter((piece) => {
    if (piece.type !== "p" || piece.color !== color) return false;
    const [file, rank] = coordinates(piece.square);
    return !enemyPawns.some((enemy) => {
      const [enemyFile, enemyRank] = coordinates(enemy.square);
      const inLane = Math.abs(enemyFile - file) <= 1;
      const ahead = color === "w" ? enemyRank > rank : enemyRank < rank;
      return inLane && ahead;
    });
  });
}

export function isolatedPawns(fen: string, color: Color): BoardPiece[] {
  const pawns = pieces(new Chess(fen)).filter((piece) => piece.type === "p" && piece.color === color);
  return pawns.filter((pawn) => {
    const [file] = coordinates(pawn.square);
    return !pawns.some((other) => {
      const [otherFile] = coordinates(other.square);
      return Math.abs(otherFile - file) === 1;
    });
  });
}

function rayAttacks(chess: Chess, from: Square, directions: Array<[number, number]>): Square[] {
  const [file, rank] = coordinates(from);
  const result: Square[] = [];
  for (const [fileStep, rankStep] of directions) {
    for (let distance = 1; distance < 8; distance += 1) {
      const square = squareAt(file + fileStep * distance, rank + rankStep * distance);
      if (!square) break;
      result.push(square);
      if (chess.get(square)) break;
    }
  }
  return result;
}

export function attackedSquaresByPiece(chess: Chess, from: Square): Square[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const [file, rank] = coordinates(from);
  if (piece.type === "p") {
    return [file - 1, file + 1]
      .map((targetFile) => squareAt(targetFile, rank + (piece.color === "w" ? 1 : -1)))
      .filter((square): square is Square => Boolean(square));
  }
  if (piece.type === "n") {
    return [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
      .map(([fileStep, rankStep]) => squareAt(file + fileStep, rank + rankStep))
      .filter((square): square is Square => Boolean(square));
  }
  if (piece.type === "k") {
    return [-1, 0, 1].flatMap((fileStep) => [-1, 0, 1]
      .filter((rankStep) => fileStep !== 0 || rankStep !== 0)
      .map((rankStep) => squareAt(file + fileStep, rank + rankStep)))
      .filter((square): square is Square => Boolean(square));
  }
  const diagonal: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const straight: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return rayAttacks(chess, from, piece.type === "b" ? diagonal : piece.type === "r" ? straight : [...diagonal, ...straight]);
}

export function mobility(fen: string): number {
  return new Chess(fen).moves().length;
}

export function isLowMaterialEndgame(fen: string): boolean {
  const nonPawn = pieces(new Chess(fen)).filter((piece) => piece.type !== "p" && piece.type !== "k");
  return nonPawn.length <= 2 && !nonPawn.some((piece) => piece.type === "q");
}

export function distanceToCenter(square: Square): number {
  const [file, rank] = coordinates(square);
  return Math.min(...[[3, 3], [3, 4], [4, 3], [4, 4]].map(([centerFile, centerRank]) => (
    Math.abs(file - centerFile) + Math.abs(rank - centerRank)
  )));
}

export function squareCoordinates(square: Square): [number, number] {
  return coordinates(square);
}
