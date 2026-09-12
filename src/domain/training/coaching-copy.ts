import type {
  StructuredExerciseExplanation,
  TrainingExercise,
} from "@/domain/chess/types";
import { uciToSan } from "./feedback";
import { normalizeConceptSlug } from "../knowledge/concepts";

export type CoachExplanation = {
  idea: string;
  whyItWorks: string[];
  temptingReflex?: string;
  takeaway?: string;
  exploreQuestion: string;
};

type ExerciseInstruction = Pick<TrainingExercise, "title" | "prompt">;

function tidyFrench(value: string | undefined): string {
  return (value ?? "")
    .replace(/L’avantage d’environ\s+[+-]?\d+(?:[.,]\d+)?\s+pions?/gi, "Ton avantage")
    .replace(/concède environ\s+\d+\s+centipions?(?:\s+face à la meilleure défense)?/gi, "laisse l’adversaire résoudre son problème")
    .replace(/\bmécanisme\s+«[^»]+»/gi, "idée recherchée")
    .replace(/^Quand une position présente le même mécanisme,\s*/i, "Dans une position comparable, ")
    .replace(/\bmenace forcing\b/gi, "menace directe")
    .replace(/\baction forcing\b/gi, "suite forcée")
    .replace(/\bcoups? forcing\b/gi, (match) => match.toLowerCase().startsWith("coups") ? "coups forcés" : "coup forcé")
    .replace(/\s+/g, " ")
    .trim();
}

function endgameInstruction(exercise: TrainingExercise, concept: string): ExerciseInstruction {
  const expectedDraw = exercise.tablebaseWdl === "draw"
    || exercise.trainingAssessment?.outcome?.root === "draw"
    || exercise.type === "defense";
  if (expectedDraw) return {
    title: "Tiens la position",
    prompt: "Repère la ressource qui neutralise le plan adverse, puis prouve que la position tient.",
  };
  if (["king_activity", "king_and_pawn"].includes(concept)) return {
    title: "Fais entrer ton roi",
    prompt: "Trouve la route utile sans donner à l’adversaire le temps de bloquer la position.",
  };
  if (concept === "favorable_endgame_transition") return {
    title: "Choisis la bonne transition",
    prompt: "Compare ce qui restera après les échanges avant de transformer la position.",
  };
  if (["rook_activity", "rook_endgame", "rook_behind_pawn", "lucena", "philidor"].includes(concept)) return {
    title: "Trouve la méthode avec la tour",
    prompt: "Cherche l’activité et la disposition technique qui font réellement avancer le résultat.",
  };
  return {
    title: "Trouve la méthode gagnante",
    prompt: "Identifie les cases clés et applique le principe jusqu’à rendre le résultat clair.",
  };
}

/** Public instructions name the human problem without leaking the answer. */
export function coachInstructionFor(exercise: TrainingExercise): ExerciseInstruction {
  if (exercise.origin === "personal") return {
    title: "Reprends cette décision",
    prompt: "Cette position vient de ta partie. Compare les plans possibles et choisis celui qui répond au vrai problème.",
  };
  const concept = normalizeConceptSlug(exercise.primaryConcept ?? exercise.conceptSlug);
  if (exercise.category === "strategy") {
    if (concept === "improve_worst_piece") return {
      title: "Quelle pièce dois-tu améliorer ?",
      prompt: "Repère la pièce qui participe le moins au jeu et trouve-lui un rôle concret.",
    };
    if (concept === "pawn_break") return {
      title: "Trouve la bonne rupture",
      prompt: "Demande-toi quelle poussée change réellement la structure — et si le moment est venu.",
    };
    if (concept === "restrict_counterplay") return {
      title: "Réduis le contre-jeu",
      prompt: "Identifie d’abord ce que l’adversaire veut obtenir, puis empêche-le sans devenir passif.",
    };
    return {
      title: "Choisis le meilleur plan",
      prompt: "Compare l’activité des pièces, les cases d’entrée et les faiblesses avant de jouer.",
    };
  }
  if (exercise.category === "endgame") return endgameInstruction(exercise, concept);
  if (exercise.category === "conversion") {
    if (concept === "restrict_counterplay") return {
      title: "Supprime le contre-jeu",
      prompt: "Avant de progresser, trouve la ressource active de l’adversaire et retire-la de la position.",
    };
    if (["simplify_when_ahead", "favorable_endgame_transition"].includes(concept)) return {
      title: "Choisis le bon échange",
      prompt: "Imagine les pièces qui resteront : l’échange doit rendre ton avantage plus simple, pas plus petit.",
    };
    return {
      title: "Consolide ton avantage",
      prompt: "Améliore ta position sans te précipiter et sans offrir une activité gratuite à l’adversaire.",
    };
  }
  if (exercise.category === "defense") {
    if (["active_defense", "defensive_counterplay"].includes(concept)) return {
      title: "Trouve la ressource",
      prompt: "Repère la menace, puis cherche une réponse active qui pose aussi un problème à l’adversaire.",
    };
    return {
      title: "Neutralise la menace",
      prompt: "Commence par nommer le danger immédiat, puis trouve la défense qui le supprime vraiment.",
    };
  }
  if (exercise.category === "opening") return {
    title: "Choisis la bonne priorité",
    prompt: "Compare développement, centre et sécurité du roi avant de choisir ton coup.",
  };
  return {
    title: "Trouve la suite",
    prompt: "Calcule d’abord les coups forcés et vérifie la meilleure réponse adverse avant de jouer.",
  };
}

