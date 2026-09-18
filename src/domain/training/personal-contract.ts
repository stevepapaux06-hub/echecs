import { Chess, type Square } from "chess.js";
import type {
  AnalyzedMove,
  PersonalExerciseReason,
  PedagogicalConceptRole,
  TrainingAnswerContract,
  TrainingCandidateLine,
} from "../chess/types";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";
import { conceptDefinition, normalizeConceptSlug } from "../knowledge/concepts";
import { causalFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../patterns/concept-specifications";
import { detectMovePatterns, type PatternOccurrence } from "../patterns/engine";
import { isPatternProductEligible } from "../patterns/policy";

export const EQUIVALENT_HUMAN_PLAN_TOLERANCE_CP = 35;
const SAME_MECHANISM_TOLERANCE_CP = 60;
/** A personal corrective lesson must represent a meaningful objective mistake.
 * Smaller inaccuracies may remain diagnostic context, but are not strong
 * enough on their own to justify an assertive exercise. */
export const MINIMUM_CORRECTIVE_LOSS_CP = 100;
export const MINIMUM_STABLE_PATTERN_LOSS_CP = 140;

const META_CONCEPTS = new Set(["forcing_moves"]);
const ENGINE_CONSENSUS_CONCEPTS = new Set([
  "fork", "pin", "loose_piece", "remove_defender", "overloaded_defender",
  "skewer", "opponent_threat", "exchange_attacker",
]);
const CONCEPT_PRIORITY = [
  "remove_defender", "overloaded_defender", "fork", "skewer", "pin", "loose_piece",
  "opponent_threat", "exchange_attacker", "defensive_counterplay", "active_defense",
  "restrict_counterplay", "simplify_when_ahead", "favorable_endgame_transition",
  "outpost", "open_file", "pawn_break", "improve_worst_piece", "weak_pawn",
] as const;

function priorityOf(conceptSlug: string): number {
  const index = CONCEPT_PRIORITY.indexOf(conceptSlug as typeof CONCEPT_PRIORITY[number]);
  return index < 0 ? 0 : CONCEPT_PRIORITY.length - index;
}

function isForcingMove(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci[4] || "q",
    });
    return Boolean(move.captured || move.promotion || chess.inCheck());
  } catch {
    return false;
  }
}

function mechanismsForMove(move: AnalyzedMove, uci: string): string[] {
  const detected = detectMovePatterns(move.fenBefore, uci, { includePilot: false })
    .filter(isPatternProductEligible)
    .map((pattern) => normalizeConceptSlug(pattern.conceptSlug));
  const persisted = (move.patterns ?? [])
    .filter((pattern) => pattern.moveUci === uci && isPatternProductEligible(pattern))
    .map((pattern) => normalizeConceptSlug(pattern.conceptSlug));
  return [...new Set([...detected, ...persisted])];
}

function planFamily(conceptSlug: string, uci: string, mechanisms: string[]): string {
  const concrete = mechanisms.find((mechanism) => !META_CONCEPTS.has(mechanism));
  if (concrete) return concrete;
  if (conceptSlug === "open_file") return `${conceptSlug}:file-${uci[2]}`;
  return conceptSlug;
}

function conceptIsCausallyProven(
  move: AnalyzedMove,
  moveUci: string,
  conceptSlug: string,
  opponentReplyUci?: string,
  allowImmediateCapture = false,
): boolean {
  const definition = conceptDefinition(conceptSlug);
  if (!definition) return false;
  if (definition.category === "defense" && move.playerCpBefore > -50) return false;
  if (definition.category === "conversion"
    && (move.playerCpBefore < 80 || move.playerCpBefore > 700)) return false;
  if (definition.category === "endgame" && move.phase !== "endgame") return false;
  // A geometrical fork is not a real fork when the opponent's principal reply
  // simply captures the forking piece on its destination square.
  if (conceptSlug === "fork"
    && !allowImmediateCapture
    && opponentReplyUci?.slice(2, 4) === moveUci.slice(2, 4)) return false;
  const specification = CONCEPT_SPECIFICATIONS[conceptSlug];
  if (specification) {
    const features = causalFeatures(move.fenBefore, moveUci);
    return Boolean(features && matchesConceptSpecification(conceptSlug, features));
  }
  return detectMovePatterns(move.fenBefore, moveUci)
    .some((pattern) => normalizeConceptSlug(pattern.conceptSlug) === conceptSlug);
}

