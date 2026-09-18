import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../chess/types";
import { trainingExerciseValidationFingerprint } from "../training/validation";
import type { ValidatedWeaknessEvidence } from "./recurring-weaknesses";
import {
  aggregateRecurringWeaknesses,
  weaknessEvidenceFromPublishedExercises,
} from "./recurring-weaknesses";

const NOW = Date.parse("2026-09-17T12:00:00.000Z");

function evidence(
  gameId: string,
  conceptSlug = "fork",
  overrides: Partial<ValidatedWeaknessEvidence> = {},
): ValidatedWeaknessEvidence {
  const momentId = overrides.momentId ?? "20";
  return {
    evidenceId: `${gameId}:${momentId}:${conceptSlug}`,
    exerciseId: `personal-${gameId}-${momentId}`,
    gameId,
    momentId,
    conceptSlug,
    reason: "ERROR",
    conceptRole: "PRIMARY",
    confidence: 0.9,
    occurredAt: "2026-09-10T12:00:00.000Z",
    validationFingerprint: `fingerprint-${gameId}-${momentId}`,
    validationStatus: "active",
    ...overrides,
  };
}

function publishedExercise(overrides: Partial<TrainingExercise> = {}): TrainingExercise {
  const exercise: TrainingExercise = {
    id: "personal-g1-20",
    type: "strategy",
    origin: "personal",
    mode: "one-move",
    theme: "piece_activity",
    conceptSlug: "piece_activity",
    category: "strategy",
    domain: "strategy",
    primaryConcept: "piece_activity",
    title: "Active ta pièce",
    prompt: "Trouve un rôle utile.",
    sourceLabel: "Ta partie",
    fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    playerColor: "white",
    bestMove: "e1e2",
    baselinePlayerCp: 0,
    engineCandidates: [{ uci: "e1e2", playerCp: 0, pv: ["e1e2"] }],
    acceptedConceptMoveUcis: ["e1e2"],
    personalReason: "ERROR",
    conceptRole: "PRIMARY",
    answerContract: {
      version: 1,
      bestPlayerCp: 0,
      equivalentToleranceCp: 35,
      accepted: [{
        moveUci: "e1e2",
        playerCp: 0,
        lossFromBestCp: 0,
        reason: "same_mechanism",
        mechanisms: ["piece_activity"],
        planFamily: "piece_activity",
      }],
    },
    phase: "endgame",
    concept: "Activer une pièce",
    maxPlayerMoves: 1,
    solutionLine: ["e1e2"],
    classificationConfidence: 0.9,
    source: "personal_game",
    sourceId: "g1",
    sourceGameId: "g1",
    sourceDate: "2026-09-10T12:00:00.000Z",
    positionPly: 20,
    isVerified: true,
    verificationStatus: "active",
    verification: { engine: "Stockfish", depth: 10, multiPv: 2 },
    ...overrides,
  };
  return {
    ...exercise,
    validationFingerprint: trainingExerciseValidationFingerprint(exercise),
  };
}

describe("recurring weakness aggregation", () => {
  it("keeps one occurrence as insufficient evidence", () => {
    expect(aggregateRecurringWeaknesses([evidence("g1")], NOW)[0]).toMatchObject({
      status: "INSUFFICIENT_EVIDENCE",
      distinctGames: 1,
      evidenceCount: 1,
      priority: null,
    });
  });

  it("does not call repeated moments from one game recurrent", () => {
    const result = aggregateRecurringWeaknesses([
      evidence("g1", "fork", { momentId: "20" }),
      evidence("g1", "fork", { momentId: "34" }),
      evidence("g1", "fork", { momentId: "48" }),
    ], NOW)[0];
    expect(result).toMatchObject({
      status: "INSUFFICIENT_EVIDENCE",
      distinctGames: 1,
      evidenceCount: 3,
    });
  });

  it("moves the same concept from emerging to recurring across distinct games", () => {
    expect(aggregateRecurringWeaknesses([
      evidence("g1"),
      evidence("g2", "fork", { reason: "OPPORTUNITY" }),
    ], NOW)[0]).toMatchObject({ status: "EMERGING", errors: 1, opportunities: 1 });
    expect(aggregateRecurringWeaknesses([evidence("g1"), evidence("g2"), evidence("g3")], NOW)[0].status)
      .toBe("RECURRING");
  });

  it("ignores secondary and invalidated evidence", () => {
    const result = aggregateRecurringWeaknesses([
      evidence("g1"),
      evidence("g2", "fork", { conceptRole: "SECONDARY" }),
      evidence("g3", "fork", { validationStatus: "invalidated" }),
    ], NOW)[0];
    expect(result).toMatchObject({ status: "INSUFFICIENT_EVIDENCE", evidenceCount: 1 });
  });

  it("deduplicates the same game, moment and normalized concept", () => {
    const result = aggregateRecurringWeaknesses([
      evidence("g1", "knight-fork", { evidenceId: "legacy", confidence: 0.82 }),
      evidence("g1", "fork", { evidenceId: "canonical", confidence: 0.94 }),
    ], NOW)[0];
    expect(result).toMatchObject({ conceptSlug: "fork", evidenceCount: 1, averageEvidenceConfidence: 0.94 });
    expect(result.supportingEvidence[0].evidenceId).toBe("canonical");
  });

  it("ranks recurrent weaknesses with explicit independent and recent evidence", () => {
    const result = aggregateRecurringWeaknesses([
      evidence("f1", "fork"), evidence("f2", "fork"), evidence("f3", "fork"), evidence("f4", "fork"),
      evidence("p1", "pin", { confidence: 0.96 }),
      evidence("p2", "pin", { confidence: 0.96 }),
      evidence("p3", "pin", { confidence: 0.96 }),
    ], NOW);
    expect(result.slice(0, 2).map((item) => [item.conceptSlug, item.priority]))
      .toEqual([["fork", 1], ["pin", 2]]);
    expect(result[0].priorityReasons[0]).toContain("4 parties distinctes");
    expect(result[0].priorityReasons[2]).toContain("90 derniers jours");
  });

  it("returns an empty profile without admissible evidence", () => {
    expect(aggregateRecurringWeaknesses([], NOW)).toEqual([]);
    expect(aggregateRecurringWeaknesses([
      evidence("g1", "fork", { confidence: 0.79 }),
    ], NOW)).toEqual([]);
  });

  it("extracts only a still-valid final personal exercise", () => {
    const active = publishedExercise();
    const mutated = { ...publishedExercise({ id: "personal-g2-20", sourceId: "g2", sourceGameId: "g2" }), title: "Titre modifié après validation" };
    const secondary = publishedExercise({ id: "personal-g3-20", sourceId: "g3", sourceGameId: "g3", conceptRole: "SECONDARY" });
    expect(weaknessEvidenceFromPublishedExercises([active, mutated, secondary]))
      .toEqual([expect.objectContaining({ gameId: "g1", momentId: "20", conceptSlug: "piece_activity" })]);
  });
});
