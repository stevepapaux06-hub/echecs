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

function movesToAnalyze(moves: MoveSnapshot[], playerColor: "white" | "black"): MoveSnapshot[] {
  const color = playerColor === "white" ? "w" : "b";
  const candidates = moves.filter((move) => move.color === color && move.ply >= 8 && move.ply <= 100);
  if (candidates.length <= 24) return candidates;
  const step = (candidates.length - 1) / 23;
  return Array.from({ length: 24 }, (_, index) => candidates[Math.round(index * step)]);
}

export async function analyzePayload(
  payload: AnalysisPayload,
  engine: StockfishClient,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<CompleteAnalysis> {
  const games = payload.games.slice(0, 8);
  const selected = games.map((game) => ({ game, moves: movesToAnalyze(game.moves, game.playerColor) }));
  const total = selected.reduce((sum, item) => sum + item.moves.length * 2, 0);
  let completed = 0;
  const cache = new Map<string, EngineEvaluation>();

  async function evaluate(fen: string): Promise<EngineEvaluation> {
    const cached = cache.get(fen);
    if (cached) {
      completed += 1;
      onProgress({ completed, total, label: "Comparaison des décisions" });
      return cached;
    }
    const result = await engine.evaluate(fen, 7);
    cache.set(fen, result);
    completed += 1;
    onProgress({ completed, total, label: "Stockfish examine tes positions" });
    return result;
  }

  const analyzedGames: AnalyzedGame[] = [];
  for (const { game, moves } of selected) {
    const analyzedMoves: AnalyzedMove[] = [];
    for (const move of moves) {
      const before = await evaluate(move.fenBefore);
      const after = await evaluate(move.fenAfter);
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

  const metrics = calculateMetrics(analyzedGames);
  return {
    profile: payload.profile,
    warnings: payload.warnings,
    games: analyzedGames,
    metrics,
    exercises: generateExercises(analyzedGames),
  };
}
