import type {
  PedagogicalUnit,
  SequenceStopCondition,
  TrainingExercise,
} from "@/domain/chess/types";
import { normalizeConceptSlug } from "../knowledge/concepts";

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

function publicCopy(exercise: TrainingExercise): Pick<TrainingExercise, "title" | "prompt"> {
  if (exercise.origin === "personal") {
    return {
      title: "Reprends cette décision",
      prompt: "Cette position vient de ta partie. Compare les plans, puis joue la continuation que tu juges la plus précise.",
    };
  }
  if (exercise.category === "strategy") {
    return {
      title: "Choisis le meilleur plan",
      prompt: "Évalue les pièces, les faiblesses et le contre-jeu avant de choisir une direction.",
    };
  }
  if (exercise.category === "endgame") {
    return {
      title: "Trouve la méthode",
      prompt: "Identifie le principe technique, puis applique-le jusqu’à clarifier le résultat.",
    };
  }
  if (exercise.category === "conversion") {
    return {
      title: "Consolide ton avantage",
      prompt: "Choisis le plan qui progresse sans rendre de contre-jeu inutile.",
    };
  }
  if (exercise.category === "defense") {
    return {
      title: "Neutralise le danger",
      prompt: "Repère la menace prioritaire et cherche une défense active qui garde la position jouable.",
    };
  }
  if (exercise.category === "opening") {
    return {
      title: "Choisis la bonne priorité",
      prompt: "Cherche le coup qui sert le développement, le centre ou la sécurité du roi.",
    };
  }
  return {
    title: "Trouve la suite",
    prompt: "Calcule les coups forcing jusqu’au résultat concret avant de jouer.",
  };
}

export function withPedagogicalContract<T extends TrainingExercise>(exercise: T): T {
  const pedagogicalUnit = pedagogicalUnitFor(exercise);
  const copy = publicCopy(exercise);
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

