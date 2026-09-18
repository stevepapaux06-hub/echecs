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
import { patternCandidatesForPosition } from "../patterns/engine";
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
  const scannedPatterns: Array<{ move: MoveSnapshot; patterns: ReturnType<typeof patternCandidatesForPosition> }> = [];
  for (const move of patternScan) {
    scannedPatterns.push({
      move,
      patterns: patternCandidatesForPosition(move.fenBefore, { phase: move.phase, ply: move.ply }),
    });
    await yieldToMainThread();
  }
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

  // Pattern candidates are attached before the deep pass so a stable 0.00
  // position can request validation independently of an evaluation delta.
  const patternTotal = analyzedGames.reduce((sum, game) => sum + game.analyzedMoves.length, 0);
  let patternCompleted = 0;
  const classificationTimer = createAnalysisTimer("classification des moments");
  for (const game of analyzedGames) {
    for (const move of game.analyzedMoves) {
      classificationTimer.measure(() => {
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
      });
      patternCompleted += 1;
      if (patternCompleted % 4 === 0 || patternCompleted === patternTotal) {
        onProgress({
          phase: "identification",
          completed: patternCompleted,
          total: Math.max(1, patternTotal * 2),
          label: "Identification des moments pédagogiques",
        });
        await yieldToMainThread();
      }
    }
  }
  classificationTimer.report();

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
  for (const [criticalIndex, { game, move }] of critical.entries()) {
    const shallowBefore = move.before;
    const [beforeResult, afterResult] = await Promise.allSettled([
      // Real alternatives are only requested for shortlisted pedagogical
      // moments, keeping the first pass fast while avoiding top-1 lessons.
      evaluate(move.fenBefore, 10, 4),
      evaluate(move.fenAfter, 10),
    ]);
    if (beforeResult.status === "rejected" || afterResult.status === "rejected") {
      shallowFallbacks += 1;
      onProgress({
        phase: "identification",
        completed: patternTotal + criticalIndex + 1,
        total: Math.max(1, patternTotal + critical.length),
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
    onProgress({
      phase: "identification",
      completed: patternTotal + criticalIndex + 1,
      total: Math.max(1, patternTotal + critical.length),
      label: "Identification des moments · validation approfondie",
    });
    await yieldToMainThread();
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
  onProgress({ phase: "finalization", completed: 0, total: 1, label: "Finalisation du diagnostic" });
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
