import { Chess } from "chess.js";
import type { TrainingExercise } from "@/domain/chess/types";

type ConceptExercise = Omit<
  TrainingExercise,
  "id" | "theme" | "sourceLabel"
> & {
  key: string;
  sourceLabel?: string;
};

const CONCEPT_LIBRARY: ConceptExercise[] = [
  {
    key: "fork-knight-c7",
    type: "tactic",
    origin: "concept",
    mode: "line",
    category: "tactic",
    title: "La fourchette ne s’arrête pas au premier coup",
    prompt: "Trouve le saut de cavalier, puis joue jusqu’à obtenir le gain concret.",
    fen: "q3k3/8/8/1N6/8/8/8/6KR w - - 0 1",
    playerColor: "white",
    bestMove: "b5c7",
    baselinePlayerCp: 500,
    phase: "middlegame",
    concept: "L’échec force le roi à bouger ; le cavalier peut ensuite récupérer la dame attaquée.",
    maxPlayerMoves: 2,
    successThresholdCp: 250,
    planArrows: [
      { from: "b5", to: "c7", color: "primary", label: "échec et fourchette" },
      { from: "c7", to: "a8", color: "secondary", label: "cible" },
    ],
    planSquares: [
      { square: "e8", color: "warning" },
      { square: "a8", color: "secondary" },
    ],
  },
  {
    key: "forcing-capture-queen",
    type: "tactic",
    origin: "concept",
    mode: "one-move",
    category: "tactic",
    title: "Une pièce alignée avec son roi",
    prompt: "Une réponse forcing règle immédiatement la position. Laquelle ?",
    fen: "4k3/4q3/8/8/8/8/4R3/R3K3 w Q - 0 1",
    playerColor: "white",
    bestMove: "e2e7",
    baselinePlayerCp: 600,
    phase: "middlegame",
    concept: "La dame noire est placée devant son roi : la prise arrive avec échec et ne laisse aucun temps pour réagir.",
    maxPlayerMoves: 1,
    planArrows: [{ from: "e2", to: "e7", color: "primary", label: "prise avec échec" }],
    planSquares: [{ square: "e8", color: "warning" }],
  },
  {
    key: "rook-open-file",
    type: "strategy",
    origin: "concept",
    mode: "one-move",
    category: "strategy",
    title: "Donne une colonne à ta tour",
    prompt: "Trouve le placement simple qui rend ta tour immédiatement plus active.",
    fen: "4k3/pp3ppp/8/8/8/8/PP3PPP/R5K1 w - - 0 1",
    playerColor: "white",
    bestMove: "a1d1",
    baselinePlayerCp: 0,
    phase: "middlegame",
    concept: "Une tour appartient sur une colonne ouverte : elle contrôle plus de cases et peut entrer dans le camp adverse.",
    maxPlayerMoves: 1,
    planArrows: [
      { from: "a1", to: "d1", color: "primary", label: "transfert" },
      { from: "d1", to: "d7", color: "secondary", label: "colonne ouverte" },
    ],
    planSquares: [{ square: "d7", color: "secondary" }],
  },
  {
    key: "knight-outpost-e5",
    type: "strategy",
    origin: "concept",
    mode: "one-move",
    category: "strategy",
    title: "Installe une pièce sur une case forte",
    prompt: "Quelle case centrale donne au cavalier le plus d’activité durable ?",
    fen: "4k3/pp3ppp/8/8/8/3N4/PP3PPP/6K1 w - - 0 1",
    playerColor: "white",
    bestMove: "d3e5",
    baselinePlayerCp: 0,
    phase: "middlegame",
    concept: "Depuis e5, le cavalier vise plusieurs cases du camp adverse et ne peut pas être chassé par un pion.",
    maxPlayerMoves: 1,
    planArrows: [{ from: "d3", to: "e5", color: "primary", label: "avant-poste" }],
    planSquares: [{ square: "e5", color: "primary" }],
  },
  {
    key: "opening-develop-with-tempo",
    type: "opening",
    origin: "concept",
    mode: "one-move",
    category: "opening",
    title: "Développe avec une menace utile",
    prompt: "Quel coup développe une pièce tout en mettant immédiatement le centre adverse sous pression ?",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    playerColor: "white",
    bestMove: "g1f3",
    baselinePlayerCp: 20,
    phase: "opening",
    concept: "Développer le cavalier vers f3 prépare le roque et attaque e5 : un seul coup remplit plusieurs objectifs d’ouverture.",
    maxPlayerMoves: 1,
    planArrows: [
      { from: "g1", to: "f3", color: "primary", label: "développement avec tempo" },
      { from: "f1", to: "c4", color: "secondary", label: "suite naturelle" },
    ],
    planSquares: [{ square: "e5", color: "warning" }],
  },
  {
    key: "king-and-pawn-technique",
    type: "endgame",
    origin: "concept",
    mode: "playout",
    category: "endgame",
    title: "Fais passer le roi devant le pion",
    prompt: "Convertis cette finale sans pousser automatiquement le pion. Joue quelques coups contre le moteur.",
    fen: "2k5/8/8/3PK3/8/8/8/8 w - - 0 1",
    playerColor: "white",
    bestMove: "e5d6",
    baselinePlayerCp: 500,
    phase: "endgame",
    concept: "Le roi doit gagner l’opposition et ouvrir le chemin avant que le pion ne puisse avancer sans danger.",
    maxPlayerMoves: 4,
    successThresholdCp: 200,
    planArrows: [
      { from: "e5", to: "d6", color: "primary", label: "roi devant le pion" },
      { from: "d6", to: "c7", color: "secondary", label: "chemin du roi" },
    ],
    planSquares: [{ square: "c7", color: "primary" }],
  },
  {
    key: "technical-rook-conversion",
    type: "conversion",
    origin: "concept",
    mode: "playout",
    category: "conversion",
    title: "Active la tour avant de pousser",
    prompt: "Tu as l’avantage matériel. Garde les pions adverses sous contrôle et simplifie la conversion.",
    fen: "8/5pk1/6p1/8/8/5P2/5KPP/3R4 w - - 0 1",
    playerColor: "white",
    bestMove: "d1d7",
    baselinePlayerCp: 400,
    phase: "endgame",
    concept: "Une tour active derrière les pions adverses réduit leur contre-jeu avant toute course de pions.",
    maxPlayerMoves: 4,
    successThresholdCp: 200,
    planArrows: [
      { from: "d1", to: "d7", color: "primary", label: "activité" },
      { from: "d7", to: "a7", color: "secondary", label: "attaque latérale" },
    ],
    planSquares: [{ square: "d7", color: "primary" }],
  },
  {
    key: "active-defense",
    type: "defense",
    origin: "concept",
    mode: "line",
    category: "defense",
    title: "Cherche du contre-jeu actif",
    prompt: "La position est inférieure. Trouve la ressource qui oblige l’adversaire à répondre.",
    fen: "6k1/5ppp/8/8/8/3q4/5PPP/3R2K1 w - - 0 1",
    playerColor: "white",
    bestMove: "d1d3",
    baselinePlayerCp: -500,
    phase: "middlegame",
    concept: "En défense, échanger la pièce la plus active de l’adversaire peut réduire immédiatement le danger.",
    maxPlayerMoves: 2,
    successThresholdCp: -650,
    planArrows: [{ from: "d1", to: "d3", color: "primary", label: "échange" }],
    planSquares: [{ square: "d3", color: "warning" }],
  },
];

for (const exercise of CONCEPT_LIBRARY) {
  // Curated positions are still validated at runtime so an invalid FEN cannot
  // enter a personalized session after a future library edit.
  new Chess(exercise.fen);
}

export function conceptExercisesFor(
  category: TrainingExercise["category"],
  theme: string,
  limit = 2,
): TrainingExercise[] {
  const direct = CONCEPT_LIBRARY.filter((exercise) => exercise.category === category);
  const fallbacks = CONCEPT_LIBRARY.filter((exercise) => exercise.category !== category);
  return [...direct, ...fallbacks].slice(0, limit).map((exercise) => ({
    ...exercise,
    id: `concept-${exercise.key}`,
    theme,
    sourceLabel: "Nouvelle position · même concept",
  }));
}

export function allConceptExercises(): TrainingExercise[] {
  return CONCEPT_LIBRARY.map((exercise) => ({
    ...exercise,
    id: `concept-${exercise.key}`,
    theme: exercise.category,
    sourceLabel: "Bibliothèque pédagogique ChessPath",
  }));
}
