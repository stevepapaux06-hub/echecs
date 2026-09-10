import { describe, expect, it } from "vitest";
import {
  COUNTERFACTUAL_RESULTS,
  DEVELOPMENT_REFERENCE_RESULTS,
  DEVELOPMENT_REFERENCE_SUMMARY,
  NATURAL_RELATION_RESULTS,
  NATURAL_GENERALIZATION_RESULTS,
  PROBE_RESULTS,
  REFERENCE_BANK_GAP_CANDIDATES,
} from "./development-evaluation";

describe("pilot development evaluation", () => {
  it("evaluates every A.1 reference while keeping unresolved items observable", () => {
    expect(DEVELOPMENT_REFERENCE_SUMMARY.total).toBe(22);
    expect(DEVELOPMENT_REFERENCE_SUMMARY.unresolvedObserved).toBe(7);
    expect(DEVELOPMENT_REFERENCE_RESULTS).toHaveLength(22);
    expect(DEVELOPMENT_REFERENCE_SUMMARY.falsePositive).toBe(0);
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

  it("keeps known shortcut regressions rejected or abstained", () => {
    for (const id of ["obs-open-file-a-c2d2", "obs-open-file-b-a1d1"]) {
      const result = DEVELOPMENT_REFERENCE_RESULTS.find((item) => item.referenceId === id);
      expect(result?.candidate?.presence.score).toBeLessThan(0.2);
      expect(result?.candidate?.trainingCandidate).not.toBe("yes");
    }
    const forcedExchange = DEVELOPMENT_REFERENCE_RESULTS.find((item) => item.referenceId === "obs-exchange-a-g1f2");
    expect(forcedExchange?.candidate?.trainingCandidate).not.toBe("yes");
    const fictiveResource = NATURAL_GENERALIZATION_RESULTS.find((item) => item.id === "natural-restrict-c-fictive-resource");
    expect(fictiveResource?.promotedConcepts).toEqual([]);
  });
});
