import type { DevelopmentReference } from "../reference/types";
import { DEVELOPMENT_REFERENCE_BANK } from "../reference/adjudicated-reference";
import { COUNTERFACTUAL_PAIRS, NATURAL_RELATION_PAIRS, RELATION_PROBES } from "../reference/adjudicated-benchmark";
import { REFERENCE_SOURCE_BY_KEY } from "../reference/source-catalog";
import {
  analyzePilotDecision,
  type PatternDetectionCandidate,
  type PilotRuntimeConcept,
} from "./pilot-engine";

export type DevelopmentReferenceResult = {
  referenceId: string;
  conceptId: PilotRuntimeConcept;
  annotationLabel: DevelopmentReference["label"];
  annotationUnresolved: boolean;
  outcome: "aligned" | "false_positive" | "false_negative" | "abstained" | "unresolved_observed";
  candidate?: PatternDetectionCandidate;
  comparison: {
    presenceDelta?: number;
    relevanceDelta?: number;
    priorityDelta?: number;
    predictedAbstentions: string[];
    predictedMechanism?: string;
  };
};

function resourceFrom(reference: DevelopmentReference): string | undefined {
  return reference.semantic_claims.opponent_resource_before;
}

export function evaluateDevelopmentReference(reference: DevelopmentReference): DevelopmentReferenceResult {
  const conceptId = reference.concept_id as PilotRuntimeConcept;
  const candidate = analyzePilotDecision(reference.fen, reference.move_uci ?? reference.line_uci?.[0] ?? "", {
    lineUci: reference.line_uci,
    requestedConcepts: [conceptId],
    opponentResourceUci: resourceFrom(reference),
    compareDecisions: true,
    tablebase: reference.semantic_claims.tablebase_wdl
      ? { wdlBefore: reference.semantic_claims.tablebase_wdl }
      : undefined,
  })[0];
  const annotationUnresolved = reference.adjudicated_interpretation === "unresolved";
  let outcome: DevelopmentReferenceResult["outcome"];
  if (annotationUnresolved) outcome = "unresolved_observed";
  else if (!candidate) outcome = reference.label === "positive" ? "false_negative" : "aligned";
  else if (reference.label === "negative") outcome = candidate.presence.score < 0.5 ? "aligned" : "false_positive";
  else if (reference.label === "boundary" || reference.label === "abstain") {
    outcome = candidate.abstentions.length > 0 || candidate.pedagogicalPriority.score < 0.62 ? "abstained" : "false_positive";
  } else {
    const expectedCentrality = reference.assessment.pedagogical_priority.score >= 0.55;
    const predictedCentrality = candidate.pedagogicalPriority.score >= 0.55;
    outcome = candidate.presence.score >= 0.62
      && candidate.decisionRelevance.score >= 0.6
      && expectedCentrality === predictedCentrality ? "aligned" : "false_negative";
  }
  return {
    referenceId: reference.id,
    conceptId,
    annotationLabel: reference.label,
    annotationUnresolved,
    outcome,
    candidate,
    comparison: {
      presenceDelta: candidate ? candidate.presence.score - reference.assessment.presence.score : undefined,
      relevanceDelta: candidate ? candidate.decisionRelevance.score - reference.assessment.decision_relevance.score : undefined,
      priorityDelta: candidate ? candidate.pedagogicalPriority.score - reference.assessment.pedagogical_priority.score : undefined,
      predictedAbstentions: candidate?.abstentions ?? [],
      predictedMechanism: candidate?.mechanism,
    },
  };
}

export const DEVELOPMENT_REFERENCE_RESULTS: readonly DevelopmentReferenceResult[] = DEVELOPMENT_REFERENCE_BANK.map(evaluateDevelopmentReference);

