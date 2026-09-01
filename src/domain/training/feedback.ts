import { Chess, type Move, type Square } from "chess.js";
import type {
  EngineEvaluation,
  PlanArrow,
  PlanSquare,
  PlayerColor,
  StructuredExerciseExplanation,
  TrainingExercise,
  TrainingType,
} from "@/domain/chess/types";
import { evaluationForPlayer } from "../../infrastructure/engine/uci";
import type { PedagogicalMoveResult } from "./sequence";

export type MoveGrade = "excellent" | "very-good" | "playable" | "inaccuracy" | "mistake";

export type CandidateMove = {
  uci: string;
  san: string;
  playerCp: number;
  whiteCentricCp: number;
  pvSan: string;
};

export type TrainingFeedback = {
  grade: MoveGrade;
  tone: "great" | "good" | "warning";
  title: string;
  body: string;
  bestMove: string;
  bestMoveSan: string;
  playedMove: string;
  playedMoveSan: string;
  bestLineSan: string;
  playedLineSan: string;
  lossCp: number;
  afterPlayerCp: number;
  candidates: CandidateMove[];
  idea: string;
  explanation?: StructuredExerciseExplanation;
  principalLineUci: string[];
  planArrows: PlanArrow[];
  planSquares: PlanSquare[];
};

const PIECE_NAMES: Record<Move["piece"], string> = {
  p: "pion",
  n: "cavalier",
  b: "fou",
  r: "tour",
  q: "dame",
  k: "roi",
};

export function gradeMove(lossCp: number): MoveGrade {
  if (lossCp <= 20) return "excellent";
  if (lossCp <= 50) return "very-good";
  if (lossCp <= 100) return "playable";
  if (lossCp <= 180) return "inaccuracy";
  return "mistake";
}

export function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    return chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.slice(4, 5) || "q",
    }).san;
  } catch {
    return uci;
  }
}

export function uciLineToSan(fen: string, line: string[], maxPlies = 6): string {
  const chess = new Chess(fen);
  const san: string[] = [];

  for (const uci of line.slice(0, maxPlies)) {
    try {
      san.push(chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.slice(4, 5) || "q",
      }).san);
    } catch {
      break;
    }
  }

  return san.join(" ");
}

function describeMoveIdea(fen: string, uci: string, exerciseType: TrainingType): string {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.slice(4, 5) || "q",
    });

    if (chess.isCheckmate()) return "La ligne de référence force immédiatement le mat.";
    if (chess.isCheck()) return "Le coup de référence joue avec tempo : l’échec force une réponse adverse.";
    if (move.promotion) return "Le coup de référence concrétise l’avantage en promouvant un pion.";
    if (move.captured) return "Le coup de référence clarifie tout de suite le bilan matériel par une prise.";
    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      return "Le coup de référence met le roi en sécurité et active une tour.";
    }
    if (move.piece === "k") {
      return "Le coup de référence active le roi sans l’exposer à une menace immédiate.";
    }
    if (exerciseType === "defense") {
      return `Le coup de référence active le ${PIECE_NAMES[move.piece]} tout en limitant les menaces immédiates.`;
    }
    if (exerciseType === "conversion") {
      return `Le coup de référence améliore le ${PIECE_NAMES[move.piece]} sans rendre le contre-jeu adverse plus facile.`;
    }
    return `Le coup de référence améliore l’activité du ${PIECE_NAMES[move.piece]} avant de chercher une action forcing.`;
  } catch {
    return "Compare surtout les réponses forcing dans la ligne de référence.";
  }
}

function copyForGrade(grade: MoveGrade, foundCandidate: boolean): { title: string; lead: string } {
  switch (grade) {
    case "excellent":
      return {
        title: "Excellent",
        lead: foundCandidate
          ? "Tu as trouvé l’une des meilleures continuations de la position."
          : "Ton choix conserve toute la valeur mesurée de la position.",
      };
    case "very-good":
      return {
        title: "Très bon",
        lead: "Tu conserves presque tout le potentiel de la position, même si une suite est un peu plus précise.",
      };
    case "playable":
      return {
        title: "Jouable",
        lead: "Ton idée reste saine, mais elle laisse une marge de manœuvre supplémentaire à l’adversaire.",
      };
    case "inaccuracy":
      return {
        title: "Imprécision",
        lead: "La position reste jouable, mais ce coup cède une part mesurable de ton avantage.",
      };
    default:
      return {
        title: "Erreur importante",
        lead: "Ce coup change nettement l’évaluation et autorise une ressource adverse concrète.",
      };
  }
}

