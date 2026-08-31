import type {
  AnalysisPayload,
  AnalyzedGame,
  AnalyzedMove,
  CompleteAnalysis,
  EngineEvaluation,
  MoveSnapshot,
} from "./types";
import { calculateMetrics } from "../diagnostic/metrics";
import { generateExercises } from "../training/generate";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";
import { patternsForAnalyzedMove, structureForPosition } from "../patterns/engine";
import { patternCandidatesForPosition } from "../patterns/engine";
import { scorePedagogicalMoment } from "../diagnostic/pedagogical-score";

export type AnalysisProgress = {
  completed: number;
  total: number;
  label: string;
};

export type PositionEvaluator = {
  evaluate: (fen: string, depth?: number) => Promise<EngineEvaluation>;
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

function movesToAnalyze(
  moves: MoveSnapshot[],
  playerColor: "white" | "black",
  limit: number,
  patternLimit: number,
): MoveSnapshot[] {
  const color = playerColor === "white" ? "w" : "b";
  const candidates = moves.filter((move) => move.color === color && move.ply >= 8 && move.ply <= 100);
  if (candidates.length <= limit) return candidates;
  const step = (candidates.length - 1) / Math.max(1, limit - 1);
  const uniform = Array.from({ length: limit }, (_, index) => candidates[Math.round(index * step)]);
  const patternDriven = candidates
    .map((move) => ({
      move,
      patterns: patternCandidatesForPosition(move.fenBefore, { phase: move.phase, ply: move.ply }),
    }))
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
): Promise<CompleteAnalysis> {
  const games = payload.games.slice(0, 100);
  const budget = analysisBudget(games.length);
  const selected = games.map((game) => ({
    game,
    moves: movesToAnalyze(
      game.moves,
      game.playerColor,
      budget.movesPerGame,
      budget.patternPositionsPerGame,
    ),
  }));
  let total = selected.reduce((sum, item) => sum + item.moves.length * 2, 0)
    + budget.deepPositions * 2;
  let completed = 0;
  let skippedDecisions = 0;
  let shallowFallbacks = 0;
  let consecutiveFailures = 0;
  const cache = new Map<string, EngineEvaluation>();

  async function evaluate(fen: string, depth: number, label: string): Promise<EngineEvaluation> {
    const key = `${depth}:${fen}`;
    const cached = cache.get(key);
    if (cached) {
      completed += 1;
      onProgress({ completed, total, label });
      return cached;
    }
    try {
      const result = await engine.evaluate(fen, depth);
      cache.set(key, result);
      return result;
    } finally {
      completed += 1;
      onProgress({ completed, total, label });
    }
  }

  const analyzedGames: AnalyzedGame[] = [];
  for (const { game, moves } of selected) {
    const analyzedMoves: AnalyzedMove[] = [];
    for (const move of moves) {
      const [beforeResult, afterResult] = await Promise.allSettled([
        evaluate(
          move.fenBefore,
          budget.firstDepth,
          `Première passe · ${analyzedGames.length + 1}/${games.length} parties`,
        ),
        evaluate(
          move.fenAfter,
          budget.firstDepth,
          "Stockfish compare la position avant et après ton coup",
        ),
      ]);
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
  }

  // Pattern candidates are attached before the deep pass so a stable 0.00
  // position can request validation independently of an evaluation delta.
  for (const game of analyzedGames) {
    for (const move of game.analyzedMoves) {
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
  total = completed + critical.length * 2;

  for (const { game, move } of critical) {
    const [beforeResult, afterResult] = await Promise.allSettled([
      evaluate(move.fenBefore, 10, "Seconde passe approfondie sur tes décisions critiques"),
      evaluate(move.fenAfter, 10, "Validation des erreurs récurrentes"),
    ]);
    if (beforeResult.status === "rejected" || afterResult.status === "rejected") {
      shallowFallbacks += 1;
      continue;
    }
    const before = beforeResult.value;
    const after = afterResult.value;
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
  }

  const metrics = calculateMetrics(analyzedGames);
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
  return {
    profile: payload.profile,
    warnings,
    selection: payload.selection,
    games: analyzedGames,
    metrics,
    exercises: generateExercises(analyzedGames, metrics),
  };
}
