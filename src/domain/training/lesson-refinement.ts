import { Chess, type Square } from "chess.js";
import type { PedagogicalUnit, TrainingExercise } from "../chess/types";
import {
  causalFeatures,
  causalLineFeatures,
  CONCEPT_SPECIFICATIONS,
} from "../patterns/concept-specifications";

/** Human-reviewed regression decisions from the independent training audit. */
export const TRAINING_REFERENCE_ONLY = new Set([
  "quality-mine-convert_small_advantage-bb8cedb67c2f2f",
  "contrast-mine-restrict_counterplay-dcf7ec5be80f75aa1d",
  "contrast-mine-defensive_resource-354a5e95b007199406",
]);

const GOLD_PLAYER_DECISIONS: Record<string, number> = {
  "master-improve_worst_piece-ceaed0f6c0bb7e": 1,
  "contrast-mine-outpost-b0b0d5d159ffdfb8b6": 2,
  "contrast-mine-open_file-673d0f89da8656ec2c": 2,
  "contrast-mine-weak_square-222bfde2c12e897356": 1,
  "contrast-mine-favorable_exchange-fe61049767b389fa1b": 2,
  "contrast-mine-opposition-865f5d5ce49ed89693": 2,
  "contrast-mine-king_and_pawn-7e8c7e2928e07f38ab": 5,
  "contrast-mine-king_activity-ef0775a578eef98ee6": 3,
  // The verified rook-method signal is reached on White's fourth decision
  // (Re8-d8), not on the second one. Truncating earlier made the milestone
  // structurally impossible in the published lesson.
  "contrast-mine-rook_endgame-d72e2f4a3d4f7aac48": 4,
  "lichess-0BFjc": 4,
  "contrast-mine-simplify_when_ahead-0a0f72e07ab19368e5": 2,
  "contrast-mine-use_material_advantage-540b14a180975e7dbc": 2,
  "master-favorable_endgame_transition-3085c977752ecf": 3,
  "lichess-Ay1hj": 2,
  "contrast-mine-simplification_to_hold-9bcc851927265d9e80": 3,
  "lichess-J6NVc": 2,
};

export const GOLD_TRAINING_IDS = new Set(Object.keys(GOLD_PLAYER_DECISIONS));

const CONVERSION_BY_SIGNAL: Array<[string, string]> = [
  ["endgame_transition", "favorable_endgame_transition"],
  ["material_advantage_used", "use_material_advantage"],
  ["threat_reduced", "restrict_counterplay"],
  ["useful_exchange", "simplify_when_ahead"],
  ["useful_activity_gain", "preserve_activity"],
];

const DEFENSE_BY_SIGNAL: Array<[string, string]> = [
  ["material_return", "return_material"],
  ["saving_exchange", "simplification_to_hold"],
  ["attacker_removed", "exchange_attacker"],
  ["active_threat_answer", "active_defense"],
  ["defensive_activity", "defensive_endgame_activity"],
  ["threat_reduced", "defensive_resource"],
];

function preciseConcept(exercise: TrainingExercise, signals: string[]): string {
  const ordered = exercise.category === "conversion"
    ? CONVERSION_BY_SIGNAL
    : exercise.category === "defense"
      ? DEFENSE_BY_SIGNAL
      : [];
  const match = ordered.find(([signal]) => signals.includes(signal));
  return match?.[1] ?? exercise.conceptSlug;
}

function ownMoves(line: string[] | undefined): string[] {
  return (line ?? []).filter((_move, index) => index % 2 === 0);
}

function proofSignalAt(exercise: TrainingExercise, playerDecision: number): string | undefined {
  const line = exercise.solutionLine ?? [];
  const ply = (playerDecision - 1) * 2;
  if (!line[ply]) return undefined;
  try {
    const chess = new Chess(exercise.fen);
    for (let index = 0; index < ply; index += 1) {
      const uci = line[index];
      chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
    }
    const features = causalFeatures(chess.fen(), line[ply]);
    const necessary = CONCEPT_SPECIFICATIONS[exercise.conceptSlug]?.necessary_signals ?? [];
    return features?.signals.find((signal) => necessary.includes(signal))
      ?? features?.signals.find((signal) => [
        "threat_reduced", "attacker_removed", "saving_exchange", "material_return",
        "useful_activity_gain", "material_advantage_used", "endgame_transition",
        "useful_exchange", "pawn_contact_created", "passer_progress", "rook_method",
        "opposition_acquired", "king_approaches_target",
      ].includes(signal));
  } catch {
    return undefined;
  }
}

