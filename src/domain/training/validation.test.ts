import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import {
  finalizeTrainingExerciseValidation,
  gateTrainingExercises,
  CRITICAL_STOCKFISH_BASELINE_HOLD,
  trainingExerciseValidationFingerprint,
  validateTrainingExercise,
} from "./validation";

describe("training bank gate", () => {
  const base = allConceptExercises()[0];

  it("rejects an illegal solution line", () => {
    const invalid: TrainingExercise = { ...base, solutionLine: ["a1a8"], bestMove: "a1a8" };
    expect(validateTrainingExercise(invalid)).toMatchObject({ status: "rejected" });
  });

  it("quarantines a legal but undocumented source", () => {
    const undocumented: TrainingExercise = {
      ...base,
      id: "undocumented",
      source: "chesspath_curated",
      verificationSource: undefined,
      verification: undefined,
    };
    expect(validateTrainingExercise(undocumented)).toMatchObject({ status: "needs_verification" });
  });

  it("rejects a conversion exercise that starts from an overwhelming advantage", () => {
    const overwhelming: TrainingExercise = {
      ...base,
      id: "overwhelming",
      category: "conversion",
      domain: "conversion",
      type: "conversion",
      baselinePlayerCp: 900,
    };
    expect(validateTrainingExercise(overwhelming)).toMatchObject({ status: "rejected" });
  });

  it("rejects a Lichess defense without a verified equality outcome", () => {
    const unsupported: TrainingExercise = {
      ...base,
      id: "unsupported-defense",
      category: "defense",
      domain: "defense",
      type: "defense",
      source: "lichess",
      sourceThemes: ["defensiveMove"],
    };
    expect(validateTrainingExercise(unsupported)).toMatchObject({ status: "rejected" });
  });

  it("keeps only one neighbouring moment from the same game and mechanism", () => {
    const other = allConceptExercises().find((exercise) => (
      exercise.conceptSlug === base.conceptSlug && exercise.fen !== base.fen
    ))!;
    const first: TrainingExercise = {
      ...base,
      id: "same-game-ply-30",
      sourceGameId: "game-42",
      positionPly: 30,
      pedagogicalMechanism: "fork",
    };
    const second: TrainingExercise = {
      ...other,
      id: "same-game-ply-34",
      sourceGameId: "game-42",
      positionPly: 34,
      pedagogicalMechanism: "fork",
    };
    const gated = gateTrainingExercises([first, second]);
    expect(gated.active).toHaveLength(1);
    expect(gated.rejected).toHaveLength(1);
  });
  it("also deduplicates legacy master-game source IDs without explicit game/ply fields", () => {
    const other = allConceptExercises().find((e) => e.conceptSlug === base.conceptSlug && e.fen !== base.fen)!;
    const gated = gateTrainingExercises([
      { ...base, id: "legacy-a", source: "master_game", sourceId: "Capablanca-3-105", sourceGameId: undefined, positionPly: undefined },
      { ...other, id: "legacy-b", source: "master_game", sourceId: "Capablanca-3-109", sourceGameId: undefined, positionPly: undefined },
    ]);
    expect(gated.active).toHaveLength(1);
    expect(gated.rejected).toHaveLength(1);
  });

  it("fingerprints only the final transformed exercise", () => {
    const source = { ...base, validationFingerprint: undefined };
    const transformed = { ...source, solutionLine: [source.bestMove], maxPlayerMoves: 1 };
    const finalized = finalizeTrainingExerciseValidation(transformed);
    expect(finalized.validationFingerprint).toBe(trainingExerciseValidationFingerprint(finalized));
    expect(validateTrainingExercise(finalized, { requireFinalFingerprint: true }).status).toBe("active");
  });

  it("invalidates verification when relevant content changes after final validation", () => {
    const finalized = finalizeTrainingExerciseValidation({ ...base, validationFingerprint: undefined });
    const changed = { ...finalized, bestMove: "a1a8" };
    const validation = validateTrainingExercise(changed, { requireFinalFingerprint: true });
    expect(validation.status).not.toBe("active");
    expect(validation.reasons).toContain("verified_content_changed");
  });

  it("invalidates final validation when the accepted-answer contract changes", () => {
    const accepted = base.acceptedConceptMoveUcis?.[0] ?? base.bestMove;
    const finalized = finalizeTrainingExerciseValidation({
      ...base,
      validationFingerprint: undefined,
      answerContract: {
        version: 1,
        bestPlayerCp: base.baselinePlayerCp,
        equivalentToleranceCp: 35,
        accepted: [{
          moveUci: accepted,
          playerCp: base.baselinePlayerCp,
          lossFromBestCp: 0,
          reason: "same_mechanism",
          mechanisms: [base.conceptSlug],
          planFamily: base.conceptSlug,
        }],
      },
    });
    const changed = {
      ...finalized,
      answerContract: { ...finalized.answerContract!, equivalentToleranceCp: 80 },
    };
    expect(validateTrainingExercise(changed, { requireFinalFingerprint: true }).reasons)
      .toContain("verified_content_changed");
  });

  it("cannot publish a verified exercise without final-state proof", () => {
    const unstamped = { ...base, validationFingerprint: undefined };
    expect(gateTrainingExercises([unstamped], { requireFinalFingerprint: true }).active).toEqual([]);
  });

  it("keeps the four non-reproducible Stockfish baselines out of active training", () => {
    const activeIds = new Set(allConceptExercises().map((exercise) => exercise.id));
    expect(CRITICAL_STOCKFISH_BASELINE_HOLD.size).toBe(4);
    expect([...CRITICAL_STOCKFISH_BASELINE_HOLD].filter((id) => activeIds.has(id))).toEqual([]);
  });
});
