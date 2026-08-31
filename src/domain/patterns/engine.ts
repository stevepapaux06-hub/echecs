import { Chess, type Color, type Move, type Square } from "chess.js";
import type { AnalyzedMove } from "../chess/types";
import type { ConceptSlug } from "../knowledge/concepts";
import {
  PAWN_STRUCTURES,
  recognizePawnStructure,
  type PawnStructureRecognition,
} from "../knowledge/pawn-structures";
import {
  attackedSquaresByPiece,
  distanceToCenter,
  fileStatus,
  isolatedPawns,
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

export type DetectedMovePattern = { conceptSlug: ConceptSlug; confidence: number };
export type PositionPatternCandidate = DetectedMovePattern & { moveUci: string };

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

function pieceActivity(chess: Chess, square: Square): number {
  const piece = chess.get(square);
  if (!piece) return 0;
  const usefulSquares = attackedSquaresByPiece(chess, square).filter((target) => chess.get(target)?.color !== piece.color);
  return usefulSquares.length * 2 - distanceToCenter(square);
}

function worstActivePiece(chess: Chess, color: Color): Square | null {
  const candidates = pieces(chess).filter((piece) => (
    piece.color === color && ["n", "b", "r"].includes(piece.type)
  ));
  return candidates.toSorted((first, second) => (
    pieceActivity(chess, first.square) - pieceActivity(chess, second.square)
  ))[0]?.square ?? null;
}

function isKnownPawnBreak(fen: string, moveUci: string): boolean {
  const recognition = recognizePawnStructure(fen);
  if (recognition.confidence < 0.9 || recognition.structureSlug === "unknown") return false;
  const definition = PAWN_STRUCTURES.find((structure) => structure.structureSlug === recognition.structureSlug);
  return Boolean(definition?.pawnBreaks.some((move) => move.replace("-", "") === moveUci.slice(0, 4)));
}

export function detectMovePatterns(fen: string, moveUci: string): DetectedMovePattern[] {
  const original = new Chess(fen);
  const before = new Chess(fen);
  const moverColor = before.turn();
  const wasInCheck = before.inCheck();
  const endangeredBefore = loosePieces(fen, moverColor)
    .filter((piece) => PIECE_VALUE[piece.type] >= 3)
    .map((piece) => piece.square);
  const hadEndangeredPiece = endangeredBefore.length > 0;
  const worstPiece = worstActivePiece(original, moverColor);
  const activityBefore = worstPiece ? pieceActivity(original, worstPiece) : 0;
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
  const endangeredAfter = loosePieces(after.fen(), moverColor)
    .filter((piece) => PIECE_VALUE[piece.type] >= 3)
    .map((piece) => piece.square);
  const resolvedThreat = wasInCheck || (hadEndangeredPiece && endangeredAfter.length < endangeredBefore.length);
  if (resolvedThreat) add("opponent_threat", wasInCheck ? 0.98 : 0.9);

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
    const rank = Number(move.to[1]);
    const activeRank = moverColor === "w" ? rank >= 7 : rank <= 2;
    if (isLowMaterialEndgame(after.fen()) && (
      activeRank || pieceActivity(after, move.to as Square) >= pieceActivity(original, move.from as Square) + 4
    )) add("rook_activity", activeRank ? 0.9 : 0.84);
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
  if (move.piece === "p" && isKnownPawnBreak(fen, moveUci)) add("pawn_break", 0.91);

  const attackedWeakPawn = isolatedPawns(after.fen(), opposite(moverColor)).some((pawn) => (
    attackedSquaresByPiece(after, move.to as Square).includes(pawn.square)
  ));
  if (attackedWeakPawn) add("weak_pawn", 0.84);

  const quietMove = !move.captured && !move.promotion && !after.inCheck();
  if (quietMove && worstPiece === move.from) {
    const activityAfter = pieceActivity(after, move.to as Square);
    if (activityAfter >= activityBefore + 5) add("improve_worst_piece", 0.86);
  }
  if (move.piece === "k" && isLowMaterialEndgame(after.fen())) {
    if (hasOpposition(after)) add("opposition", 0.96);
    if (distanceToCenter(move.to as Square) < distanceToCenter(move.from as Square)) add("king_activity", 0.83);
  }

  return [...detected.entries()].map(([conceptSlug, confidence]) => ({ conceptSlug, confidence }));
}

function highSignalForcingMove(fen: string, moveUci: string): boolean {
  const chess = new Chess(fen);
  const move = playUci(chess, moveUci);
  return Boolean(move?.promotion || chess.inCheck());
}

/**
 * Scans legal moves without consulting Stockfish. The engine may validate the
 * resulting candidate later, but it no longer decides which positions the
 * Pattern Engine is allowed to inspect.
 */
export function patternCandidatesForPosition(
  fen: string,
  options: { phase?: "opening" | "middlegame" | "endgame"; ply?: number; minConfidence?: number } = {},
): PositionPatternCandidate[] {
  const chess = new Chess(fen);
  const byConcept = new Map<ConceptSlug, PositionPatternCandidate>();
  for (const move of chess.moves({ verbose: true })) {
    const moveUci = `${move.from}${move.to}${move.promotion ?? ""}`;
    for (const pattern of detectMovePatterns(fen, moveUci)) {
      if (pattern.confidence < (options.minConfidence ?? 0.84)) continue;
      if (pattern.conceptSlug === "forcing_moves" && !highSignalForcingMove(fen, moveUci)) continue;
      const tactical = ["loose_piece", "fork", "pin", "forcing_moves", "opponent_threat"].includes(pattern.conceptSlug);
      if (options.phase === "opening" && (options.ply ?? 20) < 16 && !tactical) continue;
      const previous = byConcept.get(pattern.conceptSlug);
      if (!previous || pattern.confidence > previous.confidence) {
        byConcept.set(pattern.conceptSlug, { ...pattern, moveUci });
      }
    }
  }
  return [...byConcept.values()].toSorted((first, second) => (
    second.confidence - first.confidence || first.moveUci.localeCompare(second.moveUci)
  ));
}

export function patternsForAnalyzedMove(move: AnalyzedMove, minConfidence = 0.8): PatternOccurrence[] {
  const engineMoves = new Set([
    move.before.bestMove,
    ...move.before.lines.map((line) => line.pv[0]),
  ].filter(Boolean));
  const independent = patternCandidatesForPosition(move.fenBefore, {
    phase: move.phase,
    ply: move.ply,
    minConfidence,
  });
  const playedPatterns = detectMovePatterns(move.fenBefore, move.uci)
    .filter((pattern) => pattern.confidence >= minConfidence);
  const playedConcepts = new Set(playedPatterns.map((pattern) => pattern.conceptSlug));
  const occurrences = new Map<ConceptSlug, PatternOccurrence>();

  for (const candidate of independent.filter((item) => engineMoves.has(item.moveUci))) {
    occurrences.set(candidate.conceptSlug, {
      conceptSlug: candidate.conceptSlug,
      fen: move.fenBefore,
      ply: move.ply,
      confidence: candidate.confidence,
      opportunity: true,
      success: move.lossCp <= 80 && playedConcepts.has(candidate.conceptSlug),
      source: "pattern_engine_stockfish_validated",
      moveUci: candidate.moveUci,
    });
  }

  // A sound played move is also reliable positive evidence, even when another
  // equally good engine move occupied MultiPV 1.
  if (move.lossCp <= 60) {
    for (const pattern of playedPatterns) {
      if (occurrences.has(pattern.conceptSlug)) continue;
      occurrences.set(pattern.conceptSlug, {
        conceptSlug: pattern.conceptSlug,
        fen: move.fenBefore,
        ply: move.ply,
        confidence: pattern.confidence,
        opportunity: true,
        success: true,
        source: "pattern_engine",
        moveUci: move.uci,
      });
    }
  }
  return [...occurrences.values()];
}

export function structureForPosition(fen: string): PawnStructureRecognition {
  return recognizePawnStructure(fen);
}