function inferredPlayerDecisions(exercise: TrainingExercise): number {
  const available = ownMoves(exercise.solutionLine).length;
  if (available < 2) return 1;
  const gold = GOLD_PLAYER_DECISIONS[exercise.id];
  if (gold) return Math.min(gold, available);
  if (exercise.pedagogicalUnit !== "single_move") return Math.min(exercise.maxPlayerMoves, available);
  if (!["conversion", "defense"].includes(exercise.category)) return 1;
  return proofSignalAt(exercise, 2) ? 2 : 1;
}

function unitFor(exercise: TrainingExercise, decisions: number): PedagogicalUnit {
  if (decisions <= 1) return "single_move";
  if (exercise.category === "endgame") return "theoretical_method";
  return decisions === 2 ? "decision_then_continuation" : "short_plan_sequence";
}

function stepLabel(exercise: TrainingExercise, index: number, uci: string): string {
  if (index === 0) return `Choisir le plan ${uci.slice(0, 2)}–${uci.slice(2, 4)}`;
  if (index === 1) return `Confirmer l’idée après la meilleure défense par ${uci.slice(0, 2)}–${uci.slice(2, 4)}`;
  return `Atteindre le jalon par ${uci.slice(0, 2)}–${uci.slice(2, 4)}`;
}

/** Last-mile publication pass. It never invents a line: it only promotes a
 * more precise concept and continuation already present in verified data. */
export function refineTrainingLesson(exercise: TrainingExercise): TrainingExercise {
  if (["tactic", "opening"].includes(exercise.category)) return exercise;
  const lineFeatures = causalLineFeatures(exercise.fen, exercise.solutionLine ?? [exercise.bestMove]);
  const conceptSlug = preciseConcept(exercise, lineFeatures?.signals ?? []);
  const reclassified = conceptSlug === exercise.conceptSlug ? exercise : {
    ...exercise,
    conceptSlug,
    primaryConcept: conceptSlug,
    theme: conceptSlug,
  };
  const decisions = inferredPlayerDecisions(reclassified);
  const moves = ownMoves(reclassified.solutionLine).slice(0, decisions);
  if (decisions <= 1) return {
    ...reclassified,
    pedagogicalUnit: "single_move",
    sequenceStopCondition: "first_decision",
    maxPlayerMoves: 1,
    requiredSteps: undefined,
    mode: "one-move",
  };
  const lastPly = decisions * 2 - 1;
  const proofSignal = proofSignalAt(reclassified, decisions);
  const existingMilestone = reclassified.pedagogicalMilestone
    ? {
        ...reclassified.pedagogicalMilestone,
        minimumPlayerMoves: Math.max(reclassified.pedagogicalMilestone.minimumPlayerMoves, decisions),
      }
    : undefined;
  return {
    ...reclassified,
    mode: "line",
    pedagogicalUnit: unitFor(reclassified, decisions),
    maxPlayerMoves: decisions,
    solutionLine: reclassified.solutionLine?.slice(0, lastPly),
    requiredSteps: moves.map((uci, index) => ({
      label: stepLabel(reclassified, index, uci),
      acceptedMoveUcis: index === 0
        ? [...new Set([uci, ...(reclassified.acceptedConceptMoveUcis ?? [])])]
        : [uci],
    })),
    pedagogicalMilestone: existingMilestone ?? (proofSignal ? {
      kind: "concept_state",
      proof: "structural",
      minimumPlayerMoves: decisions,
      signal: proofSignal,
    } : undefined),
    sequenceStopCondition: existingMilestone || proofSignal ? "pedagogical_milestone" : "required_steps",
  };
}

export function shouldPublishTrainingLesson(exercise: TrainingExercise): boolean {
  return !TRAINING_REFERENCE_ONLY.has(exercise.id);
}

export function goldDecisionCount(exerciseId: string): number | undefined {
  return GOLD_PLAYER_DECISIONS[exerciseId];
}
