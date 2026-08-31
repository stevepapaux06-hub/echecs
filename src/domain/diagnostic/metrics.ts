import type {
  AnalyzedGame,
  DiagnosticMetrics,
  DiagnosticPriority,
  GamePhase,
  PhaseMetric,
} from "@/domain/chess/types";
import type { ConceptSlug } from "@/domain/knowledge/concepts";
import { detectDiagnosticThemes } from "./themes";

const PHASE_LABELS: Record<GamePhase, string> = {
  opening: "Ouverture",
  middlegame: "Milieu de partie",
  endgame: "Finale",
};

function rounded(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

function priorityCopy(priority: DiagnosticPriority, worstPhase: PhaseMetric): [string, string] {
  switch (priority) {
    case "conversion":
      return [
        "Conversion des positions gagnantes",
        "Tu obtiens régulièrement un avantage net, mais il disparaît encore trop souvent avant la fin de la partie.",
      ];
    case "defense":
      return [
        "Résistance dans les positions difficiles",
        "Quand la position devient inférieure, la dégradation est souvent rapide. Travailler la défense peut sauver des demi-points immédiatement.",
      ];
    case "endgame":
      return [
        "Décisions en finale",
        "Tes pertes d’évaluation les plus marquées se concentrent dans les positions à matériel réduit.",
      ];
    case "middlegame":
      return [
        "Décisions au milieu de partie",
        "C’est dans le milieu de partie que tes décisions coûtent actuellement le plus d’évaluation.",
      ];
    default:
      return [
        "Réduire les grosses pertes d’évaluation",
        `Ton meilleur levier est de stabiliser tes décisions, particulièrement en ${worstPhase.label.toLowerCase()}.`,
      ];
  }
}

export function calculateMetrics(games: AnalyzedGame[]): DiagnosticMetrics {
  const allMoves = games.flatMap((game) => game.analyzedMoves);
  const importantErrors = allMoves.filter((move) => move.lossCp >= 150);

  const phaseMetrics = (["opening", "middlegame", "endgame"] as GamePhase[]).map((phase) => {
    const moves = allMoves.filter((move) => move.phase === phase);
    const totalLoss = moves.reduce((sum, move) => sum + Math.min(600, Math.max(0, move.lossCp)), 0);
    return {
      phase,
      label: PHASE_LABELS[phase],
      positions: moves.length,
      averageLossCp: moves.length ? Math.round(totalLoss / moves.length) : 0,
      importantErrors: moves.filter((move) => move.lossCp >= 150).length,
    };
  });

  let conversionOpportunities = 0;
  let convertedWins = 0;
  const retentionLengths: number[] = [];
  let defenseOpportunities = 0;
  let recoveredPositions = 0;
  let savedGames = 0;

  for (const game of games) {
    const winningStart = game.analyzedMoves.findIndex((move) => move.playerCpBefore >= 200);
    if (winningStart >= 0) {
      conversionOpportunities += 1;
      if (game.outcome === "win") convertedWins += 1;
      let retained = 0;
      for (const move of game.analyzedMoves.slice(winningStart)) {
        if (move.playerCpAfter < 100) break;
        retained += 1;
      }
      retentionLengths.push(retained);
    }

    const defensiveStart = game.analyzedMoves.findIndex((move) => move.playerCpBefore <= -150);
    if (defensiveStart >= 0) {
      defenseOpportunities += 1;
      const recovered = game.analyzedMoves.slice(defensiveStart).some((move) => move.playerCpAfter >= -50);
      if (recovered) recoveredPositions += 1;
      if (game.outcome !== "loss") savedGames += 1;
    }
  }

  const comparablePhases = phaseMetrics.filter((phase) => phase.positions >= 3);
  const worstPhase = (comparablePhases.length ? comparablePhases : phaseMetrics).reduce((worst, phase) =>
    phase.averageLossCp > worst.averageLossCp ? phase : worst,
  );
  const bestPhase = (comparablePhases.length ? comparablePhases : phaseMetrics).reduce((best, phase) =>
    phase.averageLossCp < best.averageLossCp ? phase : best,
  );

  const conversionRate = percentage(convertedWins, conversionOpportunities);
  const defenseRecoveryRate = percentage(recoveredPositions, defenseOpportunities);
  const importantErrorsPerGame = games.length ? rounded(importantErrors.length / games.length, 1) : 0;

  let priority: DiagnosticPriority = "stability";
  if (conversionOpportunities >= 2 && (conversionRate ?? 100) < 65) priority = "conversion";
  else if (worstPhase.phase === "endgame" && worstPhase.averageLossCp >= 55) priority = "endgame";
  else if (worstPhase.phase === "middlegame" && worstPhase.averageLossCp >= 65) priority = "middlegame";
  else if (defenseOpportunities >= 2 && (defenseRecoveryRate ?? 100) < 40) priority = "defense";

  const [fallbackTitle, fallbackSummary] = priorityCopy(priority, worstPhase);
  const themes = detectDiagnosticThemes(games);
  const conceptAggregates = new Map<ConceptSlug, { opportunities: number; successes: number; confidenceTotal: number }>();
  for (const move of allMoves) {
    for (const pattern of move.patterns ?? []) {
      if (!pattern.opportunity || pattern.confidence < 0.8) continue;
      const aggregate = conceptAggregates.get(pattern.conceptSlug) ?? { opportunities: 0, successes: 0, confidenceTotal: 0 };
      aggregate.opportunities += 1;
      aggregate.successes += Number(pattern.success);
      aggregate.confidenceTotal += pattern.confidence;
      conceptAggregates.set(pattern.conceptSlug, aggregate);
    }
  }
  const conceptStats = [...conceptAggregates.entries()].map(([conceptSlug, aggregate]) => ({
    conceptSlug,
    opportunities: aggregate.opportunities,
    successes: aggregate.successes,
    failures: aggregate.opportunities - aggregate.successes,
    confidence: confidenceForConcept(aggregate.opportunities, aggregate.confidenceTotal / aggregate.opportunities),
  }));
  const matchedTheme = priority === "conversion"
    ? themes.find((theme) => theme.id === "conversion")
    : priority === "defense"
      ? themes.find((theme) => theme.id === "defense")
      : priority === "endgame"
        ? themes.find((theme) => theme.category === "endgame")
        : priority === "middlegame"
          ? themes.find((theme) => theme.category === "strategy")
          : undefined;
  const primaryTheme = matchedTheme ?? themes[0]!;
  const priorityTitle = primaryTheme.title || fallbackTitle;
  const prioritySummary = primaryTheme.summary || fallbackSummary;
  const strengths = [
    `${bestPhase.label} : seulement ${bestPhase.averageLossCp} centipions perdus en moyenne sur les décisions examinées.`,
  ];
  if (convertedWins > 0) {
    strengths.push(`${convertedWins} avantage${convertedWins > 1 ? "s" : ""} net${convertedWins > 1 ? "s" : ""} transformé${convertedWins > 1 ? "s" : ""} en victoire.`);
  } else if (savedGames > 0) {
    strengths.push(`${savedGames} partie${savedGames > 1 ? "s" : ""} sauvée${savedGames > 1 ? "s" : ""} après avoir été inférieur.`);
  }

  const weaknesses = [
    `${importantErrors.length} grosse${importantErrors.length > 1 ? "s" : ""} perte${importantErrors.length > 1 ? "s" : ""} d’évaluation détectée${importantErrors.length > 1 ? "s" : ""}.`,
    `${worstPhase.label} : phase la plus coûteuse sur cet échantillon (${worstPhase.averageLossCp} cp par décision).`,
  ];
  if (primaryTheme) {
    weaknesses[0] = `${primaryTheme.title} : ${primaryTheme.issueCount} problème${primaryTheme.issueCount > 1 ? "s" : ""} sur ${primaryTheme.sampleSize} exemple${primaryTheme.sampleSize > 1 ? "s" : ""} pertinent${primaryTheme.sampleSize > 1 ? "s" : ""}.`;
  }

  const focusItems = [
    priority === "conversion"
      ? "Avant chaque échange en position gagnante, vérifier ce qui reste à convertir."
      : "Faire un scan forcing : échecs, prises, menaces — pour les deux camps.",
    worstPhase.phase === "endgame"
      ? "Rejouer les finales où l’évaluation a basculé et nommer le plan avant de jouer."
      : `Rejouer les décisions critiques du ${worstPhase.label.toLowerCase()} sans la pression du temps.`,
    "Comparer ton coup au choix du moteur, puis expliquer la différence avec tes propres mots.",
  ];

  return {
    gamesAnalyzed: games.length,
    positionsAnalyzed: allMoves.length,
    importantErrors: importantErrors.length,
    importantErrorsPerGame,
    conversionOpportunities,
    convertedWins,
    conversionRate,
    averageWinningRetention: retentionLengths.length
      ? rounded(retentionLengths.reduce((sum, value) => sum + value, 0) / retentionLengths.length, 1)
      : null,
    defenseOpportunities,
    recoveredPositions,
    savedGames,
    defenseRecoveryRate,
    phaseMetrics,
    priority,
    priorityTitle,
    prioritySummary,
    strengths,
    weaknesses,
    focusItems,
    themes,
    primaryTheme,
    conceptStats,
  };
}

function confidenceForConcept(opportunities: number, averageDetectionConfidence: number): "low" | "medium" | "high" {
  if (opportunities >= 8 && averageDetectionConfidence >= 0.9) return "high";
  if (opportunities >= 3 && averageDetectionConfidence >= 0.84) return "medium";
  return "low";
}
