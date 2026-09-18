import type {
  AnalyzedGame,
  AnalyzedMove,
  CandidateAuditEntry,
  DiagnosticCategory,
  DiagnosticMetrics,
  TrainingContentResolution,
  TrainingExercise,
  TrainingType,
} from "@/domain/chess/types";
import { resolveConceptExercises } from "./library-runtime";
import { conceptDefinition, normalizeConceptSlug } from "../knowledge/concepts";
import { isPatternProductEligible } from "../patterns/policy";
import { buildExerciseTeaching } from "./explanation";
import { withTrainingTaxonomy } from "./taxonomy";
import { withPedagogicalContract } from "./contract";
import { finalizeTrainingExerciseValidation } from "./validation";
import { validateTrainingExercise } from "./validation";
import { assessPersonalExercise, estimatePedagogicalDifficulty } from "./personal-contract";

export const DEFAULT_TRAINING_FILTER_CONFIG = {
  lostPositionThresholdCp: 200,
  playableAgainThresholdCp: -150,
} as const;

const MAX_PERSONAL_RESERVE = 120;
const STATE_BASED_MOMENTS = new Set(["conversion", "collapse", "defensive_miss", "defensive_resource"]);
const CONCRETE_CONCEPT_PRIORITY = [
  "remove_defender",
  "overloaded_defender",
  "fork",
  "skewer",
  "pin",
  "loose_piece",
  "opponent_threat",
  "outpost",
  "open_file",
  "weak_pawn",
  "pawn_break",
  "improve_worst_piece",
  "passed_pawn",
  "forcing_moves",
] as const;

function conceptSpecificity(slug: string): number {
  const index = CONCRETE_CONCEPT_PRIORITY.indexOf(slug as typeof CONCRETE_CONCEPT_PRIORITY[number]);
  return index < 0 ? 0 : CONCRETE_CONCEPT_PRIORITY.length - index;
}

/**
 * Personal does not mean pedagogical. Keep only positions with a reliable,
 * transferable concept or a meaningful state transition. Positions that stay
 * completely won/lost are rejected even when the raw engine delta is large.
 */
export function isPedagogicallyEligiblePersonalMove(move: AnalyzedMove): boolean {
  return assessPersonalExercise(move).eligible;
}

/**
 * Keeps the first pedagogically meaningful collapse, then suppresses its
 * consequences until Stockfish says the position is genuinely playable again.
 */
export function filterLostPositionCascade<T extends { playerCpBefore: number; playerCpAfter: number }>(
  moves: T[],
  config: { lostPositionThresholdCp: number; playableAgainThresholdCp: number } = DEFAULT_TRAINING_FILTER_CONFIG,
): T[] {
  const kept: T[] = [];
  let suppressConsequences = false;
  for (const move of moves) {
    const genuineRecovery = move.playerCpAfter >= config.playableAgainThresholdCp
      && move.playerCpAfter - move.playerCpBefore >= 80;
    if (suppressConsequences && genuineRecovery) {
      kept.push(move);
      suppressConsequences = false;
      continue;
    }
    if (suppressConsequences && move.playerCpBefore > config.playableAgainThresholdCp) {
      suppressConsequences = false;
    }
    if (suppressConsequences) continue;
    if (move.playerCpBefore <= -config.lostPositionThresholdCp) {
      if (genuineRecovery) kept.push(move);
      continue;
    }
    kept.push(move);
    if (move.playerCpAfter <= -config.lostPositionThresholdCp) suppressConsequences = true;
  }
  return kept;
}

function getType(playerCp: number, phase: string): TrainingType {
  if (playerCp >= 200) return "conversion";
  if (playerCp <= -150) return "defense";
  if (phase === "endgame") return "endgame";
  return "mistake";
}
function categoryForType(type: TrainingType): DiagnosticCategory {
  if (type === "conversion") return "conversion";
  if (type === "defense") return "defense";
  if (type === "endgame") return "endgame";
  if (type === "strategy") return "strategy";
  if (type === "opening") return "opening";
  return "tactic";
}

function typeForMoment(
  fallback: TrainingType,
  category: DiagnosticCategory,
  kind: string | undefined,
): TrainingType {
  if (kind === "conversion") return "conversion";
  if (kind === "defensive_miss" || kind === "defensive_resource") return "defense";
  if (category === "tactic" || category === "strategy" || category === "opening" || category === "endgame") {
    return category;
  }
  return fallback;
}

