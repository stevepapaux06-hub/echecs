import { Chess, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import { allConceptExercises } from "./library";

describe("curated training library", () => {
  it("contains legal positions and legal reference moves", () => {
    for (const exercise of allConceptExercises()) {
      const chess = new Chess(exercise.fen);
      const line = exercise.solutionLine ?? [exercise.bestMove];
      for (const uci of line) {
        expect(() => chess.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci.slice(4, 5) || "q",
        }), `${exercise.id}: ${uci}`).not.toThrow();
      }
    }
  });

  it("contains genuinely different multi-move tactic, endgame and conversion positions", () => {
    const exercises = allConceptExercises();
    expect(new Set(exercises.map((exercise) => exercise.fen)).size).toBe(exercises.length);
    expect(exercises.some((exercise) => exercise.category === "tactic" && exercise.mode === "line")).toBe(true);
    expect(exercises.some((exercise) => exercise.category === "endgame" && exercise.mode === "playout")).toBe(true);
    expect(exercises.some((exercise) => exercise.category === "conversion" && exercise.mode === "playout")).toBe(true);
    expect(exercises.filter((exercise) => exercise.category === "tactic").length).toBeGreaterThanOrEqual(2);
    expect(exercises.filter((exercise) => exercise.category === "endgame").length).toBeGreaterThanOrEqual(2);
    expect(exercises.filter((exercise) => exercise.category === "conversion").length).toBeGreaterThanOrEqual(2);
  });
});
