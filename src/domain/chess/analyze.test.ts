import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { AnalysisPayload, EngineEvaluation, MoveSnapshot, ParsedGame } from "./types";
import { analyzePayload, type PositionEvaluator } from "./analyze";
import { sideToMoveFromFen } from "../../infrastructure/engine/uci";

function evaluation(fen: string): EngineEvaluation {
  const chess = new Chess(fen);
  const firstMove = chess.moves({ verbose: true })[0];
  const bestMove = firstMove ? `${firstMove.from}${firstMove.to}${firstMove.promotion ?? ""}` : "";
  const sideToMove = sideToMoveFromFen(fen);
  return {
    fen,
    sideToMove,
    whiteCp: 20,
    bestMove,
    depth: 8,
    lines: [],
    debug: { fen, sideToMove, requestedDepth: 8, reachedDepth: 8, bestMove, lines: [] },
  };
}

function snapshots(): MoveSnapshot[] {
  const chess = new Chess();
  const moves = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5"];
  return moves.map((san, index) => {
    const fenBefore = chess.fen();
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      color: move.color,
      fenBefore,
      fenAfter: chess.fen(),
      phase: "opening",
    };
  });
}

function payload(): AnalysisPayload {
  const game: ParsedGame = {
    id: "resilience-game",
    source: "pgn",
    rawPgn: "",
    playedAt: 0,
    timeClass: "rapid",
    timeControl: "600",
    rated: false,
    playerColor: "white",
    playerRating: 1200,
    opponent: "Test",
    opponentRating: 1200,
    outcome: "draw",
    moves: snapshots(),
  };
  return {
    profile: { username: "Player", displayName: "Player" },
    games: [game],
    warnings: [],
    selection: { source: "pgn", requestedGames: 1, cadence: "all" },
  };
}

describe("analyzePayload resilience", () => {
  it("keeps the batch when one decision remains unavailable", async () => {
    const input = payload();
    const failedFen = input.games[0].moves[8].fenAfter;
    const engine: PositionEvaluator = {
      evaluate: async (fen) => {
        if (fen === failedFen) throw new Error("Réponse moteur incomplète");
        return evaluation(fen);
      },
    };

    const result = await analyzePayload(input, engine, () => undefined);

    expect(result.metrics.positionsAnalyzed).toBe(1);
    expect(result.warnings).toContain(
      "1 décision a été ignorée après deux tentatives moteur ; le reste de l’analyse est complet.",
    );
  });

  it("keeps an equal middlegame position selected by a reliable pattern", async () => {
    const chess = new Chess("4k3/8/4q1r1/8/8/3N4/8/K7 w - - 0 1");
    const fenBefore = chess.fen();
    const played = chess.move("Kb1");
    const fenAfter = chess.fen();
    const move: MoveSnapshot = {
      ply: 20,
      san: played.san,
      uci: `${played.from}${played.to}`,
      from: played.from,
      to: played.to,
      color: "w",
      fenBefore,
      fenAfter,
      phase: "middlegame",
    };
    const input = payload();
    input.games[0] = { ...input.games[0], moves: [move] };
    const engine: PositionEvaluator = {
      evaluate: async (fen) => {
        const board = new Chess(fen);
        const sideToMove = sideToMoveFromFen(fen);
        const bestMove = fen === fenBefore
          ? "d3f4"
          : (() => {
              const first = board.moves({ verbose: true })[0];
              return first ? `${first.from}${first.to}${first.promotion ?? ""}` : "";
            })();
        return {
          fen,
          sideToMove,
          whiteCp: 0,
          bestMove,
          depth: 10,
          lines: bestMove ? [{
            multipv: 1,
            depth: 10,
            rawScore: { type: "cp", value: 0 },
            whiteScore: { type: "cp", value: 0 },
            whiteCp: 0,
            pv: [bestMove],
          }] : [],
          debug: { fen, sideToMove, requestedDepth: 10, reachedDepth: 10, bestMove, lines: [] },
        };
      },
    };

    const result = await analyzePayload(input, engine, () => undefined);

    expect(result.games[0].analyzedMoves[0].pedagogical?.kind).toBe("stable_pattern");
    expect(result.exercises.some((exercise) => (
      exercise.origin === "personal" && exercise.conceptSlug === "fork"
    ))).toBe(true);
  });
});