const COPY: Record<TrainingType, { title: string; prompt: string; concept: string }> = {
  conversion: {
    title: "Conserve ton avantage",
    prompt: "Tu disposais ici d’un avantage important. Trouve une suite précise qui garde le contrôle.",
    concept: "En position gagnante, la priorité est de limiter le contre-jeu avant de chercher la solution la plus rapide.",
  },
  defense: {
    title: "Trouve la meilleure résistance",
    prompt: "La position est difficile, mais elle demande encore une défense active. Quel est ton meilleur essai ?",
    concept: "Une défense active crée des problèmes concrets au lieu d’attendre passivement la prochaine menace.",
  },
  endgame: {
    title: "Joue cette finale avec précision",
    prompt: "Cette décision de finale a compté. Cherche le coup qui améliore le plus ta position.",
    concept: "En finale, l’activité du roi et des pièces pèse souvent davantage qu’un pion défendu passivement.",
  },
  mistake: {
    title: "Rejoue ta décision",
    prompt: "Cette position vient de ta partie. Prends le temps de trouver une meilleure continuation.",
    concept: "Commence par comparer tous les échecs, prises et menaces avant de choisir ton coup.",
  },
  tactic: {
    title: "Calcule la ressource forcing",
    prompt: "Trouve la suite concrète, puis vérifie jusqu’où le motif fonctionne.",
    concept: "Une séquence forcing doit être calculée jusqu’au gain, pas seulement reconnue au premier coup.",
  },
  strategy: {
    title: "Trouve le meilleur plan",
    prompt: "Cherche le placement qui améliore durablement ta position.",
    concept: "Un bon plan améliore la pièce la moins active et réduit le contre-jeu adverse.",
  },
  opening: {
    title: "Retrouve le plan de la structure",
    prompt: "Ne récite pas un coup : identifie l’idée de développement ou la rupture adaptée.",
    concept: "Les ouvertures se retiennent mieux par leurs plans et leurs structures que par une suite isolée de coups.",
  },
};

function exerciseShape(
  type: TrainingType,
  category: DiagnosticCategory,
  baselinePlayerCp: number,
): Pick<TrainingExercise, "mode" | "maxPlayerMoves" | "successThresholdCp"> {
  if (category === "strategy" || category === "opening") {
    return { mode: "one-move", maxPlayerMoves: 1 };
  }
  if (type === "conversion") {
    return {
      mode: "playout",
      maxPlayerMoves: 4,
      successThresholdCp: Math.max(150, baselinePlayerCp - 180),
    };
  }
  if (type === "endgame") {
    return { mode: "playout", maxPlayerMoves: 4, successThresholdCp: baselinePlayerCp - 150 };
  }
  if (type === "defense") {
    return { mode: "line", maxPlayerMoves: 3, successThresholdCp: baselinePlayerCp - 80 };
  }
  return { mode: "line", maxPlayerMoves: 2 };
}

