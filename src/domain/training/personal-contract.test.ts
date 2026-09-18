import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { AnalyzedMove, EngineEvaluation } from "../chess/types";
import { assessPersonalExercise, estimatePedagogicalDifficulty } from "./personal-contract";

const FEN = "4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1";
const AFTER = "4k3/8/8/8/8/8/3q4/3Q1K2 b - - 1 1";

function evaluation(fen: string, lines: Array<{ cp: number; pv: string[] }>): EngineEvaluation {
  const sideToMove = fen.includes(" w ") ? "w" : "b";
  return {
    fen,
    sideToMove,
    whiteCp: lines[0].cp,
    bestMove: lines[0].pv[0],
    depth: 10,
    lines: lines.map((line, index) => ({
      multipv: index + 1,
      depth: 10,
      rawScore: { type: "cp", value: sideToMove === "w" ? line.cp : -line.cp },
      whiteScore: { type: "cp", value: line.cp },
      whiteCp: line.cp,
      pv: line.pv,
    })),
    debug: { fen, sideToMove, requestedDepth: 10, reachedDepth: 10, bestMove: lines[0].pv[0], lines: [] },
  };
}

function candidate(afterCp = -300, conceptSlug = "loose_piece"): AnalyzedMove {
  return {
    ply: 17,
    san: "Kf1",
    uci: "e1f1",
    from: "e1",
    to: "f1",
    color: "w",
    fenBefore: FEN,
    fenAfter: AFTER,
    phase: "middlegame",
    before: evaluation(FEN, [
      { cp: 100, pv: ["d1d2", "e8f7", "d2d7"] },
      { cp: 80, pv: ["d1c1", "d2d1"] },
      { cp: 20, pv: ["e1f1", "d2d1"] },
    ]),
    after: evaluation(AFTER, [{ cp: afterCp, pv: ["d2d1"] }]),
    playerCpBefore: 100,
    playerCpAfter: afterCp,
    lossCp: Math.max(0, 100 - afterCp),
    patterns: [{
      conceptSlug: conceptSlug as "loose_piece",
      fen: FEN,
      ply: 17,
      confidence: 0.94,
      opportunity: true,
      success: false,
      source: "pattern_engine_stockfish_validated",
      moveUci: "d1d2",
    }],
    pedagogical: {
      beforeState: "slightly_better",
      afterState: afterCp >= 65 ? "slightly_better" : "losing",
      score: 95,
      kind: "collapse",
      reliablePatternConfidence: 0.94,
      worthy: true,
    },
  };
}