function compactWhy(explanation: StructuredExerciseExplanation): string[] {
  const plan = tidyFrench(explanation.chosenPlan ?? explanation.plan);
  const reason = tidyFrench(explanation.whyItWorksHere ?? explanation.objective);
  const change = tidyFrench(explanation.stateChange ?? explanation.resultingPositionChange);
  const resource = tidyFrench(explanation.opponentResource ?? explanation.opponentIdea);
  const first = [plan, reason]
    .filter(Boolean)
    .filter((part, index, values) => index === 0 || !values[0].toLowerCase().includes(part.toLowerCase()))
    .join(" ");
  return [first, change, resource]
    .filter(Boolean)
    .filter((part, index, values) => values.findIndex((candidate) => (
      candidate.toLowerCase() === part.toLowerCase()
      || (index > 0 && candidate.toLowerCase().includes(part.toLowerCase()))
    )) === index)
    .slice(0, 3);
}

function naturalMoveLabel(exercise: TrainingExercise, explanation: StructuredExerciseExplanation): string | null {
  const evidence = explanation.naturalAlternativeEvidence
    ?? (exercise.origin === "personal"
      && exercise.playedMove
      && exercise.playedMove === (exercise.trainingAssessment?.contrast?.naturalMistake
        ?? exercise.trainingAssessment?.naturalMistake)
      ? "observed_played_move"
      : undefined);
  if (!evidence) return null;
  const uci = exercise.trainingAssessment?.contrast?.naturalMistake
    ?? exercise.trainingAssessment?.naturalMistake;
  if (uci) return uciToSan(exercise.fen, uci);
  return explanation.naturalAlternative?.split(" est une alternative")[0]?.trim() || null;
}

function supportedTakeaway(exercise: TrainingExercise, explanation: StructuredExerciseExplanation): string | undefined {
  const transfer = explanation.transferRule;
  if (!transfer || /^quand une position présente le même mécanisme\b/i.test(transfer.trim())) return undefined;
  const concrete = [exercise.bestMove.slice(0, 2), exercise.bestMove.slice(2, 4), ...(exercise.keySquares ?? [])]
    .some((square) => `${explanation.problem ?? ""} ${explanation.stateChange ?? ""}`.toLowerCase().includes(square));
  return concrete ? tidyFrench(transfer) : undefined;
}

/** Turns the rich internal causal object into a 15–30 second coach explanation. */
export function coachExplanationFor(exercise: TrainingExercise): CoachExplanation | null {
  const explanation = exercise.explanation;
  if (!explanation) return null;
  const idea = tidyFrench(explanation.problem ?? explanation.notice);
  const whyItWorks = compactWhy(explanation);
  const alternative = naturalMoveLabel(exercise, explanation);
  const inferior = tidyFrench(explanation.whyNaturalAlternativeIsInferior);
  const temptingReflex = alternative
    ? `${alternative} semble naturel, mais ${inferior
      ? inferior.replace(new RegExp(`^${alternative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\([^)]*\\))?\\s*`, "i"), "").replace(/^ne\s+/i, "il ne ")
      : "il ne règle pas le problème aussi précisément dans cette position"}.`
        .replace(/\.\.$/, ".")
    : undefined;
  const takeaway = supportedTakeaway(exercise, explanation);
  const chosenSan = uciToSan(exercise.fen, exercise.bestMove);
  const exploreQuestion = alternative
    ? `À explorer : pourquoi ${chosenSan} répond-il mieux à la position que ${alternative} ?`
    : `À explorer : quel changement concret ${chosenSan} produit-il dans cette position ?`;
  return {
    idea: idea || "La position demande de résoudre un problème concret avant de chercher un coup actif.",
    whyItWorks: whyItWorks.length ? whyItWorks : [tidyFrench(explanation.objective)],
    temptingReflex,
    takeaway,
    exploreQuestion,
  };
}

export function exerciseProvenance(exercise: TrainingExercise): string {
  if (exercise.origin === "personal" || exercise.source === "personal_game") {
    return "Position issue de tes parties";
  }
  if (exercise.sourcePlayers?.length) {
    return `Partie réelle · ${exercise.sourcePlayers.slice(0, 2).join(" – ")}`;
  }
  if (exercise.source === "lichess_broadcast") return "Partie réelle · Lichess Broadcast";
  if (["lichess", "lichess_standard"].includes(exercise.source ?? "")) return "Nouvelle position d’entraînement · Lichess";
  if (exercise.source === "lichess_tablebase" || exercise.tablebaseWdl) return "Nouvelle position d’entraînement · méthode vérifiée";
  return "Nouvelle position d’entraînement";
}
