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

export type AnalysisProgress = {
  completed: number;
  total: number;
  label: string;
};

export type PositionEvaluator = {
  evaluate: (fen: string, depth?: number) => Promise<EngineEvaluation>;
};

function analysisBudget(gameCount: number): { movesPerGame: number; firstDepth: number; deepPositions: number } {
  if (gameCount <= 5) return { movesPerGame: 32, firstDepth: 8, deepPositions: 12 };
  if (gameCount <= 10) return { movesPerGame: 24, firstDepth: 8, deepPositions: 12 };
  if (gameCount <= 25) return { movesPerGame: 12, firstDepth: 7, deepPositions: 14 };
  if (gameCount <= 50) return { movesPerGame: 7, firstDepth: 6, deepPositions: 16 };
  return { movesPerGame: 4, firstDepth: 5, deepPositions: 18 };
}

function movesToAnalyze(
  moves: MoveSnapshot[],
  playerColor: "white" | "black",
  limit: number,
): MoveSnapshot[] {
  const color = playerColor === "white" ? "w" : "b";
  const candidates = moves.filter((move) => move.color === color && move.ply >= 8 && move.ply <= 100);
  if (candidates.length <= limit) return candidates;
  const step = (candidates.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => candidates[Math.round(index * step)]);
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
    moves: movesToAnalyze(game.moves, game.playerColor, budget.movesPerGame),
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

  // A second, deeper pass revisits only the decisions that materially changed
  // the evaluation. This keeps a 100-game analysis feasible in the browser
  // while making the positions used for diagnosis and training more reliable.
  const critical = analyzedGames
    .flatMap((game) => game.analyzedMoves.map((move) => ({ game, move })))
    .filter(({ move }) => move.lossCp >= 80)
    .toSorted((a, b) => b.move.lossCp - a.move.lossCp)
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
  }

  for (const game of analyzedGames) {
    for (const move of game.analyzedMoves) {
      move.patterns = patternsForAnalyzedMove(move);
      move.pawnStructure = structureForPosition(move.fenBefore);
    }
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
