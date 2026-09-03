import { describe, expect, it } from "vitest";
import { causalFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "./concept-specifications";
import { CONCEPT_HOLDOUT } from "./concept-holdout";
import { detectMovePatterns } from "./engine";

describe("independent geometric concept holdout", () => {
  for (const sample of CONCEPT_HOLDOUT) it(`${sample.id}: ${sample.reason}`, () => {
    const features = causalFeatures(sample.fen, sample.move)!;
    expect(features).not.toBeNull();
    expect(matchesConceptSpecification(sample.concept, features)).toBe(sample.positive);
    expect(detectMovePatterns(sample.fen, sample.move).some((p) => p.conceptSlug === sample.concept)).toBe(sample.positive);
  });
  it("keeps operational specifications explicit and distinct", () => {
    expect(Object.keys(CONCEPT_SPECIFICATIONS).length).toBeGreaterThan(20);
    for (const spec of Object.values(CONCEPT_SPECIFICATIONS)) {
      expect(spec.necessary_signals.length).toBeGreaterThan(0);
      expect(spec.hard_negatives.length).toBeGreaterThan(0);
      expect(spec.human_decision_criteria.length).toBeGreaterThan(0);
      expect(spec.sequence_termination_condition).toBe(spec.necessary_signals[0]);
    }
  });
});
