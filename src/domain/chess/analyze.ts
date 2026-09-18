import type {
  AnalysisPayload,
  AnalyzedGame,
  AnalyzedMove,
  CompleteAnalysis,
  CandidateAuditEntry,
  DiagnosticMetrics,
  EngineEvaluation,
  MoveSnapshot,
  ParsedGame,
  TrainingContentResolution,
  TrainingExercise,
} from "./types";
import { calculateMetrics } from "../diagnostic/metrics";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";
import { patternsForAnalyzedMove, structureForPosition } from "../patterns/engine";
import { patternCandidatesForPosition, type PatternOccurrence, type PositionPatternCandidate } from "../patterns/engine";
import type { PawnStructureRecognition } from "../knowledge/pawn-structures";
import type { PedagogicalAssessment } from "../diagnostic/pedagogical-score";
import { scorePedagogicalMoment } from "../diagnostic/pedagogical-score";
import {
  assessMultiPvStability,
  MAX_ADAPTIVE_STABILITY_POSITIONS,
  MULTIPV_MAX_DEPTH,
  MULTIPV_STABILITY_DEPTH_STEP,
  needsAdaptiveMultiPvProbe,
} from "./multipv-stability";
import { detectRecurringWeaknesses } from "../diagnostic/recurring-weaknesses";
import type { AnalysisPhase } from "./analysis-progress";
import {
  createAnalysisTimer,
  measureAnalysisPhase,
  measureAnalysisPhaseAsync,
  yieldToMainThread,
} from "./main-thread";

export type AnalysisProgress = {
  phase: AnalysisPhase;
  completed: number;
  total: number;
  label: string;
};

export type PositionEvaluator = {
  evaluate: (fen: string, depth?: number, multiPv?: number) => Promise<EngineEvaluation>;
};

export type AnalysisPostprocessResult = {
  exercises: TrainingExercise[];
  auditTrail: CandidateAuditEntry[];
  bankResolution: TrainingContentResolution;
};

export type AnalysisPostprocessor = (
  games: AnalyzedGame[],
  metrics: DiagnosticMetrics,
) => Promise<AnalysisPostprocessResult>;

export type PatternClassificationInput = { move: AnalyzedMove; playerRating: number };
export type PatternClassification = {
  patterns: PatternOccurrence[];
  pawnStructure: PawnStructureRecognition;
  pedagogical: PedagogicalAssessment;
};
export type AnalysisPatternProcessor = {
  scan: (moves: MoveSnapshot[]) => Promise<PositionPatternCandidate[][]>;
  classify: (
    items: PatternClassificationInput[],
    onProgress?: (completed: number, total: number) => void,
  ) => Promise<PatternClassification[]>;
};

function analysisBudget(gameCount: number): {
  movesPerGame: number;
  patternPositionsPerGame: number;
  firstDepth: number;
  deepPositions: number;
} {
  if (gameCount <= 5) return { movesPerGame: 32, patternPositionsPerGame: 12, firstDepth: 8, deepPositions: 20 };
  if (gameCount <= 10) return { movesPerGame: 24, patternPositionsPerGame: 10, firstDepth: 8, deepPositions: 30 };
  if (gameCount <= 25) return { movesPerGame: 12, patternPositionsPerGame: 8, firstDepth: 7, deepPositions: 45 };
  if (gameCount <= 50) return { movesPerGame: 7, patternPositionsPerGame: 6, firstDepth: 6, deepPositions: 60 };
  return { movesPerGame: 4, patternPositionsPerGame: 4, firstDepth: 5, deepPositions: 80 };
}

