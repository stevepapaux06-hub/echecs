import { describe, expect, it } from "vitest";
import type { AnalyzedGame, AnalyzedMove, GamePhase } from "@/domain/chess/types";
import { calculateMetrics } from "./metrics";

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
    before: { whiteCp: before, bestMove: "g1f3", depth: 7 },
    after: { whiteCp: after, bestMove: "", depth: 7 },
    playerCpBefore: before,
    playerCpAfter: after,
    lossCp: Math.max(0, before - after),
  };
}

function game(id: string, outcome: "win" | "draw" | "loss", moves: AnalyzedMove[]): AnalyzedGame {
  return {
    id,
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
});
