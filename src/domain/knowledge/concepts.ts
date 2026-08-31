import type { DiagnosticCategory } from "@/domain/chess/types";

export type ConceptDetectionStatus = "detected" | "planned";

export type ConceptSlug =
  | "loose_piece"
  | "fork"
  | "pin"
  | "skewer"
  | "remove_defender"
  | "overloaded_defender"
  | "forcing_moves"
  | "opponent_threat"
  | "improve_worst_piece"
  | "open_file"
  | "outpost"
  | "pawn_break"
  | "weak_square"
  | "weak_pawn"
  | "favorable_exchange"
  | "prophylaxis"
  | "development"
  | "center_control"
  | "king_safety"
  | "opening_tempo"
  | "restrict_counterplay"
  | "simplify_when_ahead"
  | "use_material_advantage"
  | "defensive_resource"
  | "king_activity"
  | "opposition"
  | "rule_of_square"
  | "passed_pawn"
  | "rook_activity"
  | "rook_behind_pawn";

export type ConceptDefinition = {
  conceptSlug: ConceptSlug;
  category: DiagnosticCategory;
  labelFr: string;
  shortDescription: string;
  detectionStatus: ConceptDetectionStatus;
  detectionMethod: string;
  relatedConcepts?: ConceptSlug[];
};

