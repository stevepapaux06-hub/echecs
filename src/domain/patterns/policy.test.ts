import { describe, expect, it } from "vitest";
import {
  isPatternProductEligible,
  PILOT_PRODUCT_POLICY,
} from "./policy";

describe("Pattern Engine product policy boundaries", () => {
  const acceptedBoundary = {
    confidence: PILOT_PRODUCT_POLICY.minimumConceptConfidence,
    pedagogicalPromotionScore: PILOT_PRODUCT_POLICY.thresholdsByConcept.open_file,
    productDisplayThreshold: PILOT_PRODUCT_POLICY.thresholdsByConcept.open_file,
    productEligible: true,
  };

  it("accepts the exact pilot confidence and display boundaries", () => {
    expect(isPatternProductEligible(acceptedBoundary)).toBe(true);
  });

  it("rejects either axis immediately below policy", () => {
    expect(isPatternProductEligible({ ...acceptedBoundary, confidence: 0.659 })).toBe(false);
    expect(isPatternProductEligible({ ...acceptedBoundary, pedagogicalPromotionScore: 0.619 })).toBe(false);
  });

  it("uses the documented compatibility gate only for legacy evidence", () => {
    expect(isPatternProductEligible({ confidence: 0.8 })).toBe(true);
    expect(isPatternProductEligible({ confidence: 0.799 })).toBe(false);
  });

  it("keeps persisted pilot occurrences whose first release dropped score metadata", () => {
    expect(isPatternProductEligible({ conceptSlug: "open_file", confidence: 0.66 })).toBe(true);
    expect(isPatternProductEligible({ conceptSlug: "open_file", confidence: 0.659 })).toBe(false);
  });
});
