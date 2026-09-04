import type {
  DiagnosticCategory,
  EngineEvaluation,
  PedagogyExerciseType,
  PlayerProfile,
  TrainingCandidateLine,
  TrainingExercise,
} from "@/domain/chess/types";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";
import { conceptExercisesForSlug } from "./library-runtime";
import { withTrainingTaxonomy } from "./taxonomy";

export const PEDAGOGY_PROMPT_VERSION = "training-phase1-v1";
const CACHE_STORAGE_KEY = "chesspath-pedagogy-cache-v1";
const MAX_COACHED_POSITIONS = 5;

export type PedagogyCandidate = {
  exerciseId: string;
  cacheKey: string;
  fen: string;
  sideToMove: "w" | "b";
  eloBand: string;
  playedMove?: string;
  evaluationBeforeCp: number;
  evaluationAfterCp?: number;
  lossCp?: number;
  stockfishCandidates: TrainingCandidateLine[];
  assumedCategory: DiagnosticCategory;
  assumedConcept: string;
  origin: "personal" | "concept";
  phase: TrainingExercise["phase"];
};

export type PedagogyDecision = {
  exerciseId: string;
  cacheKey: string;
  worthTraining: boolean;
  pedagogicalScore: number;
  category: DiagnosticCategory;
  conceptSlug: string;
  conceptLabel: string;
  exerciseType: PedagogyExerciseType;
  rootCause: string;
  learningGoal: string;
  question: string;
  rejectReason: string | null;
  conceptMoveUcis: string[];
};

export type PedagogyBatchResponse = {
  status: "coached" | "unavailable";
  decisions: PedagogyDecision[];
};

export type PedagogyEngine = {
  analyze: (
    fen: string,
    options: { depth: number; multiPv: number; timeoutMs: number },
  ) => Promise<EngineEvaluation>;
};

export type PedagogyCache = {
  get: (key: string) => PedagogyDecision | undefined;
  set: (key: string, decision: PedagogyDecision) => void;
};

function eloBand(profile: PlayerProfile): string {
  const rating = profile.rating
    ?? profile.ratings?.rapid
    ?? profile.ratings?.blitz
    ?? profile.ratings?.bullet;
  if (!rating) return "niveau intermédiaire non précisé";
  if (rating < 1_000) return "moins de 1000";
  if (rating < 1_400) return "1000-1399";
  if (rating < 1_800) return "1400-1799";
  return "1800 et plus";
}

function compactHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function cacheKeyFor(
  exercise: TrainingExercise,
  band: string,
  candidates: TrainingCandidateLine[],
): string {
  return `${PEDAGOGY_PROMPT_VERSION}:${compactHash(JSON.stringify({
    fen: exercise.fen,
    playedMove: exercise.playedMove,
    before: exercise.baselinePlayerCp,
    after: exercise.playedMovePlayerCp,
    category: exercise.category,
    band,
    candidates,
  }))}`;
}

function candidateFor(
  exercise: TrainingExercise,
  band: string,
): PedagogyCandidate | null {
  const stockfishCandidates = exercise.engineCandidates?.filter((line) => line.uci).slice(0, 3) ?? [];
  if (!stockfishCandidates.length) return null;
  return {
    exerciseId: exercise.id,
    cacheKey: cacheKeyFor(exercise, band, stockfishCandidates),
    fen: exercise.fen,
    sideToMove: exercise.fen.split(" ")[1] === "b" ? "b" : "w",
    eloBand: band,
    playedMove: exercise.playedMove,
    evaluationBeforeCp: exercise.baselinePlayerCp,
    evaluationAfterCp: exercise.playedMovePlayerCp,
    lossCp: exercise.lossCp,
    stockfishCandidates,
    assumedCategory: exercise.category,
    assumedConcept: exercise.conceptSlug || exercise.theme,
    origin: exercise.origin,
    phase: exercise.phase,
  };
}

