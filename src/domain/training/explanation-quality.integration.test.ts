import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../chess/types";
import { allConceptExercises, pedagogyAuditPairs, TRAINING_BANK_GATE_REPORT } from "./library";
import { assessExplanationQuality } from "./explanation-quality";

function spreadSample(exercises: TrainingExercise[], count: number): TrainingExercise[] {
  if (exercises.length <= count) return exercises;
  return Array.from({ length: count }, (_value, index) => exercises[Math.floor(index * exercises.length / count)]);
}

function stratifiedSample(): TrainingExercise[] {
  const bank = allConceptExercises();
  return (["strategy", "endgame", "conversion", "defense"] as const).flatMap((domain) => {
    const exercises = bank.filter((exercise) => exercise.category === domain)
      .toSorted((first, second) => (first.difficulty ?? 1300) - (second.difficulty ?? 1300) || first.id.localeCompare(second.id));
    const single = exercises.filter((exercise) => exercise.pedagogicalUnit === "single_move");
    const multi = exercises.filter((exercise) => exercise.pedagogicalUnit !== "single_move");
    const selected = [...spreadSample(single, 15), ...spreadSample(multi, 15)];
    return selected.length >= 30 ? selected : spreadSample(exercises, 30);
  });
}

describe("stratified non-tactical explanation audit", () => {
  const sample = stratifiedSample();
  const assessments = sample.map((exercise) => ({ exercise, assessment: assessExplanationQuality(exercise) }));

  it("covers 120 exercises across four domains, units and rating bands", () => {
    expect(sample.length).toBe(120);
    expect(new Set(sample.map((exercise) => exercise.category))).toEqual(new Set(["strategy", "endgame", "conversion", "defense"]));
    expect(new Set(sample.map((exercise) => exercise.pedagogicalUnit === "single_move" ? "single" : "multi"))).toEqual(new Set(["single", "multi"]));
    expect(Math.min(...sample.map((exercise) => exercise.difficulty ?? 1300))).toBeLessThan(1200);
    expect(Math.max(...sample.map((exercise) => exercise.difficulty ?? 1300))).toBeGreaterThan(1600);
  });

  it("contains no hard-negative explanation and passes the content gate", () => {
    const failures = assessments.filter(({ assessment }) => !assessment.passed)
      .map(({ exercise, assessment }) => `${exercise.id}:${assessment.score}:${assessment.reasons.join(",")}`);
    expect(failures, failures.slice(0, 12).join("\n")).toEqual([]);
  });

  it("keeps standard Lichess provenance honest", () => {
    expect(sample.filter((exercise) => exercise.source === "lichess_standard")
      .every((exercise) => !exercise.sourceLabel.includes("Partie de maître"))).toBe(true);
  });

  it("keeps declared defense continuations alive for their second real decision", () => {
    const published = allConceptExercises().filter((exercise) => exercise.category === "defense"
      && exercise.pedagogicalUnit !== "single_move");
    expect(published.length).toBeGreaterThanOrEqual(24);
    expect(published.every((exercise) => (exercise.requiredSteps?.length ?? 0) >= 2
      && (exercise.solutionLine?.filter((_move, index) => index % 2 === 0).length ?? 0) >= 2)).toBe(true);
  });

  it("materially improves the same stratified sample over legacy copy", () => {
    const pairs = pedagogyAuditPairs();
    const byId = new Map(pairs.map((pair) => [pair.after.id, pair]));
    const selected = sample.map((exercise) => byId.get(exercise.id)!);
    const before = selected.map((pair) => assessExplanationQuality(pair.before));
    const after = selected.map((pair) => assessExplanationQuality(pair.after));
    const average = (values: ReturnType<typeof assessExplanationQuality>[]) => Number((values.reduce((sum, value) => sum + value.score, 0) / values.length).toFixed(2));
    const examples = Array.from({ length: 10 }, (_value, index) => selected[Math.floor(index * selected.length / 10)]).map((pair) => ({
      id: pair.after.id, domain: pair.after.category,
      before: pair.before.explanation?.resultingPositionChange ?? pair.before.explanation?.objective,
      after: pair.after.explanation?.stateChange,
    }));
    console.info("PEDAGOGY_AUDIT", JSON.stringify({
      sample: selected.length, beforeAverage: average(before), afterAverage: average(after),
      beforePassed: before.filter((value) => value.passed).length, afterPassed: after.filter((value) => value.passed).length,
      trainingBefore: pairs.length,
      trainingAfter: allConceptExercises().filter((exercise) => !["tactic", "opening"].includes(exercise.category)).length,
      trainingToReference: TRAINING_BANK_GATE_REPORT.explanationTrainingToReference,
      acceptedMovesExpanded: pairs.filter(({ before: first, after: second }) => (second.acceptedConceptMoveUcis?.length ?? 0) > (first.acceptedConceptMoveUcis?.length ?? 0)).length,
      sequenceRepairs: pairs.filter(({ before: first, after: second }) => first.pedagogicalUnit !== second.pedagogicalUnit
        || first.sequenceStopCondition !== second.sequenceStopCondition
        || (first.requiredSteps?.length ?? 0) !== (second.requiredSteps?.length ?? 0)).length,
      provenanceRepairs: pairs.filter(({ before: first, after: second }) => first.sourceLabel !== second.sourceLabel).length,
      difficulty: Object.fromEntries(["easy", "appropriate", "challenging_but_useful", "advanced"].map((level) => [level,
        pairs.filter(({ after: exercise }) => exercise.explanation?.humanDifficulty === level).length])),
      examples,
    }));
    expect(average(after)).toBeGreaterThan(average(before) + 5);
    expect(after.every((assessment) => assessment.passed)).toBe(true);
  });
});
