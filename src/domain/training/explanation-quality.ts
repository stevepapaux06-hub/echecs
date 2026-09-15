import { Chess, type Square } from "chess.js";
import type { StructuredExerciseExplanation, TrainingExercise } from "../chess/types";
import { causalFeatures, causalLineFeatures, causalPlanFeatures, matchesConceptSpecification } from "../patterns/concept-specifications";

export const EXPLANATION_QUALITY_VERSION = 2;
export const EXPLANATION_QUALITY_THRESHOLD = 16;

export type ExplanationQualityDimension =
  | "problem_specificity"
  | "concept_causality"
  | "opponent_resource_specificity"
  | "plan_contrast"
  | "natural_alternative_quality"
  | "state_change_verifiability"
  | "transferability"
  | "sequence_consistency"
  | "engine_alignment"
  | "difficulty_fit";

export type ExplanationHardNegative =
  | "generic_activity_language"
  | "generic_pressure_language"
  | "objective_repetition"
  | "fake_plan_comparison"
  | "wrong_piece_continuity"
  | "variant_mismatch"
  | "premature_exchange_claim"
  | "generic_concept_without_mechanism"
  | "unsupported_naturalness_claim"
  | "generic_transfer_rule";

export type ExplanationQualityAssessment = {
  version: number;
  score: number;
  maximum: 20;
  passed: boolean;
  dimensions: Record<ExplanationQualityDimension, number>;
  hardNegatives: ExplanationHardNegative[];
  reasons: string[];
};

function compact(value: string | undefined): string {
  return (value ?? "").toLocaleLowerCase("fr").replace(/[^a-zà-ÿ0-9]/g, "");
}

function legalMove(fen: string, uci: string): boolean {
  try { const chess = new Chess(fen); chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); return true; } catch { return false; }
}

function lineIsLegal(exercise: TrainingExercise): boolean {
  try {
    const chess = new Chess(exercise.fen);
    for (const uci of exercise.solutionLine ?? [exercise.bestMove]) chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
    return true;
  } catch { return false; }
}

function lineContainsCapture(exercise: TrainingExercise, maxPlies = 3): boolean {
  try {
    const chess = new Chess(exercise.fen);
    for (const uci of (exercise.solutionLine ?? [exercise.bestMove]).slice(0, maxPlies)) {
      const move = chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
      if (move.captured) return true;
    }
  } catch { return false; }
  return false;
}

function positionalTokens(exercise: TrainingExercise): string[] {
  const squares = [exercise.bestMove.slice(0, 2), exercise.bestMove.slice(2, 4), ...(exercise.keySquares ?? [])];
  return [...new Set(squares.filter(Boolean))];
}

function mentionsPosition(text: string, exercise: TrainingExercise): boolean {
  return positionalTokens(exercise).some((token) => text.toLowerCase().includes(token.toLowerCase()))
    || /tour|cavalier|fou|roi|pion|dame|colonne|diagonale|case/.test(text.toLowerCase());
}

function featureFor(exercise: TrainingExercise, uci = exercise.bestMove) {
  const domain = exercise.domain ?? exercise.category;
  return domain === "strategy" || (domain === "conversion" && exercise.conceptRelabelLocked && uci === exercise.bestMove)
    ? causalPlanFeatures(exercise.fen, uci === exercise.bestMove ? exercise.solutionLine ?? [uci] : [uci], exercise.conceptSlug)
    : domain === "defense" && uci === exercise.bestMove
      ? causalLineFeatures(exercise.fen, exercise.solutionLine ?? [uci])
      : causalFeatures(exercise.fen, uci);
}

