import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_REFERENCE_BANK, assertDevelopmentReferenceIntegrity } from "./development-reference";
import {
  COUNTERFACTUAL_PAIRS,
  COVERAGE_GAPS,
  COVERAGE_MATRIX,
  FUTURE_HOLDOUT_MANIFEST,
  PILOT_BENCHMARK_METADATA,
  RELATION_PROBES,
  SHORTCUT_CHALLENGE_SET,
} from "./pilot-benchmark";
import { PILOT_CONCEPT_CONTRACTS } from "./pilot-contracts";
import { REFERENCE_SOURCE_BY_KEY, REFERENCE_SOURCE_CATALOG } from "./source-catalog";
import { clusterValues, leaveOneClusterOut, splitHasLeakage } from "./splits";
import { PILOT_CONCEPT_IDS, type ReferenceFamily } from "./types";

const FAMILIES: ReferenceFamily[] = [
  "natural_positive", "constitutive_negative", "affordance_negative", "relevance_negative",
  "centrality_negative", "neighbor_negative", "tactical_override",
  "human_plausible_misconception", "engine_disagreement",
];

describe("pilot concept contracts", () => {
  it("covers exactly the six requested concepts with versioned, non-binary contracts", () => {
    expect(Object.keys(PILOT_CONCEPT_CONTRACTS).toSorted()).toEqual([...PILOT_CONCEPT_IDS].toSorted());
    for (const contract of Object.values(PILOT_CONCEPT_CONTRACTS)) {
      expect(contract.version).toBe("1.0.0-pilot");
      expect(contract.annotation_scope.length).toBeGreaterThan(0);
      expect(contract.minimal_definition.length).toBeGreaterThan(40);
      expect(contract.mechanism_families.length).toBeGreaterThanOrEqual(3);
      expect(contract.constitutive_conditions.length).toBeGreaterThanOrEqual(4);
      expect(contract.affordance_criteria.length).toBeGreaterThan(0);
      expect(contract.decision_relevance_criteria.length).toBeGreaterThan(0);
      expect(contract.centrality_evidence.length).toBeGreaterThan(0);
      expect(contract.uncertainty_conditions.length).toBeGreaterThan(0);
      expect(contract.training_suitability_criteria.length).toBeGreaterThan(0);
      expect(contract.shortcuts_under_test.length).toBeGreaterThanOrEqual(2);
      expect(contract.holdout_policy.development_only).toBe(true);
    }
  });

  it("models the six different units of analysis explicitly", () => {
    expect(PILOT_CONCEPT_CONTRACTS.outpost.object_type).toBe("functional_relation");
    expect(PILOT_CONCEPT_CONTRACTS.open_file.object_type).toBe("static_property");
    expect(PILOT_CONCEPT_CONTRACTS.improve_worst_piece.object_type).toBe("plan_intention");
    expect(PILOT_CONCEPT_CONTRACTS.opposition.object_type).toBe("theoretical_state");
    expect(PILOT_CONCEPT_CONTRACTS.restrict_counterplay.annotation_scope).not.toContain("position");
    expect(PILOT_CONCEPT_CONTRACTS.exchange_attacker.object_type).toBe("decision_comparison");
  });
});

