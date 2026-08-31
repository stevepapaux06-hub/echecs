import { Chess } from "chess.js";
import type { TrainingExercise } from "@/domain/chess/types";
import { classifyPhase } from "../chess/phase";
import { conceptDefinition, normalizeConceptSlug } from "../knowledge/concepts";
import { LICHESS_TRAINING_SEED } from "./lichess-seed";
import type { TrainingPosition } from "./positions";

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
    conceptSlug: "fork",
    category: "tactic",
    title: "Une ressource concrète",
    prompt: "Quelle idée forcing choisirais-tu ici ? Calcule aussi la réponse adverse.",
    fen: "q3k3/8/8/1N6/8/8/8/5RK1 w - - 0 1",
    playerColor: "white",
    bestMove: "b5c7",
    baselinePlayerCp: 500,
    phase: "middlegame",
    concept: "L’échec force le roi à bouger ; le cavalier peut ensuite récupérer la dame attaquée.",
    maxPlayerMoves: 2,
    solutionLine: ["b5c7", "e8d7", "c7a8"],
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
    conceptSlug: "pin",
    category: "tactic",
    title: "Une décision forcing",
    prompt: "Quelle idée concrète choisirais-tu ici ?",
    fen: "4k3/4q3/8/8/8/8/4R3/R3K3 w Q - 0 1",
    playerColor: "white",
    bestMove: "e2e7",
    baselinePlayerCp: 600,
    phase: "middlegame",
    concept: "La dame noire est placée devant son roi : la prise arrive avec échec et ne laisse aucun temps pour réagir.",
    maxPlayerMoves: 1,
    solutionLine: ["e2e7"],
    planArrows: [{ from: "e2", to: "e7", color: "primary", label: "prise avec échec" }],
    planSquares: [{ square: "e8", color: "warning" }],
  },
  {
    key: "rook-open-file",
    type: "strategy",
    origin: "concept",
    mode: "one-move",
    conceptSlug: "open_file",
    category: "strategy",
    title: "Choisis un plan d’activité",
    prompt: "Quel plan choisirais-tu ici ?",
    fen: "4k3/pp3ppp/8/8/8/8/PP3PPP/R5K1 w - - 0 1",
    playerColor: "white",
    bestMove: "a1d1",
    baselinePlayerCp: 0,
    phase: "middlegame",
    concept: "Une tour appartient sur une colonne ouverte : elle contrôle plus de cases et peut entrer dans le camp adverse.",
    maxPlayerMoves: 1,
    solutionLine: ["a1d1"],
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
    conceptSlug: "outpost",
    category: "strategy",
    title: "Améliore ta position",
    prompt: "Quelle décision améliorerait durablement l’une de tes pièces ?",
    fen: "4k3/pp3ppp/8/8/8/3N4/PP3PPP/6K1 w - - 0 1",
    playerColor: "white",
    bestMove: "d3e5",
    baselinePlayerCp: 0,
    phase: "middlegame",
    concept: "Depuis e5, le cavalier vise plusieurs cases du camp adverse et ne peut pas être chassé par un pion.",
    maxPlayerMoves: 1,
    solutionLine: ["d3e5"],
    planArrows: [{ from: "d3", to: "e5", color: "primary", label: "avant-poste" }],
    planSquares: [{ square: "e5", color: "primary" }],
  },
  {
    key: "opening-develop-with-tempo",
    type: "opening",
    origin: "concept",
    mode: "one-move",
    conceptSlug: "development",
    category: "opening",
    title: "Une priorité d’ouverture",
    prompt: "Quelle décision d’ouverture remplit le plus d’objectifs à la fois ?",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    playerColor: "white",
    bestMove: "g1f3",
    baselinePlayerCp: 20,
    phase: "opening",
    concept: "Développer le cavalier vers f3 prépare le roque et attaque e5 : un seul coup remplit plusieurs objectifs d’ouverture.",
    maxPlayerMoves: 1,
    solutionLine: ["g1f3"],
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
    conceptSlug: "opposition",
    category: "endgame",
    title: "Conduis cette finale",
    prompt: "Quel plan choisirais-tu pour faire progresser cette position ? Joue plusieurs coups.",
    fen: "2k5/8/8/3PK3/8/8/8/8 w - - 0 1",
    playerColor: "white",
    bestMove: "e5e6",
    baselinePlayerCp: 500,
    phase: "endgame",
    concept: "Le roi doit gagner l’opposition et ouvrir le chemin avant que le pion ne puisse avancer sans danger.",
    maxPlayerMoves: 4,
    solutionLine: ["e5e6", "c8d8", "e6d6", "d8e8", "d6c7", "e8e7", "d5d6"],
    successThresholdCp: 200,
    planArrows: [
      { from: "e5", to: "e6", color: "primary", label: "roi devant le pion" },
      { from: "d6", to: "c7", color: "secondary", label: "chemin du roi" },
    ],
    planSquares: [{ square: "c7", color: "primary" }],
  },
  {
    key: "technical-rook-conversion",
    type: "conversion",
    origin: "concept",
    mode: "playout",
    conceptSlug: "rook_activity",
    category: "conversion",
    title: "Transforme l’avantage",
    prompt: "Comment limiterais-tu le contre-jeu avant de progresser ?",
    fen: "8/5pk1/6p1/8/8/5P2/5KPP/3R4 w - - 0 1",
    playerColor: "white",
    bestMove: "d1d6",
    baselinePlayerCp: 400,
    phase: "endgame",
    concept: "Une tour active derrière les pions adverses réduit leur contre-jeu avant toute course de pions.",
    maxPlayerMoves: 4,
    solutionLine: ["d1d6", "g7f8", "f2g3", "f8e7", "d6a6", "e7d7", "g3g4"],
    successThresholdCp: 200,
    planArrows: [
      { from: "d1", to: "d6", color: "primary", label: "activité" },
      { from: "d6", to: "a6", color: "secondary", label: "attaque latérale" },
    ],
    planSquares: [{ square: "d6", color: "primary" }],
  },
  {
    key: "active-defense",
    type: "defense",
    origin: "concept",
    mode: "line",
    conceptSlug: "defensive_resource",
    category: "defense",
    title: "Trouve une ressource défensive",
    prompt: "Quelle décision réduit le plus le danger immédiat ?",
    fen: "6k1/5ppp/8/8/2p5/3r4/5PPP/3R2K1 w - - 0 1",
    playerColor: "white",
    bestMove: "d1d3",
    baselinePlayerCp: 0,
    phase: "middlegame",
    concept: "En défense, échanger la pièce la plus active de l’adversaire peut réduire immédiatement le danger.",
    maxPlayerMoves: 3,
    solutionLine: ["d1d3", "c4d3", "g1f1", "g8f8", "f1e1"],
    successThresholdCp: -100,
    planArrows: [{ from: "d1", to: "d3", color: "primary", label: "échange" }],
    planSquares: [{ square: "d3", color: "warning" }],
  },
  {
    key: "tactic-fork-second",
    type: "tactic",
    origin: "concept",
    mode: "line",
    conceptSlug: "fork",
    category: "tactic",
    title: "Une ressource concrète",
    prompt: "Quelle idée forcing choisirais-tu ici ? Calcule jusqu’au résultat concret.",
    fen: "3q4/4k3/8/4N3/8/8/8/6KR w - - 0 1",
    playerColor: "white",
    bestMove: "e5c6",
    baselinePlayerCp: 420,
    phase: "middlegame",
    concept: "Une fourchette n’est validée qu’après avoir calculé la réponse forcée et réalisé le gain matériel.",
    maxPlayerMoves: 2,
    solutionLine: ["e5c6", "e7d6", "c6d8"],
    successThresholdCp: 250,
    planArrows: [
      { from: "e5", to: "c6", color: "primary", label: "fourchette" },
      { from: "c6", to: "d8", color: "secondary", label: "gain concret" },
    ],
    planSquares: [{ square: "e7", color: "warning" }, { square: "d8", color: "secondary" }],
  },
  {
    key: "strategy-castle-open-file",
    type: "strategy",
    origin: "concept",
    mode: "one-move",
    conceptSlug: "king_safety",
    category: "opening",
    title: "Coordonne tes pièces",
    prompt: "Quelle décision améliorerait plusieurs éléments de ta position à la fois ?",
    fen: "r3r1k1/pp1n1ppp/2p5/3p4/3P4/2P1PN2/PP3PPP/R3R1K1 w - - 0 1",
    playerColor: "white",
    bestMove: "e1c1",
    baselinePlayerCp: 170,
    phase: "middlegame",
    concept: "Le grand roque termine le développement et place immédiatement la tour sur une colonne utile.",
    maxPlayerMoves: 1,
    solutionLine: ["e1c1"],
    planArrows: [{ from: "e1", to: "c1", color: "primary", label: "roi sûr" }, { from: "a1", to: "d1", color: "secondary", label: "colonne d" }],
    planSquares: [{ square: "d1", color: "secondary" }],
  },
  {
    key: "endgame-opposition",
    type: "endgame",
    origin: "concept",
    mode: "playout",
    conceptSlug: "opposition",
    category: "endgame",
    title: "Conduis cette finale",
    prompt: "Quel plan choisirais-tu ? Joue plusieurs coups jusqu’à clarifier le résultat.",
    fen: "8/8/4k3/8/4K3/8/4P3/8 w - - 0 1",
    playerColor: "white",
    bestMove: "e2e3",
    baselinePlayerCp: 600,
    phase: "endgame",
    concept: "Le pion avance seulement quand son roi peut conserver l’opposition et gagner les cases d’entrée.",
    maxPlayerMoves: 4,
    solutionLine: ["e2e3", "e6d6", "e4f5", "d6e7", "f5e5", "e7d7", "e5f6"],
    successThresholdCp: 200,
    planArrows: [{ from: "e2", to: "e3", color: "primary", label: "un pas contrôlé" }, { from: "e4", to: "f5", color: "secondary", label: "opposition" }],
    planSquares: [{ square: "e6", color: "warning" }],
  },
  {
    key: "opening-italian-center",
    type: "opening",
    origin: "concept",
    mode: "one-move",
    conceptSlug: "pawn_break",
    category: "strategy",
    title: "Comprends la structure",
    prompt: "Quelle décision prépare le mieux la suite de ton développement ?",
    fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    playerColor: "white",
    bestMove: "c2c3",
    baselinePlayerCp: 20,
    phase: "opening",
    concept: "c3 prépare la rupture d4 et donne au centre blanc un soutien durable.",
    maxPlayerMoves: 1,
    solutionLine: ["c2c3"],
    planArrows: [{ from: "c2", to: "c3", color: "primary", label: "préparation" }, { from: "d2", to: "d4", color: "secondary", label: "rupture" }],
    planSquares: [{ square: "d4", color: "secondary" }],
  },
  {
    key: "conversion-rook-pawn",
    type: "conversion",
    origin: "concept",
    mode: "playout",
    conceptSlug: "restrict_counterplay",
    category: "conversion",
    title: "Transforme l’avantage",
    prompt: "Quel plan rendrait la progression la plus sûre ? Joue plusieurs coups.",
    fen: "8/8/8/4k3/8/4K3/4P3/3R4 w - - 0 1",
    playerColor: "white",
    bestMove: "d1d2",
    baselinePlayerCp: 950,
    phase: "endgame",
    concept: "La tour coupe le roi adverse ; le roi et le pion peuvent ensuite avancer sans contre-jeu immédiat.",
    maxPlayerMoves: 4,
    solutionLine: ["d1d2", "e5f5", "d2d5", "f5f6", "e3f4", "f6g6", "d5d6"],
    successThresholdCp: 400,
    planArrows: [{ from: "d1", to: "d2", color: "primary", label: "couper le roi" }, { from: "e3", to: "f4", color: "secondary", label: "roi actif" }],
    planSquares: [{ square: "d5", color: "primary" }],
  },
];

