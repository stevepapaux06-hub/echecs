import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "../chess/types";
import { causalPlanFeatures, matchesConceptSpecification } from "../patterns/concept-specifications";
import PILOT from "./pedagogy-pilot.generated.json";
import { enrichCausalExplanation } from "./causal-explanation";
import { withPedagogicalContract } from "./contract";
import { assessExplanationQuality } from "./explanation-quality";
import { refineTrainingLesson } from "./lesson-refinement";

describe("pilot lesson preparation", () => {
  it("keeps every selected conversion tied to a demonstrated mechanism", () => {
    for (const source of PILOT.activeTraining.filter((exercise) => exercise.category === "conversion")) {
      const prepared = enrichCausalExplanation(withPedagogicalContract(refineTrainingLesson(source as TrainingExercise)));
      const feature = causalPlanFeatures(prepared.fen, prepared.solutionLine ?? [prepared.bestMove], prepared.conceptSlug);
      expect(feature && matchesConceptSpecification(prepared.conceptSlug, feature),
        `${prepared.id}:${prepared.conceptSlug}:${feature?.signals.join(",")}`).toBe(true);
      expect(assessExplanationQuality(prepared).hardNegatives, prepared.id).not.toContain("generic_concept_without_mechanism");
    }
  });
});
