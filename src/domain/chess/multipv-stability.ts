import type {
  EngineEvaluation,
  MultiPvStability,
  PlayerColor,
} from "./types";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";

export const MULTIPV_STABILITY_PROBE_GAP_CP = 120;
export const MULTIPV_STABLE_SCORE_DRIFT_CP = 80;
export const MULTIPV_MULTI_PLAN_GAP_CP = 90;
export const MULTIPV_MAX_DEPTH = 14;
export const MULTIPV_STABILITY_DEPTH_STEP = 2;
export const MAX_ADAPTIVE_STABILITY_POSITIONS = 12;

type RankedLine = { moveUci: string; playerCp: number };

function rankedLines(evaluation: EngineEvaluation, playerColor: PlayerColor): RankedLine[] {
  return evaluation.lines
    .filter((line) => Boolean(line.pv[0]))
    .map((line) => ({
      moveUci: line.pv[0],
      playerCp: evaluationForPlayer(line.whiteCp, playerColor),
    }))
    .toSorted((first, second) => second.playerCp - first.playerCp);
}

function topGap(evaluation: EngineEvaluation, playerColor: PlayerColor): number {
  const lines = rankedLines(evaluation, playerColor);
  if (lines.length < 2) return Number.POSITIVE_INFINITY;
  return Math.max(0, lines[0].playerCp - lines[1].playerCp);
}

export function needsAdaptiveMultiPvProbe(
  previous: EngineEvaluation,
  current: EngineEvaluation,
  playerColor: PlayerColor,
): boolean {
  const previousBest = rankedLines(previous, playerColor)[0]?.moveUci;
  const currentBest = rankedLines(current, playerColor)[0]?.moveUci;
  return !currentBest
    || current.lines.length < 2
    || previousBest !== currentBest
    || topGap(current, playerColor) <= MULTIPV_STABILITY_PROBE_GAP_CP;
}

/** Cross-depth contract: a ranking that oscillates remains unstable unless the
 * competing moves converge into the same reasonable score band. */
export function assessMultiPvStability(
  evaluations: EngineEvaluation[],
  playerColor: PlayerColor,
  budgetExhausted = false,
): MultiPvStability {
  const usable = evaluations.filter((evaluation) => evaluation.lines.some((line) => line.pv[0]));
  const latest = usable.at(-1);
  const previous = usable.at(-2);
  const latestLines = latest ? rankedLines(latest, playerColor) : [];
  const latestBest = latestLines[0];
  const previousLines = previous ? rankedLines(previous, playerColor) : [];
  const previousBest = previousLines[0];
  const bestMoves = usable.map((evaluation) => rankedLines(evaluation, playerColor)[0]?.moveUci ?? "")
    .filter(Boolean);
  const depths = usable.map((evaluation) => evaluation.depth);

  if (!latest || !previous || !latestBest || !previousBest) {
    return {
      status: "unstable",
      analyzedDepths: depths,
      bestMoves,
      acceptedMoveUcis: [],
      maxDepthReached: Math.max(0, ...depths),
      budgetExhausted,
    };
  }

  // The explicit position budget must fail closed when it is exhausted before
  // the first adaptive confirmation depth. A close depth-10 snapshot alone is
  // not enough evidence for either a unique answer or a multi-plan contract.
  if (budgetExhausted && Math.max(...depths) < 12) {
    return {
      status: "unstable",
      analyzedDepths: depths,
      bestMoves,
      acceptedMoveUcis: [],
      maxDepthReached: Math.max(...depths),
      budgetExhausted: true,
    };
  }

  const latestByMove = new Map(latestLines.map((line) => [line.moveUci, line.playerCp]));
  const previousAtLatest = latestByMove.get(previousBest.moveUci);
  const rankingChanged = previousBest.moveUci !== latestBest.moveUci;
  const latestGap = topGap(latest, playerColor);
  const previousScoreNow = previousAtLatest === undefined
    ? Number.POSITIVE_INFINITY
    : latestBest.playerCp - previousAtLatest;
  const sharedLatestScore = latestByMove.get(previousBest.moveUci);
  const scoreDrift = sharedLatestScore === undefined
    ? Number.POSITIVE_INFINITY
    : Math.abs(previousBest.playerCp - sharedLatestScore);
  const multiPlan = latestLines
    .filter((line) => latestBest.playerCp - line.playerCp <= MULTIPV_MULTI_PLAN_GAP_CP)
    .map((line) => line.moveUci);

  if (multiPlan.length >= 2 && (!rankingChanged || previousScoreNow <= MULTIPV_MULTI_PLAN_GAP_CP)) {
    return {
      status: "multi_plan",
      analyzedDepths: depths,
      bestMoves,
      acceptedMoveUcis: [...new Set(multiPlan)],
      maxDepthReached: Math.max(...depths),
      budgetExhausted,
    };
  }
  if (!rankingChanged && scoreDrift <= MULTIPV_STABLE_SCORE_DRIFT_CP
    && latestGap > MULTIPV_MULTI_PLAN_GAP_CP) {
    return {
      status: "stable",
      analyzedDepths: depths,
      bestMoves,
      acceptedMoveUcis: [latestBest.moveUci],
      maxDepthReached: Math.max(...depths),
      budgetExhausted,
    };
  }
  return {
    status: "unstable",
    analyzedDepths: depths,
    bestMoves,
    acceptedMoveUcis: [],
    maxDepthReached: Math.max(...depths),
    budgetExhausted,
  };
}
