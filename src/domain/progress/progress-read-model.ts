import type { DiagnosticCategory } from "../chess/types";
import {
  aggregateRecurringWeaknesses,
  RECURRING_WEAKNESS_POLICY,
  type RecurringWeakness,
  type RecurringWeaknessStatus,
  type ValidatedWeaknessEvidence,
} from "../diagnostic/recurring-weaknesses";
import { conceptDefinition, normalizeConceptSlug } from "../knowledge/concepts";

export type ProgressDataState = "NO_DATA" | "INSUFFICIENT_DATA" | "READY";
export type ProgressConceptStatus = RecurringWeaknessStatus | "IMPROVING" | "RESOLVED";
export type ProgressTrend = "INSUFFICIENT_DATA" | "STABLE" | "IMPROVING" | "RESOLVED" | "WORSENING";

export type ProgressConceptExposure = {
  conceptSlug: string;
  opportunities: number;
  successes: number;
};

export type ProgressGameSample = {
  userId: string;
  /** External game id, shared with pedagogical_evidence.game_id. */
  gameId: string;
  /** Stable source + external id key used to deduplicate imported games. */
  uniqueGameKey: string;
  playedAt: string;
  /** False for legacy games analyzed before per-game concept summaries existed. */
  hasExposureData: boolean;
  concepts: ProgressConceptExposure[];
};

export type ProgressEvidenceSample = ValidatedWeaknessEvidence & { userId: string };

export type ProgressWindow = {
  gameCount: number;
  expectedGames: number;
  exposures: number;
  correctlyTreated: number;
  exposureFailures: number;
  successRate: number | null;
  errors: number;
  missedOpportunities: number;
  gamesWithValidatedProblem: number;
};

export type ProgressConcept = {
  conceptSlug: string;
  label: string;
  category: DiagnosticCategory | null;
  status: ProgressConceptStatus;
  historicalStatus: RecurringWeaknessStatus;
  trend: ProgressTrend;
  distinctGames: number;
  evidenceCount: number;
  historicalErrors: number;
  historicalMissedOpportunities: number;
  recent: ProgressWindow;
  previous: ProgressWindow;
  lastOccurrenceAt: string | null;
  gamesSinceLastOccurrence: number | null;
  priority: number | null;
  priorityReasons: string[];
  supportingEvidence: RecurringWeakness["supportingEvidence"];
};

export type ProgressPriority = Pick<ProgressConcept,
  | "conceptSlug"
  | "label"
  | "category"
  | "status"
  | "distinctGames"
  | "historicalErrors"
  | "historicalMissedOpportunities"
  | "lastOccurrenceAt"
  | "gamesSinceLastOccurrence"
  | "trend"
  | "priorityReasons"
  | "supportingEvidence"
> & { newGamesBeforeReevaluation: number };

export type ObservedStrength = {
  conceptSlug: string;
  label: string;
  category: DiagnosticCategory | null;
  opportunities: number;
  correctlyTreated: number;
  successRate: number;
};

export type ProgressGraphPoint = {
  block: number;
  fromPlayedAt: string;
  toPlayedAt: string;
  games: 5;
  gamesWithValidatedProblem: number;
};

export type ProgressDomain = {
  category: Exclude<DiagnosticCategory, "opening">;
  label: string;
  opportunities: number;
  correctlyTreated: number;
  failures: number;
  successRate: number | null;
  observation: "INSUFFICIENT_DATA" | "OBSERVED" | "WELL_OBSERVED";
  trend: ProgressTrend;
  conceptCount: number;
};

export type ProgressReadModel = {
  dataState: ProgressDataState;
  uniqueGames: number;
  gamesWithExposureData: number;
  windows: {
    recentGames: number;
    previousGames: number;
    expectedPerWindow: 10;
  };
  concepts: ProgressConcept[];
  priority: ProgressPriority | null;
  observedStrengths: ObservedStrength[];
  domains: ProgressDomain[];
  reevaluation: {
    newGamesNeeded: number;
    comparisonWindowGames: 20;
    checkpointEveryGames: 5;
  };
  graph: {
    blockSize: 5;
    overall: ProgressGraphPoint[];
    byConcept: Record<string, ProgressGraphPoint[]>;
  };
};