export const DEVELOPMENT_REFERENCE_SUMMARY = {
  total: DEVELOPMENT_REFERENCE_RESULTS.length,
  adjudicated: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => !result.annotationUnresolved).length,
  unresolvedObserved: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.annotationUnresolved).length,
  aligned: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.outcome === "aligned").length,
  falsePositive: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.outcome === "false_positive").length,
  falseNegative: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.outcome === "false_negative").length,
  abstained: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.outcome === "abstained").length,
  candidateAbstentionRate: DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.candidate?.abstentions.length).length
    / Math.max(1, DEVELOPMENT_REFERENCE_RESULTS.length),
  byConcept: Object.fromEntries([...new Set(DEVELOPMENT_REFERENCE_RESULTS.map((result) => result.conceptId))].map((concept) => {
    const results = DEVELOPMENT_REFERENCE_RESULTS.filter((result) => result.conceptId === concept);
    return [concept, {
      total: results.length,
      aligned: results.filter((result) => result.outcome === "aligned").length,
      falsePositive: results.filter((result) => result.outcome === "false_positive").length,
      falseNegative: results.filter((result) => result.outcome === "false_negative").length,
      abstained: results.filter((result) => result.outcome === "abstained").length,
      unresolvedObserved: results.filter((result) => result.outcome === "unresolved_observed").length,
    }];
  })),
} as const;

function result(referenceId: string): DevelopmentReferenceResult {
  const found = DEVELOPMENT_REFERENCE_RESULTS.find((item) => item.referenceId === referenceId);
  if (!found) throw new Error(`Missing development result ${referenceId}`);
  return found;
}

export const COUNTERFACTUAL_RESULTS = COUNTERFACTUAL_PAIRS.map((pair) => ({
  pairId: pair.id,
  conceptId: pair.concept_id,
  sameInitialFen: DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === pair.baseline_reference_id)?.fen
    === DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === pair.comparison_reference_id)?.fen,
  baselinePresence: result(pair.baseline_reference_id).candidate?.presence.score,
  comparisonPresence: result(pair.comparison_reference_id).candidate?.presence.score,
  directionConsistent: (result(pair.baseline_reference_id).candidate?.presence.score ?? 0)
    > (result(pair.comparison_reference_id).candidate?.presence.score ?? 0),
  limitations: pair.limitations,
}));

export const PROBE_RESULTS = RELATION_PROBES.map((probe) => {
  const baseline = result(probe.baseline_reference_id).candidate;
  const comparison = result(probe.comparison_reference_id).candidate;
  const actualPresence = baseline && comparison
    ? comparison.presence.score > baseline.presence.score + 0.15 ? "up"
      : comparison.presence.score < baseline.presence.score - 0.15 ? "down" : "stable"
    : "unknown";
  return {
    probeId: probe.id,
    expectedPresence: probe.expected.presence,
    actualPresence,
    consistent: actualPresence === probe.expected.presence,
    limitations: probe.limitations,
  };
});

/** Observational relations are reported, never scored as gold or described as
 * controlled counterfactuals. They expose whether the runtime story remains
 * comparable across natural positions and where the mechanism changes. */
export const NATURAL_RELATION_RESULTS = NATURAL_RELATION_PAIRS.map((pair) => {
  const baseline = result(pair.baseline_reference_id);
  const comparison = result(pair.comparison_reference_id);
  return {
    relationId: pair.id,
    conceptId: pair.concept_id,
    relation: pair.relation,
    distinctInitialFen: DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === pair.baseline_reference_id)?.fen
      !== DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === pair.comparison_reference_id)?.fen,
    baseline: {
      presence: baseline.candidate?.presence.score,
      relevance: baseline.candidate?.decisionRelevance.score,
      priority: baseline.candidate?.pedagogicalPriority.score,
      mechanism: baseline.candidate?.mechanism,
      abstentions: baseline.candidate?.abstentions ?? [],
    },
    comparison: {
      presence: comparison.candidate?.presence.score,
      relevance: comparison.candidate?.decisionRelevance.score,
      priority: comparison.candidate?.pedagogicalPriority.score,
      mechanism: comparison.candidate?.mechanism,
      abstentions: comparison.candidate?.abstentions ?? [],
    },
    limitations: pair.limitations,
  };
});

export type NaturalGeneralizationSample = {
  id: string;
  sourceKey: string;
  moveUci: string;
  auditFocus: string;
  expectedBehavior: "detect" | "abstain" | "reject_shortcut";
};

/** Natural positions excluded from A.1. They are detector-influenced source
 * samples, not an independent holdout. Ratings are not used by the engine. */