describe("development reference bank", () => {
  it("keeps every source FEN and every annotated branch legal", () => {
    expect(() => assertDevelopmentReferenceIntegrity()).not.toThrow();
    for (const source of REFERENCE_SOURCE_CATALOG) expect(() => new Chess(source.fen)).not.toThrow();
  });

  it("contains varied positives and every informative negative family per concept", () => {
    expect(DEVELOPMENT_REFERENCE_BANK).toHaveLength(60);
    for (const concept of PILOT_CONCEPT_IDS) {
      const samples = DEVELOPMENT_REFERENCE_BANK.filter((sample) => sample.concept_id === concept);
      expect(samples.filter((sample) => sample.family === "natural_positive")).toHaveLength(2);
      expect([...new Set(samples.map((sample) => sample.provenance.source_game_id))].length).toBeGreaterThanOrEqual(2);
      for (const family of FAMILIES) expect(samples.some((sample) => sample.family === family), `${concept}:${family}`).toBe(true);
    }
  });

  it("keeps presence, relevance and pedagogical priority independent", () => {
    for (const sample of DEVELOPMENT_REFERENCE_BANK.filter((entry) => entry.family === "affordance_negative")) {
      expect(sample.assessment.presence.score).toBeGreaterThan(sample.assessment.decision_relevance.score);
      expect(sample.assessment.decision_relevance.score).toBeGreaterThan(sample.assessment.pedagogical_priority.score);
      expect(sample.assessment.abstentions).toContain("concept_present_but_not_relevant");
    }
    for (const sample of DEVELOPMENT_REFERENCE_BANK.filter((entry) => entry.family === "centrality_negative")) {
      expect(sample.assessment.decision_relevance.score).toBeGreaterThan(sample.assessment.pedagogical_priority.score);
      expect(sample.assessment.abstentions).toContain("relevant_but_not_pedagogically_central");
    }
  });

  it("never promotes development labels to gold, independent holdout or Training", () => {
    for (const sample of DEVELOPMENT_REFERENCE_BANK) {
      expect(sample.status).toBe("development_reference");
      expect(sample.training_suitability.suitable).not.toBe(true);
      expect(sample.notes.join(" ")).toContain("DEVELOPMENT REFERENCE");
      expect(sample.provenance.source_url).toMatch(/^https:\/\/lichess\.org\//);
    }
    expect(FUTURE_HOLDOUT_MANIFEST.status).toBe("manifest_only_no_labels");
  });

  it("keeps the reference path independent from the current detector and runtime training bank", () => {
    const source = readFileSync(new URL("./development-reference.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["']\.\.\/patterns\/engine/);
    expect(source).not.toMatch(/from ["']\.\.\/training\/library/);
    expect(source).not.toContain("detectMovePatterns(");
  });

  it("traces every reference to the frozen source catalog", () => {
    const ids = new Set<string>(REFERENCE_SOURCE_CATALOG.map((source) => source.sourceRecordId));
    expect(REFERENCE_SOURCE_BY_KEY.size).toBe(REFERENCE_SOURCE_CATALOG.length);
    expect(DEVELOPMENT_REFERENCE_BANK.every((sample) => ids.has(sample.provenance.source_record_id))).toBe(true);
  });
});

describe("counterfactual, invariance and causal probes", () => {
  it("uses natural or legal branch pairs and keeps synthetic transforms minority-only", () => {
    expect(COUNTERFACTUAL_PAIRS).toHaveLength(12);
    expect(COUNTERFACTUAL_PAIRS.some((pair) => pair.kind === "natural")).toBe(true);
    expect(COUNTERFACTUAL_PAIRS.some((pair) => pair.kind === "branch")).toBe(true);
    expect(COUNTERFACTUAL_PAIRS.filter((pair) => pair.synthetic).length).toBeLessThan(COUNTERFACTUAL_PAIRS.length / 4);
    expect(COUNTERFACTUAL_PAIRS.every((pair) => pair.legality_checked && pair.plausibility_checked)).toBe(true);
  });

  it("defines one source/structure invariance and two causal flips per concept", () => {
    expect(RELATION_PROBES).toHaveLength(18);
    for (const concept of PILOT_CONCEPT_IDS) {
      const probes = RELATION_PROBES.filter((probe) => probe.concept_id === concept);
      expect(probes.filter((probe) => probe.kind === "invariance")).toHaveLength(1);
      expect(probes.filter((probe) => probe.kind === "causal_flip")).toHaveLength(2);
      expect(probes.find((probe) => probe.id.includes("affordance"))?.expected).toEqual({
        presence: "stable", affordance: "down", decision_relevance: "down", pedagogical_priority: "down",
      });
    }
  });

  it("collects explicit anti-shortcut cases rather than relying on easy negatives", () => {
    expect(SHORTCUT_CHALLENGE_SET).toHaveLength(18);
    for (const concept of PILOT_CONCEPT_IDS) {
      expect(SHORTCUT_CHALLENGE_SET.filter((sample) => sample.concept_id === concept)).toHaveLength(3);
    }
  });
});

describe("coverage and leakage controls", () => {
  it("builds multidimensional coverage cells and records honest gaps", () => {
    expect(COVERAGE_MATRIX).toHaveLength(60);
    for (const concept of PILOT_CONCEPT_IDS) {
      expect(COVERAGE_MATRIX.some((cell) => cell.concept_id === concept)).toBe(true);
      expect(COVERAGE_GAPS[concept].length).toBeGreaterThanOrEqual(4);
    }
    expect(PILOT_BENCHMARK_METADATA.referenceCount).toBe(60);
    expect(PILOT_BENCHMARK_METADATA.status).toContain("not_independent_holdout");
  });

  it("performs deterministic leave-one-cluster-out splits without leakage", () => {
    for (const strategy of ["leave_one_game_out", "leave_one_source_out", "leave_one_structure_out"] as const) {
      const heldOut = clusterValues(DEVELOPMENT_REFERENCE_BANK, strategy)[0];
      const split = leaveOneClusterOut(DEVELOPMENT_REFERENCE_BANK, strategy, heldOut);
      expect(split.evaluation.length).toBeGreaterThan(0);
      expect(split.development.length).toBeGreaterThan(0);
      expect(splitHasLeakage(split, strategy)).toBe(false);
    }
  });

  it("prevents future holdout collection from reusing development clusters", () => {
    expect(FUTURE_HOLDOUT_MANIFEST.exclusion_clusters.length).toBeGreaterThan(30);
    expect(FUTURE_HOLDOUT_MANIFEST.split_strategies).toContain("leave_one_game_out");
    expect(FUTURE_HOLDOUT_MANIFEST.split_strategies).toContain("leave_one_counterfactual_generator_out");
    expect(FUTURE_HOLDOUT_MANIFEST.annotation_requirements.join(" ")).toContain("deux annotateurs");
  });
});
