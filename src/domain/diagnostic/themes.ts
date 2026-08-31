import { Chess, type Square } from "chess.js";
import type {
  AnalyzedGame,
  AnalyzedMove,
  DiagnosticCategory,
  DiagnosticConfidence,
  DiagnosticTheme,
} from "@/domain/chess/types";
import { conceptDefinition } from "../knowledge/concepts";

type MoveEvidence = { game: AnalyzedGame; move: AnalyzedMove };

function confidence(sampleSize: number, issueCount: number): DiagnosticConfidence {
  if (sampleSize < 4 || issueCount < 2) return "low";
  if (sampleSize >= 10 && issueCount / sampleSize >= 0.3) return "high";
  return "medium";
}

function positionId({ game, move }: MoveEvidence): string {
  return `${game.id}:${move.ply}`;
}

function errorEvidence(items: MoveEvidence[], limit = 3): string[] {
  return items
    .toSorted((a, b) => b.move.lossCp - a.move.lossCp)
    .slice(0, limit)
    .map(({ game, move }) => {
      const moveNumber = Math.ceil(move.ply / 2);
      if (move.lossCp >= 90_000) {
        return `Contre ${game.opponent}, au ${moveNumber}e coup : ${move.san} a conduit à un mat forcé.`;
      }
      const loss = (move.lossCp / 100).toFixed(1).replace(".0", "");
      return `Contre ${game.opponent}, au ${moveNumber}e coup : ${move.san} a cédé environ ${loss} pion${move.lossCp >= 200 ? "s" : ""}.`;
    });
}

function moveIsForcing(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.slice(4, 5) || "q",
    });
    return Boolean(played.captured || played.promotion || chess.isCheck());
  } catch {
    return false;
  }
}

function endgameSubtype(fen: string): "rook" | "pawn" | "minor" | "mixed" {
  const pieces = fen.split(" ")[0].replace(/[/1-8kpKP]/g, "").toLowerCase();
  if (pieces.includes("r")) return "rook";
  if (pieces.includes("b") || pieces.includes("n")) return "minor";
  if (!pieces.includes("q")) return "pawn";
  return "mixed";
}

function themeFromMoves({
  id,
  category,
  title,
  summary,
  relevant,
  issues,
}: {
  id: string;
  category: DiagnosticCategory;
  title: string;
  summary: string;
  relevant: MoveEvidence[];
  issues: MoveEvidence[];
}): DiagnosticTheme | null {
  if (relevant.length === 0 || issues.length === 0) return null;
  return {
    id,
    category,
    title,
    summary,
    confidence: confidence(relevant.length, issues.length),
    sampleSize: relevant.length,
    issueCount: issues.length,
    evidence: errorEvidence(issues),
    positionIds: issues.map(positionId),
  };
}

function patternThemes(all: MoveEvidence[]): DiagnosticTheme[] {
  const grouped = new Map<string, Array<{ item: MoveEvidence; success: boolean; confidence: number }>>();
  for (const item of all) {
    for (const pattern of item.move.patterns ?? []) {
      if (!pattern.opportunity || pattern.confidence < 0.8) continue;
      const values = grouped.get(pattern.conceptSlug) ?? [];
      values.push({ item, success: pattern.success, confidence: pattern.confidence });
      grouped.set(pattern.conceptSlug, values);
    }
  }
  const themes: DiagnosticTheme[] = [];
  for (const [slug, values] of grouped.entries()) {
    const concept = conceptDefinition(slug);
    if (!concept) continue;
    const failures = values.filter((value) => !value.success).map((value) => value.item);
    const successful = values.length - failures.length;
    themes.push({
      id: concept.conceptSlug,
      category: concept.category,
      title: concept.labelFr,
      summary: concept.shortDescription,
      confidence: confidence(values.length, failures.length),
      sampleSize: values.length,
      issueCount: failures.length,
      successCount: successful,
      evidence: errorEvidence(failures),
      positionIds: failures.map(positionId),
    });
  }
  return themes.toSorted((a, b) => {
    const hasFailures = Number(b.issueCount > 0) - Number(a.issueCount > 0);
    if (hasFailures) return hasFailures;
    const rateA = a.issueCount / Math.max(1, a.sampleSize);
    const rateB = b.issueCount / Math.max(1, b.sampleSize);
    const specificity = (theme: DiagnosticTheme) => theme.id === "forcing_moves" ? 0 : 1;
    return rateB - rateA || specificity(b) - specificity(a) || b.sampleSize - a.sampleSize;
  });
}

