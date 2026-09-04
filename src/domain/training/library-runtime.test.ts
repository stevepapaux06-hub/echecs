import { describe, expect, it } from "vitest";
import * as source from "./library";
import * as runtime from "./library-runtime";

describe("precompiled browser bank", () => {
  it("preserves every active exercise, solution, annotation and assessment", () => {
    expect(runtime.allConceptExercises()).toEqual(source.allConceptExercises());
    expect(runtime.currentTrainingPool(source.referenceBank())).toEqual(source.currentTrainingPool(source.referenceBank()));
  });
  it("preserves same-concept transfer and difficulty ordering", () => {
    for (const concept of ["fork", "open_file", "opposition", "conversion", "forcing_moves"])
      for (const rating of [undefined, 800, 1200, 1800]) {
        expect(runtime.conceptExercisesForSlug(concept, 12, rating))
          .toEqual(source.conceptExercisesForSlug(concept, 12, rating));
        expect(runtime.conceptExercisesFor("strategy", concept, 12, rating))
          .toEqual(source.conceptExercisesFor("strategy", concept, 12, rating));
      }
  });
});
