import type {
  DiagnosticCategory,
  GamePhase,
  TrainingExercise,
} from "../chess/types";
import { normalizeConceptSlug, type ConceptSlug } from "../knowledge/concepts";

export type TrainingTaxonomy = {
  phase: GamePhase;
  domain: DiagnosticCategory;
  primaryConcept: string;
  secondaryConcepts: ConceptSlug[];
  confidence: number;
};

export function trainingTaxonomy(exercise: TrainingExercise): TrainingTaxonomy {
  const primaryConcept = normalizeConceptSlug(exercise.primaryConcept ?? exercise.conceptSlug);
  const secondaryConcepts = [...new Set(
    exercise.secondaryConcepts
      ?? exercise.secondaryConceptSlugs
      ?? (exercise.secondaryConceptSlug ? [exercise.secondaryConceptSlug] : []),
  )].filter((concept) => concept !== primaryConcept);
  const requestedDomain = exercise.domain ?? exercise.category;
  const impossibleEndgameLabel = requestedDomain === "endgame" && exercise.phase !== "endgame";
  const impossibleOpeningLabel = requestedDomain === "opening" && exercise.phase !== "opening";
  const domain = impossibleEndgameLabel ? "strategy" : requestedDomain;
  const baseConfidence = exercise.classificationConfidence ?? (exercise.isVerified ? 0.9 : 0.75);
  return {
    phase: exercise.phase,
    domain,
    primaryConcept,
    secondaryConcepts,
    confidence: impossibleEndgameLabel || impossibleOpeningLabel
      ? Math.min(baseConfidence, 0.55)
      : baseConfidence,
  };
}

export function withTrainingTaxonomy<T extends TrainingExercise>(exercise: T): T {
  const taxonomy = trainingTaxonomy(exercise);
  return {
    ...exercise,
    category: taxonomy.domain,
    domain: taxonomy.domain,
    conceptSlug: taxonomy.primaryConcept,
    primaryConcept: taxonomy.primaryConcept,
    secondaryConceptSlugs: taxonomy.secondaryConcepts,
    secondaryConcepts: taxonomy.secondaryConcepts,
    classificationConfidence: taxonomy.confidence,
  };
}