for (const exercise of CONCEPT_LIBRARY) {
  // Curated positions are still validated at runtime so an invalid FEN cannot
  // enter a personalized session after a future library edit.
  new Chess(exercise.fen);
}

function exerciseFromLichess(position: TrainingPosition): TrainingExercise {
  const concept = conceptDefinition(position.conceptSlug);
  const playerMoves = Math.max(1, Math.min(3, Math.ceil(position.solutionMoves.length / 2)));
  const fullmove = Number(position.fen.split(/\s+/)[5] ?? 1);
  return {
    id: position.id,
    type: position.category === "defense" ? "defense" : "tactic",
    origin: "concept",
    mode: position.solutionMoves.length <= 1 ? "one-move" : "line",
    theme: position.conceptSlug,
    conceptSlug: position.conceptSlug,
    secondaryConceptSlug: position.secondaryConceptSlug,
    category: position.category,
    title: concept?.labelFr ?? "Tactique Lichess",
    prompt: "Trouve la suite concrète, puis vérifie la meilleure réponse adverse.",
    sourceLabel: `Lichess Puzzle · ${concept?.labelFr ?? position.conceptSlug}`,
    fen: position.fen,
    playerColor: position.playerColor,
    bestMove: position.solutionMoves[0],
    baselinePlayerCp: 0,
    phase: classifyPhase(position.fen, Math.max(1, fullmove * 2 - 1)),
    gameUrl: position.sourceUrl,
    concept: concept?.shortDescription ?? "Calculer la ressource jusqu’à son résultat concret.",
    maxPlayerMoves: playerMoves,
    solutionLine: position.solutionMoves,
    difficulty: position.difficulty,
    source: "lichess",
    sourceId: position.sourceGameId,
    qualityScore: position.qualityScore,
    isVerified: position.isVerified,
  };
}

