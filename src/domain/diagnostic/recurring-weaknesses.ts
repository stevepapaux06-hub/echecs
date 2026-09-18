import type {
  PedagogicalConceptRole,
  PersonalExerciseReason,
  TrainingExercise,
} from "../chess/types";
import { normalizeConceptSlug } from "../knowledge/concepts";
import { validateTrainingExercise } from "../training/validation";

export type RecurringWeaknessStatus = "INSUFFICIENT_EVIDENCE" | "EMERGING" | "RECURRING";
export type RecurringWeaknessConfidence = "low" | "medium" | "high";

export type ValidatedWeaknessEvidence = {
  evidenceId: string;
  exerciseId: string;
  gameId: string;
  momentId: string;
  conceptSlug: string;
  reason: PersonalExerciseReason;
  conceptRole: PedagogicalConceptRole;
  confidence: number;
  occurredAt?: string;
  validationFingerprint: string;
  validationStatus: "active" | "invalidated";
};

export type WeaknessSupportingEvidence = Pick<ValidatedWeaknessEvidence,
  "evidenceId" | "exerciseId" | "gameId" | "momentId" | "reason" | "confidence" | "occurredAt"
>;

export type RecurringWeakness = {
  conceptSlug: string;
  status: RecurringWeaknessStatus;
  distinctGames: number;
  evidenceCount: number;
  errors: number;
  opportunities: number;
  confidence: RecurringWeaknessConfidence;
  averageEvidenceConfidence: number;
  /** One-based order among actionable weaknesses; isolated signals have no priority. */
  priority: number | null;
  priorityReasons: string[];
  supportingEvidence: WeaknessSupportingEvidence[];
};

/**
 * Conservative V1 product thresholds. They are deliberately simple calibration
 * values, not claims of statistical optimality:
 * - one game can never establish recurrence;
 * - two distinct games expose an emerging signal;
 * - three distinct games establish a recurring weakness.
 */
export const RECURRING_WEAKNESS_POLICY = {
  minimumEvidenceConfidence: 0.8,
  emergingDistinctGames: 2,
  recurringDistinctGames: 3,
  recentWindowDays: 90,
} as const;

