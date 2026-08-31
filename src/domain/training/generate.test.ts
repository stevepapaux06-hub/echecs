import { describe, expect, it } from "vitest";
import type { AnalyzedGame, DiagnosticMetrics, EngineEvaluation } from "@/domain/chess/types";
import { filterLostPositionCascade, generateExercises } from "./generate";

describe("lost-position cascade filter", () => {
  it("keeps the first collapse and suppresses its consequences", () => {
    const moves = [
      { id: "first", playerCpBefore: 0, playerCpAfter: -300 },
      { id: "second", playerCpBefore: -300, playerCpAfter: -700 },
      { id: "third", playerCpBefore: -700, playerCpAfter: -1_200 },
    ];
    expect(filterLostPositionCascade(moves).map((move) => move.id)).toEqual(["first"]);
  });

  it("re-arms when a genuine defensive resource restores a playable position", () => {
    const moves = [
      { id: "collapse", playerCpBefore: 0, playerCpAfter: -300 },
      { id: "consequence", playerCpBefore: -500, playerCpAfter: -700 },
      { id: "saved", playerCpBefore: -120, playerCpAfter: -500 },
    ];
    expect(filterLostPositionCascade(moves).map((move) => move.id)).toEqual(["collapse", "saved"]);
  });
});

function evaluation(fen: string, whiteCp: number, pv: string[]): EngineEvaluation {
  const sideToMove = fen.split(" ")[1] as "w" | "b";
  return {
    fen,
    sideToMove,
    whiteCp,
    bestMove: pv[0],
    depth: 10,
    lines: [{
      multipv: 1,
      depth: 10,
      rawScore: { type: "cp", value: sideToMove === "w" ? whiteCp : -whiteCp },
      whiteScore: { type: "cp", value: whiteCp },
      whiteCp,
      pv,
    }],
    debug: { fen, sideToMove, requestedDepth: 10, reachedDepth: 10, bestMove: pv[0], lines: [] },
  };
}

describe("personal exercise generation", () => {
  it("starts just before the personal error and keeps a full good continuation", () => {
    const fen = "4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1";
    const afterFen = "4k3/8/8/8/8/8/3q4/3Q1K2 b - - 1 1";
    const game: AnalyzedGame = {
      id: "game-42",
      source: "chesscom",
      rawPgn: "",
      playedAt: 0,
      timeClass: "rapid",
      timeControl: "600",
      rated: true,
      playerColor: "white",
      playerRating: 1300,
      opponent: "Camille",
      opponentRating: 1320,
      outcome: "loss",
      moves: [],
      analyzedMoves: [{
        ply: 17,
        san: "Kf1",
        uci: "e1f1",
        from: "e1",
        to: "f1",
        color: "w",
        fenBefore: fen,
        fenAfter: afterFen,
        phase: "middlegame",
        before: evaluation(fen, 100, ["d1d2", "e8f7", "d2d7"]),
        after: evaluation(afterFen, -300, ["d2d1", "f1f2"]),
        playerCpBefore: 100,
        playerCpAfter: -300,
        lossCp: 400,
      }],
    };
    const theme = {
      id: "loose-pieces",
      category: "tactic" as const,
      title: "Pièces non protégées",
      summary: "",
      confidence: "medium" as const,
      sampleSize: 3,
      issueCount: 2,
      evidence: [],
      positionIds: ["game-42:17"],
    };
    const metrics: DiagnosticMetrics = {
      gamesAnalyzed: 1,
      positionsAnalyzed: 1,
      importantErrors: 1,
      importantErrorsPerGame: 1,
      conversionOpportunities: 0,
      convertedWins: 0,
      conversionRate: null,
      averageWinningRetention: null,
      defenseOpportunities: 0,
      recoveredPositions: 0,
      savedGames: 0,
      defenseRecoveryRate: null,
      phaseMetrics: [],
      priority: "middlegame",
      priorityTitle: "Tactique",
      prioritySummary: "",
      strengths: [],
      weaknesses: [],
      focusItems: [],
      themes: [theme],
      primaryTheme: theme,
    };

    const personal = generateExercises([game], metrics)[0];
    expect(personal.origin).toBe("personal");
    expect(personal.fen).toBe(fen);
    expect(personal.sourceLabel).toBe("Ta partie contre Camille");
    expect(personal.gameUrl).toBeUndefined();
    expect(personal.mode).toBe("line");
    expect(personal.maxPlayerMoves).toBe(2);
    expect(personal.solutionLine).toEqual(["d1d2", "e8f7", "d2d7"]);
  });
});