/** Conservative V1 read-model calibration, intentionally simple and visible. */
export const PROGRESS_READ_MODEL_POLICY = {
  windowGames: 10,
  graphBlockGames: 5,
  minimumComparableExposures: 5,
  minimumImprovementRateDrop: 0.2,
  minimumStrengthSuccessRate: 0.8,
  minimumDomainExposures: 5,
  wellObservedDomainExposures: 15,
} as const;

const PROGRESS_DOMAINS: Array<{ category: ProgressDomain["category"]; label: string }> = [
  { category: "tactic", label: "Tactique" },
  { category: "strategy", label: "Stratégie" },
  { category: "conversion", label: "Conversion" },
  { category: "defense", label: "Défense" },
  { category: "endgame", label: "Finales" },
];

function finiteDate(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizedGames(input: ProgressGameSample[], userId: string): ProgressGameSample[] {
  const byKey = new Map<string, ProgressGameSample>();
  for (const game of input) {
    if (game.userId !== userId || finiteDate(game.playedAt) === null) continue;
    const normalized: ProgressGameSample = {
      ...game,
      concepts: game.concepts.map((concept) => {
        const opportunities = Math.max(0, Math.floor(concept.opportunities));
        return {
          conceptSlug: normalizeConceptSlug(concept.conceptSlug),
          opportunities,
          successes: Math.min(opportunities, Math.max(0, Math.floor(concept.successes))),
        };
      }),
    };
    const previous = byKey.get(game.uniqueGameKey);
    if (!previous || Date.parse(normalized.playedAt) > Date.parse(previous.playedAt)) {
      byKey.set(game.uniqueGameKey, normalized);
    }
  }
  return [...byKey.values()].toSorted((first, second) => Date.parse(second.playedAt) - Date.parse(first.playedAt));
}

function normalizedEvidence(input: ProgressEvidenceSample[], userId: string): ProgressEvidenceSample[] {
  const byKey = new Map<string, ProgressEvidenceSample>();
  for (const item of input) {
    if (item.userId !== userId || item.validationStatus !== "active") continue;
    if (item.conceptRole !== "PRIMARY" || !item.validationFingerprint) continue;
    if (item.reason !== "ERROR" && item.reason !== "OPPORTUNITY") continue;
    if (item.confidence < RECURRING_WEAKNESS_POLICY.minimumEvidenceConfidence) continue;
    const conceptSlug = normalizeConceptSlug(item.conceptSlug);
    const key = `${item.gameId}:${item.momentId}:${conceptSlug}`;
    const previous = byKey.get(key);
    if (!previous || item.confidence > previous.confidence) byKey.set(key, { ...item, conceptSlug });
  }
  return [...byKey.values()];
}

function conceptExposure(game: ProgressGameSample, conceptSlug: string): { opportunities: number; successes: number } {
  return game.concepts
    .filter((concept) => concept.conceptSlug === conceptSlug)
    .reduce((total, concept) => ({
      opportunities: total.opportunities + concept.opportunities,
      successes: total.successes + concept.successes,
    }), { opportunities: 0, successes: 0 });
}

function windowStats(
  games: ProgressGameSample[],
  evidence: ProgressEvidenceSample[],
  conceptSlug: string,
): ProgressWindow {
  const gameIds = new Set(games.map((game) => game.gameId));
  const relevantEvidence = evidence.filter((item) => item.conceptSlug === conceptSlug && gameIds.has(item.gameId));
  const totals = games.reduce((sum, game) => {
    const exposure = conceptExposure(game, conceptSlug);
    return {
      opportunities: sum.opportunities + exposure.opportunities,
      successes: sum.successes + exposure.successes,
    };
  }, { opportunities: 0, successes: 0 });
  return {
    gameCount: games.length,
    expectedGames: PROGRESS_READ_MODEL_POLICY.windowGames,
    exposures: totals.opportunities,
    correctlyTreated: totals.successes,
    exposureFailures: totals.opportunities - totals.successes,
    successRate: totals.opportunities > 0 ? totals.successes / totals.opportunities : null,
    errors: relevantEvidence.filter((item) => item.reason === "ERROR").length,
    missedOpportunities: relevantEvidence.filter((item) => item.reason === "OPPORTUNITY").length,
    gamesWithValidatedProblem: new Set(relevantEvidence.map((item) => item.gameId)).size,
  };
}

function graphPoints(
  gamesDescending: ProgressGameSample[],
  evidence: ProgressEvidenceSample[],
  conceptSlug?: string,
): ProgressGraphPoint[] {
  const groups: ProgressGameSample[][] = [];
  for (let index = 0; index + PROGRESS_READ_MODEL_POLICY.graphBlockGames <= gamesDescending.length; index += PROGRESS_READ_MODEL_POLICY.graphBlockGames) {
    groups.push(gamesDescending.slice(index, index + PROGRESS_READ_MODEL_POLICY.graphBlockGames));
  }
  return groups.reverse().map((games, index) => {
    const gameIds = new Set(games.map((game) => game.gameId));
    const problemGames = new Set(evidence
      .filter((item) => gameIds.has(item.gameId) && (!conceptSlug || item.conceptSlug === conceptSlug))
      .map((item) => item.gameId));
    const chronological = games.toSorted((first, second) => Date.parse(first.playedAt) - Date.parse(second.playedAt));
    return {
      block: index + 1,
      fromPlayedAt: chronological[0].playedAt,
      toPlayedAt: chronological.at(-1)!.playedAt,
      games: 5,
      gamesWithValidatedProblem: problemGames.size,
    };
  });
}

function gamesBeforeReevaluation(uniqueGames: number): number {
  const comparisonGames = PROGRESS_READ_MODEL_POLICY.windowGames * 2;
  if (uniqueGames < comparisonGames) return comparisonGames - uniqueGames;
  const remainder = uniqueGames % PROGRESS_READ_MODEL_POLICY.graphBlockGames;
  return remainder === 0 ? PROGRESS_READ_MODEL_POLICY.graphBlockGames : PROGRESS_READ_MODEL_POLICY.graphBlockGames - remainder;
}

function statusAndTrend(
  historicalStatus: RecurringWeaknessStatus,
  recent: ProgressWindow,
  previous: ProgressWindow,
  comparisonReady: boolean,
): { status: ProgressConceptStatus; trend: ProgressTrend } {
  if (historicalStatus !== "RECURRING") {
    return { status: historicalStatus, trend: comparisonReady ? "STABLE" : "INSUFFICIENT_DATA" };
  }
  const recentProblemCount = recent.errors + recent.missedOpportunities;
  if (
    recent.gameCount === PROGRESS_READ_MODEL_POLICY.windowGames
    && recentProblemCount === 0
    && recent.exposures >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures
    && recent.correctlyTreated === recent.exposures
  ) {
    return { status: "RESOLVED", trend: "RESOLVED" };
  }
  const comparable = comparisonReady
    && recent.exposures >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures
    && previous.exposures >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures
    && recent.successRate !== null
    && previous.successRate !== null;
  if (!comparable) return { status: historicalStatus, trend: "INSUFFICIENT_DATA" };

  const previousFailureRate = 1 - previous.successRate!;
  const recentFailureRate = 1 - recent.successRate!;
  if (
    previousFailureRate - recentFailureRate >= PROGRESS_READ_MODEL_POLICY.minimumImprovementRateDrop
    && recent.exposureFailures < previous.exposureFailures
    && recent.correctlyTreated > 0
  ) {
    return { status: "IMPROVING", trend: "IMPROVING" };
  }
  if (
    recentFailureRate - previousFailureRate >= PROGRESS_READ_MODEL_POLICY.minimumImprovementRateDrop
    && recent.exposureFailures > previous.exposureFailures
  ) {
    return { status: historicalStatus, trend: "WORSENING" };
  }
  return { status: historicalStatus, trend: "STABLE" };
}

export function buildProgressReadModel(input: {
  userId: string;
  games: ProgressGameSample[];
  evidence: ProgressEvidenceSample[];
}): ProgressReadModel {
  const games = normalizedGames(input.games, input.userId);
  const evidence = normalizedEvidence(input.evidence, input.userId);
  const recentGames = games.slice(0, PROGRESS_READ_MODEL_POLICY.windowGames);
  const previousGames = games.slice(PROGRESS_READ_MODEL_POLICY.windowGames, PROGRESS_READ_MODEL_POLICY.windowGames * 2);
  const comparisonGames = [...recentGames, ...previousGames];
  const comparisonReady = recentGames.length === PROGRESS_READ_MODEL_POLICY.windowGames
    && previousGames.length === PROGRESS_READ_MODEL_POLICY.windowGames
    && comparisonGames.every((game) => game.hasExposureData);
  const dataState: ProgressDataState = games.length === 0
    ? "NO_DATA"
    : comparisonReady ? "READY" : "INSUFFICIENT_DATA";

  const recurring = aggregateRecurringWeaknesses(evidence);
  const recurringByConcept = new Map(recurring.map((item) => [item.conceptSlug, item]));
  const conceptSlugs = new Set<string>(recurring.map((item) => item.conceptSlug));
  for (const game of games) for (const concept of game.concepts) conceptSlugs.add(concept.conceptSlug);

  const concepts = [...conceptSlugs].map((conceptSlug): ProgressConcept => {
    const recurrence = recurringByConcept.get(conceptSlug);
    const recent = windowStats(recentGames, evidence, conceptSlug);
    const previous = windowStats(previousGames, evidence, conceptSlug);
    const historicalStatus = recurrence?.status ?? "INSUFFICIENT_EVIDENCE";
    const evolution = statusAndTrend(historicalStatus, recent, previous, comparisonReady);
    const definition = conceptDefinition(conceptSlug);
    const occurrences = evidence
      .filter((item) => item.conceptSlug === conceptSlug)
      .toSorted((first, second) => (finiteDate(second.occurredAt) ?? 0) - (finiteDate(first.occurredAt) ?? 0));
    const lastOccurrence = occurrences[0];
    const gameIndex = lastOccurrence ? games.findIndex((game) => game.gameId === lastOccurrence.gameId) : -1;
    return {
      conceptSlug,
      label: definition?.labelFr ?? conceptSlug,
      category: definition?.category ?? null,
      status: evolution.status,
      historicalStatus,
      trend: evolution.trend,
      distinctGames: recurrence?.distinctGames ?? 0,
      evidenceCount: recurrence?.evidenceCount ?? 0,
      historicalErrors: recurrence?.errors ?? 0,
      historicalMissedOpportunities: recurrence?.opportunities ?? 0,
      recent,
      previous,
      lastOccurrenceAt: lastOccurrence?.occurredAt ?? null,
      gamesSinceLastOccurrence: gameIndex >= 0 ? gameIndex : null,
      priority: recurrence?.priority ?? null,
      priorityReasons: recurrence?.priorityReasons ?? [],
      supportingEvidence: recurrence?.supportingEvidence ?? [],
    };
  }).toSorted((first, second) => (
    (first.priority ?? Number.MAX_SAFE_INTEGER) - (second.priority ?? Number.MAX_SAFE_INTEGER)
    || first.label.localeCompare(second.label)
  ));

  const newGamesNeeded = gamesBeforeReevaluation(games.length);
  const priorityConcept = concepts.find((concept) => (
    concept.priority !== null
    && concept.status !== "RESOLVED"
    && concept.status !== "INSUFFICIENT_EVIDENCE"
  ));
  const priority: ProgressPriority | null = priorityConcept ? {
    conceptSlug: priorityConcept.conceptSlug,
    label: priorityConcept.label,
    category: priorityConcept.category,
    status: priorityConcept.status,
    distinctGames: priorityConcept.distinctGames,
    historicalErrors: priorityConcept.historicalErrors,
    historicalMissedOpportunities: priorityConcept.historicalMissedOpportunities,
    lastOccurrenceAt: priorityConcept.lastOccurrenceAt,
    gamesSinceLastOccurrence: priorityConcept.gamesSinceLastOccurrence,
    trend: priorityConcept.trend,
    priorityReasons: priorityConcept.priorityReasons,
    supportingEvidence: priorityConcept.supportingEvidence,
    newGamesBeforeReevaluation: newGamesNeeded,
  } : null;

  const observedStrengths = concepts.flatMap((concept): ObservedStrength[] => {
    if (concept.recent.exposures < PROGRESS_READ_MODEL_POLICY.minimumComparableExposures) return [];
    if (concept.recent.successRate === null || concept.recent.successRate < PROGRESS_READ_MODEL_POLICY.minimumStrengthSuccessRate) return [];
    if (concept.status !== "RESOLVED" && concept.historicalStatus !== "INSUFFICIENT_EVIDENCE") return [];
    return [{
      conceptSlug: concept.conceptSlug,
      label: concept.label,
      category: concept.category,
      opportunities: concept.recent.exposures,
      correctlyTreated: concept.recent.correctlyTreated,
      successRate: concept.recent.successRate,
    }];
  });

  const byConcept = Object.fromEntries(concepts.map((concept) => [
    concept.conceptSlug,
    graphPoints(games, evidence, concept.conceptSlug),
  ]));

  // The player map is an observed success rate, not a synthetic rating. It
  // aggregates up to two ten-game windows so a single new game cannot replace
  // the whole profile. Fewer than five observed opportunities remains missing.
  const domains = PROGRESS_DOMAINS.map(({ category, label }): ProgressDomain => {
    const domainConcepts = concepts.filter((concept) => concept.category === category);
    const recentOpportunities = domainConcepts.reduce((sum, concept) => sum + concept.recent.exposures, 0);
    const recentSuccesses = domainConcepts.reduce((sum, concept) => sum + concept.recent.correctlyTreated, 0);
    const previousOpportunities = domainConcepts.reduce((sum, concept) => sum + concept.previous.exposures, 0);
    const previousSuccesses = domainConcepts.reduce((sum, concept) => sum + concept.previous.correctlyTreated, 0);
    const opportunities = recentOpportunities + previousOpportunities;
    const correctlyTreated = recentSuccesses + previousSuccesses;
    const successRate = opportunities >= PROGRESS_READ_MODEL_POLICY.minimumDomainExposures
      ? correctlyTreated / opportunities
      : null;
    const comparable = recentOpportunities >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures
      && previousOpportunities >= PROGRESS_READ_MODEL_POLICY.minimumComparableExposures;
    let trend: ProgressTrend = "INSUFFICIENT_DATA";
    if (comparable) {
      const recentRate = recentSuccesses / recentOpportunities;
      const previousRate = previousSuccesses / previousOpportunities;
      const delta = recentRate - previousRate;
      trend = delta >= PROGRESS_READ_MODEL_POLICY.minimumImprovementRateDrop
        ? "IMPROVING"
        : delta <= -PROGRESS_READ_MODEL_POLICY.minimumImprovementRateDrop ? "WORSENING" : "STABLE";
    }
    return {
      category,
      label,
      opportunities,
      correctlyTreated,
      failures: opportunities - correctlyTreated,
      successRate,
      observation: opportunities < PROGRESS_READ_MODEL_POLICY.minimumDomainExposures
        ? "INSUFFICIENT_DATA"
        : opportunities >= PROGRESS_READ_MODEL_POLICY.wellObservedDomainExposures ? "WELL_OBSERVED" : "OBSERVED",
      trend,
      conceptCount: domainConcepts.length,
    };
  });

  return {
    dataState,
    uniqueGames: games.length,
    gamesWithExposureData: games.filter((game) => game.hasExposureData).length,
    windows: {
      recentGames: recentGames.length,
      previousGames: previousGames.length,
      expectedPerWindow: 10,
    },
    concepts,
    priority,
    observedStrengths,
    domains,
    reevaluation: {
      newGamesNeeded,
      comparisonWindowGames: 20,
      checkpointEveryGames: 5,
    },
    graph: {
      blockSize: 5,
      overall: graphPoints(games, evidence),
      byConcept,
    },
  };
}
