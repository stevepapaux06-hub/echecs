import type {
  DiagnosticCategory,
  TrainingAttemptRecord,
  TrainingExercise,
} from "@/domain/chess/types";
import { conceptDefinition, normalizeConceptSlug } from "../knowledge/concepts";
import { trainingTaxonomy } from "./taxonomy";

export type TrainingFilter = "recommended" | "mix" | DiagnosticCategory | `concept:${string}`;
export type TrainingSourceFilter = "mix" | "personal" | "bank";

const BROAD_META_CONCEPTS = new Set(["forcing_moves"]);
const DOMAINS = new Set<DiagnosticCategory>(["tactic", "strategy", "endgame", "opening", "conversion", "defense"]);
export const DEFAULT_TRAINING_BATCH_SIZE = 12;

export function conceptTrainingFilter(
  conceptSlug: string,
  domain?: DiagnosticCategory,
): Extract<TrainingFilter, `concept:${string}`> {
  return domain
    ? `concept:${domain}:${normalizeConceptSlug(conceptSlug)}`
    : `concept:${normalizeConceptSlug(conceptSlug)}`;
}

export function conceptFromTrainingFilter(filter: TrainingFilter): string | null {
  if (!filter.startsWith("concept:")) return null;
  const payload = filter.slice("concept:".length);
  const [maybeDomain, ...slugParts] = payload.split(":");
  return normalizeConceptSlug(DOMAINS.has(maybeDomain as DiagnosticCategory) && slugParts.length
    ? slugParts.join(":")
    : payload);
}

export function domainFromTrainingFilter(filter: TrainingFilter): DiagnosticCategory | null {
  if (!filter.startsWith("concept:")) return null;
  const maybeDomain = filter.slice("concept:".length).split(":")[0] as DiagnosticCategory;
  return DOMAINS.has(maybeDomain) ? maybeDomain : null;
}

export function supportsExactTransfer(conceptSlug: string): boolean {
  return !BROAD_META_CONCEPTS.has(normalizeConceptSlug(conceptSlug));
}

