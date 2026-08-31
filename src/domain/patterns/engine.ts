import { Chess, type Color, type Move, type Square } from "chess.js";
import type { AnalyzedMove } from "../chess/types";
import type { ConceptSlug } from "../knowledge/concepts";
import { recognizePawnStructure, type PawnStructureRecognition } from "../knowledge/pawn-structures";
import {
  attackedSquaresByPiece,
  distanceToCenter,
  fileStatus,
  isLowMaterialEndgame,
  loosePieces,
  opposite,
  passedPawns,
  pawnAttackSquares,
  pieces,
  PIECE_VALUE,
  squareCoordinates,
} from "./position-features";

export type PatternSource = "pattern_engine" | "pattern_engine_stockfish_validated";

export type PatternOccurrence = {
  conceptSlug: ConceptSlug;
  fen: string;
  ply: number;
  confidence: number;
  opportunity: boolean;
  success: boolean;
  source: PatternSource;
  moveUci: string;
};

type DetectedMovePattern = { conceptSlug: ConceptSlug; confidence: number };

function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.slice(4, 5) || "q",
    });
  } catch {
    return null;
  }
}

function createsAbsolutePin(chess: Chess, attackerSquare: Square, attackerColor: Color): boolean {
  const attacker = chess.get(attackerSquare);
  if (!attacker || !["b", "r", "q"].includes(attacker.type)) return false;
  const enemyKing = pieces(chess).find((piece) => piece.type === "k" && piece.color === opposite(attackerColor));
  if (!enemyKing) return false;
  const [attackerFile, attackerRank] = squareCoordinates(attackerSquare);
  const [kingFile, kingRank] = squareCoordinates(enemyKing.square);
  const fileDelta = kingFile - attackerFile;
  const rankDelta = kingRank - attackerRank;
  const diagonal = Math.abs(fileDelta) === Math.abs(rankDelta);
  const straight = fileDelta === 0 || rankDelta === 0;
  if ((attacker.type === "b" && !diagonal) || (attacker.type === "r" && !straight) || (attacker.type === "q" && !diagonal && !straight)) return false;
  const fileStep = Math.sign(fileDelta);
  const rankStep = Math.sign(rankDelta);
  const distance = Math.max(Math.abs(fileDelta), Math.abs(rankDelta));
  const between: Array<ReturnType<Chess["get"]>> = [];
  for (let index = 1; index < distance; index += 1) {
    const square = `${"abcdefgh"[attackerFile + fileStep * index]}${attackerRank + rankStep * index + 1}` as Square;
    const piece = chess.get(square);
    if (piece) between.push(piece);
  }
  return between.length === 1 && between[0]?.color === opposite(attackerColor) && between[0].type !== "k";
}

function hasOpposition(chess: Chess): boolean {
  const kings = pieces(chess).filter((piece) => piece.type === "k");
  if (kings.length !== 2) return false;
  const [firstFile, firstRank] = squareCoordinates(kings[0].square);
  const [secondFile, secondRank] = squareCoordinates(kings[1].square);
  return (firstFile === secondFile && Math.abs(firstRank - secondRank) === 2)
    || (firstRank === secondRank && Math.abs(firstFile - secondFile) === 2);
}

function endangeredOwnPiece(fen: string, color: Color): boolean {
  return loosePieces(fen, color).some((piece) => PIECE_VALUE[piece.type] >= 3);
}

export function detectMovePatterns(fen: string, moveUci: string): DetectedMovePattern[] {
  const before = new Chess(fen);
  const moverColor = before.turn();
  const wasInCheck = before.inCheck();
  const hadEndangeredPiece = endangeredOwnPiece(fen, moverColor);
  const capturedPiece = before.get(moveUci.slice(2, 4) as Square);
  const capturedWasLoose = Boolean(capturedPiece
    && capturedPiece.type !== "p"
    && before.attackers(moveUci.slice(2, 4) as Square, capturedPiece.color).length === 0);
  const move = playUci(before, moveUci);
  if (!move) return [];
  const after = before;
  const detected = new Map<ConceptSlug, number>();
  const add = (conceptSlug: ConceptSlug, confidence: number) => detected.set(
    conceptSlug,
    Math.max(confidence, detected.get(conceptSlug) ?? 0),
  );

  if (move.captured || move.promotion || after.inCheck()) add("forcing_moves", after.inCheck() ? 0.9 : 0.84);
  if (capturedWasLoose) add("loose_piece", 0.94);
  if (wasInCheck || hadEndangeredPiece) add("opponent_threat", wasInCheck ? 0.98 : 0.86);

  const attackedTargets = attackedSquaresByPiece(after, move.to as Square)
    .map((square) => after.get(square))
    .filter((piece) => piece?.color === opposite(moverColor) && PIECE_VALUE[piece.type] >= 3);
  if (attackedTargets.length >= 2) {
    const includesMajorOrKing = attackedTargets.some((piece) => piece && PIECE_VALUE[piece.type] >= 5);
    add("fork", includesMajorOrKing ? 0.95 : 0.88);
  }
  if (createsAbsolutePin(after, move.to as Square, moverColor)) add("pin", 0.96);

  if (move.piece === "r") {
    const status = fileStatus(after.fen(), move.to[0]);
    if (status === "open" || status === (moverColor === "w" ? "white-semi-open" : "black-semi-open")) {
      add("open_file", status === "open" ? 0.92 : 0.84);
    }
  }
  if (move.piece === "n") {
    const rank = Number(move.to[1]);
    const advanced = moverColor === "w" ? rank >= 5 : rank <= 4;
    const supportedByPawn = pawnAttackSquares(after.fen(), moverColor).has(move.to as Square);
    const chasedByEnemyPawn = pawnAttackSquares(after.fen(), opposite(moverColor)).has(move.to as Square);
    if (advanced && supportedByPawn && !chasedByEnemyPawn) add("outpost", 0.91);
  }
  if (move.piece === "p" && passedPawns(after.fen(), moverColor).some((pawn) => pawn.square === move.to)) {
    add("passed_pawn", 0.9);
  }
  if (move.piece === "k" && isLowMaterialEndgame(after.fen())) {
    if (hasOpposition(after)) add("opposition", 0.96);
    if (distanceToCenter(move.to as Square) < distanceToCenter(move.from as Square)) add("king_activity", 0.83);
  }

  return [...detected.entries()].map(([conceptSlug, confidence]) => ({ conceptSlug, confidence }));
}

export function patternsForAnalyzedMove(move: AnalyzedMove, minConfidence = 0.8): PatternOccurrence[] {
  const bestMove = move.before.bestMove;
  if (!bestMove) return [];
  const opportunities = detectMovePatterns(move.fenBefore, bestMove).filter((pattern) => pattern.confidence >= minConfidence);
  if (!opportunities.length) return [];
  const played = new Set(detectMovePatterns(move.fenBefore, move.uci).map((pattern) => pattern.conceptSlug));
  return opportunities.map((pattern) => ({
    conceptSlug: pattern.conceptSlug,
    fen: move.fenBefore,
    ply: move.ply,
    confidence: pattern.confidence,
    opportunity: true,
    success: move.lossCp <= 100 && (move.uci === bestMove || pattern.conceptSlug === "opponent_threat" || played.has(pattern.conceptSlug)),
    source: "pattern_engine_stockfish_validated",
    moveUci: bestMove,
  }));
}

export function structureForPosition(fen: string): PawnStructureRecognition {
  return recognizePawnStructure(fen);
}
