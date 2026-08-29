import type {
  AnalyzedGame,
  DiagnosticCategory,
  DiagnosticMetrics,
  TrainingExercise,
  TrainingType,
} from "@/domain/chess/types";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";
import { conceptExercisesFor } from "./library";

function getType(playerCp: number, phase: string): TrainingType {
  if (playerCp >= 200) return "conversion";
  if (playerCp <= -150) return "defense";
  if (phase === "endgame") return "endgame";
  return "mistake";
}
function categoryForType(type: TrainingType): DiagnosticCategory {
  if (type === "conversion") return "conversion";
  if (type === "defense") return "defense";
  if (type === "endgame") return "endgame";
  if (type === "strategy") return "strategy";
  if (type === "opening") return "opening";
  return "tactic";
}

const COPY: Record<TrainingType, { title: string; prompt: string; concept: string }> = {
  conversion: {
    title: "Conserve ton avantage",
    prompt: "Tu disposais ici d’un avantage important. Trouve une suite précise qui garde le contrôle.",
    concept: "En position gagnante, la priorité est de limiter le contre-jeu avant de chercher la solution la plus rapide.",
  },
  defense: {
    title: "Trouve la meilleure résistance",
    prompt: "La position est difficile, mais elle demande encore une défense active. Quel est ton meilleur essai ?",
    concept: "Une défense active crée des problèmes concrets au lieu d’attendre passivement la prochaine menace.",
  },
  endgame: {
    title: "Joue cette finale avec précision",
    prompt: "Cette décision de finale a compté. Cherche le coup qui améliore le plus ta position.",
    concept: "En finale, l’activité du roi et des pièces pèse souvent davantage qu’un pion défendu passivement.",
  },
  mistake: {
    title: "Rejoue ta décision",
    prompt: "Cette position vient de ta partie. Prends le temps de trouver une meilleure continuation.",
    concept: "Commence par comparer tous les échecs, prises et menaces avant de choisir ton coup.",
  },
  tactic: {
    title: "Calcule la ressource forcing",
    prompt: "Trouve la suite concrète, puis vérifie jusqu’où le motif fonctionne.",
    concept: "Une séquence forcing doit être calculée jusqu’au gain, pas seulement reconnue au premier coup.",
  },
  strategy: {
    title: "Trouve le meilleur plan",
    prompt: "Cherche le placement qui améliore durablement ta position.",
    concept: "Un bon plan améliore la pièce la moins active et réduit le contre-jeu adverse.",
  },
  opening: {
    title: "Retrouve le plan de la structure",
    prompt: "Ne récite pas un coup : identifie l’idée de développement ou la rupture adaptée.",
    concept: "Les ouvertures se retiennent mieux par leurs plans et leurs structures que par une suite isolée de coups.",
  },
};

function exerciseShape(
  type: TrainingType,
  category: DiagnosticCategory,
  baselinePlayerCp: number,
): Pick<TrainingExercise, "mode" | "maxPlayerMoves" | "successThresholdCp"> {
  if (category === "strategy" || category === "opening") {
    return { mode: "one-move", maxPlayerMoves: 1 };
  }
  if (type === "conversion") {
    return {
      mode: "playout",
      maxPlayerMoves: 4,
      successThresholdCp: Math.max(150, baselinePlayerCp - 180),
    };
  }
  if (type === "endgame") {
    return { mode: "playout", maxPlayerMoves: 4, successThresholdCp: baselinePlayerCp - 150 };
  }
  if (type === "defense") {
    return { mode: "line", maxPlayerMoves: 3, successThresholdCp: baselinePlayerCp - 80 };
  }
  return { mode: "line", maxPlayerMoves: 2 };
}

export function generateExercises(
  games: AnalyzedGame[],
  metrics: DiagnosticMetrics,
): TrainingExercise[] {
  const primaryPositions = new Set(metrics.primaryTheme.positionIds);
  const ranked = games
    .flatMap((game) => game.analyzedMoves.map((move) => ({
      game,
      move,
      positionId: `${game.id}:${move.ply}`,
    })))
    .filter(({ move }) => move.before.bestMove)
    .toSorted((a, b) => {
      const priorityDifference = Number(primaryPositions.has(b.positionId)) - Number(primaryPositions.has(a.positionId));
      return priorityDifference || b.move.lossCp - a.move.lossCp;
    });
  const personalMistakes = ranked.filter(({ move }) => move.lossCp >= 60);
  const candidates = (personalMistakes.length ? personalMistakes : ranked).slice(0, 5);

  const personal = candidates.map(({ game, move }, index): TrainingExercise => {
    const type = getType(move.playerCpBefore, move.phase);
    const relatedToPrimary = primaryPositions.has(`${game.id}:${move.ply}`);
    const category = relatedToPrimary ? metrics.primaryTheme.category : categoryForType(type);
    const shape = exerciseShape(type, category, move.playerCpBefore);
    const solutionLine = move.before.lines[0]?.pv.slice(0, shape.maxPlayerMoves * 2 - 1);
    return {
      id: `${game.id}-${move.ply}-${index}`,
      type,
      origin: "personal",
      mode: shape.mode,
      theme: relatedToPrimary ? metrics.primaryTheme.id : type,
      conceptSlug: relatedToPrimary ? metrics.primaryTheme.id : type,
      category,
      title: COPY[type].title,
      prompt: COPY[type].prompt,
      sourceLabel: `Ta partie contre ${game.opponent}`,
      fen: move.fenBefore,
      playerColor: game.playerColor,
      bestMove: move.before.bestMove,
      playedMove: move.uci,
      baselinePlayerCp: move.playerCpBefore,
      playedMovePlayerCp: move.playerCpAfter,
      lossCp: move.lossCp,
      engineCandidates: move.before.lines
        .filter((line) => line.pv[0])
        .slice(0, 3)
        .map((line) => ({
          uci: line.pv[0],
          playerCp: evaluationForPlayer(line.whiteCp, game.playerColor),
          pv: line.pv.slice(0, 6),
        })),
      phase: move.phase,
      gameUrl: game.url,
      opponent: game.opponent,
      concept: COPY[type].concept,
      maxPlayerMoves: shape.maxPlayerMoves,
      solutionLine: solutionLine?.length ? solutionLine : [move.before.bestMove],
      successThresholdCp: shape.successThresholdCp,
    };
  });

  const concepts = conceptExercisesFor(
    metrics.primaryTheme.category,
    metrics.primaryTheme.id,
    2,
  );

  if (personal.length === 0) return concepts;
  return [personal[0], ...concepts, ...personal.slice(1)];
}