export const NATURAL_GENERALIZATION_SAMPLE: readonly NaturalGeneralizationSample[] = [
  { id: "natural-outpost-c-tactical", sourceKey: "outpost-c", moveUci: "c3d5", auditFocus: "Attractive d5 square under heavy tactical competition.", expectedBehavior: "abstain" },
  { id: "natural-file-c-king-danger", sourceKey: "file-c", moveUci: "a1d1", auditFocus: "Rook move with queen invasion and first-rank danger.", expectedBehavior: "abstain" },
  { id: "natural-worst-c-ambiguity", sourceKey: "worst-c", moveUci: "a3c4", auditFocus: "Knight activation competes with pawn-break plans.", expectedBehavior: "abstain" },
  { id: "natural-restrict-c-fictive-resource", sourceKey: "restrict-c", moveUci: "b2b4", auditFocus: "The alleged c5-c4 resource has no pawn on c5.", expectedBehavior: "reject_shortcut" },
  { id: "natural-exchange-d-queen-capture", sourceKey: "exchange-d", moveUci: "a4b2", auditFocus: "Immediate queen capture must dominate exchange-attacker storytelling.", expectedBehavior: "reject_shortcut" },
];

export const NATURAL_GENERALIZATION_RESULTS = NATURAL_GENERALIZATION_SAMPLE.map((sample) => {
  const source = REFERENCE_SOURCE_BY_KEY.get(sample.sourceKey);
  if (!source) throw new Error(`Missing natural source ${sample.sourceKey}`);
  const candidates = analyzePilotDecision(source.fen, sample.moveUci, { compareDecisions: true });
  const promoted = candidates.filter((candidate) => candidate.trainingCandidate === "yes");
  return {
    ...sample,
    sourceUrl: source.sourceUrl,
    sourceEloMetadata: source.eloBucket,
    candidates,
    promotedConcepts: promoted.map((candidate) => candidate.conceptId),
    abstainedConcepts: candidates.filter((candidate) => candidate.abstentions.length > 0).map((candidate) => candidate.conceptId),
    behaviorSatisfied: sample.expectedBehavior === "detect" ? promoted.length > 0 : promoted.length === 0,
  };
});

export const REFERENCE_BANK_GAP_CANDIDATES = [
  {
    id: "gap-strategic-cue-while-saving-attacked-piece",
    conceptId: "open_file",
    errorFamily: "a rook reaches an open file while the actual urgency is rescuing that rook",
    neededEvidence: "Natural cross-concept cases where the same move both saves an attacked piece and realizes a positional affordance.",
  },
  {
    id: "gap-low-mobility-important-defender",
    conceptId: "improve_worst_piece",
    errorFamily: "important defensive role hidden by low mobility",
    neededEvidence: "Natural game with an attacked major piece and a low-mobility sole defender.",
  },
  {
    id: "gap-open-file-present-not-central",
    conceptId: "open_file",
    errorFamily: "verified open file with no decision-changing target",
    neededEvidence: "Natural same-position comparison between a cosmetic rook move and another urgent plan.",
  },
  {
    id: "gap-opposition-geometry-vs-effective-method",
    conceptId: "opposition",
    errorFamily: "geometry true while reserve tempi or pawn race determines the method",
    neededEvidence: "Tablebase-verified same-FEN alternatives plus external method annotation.",
  },
  {
    id: "gap-restrict-positive-causal-sequence",
    conceptId: "restrict_counterplay",
    errorFamily: "specific viable resource removed while alternatives are audited",
    neededEvidence: "External positive anchor with resource-before/after and critical replies.",
  },
  {
    id: "gap-exchange-optional-nonforcing",
    conceptId: "exchange_attacker",
    errorFamily: "optional exchange removes the central attacker and measurably reduces danger",
    neededEvidence: "External positive anchor with attack-state comparison and remaining attackers.",
  },
  {
    id: "gap-natural-positive-outside-reference-bank",
    conceptId: "cross_concept",
    errorFamily: "non-reference audit currently contains only abstention/rejection expectations",
    neededEvidence: "Fresh natural positive candidates for each anchored concept, annotated only after blind runtime output.",
  },
  {
    id: "gap-single-line-king-danger",
    conceptId: "cross_concept",
    errorFamily: "one decisive forcing threat may dominate even when fewer than two immediate checks exist",
    neededEvidence: "Natural positions with one externally verified critical king-danger line and quiet strategic-looking alternatives.",
  },
] as const;
