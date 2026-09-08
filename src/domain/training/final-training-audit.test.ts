import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../chess/types";
import {
  allConceptExercises,
  lessonRefinementAuditPairs,
  TRAINING_BANK_GATE_REPORT,
} from "./library";
import { assessExplanationQuality } from "./explanation-quality";

const DOMAINS = ["strategy", "endgame", "conversion", "defense"] as const;

function spread(values: TrainingExercise[], count: number): TrainingExercise[] {
  if (values.length <= count) return values;
  return Array.from({ length: count }, (_value, index) => values[Math.floor(index * values.length / count)]);
}

function domainSample(domain: typeof DOMAINS[number], count: number): TrainingExercise[] {
  const values = allConceptExercises().filter((exercise) => exercise.category === domain)
    .toSorted((first, second) => (first.difficulty ?? 1300) - (second.difficulty ?? 1300) || first.id.localeCompare(second.id));
  const concepts = [...new Set(values.map((exercise) => exercise.conceptSlug))];
  const rareCoverage = concepts.map((concept) => values.find((exercise) => exercise.conceptSlug === concept)!).filter(Boolean);
  return [...rareCoverage, ...spread(values, count)].filter((exercise, index, selected) => (
    selected.findIndex((candidate) => candidate.id === exercise.id) === index
  )).slice(0, count);
}

function counts(values: string[]): Record<string, number> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
}

describe("final human-facing training audit", () => {
  const bank = allConceptExercises();
  const sample120 = DOMAINS.flatMap((domain) => {
    const values = bank.filter((exercise) => exercise.category === domain)
      .toSorted((first, second) => (first.difficulty ?? 1300) - (second.difficulty ?? 1300));
    return [...spread(values.filter((exercise) => exercise.pedagogicalUnit === "single_move"), 15),
      ...spread(values.filter((exercise) => exercise.pedagogicalUnit !== "single_move"), 15)];
  });
  const review40 = DOMAINS.flatMap((domain) => domainSample(domain, 10));
  const refinements = lessonRefinementAuditPairs();

  it("passes a 120-position stratified QA and emits factual transition metrics", () => {
    const assessments = sample120.map(assessExplanationQuality);
    const transitions = refinements.map(({ before, after }) => `${before.pedagogicalUnit ?? "legacy"}->${after.pedagogicalUnit}`);
    const reclassifications = refinements
      .filter(({ before, after }) => before.conceptSlug !== after.conceptSlug)
      .map(({ before, after }) => `${before.category}/${before.conceptSlug}->${after.conceptSlug}`);
    const hardNegatives = assessments.flatMap((assessment) => assessment.hardNegatives);
    const report = {
      sample: sample120.length,
      conceptAndExplanationPassPercent: Math.round(100 * assessments.filter((assessment) => assessment.passed).length / assessments.length),
      clearMilestonePercent: Math.round(100 * sample120.filter((exercise) => Boolean(exercise.explanation?.milestone)).length / sample120.length),
      credibleAlternativePercent: Math.round(100 * sample120.filter((exercise) => (
        !exercise.explanation?.naturalAlternative || (exercise.explanation.whyNaturalAlternativeIsInferior?.length ?? 0) >= 35
      )).length / sample120.length),
      textLineContradictions: hardNegatives.filter((negative) => ["variant_mismatch", "wrong_piece_continuity", "premature_exchange_claim"].includes(negative)).length,
      unitTransitions: counts(transitions),
      reclassified: counts(reclassifications),
      trainingToReference: TRAINING_BANK_GATE_REPORT.explanationTrainingToReference + 3,
      difficulty: counts(bank.filter((exercise) => !["tactic", "opening"].includes(exercise.category))
        .map((exercise) => exercise.explanation?.humanDifficulty ?? "unknown")),
    };
    console.info("FINAL_TRAINING_QA", JSON.stringify(report));
    expect(sample120).toHaveLength(120);
    expect(report.conceptAndExplanationPassPercent).toBe(100);
    expect(report.textLineContradictions).toBe(0);
  });

  it("emits 40 distinct lessons for manual reading", () => {
    console.info("MANUAL_REVIEW_40", JSON.stringify(review40.map((exercise) => ({
      id: exercise.id,
      domain: exercise.category,
      concept: exercise.conceptSlug,
      unit: exercise.pedagogicalUnit,
      decisions: exercise.maxPlayerMoves,
      problem: exercise.explanation?.problem,
      alternative: exercise.explanation?.whyNaturalAlternativeIsInferior,
      milestone: exercise.explanation?.milestone,
      visuals: {
        arrows: exercise.planArrows,
        squares: exercise.planSquares,
      },
    }))));
    expect(review40).toHaveLength(40);
    expect(new Set(review40.map((exercise) => exercise.id)).size).toBe(40);
    expect(review40.every((exercise) => assessExplanationQuality(exercise).passed)).toBe(true);
  });
});