function sequenceConsistency(exercise: TrainingExercise, explanation: StructuredExerciseExplanation): { score: number; negatives: ExplanationHardNegative[] } {
  const negatives: ExplanationHardNegative[] = [];
  if (!lineIsLegal(exercise)) return { score: 0, negatives: ["variant_mismatch"] };
  const ownMoves = (exercise.solutionLine ?? [exercise.bestMove]).filter((_move, index) => index % 2 === 0);
  const advertised = explanation.planSteps ?? [];
  if (advertised.some((step) => !ownMoves.some((uci) => step.includes(`${uci.slice(0, 2)}–${uci.slice(2, 4)}`)))) negatives.push("variant_mismatch");
  if (advertised.length > 1) {
    const chess = new Chess(exercise.fen);
    const pieceIds: string[] = [];
    for (const [index, uci] of (exercise.solutionLine ?? []).entries()) {
      if (index % 2 === 0) pieceIds.push(`${chess.get(uci.slice(0, 2) as Square)?.type ?? "?"}:${uci.slice(0, 2)}`);
      chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
    }
    if (/même pièce|manœuvre/i.test(advertised.join(" ")) && new Set(pieceIds.map((id) => id.split(":")[0])).size > 1) negatives.push("wrong_piece_continuity");
  }
  const multi = exercise.pedagogicalUnit !== "single_move";
  if (multi && ownMoves.length < 2) negatives.push("variant_mismatch");
  return { score: negatives.length ? 0 : multi ? 2 : 1, negatives };
}

/** Content gate for non-tactical teaching copy. A populated field alone earns
 * no point: every dimension is checked against legal moves or causal features. */
