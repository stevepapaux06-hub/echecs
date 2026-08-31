import type { PlayerColor } from "@/domain/chess/types";
import type { ConceptSlug } from "@/domain/knowledge/concepts";

export type TrainingPositionSource = "personal_game" | "chesspath_curated" | "lichess";

export type TrainingPosition = {
  id: string;
  fen: string;
  category: "tactic" | "strategy" | "opening" | "endgame" | "conversion" | "defense";
  conceptSlug: ConceptSlug;
  secondaryConceptSlug?: ConceptSlug;
  difficulty?: number;
  source: TrainingPositionSource;
  sourceGameId?: string;
  sourceUrl?: string;
  solutionMoves: string[];
  qualityScore?: number;
  /** Original Lichess metadata kept for quality filtering and auditability. */
  popularity?: number;
  plays?: number;
  sourceThemes?: string[];
  isVerified: boolean;
  playerColor: PlayerColor;
};
