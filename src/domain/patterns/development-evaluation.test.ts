import { describe, expect, it } from "vitest";
import {
  COUNTERFACTUAL_RESULTS,
  DEVELOPMENT_REFERENCE_RESULTS,
  DEVELOPMENT_REFERENCE_SUMMARY,
  NATURAL_RELATION_RESULTS,
  NATURAL_GENERALIZATION_RESULTS,
  PRODUCT_THRESHOLD_SENSITIVITY,
  PROBE_RESULTS,
  REFERENCE_BANK_GAP_CANDIDATES,
  SEMANTIC_CONTRACT_MIGRATIONS,
} from "./development-evaluation";

describe("pilot development evaluation", () => {
  it("evaluates every A.1 reference while keeping unresolved items observable", () => {
    expect(DEVELOPMENT_REFERENCE_SUMMARY.total).toBe(22);
    expect(DEVELOPMENT_REFERENCE_SUMMARY.unresolvedObserved).toBe(9);
    expect(DEVELOPMENT_REFERENCE_RESULTS).toHaveLength(22);
    expect(DEVELOPMENT_REFERENCE_SUMMARY.falsePositive).toBe(0);
  });

  it("reports product-threshold sensitivity for clear, boundary and tactical groups", () => {
    expect(PRODUCT_THRESHOLD_SENSITIVITY.map((row) => row.threshold)).toEqual([0.55, 0.6, 0.62, 0.65, 0.7, 0.75, 0.8, 0.85]);
    expect(PRODUCT_THRESHOLD_SENSITIVITY.every((row) => row.clearPositive.total > 0)).toBe(true);
    expect(PRODUCT_THRESHOLD_SENSITIVITY.every((row) => row.boundary.total > 0)).toBe(true);
    expect(PRODUCT_THRESHOLD_SENSITIVITY.every((row) => row.tacticalCompetition.total > 0)).toBe(true);
    const low = PRODUCT_THRESHOLD_SENSITIVITY[0];
    const high = PRODUCT_THRESHOLD_SENSITIVITY.at(-1)!;
    expect(low.clearPositive.promoted).toBeGreaterThanOrEqual(high.clearPositive.promoted);
    expect(low.boundary.promoted).toBeGreaterThanOrEqual(high.boundary.promoted);
  });

  it("passes the two same-FEN causal direction checks", () => {
    expect(COUNTERFACTUAL_RESULTS).toHaveLength(2);
    expect(COUNTERFACTUAL_RESULTS.every((result) => result.sameInitialFen && result.directionConsistent)).toBe(true);
  });

  it("passes all declared invariance and causal-flip probes", () => {
    expect(PROBE_RESULTS).toHaveLength(3);
    expect(PROBE_RESULTS.every((probe) => probe.consistent)).toBe(true);
  });

  it("reports natural relation pairs without treating them as controlled gold", () => {
    expect(NATURAL_RELATION_RESULTS).toHaveLength(2);
    expect(NATURAL_RELATION_RESULTS.every((relation) => relation.distinctInitialFen)).toBe(true);
    expect(NATURAL_RELATION_RESULTS.every((relation) => relation.limitations.length > 0)).toBe(true);
  });

  it("runs before final annotation on five non-reference natural positions", () => {
    expect(NATURAL_GENERALIZATION_RESULTS).toHaveLength(5);
    expect(NATURAL_GENERALIZATION_RESULTS.every((result) => result.behaviorSatisfied)).toBe(true);
    expect(NATURAL_GENERALIZATION_RESULTS.every((result) => !result.sourceKey.includes("obs-"))).toBe(true);
  });

  it("turns newly observed error families into explicit reference-bank gaps", () => {
    expect(REFERENCE_BANK_GAP_CANDIDATES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(REFERENCE_BANK_GAP_CANDIDATES.map((gap) => gap.id)).size)
      .toBe(REFERENCE_BANK_GAP_CANDIDATES.length);
  });

  it("records the semi-open ontology migration instead of hiding it as a code regression", () => {
    expect(SEMANTIC_CONTRACT_MIGRATIONS).toEqual(["obs-open-file-a-c2d2", "obs-open-file-b-a1d1"]);
    for (const id of SEMANTIC_CONTRACT_MIGRATIONS) {
      const result = DEVELOPMENT_REFERENCE_RESULTS.find((item) => item.referenceId === id);
      expect(result?.annotationUnresolved).toBe(true);
      expect(result?.candidate?.subject.file_state).toMatch(/semi-open/);
      expect(result?.candidate?.mechanism).toBe("semi_open_file_pressure");
    }
  });

  it("keeps known experimental shortcuts rejected or abstained", () => {
    const forcedExchange = DEVELOPMENT_REFERENCE_RESULTS.find((item) => item.referenceId === "obs-exchange-a-g1f2");
    expect(forcedExchange?.candidate?.trainingCandidate).not.toBe("yes");
    const fictiveResource = NATURAL_GENERALIZATION_RESULTS.find((item) => item.id === "natural-restrict-c-fictive-resource");
    expect(fictiveResource?.promotedConcepts).toEqual([]);
  });
});
