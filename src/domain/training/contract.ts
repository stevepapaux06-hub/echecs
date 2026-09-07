import type {
  PedagogicalUnit,
  SequenceStopCondition,
  TrainingExercise,
} from "@/domain/chess/types";
import { normalizeConceptSlug } from "../knowledge/concepts";
import { coachInstructionFor } from "./coaching-copy";

const THEORETICAL_METHODS = new Set([
  "opposition",
  "rule_of_square",
  "lucena",
  "philidor",
  "rook_behind_pawn",
]);

export function pedagogicalUnitFor(exercise: TrainingExercise): PedagogicalUnit {
  if (exercise.pedagogicalUnit) return exercise.pedagogicalUnit;
  const concept = normalizeConceptSlug(exercise.primaryConcept ?? exercise.conceptSlug);
  if (THEORETICAL_METHODS.has(concept)) return "theoretical_method";
  if (exercise.mode === "one-move") return "single_move";
  if (exercise.mode === "line") return "decision_then_continuation";
  return "short_plan_sequence";
}

function stopConditionFor(unit: PedagogicalUnit): SequenceStopCondition {
  if (unit === "single_move") return "first_decision";
  if (unit === "theoretical_method") return "promotion_or_terminal";
  if (unit === "short_plan_sequence") return "evaluation_target";
  return "required_steps";
}

export function withPedagogicalContract<T extends TrainingExercise>(exercise: T): T {
  const pedagogicalUnit = pedagogicalUnitFor(exercise);
  const copy = coachInstructionFor(exercise);
  const playerStepsInReference = Math.max(1, Math.ceil((exercise.solutionLine?.length ?? 1) / 2));
  const maxPlayerMoves = pedagogicalUnit === "single_move"
    ? 1
    : Math.max(2, exercise.maxPlayerMoves, playerStepsInReference);
  const sequenceGoal = exercise.sequenceGoal ?? (
    pedagogicalUnit === "single_move"
      ? "Prendre une décision cohérente et pouvoir la justifier."
      : pedagogicalUnit === "theoretical_method"
        ? "Appliquer la méthode jusqu’au résultat technique attendu."
        : pedagogicalUnit === "short_plan_sequence"
          ? "Exécuter le plan tout en conservant la qualité de la position."
          : "Trouver l’idée puis confirmer qu’elle résiste à la meilleure réponse adverse."
  );

  return {
    ...exercise,
    ...copy,
    maxPlayerMoves,
    pedagogicalUnit,
    sequenceGoal,
    sequenceStopCondition: exercise.sequenceStopCondition ?? stopConditionFor(pedagogicalUnit),
  };
}
