import { describe, expect, it } from "vitest";
import { allConceptExercises } from "./library";
import { trainingPoolForFilter } from "./session";
import { trainingTaxonomy, withTrainingTaxonomy } from "./taxonomy";

describe("strict training taxonomy", () => {
  it("does not call a middlegame an endgame merely because it contains a passed pawn", () => {
    const base = allConceptExercises().find((exercise) => exercise.conceptSlug === "fork")!;
    const mislabeled = withTrainingTaxonomy({
      ...base,
      id: "mislabeled-passed-pawn",
      phase: "middlegame" as const,
      category: "endgame" as const,
      domain: "endgame" as const,
      conceptSlug: "passed_pawn",
      primaryConcept: "passed_pawn",
      classificationConfidence: 0.95,
    });

    expect(trainingTaxonomy(mislabeled)).toMatchObject({
      phase: "middlegame",
      domain: "strategy",
      primaryConcept: "passed_pawn",
      confidence: 0.55,
    });
    expect(trainingPoolForFilter([mislabeled], "endgame")).toEqual([]);
  });

  it("keeps bank endgames limited to positions whose phase is really endgame", () => {
    const endgames = trainingPoolForFilter(allConceptExercises(), "endgame", "bank");
    expect(endgames.length).toBeGreaterThan(2);
    expect(endgames.every((exercise) => exercise.phase === "endgame")).toBe(true);
  });
});
