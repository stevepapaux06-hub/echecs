import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import { validateTrainingExercise } from "./validation";

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
});
