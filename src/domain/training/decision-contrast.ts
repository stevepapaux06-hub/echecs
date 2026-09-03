import { Chess, type Square } from "chess.js";
import type { TrainingCandidateLine, TrainingExercise } from "../chess/types";
import { causalFeatures, causalPlanFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../patterns/concept-specifications";
import type { OutcomeEvidence } from "./human-quality";

export type AlternativeOutcome = { uci: string; state: OutcomeEvidence["root"] };
export type DecisionContrast = {
  passed: boolean; reason: string; plausible: string[]; mechanisms: number;
  goodMoves: string[]; naturalMistake?: string; consequence?: string;
  outcomes?: AlternativeOutcome[];
};
const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

/** Plausibility precedes evaluation: no random losing moves added to create a
 * contrast. Safe quiet moves, sound-looking exchanges and checks are considered.
 * A hidden positional error can be very costly; a visibly hung queen cannot. */
export function plausibleHumanMove(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen); const color = chess.turn();
    const move = chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
    const attackers = chess.attackers(move.to, chess.turn());
    if (attackers.length && move.piece !== "k") {
      const cheapest = Math.min(...attackers.map((s) => values[chess.get(s)!.type]));
      const compensation = values[move.captured ?? ""] ?? 0;
      if (values[move.piece] - compensation > cheapest + 50) return false;
      if (!chess.attackers(move.to, color).length && compensation < values[move.piece] - 50) return false;
    }
    return true;
  } catch { return false; }
}

/** Supplemental search pool, independent of MultiPV order. Round-robin across
 * originating pieces avoids asking the engine only about five rook shuffles. */
export function humanAlternativePool(fen: string, already: string[], limit = 6): string[] {
  const chess = new Chess(fen); const groups = new Map<string, { uci: string; rank: number }[]>();
  for (const move of chess.moves({ verbose: true })) {
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    if (already.includes(uci) || !plausibleHumanMove(fen, uci)) continue;
    const feature = causalFeatures(fen, uci);
    const hasPlan = Object.values(CONCEPT_SPECIFICATIONS).some((s) => s.necessary_signals.every((x) => feature?.signals.includes(x)));
    const rank = (hasPlan ? 8 : 0) + (move.captured ? 4 : 0) + (move.san.includes("+") ? 3 : 0)
      + (move.piece === "p" && ["c", "d", "e", "f"].includes(move.to[0]) ? 2 : 0);
    const group = groups.get(move.from) ?? []; group.push({ uci, rank }); groups.set(move.from, group);
  }
  const queues = [...groups.values()].map((g) => g.sort((a, b) => b.rank - a.rank)).sort((a,b) => b[0].rank - a[0].rank);
  const selected: string[] = [];
  while (selected.length < limit && queues.some((q) => q.length)) for (const queue of queues) {
    const item = queue.shift(); if (item) selected.push(item.uci); if (selected.length === limit) break;
  }
  return selected;
}

export function assessDecisionContrast(exercise: TrainingExercise, lines: TrainingCandidateLine[],
  outcome?: OutcomeEvidence, alternatives: AlternativeOutcome[] = []): DecisionContrast {
  const feature = causalFeatures(exercise.fen, exercise.bestMove);
  const chosen = lines.find((l) => l.uci === exercise.bestMove);
  const domain = exercise.domain ?? exercise.category;
  const empty: DecisionContrast = { passed: false, reason: "insufficient_compared_human_plans", plausible: [], mechanisms: 0, goodMoves: [] };
  if (!feature || !chosen) return empty;
  const plausible = [...new Map(lines.filter((l) => plausibleHumanMove(exercise.fen, l.uci)).map(l=>[l.uci,l])).values()];
  const mechanism = (uci: string) => domain === "strategy" ? causalPlanFeatures(exercise.fen,
    uci === exercise.bestMove ? exercise.solutionLine ?? [uci] : lines.find(l=>l.uci===uci)!.pv, exercise.conceptSlug)!
    : causalFeatures(exercise.fen,uci)!;
  const group = (uci: string) => {
    const f = mechanism(uci);
    return matchesConceptSpecification(exercise.conceptSlug, f)
      ? `concept:${exercise.conceptSlug}:${f.targetSquares.slice().sort().join(",")}`
      : `${uci.slice(0,2)}:${f.signals.filter((s) => s !== "safe_destination").sort().join(",") || "maintain_role"}`;
  };
  const mechanisms = new Set(plausible.map((l) => group(l.uci))).size;
  const exact = outcome?.source === "syzygy";
  const state = (uci: string) => alternatives.find((m) => m.uci === uci)?.state;
  const equivalent = (l: TrainingCandidateLine) => Math.abs(chosen.playerCp - l.playerCp) <= 30
    || (exact && state(l.uci) === state(chosen.uci));
  const goodMoves = plausible.filter((l) => equivalent(l) && matchesConceptSpecification(exercise.conceptSlug, mechanism(l.uci))).map((l) => l.uci);
  const result = { ...empty, plausible: plausible.map((l) => l.uci), mechanisms, goodMoves, outcomes: exact ? alternatives : undefined };
  if (plausible.length < 3 || mechanisms < 2) return result;
  const rank = (s: string | undefined) => s === "win" ? 2 : s === "draw" || s === "tenable" ? 1 : s === "loss" ? 0 : -1;
  const wrong = plausible.filter((l) => l.uci !== chosen.uci && group(l.uci) !== group(chosen.uci));
  const natural = wrong.find((line) => {
    if (exact) return rank(state(chosen.uci)) >= 1 && rank(state(line.uci)) >= 0 && rank(state(line.uci)) < rank(state(chosen.uci));
    const loss = chosen.playerCp - line.playerCp;
    // Endings/defenses demand an outcome contrast, not just a slower win.
    if (domain === "endgame" || domain === "defense") return (chosen.playerCp >= 120 && line.playerCp <= 35)
      || (chosen.playerCp >= -35 && line.playerCp < -150);
    if (domain === "conversion") return loss >= 60 && line.playerCp < Math.max(40, chosen.playerCp * 0.55);
    return loss >= 35 && !matchesConceptSpecification(exercise.conceptSlug, mechanism(line.uci));
  });
  const equalCount = plausible.filter(equivalent).length;
  if (!natural || equalCount / plausible.length >= 0.8) return { ...result, reason: "reasonable_plans_have_no_necessary_contrast" };
  return { ...result, passed: true, reason: "contrasting_human_decisions", naturalMistake: natural.uci,
    consequence: exact ? `${state(chosen.uci)}_to_${state(natural.uci)}`
      : domain === "strategy" ? "mechanism_missed_with_objective_cost" : "advantage_or_holding_resource_lost" };
}
