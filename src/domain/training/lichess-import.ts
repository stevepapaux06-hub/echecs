import { Chess, type Square } from "chess.js";
import { classifyPhase } from "../chess/phase";
import { conceptDefinition, type ConceptSlug } from "../knowledge/concepts";
import type { TrainingPosition } from "./positions";

export const LICHESS_PUZZLE_SOURCE = {
  url: "https://database.lichess.org/lichess_db_puzzle.csv.zst",
  format: "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate",
  license: "CC0",
} as const;

const THEME_TO_CONCEPTS: Readonly<Record<string, ConceptSlug[]>> = {
  fork: ["fork"],
  pin: ["pin"],
  skewer: ["skewer"],
  hangingPiece: ["loose_piece"],
  capturingDefender: ["remove_defender"],
  deflection: ["remove_defender"],
  overloading: ["overloaded_defender"],
  // Lichess defines defensiveMove as the precise response needed to avoid
  // losing material or an advantage: opponent_threat is the training label,
  // while defensive_resource remains available as the secondary concept.
  defensiveMove: ["opponent_threat", "defensive_resource"],
  advancedPawn: ["passed_pawn"],
};

const CONCEPT_PRIORITY: ConceptSlug[] = [
  "remove_defender",
  "overloaded_defender",
  "fork",
  "skewer",
  "pin",
  "loose_piece",
  "opponent_threat",
  "defensive_resource",
  "passed_pawn",
];

export function mapLichessThemesToConcepts(themes: string[]): ConceptSlug[] {
  const mapped = [...new Set(themes.flatMap((theme) => THEME_TO_CONCEPTS[theme] ?? []))];
  return mapped.toSorted((a, b) => CONCEPT_PRIORITY.indexOf(a) - CONCEPT_PRIORITY.indexOf(b));
}

export function classifyLichessPosition(
  fen: string,
  sourceThemes: string[],
): Pick<TrainingPosition, "category" | "conceptSlug" | "secondaryConceptSlugs" | "classificationConfidence"> | null {
  const concepts = mapLichessThemesToConcepts(sourceThemes);
  if (!concepts.length) return null;
  const fullmove = Number(fen.split(/\s+/)[5] ?? 1);
  const phase = classifyPhase(fen, Math.max(1, fullmove * 2 - 1));
  const concreteTactic = concepts.find((slug) => ![
    "passed_pawn",
    "defensive_resource",
  ].includes(slug));
  const primary = concreteTactic
    ?? (concepts.includes("defensive_resource") ? "defensive_resource" : undefined)
    ?? (concepts.includes("passed_pawn") ? "passed_pawn" : undefined);

  if (!primary) return null;
  const definition = conceptDefinition(primary);
  if (!definition) return null;
  const category = primary === "passed_pawn"
    ? phase === "endgame" ? "endgame" : "strategy"
    : primary === "defensive_resource"
      ? "defense"
      : "tactic";
  return {
    category,
    conceptSlug: primary,
    secondaryConceptSlugs: concepts.filter((slug) => slug !== primary),
    classificationConfidence: primary === "passed_pawn" && phase !== "endgame"
      ? 0.55
      : concepts.length > 1 ? 0.9 : 0.95,
  };
}

function csvFields(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(value);
      value = "";
    } else value += character;
  }
  fields.push(value);
  return fields;
}

export function parseLichessPuzzleCsvLine(line: string): TrainingPosition | null {
  const fields = csvFields(line.trim());
  if (fields.length < 9 || fields[0] === "PuzzleId") return null;
  const [puzzleId, initialFen, rawMoves, rawRating, , rawPopularity, rawPlays, rawThemes, gameUrl] = fields;
  const moves = rawMoves.trim().split(/\s+/).filter(Boolean);
  const sourceThemes = rawThemes.trim().split(/\s+/).filter(Boolean);
  if (!puzzleId || moves.length < 2) return null;
  try {
    const chess = new Chess(initialFen);
    const setupMove = moves[0];
    chess.move({
      from: setupMove.slice(0, 2) as Square,
      to: setupMove.slice(2, 4) as Square,
      promotion: setupMove.slice(4, 5) || "q",
    });
    const classification = classifyLichessPosition(chess.fen(), sourceThemes);
    if (!classification) return null;
    return {
      id: `lichess-${puzzleId}`,
      fen: chess.fen(),
      ...classification,
      difficulty: Number.isFinite(Number(rawRating)) ? Number(rawRating) : undefined,
      source: "lichess",
      sourceGameId: puzzleId,
      sourceUrl: gameUrl || `https://lichess.org/training/${puzzleId}`,
      solutionMoves: moves.slice(1),
      qualityScore: Number.isFinite(Number(rawPopularity)) ? Number(rawPopularity) : undefined,
      popularity: Number.isFinite(Number(rawPopularity)) ? Number(rawPopularity) : undefined,
      plays: Number.isFinite(Number(rawPlays)) ? Number(rawPlays) : undefined,
      sourceThemes,
      isVerified: true,
      playerColor: chess.turn() === "w" ? "white" : "black",
    };
  } catch {
    return null;
  }
}

export function importLichessPuzzleCsv(
  content: string,
  options: {
    perConcept?: number;
    minPopularity?: number;
    minPlays?: number;
    minRating?: number;
    maxRating?: number;
    maxPositions?: number;
  } = {},
): TrainingPosition[] {
  const perConcept = options.perConcept ?? 20;
  const minPopularity = options.minPopularity ?? 70;
  const minPlays = options.minPlays ?? 0;
  const maxPositions = options.maxPositions ?? 200;
  const counts = new Map<ConceptSlug, number>();
  const positions: TrainingPosition[] = [];
  for (const line of content.split(/\r?\n/)) {
    const position = parseLichessPuzzleCsvLine(line);
    if (!position || (position.qualityScore ?? -100) < minPopularity) continue;
    if ((position.plays ?? 0) < minPlays) continue;
    if (options.minRating !== undefined && (position.difficulty ?? 0) < options.minRating) continue;
    if (options.maxRating !== undefined && (position.difficulty ?? Number.MAX_SAFE_INTEGER) > options.maxRating) continue;
    if ((counts.get(position.conceptSlug) ?? 0) >= perConcept) continue;
    positions.push(position);
    counts.set(position.conceptSlug, (counts.get(position.conceptSlug) ?? 0) + 1);
    if (positions.length >= maxPositions) break;
  }
  return positions;
}
