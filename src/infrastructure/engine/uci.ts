import { Chess } from "chess.js";
import type {
  EngineDebugInfo,
  EngineEvaluation,
  EngineLine,
  EngineScore,
  MoveColor,
  PlayerColor,
} from "@/domain/chess/types";

export const MATE_SCORE_CP = 100_000;

export function sideToMoveFromFen(fen: string): MoveColor {
  const side = fen.trim().split(/\s+/)[1];
  if (side !== "w" && side !== "b") {
    throw new Error("FEN invalide : le trait est introuvable.");
  }
  return side;
}

export function scoreToText(score: EngineScore): string {
  return `${score.type} ${score.value}`;
}

export function normalizeScoreForWhite(score: EngineScore, sideToMove: MoveColor): EngineScore {
  return sideToMove === "w" ? score : { ...score, value: -score.value };
}

export function scoreToComparableCp(score: EngineScore): number {
  if (score.type === "cp") return score.value;
  if (score.value === 0) return -MATE_SCORE_CP;

  const distancePenalty = Math.min(Math.abs(score.value), 999) * 10;
  return Math.sign(score.value) * (MATE_SCORE_CP - distancePenalty);
}

export function evaluationForPlayer(whiteCp: number, playerColor: PlayerColor): number {
  return playerColor === "white" ? whiteCp : -whiteCp;
}

/**
 * Stockfish legitimately returns `bestmove (none)` without a PV when a FEN is
 * already checkmate, stalemate, or another automatic draw. Resolve those
 * positions before starting a search so a finished game cannot abort a batch.
 */
export function buildTerminalEvaluation(
  fen: string,
  requestedDepth: number,
): EngineEvaluation | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;

  const sideToMove = sideToMoveFromFen(fen);
  const isCheckmate = chess.isCheckmate();
  const whiteIsMated = isCheckmate && sideToMove === "w";
  const whiteCp = isCheckmate
    ? whiteIsMated ? -MATE_SCORE_CP : MATE_SCORE_CP
    : 0;
  const mate = isCheckmate ? whiteIsMated ? -1 : 1 : undefined;

  return {
    fen,
    sideToMove,
    whiteCp,
    bestMove: "",
    depth: 0,
    mate,
    lines: [],
    debug: {
      fen,
      sideToMove,
      requestedDepth,
      reachedDepth: 0,
      bestMove: "",
      lines: [],
    },
  };
}

/** Parse one exact UCI `info` line while preserving both raw and normalized scores. */
export function parseUciInfoLine(line: string, fen: string): EngineLine | null {
  if (!line.startsWith("info ") || !line.includes(" score ") || !line.includes(" pv ")) {
    return null;
  }

  const depthMatch = line.match(/\bdepth (\d+)/);
  const multiPvMatch = line.match(/\bmultipv (\d+)/);
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!depthMatch || !scoreMatch || !pvMatch) return null;

  const rawScore: EngineScore = {
    type: scoreMatch[1] as EngineScore["type"],
    value: Number(scoreMatch[2]),
  };
  const sideToMove = sideToMoveFromFen(fen);
  const whiteScore = normalizeScoreForWhite(rawScore, sideToMove);

  return {
    multipv: Number(multiPvMatch?.[1] ?? 1),
    depth: Number(depthMatch[1]),
    rawScore,
    whiteScore,
    whiteCp: scoreToComparableCp(whiteScore),
    pv: pvMatch[1].trim().split(/\s+/).filter(Boolean),
  };
}

export function buildEngineEvaluation({
  fen,
  requestedDepth,
  bestMove,
  lines,
}: {
  fen: string;
  requestedDepth: number;
  bestMove: string;
  lines: EngineLine[];
}): EngineEvaluation {
  const sortedLines = [...lines].sort((a, b) => a.multipv - b.multipv);
  const principal = sortedLines[0];
  if (!principal) throw new Error("Stockfish n’a renvoyé aucune variante exploitable.");

  const resolvedBestMove = bestMove && bestMove !== "(none)" ? bestMove : principal.pv[0] ?? "";
  const sideToMove = sideToMoveFromFen(fen);
  const debug: EngineDebugInfo = {
    fen,
    sideToMove,
    requestedDepth,
    reachedDepth: principal.depth,
    bestMove: resolvedBestMove,
    lines: sortedLines.map((engineLine) => ({
      multipv: engineLine.multipv,
      depth: engineLine.depth,
      rawScore: scoreToText(engineLine.rawScore),
      whiteScore: scoreToText(engineLine.whiteScore),
      pv: engineLine.pv,
    })),
  };

  return {
    fen,
    sideToMove,
    whiteCp: principal.whiteCp,
    bestMove: resolvedBestMove,
    depth: principal.depth,
    mate: principal.whiteScore.type === "mate" ? principal.whiteScore.value : undefined,
    lines: sortedLines,
    debug,
  };
}