export const CHESSPATH_CONCEPTS: readonly ConceptDefinition[] = [
  { conceptSlug: "loose_piece", category: "tactic", labelFr: "Pièce non protégée", shortDescription: "Exploiter une pièce adverse sans défense suffisante.", detectionStatus: "detected", detectionMethod: "Géométrie des attaques et défenseurs, validée sur le coup Stockfish.", relatedConcepts: ["opponent_threat", "forcing_moves"] },
  { conceptSlug: "fork", category: "tactic", labelFr: "Fourchette", shortDescription: "Attaquer au moins deux cibles de valeur avec une même pièce.", detectionStatus: "detected", detectionMethod: "Cibles attaquées simultanément après le coup Stockfish." },
  { conceptSlug: "pin", category: "tactic", labelFr: "Clouage", shortDescription: "Immobiliser une pièce devant son roi sur une ligne.", detectionStatus: "detected", detectionMethod: "Rayon fou, tour ou dame avec une seule pièce entre l’attaquant et le roi." },
  { conceptSlug: "skewer", category: "tactic", labelFr: "Enfilade", shortDescription: "Attaquer une pièce forte pour atteindre une cible placée derrière.", detectionStatus: "planned", detectionMethod: "Prévu après validation plus fine des séquences à deux temps." },
  { conceptSlug: "remove_defender", category: "tactic", labelFr: "Élimination du défenseur", shortDescription: "Retirer la pièce qui tient une cible importante.", detectionStatus: "planned", detectionMethod: "Prévu avec validation de la continuation Stockfish." },
  { conceptSlug: "overloaded_defender", category: "tactic", labelFr: "Défenseur surchargé", shortDescription: "Exploiter une pièce qui doit défendre plusieurs obligations.", detectionStatus: "planned", detectionMethod: "Prévu avec analyse des obligations défensives." },
  { conceptSlug: "forcing_moves", category: "tactic", labelFr: "Coups forcing", shortDescription: "Prioriser les échecs, prises et promotions concrètes.", detectionStatus: "detected", detectionMethod: "Nature légale du coup Stockfish : échec, prise ou promotion." },
  { conceptSlug: "opponent_threat", category: "tactic", labelFr: "Menace adverse", shortDescription: "Identifier et traiter une menace immédiate avant d’agir.", detectionStatus: "detected", detectionMethod: "Échec en cours ou pièce de valeur attaquée et non défendue." },
  { conceptSlug: "improve_worst_piece", category: "strategy", labelFr: "Améliorer la pire pièce", shortDescription: "Activer la pièce qui participe le moins au jeu.", detectionStatus: "detected", detectionMethod: "Gain net de mobilité d’une pièce initialement la moins active, sur un coup calme légal." },
  { conceptSlug: "open_file", category: "strategy", labelFr: "Colonne ouverte", shortDescription: "Activer une tour sur une colonne sans pion propre.", detectionStatus: "detected", detectionMethod: "Déplacement de tour vers une colonne ouverte ou semi-ouverte." },
  { conceptSlug: "outpost", category: "strategy", labelFr: "Avant-poste", shortDescription: "Installer une pièce sur une case avancée stable.", detectionStatus: "detected", detectionMethod: "Cavalier avancé soutenu par un pion et non chassable par un pion adverse." },
  { conceptSlug: "pawn_break", category: "strategy", labelFr: "Rupture de pions", shortDescription: "Changer la structure par une poussée préparée.", detectionStatus: "detected", detectionMethod: "Poussée structurelle connue dans une structure de pions reconnue avec forte confiance." },
  { conceptSlug: "weak_square", category: "strategy", labelFr: "Case faible", shortDescription: "Exploiter une case difficile à contrôler par les pions adverses.", detectionStatus: "planned", detectionMethod: "La feature existe ; le diagnostic reste désactivé pour éviter les faux positifs." },
  { conceptSlug: "weak_pawn", category: "strategy", labelFr: "Pion faible", shortDescription: "Fixer puis attaquer un pion durablement vulnérable.", detectionStatus: "detected", detectionMethod: "Activation légale d’une pièce contre un pion isolé identifié géométriquement." },
  { conceptSlug: "favorable_exchange", category: "strategy", labelFr: "Échange favorable", shortDescription: "Échanger pour améliorer durablement la position.", detectionStatus: "planned", detectionMethod: "Prévu avec comparaison des positions avant et après échange." },
  { conceptSlug: "prophylaxis", category: "strategy", labelFr: "Prophylaxie", shortDescription: "Limiter le meilleur plan adverse avant de poursuivre le sien.", detectionStatus: "planned", detectionMethod: "Prévu avec comparaison MultiPV." },
  { conceptSlug: "development", category: "opening", labelFr: "Développement", shortDescription: "Sortir les pièces vers des cases utiles.", detectionStatus: "planned", detectionMethod: "Prévu avec règles d’ouverture strictes." },
  { conceptSlug: "center_control", category: "opening", labelFr: "Contrôle du centre", shortDescription: "Influencer les cases centrales sans perdre de temps.", detectionStatus: "planned", detectionMethod: "Prévu avec règles d’ouverture strictes." },
  { conceptSlug: "king_safety", category: "opening", labelFr: "Sécurité du roi", shortDescription: "Mettre le roi à l’abri avant les opérations tactiques.", detectionStatus: "planned", detectionMethod: "Prévu avec roque et exposition du roi." },
  { conceptSlug: "opening_tempo", category: "opening", labelFr: "Tempo d’ouverture", shortDescription: "Développer avec gain de temps ou éviter les répétitions inutiles.", detectionStatus: "planned", detectionMethod: "Prévu avec historique complet des coups." },
  { conceptSlug: "restrict_counterplay", category: "conversion", labelFr: "Limiter le contre-jeu", shortDescription: "Réduire les ressources adverses avant de convertir.", detectionStatus: "planned", detectionMethod: "Prévu avec comparaison de mobilité et MultiPV." },
  { conceptSlug: "simplify_when_ahead", category: "conversion", labelFr: "Simplifier avec avantage", shortDescription: "Échanger les bonnes pièces sans rendre de matériel.", detectionStatus: "planned", detectionMethod: "Prévu avec bilan matériel et évaluation Stockfish." },
  { conceptSlug: "use_material_advantage", category: "conversion", labelFr: "Utiliser l’avantage matériel", shortDescription: "Coordonner les pièces supplémentaires pour convertir.", detectionStatus: "planned", detectionMethod: "Prévu avec bilan matériel et sécurité du roi." },
  { conceptSlug: "defensive_resource", category: "defense", labelFr: "Ressource défensive", shortDescription: "Trouver une suite qui sauve réellement une position difficile.", detectionStatus: "planned", detectionMethod: "Point d’extension Stockfish/Syzygy ; aucune détection spéculative en V1." },
  { conceptSlug: "king_activity", category: "endgame", labelFr: "Activité du roi", shortDescription: "Rapprocher le roi des cases et pions importants en finale.", detectionStatus: "detected", detectionMethod: "Coup de roi vers le centre dans une finale à matériel réduit." },
  { conceptSlug: "opposition", category: "endgame", labelFr: "Opposition", shortDescription: "Placer les rois face à face avec une case entre eux.", detectionStatus: "detected", detectionMethod: "Géométrie exacte des rois en finale de pions." },
  { conceptSlug: "rule_of_square", category: "endgame", labelFr: "Règle du carré", shortDescription: "Savoir si un roi peut rattraper un pion passé.", detectionStatus: "planned", detectionMethod: "Prévu avec cas de courses de pions strictement validés." },
  { conceptSlug: "passed_pawn", category: "endgame", labelFr: "Pion passé", shortDescription: "Créer ou faire progresser un pion sans bloqueur adverse.", detectionStatus: "detected", detectionMethod: "Absence de pion adverse devant sur la même colonne ou une colonne voisine." },
  { conceptSlug: "rook_activity", category: "endgame", labelFr: "Activité de la tour", shortDescription: "Donner à la tour des cibles, des lignes et du contre-jeu.", detectionStatus: "detected", detectionMethod: "Gain net de mobilité ou accès à une rangée active dans une finale à matériel réduit." },
  { conceptSlug: "rook_behind_pawn", category: "endgame", labelFr: "Tour derrière le pion", shortDescription: "Placer la tour derrière un pion passé, ami ou adverse.", detectionStatus: "planned", detectionMethod: "Prévu avec validation des exceptions tactiques." },
] as const;

const CONCEPTS_BY_SLUG = new Map(CHESSPATH_CONCEPTS.map((concept) => [concept.conceptSlug, concept]));

export function conceptDefinition(slug: string): ConceptDefinition | undefined {
  return CONCEPTS_BY_SLUG.get(slug as ConceptSlug);
}

export function isConceptSlug(value: string): value is ConceptSlug {
  return CONCEPTS_BY_SLUG.has(value as ConceptSlug);
}

const LEGACY_CONCEPT_SLUGS: Readonly<Record<string, ConceptSlug>> = {
  "knight-fork": "fork",
  "aligned-piece-with-king": "pin",
  "rook-open-file": "open_file",
  "knight-outpost": "outpost",
  "development-with-tempo": "development",
  "king-opposition": "opposition",
  "rook-activity": "rook_activity",
  "exchange-active-piece": "defensive_resource",
  "king-safety-and-rook-activity": "king_safety",
  "prepare-central-break": "pawn_break",
  "cut-off-king": "restrict_counterplay",
  "missed-forcing-moves": "forcing_moves",
  "loose-pieces": "loose_piece",
};

export function normalizeConceptSlug(value: string): string {
  return LEGACY_CONCEPT_SLUGS[value] ?? value;
}