export function generateExercisesWithAudit(
  games: AnalyzedGame[],
  metrics: DiagnosticMetrics,
): {
  exercises: TrainingExercise[];
  auditTrail: CandidateAuditEntry[];
  bankResolution: TrainingContentResolution;
} {
  const primaryConceptSlug = normalizeConceptSlug(metrics.primaryTheme.id);
  const primaryPositions = new Set(metrics.primaryTheme.positionIds);
  const auditById = new Map<string, CandidateAuditEntry>();
  const ranked = games
    .flatMap((game) => {
      const ordered = game.analyzedMoves.toSorted((a, b) => a.ply - b.ply);
      const kept = filterLostPositionCascade(ordered);
      const keptMoves = new Set(kept);
      for (const move of ordered) {
        if (keptMoves.has(move)) continue;
        const candidateId = `${game.id}:${move.ply}`;
        auditById.set(candidateId, {
          candidateId, gameId: game.id, ply: move.ply,
          state: "ABSTAINED", reasons: ["lost_position_cascade"],
        });
      }
      return kept.map((move) => ({ game, move, positionId: `${game.id}:${move.ply}` }));
    })
    .toSorted((a, b) => {
      const priorityDifference = Number(primaryPositions.has(b.positionId)) - Number(primaryPositions.has(a.positionId));
      return priorityDifference
        || (b.move.pedagogical?.score ?? 0) - (a.move.pedagogical?.score ?? 0)
        || b.move.lossCp - a.move.lossCp;
    });
  const assessed = ranked.map((item) => ({ ...item, decision: assessPersonalExercise(item.move) }));
  for (const item of assessed.filter(({ decision }) => !decision.eligible)) {
    auditById.set(item.positionId, {
      candidateId: item.positionId,
      gameId: item.game.id,
      ply: item.move.ply,
      state: item.decision.terminalReason,
      reasons: item.decision.reasons,
      conceptSlug: item.decision.conceptSlug,
    });
  }
  const pedagogical = assessed.filter(({ decision }) => decision.eligible);
  const seenFens = new Set<string>();
  const primaryPedagogical = pedagogical.filter(({ positionId }) => primaryPositions.has(positionId));
  const candidateOrder = [...primaryPedagogical, ...pedagogical];
  const seenCandidates = new Set<string>();
  const candidates = candidateOrder
    .filter(({ game, move, positionId }) => {
      if (seenCandidates.has(positionId)) return false;
      seenCandidates.add(positionId);
      if (seenFens.has(move.fenBefore)) {
        auditById.set(positionId, {
          candidateId: positionId, gameId: game.id, ply: move.ply,
          state: "DEDUPLICATED", reasons: ["duplicate_fen"],
        });
        return false;
      }
      seenFens.add(move.fenBefore);
      return true;
    });
  for (const item of candidates.slice(MAX_PERSONAL_RESERVE)) {
    auditById.set(item.positionId, {
      candidateId: item.positionId, gameId: item.game.id, ply: item.move.ply,
      state: "SESSION_BUDGET", reasons: ["personal_reserve_limit"],
      conceptSlug: item.decision.conceptSlug,
    });
  }

  const personal = candidates.slice(0, MAX_PERSONAL_RESERVE).flatMap(({ game, move, positionId, decision }): TrainingExercise[] => {
    const fallbackType = getType(move.playerCpBefore, move.phase);
    const relatedToPrimary = primaryPositions.has(`${game.id}:${move.ply}`);
    const patterns = move.patterns?.toSorted((a, b) => (
      Number(a.success) - Number(b.success)
      || conceptSpecificity(b.conceptSlug) - conceptSpecificity(a.conceptSlug)
      || b.confidence - a.confidence
    ));
    const conceptSlug = decision.conceptSlug!;
    const detectedPattern = patterns?.find((pattern) => pattern.conceptSlug === conceptSlug);
    const concept = conceptDefinition(conceptSlug);
    const category = conceptSlug === "passed_pawn" && move.phase !== "endgame"
      ? "strategy"
      : concept?.category === "endgame" && move.phase !== "endgame"
        ? categoryForType(fallbackType)
        : concept?.category ?? (relatedToPrimary ? metrics.primaryTheme.category : categoryForType(fallbackType));
    const type = typeForMoment(fallbackType, category, move.pedagogical?.kind);
    const shape = exerciseShape(type, category, move.playerCpBefore);
    const primaryLine = decision.engineCandidates?.find((line) => line.uci === move.before.bestMove)
      ?? decision.engineCandidates?.[0];
    const solutionLine = primaryLine?.pv.slice(0, shape.maxPlayerMoves * 2 - 1);
    const teaching = buildExerciseTeaching(
      move.fenBefore,
      move.before.bestMove,
      conceptSlug,
      solutionLine,
    );
    const acceptedConceptMoveUcis = decision.answerContract!.accepted.map((answer) => answer.moveUci);
    const secondaryConceptSlugs = [...new Set((move.patterns ?? [])
      .filter((pattern) => pattern.conceptSlug !== conceptSlug && isPatternProductEligible(pattern))
      .map((pattern) => pattern.conceptSlug))];
    const exercise = withPedagogicalContract(withTrainingTaxonomy({
      // Stable across analyses: reordering the reserve cannot make a solved
      // personal position look new again.
      id: `personal-${game.id}-${move.ply}`,
      type,
      origin: "personal",
      mode: shape.mode,
      theme: conceptSlug,
      conceptSlug,
      domain: category,
      primaryConcept: conceptSlug,
      category,
      title: COPY[type].title,
      prompt: COPY[type].prompt,
      sourceLabel: `Ta partie contre ${game.opponent}`,
      fen: move.fenBefore,
      playerColor: game.playerColor,
      bestMove: move.before.bestMove,
      playedMove: move.uci,
      baselinePlayerCp: move.playerCpBefore,
      playedMovePlayerCp: move.playerCpAfter,
      lossCp: move.lossCp,
      engineCandidates: decision.engineCandidates,
      acceptedConceptMoveUcis,
      personalReason: decision.personalReason,
      conceptRole: decision.conceptRole,
      answerContract: decision.answerContract,
      phase: move.phase,
      gameUrl: game.url,
      opponent: game.opponent,
      concept: COPY[type].concept,
      maxPlayerMoves: shape.maxPlayerMoves,
      solutionLine: solutionLine?.length ? solutionLine : [move.before.bestMove],
      successThresholdCp: shape.successThresholdCp,
      explanation: teaching?.explanation,
      planArrows: teaching?.planArrows,
      planSquares: teaching?.planSquares,
      secondaryConceptSlugs,
      secondaryConceptSlug: secondaryConceptSlugs[0],
      secondaryConcepts: secondaryConceptSlugs,
      classificationConfidence: detectedPattern?.confidence
        ?? (STATE_BASED_MOMENTS.has(move.pedagogical?.kind ?? "") ? 0.86 : 0.75),
      difficulty: estimatePedagogicalDifficulty(move, decision),
      source: "personal_game",
      sourceId: game.id,
      sourceGameId: game.id,
      sourceDate: game.playedAt > 0 ? new Date(game.playedAt * 1_000).toISOString() : undefined,
      positionPly: move.ply,
      verificationSource: "Stockfish analysis from the saved personal game",
      verification: {
        engine: "Stockfish",
        depth: move.before.depth,
        multiPv: move.before.lines.length,
      },
      qualityScore: move.pedagogical?.score
        ?? (detectedPattern ? Math.round(detectedPattern.confidence * 100) : undefined),
      isVerified: true,
      verificationStatus: "active",
      patternPolicyAccepted: detectedPattern ? isPatternProductEligible(detectedPattern) : undefined,
    }));
    if (!exercise.explanation) {
      auditById.set(positionId, {
        candidateId: positionId, gameId: game.id, ply: move.ply,
        state: "VALIDATION_FAILED", reasons: ["causal_explanation_unavailable"], conceptSlug,
      });
      return [];
    }
    if ((exercise.classificationConfidence ?? 0) < 0.8 && exercise.patternPolicyAccepted !== true) {
      auditById.set(positionId, {
        candidateId: positionId, gameId: game.id, ply: move.ply,
        state: "LOW_CONFIDENCE", reasons: ["classification_confidence_below_policy"], conceptSlug,
      });
      return [];
    }
    const finalized = finalizeTrainingExerciseValidation(exercise);
    const validation = validateTrainingExercise(finalized, { requireFinalFingerprint: true, requireTeachingFacts: true });
    if (finalized.verificationStatus !== "active" || validation.status !== "active") {
      auditById.set(positionId, {
        candidateId: positionId, gameId: game.id, ply: move.ply,
        state: "VALIDATION_FAILED",
        reasons: validation.reasons.length ? validation.reasons : ["final_validation_failed"],
        exerciseId: finalized.id,
        conceptSlug,
      });
      return [];
    }
    auditById.set(positionId, {
      candidateId: positionId, gameId: game.id, ply: move.ply,
      state: "PUBLISHED", reasons: [], exerciseId: finalized.id, conceptSlug,
    });
    return [finalized];
  });

  const resolved = metrics.primaryTheme.issueCount > 0
    ? resolveConceptExercises(primaryConceptSlug, 2, games[0]?.playerRating)
    : {
        exercises: [],
        resolution: {
          requestedConcept: primaryConceptSlug,
          servedConcept: null,
          relation: "unavailable" as const,
          exerciseCount: 0,
        },
      };
  const exercises = personal.length === 0
    ? resolved.exercises
    : [personal[0], ...resolved.exercises, ...personal.slice(1)];
  return {
    exercises,
    auditTrail: [...auditById.values()].toSorted((first, second) => (
      first.gameId.localeCompare(second.gameId) || first.ply - second.ply
    )),
    bankResolution: resolved.resolution,
  };
}

export function generateExercises(games: AnalyzedGame[], metrics: DiagnosticMetrics): TrainingExercise[] {
  return generateExercisesWithAudit(games, metrics).exercises;
}