function isPromotionMove(fen: string, uci: string): boolean {
  if (uci.length > 4) return true;
  try {
    const chess = new Chess(fen);
    const piece = chess.get(uci.slice(0, 2) as Square);
    const targetRank = uci[3];
    return piece?.type === "p" && (targetRank === "1" || targetRank === "8");
  } catch {
    return false;
  }
}

function candidateLines(move: AnalyzedMove): TrainingCandidateLine[] {
  return move.before.lines
    .filter((line) => line.pv[0])
    .map((line) => {
      const uci = line.pv[0];
      const mechanisms = mechanismsForMove(move, uci);
      return {
        uci,
        playerCp: evaluationForPlayer(line.whiteCp, move.color === "w" ? "white" : "black"),
        whiteCentricCp: line.whiteCp,
        pv: line.pv.slice(0, 8),
        isForcing: isForcingMove(move.fenBefore, uci),
        mechanisms,
        planFamily: "",
      };
    })
    .toSorted((first, second) => second.playerCp - first.playerCp);
}

function failedOccurrences(move: AnalyzedMove): PatternOccurrence[] {
  return (move.patterns ?? [])
    .filter((pattern) => pattern.opportunity && !pattern.success && isPatternProductEligible(pattern))
    .toSorted((first, second) => (
      Number(META_CONCEPTS.has(first.conceptSlug)) - Number(META_CONCEPTS.has(second.conceptSlug))
      || priorityOf(second.conceptSlug) - priorityOf(first.conceptSlug)
      || second.confidence - first.confidence
    ));
}