export function assessExplanationQuality(exercise: TrainingExercise): ExplanationQualityAssessment {
  const explanation = exercise.explanation;
  const zero = {
    problem_specificity: 0, concept_causality: 0, opponent_resource_specificity: 0,
    plan_contrast: 0, natural_alternative_quality: 0, state_change_verifiability: 0,
    transferability: 0, sequence_consistency: 0, engine_alignment: 0, difficulty_fit: 0,
  } satisfies Record<ExplanationQualityDimension, number>;
  if (!explanation || ["tactic", "opening"].includes(exercise.category)) return {
    version: EXPLANATION_QUALITY_VERSION, score: 0, maximum: 20, passed: false,
    dimensions: zero, hardNegatives: [], reasons: ["non_tactical_structured_explanation_missing"],
  };
  const dimensions = { ...zero };
  const hardNegatives = new Set<ExplanationHardNegative>();
  const reasons: string[] = [];
  const problem = explanation.problem ?? explanation.positionEssentials ?? explanation.notice;
  const state = explanation.stateChange ?? explanation.resultingPositionChange ?? "";
  const concept = explanation.primaryConcept ?? explanation.primaryConceptRationale ?? "";
  const feature = featureFor(exercise);
  const causal = Boolean(feature && matchesConceptSpecification(exercise.conceptSlug, feature));
  dimensions.problem_specificity = problem.length >= 35 && mentionsPosition(problem, exercise) ? 2 : problem.length >= 25 ? 1 : 0;
  dimensions.concept_causality = causal && concept.length >= 15 && mentionsPosition(`${concept} ${state}`, exercise) ? 2 : causal ? 1 : 0;
  const reply = exercise.solutionLine?.[1];
  const opponent = explanation.opponentResource ?? explanation.opponentIdea ?? "";
  const opponentNeeded = exercise.category === "defense" || exercise.conceptSlug === "restrict_counterplay" || Boolean(reply);
  dimensions.opponent_resource_specificity = !opponentNeeded ? 1
    : reply && opponent.includes(reply.slice(0, 2)) && opponent.includes(reply.slice(2, 4)) ? 2
      : opponent.length >= 35 && mentionsPosition(opponent, exercise) ? 1 : 0;
  const plans = explanation.candidatePlans ?? [];
  const distinctMechanisms = new Set(plans.map((plan) => compact(plan.mechanism))).size;
  dimensions.plan_contrast = plans.length >= 2 && distinctMechanisms >= 2 ? 2 : plans.length >= 2 ? 1 : 0;
  if (plans.length >= 2 && distinctMechanisms < 2) hardNegatives.add("fake_plan_comparison");
  const naturalUci = exercise.trainingAssessment?.contrast?.naturalMistake ?? exercise.trainingAssessment?.naturalMistake;
  const naturalText = explanation.naturalAlternative ?? "";
  const inferiorText = explanation.whyNaturalAlternativeIsInferior ?? "";
  const naturalEvidence = explanation.naturalAlternativeEvidence;
  // An omitted optional section is neutral. A populated section must earn its
  // score from actual human evidence; completeness never beats honesty.
  dimensions.natural_alternative_quality = !naturalText && !inferiorText ? 2
    : naturalEvidence && naturalUci && legalMove(exercise.fen, naturalUci)
      && naturalText.includes(naturalUci.slice(0, 2)) && naturalText.includes(naturalUci.slice(2, 4))
      && inferiorText.length >= 35 ? 2 : 0;
  if (/naturel|tentant|réflexe/i.test(naturalText) && !naturalEvidence) hardNegatives.add("unsupported_naturalness_claim");
  const objective = explanation.objective;
  if (compact(state) === compact(objective)) hardNegatives.add("objective_repetition");
  dimensions.state_change_verifiability = causal && state.length >= 35 && mentionsPosition(state, exercise)
    && !hardNegatives.has("objective_repetition") ? 2 : state.length >= 30 ? 1 : 0;
  const transfer = explanation.transferRule;
  dimensions.transferability = !transfer ? 2
    : /^(si|quand|lorsque|avant)\b/i.test(transfer.trim()) && transfer.length >= 45 ? 2
      : 0;
  if (transfer && /^quand une position présente le même mécanisme\b/i.test(transfer.trim())) {
    dimensions.transferability = 0;
    hardNegatives.add("generic_transfer_rule");
  }
  const sequence = sequenceConsistency(exercise, explanation);
  dimensions.sequence_consistency = sequence.score;
  sequence.negatives.forEach((negative) => hardNegatives.add(negative));
  const acceptable = explanation.acceptableMoves ?? exercise.acceptedConceptMoveUcis ?? [];
  const allLegal = acceptable.length > 0 && acceptable.every((uci) => legalMove(exercise.fen, uci));
  const goodMoves = exercise.trainingAssessment?.contrast?.goodMoves ?? [];
  const doesNotRejectSoundPlan = goodMoves.every((uci) => acceptable.includes(uci));
  dimensions.engine_alignment = allLegal && acceptable.includes(exercise.bestMove) && doesNotRejectSoundPlan ? 2 : allLegal ? 1 : 0;
  const difficulty = explanation.humanDifficulty;
  dimensions.difficulty_fit = difficulty && explanation.difficultyReasons?.some((reason) => reason.length >= 25) ? 2 : difficulty ? 1 : 0;

  const checkedClaims = [problem, explanation.chosenPlan ?? "", explanation.whyItWorksHere ?? "", state].map((value) => value.toLowerCase());
  if (checkedClaims.some((claim) => /améliore(?:r)? l’activité|gagne en activité/.test(claim)
    && !/vers|cible|case|colonne|diagonale/.test(claim))) hardNegatives.add("generic_activity_language");
  if (checkedClaims.some((claim) => /met(?:tre)? (?:davantage de )?pression/.test(claim)
    && !/sur [a-h][1-8]|pion|roi|dame|tour|cavalier|fou/.test(claim))) hardNegatives.add("generic_pressure_language");
  if (!causal) hardNegatives.add("generic_concept_without_mechanism");
  if (/échang/.test(explanation.chosenPlan ?? "") && !lineContainsCapture(exercise)) hardNegatives.add("premature_exchange_claim");
  if (hardNegatives.size) reasons.push(...hardNegatives);
  for (const [name, score] of Object.entries(dimensions)) if (score === 0) reasons.push(`${name}_not_demonstrated`);
  const score = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  return {
    version: EXPLANATION_QUALITY_VERSION, score, maximum: 20,
    passed: score >= EXPLANATION_QUALITY_THRESHOLD && hardNegatives.size === 0,
    dimensions, hardNegatives: [...hardNegatives], reasons,
  };
}