export function preciseConcept(exercise: TrainingExercise): string {
  const taxonomy = trainingTaxonomy(exercise);
  const primary = normalizeConceptSlug(exercise.pedagogy?.conceptSlug || taxonomy.primaryConcept || `legacy-${exercise.id}`);
  if (!BROAD_META_CONCEPTS.has(primary)) return primary;
  return taxonomy.secondaryConcepts.find((concept) => !BROAD_META_CONCEPTS.has(concept)) ?? primary;
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

export function trainingPoolForFilter(
  exercises: TrainingExercise[],
  filter: Exclude<TrainingFilter, "recommended">,
  sourceFilter: TrainingSourceFilter = "mix",
): TrainingExercise[] {
  const requestedConcept = conceptFromTrainingFilter(filter);
  const requestedDomain = domainFromTrainingFilter(filter);
  const strategySelection = filter === "strategy" || requestedDomain === "strategy"
    || (requestedConcept ? conceptDefinition(requestedConcept)?.category === "strategy" : false);
  return uniquePositions(exercises
    .filter((exercise) => requestedConcept
      ? preciseConcept(exercise) === requestedConcept
        && (!requestedDomain || trainingTaxonomy(exercise).domain === requestedDomain)
      : filter === "mix" || trainingTaxonomy(exercise).domain === filter)
    .filter((exercise) => sourceFilter === "personal"
      ? exercise.origin === "personal"
      : sourceFilter === "bank"
        ? exercise.origin === "concept"
        : true)
    .filter((exercise) => trainingTaxonomy(exercise).confidence >= 0.8)
    .filter((exercise) => !strategySelection || (
      exercise.phase === "middlegame"
      && exercise.baselinePlayerCp >= -150
      && exercise.baselinePlayerCp <= 150
    )));
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

function seededRandom(seed: string | number): () => number {
  let state = 2_166_136_261;
  for (const character of String(seed)) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16_777_619);
  }
  return () => {
    state += 0x6d2b79f5;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function sourceGame(exercise: TrainingExercise): string {
  return exercise.sourceGameId
    ?? exercise.gameUrl?.match(/lichess\.org\/([A-Za-z0-9]{8,12})/)?.[1]
    ?? exercise.sourceId
    ?? exercise.id;
}

function hasSharedPlayer(first: TrainingExercise | undefined, second: TrainingExercise): boolean {
  if (!first?.sourcePlayers?.length || !second.sourcePlayers?.length) return false;
  return first.sourcePlayers.some((player) => second.sourcePlayers?.includes(player));
}

/**
 * Builds a deterministic spaced-practice batch for a continuous training flow:
 * personal position → different position on the same precise concept → fresh material →
 * a previously failed review. A recently solved exact FEN is postponed while a
 * different position from the same category is available.
 */
export function buildTrainingSession(
  exercises: TrainingExercise[],
  attempts: TrainingAttemptRecord[],
  filter: TrainingFilter,
  batchSize = DEFAULT_TRAINING_BATCH_SIZE,
  options: {
    now?: number;
    userRating?: number;
    priorityConcept?: string;
    priorityDomain?: DiagnosticCategory;
    excludeExerciseIds?: ReadonlySet<string>;
    sourceFilter?: TrainingSourceFilter;
    seed?: string | number;
  } = {},
): TrainingExercise[] {
  const history = attemptHistory(attempts);
  const now = options.now ?? Date.now();
  const requestedConcept = conceptFromTrainingFilter(filter);
  const requestedDomain = domainFromTrainingFilter(filter);
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
  const exactDomain = requestedDomain ?? (priorityConcept ? options.priorityDomain ?? null : null);
  const filteredByLesson = (exactConcept
    ? exercises.filter((exercise) => preciseConcept(exercise) === exactConcept
      && (!exactDomain || trainingTaxonomy(exercise).domain === exactDomain))
    : filter === "recommended" || filter === "mix"
      ? exercises
      : exercises.filter((exercise) => trainingTaxonomy(exercise).domain === filter));
  const strategySelection = filter === "strategy" || exactDomain === "strategy"
    || (exactConcept ? conceptDefinition(exactConcept)?.category === "strategy" : false);
  const filtered = filteredByLesson
    .filter((exercise) => options.sourceFilter === "personal"
      ? exercise.origin === "personal"
      : options.sourceFilter === "bank"
        ? exercise.origin === "concept"
        : true)
    .filter((exercise) => !options.excludeExerciseIds?.has(exercise.id))
    .filter((exercise) => trainingTaxonomy(exercise).confidence >= 0.8)
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
  const random = seededRandom(options.seed ?? `${now}:${filter}:${attempts.length}:${unique.length}`);
  const score = (exercise: TrainingExercise): number => {
    const concept = preciseConcept(exercise);
    const progression = Math.min(250, (successesByConcept.get(concept) ?? 0) * 35);
    const target = (options.userRating ?? exercise.difficulty ?? 1_200) + progression;
    const difficultyDistance = exercise.difficulty === undefined ? 500 : Math.abs(exercise.difficulty - target);
    return (exercise.qualityScore ?? 0) * 3 - difficultyDistance + Number(exercise.origin === "personal") * 40;
  };
  const adapted = (values: TrainingExercise[]): TrainingExercise[] => {
    const remaining = values
      .map((exercise) => ({ exercise, noise: random() * 160 }))
      .toSorted((first, second) => (
        score(second.exercise) + second.noise - score(first.exercise) - first.noise
      ))
      .slice(0, Math.max(240, batchSize * 20));
    const ordered: TrainingExercise[] = [];
    while (remaining.length) {
      const previous = ordered.at(-1);
      const diversityPenalty = (candidate: TrainingExercise): number => (
        Number(Boolean(previous) && sourceGame(previous!) === sourceGame(candidate)) * 4_000
        + Number(hasSharedPlayer(previous, candidate)) * 800
        + Number(Boolean(previous?.pawnStructureSignature)
          && previous?.pawnStructureSignature === candidate.pawnStructureSignature) * 320
        + Number(Boolean(previous?.materialSignature)
          && previous?.materialSignature === candidate.materialSignature) * 180
        + Number(Boolean(previous?.planSignature)
          && previous?.planSignature === candidate.planSignature) * 1_200
      );
      remaining.sort((first, second) => {
        const firstScore = score(first.exercise) + first.noise - diversityPenalty(first.exercise);
        const secondScore = score(second.exercise) + second.noise - diversityPenalty(second.exercise);
        return secondScore - firstScore || first.exercise.id.localeCompare(second.exercise.id);
      });
      ordered.push(remaining.shift()!.exercise);
    }
    return ordered;
  };
  const failed = adapted(unique.filter((exercise) => (
    history.get(exercise.id)?.latest.result === "failed" && ageDays(exercise) >= 1
  )));
  const reviewSuccess = adapted(unique.filter((exercise) => (
    history.get(exercise.id)?.latest.result === "success" && ageDays(exercise) >= 21
  )));
  const allFresh = unique.filter((exercise) => !history.has(exercise.id));
  const fresh = adapted(allFresh);
  const partial = adapted(unique.filter((exercise) => (
    history.get(exercise.id)?.latest.result === "partial" && ageDays(exercise) >= 3
  )));

  const personal = adapted(allFresh.filter((exercise) => exercise.origin === "personal"));
  const primary = personal[0] ?? fresh[0] ?? partial[0] ?? failed[0];
  const sameConcept = primary
    ? fresh.filter((exercise) => (
        exercise.id !== primary.id && sharesPreciseConcept(exercise, primary)
      ))
    : [];
  const sameCategory = primary
    ? fresh.filter((exercise) => (
        exercise.id !== primary.id
        && trainingTaxonomy(exercise).domain === trainingTaxonomy(primary).domain
        && !sameConcept.some((candidate) => candidate.id === exercise.id)
      ))
    : [];
  const diverse = fresh.filter((exercise) => (
    exercise.id !== primary?.id
    && !sameConcept.some((candidate) => candidate.id === exercise.id)
    && !sameCategory.some((candidate) => candidate.id === exercise.id)
  ));

  const conceptBridge = sameConcept
    .toSorted((first, second) => (
      Number(sourceGame(first) === sourceGame(primary!)) - Number(sourceGame(second) === sourceGame(primary!))
    ))
    .slice(0, 2);
  const remainingFresh = [...sameConcept, ...sameCategory, ...diverse].filter((exercise) => (
    !conceptBridge.some((candidate) => candidate.id === exercise.id)
  ));
  const ordered = uniquePositions([
    ...(primary ? [primary] : []),
    ...conceptBridge,
    // Failed material returns after a short context change, not immediately and
    // not so late that a short recommended batch can omit it altogether.
    ...failed.slice(0, 1),
    ...remainingFresh,
    ...partial,
    ...failed.slice(1),
    ...reviewSuccess,
  ]);
  const prefixLength = primary?.origin === "personal"
    ? conceptBridge.length ? 2 : 1
    : failed.length ? 1 : 0;
  const diverseOrder: TrainingExercise[] = ordered.slice(0, prefixLength);
  // A failed position is an explicit review promise. Pin one after the fresh
  // opening context before the source-diversity scheduler distributes the
  // remaining bank; otherwise a very large source group could push it outside
  // a short recommended batch.
  const pinnedFailure = failed.find((exercise) => (
    !diverseOrder.some((candidate) => candidate.id === exercise.id)
  ));
  if (pinnedFailure) diverseOrder.push(pinnedFailure);
  const sourceGroups = new Map<string, TrainingExercise[]>();
  for (const exercise of ordered.slice(prefixLength)) {
    if (exercise.id === pinnedFailure?.id) continue;
    const key = sourceGame(exercise);
    sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), exercise]);
  }
  while (sourceGroups.size) {
    const previousSource = diverseOrder.length ? sourceGame(diverseOrder.at(-1)!) : null;
    const forcedPersonalSource = diverseOrder.length === 0 && ordered[0]?.origin === "personal"
      ? sourceGame(ordered[0])
      : null;
    const candidates = [...sourceGroups.entries()]
      .filter(([source]) => source !== previousSource || sourceGroups.size === 1)
      .toSorted((first, second) => (
        Number(second[0] === forcedPersonalSource) - Number(first[0] === forcedPersonalSource)
        || second[1].length - first[1].length
        || ordered.indexOf(first[1][0]) - ordered.indexOf(second[1][0])
      ));
    const [source, values] = candidates[0];
    diverseOrder.push(values.shift()!);
    if (!values.length) sourceGroups.delete(source);
  }
  return diverseOrder.slice(0, batchSize);
}
