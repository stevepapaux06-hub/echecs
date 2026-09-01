import { Chess, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import { allConceptExercises, conceptExercisesFor } from "./library";

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

  it("selects the exact weakness slug and adapts rating when choices exist", () => {
    const selected = conceptExercisesFor("tactic", "fork", 5, 1_500);
    expect(selected).toHaveLength(5);
    expect(selected.every((exercise) => exercise.conceptSlug === "fork")).toBe(true);
    const rated = selected.filter((exercise) => exercise.difficulty !== undefined);
    expect(rated.length).toBeGreaterThan(1);
    const distances = rated.map((exercise) => Math.abs((exercise.difficulty ?? 0) - 1_500));
    expect(distances).toEqual([...distances].toSorted((a, b) => a - b));
  });

  it("ships a varied verified offline Lichess bank", () => {
    const lichess = allConceptExercises().filter((exercise) => exercise.source === "lichess");
    expect(lichess).toHaveLength(2_520);
    const concepts = new Set(lichess.map((exercise) => exercise.conceptSlug));
    for (const concept of ["fork", "pin", "skewer", "loose_piece", "remove_defender", "opponent_threat", "passed_pawn"]) {
      expect(concepts.has(concept)).toBe(true);
    }
    expect(lichess.every((exercise) => exercise.isVerified && exercise.sourceId && exercise.difficulty)).toBe(true);
    expect(lichess.filter((exercise) => exercise.category === "endgame")
      .every((exercise) => exercise.phase === "endgame")).toBe(true);
  });
});