function normalizeDecision(
  candidate: PedagogyCandidate,
  decision: PedagogyDecision,
): PedagogyDecision | null {
  if (decision.cacheKey !== candidate.cacheKey) return null;
  if (typeof decision.worthTraining !== "boolean"
    || typeof decision.pedagogicalScore !== "number"
    || typeof decision.conceptSlug !== "string"
    || typeof decision.conceptLabel !== "string"
    || typeof decision.rootCause !== "string"
    || typeof decision.learningGoal !== "string"
    || typeof decision.question !== "string"
    || !Array.isArray(decision.conceptMoveUcis)) return null;
  if (!decision.worthTraining) {
    return { ...decision, exerciseId: candidate.exerciseId, conceptMoveUcis: [] };
  }

  const bestCp = Math.max(...candidate.stockfishCandidates.map((line) => line.playerCp));
  const soundMoves = new Set(candidate.stockfishCandidates
    .filter((line) => bestCp - line.playerCp <= 100)
    .map((line) => line.uci));
  const conceptMoveUcis = [...new Set(decision.conceptMoveUcis.filter((uci) => soundMoves.has(uci)))];
  if (!conceptMoveUcis.length || !decision.conceptSlug.trim()) return null;
  return {
    ...decision,
    exerciseId: candidate.exerciseId,
    pedagogicalScore: Math.max(0, Math.min(100, Math.round(decision.pedagogicalScore))),
    conceptSlug: decision.conceptSlug.trim(),
    conceptMoveUcis,
  };
}

function applyDecisions(
  exercises: TrainingExercise[],
  candidates: PedagogyCandidate[],
  decisions: PedagogyDecision[],
): TrainingExercise[] {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.exerciseId, candidate]));
  const normalized = new Map<string, PedagogyDecision>();
  for (const decision of decisions) {
    const candidate = candidatesById.get(decision.exerciseId);
    if (!candidate) continue;
    const safe = normalizeDecision(candidate, decision);
    if (safe) normalized.set(safe.exerciseId, safe);
  }

  const personal: TrainingExercise[] = [];
  const existingConcepts: TrainingExercise[] = [];
  for (const exercise of exercises) {
    if (exercise.origin === "concept") {
      existingConcepts.push(exercise);
      continue;
    }
    const decision = normalized.get(exercise.id);
    if (decision?.worthTraining === false) continue;
    if (!decision) {
      personal.push(exercise);
      continue;
    }
    personal.push(withTrainingTaxonomy({
      ...exercise,
      category: decision.category,
      conceptSlug: decision.conceptSlug,
      domain: decision.category,
      primaryConcept: decision.conceptSlug,
      prompt: decision.question,
      concept: decision.learningGoal,
      pedagogy: {
        promptVersion: PEDAGOGY_PROMPT_VERSION,
        cacheKey: decision.cacheKey,
        pedagogicalScore: decision.pedagogicalScore,
        conceptSlug: decision.conceptSlug,
        conceptLabel: decision.conceptLabel,
        exerciseType: decision.exerciseType,
        rootCause: decision.rootCause,
        learningGoal: decision.learningGoal,
        question: decision.question,
        conceptMoveUcis: decision.conceptMoveUcis,
      },
    }));
  }

  const bridge = personal[0]
    ? conceptExercisesForSlug(personal[0].conceptSlug, 2)
    : [];
  const bridgeIds = new Set(bridge.map((exercise) => exercise.id));
  const fallbackConcepts = existingConcepts.filter((exercise) => !bridgeIds.has(exercise.id));
  const ordered = personal.length
    ? [personal[0], ...bridge, ...personal.slice(1), ...fallbackConcepts]
    : fallbackConcepts;
  const seenFens = new Set<string>();
  return ordered.filter((exercise) => {
    if (seenFens.has(exercise.fen)) return false;
    seenFens.add(exercise.fen);
    return true;
  });
}

function browserCache(): PedagogyCache | undefined {
  if (typeof window === "undefined") return undefined;
  let values: Record<string, PedagogyDecision>;
  try {
    const stored = window.localStorage.getItem(CACHE_STORAGE_KEY);
    values = stored ? JSON.parse(stored) as Record<string, PedagogyDecision> : {};
  } catch {
    values = {};
  }
  function persist(): void {
    try {
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(values));
    } catch {
      // A disabled browser cache must never block Stockfish training.
    }
  }
  return {
    get: (key) => values[key],
    set: (key, decision) => {
      delete values[key];
      const entries = [...Object.entries(values), [key, decision] as const].slice(-100);
      values = Object.fromEntries(entries);
      persist();
    },
  };
}

