import { describe, expect, it } from "vitest";
import * as source from "./library";
import * as runtime from "./library-runtime";
import { runtimeBankFingerprint } from "./runtime-bank-fingerprint";

describe("precompiled browser bank", { timeout: 300_000 }, () => {
  it("has the exact count and fingerprint of the final publishable bank", () => {
    const sourceBank = source.allConceptExercises();
    const runtimeBank = runtime.allConceptExercises();
    expect(runtime.RUNTIME_BANK_MANIFEST).toEqual({
      count: sourceBank.length,
      fingerprint: runtimeBankFingerprint(sourceBank),
    });
    expect(runtime.RUNTIME_BANK_MANIFEST.count).toBe(runtimeBank.length);
    expect(runtime.RUNTIME_BANK_MANIFEST.fingerprint).toBe(runtimeBankFingerprint(runtimeBank));
  });
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
  it("serves only exact concepts or declared pedagogical fallbacks", () => {
    expect(runtime.resolveConceptExercises("endgame-rook", 2).resolution).toMatchObject({
      requestedConcept: "rook_endgame",
      servedConcept: "rook_endgame",
      relation: "exact",
    });
    expect(runtime.resolveConceptExercises("defense", 2).resolution).toMatchObject({
      requestedConcept: "defense",
      servedConcept: "defensive_resource",
      relation: "declared_fallback",
    });
    expect(runtime.resolveConceptExercises("unmapped-theme", 2)).toMatchObject({
      exercises: [],
      resolution: { relation: "unavailable", servedConcept: null },
    });
  });
});
