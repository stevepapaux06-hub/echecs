import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../chess/types";
import { assessHumanQuality, isReferencePosition } from "./human-quality";
import { decideSequence } from "./sequence";
import { CONCEPT_HOLDOUT } from "../patterns/concept-holdout";

const base: TrainingExercise = {
  id: "holdout", fen: CONCEPT_HOLDOUT[0].fen, bestMove: "a1d1", type: "strategy", category: "strategy", origin: "concept",
  mode: "one-move", phase: "middlegame", playerColor: "white", conceptSlug: "open_file", theme: "open_file", title: "", prompt: "",
  sourceLabel: "manual regression", baselinePlayerCp: 20, maxPlayerMoves: 1, concept: "Colonne d vers d6", difficulty: 1300,
  pedagogicalUnit: "single_move",
};
const outcome = { source: "stockfish_wdl" as const, root: "tenable" as const, after: "tenable" as const, lossPermille: 20 };
const lines = [
  { uci: "a1d1", playerCp: 20, pv: ["a1d1"] },
  { uci: "a1b1", playerCp: -30, pv: ["a1b1"] },
  { uci: "f1e1", playerCp: -50, pv: ["f1e1"] },
];
describe("non-compensable human training gates", () => {
  it("accepts an evidenced small strategic decision", () => {
    expect(assessHumanQuality(base, { outcome, lines }).exerciseability).toBe(true);
  });
  it("keeps a nonexercise as a reference, never as Training", () => {
    const bad = { ...base, fen: CONCEPT_HOLDOUT[1].fen, bestMove: "d1d2" };
    expect(isReferencePosition(bad)).toBe(true);
    expect(assessHumanQuality(bad, { outcome, lines }).failedGates).toContain("causality");
  });
  it("rejects -6 to -4 despite every pedagogical score", () => {
    const bad = { ...base, category: "defense" as const, baselinePlayerCp: -600 };
    const result = assessHumanQuality(bad, { outcome: { source: "syzygy", root: "loss", after: "loss" }, lines: lines.map((l) => ({ ...l, playerCp: -400 })) });
    expect(result.exerciseability).toBe(false); expect(result.failedGates).toContain("outcome");
  });
  it("rejects mechanical +8 conversion", () => {
    expect(assessHumanQuality({ ...base, category: "conversion", baselinePlayerCp: 800 }, { outcome }).failedGates).toContain("outcome");
  });
  it("rejects routine queen exchange and recapture", () => {
    const queen = { ...base, fen: "4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1", bestMove: "d1d2" };
    expect(assessHumanQuality(queen, { outcome, previousMove: "d8d2" }).failedGates).toContain("triviality");
  });
  it("does not manufacture a strategic sequence from an arbitrary PV", () => {
    expect(assessHumanQuality({ ...base, pedagogicalUnit: "short_plan_sequence", solutionLine: ["a1d1"] }, { outcome, lines }).failedGates).toContain("sequence");
  });
  it("does not declare an endgame method from +3.5 or a move counter", () => {
    const ending: TrainingExercise = { ...base, type: "endgame", category: "endgame", pedagogicalUnit: "theoretical_method", maxPlayerMoves: 2,
      pedagogicalMilestone: { kind: "promotion", proof: "structural", minimumPlayerMoves: 1 }, fen: "7k/8/8/3P4/8/8/8/K7 w - - 0 1" };
    expect(decideSequence({ exercise: ending, playerMoves: 9, afterPlayerCp: 350, decisionLossCp: 0, totalLossCp: 0,
      isGameOver: false, isCheckmate: false, promoted: false, captured: false, afterFen: ending.fen }).finished).toBe(false);
    expect(decideSequence({ exercise: ending, playerMoves: 10, afterPlayerCp: 350, decisionLossCp: 0, totalLossCp: 0,
      isGameOver: false, isCheckmate: false, promoted: true, captured: false, afterFen: "3Q3k/8/8/8/8/8/8/K7 b - - 0 10" }).result).toBe("success");
  });
});