function consensusConceptForEngineLines(
  move: AnalyzedMove,
  lines: TrainingCandidateLine[],
): string | null {
  const best = lines[0];
  if (!best) return null;
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const mechanism of new Set(line.mechanisms ?? [])) {
      if (!ENGINE_CONSENSUS_CONCEPTS.has(mechanism)) continue;
      counts.set(mechanism, (counts.get(mechanism) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([concept, count]) => (
      count >= 2
      && best.mechanisms?.includes(concept)
      // Two independent serious lines may encode a sacrifice/zwischenzug in
      // which the first forking piece is captured before the second arrives.
      // That exception is only allowed under cross-line mechanism consensus.
      && conceptIsCausallyProven(move, best.uci, concept, best.pv[1], true)
      && (concept !== "opponent_threat"
        || !["winning", "clearly_winning"].includes(move.pedagogical?.beforeState ?? ""))
    ))
    .toSorted((first, second) => second[1] - first[1] || priorityOf(second[0]) - priorityOf(first[0]))[0]?.[0] ?? null;
}

export type PersonalContractDecision = {
  eligible: boolean;
  terminalReason: "LOW_PRIORITY" | "LOW_CONFIDENCE" | "ABSTAINED" | "CONCEPT_CONFLICT" | "TACTICAL_OVERRIDE" | "ANSWER_AMBIGUITY";
  reasons: string[];
  personalReason?: PersonalExerciseReason;
  conceptSlug?: string;
  conceptRole?: PedagogicalConceptRole;
  answerContract?: TrainingAnswerContract;
  engineCandidates?: TrainingCandidateLine[];
};

/** Final publication gate for personal lessons. Detection proposes a motif;
 * this contract requires objective cost, causal proof and a MultiPV answer set. */
export function assessPersonalExercise(move: AnalyzedMove): PersonalContractDecision {
  const assessment = move.pedagogical;
  if (!assessment?.worthy || assessment.score < 55) {
    return { eligible: false, terminalReason: "LOW_PRIORITY", reasons: ["pedagogical_score_below_55"] };
  }
  if (assessment.beforeState === "clearly_lost"
    && (assessment.kind !== "defensive_resource" || assessment.afterState === "clearly_lost")) {
    return { eligible: false, terminalReason: "ABSTAINED", reasons: ["already_clearly_lost"] };
  }
  if (assessment.beforeState === "clearly_winning"
    && !["equal", "slightly_worse", "losing", "clearly_lost"].includes(assessment.afterState)) {
    return { eligible: false, terminalReason: "ABSTAINED", reasons: ["still_clearly_winning"] };
  }

  const lines = candidateLines(move);
  if (lines.length < 2) {
    return { eligible: false, terminalReason: "ANSWER_AMBIGUITY", reasons: ["multipv_alternatives_missing"] };
  }
  if (move.multiPvStability?.status === "unstable") {
    return {
      eligible: false,
      terminalReason: "ANSWER_AMBIGUITY",
      reasons: ["multipv_ranking_unstable"],
    };
  }
  const bestPlayerCp = lines[0].playerCp;
  const objectiveLoss = Math.max(0, bestPlayerCp - move.playerCpAfter);
  const minimumLoss = assessment.kind === "stable_pattern"
    ? MINIMUM_STABLE_PATTERN_LOSS_CP
    : MINIMUM_CORRECTIVE_LOSS_CP;
  if (objectiveLoss < minimumLoss) {
    return {
      eligible: false,
      terminalReason: "ABSTAINED",
      reasons: [objectiveLoss <= EQUIVALENT_HUMAN_PLAN_TOLERANCE_CP
        ? "played_move_already_best_or_equivalent"
        : assessment.kind === "stable_pattern"
          ? "stable_pattern_cost_below_threshold"
          : "objective_cost_below_personal_lesson_threshold"],
    };
  }

  const stableMoveSet = move.multiPvStability?.status === "multi_plan"
    ? new Set(move.multiPvStability.acceptedMoveUcis)
    : null;
  const serious = lines.filter((line) => stableMoveSet?.has(line.uci)
    || bestPlayerCp - line.playerCp <= SAME_MECHANISM_TOLERANCE_CP);
  const occurrences = failedOccurrences(move);
  const supported = occurrences.filter((occurrence) => serious.some((line) => (
    line.mechanisms?.includes(occurrence.conceptSlug)
    && conceptIsCausallyProven(move, line.uci, occurrence.conceptSlug, line.pv[1])
  )));
  const consensusConcept = consensusConceptForEngineLines(move, serious);
  if (!supported.length && !consensusConcept) {
    if (!occurrences.length) {
      return { eligible: false, terminalReason: "LOW_CONFIDENCE", reasons: ["no_reliable_failed_concept"] };
    }
    return { eligible: false, terminalReason: "CONCEPT_CONFLICT", reasons: ["detected_signal_not_proven_by_engine_alternatives"] };
  }

  const chosen = supported.toSorted((first, second) => (
    Number(META_CONCEPTS.has(first.conceptSlug)) - Number(META_CONCEPTS.has(second.conceptSlug))
    || priorityOf(second.conceptSlug) - priorityOf(first.conceptSlug)
    || second.confidence - first.confidence
  ))[0];
  const detectedConcept = chosen ? normalizeConceptSlug(chosen.conceptSlug) : null;
  const conceptSlug = consensusConcept
    && (!detectedConcept || priorityOf(consensusConcept) > priorityOf(detectedConcept))
    ? consensusConcept
    : detectedConcept!;
  if (META_CONCEPTS.has(conceptSlug)) {
    return {
      eligible: false,
      terminalReason: "CONCEPT_CONFLICT",
      reasons: ["meta_label_without_concrete_mechanism"],
    };
  }
  // A promotion may incidentally attack two pieces. For a personal lesson the
  // causal mechanism is promotion, not a fork by the disappearing pawn.
  if (conceptSlug === "fork" && serious[0] && isPromotionMove(move.fenBefore, serious[0].uci)) {
    return {
      eligible: false,
      terminalReason: "CONCEPT_CONFLICT",
      reasons: ["promotion_is_primary_mechanism"],
    };
  }
  if (!serious[0]?.mechanisms?.includes(conceptSlug)
    || !conceptIsCausallyProven(
      move,
      serious[0].uci,
      conceptSlug,
      serious[0].pv[1],
      conceptSlug === consensusConcept,
    )) {
    return {
      eligible: false,
      terminalReason: "CONCEPT_CONFLICT",
      reasons: ["objectively_best_move_uses_different_mechanism"],
    };
  }
  const concreteCompetitor = serious
    .flatMap((line) => line.mechanisms ?? [])
    .filter((mechanism) => mechanism !== conceptSlug && !META_CONCEPTS.has(mechanism))
    .toSorted((first, second) => priorityOf(second) - priorityOf(first))[0];
  if (META_CONCEPTS.has(conceptSlug) && concreteCompetitor) {
    return { eligible: false, terminalReason: "TACTICAL_OVERRIDE", reasons: [`meta_label_overridden_by_${concreteCompetitor}`] };
  }
  if (concreteCompetitor && priorityOf(concreteCompetitor) > priorityOf(conceptSlug)) {
    return { eligible: false, terminalReason: "CONCEPT_CONFLICT", reasons: [`primary_concept_is_${concreteCompetitor}`] };
  }

  const accepted = lines.flatMap((line) => {
    const lossFromBestCp = Math.max(0, bestPlayerCp - line.playerCp);
    const sameMechanism = line.mechanisms?.includes(conceptSlug) ?? false;
    const stabilityAccepted = stableMoveSet?.has(line.uci) ?? false;
    if (!stabilityAccepted
      && (!sameMechanism || lossFromBestCp > SAME_MECHANISM_TOLERANCE_CP)
      && lossFromBestCp > EQUIVALENT_HUMAN_PLAN_TOLERANCE_CP) return [];
    return [{
      moveUci: line.uci,
      playerCp: line.playerCp,
      lossFromBestCp,
        reason: sameMechanism ? "same_mechanism" as const : "equivalent_human_plan" as const,
      mechanisms: line.mechanisms ?? [],
      planFamily: planFamily(conceptSlug, line.uci, line.mechanisms ?? []),
    }];
  });
  if (!accepted.length) {
    return { eligible: false, terminalReason: "ANSWER_AMBIGUITY", reasons: ["no_robust_accepted_answer"] };
  }
  if (accepted.some((answer) => answer.moveUci === move.uci)) {
    return {
      eligible: false,
      terminalReason: "ABSTAINED",
      reasons: ["played_move_already_accepted_by_answer_contract"],
    };
  }
  const personalReason: PersonalExerciseReason = objectiveLoss >= 60 ? "ERROR" : "OPPORTUNITY";
  const enrichedLines = lines.map((line) => ({
    ...line,
    planFamily: planFamily(conceptSlug, line.uci, line.mechanisms ?? []),
  }));
  return {
    eligible: true,
    terminalReason: "LOW_PRIORITY",
    reasons: [],
    personalReason,
    conceptSlug,
    conceptRole: "PRIMARY",
    engineCandidates: enrichedLines,
    answerContract: {
      version: 1,
      bestPlayerCp,
      equivalentToleranceCp: EQUIVALENT_HUMAN_PLAN_TOLERANCE_CP,
      accepted,
      stability: move.multiPvStability,
    },
  };
}

export function estimatePedagogicalDifficulty(
  move: AnalyzedMove,
  decision: PersonalContractDecision,
): number {
  const accepted = decision.answerContract?.accepted.length ?? 1;
  const candidateCount = decision.engineCandidates?.length ?? 1;
  const forcing = decision.engineCandidates?.some((line) => line.isForcing) ?? false;
  const lineLength = decision.engineCandidates?.[0]?.pv.length ?? 1;
  const raw = 900 + Math.max(0, candidateCount - accepted) * 90 + Number(forcing) * 90
    + Math.min(240, lineLength * 25) + Math.min(180, Math.round(move.lossCp / 4));
  return Math.max(800, Math.min(1_800, Math.round(raw / 50) * 50));
}
