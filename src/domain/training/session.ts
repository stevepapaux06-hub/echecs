import type {
  DiagnosticCategory,
  TrainingAttemptRecord,
  TrainingExercise,
} from "@/domain/chess/types";
import { conceptDefinition, normalizeConceptSlug } from "../knowledge/concepts";

export type TrainingFilter = "recommended" | "mix" | DiagnosticCategory | `concept:${string}`;

const BROAD_META_CONCEPTS = new Set(["forcing_moves"]);

export function conceptTrainingFilter(conceptSlug: string): TrainingFilter {
  return `concept:${normalizeConceptSlug(conceptSlug)}`;
}

export function conceptFromTrainingFilter(filter: TrainingFilter): string | null {
  return filter.startsWith("concept:") ? normalizeConceptSlug(filter.slice("concept:".length)) : null;
}

export function supportsExactTransfer(conceptSlug: string): boolean {
  return !BROAD_META_CONCEPTS.has(normalizeConceptSlug(conceptSlug));
}

export function preciseConcept(exercise: TrainingExercise): string {
  return normalizeConceptSlug(exercise.pedagogy?.conceptSlug || exercise.conceptSlug || `legacy-${exercise.id}`);
}

export function sharesPreciseConcept(
  first: TrainingExercise,
  second: TrainingExercise,
): boolean {
  return preciseConcept(first) === preciseConcept(second);
}

export function nextExerciseIndex(current: number, total: number): number | null {
  return current + 1 < total ? current + 1 : null;
}

type AttemptHistory = {
  latest: TrainingAttemptRecord;
  attempts: number;
  successes: number;
  failures: number;
};

function attemptHistory(attempts: TrainingAttemptRecord[]): Map<string, AttemptHistory> {
  const history = new Map<string, AttemptHistory>();
  for (const attempt of [...attempts].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const previous = history.get(attempt.exerciseId);
    history.set(attempt.exerciseId, {
      latest: previous?.latest ?? attempt,
      attempts: (previous?.attempts ?? 0) + 1,
      successes: (previous?.successes ?? 0) + Number(attempt.result === "success"),
      failures: (previous?.failures ?? 0) + Number(attempt.result === "failed"),
    });
  }
  return history;
}

function uniquePositions(exercises: TrainingExercise[]): TrainingExercise[] {
  const fens = new Set<string>();
  return exercises.filter((exercise) => {
    if (fens.has(exercise.fen)) return false;
    fens.add(exercise.fen);
    return true;
  });
}

/**
 * Builds a deterministic spaced-practice session:
 * personal position → different position on the same precise concept → fresh material →
 * a previously failed review. A recently solved exact FEN is postponed while a
 * different position from the same category is available.
 */
