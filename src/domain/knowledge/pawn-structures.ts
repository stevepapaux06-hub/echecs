import { Chess } from "chess.js";
import { pieces } from "../patterns/position-features";

export type PawnStructureSlug =
  | "isolated_queen_pawn"
  | "carlsbad"
  | "hanging_pawns"
  | "benoni"
  | "french_chain"
  | "kings_indian_closed"
  | "maroczy_bind"
  | "caro_slav_structure";

export type PawnStructureDefinition = {
  structureSlug: PawnStructureSlug;
  nameFr: string;
  recognitionFeatures: string[];
  plansWhite: string[];
  plansBlack: string[];
  pawnBreaks: string[];
  keySquares: string[];
  relatedConcepts: string[];
};

export type PawnStructureRecognition = {
  structureSlug: PawnStructureSlug | "unknown";
  confidence: number;
  evidence: string[];
};

export const PAWN_STRUCTURES: readonly PawnStructureDefinition[] = [
  { structureSlug: "isolated_queen_pawn", nameFr: "Pion dame isolé", recognitionFeatures: ["Pion d avancé sans pion c ni e allié"], plansWhite: ["Activité des pièces", "Poussée d5-d6 ou d4-d5"], plansBlack: ["Bloquer puis échanger", "Attaquer le pion"], pawnBreaks: ["d4-d5", "d5-d6"], keySquares: ["d4", "d5"], relatedConcepts: ["outpost", "weak_pawn"] },
  { structureSlug: "carlsbad", nameFr: "Carlsbad", recognitionFeatures: ["Chaînes c/d asymétriques issues du Gambit dame"], plansWhite: ["Attaque de minorité", "Jeu central"], plansBlack: ["Activité à l’aile roi", "Rupture c5"], pawnBreaks: ["b4-b5", "c6-c5", "e6-e5"], keySquares: ["c5", "e5"], relatedConcepts: ["pawn_break", "weak_pawn"] },
  { structureSlug: "hanging_pawns", nameFr: "Pions pendants", recognitionFeatures: ["Pions c et d adjacents sans voisins b/e"], plansWhite: ["Activité et poussée centrale"], plansBlack: ["Bloquer et attaquer"], pawnBreaks: ["c4-c5", "d4-d5"], keySquares: ["c5", "d5"], relatedConcepts: ["pawn_break", "weak_square"] },
  { structureSlug: "benoni", nameFr: "Structure Benoni", recognitionFeatures: ["Pion blanc d5 face au duo noir c5/e6"], plansWhite: ["Expansion à l’aile dame", "Rupture e5"], plansBlack: ["Contre-jeu à l’aile dame", "Rupture f5"], pawnBreaks: ["e4-e5", "b7-b5", "f7-f5"], keySquares: ["e5", "c5"], relatedConcepts: ["pawn_break", "outpost"] },
  { structureSlug: "french_chain", nameFr: "Chaîne française", recognitionFeatures: ["Pions blancs d4/e5 contre d5/e6"], plansWhite: ["Attaque à l’aile roi"], plansBlack: ["Attaquer la base d4"], pawnBreaks: ["c7-c5", "f7-f6"], keySquares: ["d4", "e5"], relatedConcepts: ["pawn_break", "weak_pawn"] },
  { structureSlug: "kings_indian_closed", nameFr: "Est-indienne fermée", recognitionFeatures: ["Centre blanc c4/d5/e4 bloqué par d6/e5"], plansWhite: ["Expansion à l’aile dame"], plansBlack: ["Attaque à l’aile roi"], pawnBreaks: ["c4-c5", "f7-f5"], keySquares: ["c5", "f4"], relatedConcepts: ["pawn_break", "king_safety"] },
  { structureSlug: "maroczy_bind", nameFr: "Étau de Maróczy", recognitionFeatures: ["Pions blancs c4/e4 contrôlant d5"], plansWhite: ["Restreindre la rupture d5"], plansBlack: ["Préparer b5 ou d5"], pawnBreaks: ["b7-b5", "d6-d5"], keySquares: ["d5", "b5"], relatedConcepts: ["restrict_counterplay", "weak_square"] },
  { structureSlug: "caro_slav_structure", nameFr: "Structure Caro-Slave", recognitionFeatures: ["Triangle noir c6/d5/e6"], plansWhite: ["Pression centrale", "Développement actif"], plansBlack: ["Sortir le fou c8", "Rupture c5 ou e5"], pawnBreaks: ["c6-c5", "e6-e5"], keySquares: ["c5", "e5"], relatedConcepts: ["development", "pawn_break"] },
] as const;

function pawnSet(fen: string, color: "w" | "b"): Set<string> {
  return new Set(pieces(new Chess(fen)).filter((piece) => piece.color === color && piece.type === "p").map((piece) => piece.square));
}

function hasAll(values: Set<string>, required: string[]): boolean {
  return required.every((square) => values.has(square));
}

export function recognizePawnStructure(fen: string): PawnStructureRecognition {
  const white = pawnSet(fen, "w");
  const black = pawnSet(fen, "b");
  if (hasAll(white, ["d4", "e5"]) && hasAll(black, ["d5", "e6"])) {
    return { structureSlug: "french_chain", confidence: 0.98, evidence: ["Chaînes blanches d4-e5 et noires d5-e6."] };
  }
  if (hasAll(white, ["c4", "d5", "e4"]) && hasAll(black, ["d6", "e5"])) {
    return { structureSlug: "kings_indian_closed", confidence: 0.94, evidence: ["Centre fermé c4-d5-e4 contre d6-e5."] };
  }
  if (hasAll(white, ["d5", "e4"]) && hasAll(black, ["c5", "e6"])) {
    return { structureSlug: "benoni", confidence: 0.93, evidence: ["Pion blanc d5 face aux leviers noirs c5 et e6."] };
  }
  if (hasAll(white, ["c4", "e4"]) && !white.has("d4") && !white.has("d5")) {
    return { structureSlug: "maroczy_bind", confidence: 0.9, evidence: ["Pions blancs c4 et e4 sans pion d."] };
  }
  for (const [color, pawns, rank] of [["blanc", white, "4"], ["noir", black, "5"]] as const) {
    if (hasAll(pawns, [`c${rank}`, `d${rank}`]) && ![...pawns].some((square) => square.startsWith("b") || square.startsWith("e"))) {
      return { structureSlug: "hanging_pawns", confidence: 0.9, evidence: [`Pions ${color}s c et d adjacents sans voisins b/e.`] };
    }
  }
  for (const [color, pawns, square] of [["blanc", white, "d4"], ["noir", black, "d5"]] as const) {
    if (pawns.has(square) && ![...pawns].some((pawn) => pawn.startsWith("c") || pawn.startsWith("e"))) {
      return { structureSlug: "isolated_queen_pawn", confidence: 0.92, evidence: [`Pion dame ${color} avancé sans pion c/e allié.`] };
    }
  }
  if (hasAll(black, ["c6", "d5", "e6"])) {
    return { structureSlug: "caro_slav_structure", confidence: 0.82, evidence: ["Triangle noir c6-d5-e6."] };
  }
  return { structureSlug: "unknown", confidence: 0, evidence: [] };
}