async function movesToAnalyze(
  moves: MoveSnapshot[],
  playerColor: "white" | "black",
  limit: number,
  patternLimit: number,
  patternProcessor?: AnalysisPatternProcessor,
): Promise<MoveSnapshot[]> {
  const color = playerColor === "white" ? "w" : "b";
  const candidates = moves.filter((move) => move.color === color && move.ply >= 8 && move.ply <= 100);
  if (candidates.length <= limit) return candidates;
  const step = (candidates.length - 1) / Math.max(1, limit - 1);
  const uniform = Array.from({ length: limit }, (_, index) => candidates[Math.round(index * step)]);
  // Pattern detection enumerates legal moves. Bound that work before scanning
  // so a long game cannot stall the whole multi-game analysis.
  const patternScanLimit = Math.max(limit, patternLimit * 3);
  const patternScan = candidates.length <= patternScanLimit
    ? candidates
    : Array.from({ length: patternScanLimit }, (_, index) => (
        candidates[Math.round(index * (candidates.length - 1) / Math.max(1, patternScanLimit - 1))]
      ));
  const scanned = patternProcessor
    ? await patternProcessor.scan(patternScan)
    : patternScan.map((move) => (
        patternCandidatesForPosition(move.fenBefore, { phase: move.phase, ply: move.ply })
      ));
  const scannedPatterns = patternScan.map((move, index) => ({ move, patterns: scanned[index] ?? [] }));
  const patternDriven = scannedPatterns
    .filter((item) => item.patterns.length > 0)
    .toSorted((first, second) => (
      Math.max(...second.patterns.map((pattern) => pattern.confidence))
      - Math.max(...first.patterns.map((pattern) => pattern.confidence))
      || Number(second.move.phase === "middlegame") - Number(first.move.phase === "middlegame")
      || first.move.ply - second.move.ply
    ))
    .slice(0, patternLimit)
    .map((item) => item.move);
  const byPly = new Map([...uniform, ...patternDriven].map((move) => [move.ply, move]));
  return [...byPly.values()].toSorted((first, second) => first.ply - second.ply);
}

