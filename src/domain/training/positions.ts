import type { PlayerColor } from "@/domain/chess/types";
import type { ConceptSlug } from "@/domain/knowledge/concepts";

export type TrainingPositionSource = "personal_game" | "chesspath_curated" | "lichess";

export type TrainingPosition = {
  id: string;
  fen: string;
  category: "tactic" | "strategy" | "opening" | "endgame" | "conversion" | "defense";
  conceptSlug: ConceptSlug;
  secondaryConceptSlugs?: ConceptSlug[];
  classificationConfidence?: number;
  /** Backward compatibility with the generated V1 bank. */
  secondaryConceptSlug?: ConceptSlug;
  difficulty?: number;
  source: TrainingPositionSource;
  sourceGameId?: string;
  sourcePlayers?: string[];
  positionPly?: number;
  sourceRole?: "human_practice" | "model_position" | "canonical";
  sourceUrl?: string;
  solutionMoves: string[];
  qualityScore?: number;
  /** Original Lichess metadata kept for quality filtering and auditability. */
  popularity?: number;
  plays?: number;
  sourceThemes?: string[];
  pedagogicalMechanism?: string;
  planSignature?: string;
  materialSignature?: string;
  pawnStructureSignature?: string;
  keyPieces?: string[];
  keySquares?: string[];
  isVerified: boolean;
  playerColor: PlayerColor;
};
