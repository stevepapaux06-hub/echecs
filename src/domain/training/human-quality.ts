import { Chess, type Square } from "chess.js";
import type { TrainingExercise, TrainingCandidateLine } from "../chess/types";
import { causalFeatures, causalLineFeatures, causalPlanFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../patterns/concept-specifications";
import { pieces } from "../patterns/position-features";
import { referenceMilestoneIndex } from "./milestones";
import { assessDecisionContrast, type AlternativeOutcome, type DecisionContrast } from "./decision-contrast";
import { materialAdvantage } from "../patterns/position-features";

export const HUMAN_QUALITY_VERSION = 2;
export const HUMAN_QUALITY_THRESHOLD = 9; // Six independently evidenced dimensions, each 0..2.
export type QualityGate = "domain" | "outcome" | "triviality" | "decision_contrast" | "causality" | "human_value" | "concept_specific" | "sequence" | "deduplication" | "verification";
export type OutcomeEvidence = {
  source: "syzygy" | "stockfish_wdl" | "lichess_equality";
  root: "win" | "draw" | "tenable" | "loss" | "unknown";
  after: "win" | "draw" | "tenable" | "loss" | "unknown";
  rootDtz?: number | null; afterDtz?: number | null;
  /** Engine WDL is probabilistic, never advertised as exact tablebase proof. */
  lossPermille?: number;
  verifiedDepth?: number;
};
export type TrainingAssessment = {
  version: number; referenceQuality: "high" | "boundary"; exerciseability: boolean;
  failedGates: QualityGate[]; reasons: string[]; signals: string[];
  value: { decision_contrast: number; natural_mistake: number; transferability: number; state_change: number; human_difficulty: number; mechanism_clarity: number };
  score: number; alternative?: string; naturalMistake?: string; outcome?: OutcomeEvidence;
  contrast?: DecisionContrast;
};

export function assessHumanQuality(exercise: TrainingExercise, options: {
  lines?: TrainingCandidateLine[]; outcome?: OutcomeEvidence; previousMove?: string;
  skipSequence?: boolean;
  alternativeOutcomes?: AlternativeOutcome[];
} = {}): TrainingAssessment {
  const failures = new Map<QualityGate, string>();
  const fail = (gate: QualityGate, reason: string) => { if (!failures.has(gate)) failures.set(gate, reason); };
  const domain = exercise.domain ?? exercise.category;
  const spec = CONCEPT_SPECIFICATIONS[exercise.conceptSlug];
  const equalitySequence = domain === "defense" && exercise.sourceThemes?.includes("equality") && exercise.sourceThemes.includes("defensiveMove");
  const feature = equalitySequence ? causalLineFeatures(exercise.fen, exercise.solutionLine ?? [exercise.bestMove])
    : domain === "strategy" ? causalPlanFeatures(exercise.fen, exercise.solutionLine ?? [exercise.bestMove], exercise.conceptSlug) : causalFeatures(exercise.fen, exercise.bestMove);
  const outcome = options.outcome;
  const lines = options.lines ?? exercise.engineCandidates ?? [];
  const rootCp = lines[0]?.playerCp ?? exercise.baselinePlayerCp;
  if (!feature) fail("domain", "illegal_decision");
  if (feature && ((domain === "strategy" && feature.phase !== "middlegame")
    || (domain === "endgame" && feature.phase !== "endgame"))) fail("domain", "material_phase_does_not_match_domain");
  const causal = !!feature && !!spec && matchesConceptSpecification(exercise.conceptSlug, feature);
  const material = materialAdvantage(exercise.fen, new Chess(exercise.fen).turn());
  // CP ranges are priors, not domain labels. An outside-prior position needs
  // both a causal mechanism and a non-mechanical advantage, independently.
  if (domain === "conversion" && (rootCp <= 35 || rootCp >= 500
    || ((rootCp < 80 || rootCp > 320) && !(causal && (material >= 100 || feature?.signals.includes("threat_reduced")))))) fail("outcome", "conversion_requires_nontrivial_existing_advantage");
  if (domain === "strategy" && Math.abs(rootCp) > 150
    && !(causal && rootCp > -150 && rootCp < 350 && Math.abs(material) <= 330)) fail("outcome", "strategy_requires_balanced_plan_choice");
  if ((rootCp < -150 && outcome?.source !== "syzygy" && outcome?.source !== "lichess_equality") || outcome?.root === "loss" || outcome?.after === "loss") fail("outcome", "lost_without_saving_resource");
  if (!outcome || outcome.root === "unknown" || outcome.after === "unknown") fail("outcome", "outcome_not_established");
  if (domain === "defense" && !(outcome?.source === "syzygy" || outcome?.source === "lichess_equality"
    || (outcome?.source === "stockfish_wdl" && (outcome.verifiedDepth ?? 0) >= 16 && (outcome.lossPermille ?? 1000) <= 50 && Math.abs(rootCp) <= 35))) fail("outcome", "defense_requires_saved_outcome_not_centipawns");
  if (feature && feature.pieceCount <= 7 && domain === "endgame" && outcome?.source !== "syzygy") fail("outcome", "eligible_endgame_requires_tablebase");
  if (feature?.legalChoices && feature.legalChoices < 4) fail("triviality", "forced_or_nearly_forced_choice");
  if (feature?.queenTrade && !feature.signals.includes("useful_exchange")) fail("triviality", "routine_queen_exchange");
  if (domain !== "defense" && feature?.freeCapture) fail("triviality", "free_material_capture");
  if (feature?.capture && options.previousMove?.slice(2, 4) === exercise.bestMove.slice(2, 4)) fail("triviality", "automatic_recapture");
  if (feature?.capture && domain === "strategy" && !(exercise.conceptSlug === "favorable_exchange" && feature.signals.includes("useful_exchange"))) fail("triviality", "capture_requires_specific_exchange_evidence");
  const canonical = ["lucena", "philidor"].includes(exercise.conceptSlug) && exercise.source === "lichess_tablebase";
  if (!canonical && !spec) fail("concept_specific", "no_supported_concept_specification");
  if (!canonical && feature && !matchesConceptSpecification(exercise.conceptSlug, feature)) fail("causality", "feature_present_but_mechanism_not_demonstrated");
  const contrast = assessDecisionContrast(exercise, lines, outcome, options.alternativeOutcomes);
  if (!contrast.passed) fail("decision_contrast", contrast.reason);
  const plausible = contrast.plausible.filter((uci) => uci !== exercise.bestMove);
  const natural = contrast.naturalMistake;
  const conceptSound = lines.find((line) => line.uci === exercise.bestMove);
  if (conceptSound && rootCp - conceptSound.playerCp > 80) fail("verification", "teaching_move_objectively_inferior");
  const value = {
    decision_contrast: contrast.passed ? 2 : 0,
    natural_mistake: natural ? 2 : 0,
    transferability: spec || canonical ? 2 : 0,
    state_change: feature && (canonical || matchesConceptSpecification(exercise.conceptSlug, feature)) ? 2 : 0,
    human_difficulty: feature && feature.legalChoices >= 4 && (exercise.difficulty ?? 1300) <= 2100 ? 2 : 0,
    mechanism_clarity: feature && (canonical || matchesConceptSpecification(exercise.conceptSlug, feature)) ? 2 : 0,
  };
  const score = Object.values(value).reduce((a, b) => a + b, 0);
  if (score < HUMAN_QUALITY_THRESHOLD || Object.values(value).some((n) => n === 0)) fail("human_value", "insufficient_independent_human_decision_evidence");
  if (!options.skipSequence && domain !== "defense") {
    if (feature?.signals.includes("preparatory_maneuver") && exercise.pedagogicalUnit === "single_move") fail("sequence", "preparation_requires_verified_continuation");
    if (domain === "endgame" || exercise.pedagogicalUnit !== "single_move") {
      if (!exercise.pedagogicalMilestone || referenceMilestoneIndex(exercise) === null) fail("sequence", "reference_does_not_demonstrate_a_milestone");
    } else if (domain === "strategy" && (plausible.length < 2 || !natural)) fail("sequence", "single_move_not_deep_enough");
  }
  return { version: HUMAN_QUALITY_VERSION, referenceQuality: failures.has("causality") ? "boundary" : "high",
    exerciseability: failures.size === 0, failedGates: [...failures.keys()], reasons: [...failures.values()],
    signals: feature?.signals ?? [], value, score, alternative: plausible[0], naturalMistake: natural, outcome, contrast };
}

/** Legal references are retained even when exerciseability is false. This is
 * intentionally separate from the user-facing bank and never a fallback pool. */
export function isReferencePosition(exercise: TrainingExercise): boolean {
  try { return pieces(new Chess(exercise.fen)).filter((p) => p.type === "k").length === 2; } catch { return false; }
}

export function playLine(fen: string, line: string[]): string | null {
  try { const chess = new Chess(fen); for (const uci of line) chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); return chess.fen(); } catch { return null; }
}