export function detectDiagnosticThemes(games: AnalyzedGame[]): DiagnosticTheme[] {
  const all = games.flatMap((game) => game.analyzedMoves.map((move) => ({ game, move })));
  const exactPatterns = patternThemes(all);
  if (exactPatterns.length) return exactPatterns;
  const themes: DiagnosticTheme[] = [];

  const forcingRelevant = all.filter(({ move }) => moveIsForcing(move.fenBefore, move.before.bestMove));
  const forcingIssues = forcingRelevant.filter(({ move }) => move.lossCp >= 100);
  const forcing = themeFromMoves({
    id: "missed-forcing-moves",
    category: "tactic",
    title: "Coups forcing manqués",
    summary: "Plusieurs décisions coûteuses surviennent alors qu’un échec, une prise ou une promotion méritait d’être calculé en priorité.",
    relevant: forcingRelevant,
    issues: forcingIssues,
  });
  if (forcing) themes.push(forcing);

  const quietMiddlegame = all.filter(({ move }) =>
    move.phase === "middlegame" && !moveIsForcing(move.fenBefore, move.before.bestMove),
  );
  const quietIssues = quietMiddlegame.filter(({ move }) => move.lossCp >= 120);
  const strategy = themeFromMoves({
    id: "quiet-middlegame-decisions",
    category: "strategy",
    title: "Décisions calmes au milieu de jeu",
    summary: "Tes pertes ne viennent pas seulement des tactiques : plusieurs coups calmes du moteur améliorent l’activité sans forcer immédiatement.",
    relevant: quietMiddlegame,
    issues: quietIssues,
  });
  if (strategy) themes.push(strategy);

  const endgameGroups = new Map<string, MoveEvidence[]>();
  for (const item of all.filter(({ move }) => move.phase === "endgame")) {
    const key = endgameSubtype(item.move.fenBefore);
    endgameGroups.set(key, [...(endgameGroups.get(key) ?? []), item]);
  }
  const endgameCopy = {
    rook: ["Finales de tours", "L’activité de la tour et du roi revient dans plusieurs décisions critiques."],
    pawn: ["Finales de pions", "L’opposition, l’activité du roi et le timing des poussées demandent davantage de précision."],
    minor: ["Finales de pièces mineures", "Le placement du roi et des pièces mineures revient dans plusieurs bascules d’évaluation."],
    mixed: ["Finales à matériel mixte", "Plusieurs décisions importantes surviennent après la réduction du matériel."],
  } as const;
  for (const [subtype, relevant] of endgameGroups) {
    const issues = relevant.filter(({ move }) => move.lossCp >= 100);
    const [title, summary] = endgameCopy[subtype as keyof typeof endgameCopy];
    const theme = themeFromMoves({
      id: `endgame-${subtype}`,
      category: "endgame",
      title,
      summary,
      relevant,
      issues,
    });
    if (theme) themes.push(theme);
  }

  const conversionRelevant: MoveEvidence[] = [];
  const conversionIssues: MoveEvidence[] = [];
  for (const game of games) {
    const first = game.analyzedMoves.find((move) => move.playerCpBefore >= 200);
    if (!first) continue;
    const item = { game, move: first };
    conversionRelevant.push(item);
    const lostAdvantage = game.analyzedMoves
      .slice(game.analyzedMoves.indexOf(first))
      .find((move) => move.playerCpAfter < 100);
    if (game.outcome !== "win" || lostAdvantage) {
      conversionIssues.push({ game, move: lostAdvantage ?? first });
    }
  }
  const conversion = themeFromMoves({
    id: "conversion",
    category: "conversion",
    title: "Conversion des positions gagnantes",
    summary: "Tu atteins des positions nettement favorables, mais l’avantage disparaît encore avant d’être transformé en victoire.",
    relevant: conversionRelevant,
    issues: conversionIssues,
  });
  if (conversion) themes.push(conversion);

  const defenseRelevant: MoveEvidence[] = [];
  const defenseIssues: MoveEvidence[] = [];
  for (const game of games) {
    const first = game.analyzedMoves.find((move) => move.playerCpBefore <= -150);
    if (!first) continue;
    const item = { game, move: first };
    defenseRelevant.push(item);
    const recovered = game.analyzedMoves
      .slice(game.analyzedMoves.indexOf(first))
      .some((move) => move.playerCpAfter >= -50);
    if (!recovered && game.outcome === "loss") defenseIssues.push(item);
  }
  const defense = themeFromMoves({
    id: "defense",
    category: "defense",
    title: "Résistance en position inférieure",
    summary: "Dans plusieurs positions difficiles, l’évaluation continue de baisser sans phase de stabilisation.",
    relevant: defenseRelevant,
    issues: defenseIssues,
  });
  if (defense) themes.push(defense);

  const openingGroups = new Map<string, MoveEvidence[]>();
  for (const game of games) {
    const opening = game.opening?.trim();
    if (!opening) continue;
    const decisions = game.analyzedMoves.filter((move) => move.phase === "opening");
    for (const move of decisions) {
      openingGroups.set(opening, [...(openingGroups.get(opening) ?? []), { game, move }]);
    }
  }
  for (const [opening, relevant] of openingGroups) {
    const gamesInSample = new Set(relevant.map(({ game }) => game.id)).size;
    const issues = relevant.filter(({ move }) => move.lossCp >= 100);
    if (gamesInSample < 3 || issues.length < 2) continue;
    themes.push({
      id: `opening-${opening.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      category: "opening",
      title: `Plans dans ${opening}`,
      summary: "Cette famille d’ouverture revient assez souvent pour justifier de revoir ses idées typiques, sans conclure à partir d’une seule partie.",
      confidence: confidence(gamesInSample, issues.length),
      sampleSize: gamesInSample,
      issueCount: issues.length,
      evidence: errorEvidence(issues),
      positionIds: issues.map(positionId),
    });
  }

  if (themes.length === 0) {
    const important = all.filter(({ move }) => move.lossCp >= 150);
    return [{
      id: "stability",
      category: "tactic",
      title: "Stabilité des décisions",
      summary: important.length
        ? "L’échantillon montre quelques grosses bascules, mais pas encore un thème assez répété pour être affirmatif."
        : "Aucun motif faible suffisamment répété n’apparaît encore dans cet échantillon.",
      confidence: "low",
      sampleSize: all.length,
      issueCount: important.length,
      evidence: errorEvidence(important),
      positionIds: important.map(positionId),
    }];
  }

  return themes.toSorted((a, b) => {
    const confidenceWeight = { low: 0.7, medium: 1, high: 1.25 };
    const scoreA = a.issueCount / Math.max(1, a.sampleSize) * Math.log2(a.sampleSize + 1) * confidenceWeight[a.confidence];
    const scoreB = b.issueCount / Math.max(1, b.sampleSize) * Math.log2(b.sampleSize + 1) * confidenceWeight[b.confidence];
    return scoreB - scoreA;
  });
}
