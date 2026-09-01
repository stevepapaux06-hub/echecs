import { describe, expect, it } from "vitest";
import { aggregateGameAnalysisSummaries, type GameAnalysisSummary } from "./repository";

function summary(gameKey: string, opportunities = 1, successes = 0): GameAnalysisSummary {
  return {
    version: 1,
    gameKey,
    concepts: [{ conceptSlug: "fork", opportunities, successes }],
  };
}

describe("cumulative game pattern profile", () => {
  it("aggregates well beyond one 100-game analysis", () => {
    const totals = aggregateGameAnalysisSummaries(
      Array.from({ length: 200 }, (_, index) => summary(`chesscom:game-${index}`, 2, 1)),
    );
    expect(totals.get("fork")).toEqual({ opportunities: 400, successes: 200 });
  });

  it("never counts the same stable game key twice", () => {
    const totals = aggregateGameAnalysisSummaries([
      summary("chesscom:42", 2, 1),
      summary("chesscom:42", 2, 1),
      summary("chesscom:43", 3, 2),
    ]);
    expect(totals.get("fork")).toEqual({ opportunities: 5, successes: 3 });
  });
});
