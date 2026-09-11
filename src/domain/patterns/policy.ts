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

