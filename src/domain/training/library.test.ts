import { Chess, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import { allConceptExercises } from "./library";

describe("curated training library", () => {
  it("contains legal positions and legal reference moves", () => {
    for (const exercise of allConceptExercises()) {
      const chess = new Chess(exercise.fen);
      expect(() => chess.move({
        from: exercise.bestMove.slice(0, 2) as Square,
        to: exercise.bestMove.slice(2, 4) as Square,
        promotion: exercise.bestMove.slice(4, 5) || "q",
      }), exercise.id).not.toThrow();
    }
  });

  it("contains genuinely different multi-move tactic, endgame and conversion positions", () => {
    const exercises = allConceptExercises();
    expect(new Set(exercises.map((exercise) => exercise.fen)).size).toBe(exercises.length);
    expect(exercises.some((exercise) => exercise.category === "tactic" && exercise.mode === "line")).toBe(true);
    expect(exercises.some((exercise) => exercise.category === "endgame" && exercise.mode === "playout")).toBe(true);
    expect(exercises.some((exercise) => exercise.category === "conversion" && exercise.mode === "playout")).toBe(true);
  });
});