function finiteDate(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function statusFor(distinctGames: number): RecurringWeaknessStatus {
  if (distinctGames >= RECURRING_WEAKNESS_POLICY.recurringDistinctGames) return "RECURRING";
  if (distinctGames >= RECURRING_WEAKNESS_POLICY.emergingDistinctGames) return "EMERGING";
  return "INSUFFICIENT_EVIDENCE";
}

function confidenceFor(
  status: RecurringWeaknessStatus,
  averageEvidenceConfidence: number,
): RecurringWeaknessConfidence {
  if (status === "RECURRING" && averageEvidenceConfidence >= 0.9) return "high";
  if (status !== "INSUFFICIENT_EVIDENCE" && averageEvidenceConfidence >= 0.8) return "medium";
  return "low";
}

/** Converts final personal exercises into weakness evidence. Revalidating the
 * final fingerprint prevents a mutated or invalidated exercise from becoming a
 * profile claim later. */
export function weaknessEvidenceFromPublishedExercises(
  exercises: TrainingExercise[],
): ValidatedWeaknessEvidence[] {
  return exercises.flatMap((exercise): ValidatedWeaknessEvidence[] => {
    if (exercise.origin !== "personal" || exercise.source !== "personal_game") return [];
    if (exercise.conceptRole !== "PRIMARY") return [];
    if (exercise.personalReason !== "ERROR" && exercise.personalReason !== "OPPORTUNITY") return [];
    if ((exercise.classificationConfidence ?? 0) < RECURRING_WEAKNESS_POLICY.minimumEvidenceConfidence) return [];
    if (!exercise.isVerified || exercise.verificationStatus !== "active") return [];
    const validation = validateTrainingExercise(exercise, { requireFinalFingerprint: true });
    if (validation.status !== "active") return [];

    const gameId = exercise.sourceGameId ?? exercise.sourceId;
    if (!gameId) return [];
    const momentId = exercise.positionPly === undefined
      ? exercise.fen
      : String(exercise.positionPly);
    const conceptSlug = normalizeConceptSlug(exercise.primaryConcept ?? exercise.conceptSlug);
    return [{
      evidenceId: `${gameId}:${momentId}:${conceptSlug}`,
      exerciseId: exercise.id,
      gameId,
      momentId,
      conceptSlug,
      reason: exercise.personalReason,
      conceptRole: exercise.conceptRole,
      confidence: exercise.classificationConfidence!,
      occurredAt: exercise.sourceDate,
      validationFingerprint: exercise.validationFingerprint!,
      validationStatus: "active",
    }];
  });
}

/** Aggregates only final, primary and sufficiently confident evidence. A
 * per-game/moment/concept key prevents duplicate exercises or legacy aliases
 * from inflating the profile. */
export function aggregateRecurringWeaknesses(
  evidence: ValidatedWeaknessEvidence[],
  now = Date.now(),
): RecurringWeakness[] {
  const deduplicated = new Map<string, ValidatedWeaknessEvidence>();
  for (const item of evidence) {
    if (item.validationStatus !== "active" || item.conceptRole !== "PRIMARY") continue;
    if (item.reason !== "ERROR" && item.reason !== "OPPORTUNITY") continue;
    if (item.confidence < RECURRING_WEAKNESS_POLICY.minimumEvidenceConfidence) continue;
    const conceptSlug = normalizeConceptSlug(item.conceptSlug);
    const key = `${item.gameId}:${item.momentId}:${conceptSlug}`;
    const current = deduplicated.get(key);
    if (!current || item.confidence > current.confidence) {
      deduplicated.set(key, { ...item, conceptSlug });
    }
  }

  const byConcept = new Map<string, ValidatedWeaknessEvidence[]>();
  for (const item of deduplicated.values()) {
    byConcept.set(item.conceptSlug, [...(byConcept.get(item.conceptSlug) ?? []), item]);
  }

  const recentBoundary = now - RECURRING_WEAKNESS_POLICY.recentWindowDays * 86_400_000;
  const ranked = [...byConcept.entries()].map(([conceptSlug, items]) => {
    const games = new Set(items.map((item) => item.gameId));
    const errorGames = new Set(items.filter((item) => item.reason === "ERROR").map((item) => item.gameId));
    const recentGames = new Set(items.filter((item) => {
      const timestamp = finiteDate(item.occurredAt);
      return timestamp !== null && timestamp >= recentBoundary && timestamp <= now;
    }).map((item) => item.gameId));
    const averageEvidenceConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    const status = statusFor(games.size);
    const latestEvidenceAt = Math.max(0, ...items.map((item) => finiteDate(item.occurredAt) ?? 0));
    return {
      value: {
        conceptSlug,
        status,
        distinctGames: games.size,
        evidenceCount: items.length,
        errors: items.filter((item) => item.reason === "ERROR").length,
        opportunities: items.filter((item) => item.reason === "OPPORTUNITY").length,
        confidence: confidenceFor(status, averageEvidenceConfidence),
        averageEvidenceConfidence: Math.round(averageEvidenceConfidence * 100) / 100,
        priority: null,
        priorityReasons: status === "INSUFFICIENT_EVIDENCE"
          ? ["Une seule partie distincte : ChessPath ne déclare pas encore de faiblesse."]
          : [
            `${games.size} parties distinctes apportent une preuve indépendante.`,
            `${errorGames.size} partie${errorGames.size > 1 ? "s" : ""} ${errorGames.size > 1 ? "contiennent" : "contient"} une erreur validée.`,
            recentGames.size > 0
              ? `${recentGames.size} partie${recentGames.size > 1 ? "s" : ""} concernée${recentGames.size > 1 ? "s" : ""} sur les ${RECURRING_WEAKNESS_POLICY.recentWindowDays} derniers jours.`
              : "Aucune preuve récente datée n’augmente la priorité.",
            `Confiance moyenne des preuves validées : ${Math.round(averageEvidenceConfidence * 100)} %.`,
          ],
        supportingEvidence: items
          .toSorted((first, second) => (finiteDate(second.occurredAt) ?? 0) - (finiteDate(first.occurredAt) ?? 0))
          .map(({ evidenceId, exerciseId, gameId, momentId, reason, confidence, occurredAt }) => ({
            evidenceId, exerciseId, gameId, momentId, reason, confidence, occurredAt,
          })),
      } satisfies RecurringWeakness,
      errorGames: errorGames.size,
      recentGames: recentGames.size,
      latestEvidenceAt,
    };
  // Explainable lexicographic priority, deliberately not a synthetic score:
  // recurrence state, independent games, recent games, games with an error,
  // evidence confidence, then latest observation.
  }).toSorted((first, second) => (
    Number(second.value.status === "RECURRING") - Number(first.value.status === "RECURRING")
    || Number(second.value.status === "EMERGING") - Number(first.value.status === "EMERGING")
    || second.value.distinctGames - first.value.distinctGames
    || second.recentGames - first.recentGames
    || second.errorGames - first.errorGames
    || second.value.averageEvidenceConfidence - first.value.averageEvidenceConfidence
    || second.latestEvidenceAt - first.latestEvidenceAt
    || first.value.conceptSlug.localeCompare(second.value.conceptSlug)
  ));

  let priority = 0;
  return ranked.map(({ value }) => {
    if (value.status === "INSUFFICIENT_EVIDENCE") return value;
    priority += 1;
    return { ...value, priority };
  });
}

export function detectRecurringWeaknesses(
  exercises: TrainingExercise[],
  now = Date.now(),
): RecurringWeakness[] {
  return aggregateRecurringWeaknesses(weaknessEvidenceFromPublishedExercises(exercises), now);
}
