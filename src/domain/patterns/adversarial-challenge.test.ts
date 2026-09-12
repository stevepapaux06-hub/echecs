import { describe, expect, it } from "vitest";
import {
  ADVERSARIAL_CHALLENGE_RESULTS,
  ADVERSARIAL_CHALLENGE_SET,
  ADVERSARIAL_CHALLENGE_SUMMARY,
  CHALLENGE_COVERAGE_GAPS,
} from "./adversarial-challenge";

describe("anti-shortcut adversarial challenge", () => {
  it("freezes a small representative suite without pretending it is an independent holdout", () => {
    expect(ADVERSARIAL_CHALLENGE_SET).toHaveLength(16);
    expect(new Set(ADVERSARIAL_CHALLENGE_SET.map((item) => item.id)).size).toBe(16);
    expect(ADVERSARIAL_CHALLENGE_SET.every((item) => !item.independentHoldout && item.limitations.length > 0)).toBe(true);
    expect(ADVERSARIAL_CHALLENGE_SUMMARY.syntheticCases).toBe(0);
    expect(ADVERSARIAL_CHALLENGE_SUMMARY.independentHoldoutCases).toBe(0);
  });

  it("covers every requested challenge type and every pilot concept", () => {
    expect(new Set(ADVERSARIAL_CHALLENGE_SET.map((item) => item.kind))).toEqual(new Set([
      "classic_positive", "nonclassic_positive", "hard_negative", "minimal_counterfactual", "dominant_competing_plan", "ambiguous_abstain",
    ]));
    expect(new Set(ADVERSARIAL_CHALLENGE_SET.map((item) => item.conceptId))).toEqual(new Set([
      "outpost", "open_file", "improve_worst_piece", "opposition", "restrict_counterplay", "exchange_attacker",
    ]));
  });

  it("keeps every hard negative, dominant competitor and ambiguity out of training", () => {
    const guarded = ADVERSARIAL_CHALLENGE_RESULTS.filter((item) => ["hard_negative", "dominant_competing_plan", "ambiguous_abstain"].includes(item.kind));
    expect(guarded.every((item) => item.actual !== "promote"), JSON.stringify(guarded.filter((item) => item.actual === "promote"))).toBe(true);
  });

  it("keeps observed false negatives visible instead of relabeling them after seeing runtime output", () => {
    expect(ADVERSARIAL_CHALLENGE_SUMMARY.matched).toBe(10);
    expect(ADVERSARIAL_CHALLENGE_SUMMARY.falsePositive).toBe(0);
    expect(ADVERSARIAL_CHALLENGE_SUMMARY.falseNegative).toBe(1);
    expect(ADVERSARIAL_CHALLENGE_SUMMARY.byFailureLayer.content).toBe(5);
    expect(ADVERSARIAL_CHALLENGE_RESULTS.find((item) => item.id === "opposition-reserve-tempo-nonclassic")).toMatchObject({
      expected: "promote", actual: "abstain", matched: false, failureLayer: "ranking",
    });
  });

  it("publishes sparse coverage instead of manufacturing missing adversarial cells", () => {
    expect(CHALLENGE_COVERAGE_GAPS.restrict_counterplay).toContain("classic_positive");
    expect(CHALLENGE_COVERAGE_GAPS.exchange_attacker).toContain("nonclassic_positive");
    expect(CHALLENGE_COVERAGE_GAPS.outpost).toContain("classic_positive");
  });
});
