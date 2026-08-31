import { describe, expect, it } from "vitest";
import type { AnalyzedGame, AnalyzedMove, EngineEvaluation, GamePhase } from "@/domain/chess/types";
import { calculateMetrics } from "./metrics";

function evaluation(whiteCp: number, bestMove: string): EngineEvaluation {
  return {
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    sideToMove: "w",
    whiteCp,
    bestMove,
    depth: 7,
    lines: [{
      multipv: 1,
      depth: 7,
      rawScore: { type: "cp", value: whiteCp },
      whiteScore: { type: "cp", value: whiteCp },
      whiteCp,
      pv: bestMove ? [bestMove] : [],
    }],
    debug: {
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      sideToMove: "w",
      requestedDepth: 7,
      reachedDepth: 7,
      bestMove,
      lines: [],
    },
  };
}

function move(phase: GamePhase, before: number, after: number): AnalyzedMove {
  return {
    ply: 20,
    san: "Nf3",
    uci: "g1f3",
    from: "g1",
    to: "f3",
    color: "w",
    fenBefore: "before",
    fenAfter: "after",
    phase,
    before: evaluation(before, "g1f3"),
    after: evaluation(after, ""),
    playerCpBefore: before,
    playerCpAfter: after,
    lossCp: Math.max(0, before - after),
  };
}

function game(id: string, outcome: "win" | "draw" | "loss", moves: AnalyzedMove[]): AnalyzedGame {
  return {
    id,
    source: "chesscom",
    rawPgn: "",
    url: `https://example.com/${id}`,
    playedAt: 1,
    timeClass: "rapid",
    timeControl: "600",
    rated: true,
    playerColor: "white",
    playerRating: 1400,
    opponent: "Opponent",
    opponentRating: 1400,
    outcome,
    moves,
    analyzedMoves: moves,
  };
}

describe("calculateMetrics", () => {
  it("prioritizes conversion when repeated winning positions are not converted", () => {
    const games = [
      game("1", "loss", [move("middlegame", 300, 80), move("endgame", 80, 20)]),
      game("2", "draw", [move("middlegame", 250, 40), move("endgame", 40, 20)]),
    ];

    const metrics = calculateMetrics(games);
    expect(metrics.conversionOpportunities).toBe(2);
    expect(metrics.conversionRate).toBe(0);
    expect(metrics.priority).toBe("conversion");
    expect(metrics.importantErrors).toBe(2);
  });

  it("does not invent a conversion percentage without opportunities", () => {
    const metrics = calculateMetrics([game("1", "draw", [move("opening", 20, 10)])]);
    expect(metrics.conversionRate).toBeNull();
  });

  it("counts reliable opportunities and successes by exact concept slug", () => {
    const success = move("middlegame", 20, 20);
    success.patterns = [{
      conceptSlug: "fork",
      fen: success.fenBefore,
      ply: success.ply,
      confidence: 0.95,
      opportunity: true,
      success: true,
      source: "pattern_engine_stockfish_validated",
      moveUci: "g1f3",
    }];
    const failure = move("middlegame", 20, -180);
    failure.patterns = [{ ...success.patterns[0], success: false, ply: failure.ply }];

    const metrics = calculateMetrics([game("patterns", "loss", [success, failure])]);
    expect(metrics.conceptStats).toContainEqual({
      conceptSlug: "fork",
      opportunities: 2,
      successes: 1,
      failures: 1,
      confidence: "low",
    });
    expect(metrics.primaryTheme).toMatchObject({ id: "fork", sampleSize: 2, successCount: 1, issueCount: 1 });
  });

  it("keeps exact patterns and conversion in the same diagnostic", () => {
    const first = move("middlegame", 300, 80);
    first.patterns = [{
      conceptSlug: "fork",
      fen: first.fenBefore,
      ply: first.ply,
      confidence: 0.95,
      opportunity: true,
      success: false,
      source: "pattern_engine_stockfish_validated",
      moveUci: "g1f3",
    }];
    const second = { ...move("middlegame", 250, 40), ply: 22 };
    second.patterns = [{ ...first.patterns[0], ply: 22 }];

    const metrics = calculateMetrics([
      game("conversion-1", "loss", [first]),
      game("conversion-2", "draw", [second]),
    ]);

    expect(metrics.themes.map((theme) => theme.id)).toEqual(expect.arrayContaining(["fork", "conversion"]));
    expect(metrics.primaryTheme.id).toBe("conversion");
  });
});