async function addStockfishCandidates(
  exercise: TrainingExercise,
  engine: PedagogyEngine,
): Promise<TrainingExercise> {
  if (exercise.pedagogy || exercise.origin !== "personal") return exercise;
  try {
    const evaluation = await engine.analyze(exercise.fen, {
      depth: 10,
      multiPv: 3,
      timeoutMs: 30_000,
    });
    return {
      ...exercise,
      bestMove: evaluation.bestMove || exercise.bestMove,
      solutionLine: evaluation.lines[0]?.pv.slice(0, exercise.maxPlayerMoves * 2 - 1)
        ?? exercise.solutionLine,
      engineCandidates: evaluation.lines
        .filter((line) => line.pv[0])
        .slice(0, 3)
        .map((line) => ({
          uci: line.pv[0],
          playerCp: evaluationForPlayer(line.whiteCp, exercise.playerColor),
          whiteCentricCp: line.whiteCp,
          pv: line.pv.slice(0, 6),
        })),
    };
  } catch {
    return exercise;
  }
}

function isBatchResponse(value: unknown): value is PedagogyBatchResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PedagogyBatchResponse>;
  return (candidate.status === "coached" || candidate.status === "unavailable")
    && Array.isArray(candidate.decisions);
}

export async function coachTrainingExercises({
  exercises,
  profile,
  engine,
  fetcher = fetch,
  cache = browserCache(),
}: {
  exercises: TrainingExercise[];
  profile: PlayerProfile;
  engine: PedagogyEngine;
  fetcher?: typeof fetch;
  cache?: PedagogyCache;
}): Promise<TrainingExercise[]> {
  const personalToCoach = exercises
    .filter((exercise) => exercise.origin === "personal" && !exercise.pedagogy)
    .slice(0, MAX_COACHED_POSITIONS);
  if (!personalToCoach.length) return exercises;

  const preparedById = new Map<string, TrainingExercise>();
  for (const exercise of personalToCoach) {
    preparedById.set(exercise.id, await addStockfishCandidates(exercise, engine));
  }
  const prepared = exercises.map((exercise) => preparedById.get(exercise.id) ?? exercise);
  const band = eloBand(profile);
  const candidates = prepared
    .map((exercise) => exercise.origin === "personal" && !exercise.pedagogy
      ? candidateFor(exercise, band)
      : null)
    .filter((candidate): candidate is PedagogyCandidate => Boolean(candidate))
    .slice(0, MAX_COACHED_POSITIONS);
  if (!candidates.length) return prepared;

  const cached: PedagogyDecision[] = [];
  const missing: PedagogyCandidate[] = [];
  for (const candidate of candidates) {
    const hit = cache?.get(candidate.cacheKey);
    if (hit) cached.push({ ...hit, exerciseId: candidate.exerciseId, cacheKey: candidate.cacheKey });
    else missing.push(candidate);
  }

  let received: PedagogyDecision[] = [];
  if (missing.length) {
    try {
      const response = await fetcher("/api/training/pedagogy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: missing }),
      });
      if (response.ok) {
        const payload: unknown = await response.json();
        if (isBatchResponse(payload) && payload.status === "coached") received = payload.decisions;
      }
    } catch {
      // The pedagogical layer is optional; Stockfish exercises remain usable.
    }
  }

  const normalizedReceived: PedagogyDecision[] = [];
  for (const decision of received) {
    const candidate = missing.find((item) => item.exerciseId === decision.exerciseId);
    if (!candidate) continue;
    const safe = normalizeDecision(candidate, decision);
    if (!safe) continue;
    normalizedReceived.push(safe);
    cache?.set(safe.cacheKey, safe);
  }
  return applyDecisions(prepared, candidates, [...cached, ...normalizedReceived]);
}
