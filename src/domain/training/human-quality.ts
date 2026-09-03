import { Chess, type Square } from "chess.js";
import type { TrainingExercise, TrainingCandidateLine } from "../chess/types";
import { causalFeatures, causalLineFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../patterns/concept-specifications";
import { pieces } from "../patterns/position-features";
import { referenceMilestoneIndex } from "./milestones";

export const HUMAN_QUALITY_VERSION = 1;
export const HUMAN_QUALITY_THRESHOLD = 9; // Six independently evidenced dimensions, each 0..2.
export type QualityGate = "domain" | "outcome" | "triviality" | "causality" | "human_value" | "concept_specific" | "sequence" | "deduplication" | "verification";
export type OutcomeEvidence = {
  source: "syzygy" | "stockfish_wdl" | "lichess_equality";
  root: "win" | "draw" | "tenable" | "loss" | "unknown";
  after: "win" | "draw" | "tenable" | "loss" | "unknown";
  rootDtz?: number | null; afterDtz?: number | null;
  /** Engine WDL is probabilistic, never advertised as exact tablebase proof. */
  lossPermille?: number;
};
export type TrainingAssessment = {
  version: number; referenceQuality: "high" | "boundary"; exerciseability: boolean;
  failedGates: QualityGate[]; reasons: string[]; signals: string[];
  value: { decision_contrast: number; natural_mistake: number; transferability: number; state_change: number; human_difficulty: number; mechanism_clarity: number };
  score: number; alternative?: string; naturalMistake?: string; outcome?: OutcomeEvidence;
};

export function assessHumanQuality(exercise: TrainingExercise, options: {
  lines?: TrainingCandidateLine[]; outcome?: OutcomeEvidence; previousMove?: string;
  skipSequence?: boolean;
} = {}): TrainingAssessment {
  const failures = new Map<QualityGate, string>();
  const fail = (gate: QualityGate, reason: string) => { if (!failures.has(gate)) failures.set(gate, reason); };
  const domain = exercise.domain ?? exercise.category;
  const spec = CONCEPT_SPECIFICATIONS[exercise.conceptSlug];
  const equalitySequence = domain === "defense" && exercise.sourceThemes?.includes("equality") && exercise.sourceThemes.includes("defensiveMove");
  const feature = equalitySequence ? causalLineFeatures(exercise.fen, exercise.solutionLine ?? [exercise.bestMove]) : causalFeatures(exercise.fen, exercise.bestMove);
  const outcome = options.outcome;
  const lines = options.lines ?? exercise.engineCandidates ?? [];
  const rootCp = lines[0]?.playerCp ?? exercise.baselinePlayerCp;
  if (!feature) fail("domain", "illegal_decision");
  if (feature && ((domain === "strategy" && feature.phase !== "middlegame")
    || (domain === "endgame" && feature.phase !== "endgame"))) fail("domain", "material_phase_does_not_match_domain");
  if (domain === "conversion" && (rootCp < 80 || rootCp > 320)) fail("outcome", "conversion_requires_nontrivial_existing_advantage");
  if (domain === "strategy" && Math.abs(rootCp) > 150) fail("outcome", "strategy_requires_balanced_plan_choice");
  if (rootCp < -150 || outcome?.root === "loss" || outcome?.after === "loss") fail("outcome", "lost_without_saving_resource");
  if (!outcome || outcome.root === "unknown" || outcome.after === "unknown") fail("outcome", "outcome_not_established");
  if (domain === "defense" && !(outcome?.source === "syzygy" || outcome?.source === "lichess_equality")) fail("outcome", "defense_requires_saved_outcome_not_centipawns");
  if (feature && feature.pieceCount <= 7 && domain === "endgame" && outcome?.source !== "syzygy") fail("outcome", "eligible_endgame_requires_tablebase");
  if (feature?.legalChoices && feature.legalChoices < 4) fail("triviality", "forced_or_nearly_forced_choice");
  if (feature?.queenTrade) fail("triviality", "routine_queen_exchange");
  if (domain !== "defense" && feature?.freeCapture) fail("triviality", "free_material_capture");
  if (feature?.capture && options.previousMove?.slice(2, 4) === exercise.bestMove.slice(2, 4)) fail("triviality", "automatic_recapture");
  if (feature?.capture && domain === "strategy") fail("triviality", "capture_requires_specific_exchange_evidence");
  if (domain === "endgame" && rootCp > 650 && !["lucena", "philidor", "opposition", "rule_of_square"].includes(exercise.conceptSlug)) fail("triviality", "mechanically_won_ending");
  const canonical = ["lucena", "philidor"].includes(exercise.conceptSlug) && exercise.source === "lichess_tablebase";
  const equalityDefense = domain === "defense" && outcome?.source === "lichess_equality";
  if (!canonical && !spec) fail("concept_specific", "no_supported_concept_specification");
  if (!canonical && feature && !matchesConceptSpecification(exercise.conceptSlug, feature)) fail("causality", "feature_present_but_mechanism_not_demonstrated");
  // Equality puzzles have an externally verified saving sequence, but still
  // need their concrete defense mechanism and a non-forced root choice.
  const plausible = lines.filter((line) => {
    if (line.uci === exercise.bestMove || rootCp - line.playerCp > 200) return false;
    const other = causalFeatures(exercise.fen, line.uci);
    return other && !other.freeCapture && (line.uci.slice(0, 2) !== exercise.bestMove.slice(0, 2)
      || !matchesConceptSpecification(exercise.conceptSlug, other));
  });
  const natural = plausible.find((line) => rootCp - line.playerCp >= 35 && rootCp - line.playerCp <= 200);
  const conceptSound = lines.find((line) => line.uci === exercise.bestMove);
  if (conceptSound && rootCp - conceptSound.playerCp > 80) fail("verification", "teaching_move_objectively_inferior");
  const value = {
    decision_contrast: canonical || equalityDefense ? 2 : Math.min(2, plausible.length),
    natural_mistake: canonical || equalityDefense ? 2 : natural ? 2 : 0,
    transferability: spec || canonical ? 2 : 0,
    state_change: feature && (canonical || matchesConceptSpecification(exercise.conceptSlug, feature)) ? 2 : 0,
    human_difficulty: feature && feature.legalChoices >= 4 && (exercise.difficulty ?? 1300) <= 2100 ? 2 : 0,
    mechanism_clarity: feature && (canonical || matchesConceptSpecification(exercise.conceptSlug, feature)) ? 2 : 0,
  };
  const score = Object.values(value).reduce((a, b) => a + b, 0);
  if (score < HUMAN_QUALITY_THRESHOLD || Object.values(value).some((n) => n === 0)) fail("human_value", "insufficient_independent_human_decision_evidence");
  if (!options.skipSequence && domain !== "defense") {
    if (domain === "endgame" || exercise.pedagogicalUnit !== "single_move") {
      if (!exercise.pedagogicalMilestone || referenceMilestoneIndex(exercise) === null) fail("sequence", "reference_does_not_demonstrate_a_milestone");
    } else if (domain === "strategy" && (plausible.length < 2 || !natural)) fail("sequence", "single_move_not_deep_enough");
  }
  return { version: HUMAN_QUALITY_VERSION, referenceQuality: failures.has("causality") ? "boundary" : "high",
    exerciseability: failures.size === 0, failedGates: [...failures.keys()], reasons: [...failures.values()],
    signals: feature?.signals ?? [], value, score, alternative: plausible[0]?.uci, naturalMistake: natural?.uci, outcome };
}

/** Legal references are retained even when exerciseability is false. This is
 * intentionally separate from the user-facing bank and never a fallback pool. */
export function isReferencePosition(exercise: TrainingExercise): boolean {
  try { return pieces(new Chess(exercise.fen)).filter((p) => p.type === "k").length === 2; } catch { return false; }
}

export function playLine(fen: string, line: string[]): string | null {
  try { const chess = new Chess(fen); for (const uci of line) chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); return chess.fen(); } catch { return null; }
}
