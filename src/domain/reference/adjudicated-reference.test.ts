import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_REFERENCE_BANK, assertDevelopmentReferenceIntegrity } from "./adjudicated-reference";
import {
  CONCEPT_SATURATION,
  COUNTERFACTUAL_PAIRS,
  COVERAGE_GAPS,
  COVERAGE_MATRIX,
  ELO_DISTRIBUTION,
  FUTURE_HOLDOUT_MANIFEST,
  NATURAL_RELATION_PAIRS,
  PILOT_BENCHMARK_METADATA,
  RELATION_PROBES,
} from "./adjudicated-benchmark";
import { isLegalLine, isOpenFile, resourceAvailableAfter, semanticBoardErrors } from "./board-truth";
import { LEGACY_AUDIT_COUNTS, LEGACY_REFERENCE_AUDIT } from "./legacy-audit";
import { PILOT_CONCEPT_CONTRACTS } from "./pilot-contracts";
import { REFERENCE_SOURCE_BY_KEY, REFERENCE_SOURCE_CATALOG } from "./source-catalog";
import { clusterValues, leaveOneClusterOut, splitHasLeakage } from "./splits";
import { PILOT_CONCEPT_IDS, type DevelopmentReference } from "./types";

function byId(id: string): DevelopmentReference {
  const found = DEVELOPMENT_REFERENCE_BANK.find((reference) => reference.id === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

describe("A.1 audited concept contracts", () => {
  it("keeps the six distinct object contracts and explicit abstention policies", () => {
    expect(Object.keys(PILOT_CONCEPT_CONTRACTS).toSorted()).toEqual([...PILOT_CONCEPT_IDS].toSorted());
    expect(PILOT_CONCEPT_CONTRACTS.outpost.object_type).toBe("functional_relation");
    expect(PILOT_CONCEPT_CONTRACTS.open_file.object_type).toBe("static_property");
    expect(PILOT_CONCEPT_CONTRACTS.improve_worst_piece.object_type).toBe("plan_intention");
    expect(PILOT_CONCEPT_CONTRACTS.opposition.object_type).toBe("theoretical_state");
    expect(PILOT_CONCEPT_CONTRACTS.exchange_attacker.object_type).toBe("decision_comparison");
    for (const contract of Object.values(PILOT_CONCEPT_CONTRACTS)) {
      expect(contract.uncertainty_conditions.length).toBeGreaterThan(0);
      expect(contract.holdout_policy.development_only).toBe(true);
    }
  });

  it("does not derive active truth from the requested negative family", () => {
    const source = readFileSync(new URL("./adjudicated-reference.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/function\s+assessmentFor/);
    expect(source).not.toMatch(/assessmentFor\s*\(/);
    expect(source).not.toMatch(/switch\s*\(.*family/);
    for (const reference of DEVELOPMENT_REFERENCE_BANK) {
      for (const axis of [reference.assessment.presence, reference.assessment.decision_relevance, reference.assessment.pedagogical_priority]) {
        expect(axis.evidence.length).toBeGreaterThan(0);
        expect(axis.rationale.length).toBeGreaterThan(20);
      }
    }
  });
});

describe("A.1 reference integrity and factual chess assertions", () => {
  it("keeps every FEN and branch legal with unique observation identities", () => {
    expect(() => assertDevelopmentReferenceIntegrity()).not.toThrow();
    expect(new Set(DEVELOPMENT_REFERENCE_BANK.map((reference) => reference.id)).size).toBe(DEVELOPMENT_REFERENCE_BANK.length);
    expect(new Set(DEVELOPMENT_REFERENCE_BANK.map((reference) => reference.observation_key)).size).toBe(DEVELOPMENT_REFERENCE_BANK.length);
    for (const reference of DEVELOPMENT_REFERENCE_BANK) {
      expect(() => new Chess(reference.fen)).not.toThrow();
      expect(isLegalLine(reference.fen, reference.line_uci ?? (reference.move_uci ? [reference.move_uci] : []))).toBe(true);
      expect(semanticBoardErrors(reference)).toEqual([]);
    }
  });

  it("fails on semantically false piece, file, line and attacker annotations", () => {
    const open = structuredClone(byId("obs-open-file-d-a1c1"));
    open.semantic_claims.open_file = "d";
    expect(semanticBoardErrors(open)).toContain("open_file_contains_pawn");

    const restrict = structuredClone(byId("obs-restrict-b-h5h6"));
    restrict.semantic_claims.subject_piece = { square: "h5", type: "p", color: "white" };
    expect(semanticBoardErrors(restrict)).toContain("subject_piece_mismatch");

    const illegal = structuredClone(byId("obs-outpost-a-c3d5"));
    illegal.line_uci = ["c3c8"];
    expect(semanticBoardErrors(illegal)).toContain("illegal_line");

    const exchange = structuredClone(byId("obs-exchange-a-g1f2"));
    exchange.semantic_claims.attacker_before = { square: "a8", type: "b", color: "black" };
    expect(semanticBoardErrors(exchange)).toContain("attacker_mismatch");
  });

  it("corrects the specific false open-file and restrict-counterplay claims", () => {
    expect(isOpenFile(byId("obs-open-file-d-a1c1").fen, "c")).toBe(true);
    expect(isOpenFile(byId("obs-open-file-e-a1d1").fen, "d")).toBe(true);
    expect(isOpenFile(byId("obs-open-file-a-c2d2").fen, "d")).toBe(false);
    expect(isOpenFile(byId("obs-open-file-b-a1d1").fen, "d")).toBe(false);
    expect(byId("obs-restrict-b-h5h6").semantic_claims.subject_piece).toEqual({ square: "h5", type: "q", color: "white" });
    expect(resourceAvailableAfter(byId("obs-restrict-a-b2b3").fen, "b2b3", "d8d5")).toBe(true);
    expect(resourceAvailableAfter(byId("obs-restrict-b-h5h6").fen, "h5h6", "c5c4")).toBe(true);
  });

  it("persists Syzygy outcomes without treating them as concept-name authority", () => {
    const won = byId("obs-opposition-d-e3e2");
    const drawn = byId("obs-opposition-e-d5e5");
    expect(won.semantic_claims.tablebase_wdl).toBe("win");
    expect(drawn.semantic_claims.tablebase_wdl).toBe("draw");
    expect(won.concept_object.evidence.some((evidence) => evidence.kind === "tablebase_check" && String(evidence.value).includes("dtz=1"))).toBe(true);
    expect(drawn.concept_object.evidence.some((evidence) => evidence.kind === "tablebase_check" && String(evidence.value).includes("dtz=0"))).toBe(true);
    expect(won.adjudicated_interpretation).toBe("unresolved");
    expect(drawn.adjudicated_interpretation).toBe("unresolved");
  });
});

describe("A.1 audit, review status and anti-circularity", () => {
  it("audits every one of the old 60 generated items exactly once", () => {
    expect(LEGACY_REFERENCE_AUDIT).toHaveLength(60);
    expect(new Set(LEGACY_REFERENCE_AUDIT.map((item) => item.legacy_id)).size).toBe(60);
    expect(Object.values(LEGACY_AUDIT_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(60);
    const retained = new Set(DEVELOPMENT_REFERENCE_BANK.map((reference) => reference.id));
    for (const item of LEGACY_REFERENCE_AUDIT) {
      if (item.disposition !== "REJECT") expect(item.resulting_observation_id && retained.has(item.resulting_observation_id)).toBe(true);
    }
  });

  it("labels all final references as internal second review requiring external review", () => {
    for (const reference of DEVELOPMENT_REFERENCE_BANK) {
      expect(reference.status).toBe("development_reference");
      expect(reference.internal_second_review).toMatchObject({ completed: true, reviewer: "same_work_internal_review" });
      expect(reference.external_review_required).toBe(true);
      expect(reference.training_suitability.suitable).toBe(false);
      expect(reference.notes.join(" ")).toContain("DEVELOPMENT REFERENCE");
    }
    expect(PILOT_BENCHMARK_METADATA.status).toContain("external_review_required");
    expect(FUTURE_HOLDOUT_MANIFEST.status).toBe("manifest_only_no_labels");
  });

  it("does not import the Pattern Engine or runtime Training Bank", () => {
    for (const file of ["adjudicated-reference.ts", "adjudicated-benchmark.ts", "board-truth.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/from ["']\.\.\/patterns\/engine/);
      expect(source).not.toMatch(/from ["']\.\.\/training\/library/);
      expect(source).not.toContain("detectMovePatterns(");
    }
  });

  it("never fabricates Elo from training difficulty", () => {
    expect(ELO_DISTRIBUTION).toEqual({ unknown: DEVELOPMENT_REFERENCE_BANK.length });
    expect(DEVELOPMENT_REFERENCE_BANK.every((reference) => reference.elo_bucket === "unknown" && reference.difficulty === "unknown")).toBe(true);
  });
});

describe("A.1 credible relations, coverage and leakage", () => {
  it("keeps branch counterfactuals on exactly the same initial FEN", () => {
    expect(COUNTERFACTUAL_PAIRS.length).toBeGreaterThan(0);
    for (const pair of COUNTERFACTUAL_PAIRS) {
      expect(byId(pair.baseline_reference_id).fen).toBe(pair.initial_fen);
      expect(byId(pair.comparison_reference_id).fen).toBe(pair.initial_fen);
      expect(pair.variables_also_changed.length).toBeGreaterThan(0);
      expect(pair.limitations.length).toBeGreaterThan(0);
      expect(pair.confidence).toBeLessThan(0.8);
    }
  });

  it("separates uncontrolled natural relations and avoids quota-generated probes", () => {
    expect(NATURAL_RELATION_PAIRS.length).toBeGreaterThan(0);
    expect(RELATION_PROBES.length).toBeLessThan(PILOT_CONCEPT_IDS.length * 2);
    for (const pair of NATURAL_RELATION_PAIRS) {
      expect(pair.variables_also_changed.length).toBeGreaterThan(2);
      expect(pair.limitations.length).toBeGreaterThan(0);
    }
    for (const probe of RELATION_PROBES) {
      expect(probe.baseline_reference_id).not.toBe(probe.comparison_reference_id);
      expect(probe.controlled_variables.length).toBeGreaterThan(0);
      expect(probe.limitations.length).toBeGreaterThan(0);
      expect(probe.confidence).toBeLessThan(0.8);
    }
  });

  it("reports actual secondary concepts and honest saturation gaps", () => {
    expect(COVERAGE_MATRIX.length).toBeGreaterThan(0);
    for (const cell of COVERAGE_MATRIX) {
      const reference = byId(cell.reference_ids[0]);
      expect(cell.neighboring_concept).toBe(reference.secondary_concepts.toSorted().join("|") || "none");
    }
    for (const concept of PILOT_CONCEPT_IDS) {
      expect(COVERAGE_GAPS[concept].length).toBeGreaterThanOrEqual(5);
      expect(CONCEPT_SATURATION[concept].new_error_families_still_appearing).toBe(true);
      expect(["insufficient", "developing"]).toContain(CONCEPT_SATURATION[concept].status);
    }
  });

  it("traces every reference to a frozen natural source", () => {
    expect(REFERENCE_SOURCE_BY_KEY.size).toBe(REFERENCE_SOURCE_CATALOG.length);
    const sourceIds = new Set<string>(REFERENCE_SOURCE_CATALOG.map((source) => source.sourceRecordId));
    expect(DEVELOPMENT_REFERENCE_BANK.every((reference) => sourceIds.has(reference.provenance.source_record_id))).toBe(true);
    expect(DEVELOPMENT_REFERENCE_BANK.every((reference) => reference.provenance.source_url.startsWith("https://lichess.org/"))).toBe(true);
  });

  it("keeps deterministic cluster splits leakage-free without calling them holdouts", () => {
    for (const strategy of ["leave_one_game_out", "leave_one_source_out", "leave_one_structure_out"] as const) {
      const heldOut = clusterValues(DEVELOPMENT_REFERENCE_BANK, strategy)[0];
      const split = leaveOneClusterOut(DEVELOPMENT_REFERENCE_BANK, strategy, heldOut);
      expect(split.evaluation.length).toBeGreaterThan(0);
      expect(split.development.length).toBeGreaterThan(0);
      expect(splitHasLeakage(split, strategy)).toBe(false);
    }
  });
});