describe("personal pedagogical contract", () => {
  it("accepts both the demonstrated mechanism and an objectively equivalent human plan", () => {
    const decision = assessPersonalExercise(candidate(-300));
    expect(decision.eligible).toBe(true);
    expect(decision.personalReason).toBe("ERROR");
    expect(decision.conceptRole).toBe("PRIMARY");
    expect(decision.answerContract?.accepted.map((answer) => answer.moveUci))
      .toEqual(["d1d2", "d1c1"]);
    expect(decision.answerContract?.accepted[1].reason).toBe("equivalent_human_plan");
  });

  it("does not create a corrective exercise when the played move is equivalent", () => {
    const decision = assessPersonalExercise(candidate(80));
    expect(decision).toMatchObject({
      eligible: false,
      terminalReason: "ABSTAINED",
      reasons: ["played_move_already_best_or_equivalent"],
    });
  });

  it("keeps a sub-pawn inaccuracy as context instead of an assertive correction", () => {
    const decision = assessPersonalExercise(candidate(10));
    expect(decision).toMatchObject({
      eligible: false,
      terminalReason: "ABSTAINED",
      reasons: ["objective_cost_below_personal_lesson_threshold"],
    });
  });

  it("requires stronger objective evidence for a stable pattern without a state transition", () => {
    const move = candidate(-20);
    move.pedagogical = { ...move.pedagogical!, kind: "stable_pattern" };
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: false,
      terminalReason: "ABSTAINED",
      reasons: ["stable_pattern_cost_below_threshold"],
    });
  });

  it("requires MultiPV evidence instead of silently publishing top-1", () => {
    const move = candidate(-300);
    move.before = evaluation(FEN, [{ cp: 100, pv: ["d1d2", "e8f7"] }]);
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: false,
      terminalReason: "ANSWER_AMBIGUITY",
      reasons: ["multipv_alternatives_missing"],
    });
  });

  it("abstains when the adaptive MultiPV ranking stays unstable", () => {
    const move = candidate(-300);
    move.multiPvStability = {
      status: "unstable",
      analyzedDepths: [10, 12, 14],
      bestMoves: ["d1d2", "e1f1", "d1d2"],
      acceptedMoveUcis: [],
      maxDepthReached: 14,
      budgetExhausted: true,
    };
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: false,
      terminalReason: "ANSWER_AMBIGUITY",
      reasons: ["multipv_ranking_unstable"],
    });
  });

  it("accepts a cross-depth equivalent plan outside the static cp band", () => {
    const move = candidate(-300);
    move.before = evaluation(FEN, [
      { cp: 100, pv: ["d1d2"] },
      { cp: 80, pv: ["d1c1"] },
      { cp: 20, pv: ["e1e2"] },
      { cp: -100, pv: ["e1f1"] },
    ]);
    move.multiPvStability = {
      status: "multi_plan",
      analyzedDepths: [10, 12],
      bestMoves: ["d1d2", "e1e2"],
      acceptedMoveUcis: ["d1d2", "e1e2"],
      maxDepthReached: 12,
      budgetExhausted: false,
    };
    const decision = assessPersonalExercise(move);
    expect(decision.answerContract?.accepted.map((answer) => answer.moveUci))
      .toContain("e1e2");
    expect(decision.answerContract?.stability?.status).toBe("multi_plan");
  });

  it("recovers a concrete motif supported by two serious engine plans", () => {
    const fen = "k7/8/r1r1q1q1/8/8/3N4/8/7K w - - 0 1";
    const board = new Chess(fen);
    board.move("Kh2");
    const move: AnalyzedMove = {
      ...candidate(-300),
      fenBefore: fen,
      fenAfter: board.fen(),
      uci: "h1h2",
      from: "h1",
      to: "h2",
      before: evaluation(fen, [
        { cp: 100, pv: ["d3f4"] },
        { cp: 80, pv: ["d3b4"] },
        { cp: -120, pv: ["h1h2"] },
      ]),
      after: evaluation(board.fen(), [{ cp: -300, pv: ["a6d3"] }]),
      playerCpBefore: 100,
      playerCpAfter: -300,
      lossCp: 400,
      patterns: [],
    };
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: true,
      conceptSlug: "fork",
      conceptRole: "PRIMARY",
    });
  }, 10_000);

  it("rejects a geometrical fork when the principal reply captures the forking piece", () => {
    const fen = "rnbq1rk1/1pp2pbp/p4np1/3p2B1/P2P4/1QN1P3/1P3PPP/R3KBNR w KQ - 2 9";
    const board = new Chess(fen);
    board.move({ from: "e1", to: "c1" });
    const move: AnalyzedMove = {
      ...candidate(-100, "fork"),
      fenBefore: fen,
      fenAfter: board.fen(),
      uci: "e1c1",
      from: "e1",
      to: "c1",
      before: evaluation(fen, [
        { cp: 62, pv: ["g5f6", "d8f6", "c3d5"] },
        { cp: 54, pv: ["g1f3", "b8c6"] },
        { cp: 32, pv: ["f1e2", "c7c5"] },
      ]),
      after: evaluation(board.fen(), [{ cp: -100, pv: ["c7c6"] }]),
      playerCpBefore: 62,
      playerCpAfter: -100,
      lossCp: 162,
      patterns: [{
        conceptSlug: "fork",
        fen,
        ply: 17,
        confidence: 0.95,
        opportunity: true,
        success: false,
        source: "pattern_engine_stockfish_validated",
        moveUci: "g5f6",
      }],
      pedagogical: {
        beforeState: "equal",
        afterState: "slightly_worse",
        score: 74,
        kind: "stable_pattern",
        reliablePatternConfidence: 0.95,
        worthy: true,
      },
    };
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: false,
      terminalReason: "CONCEPT_CONFLICT",
      reasons: ["detected_signal_not_proven_by_engine_alternatives"],
    });
  });

  it("keeps a capture-first fork sequence when two serious plans prove it", () => {
    const fen = "r1k2b1r/1pp1pP2/p2q2p1/4nb1p/1n1p1Q2/NB1P3P/PPPB1PP1/R3K1NR b KQ - 4 15";
    const board = new Chess(fen);
    board.move({ from: "a6", to: "a5" });
    const move: AnalyzedMove = {
      ...candidate(-112),
      fenBefore: fen,
      fenAfter: board.fen(),
      color: "b",
      uci: "a6a5",
      from: "a6",
      to: "a5",
      before: evaluation(fen, [
        { cp: -389, pv: ["e5d3", "c2d3", "b4d3"] },
        { cp: -371, pv: ["b4d3", "c2d3", "e5d3"] },
        { cp: 57, pv: ["c8d7", "e1d1"] },
      ]),
      after: evaluation(board.fen(), [{ cp: 112, pv: ["e1d1"] }]),
      playerCpBefore: 389,
      playerCpAfter: -112,
      lossCp: 501,
      patterns: [],
      pedagogical: {
        beforeState: "winning",
        afterState: "slightly_worse",
        score: 100,
        kind: "conversion",
        reliablePatternConfidence: 0,
        worthy: true,
      },
    };
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: true,
      conceptSlug: "fork",
      conceptRole: "PRIMARY",
    });
  }, 10_000);

  it("does not relabel a favorable position as defense", () => {
    const move = candidate(-300, "active_defense");
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: false,
      terminalReason: "CONCEPT_CONFLICT",
    });
  });

  it("does not teach an incidental fork when promotion is the real mechanism", () => {
    const fen = "k6r/6P1/8/8/8/8/8/4K3 w - - 0 1";
    const after = "k6r/6P1/8/8/8/8/4K3/8 b - - 1 1";
    const move: AnalyzedMove = {
      ...candidate(-100, "fork"),
      uci: "e1e2",
      from: "e1",
      to: "e2",
      fenBefore: fen,
      fenAfter: after,
      phase: "endgame",
      before: evaluation(fen, [
        { cp: 200, pv: ["g7g8q", "a8b7"] },
        { cp: 120, pv: ["g7h8q", "a8b7"] },
      ]),
      after: evaluation(after, [{ cp: -100, pv: ["h8g8"] }]),
      playerCpBefore: 200,
      playerCpAfter: -100,
      lossCp: 300,
      patterns: [{
        conceptSlug: "fork",
        fen,
        ply: 17,
        confidence: 0.94,
        opportunity: true,
        success: false,
        source: "pattern_engine_stockfish_validated",
        moveUci: "g7g8q",
      }],
    };
    expect(assessPersonalExercise(move)).toMatchObject({
      eligible: false,
      terminalReason: "CONCEPT_CONFLICT",
      reasons: ["promotion_is_primary_mechanism"],
    });
  });

  it("estimates pedagogical difficulty without using the player rating", () => {
    const move = candidate(-300);
    const decision = assessPersonalExercise(move);
    expect(estimatePedagogicalDifficulty(move, decision)).toBe(estimatePedagogicalDifficulty({ ...move }, decision));
    expect(estimatePedagogicalDifficulty(move, decision)).toBeGreaterThanOrEqual(800);
  });
});