const LICHESS_LIBRARY = LICHESS_TRAINING_SEED.map(exerciseFromLichess);

function curatedExercise(exercise: ConceptExercise): TrainingExercise {
  return {
    ...exercise,
    id: `concept-${exercise.key}`,
    theme: exercise.conceptSlug,
    sourceLabel: exercise.sourceLabel ?? "Bibliothèque pédagogique ChessPath",
    source: exercise.source ?? "chesspath_curated",
    isVerified: exercise.isVerified ?? true,
  };
}

function exercisePool(): TrainingExercise[] {
  return [...CONCEPT_LIBRARY.map(curatedExercise), ...LICHESS_LIBRARY];
}

function byAdaptedDifficulty(exercises: TrainingExercise[], userRating?: number): TrainingExercise[] {
  return exercises.toSorted((first, second) => {
    if (userRating) {
      const firstDistance = first.difficulty === undefined ? Number.MAX_SAFE_INTEGER : Math.abs(first.difficulty - userRating);
      const secondDistance = second.difficulty === undefined ? Number.MAX_SAFE_INTEGER : Math.abs(second.difficulty - userRating);
      if (firstDistance !== secondDistance) return firstDistance - secondDistance;
      const firstSlightlyHarder = Number((first.difficulty ?? 0) >= userRating);
      const secondSlightlyHarder = Number((second.difficulty ?? 0) >= userRating);
      if (firstSlightlyHarder !== secondSlightlyHarder) return secondSlightlyHarder - firstSlightlyHarder;
    }
    return (second.qualityScore ?? 0) - (first.qualityScore ?? 0) || first.id.localeCompare(second.id);
  });
}

