import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../chess/types";
import { buildExerciseTeaching } from "./explanation";
import { enrichCausalExplanation } from "./causal-explanation";
import { assessExplanationQuality } from "./explanation-quality";

const fen = "2r2rk1/pp3ppp/3p1n2/2p1p3/4P3/2N2N2/PP3PPP/R4RK1 w - - 0 20";
const lines = [
  { uci: "a1d1", playerCp: 35, pv: ["a1d1", "f8e8", "d1d6"] },
  { uci: "a1b1", playerCp: -25, pv: ["a1b1", "f8e8"] },
  { uci: "f1e1", playerCp: -40, pv: ["f1e1", "f8e8"] },
];

function strongExercise(): TrainingExercise {
  const teaching = buildExerciseTeaching(fen, "a1d1", "open_file", lines[0].pv)!;
  return enrichCausalExplanation({
    id: "must-pass-open-file", fen, bestMove: "a1d1", type: "strategy", category: "strategy", domain: "strategy",
    origin: "concept", mode: "one-move", pedagogicalUnit: "single_move", sequenceStopCondition: "first_decision",
    phase: "middlegame", playerColor: "white", conceptSlug: "open_file", theme: "open_file", title: "", prompt: "",
    sourceLabel: "Position testée", source: "chesspath_curated", baselinePlayerCp: 35, maxPlayerMoves: 1,
    concept: "La colonne d donne une case d’entrée contre le pion d6.", difficulty: 1350,
    solutionLine: lines[0].pv, engineCandidates: lines, explanation: teaching.explanation,
    trainingAssessment: {
      version: 2, referenceQuality: "high", exerciseability: true, failedGates: [], reasons: [], signals: ["useful_file"],
      value: { decision_contrast: 2, natural_mistake: 2, transferability: 2, state_change: 2, human_difficulty: 2, mechanism_clarity: 2 },
      score: 12, naturalMistake: "a1b1",
      contrast: { passed: true, reason: "contrasting_human_decisions", plausible: lines.map((line) => line.uci), mechanisms: 3,
        goodMoves: ["a1d1"], naturalMistake: "a1b1", consequence: "mechanism_missed_with_objective_cost" },
    },
  });
}

describe("causal explanation quality gate", () => {
  it("MUST PASS: accepts a precise problem, causal plan and observable change without inventing human naturalness", () => {
    const result = assessExplanationQuality(strongExercise());
    expect(result.hardNegatives).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(16);
  });

  it("MUST FAIL: rejects an unsupported claim that an engine alternative is a natural human reflex", () => {
    const exercise = strongExercise();
    exercise.explanation = {
      ...exercise.explanation!,
      naturalAlternative: "Rb1 (a1–b1) est une alternative humaine naturelle.",
      whyNaturalAlternativeIsInferior: "Rb1 abandonne la case d6 et ne crée aucune cible concrète sur la colonne d.",
      naturalAlternativeEvidence: undefined,
    };
    const result = assessExplanationQuality(exercise);
    expect(result.passed).toBe(false);
    expect(result.hardNegatives).toContain("unsupported_naturalness_claim");
  });

  it("MUST FAIL: rejects the copy-pastable same-mechanism transfer rule", () => {
    const exercise = strongExercise();
    exercise.explanation = {
      ...exercise.explanation!,
      transferRule: "Quand une position présente le même mécanisme, applique le plan indiqué par le concept.",
    };
    const result = assessExplanationQuality(exercise);
    expect(result.passed).toBe(false);
    expect(result.hardNegatives).toContain("generic_transfer_rule");
  });

  it.each([
    ["generic activity", "Ce coup améliore l’activité.", "generic_activity_language"],
    ["generic pressure", "Ce coup met davantage de pression.", "generic_pressure_language"],
  ])("MUST FAIL: rejects %s", (_name, copy, negative) => {
    const exercise = strongExercise();
    exercise.explanation = {
      ...exercise.explanation!, problem: copy, chosenPlan: copy, whyItWorksHere: copy,
      stateChange: copy, resultingPositionChange: copy, objective: copy,
    };
    const result = assessExplanationQuality(exercise);
    expect(result.passed).toBe(false);
    expect(result.hardNegatives).toContain(negative);
  });

  it("MUST FAIL: rejects objective repetition and a fake plan comparison", () => {
    const exercise = strongExercise();
    exercise.explanation = {
      ...exercise.explanation!, objective: "Créer une cible durable en d6.", stateChange: "Créer une cible durable en d6.",
      resultingPositionChange: "Créer une cible durable en d6.",
      candidatePlans: [
        { moveUci: "a1d1", label: "Td1", mechanism: "activité" },
        { moveUci: "a1b1", label: "Tb1", mechanism: "activité" },
      ],
    };
    const result = assessExplanationQuality(exercise);
    expect(result.passed).toBe(false);
    expect(result.hardNegatives).toEqual(expect.arrayContaining(["objective_repetition", "fake_plan_comparison"]));
  });

  it("keeps every same-mechanism engine move acceptable", () => {
    const exercise = strongExercise();
    exercise.trainingAssessment!.contrast!.goodMoves = ["a1d1", "f1d1"];
    exercise.engineCandidates!.push({ uci: "f1d1", playerCp: 30, pv: ["f1d1"] });
    const enriched = enrichCausalExplanation(exercise);
    expect(enriched.explanation?.acceptableMoves).toEqual(expect.arrayContaining(["a1d1", "f1d1"]));
  });
});