export function buildTrainingSession(
  exercises: TrainingExercise[],
  attempts: TrainingAttemptRecord[],
  filter: TrainingFilter,
  limit = 7,
  options: {
    now?: number;
    userRating?: number;
    priorityConcept?: string;
    excludeExerciseIds?: ReadonlySet<string>;
  } = {},
): TrainingExercise[] {
  const history = attemptHistory(attempts);
  const now = options.now ?? Date.now();
  const requestedConcept = conceptFromTrainingFilter(filter);
  const normalizedPriority = options.priorityConcept
    ? normalizeConceptSlug(options.priorityConcept)
    : null;
  const priorityConcept = filter === "recommended"
    && normalizedPriority
    && supportsExactTransfer(normalizedPriority)
    && exercises.some((exercise) => preciseConcept(exercise) === normalizedPriority)
    ? normalizedPriority
    : null;
  const exactConcept = requestedConcept ?? priorityConcept;
  const strategySelection = filter === "strategy"
    || (exactConcept ? conceptDefinition(exactConcept)?.category === "strategy" : false);
  const filtered = (exactConcept
    ? exercises.filter((exercise) => preciseConcept(exercise) === exactConcept)
    : filter === "recommended" || filter === "mix"
      ? exercises
      : exercises.filter((exercise) => exercise.category === filter))
    .filter((exercise) => !options.excludeExerciseIds?.has(exercise.id))
    .filter((exercise) => exercise.source !== "lichess" || (exercise.classificationConfidence ?? 1) >= 0.8)
    .filter((exercise) => !strategySelection || (
      exercise.phase === "middlegame"
      && exercise.baselinePlayerCp >= -150
      && exercise.baselinePlayerCp <= 150
    ));
  const unique = uniquePositions(filtered);
  const ageDays = (exercise: TrainingExercise): number => {
    const date = history.get(exercise.id)?.latest.createdAt;
    return date ? Math.max(0, (now - Date.parse(date)) / 86_400_000) : Number.POSITIVE_INFINITY;
  };
  const successesByConcept = new Map<string, number>();
  for (const attempt of attempts) {
    if (attempt.result !== "success") continue;
    const concept = normalizeConceptSlug(attempt.theme);
    successesByConcept.set(concept, (successesByConcept.get(concept) ?? 0) + 1);
  }
  const adapted = (values: TrainingExercise[]): TrainingExercise[] => values.toSorted((first, second) => {
    const score = (exercise: TrainingExercise): number => {
      const concept = preciseConcept(exercise);
      const progression = Math.min(250, (successesByConcept.get(concept) ?? 0) * 35);
      const target = (options.userRating ?? exercise.difficulty ?? 1_200) + progression;
      const difficultyDistance = exercise.difficulty === undefined ? 500 : Math.abs(exercise.difficulty - target);
      return (exercise.qualityScore ?? 0) * 3 - difficultyDistance + Number(exercise.origin === "personal") * 40;
    };
    return score(second) - score(first) || first.id.localeCompare(second.id);
  });
  const failed = adapted(unique.filter((exercise) => (
    history.get(exercise.id)?.latest.result === "failed" && ageDays(exercise) >= 1
  )));
  const reviewSuccess = adapted(unique.filter((exercise) => (
    history.get(exercise.id)?.latest.result === "success" && ageDays(exercise) >= 21
  )));
  const fresh = adapted(unique.filter((exercise) => !history.has(exercise.id)));
  const partial = adapted(unique.filter((exercise) => (
    history.get(exercise.id)?.latest.result === "partial" && ageDays(exercise) >= 3
  )));

  const personal = fresh.filter((exercise) => exercise.origin === "personal");
  const primary = personal[0] ?? fresh[0] ?? partial[0] ?? failed[0];
  const sameConcept = primary
    ? fresh.filter((exercise) => (
        exercise.id !== primary.id && sharesPreciseConcept(exercise, primary)
      ))
    : [];
  const sameCategory = primary
    ? fresh.filter((exercise) => (
        exercise.id !== primary.id
        && exercise.category === primary.category
        && !sameConcept.some((candidate) => candidate.id === exercise.id)
      ))
    : [];
  const diverse = fresh.filter((exercise) => (
    exercise.id !== primary?.id
    && !sameConcept.some((candidate) => candidate.id === exercise.id)
    && !sameCategory.some((candidate) => candidate.id === exercise.id)
  ));

  const conceptBridge = sameConcept.slice(0, 2);
  const remainingFresh = [...sameConcept, ...sameCategory, ...diverse].filter((exercise) => (
    !conceptBridge.some((candidate) => candidate.id === exercise.id)
  ));
  const ordered = uniquePositions([
    ...(primary ? [primary] : []),
    ...conceptBridge,
    // Failed material returns after a short context change, not immediately and
    // not so late that a seven-position session can omit it altogether.
    ...failed.slice(0, 1),
    ...remainingFresh,
    ...partial,
    ...failed.slice(1),
    ...reviewSuccess,
  ]);
  return ordered.slice(0, limit);
}
