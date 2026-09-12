import type { PatternDetectionCandidate, PilotRuntimeConcept } from "./pilot-engine";

/** Product policy deliberately lives outside concept detection. Detector
 * confidence remains an epistemic value; promotion combines pedagogical axes
 * and maturity without rewriting that confidence. */
export const PILOT_PRODUCT_POLICY = {
  defaultDisplayThreshold: 0.62,
  minimumConceptConfidence: 0.66,
  thresholdsByConcept: {
    open_file: 0.62,
    outpost: 0.62,
    improve_worst_piece: 0.62,
    opposition: 0.64,
    restrict_counterplay: 1,
    exchange_attacker: 1,
  } satisfies Record<PilotRuntimeConcept, number>,
} as const;

/** Legacy heuristics expose only a confidence value. This is deliberately not
 * the pilot policy: it is the compatibility gate for concepts that have not
 * yet migrated to the hierarchical detector. Keeping it here prevents every
 * downstream consumer from inventing its own 0.80/0.84 cut-off. */
export const LEGACY_PATTERN_PRODUCT_CONFIDENCE = 0.8;

export type ProductPatternEvidence = {
  conceptSlug?: string;
  confidence: number;
  pedagogicalPromotionScore?: number;
  productDisplayThreshold?: number;
  productEligible?: boolean;
};

const MIGRATED_PILOT_CONCEPTS = new Set<string>([
  "open_file",
  "outpost",
  "improve_worst_piece",
  "opposition",
]);

export type PilotPolicyDecision = {
  conceptConfidence: number;
  pedagogicalPromotionScore: number;
  productDisplayThreshold: number;
  eligible: boolean;
  reasons: string[];
};

export function pedagogicalPromotionScore(candidate: PatternDetectionCandidate): number {
  if (candidate.experimental || candidate.trainingCandidate !== "yes") return 0;
  return Math.min(
    candidate.presence.score,
    candidate.decisionRelevance.score,
    candidate.pedagogicalPriority.score,
  );
}

export function pilotPolicyDecision(
  candidate: PatternDetectionCandidate,
  thresholdOverride?: number,
): PilotPolicyDecision {
  const pedagogicalScore = pedagogicalPromotionScore(candidate);
  const threshold = thresholdOverride
    ?? PILOT_PRODUCT_POLICY.thresholdsByConcept[candidate.conceptId]
    ?? PILOT_PRODUCT_POLICY.defaultDisplayThreshold;
  const reasons: string[] = [];
  if (candidate.experimental) reasons.push("experimental_concept");
  if (candidate.trainingCandidate !== "yes") reasons.push("not_training_ready");
  if (candidate.confidence < PILOT_PRODUCT_POLICY.minimumConceptConfidence) reasons.push("concept_confidence_below_policy");
  if (pedagogicalScore < threshold) reasons.push("pedagogical_score_below_display_threshold");
  return {
    conceptConfidence: candidate.confidence,
    pedagogicalPromotionScore: pedagogicalScore,
    productDisplayThreshold: threshold,
    eligible: reasons.length === 0,
    reasons,
  };
}

/** Single product eligibility contract used after detection (diagnostic,
 * persistence and training). Pilot decisions retain their policy verdict;
 * legacy detections use the one documented compatibility threshold above. */
export function isPatternProductEligible(pattern: ProductPatternEvidence): boolean {
  const isPilotVerdict = pattern.pedagogicalPromotionScore !== undefined
    || pattern.productDisplayThreshold !== undefined
    || pattern.productEligible !== undefined;
  if (!isPilotVerdict && pattern.conceptSlug && MIGRATED_PILOT_CONCEPTS.has(pattern.conceptSlug)) {
    // Occurrences persisted by the first pilot release lost the score fields
    // after detection. Those four slugs could only have entered the occurrence
    // stream after passing policy, so confidence is sufficient for migration.
    return pattern.confidence >= PILOT_PRODUCT_POLICY.minimumConceptConfidence;
  }
  if (!isPilotVerdict) return pattern.confidence >= LEGACY_PATTERN_PRODUCT_CONFIDENCE;
  return pattern.productEligible === true
    && pattern.confidence >= PILOT_PRODUCT_POLICY.minimumConceptConfidence
    && (pattern.pedagogicalPromotionScore ?? 0) >= (
      pattern.productDisplayThreshold ?? PILOT_PRODUCT_POLICY.defaultDisplayThreshold
    );
}
