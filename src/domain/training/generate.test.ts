import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { AnalyzedGame, DiagnosticMetrics, EngineEvaluation } from "@/domain/chess/types";
import {
  filterLostPositionCascade,
  generateExercises,
  isPedagogicallyEligiblePersonalMove,
} from "./generate";

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

  it("keeps a genuine recovery even when it starts from a lost position", () => {
    const moves = [
      { id: "collapse", playerCpBefore: 0, playerCpAfter: -350 },
      { id: "resource", playerCpBefore: -350, playerCpAfter: -100 },
    ];
    expect(filterLostPositionCascade(moves).map((move) => move.id)).toEqual(["collapse", "resource"]);
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
  it("rejects a personal position that was already clearly lost", () => {
    const fen = "4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1";
    const afterFen = "4k3/8/8/8/8/8/3q4/3Q1K2 b - - 1 1";
    expect(isPedagogicallyEligiblePersonalMove({
      ply: 17,
      san: "Kf1",
      uci: "e1f1",
      from: "e1",
      to: "f1",
      color: "w",
      fenBefore: fen,
      fenAfter: afterFen,
      phase: "middlegame",
      before: evaluation(fen, -800, ["d1d2"]),
      after: evaluation(afterFen, -1_100, ["d2d1"]),
      playerCpBefore: -800,
      playerCpAfter: -1_100,
      lossCp: 300,
      patterns: [{
        conceptSlug: "loose_piece",
        fen,
        ply: 17,
        confidence: 0.95,
        opportunity: true,
        success: false,
        source: "pattern_engine_stockfish_validated",
        moveUci: "d1d2",
      }],
      pedagogical: {
        beforeState: "clearly_lost",
        afterState: "clearly_lost",
        score: 90,
        kind: "stable_pattern",
        reliablePatternConfidence: 0.95,
        worthy: true,
      },
    })).toBe(false);
  });

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
        patterns: [{
          conceptSlug: "loose_piece",
          fen,
          ply: 17,
          confidence: 0.94,
          opportunity: true,
          success: false,
          source: "pattern_engine_stockfish_validated",
          moveUci: "d1d2",
        }],
        pedagogical: {
          beforeState: "slightly_better",
          afterState: "losing",
          score: 95,
          kind: "collapse",
          reliablePatternConfidence: 0.94,
          worthy: true,
        },
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

  it("keeps a reserve larger than one loaded training batch", () => {
    const base = (() => {
      const fen = "4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1";
      return {
        ply: 17,
        san: "Kf1",
        uci: "e1f1",
        from: "e1",
        to: "f1",
        color: "w" as const,
        fenBefore: fen,
        fenAfter: "4k3/8/8/8/8/8/3q4/3Q1K2 b - - 1 1",
        phase: "middlegame" as const,
        before: evaluation(fen, 100, ["d1d2", "e8f7", "d2d7"]),
        after: evaluation("4k3/8/8/8/8/8/3q4/3Q1K2 b - - 1 1", -300, ["d2d1"]),
        playerCpBefore: 100,
        playerCpAfter: -300,
        lossCp: 400,
        pedagogical: {
          beforeState: "slightly_better" as const,
          afterState: "losing" as const,
          score: 95,
          kind: "collapse" as const,
          reliablePatternConfidence: 0,
          worthy: true,
        },
      };
    })();
    const game = {
      id: "reserve-game",
      source: "pgn" as const,
      rawPgn: "",
      playedAt: 0,
      timeClass: "rapid",
      timeControl: "600",
      rated: false,
      playerColor: "white" as const,
      playerRating: 1300,
      opponent: "Test",
      opponentRating: 1300,
      outcome: "loss" as const,
      moves: [],
      analyzedMoves: Array.from({ length: 12 }, (_, index) => ({
        ...base,
        ply: 17 + index * 2,
        fenBefore: base.fenBefore.replace("0 1", `${index} ${index + 1}`),
      })),
    };
    const theme = {
      id: "stability",
      category: "tactic" as const,
      title: "Stabilité",
      summary: "",
      confidence: "medium" as const,
      sampleSize: 12,
      issueCount: 12,
      evidence: [],
      positionIds: [],
    };
    const metrics = {
      gamesAnalyzed: 1,
      positionsAnalyzed: 12,
      importantErrors: 12,
      importantErrorsPerGame: 12,
      conversionOpportunities: 0,
      convertedWins: 0,
      conversionRate: null,
      averageWinningRetention: null,
      defenseOpportunities: 0,
      recoveredPositions: 0,
      savedGames: 0,
      defenseRecoveryRate: null,
      phaseMetrics: [],
      priority: "stability" as const,
      priorityTitle: "Stabilité",
      prioritySummary: "",
      strengths: [],
      weaknesses: [],
      focusItems: [],
      themes: [theme],
      primaryTheme: theme,
    };
    expect(generateExercises([game], metrics).filter((exercise) => exercise.origin === "personal").length)
      .toBeGreaterThan(7);
  });

  it("keeps an equal middlegame strategy position without a large engine drop", () => {
    const fen = "r2q1rk1/pp1nbppp/2p1pn2/8/8/2N1PN2/PPQ1BPPP/R4RK1 w - - 2 13";
    const after = new Chess(fen);
    after.move("h3");
    const game: AnalyzedGame = {
      id: "quiet-strategy",
      source: "pgn",
      rawPgn: "",
      playedAt: 0,
      timeClass: "rapid",
      timeControl: "600",
      rated: false,
      playerColor: "white",
      playerRating: 1_300,
      opponent: "Plan",
      opponentRating: 1_300,
      outcome: "draw",
      moves: [],
      analyzedMoves: [{
        ply: 25,
        san: "h3",
        uci: "h2h3",
        from: "h2",
        to: "h3",
        color: "w",
        fenBefore: fen,
        fenAfter: after.fen(),
        phase: "middlegame",
        before: evaluation(fen, 0, ["a1d1", "d8c7"]),
        after: evaluation(after.fen(), 0, ["d8c7"]),
        playerCpBefore: 0,
        playerCpAfter: 0,
        lossCp: 0,
        patterns: [{
          conceptSlug: "open_file",
          fen,
          ply: 25,
          confidence: 0.92,
          opportunity: true,
          success: false,
          source: "pattern_engine_stockfish_validated",
          moveUci: "a1d1",
        }],
        pedagogical: {
          beforeState: "equal",
          afterState: "equal",
          score: 73,
          kind: "stable_pattern",
          reliablePatternConfidence: 0.92,
          worthy: true,
        },
      }],
    };
    const theme = {
      id: "fork",
      category: "tactic" as const,
      title: "Fourchette",
      summary: "",
      confidence: "low" as const,
      sampleSize: 1,
      issueCount: 1,
      evidence: [],
      positionIds: [],
    };
    const metrics: DiagnosticMetrics = {
      gamesAnalyzed: 1,
      positionsAnalyzed: 1,
      importantErrors: 0,
      importantErrorsPerGame: 0,
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
      priorityTitle: "Fourchette",
      prioritySummary: "",
      strengths: [],
      weaknesses: [],
      focusItems: [],
      themes: [theme],
      primaryTheme: theme,
    };
    const strategy = generateExercises([game], metrics).find((exercise) => exercise.origin === "personal");
    expect(strategy).toMatchObject({
      conceptSlug: "open_file",
      category: "strategy",
      phase: "middlegame",
      baselinePlayerCp: 0,
    });
    expect(strategy?.explanation?.focus).toContain("tour");
  });
});
