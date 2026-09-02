import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import { pedagogicalUnitFor, withPedagogicalContract } from "./contract";
import { decideSequence } from "./sequence";

describe("pedagogical exercise contracts", () => {
  const exercises = allConceptExercises();

  it("supports the four real pedagogical units in the active bank", () => {
    const units = new Set(exercises.map(pedagogicalUnitFor));
    expect(units).toEqual(new Set([
      "single_move",
      "decision_then_continuation",
      "short_plan_sequence",
      "theoretical_method",
    ]));
  });

  it("keeps a continuation exercise alive after the first correct move", () => {
    const base = exercises.find((exercise) => pedagogicalUnitFor(exercise) === "decision_then_continuation")!;
    expect(decideSequence({
      exercise: base,
      playerMoves: 1,
      playedMoveUcis: [base.bestMove],
      decisionLossCp: 0,
      totalLossCp: 0,
      afterPlayerCp: base.baselinePlayerCp,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    }).finished).toBe(false);
  });

  it("accepts alternative paths for an explicitly structured plan", () => {
    const base = exercises.find((exercise) => pedagogicalUnitFor(exercise) === "short_plan_sequence")!;
    const exercise: TrainingExercise = withPedagogicalContract({
      ...base,
      pedagogicalUnit: "short_plan_sequence",
      maxPlayerMoves: 2,
      solutionLine: [base.bestMove],
      requiredSteps: [
        { label: "Activer", acceptedMoveUcis: [base.bestMove, "a2a3"] },
        { label: "Consolider", acceptedMoveUcis: ["b2b3", "c2c3"] },
      ],
    });
    expect(decideSequence({
      exercise,
      playerMoves: 2,
      playedMoveUcis: [base.bestMove, "c2c3"],
      decisionLossCp: 10,
      totalLossCp: 20,
      afterPlayerCp: Math.max(base.baselinePlayerCp, base.successThresholdCp ?? -10_000),
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    }).result).toBe("success");
  });

  it("does not reveal the named concept in the public title", () => {
    const fork = exercises.find((exercise) => exercise.conceptSlug === "fork")!;
    expect(fork.title.toLowerCase()).not.toContain("fourchette");
  });
});
