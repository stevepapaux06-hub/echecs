import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import {
  coachExplanationFor,
  coachInstructionFor,
  exerciseProvenance,
} from "./coaching-copy";

function spread(values: TrainingExercise[], count: number): TrainingExercise[] {
  if (values.length <= count) return values;
  return Array.from({ length: count }, (_value, index) => values[Math.floor(index * values.length / count)]);
}

function coachSample(): TrainingExercise[] {
  const bank = allConceptExercises();
  return (["strategy", "endgame", "conversion", "defense"] as const)
    .flatMap((domain) => spread(bank
      .filter((exercise) => exercise.category === domain)
      .toSorted((first, second) => (first.difficulty ?? 1300) - (second.difficulty ?? 1300)), 15));
}

describe("human training copy", () => {
  const sample = coachSample();

  it("audits 60 varied non-tactical exercises", () => {
    expect(sample).toHaveLength(60);
    expect(new Set(sample.map((exercise) => exercise.category)))
      .toEqual(new Set(["strategy", "endgame", "conversion", "defense"]));
    expect(new Set(sample.map((exercise) => exercise.pedagogicalUnit === "single_move" ? "single" : "multi")))
      .toEqual(new Set(["single", "multi"]));
  });

  it("renders a short coach explanation instead of the internal causal schema", () => {
    for (const exercise of sample) {
      const copy = coachExplanationFor(exercise);
      expect(copy, exercise.id).not.toBeNull();
      expect(copy!.idea.length, exercise.id).toBeGreaterThan(20);
      expect(copy!.whyItWorks.length, exercise.id).toBeGreaterThanOrEqual(1);
      expect(copy!.whyItWorks.length, exercise.id).toBeLessThanOrEqual(3);
      if (copy!.takeaway) expect(copy!.takeaway.length, exercise.id).toBeGreaterThan(15);
      const visibleText = JSON.stringify(copy);
      expect(visibleText, exercise.id).not.toMatch(/centipions?|\b[+-]\d+[.,]\d+\b|objet JSON|lichess_db_|coups? forcing/i);
    }
  });

  it("does not invent a tempting reflex or generic takeaway from engine ordering", () => {
    const exercise = sample.find((candidate) => candidate.trainingAssessment?.contrast?.naturalMistake)!;
    expect(exercise).toBeDefined();
    const copy = coachExplanationFor(exercise)!;
    expect(copy.temptingReflex).toBeUndefined();
    if (/^quand une position présente le même mécanisme/i.test(exercise.explanation?.transferRule ?? "")) {
      expect(copy.takeaway).toBeUndefined();
    }
  });

  it("applies the same evidence rule to conversion and defense explanations", () => {
    for (const domain of ["conversion", "defense"] as const) {
      const exercise = sample.find((candidate) => candidate.category === domain
        && candidate.trainingAssessment?.contrast?.naturalMistake)!;
      expect(exercise, domain).toBeDefined();
      expect(coachExplanationFor(exercise)?.temptingReflex, domain).toBeUndefined();
    }
  });

  it("uses instructions tied to the real domain and outcome", () => {
    for (const exercise of sample) {
      const instruction = coachInstructionFor(exercise);
      expect(instruction.title.length).toBeGreaterThan(8);
      expect(instruction.prompt.length).toBeGreaterThan(30);
      expect(`${instruction.title} ${instruction.prompt}`).not.toMatch(/coups? forcing/i);
    }
    const draw = sample.find((exercise) => exercise.category === "endgame"
      && (exercise.tablebaseWdl === "draw" || exercise.trainingAssessment?.outcome?.root === "draw"));
    expect(draw).toBeDefined();
    expect(coachInstructionFor(draw!).title).toMatch(/Tiens/);
  });

  it("keeps provenance honest and hides technical corpus names", () => {
    for (const exercise of sample) {
      const provenance = exerciseProvenance(exercise);
      expect(provenance).not.toMatch(/\.pgn|\.zst|lichess_db_|Partie de maître/i);
      expect(provenance).toMatch(/Position issue|Nouvelle position|Partie réelle/);
    }
  });

  it("keeps visual teaching concise and tied to the described route", () => {
    for (const exercise of sample) {
      expect(exercise.planArrows?.length ?? 0, exercise.id).toBeLessThanOrEqual(3);
      expect(exercise.planSquares?.length ?? 0, exercise.id).toBeLessThanOrEqual(3);
      if (exercise.planArrows?.length) {
        const destinations = new Set(exercise.planArrows.map((arrow) => arrow.to));
        const described = JSON.stringify(coachExplanationFor(exercise));
        expect([...destinations].some((square) => described.includes(square)), exercise.id).toBe(true);
      }
    }
  });
});
