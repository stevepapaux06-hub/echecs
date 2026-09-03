import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import { gateTrainingExercises, validateTrainingExercise } from "./validation";

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
});
