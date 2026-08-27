import type { AnalyzedGame, TrainingExercise, TrainingType } from "@/domain/chess/types";

function getType(playerCp: number, phase: string): TrainingType {
  if (playerCp >= 200) return "conversion";
  if (playerCp <= -150) return "defense";
  if (phase === "endgame") return "endgame";
  return "mistake";
}

const COPY: Record<TrainingType, { title: string; prompt: string }> = {
  conversion: {
    title: "Conserve ton avantage",
    prompt: "Tu disposais ici d’un avantage important. Trouve une suite précise qui garde le contrôle.",
  },
  defense: {
    title: "Trouve la meilleure résistance",
    prompt: "La position est difficile, mais elle demande encore une défense active. Quel est ton meilleur essai ?",
  },
  endgame: {
    title: "Joue cette finale avec précision",
    prompt: "Cette décision de finale a compté. Cherche le coup qui améliore le plus ta position.",
  },
  mistake: {
    title: "Rejoue ta décision",
    prompt: "Cette position vient de ta partie. Prends le temps de trouver une meilleure continuation.",
  },
};

export function generateExercises(games: AnalyzedGame[]): TrainingExercise[] {
  const ranked = games
    .flatMap((game) => game.analyzedMoves.map((move) => ({ game, move })))
    .filter(({ move }) => move.before.bestMove)
    .toSorted((a, b) => b.move.lossCp - a.move.lossCp)
  const personalMistakes = ranked.filter(({ move }) => move.lossCp >= 60)
  const candidates = (personalMistakes.length ? personalMistakes : ranked).slice(0, 6);

  return candidates.map(({ game, move }, index) => {
    const type = getType(move.playerCpBefore, move.phase);
    return {
      id: `${game.id}-${move.ply}-${index}`,
      type,
      title: COPY[type].title,
      prompt: COPY[type].prompt,
      sourceLabel: `Ta partie contre ${game.opponent}`,
      fen: move.fenBefore,
      playerColor: game.playerColor,
      bestMove: move.before.bestMove,
      playedMove: move.uci,
      baselinePlayerCp: move.playerCpBefore,
      phase: move.phase,
      gameUrl: game.url,
      opponent: game.opponent,
    };
  });
}