export function conceptExercisesFor(
  category: TrainingExercise["category"],
  conceptSlug: string,
  limit = 2,
  userRating?: number,
): TrainingExercise[] {
  conceptSlug = normalizeConceptSlug(conceptSlug);
  const pool = exercisePool();
  const exact = pool.filter((exercise) => exercise.conceptSlug === conceptSlug);
  const sameCategory = pool.filter((exercise) => (
    exercise.category === category && exercise.conceptSlug !== conceptSlug
  ));
  const selected = byAdaptedDifficulty(exact.length ? exact : sameCategory, userRating);
  return selected.slice(0, limit).map((exercise) => ({
    ...exercise,
    theme: exercise.conceptSlug,
    sourceLabel: exercise.conceptSlug === conceptSlug
      ? "Nouvelle position · même concept"
      : "Position pédagogique ChessPath",
  }));
}

export function conceptExercisesForSlug(conceptSlug: string, limit = 2, userRating?: number): TrainingExercise[] {
  conceptSlug = normalizeConceptSlug(conceptSlug);
  return byAdaptedDifficulty(exercisePool()
    .filter((exercise) => exercise.conceptSlug === conceptSlug)
    , userRating).slice(0, limit)
    .map((exercise) => ({
      ...exercise,
      theme: exercise.conceptSlug,
      sourceLabel: "Nouvelle position · même concept",
    }));
}

export function allConceptExercises(): TrainingExercise[] {
  return exercisePool();
}