export function buildTrainingFeedback({
  fen,
  playerColor,
  exercise,
  playedMove,
  playedMoveSan,
  baseline,
  after,
}: {
  fen: string;
  playerColor: PlayerColor;
  exercise: TrainingExercise;
  playedMove: string;
  playedMoveSan: string;
  baseline: EngineEvaluation;
  after: EngineEvaluation;
}): TrainingFeedback {
  const expectedSide = playerColor === "white" ? "w" : "b";
  if (baseline.sideToMove !== expectedSide) {
    throw new Error("La position d’exercice n’est pas orientée du point de vue du joueur.");
  }

  const baselinePlayerCp = evaluationForPlayer(baseline.whiteCp, playerColor);
  const afterPlayerCp = evaluationForPlayer(after.whiteCp, playerColor);
  const lossCp = Math.max(0, baselinePlayerCp - afterPlayerCp);
  const grade = gradeMove(lossCp);
  const foundCandidate = baseline.lines.some((line) => line.pv[0] === playedMove);
  const copy = copyForGrade(grade, foundCandidate);
  const principal = baseline.lines[0];
  const bestMove = baseline.bestMove || principal?.pv[0] || "";
  const candidates = baseline.lines
    .filter((line) => line.pv[0])
    .slice(0, 3)
    .map((line) => ({
      uci: line.pv[0],
      san: uciToSan(fen, line.pv[0]),
      playerCp: evaluationForPlayer(line.whiteCp, playerColor),
      whiteCentricCp: line.whiteCp,
      pvSan: uciLineToSan(fen, line.pv),
    }));

  const inferredIdea = describeMoveIdea(fen, bestMove, exercise.type);
  const principalLineUci = principal?.pv.slice(0, 6) ?? [];
  const inferredArrows: PlanArrow[] = principalLineUci.length
    ? [
        { from: principalLineUci[0].slice(0, 2), to: principalLineUci[0].slice(2, 4), color: "primary" },
        ...(principalLineUci[2] ? [{
          from: principalLineUci[2].slice(0, 2),
          to: principalLineUci[2].slice(2, 4),
          color: "secondary" as const,
        }] : []),
      ]
    : [];

  return {
    grade,
    tone: grade === "excellent" || grade === "very-good"
      ? "great"
      : grade === "playable" || grade === "inaccuracy"
        ? "good"
        : "warning",
    title: copy.title,
    body: exercise.explanation
      ? `${copy.lead} ${exercise.explanation.objective}`
      : copy.lead,
    bestMove,
    bestMoveSan: uciToSan(fen, bestMove),
    playedMove,
    playedMoveSan,
    bestLineSan: principal ? uciLineToSan(fen, principal.pv) : "",
    playedLineSan: uciLineToSan(fen, [playedMove, ...(after.lines[0]?.pv ?? [])]),
    lossCp,
    afterPlayerCp,
    candidates,
    idea: exercise.concept || inferredIdea,
    explanation: exercise.explanation,
    principalLineUci,
    planArrows: exercise.planArrows?.length ? exercise.planArrows : inferredArrows,
    planSquares: exercise.planSquares ?? [],
  };
}

export function buildSequenceFeedback({
  exercise,
  initial,
  moves,
  result,
  lossCp,
  afterPlayerCp,
  pedagogicalMove = "concept",
}: {
  exercise: TrainingExercise;
  initial: EngineEvaluation;
  moves: string[];
  result: "success" | "partial" | "failed";
  lossCp: number;
  afterPlayerCp: number;
  pedagogicalMove?: PedagogicalMoveResult;
}): TrainingFeedback {
  const firstPlayedMove = moves[0] ?? "";
  const coachedLine = pedagogicalMove === "concept"
    ? initial.lines.find((line) => line.pv[0] === firstPlayedMove)?.pv
    : undefined;
  const principal = coachedLine?.length
    ? coachedLine.slice(0, Math.max(2, exercise.maxPlayerMoves * 2 - 1))
    : exercise.solutionLine?.length
      ? exercise.solutionLine
      : initial.lines[0]?.pv.slice(0, Math.max(2, exercise.maxPlayerMoves * 2 - 1)) ?? [];
  const bestMove = principal[0] || initial.bestMove || exercise.bestMove;
  const playedSequenceSan = uciLineToSan(exercise.fen, moves, moves.length) || "ton choix";
  const candidates = initial.lines
    .filter((line) => line.pv[0])
    .slice(0, 3)
    .map((line) => ({
      uci: line.pv[0],
      san: uciToSan(exercise.fen, line.pv[0]),
      playerCp: evaluationForPlayer(line.whiteCp, exercise.playerColor),
      whiteCentricCp: line.whiteCp,
      pvSan: uciLineToSan(exercise.fen, line.pv),
    }));
  const inferredArrows: PlanArrow[] = principal.length
    ? [
        { from: principal[0].slice(0, 2), to: principal[0].slice(2, 4), color: "primary" },
        ...(principal[2] ? [{
          from: principal[2].slice(0, 2),
          to: principal[2].slice(2, 4),
          color: "secondary" as const,
        }] : []),
      ]
    : [];

  const rootCause = exercise.pedagogy?.rootCause;
  const learningGoal = exercise.pedagogy?.learningGoal || exercise.concept;
  const copy = result === "success"
    ? {
        title: "Séquence réussie",
        body: `Avec ${playedSequenceSan}, tu as trouvé l’idée travaillée et conservé sa valeur concrète. ${learningGoal}`,
      }
    : result === "partial" && pedagogicalMove === "good-alternative"
      ? {
          title: "Bon coup, autre idée",
          body: `${playedSequenceSan} est bon, mais il ne correspond pas à l’idée travaillée ici. ${learningGoal}`,
        }
      : result === "partial"
        ? {
            title: "Idée comprise, technique à consolider",
            body: `${playedSequenceSan} reste jouable, mais n’atteint pas encore clairement l’objectif. ${learningGoal}`,
          }
        : {
            title: "Séquence à revoir",
            body: `${playedSequenceSan} change réellement l’évaluation de la position. ${rootCause || learningGoal}`,
          };

  return {
    grade: result === "success" ? "excellent" : result === "partial" ? "playable" : "mistake",
    tone: result === "success" ? "great" : result === "partial" ? "good" : "warning",
    title: copy.title,
    body: copy.body,
    bestMove,
    bestMoveSan: uciToSan(exercise.fen, bestMove),
    playedMove: firstPlayedMove,
    playedMoveSan: playedSequenceSan,
    bestLineSan: uciLineToSan(exercise.fen, principal, principal.length),
    playedLineSan: "",
    lossCp,
    afterPlayerCp,
    candidates,
    idea: exercise.concept || describeMoveIdea(exercise.fen, bestMove, exercise.type),
    explanation: exercise.explanation,
    principalLineUci: principal,
    planArrows: exercise.planArrows?.length ? exercise.planArrows : inferredArrows,
    planSquares: exercise.planSquares ?? [],
  };
}
