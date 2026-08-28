import type {
  DiagnosticCategory,
  TrainingAttemptRecord,
  TrainingExercise,
} from "@/domain/chess/types";

export type TrainingFilter = "recommended" | "mix" | DiagnosticCategory;

function latestAttempts(attempts: TrainingAttemptRecord[]): Map<string, TrainingAttemptRecord> {
  const latest = new Map<string, TrainingAttemptRecord>();
  for (const attempt of [...attempts].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!latest.has(attempt.exerciseId)) latest.set(attempt.exerciseId, attempt);
  }
  return latest;
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
 * personal position → different position on the same theme → fresh material →
 * a previously failed review. A recently solved exact FEN is postponed while a
 * different position from the same category is available.
 */
export function buildTrainingSession(
  exercises: TrainingExercise[],
  attempts: TrainingAttemptRecord[],
  filter: TrainingFilter,
  limit = 7,
): TrainingExercise[] {
  const latest = latestAttempts(attempts);
  const filtered = filter === "recommended" || filter === "mix"
    ? exercises
    : exercises.filter((exercise) => exercise.category === filter);
  const unique = uniquePositions(filtered);
  const failed = unique.filter((exercise) => latest.get(exercise.id)?.result === "failed");
  const deferredSuccess = unique.filter((exercise) => latest.get(exercise.id)?.result === "success");
  const fresh = unique.filter((exercise) => !latest.has(exercise.id));
  const partial = unique.filter((exercise) => latest.get(exercise.id)?.result === "partial");

  const personal = fresh.filter((exercise) => exercise.origin === "personal");
  const primary = personal[0] ?? fresh[0] ?? partial[0] ?? failed[0];
  const sameTheme = primary
    ? fresh.filter((exercise) => exercise.id !== primary.id && exercise.theme === primary.theme)
    : [];
  const sameCategory = primary
    ? fresh.filter((exercise) => (
        exercise.id !== primary.id
        && exercise.category === primary.category
        && !sameTheme.some((candidate) => candidate.id === exercise.id)
      ))
    : [];
  const diverse = fresh.filter((exercise) => (
    exercise.id !== primary?.id
    && !sameTheme.some((candidate) => candidate.id === exercise.id)
    && !sameCategory.some((candidate) => candidate.id === exercise.id)
  ));

  const conceptBridge = [...sameTheme, ...sameCategory].slice(0, 2);
  const remainingFresh = [...sameTheme, ...sameCategory, ...diverse].filter((exercise) => (
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
    ...deferredSuccess,
  ]);
  return ordered.slice(0, limit);
}