export async function analyzePayload(
  payload: AnalysisPayload,
  engine: PositionEvaluator,
  onProgress: (progress: AnalysisProgress) => void,
  postprocess?: AnalysisPostprocessor,
  patternProcessor?: AnalysisPatternProcessor,
): Promise<CompleteAnalysis> {
  const games = payload.games.slice(0, 100);
  const budget = analysisBudget(games.length);
  const selected: Array<{ game: ParsedGame; moves: MoveSnapshot[] }> = await measureAnalysisPhaseAsync(
    "présélection des positions",
    async () => {
      const selection: Array<{ game: ParsedGame; moves: MoveSnapshot[] }> = [];
      for (const [gameIndex, game] of games.entries()) {
        selection.push({
          game,
          moves: await movesToAnalyze(
            game.moves,
            game.playerColor,
            budget.movesPerGame,
            budget.patternPositionsPerGame,
            patternProcessor,
          ),
        });
        onProgress({
          phase: "preparation",
          completed: gameIndex + 1,
          total: games.length,
          label: `Préparation · ${gameIndex + 1}/${games.length} parties`,
        });
        await yieldToMainThread();
      }
      return selection;
    },
  );
  const shallowTotal = selected.reduce((sum, item) => sum + item.moves.length * 2, 0);
  let shallowCompleted = 0;
  let skippedDecisions = 0;
  let shallowFallbacks = 0;
  let consecutiveFailures = 0;
  let adaptiveStabilityPositions = 0;
  const cache = new Map<string, EngineEvaluation>();

  async function evaluate(fen: string, depth: number, multiPv = 1): Promise<EngineEvaluation> {
    const key = `${depth}:${multiPv}:${fen}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const result = await engine.evaluate(fen, depth, multiPv);
    cache.set(key, result);
    return result;
  }

  const analyzedGames: AnalyzedGame[] = [];
  await measureAnalysisPhaseAsync("évaluations Stockfish initiales", async () => {
    for (const { game, moves } of selected) {
      const analyzedMoves: AnalyzedMove[] = [];
      for (const move of moves) {
      const [beforeResult, afterResult] = await Promise.allSettled([
        evaluate(
          move.fenBefore,
          budget.firstDepth,
        ),
        evaluate(
          move.fenAfter,
          budget.firstDepth,
        ),
      ]);
      shallowCompleted += 2;
      onProgress({
        phase: "analysis",
        completed: shallowCompleted,
        total: shallowTotal,
        label: `Analyse de la partie · ${analyzedGames.length + 1}/${games.length}`,
      });
      // Stockfish runs off the main thread, but its serialized queue can start
      // the next CPU-heavy search from the same microtask turn. Yield between
      // decisions so rendering, input and browser automation get a real task
      // window before the worker consumes the next search budget.
      await yieldToMainThread();
      if (beforeResult.status === "rejected" || afterResult.status === "rejected") {
        skippedDecisions += 1;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          throw new Error("Stockfish n’a pas réussi à évaluer plusieurs positions consécutives, même après redémarrage automatique.");
        }
        continue;
      }
      consecutiveFailures = 0;
      const before = beforeResult.value;
      const after = afterResult.value;
      const playerCpBefore = evaluationForPlayer(before.whiteCp, game.playerColor);
      const playerCpAfter = evaluationForPlayer(after.whiteCp, game.playerColor);
        analyzedMoves.push({
          ...move,
          before,
          after,
          playerCpBefore,
          playerCpAfter,
          lossCp: Math.max(0, playerCpBefore - playerCpAfter),
        });
      }
      analyzedGames.push({ ...game, analyzedMoves });
      await yieldToMainThread();
    }
  });

  // Pattern candidates are attached before the deep pass so a stable 0.00
  // position can request validation independently of an evaluation delta.
  const patternInputs = analyzedGames.flatMap((game) => game.analyzedMoves.map((move) => ({
    move,
    playerRating: game.playerRating,
  })));
  const patternTotal = patternInputs.length;
  let patternCompleted = 0;
  if (patternProcessor) {
    const classifications = await measureAnalysisPhaseAsync(
      "classification des moments (workers)",
      () => patternProcessor.classify(patternInputs, (completed) => {
        patternCompleted = completed;
        onProgress({
          phase: "identification",
          completed,
          total: Math.max(1, patternTotal + budget.deepPositions * 2),
          label: `Identification des moments · ${completed}/${patternTotal}`,
        });
      }),
    );
    classifications.forEach((classification, index) => {
      Object.assign(patternInputs[index].move, classification);
    });
  } else {
    const classificationTimer = createAnalysisTimer("classification des moments");
    for (const { move, playerRating } of patternInputs) {
      classificationTimer.measure(() => {
        move.patterns = patternsForAnalyzedMove(move);
        move.pawnStructure = structureForPosition(move.fenBefore);
        move.pedagogical = scorePedagogicalMoment({
          beforeCp: move.playerCpBefore,
          afterCp: move.playerCpAfter,
          patterns: move.patterns,
          phase: move.phase,
          ply: move.ply,
          playerRating,
        });
      });
      patternCompleted += 1;
      if (patternCompleted % 4 === 0 || patternCompleted === patternTotal) {
        onProgress({
          phase: "identification",
          completed: patternCompleted,
          total: Math.max(1, patternTotal + budget.deepPositions * 2),
          label: "Identification des moments pédagogiques",
        });
        await yieldToMainThread();
      }
    }
    classificationTimer.report();
  }

  // A second, deeper pass follows pedagogical value rather than raw lossCp.
  // This validates small-advantage conversions and stable pattern positions,
  // while +10 -> +6 and already-lost cascades fall out naturally.
  const critical = analyzedGames
    .flatMap((game) => game.analyzedMoves.map((move) => ({ game, move })))
    .filter(({ move }) => (move.pedagogical?.score ?? 0) >= 55)
    .toSorted((a, b) => (
      (b.move.pedagogical?.score ?? 0) - (a.move.pedagogical?.score ?? 0)
      || b.move.lossCp - a.move.lossCp
    ))
    .slice(0, budget.deepPositions);
  await measureAnalysisPhaseAsync("validation Stockfish approfondie", async () => {
    for (const [criticalIndex, { game, move }] of critical.entries()) {
      const shallowBefore = move.before;
    const [beforeResult, afterResult] = await Promise.allSettled([
      // Real alternatives are only requested for shortlisted pedagogical
      // moments, keeping the first pass fast while avoiding top-1 lessons.
      evaluate(move.fenBefore, 10, 4),
      evaluate(move.fenAfter, 10),
    ]);
    await yieldToMainThread();
    if (beforeResult.status === "rejected" || afterResult.status === "rejected") {
      shallowFallbacks += 1;
      onProgress({
        phase: "identification",
        completed: patternTotal + criticalIndex + 1,
        total: Math.max(1, patternTotal + critical.length * 2),
        label: "Identification des moments · validation approfondie",
      });
      await yieldToMainThread();
      continue;
    }
    let before = beforeResult.value;
    const after = afterResult.value;
    const stabilityHistory = [shallowBefore, before];
    const needsProbe = needsAdaptiveMultiPvProbe(shallowBefore, before, game.playerColor);
    let stabilityBudgetExhausted = false;
    if (needsProbe) {
      if (adaptiveStabilityPositions >= MAX_ADAPTIVE_STABILITY_POSITIONS) {
        stabilityBudgetExhausted = true;
      } else {
        adaptiveStabilityPositions += 1;
        for (let depth = 12; depth <= MULTIPV_MAX_DEPTH; depth += MULTIPV_STABILITY_DEPTH_STEP) {
          try {
            before = await evaluate(
              move.fenBefore,
              depth,
              4,
            );
            stabilityHistory.push(before);
            await yieldToMainThread();
          } catch {
            shallowFallbacks += 1;
            stabilityBudgetExhausted = true;
            break;
          }
          const currentStability = assessMultiPvStability(stabilityHistory, game.playerColor);
          if (currentStability.status !== "unstable") break;
          if (depth === MULTIPV_MAX_DEPTH) stabilityBudgetExhausted = true;
        }
      }
    }
    move.multiPvStability = assessMultiPvStability(
      stabilityHistory,
      game.playerColor,
      stabilityBudgetExhausted,
    );
    move.before = before;
    move.after = after;
    move.playerCpBefore = evaluationForPlayer(before.whiteCp, game.playerColor);
    move.playerCpAfter = evaluationForPlayer(after.whiteCp, game.playerColor);
    move.lossCp = Math.max(0, move.playerCpBefore - move.playerCpAfter);
    if (!patternProcessor) {
      move.patterns = patternsForAnalyzedMove(move);
      move.pawnStructure = structureForPosition(move.fenBefore);
      move.pedagogical = scorePedagogicalMoment({
        beforeCp: move.playerCpBefore,
        afterCp: move.playerCpAfter,
        patterns: move.patterns,
        phase: move.phase,
        ply: move.ply,
        playerRating: game.playerRating,
      });
    }
    onProgress({
      phase: "identification",
      completed: patternTotal + criticalIndex + 1,
      total: Math.max(1, patternTotal + critical.length * 2),
      label: "Identification des moments · validation approfondie",
    });
      await yieldToMainThread();
    }
  });

  if (patternProcessor && critical.length) {
    const deepClassifications = await measureAnalysisPhaseAsync(
      "reclassification approfondie (workers)",
      () => patternProcessor.classify(
        critical.map(({ game, move }) => ({ move, playerRating: game.playerRating })),
        (completed) => onProgress({
          phase: "identification",
          completed: patternTotal + critical.length + completed,
          total: Math.max(1, patternTotal + critical.length * 2),
          label: `Validation des moments · ${completed}/${critical.length}`,
        }),
      ),
    );
    deepClassifications.forEach((classification, index) => {
      Object.assign(critical[index].move, classification);
    });
  }

  onProgress({ phase: "training", completed: 0, total: 1, label: "Préparation de l’entraînement" });
  await yieldToMainThread();
  const metrics = measureAnalysisPhase("calcul du diagnostic", () => calculateMetrics(analyzedGames));
  if (metrics.positionsAnalyzed === 0) {
    throw new Error("Stockfish n’a pu évaluer aucune décision exploitable dans ces parties.");
  }
  const warnings = [...payload.warnings];
  if (skippedDecisions > 0) {
    warnings.push(`${skippedDecisions} décision${skippedDecisions > 1 ? "s ont" : " a"} été ignorée${skippedDecisions > 1 ? "s" : ""} après deux tentatives moteur ; le reste de l’analyse est complet.`);
  }
  if (shallowFallbacks > 0) {
    warnings.push(`${shallowFallbacks} décision${shallowFallbacks > 1 ? "s critiques restent" : " critique reste"} évaluée${shallowFallbacks > 1 ? "s" : ""} à la profondeur initiale.`);
  }
  const generated = await measureAnalysisPhaseAsync(
    "génération des exercices",
    async () => {
      if (postprocess) return postprocess(analyzedGames, metrics);
      const { generateExercisesWithAudit } = await import("../training/generate");
      return generateExercisesWithAudit(analyzedGames, metrics);
    },
  );
  onProgress({ phase: "training", completed: 1, total: 1, label: "Préparation de l’entraînement" });
  await yieldToMainThread();
  const recurringWeaknesses = measureAnalysisPhase(
    "agrégation des faiblesses",
    () => detectRecurringWeaknesses(generated.exercises),
  );
  return {
    profile: payload.profile,
    warnings,
    selection: payload.selection,
    games: analyzedGames,
    metrics,
    exercises: generated.exercises,
    recurringWeaknesses,
    candidateAuditTrail: generated.auditTrail,
    trainingContentResolution: generated.bankResolution,
  };
}
