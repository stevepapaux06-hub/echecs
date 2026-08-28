import type {
  AnalysisPayload,
  AnalyzedGame,
  AnalyzedMove,
  CompleteAnalysis,
  EngineEvaluation,
  MoveSnapshot,
} from "./types";
import { calculateMetrics } from "@/domain/diagnostic/metrics";
import { generateExercises } from "@/domain/training/generate";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { evaluationForPlayer } from "@/infrastructure/engine/uci";

export type AnalysisProgress = {
  completed: number;
  total: number;
  label: string;
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
  engine: StockfishClient,
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
  const cache = new Map<string, EngineEvaluation>();

  async function evaluate(fen: string, depth: number, label: string): Promise<EngineEvaluation> {
    const key = `${depth}:${fen}`;
    const cached = cache.get(key);
    if (cached) {
      completed += 1;
      onProgress({ completed, total, label });
      return cached;
    }
    const result = await engine.evaluate(fen, depth);
    cache.set(key, result);
    completed += 1;
    onProgress({ completed, total, label });
    return result;
  }

  const analyzedGames: AnalyzedGame[] = [];
  for (const { game, moves } of selected) {
    const analyzedMoves: AnalyzedMove[] = [];
    for (const move of moves) {
      const before = await evaluate(
        move.fenBefore,
        budget.firstDepth,
        `Première passe · ${analyzedGames.length + 1}/${games.length} parties`,
      );
      const after = await evaluate(
        move.fenAfter,
        budget.firstDepth,
        "Stockfish compare la position avant et après ton coup",
      );
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
    const before = await evaluate(move.fenBefore, 10, "Seconde passe approfondie sur tes décisions critiques");
    const after = await evaluate(move.fenAfter, 10, "Validation des erreurs récurrentes");
    move.before = before;
    move.after = after;
    move.playerCpBefore = evaluationForPlayer(before.whiteCp, game.playerColor);
    move.playerCpAfter = evaluationForPlayer(after.whiteCp, game.playerColor);
    move.lossCp = Math.max(0, move.playerCpBefore - move.playerCpAfter);
  }

  const metrics = calculateMetrics(analyzedGames);
  return {
    profile: payload.profile,
    warnings: payload.warnings,
    selection: payload.selection,
    games: analyzedGames,
    metrics,
    exercises: generateExercises(analyzedGames, metrics),
  };
}
