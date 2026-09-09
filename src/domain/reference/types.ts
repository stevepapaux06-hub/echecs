import type { GamePhase } from "../chess/types";

/** The pilot is deliberately smaller than the product taxonomy. Extending this
 * union is a reviewed schema change, not something a detector may do at run time. */
export const PILOT_CONCEPT_IDS = [
  "outpost",
  "open_file",
  "improve_worst_piece",
  "opposition",
  "restrict_counterplay",
  "exchange_attacker",
] as const;

export type PilotConceptId = (typeof PILOT_CONCEPT_IDS)[number];
export type AnnotationScope = "position" | "move" | "short_sequence" | "theoretical_state";
export type ConceptObjectType =
  | "static_property"
  | "functional_relation"
  | "plan_intention"
  | "decision_comparison"
  | "theoretical_state"
  | "sequence";

export type AxisAssessment = {
  score: number;
  status: "absent" | "weak" | "present" | "strong" | "unknown";
  rationale: string;
};

export type AbstentionReason =
  | "concept_unknown"
  | "weak_signal"
  | "multiple_concepts_no_dominant"
  | "tactical_override"
  | "unstable_mechanism"
  | "concept_present_but_not_relevant"
  | "relevant_but_not_pedagogically_central"
  | "unsuitable_for_training";

export type Evidence = {
  kind: "board_fact" | "legal_branch" | "human_annotation" | "engine_check" | "tablebase_check";
  claim: string;
  value?: string | number | boolean;
};

export type TypedConceptObject = {
  object_id: string;
  concept_id: PilotConceptId;
  object_type: ConceptObjectType;
  scope: AnnotationScope;
  subject: Record<string, string | number | boolean | string[]>;
  evidence: Evidence[];
  counterevidence: Evidence[];
  uncertainty: string[];
  constitutive_conditions: Record<string, boolean | "unknown">;
  confounders: string[];
};

export type AffordanceAssessment = {
  available: boolean | "unknown";
  mechanism: string;
  access: string;
  target: string | null;
  cost: string;
  stability: "stable" | "reply_dependent" | "unstable" | "unknown";
};

export type DecisionCandidate = {
  move_uci?: string;
  line_uci?: string[];
  human_rationale: string;
  mechanism_realized: string[];
  opponent_resource_prevented: string[];
  concessions: string[];
  state_change: string[];
  critical_reply_stability: "stable" | "uncertain" | "refuted" | "unchecked";
};

export type DecisionComparison = {
  candidates: DecisionCandidate[];
  equivalent_mechanism_moves: string[];
  tactical_competition: "none" | "secondary" | "dominant" | "unknown";
  note: string;
};

export type TrainingSuitability = {
  suitable: boolean | "unknown";
  reasons: string[];
  plausible_human_alternative: boolean | "unknown";
  target_elo: string[];
};

export type ConceptAssessment = {
  presence: AxisAssessment;
  decision_relevance: AxisAssessment;
  pedagogical_priority: AxisAssessment;
  confidence: number;
  abstentions: AbstentionReason[];
};

export type ReferenceFamily =
  | "natural_positive"
  | "constitutive_negative"
  | "affordance_negative"
  | "relevance_negative"
  | "centrality_negative"
  | "neighbor_negative"
  | "tactical_override"
  | "human_plausible_misconception"
  | "engine_disagreement";

export type ReferenceStatus = "development_reference";
export type CounterfactualKind = "natural" | "branch" | "synthetic";
export type AgreementStatus = "annotator_agreement" | "needs_second_review" | "expert_disagreement";

export type ReferenceProvenance = {
  source: "lichess_standard" | "lichess_broadcast" | "existing_regression";
  source_url: string;
  source_game_id: string;
  source_players?: string[];
  position_ply?: number;
  source_record_id: string;
  collection_path: string;
};

export type ClusterMetadata = {
  game_cluster: string;
  player_clusters: string[];
  opening_cluster: string;
  structure_cluster: string;
  position_cluster: string;
  pv_cluster: string;
  counterfactual_cluster: string;
  transformation_cluster: string;
  symmetry_cluster: string;
};

export type DevelopmentReference = {
  id: string;
  status: ReferenceStatus;
  concept_id: PilotConceptId;
  family: ReferenceFamily;
  fen: string;
  phase: GamePhase;
  move_uci?: string;
  line_uci?: string[];
  annotation_scope: AnnotationScope;
  label: "positive" | "negative" | "boundary" | "abstain";
  concept_object: TypedConceptObject;
  affordance: AffordanceAssessment;
  decision_comparison: DecisionComparison;
  assessment: ConceptAssessment;
  training_suitability: TrainingSuitability;
  provenance: ReferenceProvenance;
  clusters: ClusterMetadata;
  mechanism_family: string;
  material_signature: string;
  structure: string;
  side_to_move: "white" | "black";
  elo_bucket: "800-1000" | "1000-1200" | "1200-1400" | "1400-1600" | "1600-1800" | "1800+" | "unknown";
  eval_state: "clearly_winning" | "winning" | "slightly_better" | "equal" | "slightly_worse" | "losing" | "clearly_lost" | "unknown";
  difficulty: "introductory" | "intermediate" | "advanced" | "unknown";
  agreement_status: AgreementStatus;
  notes: string[];
};

export type MechanismFamily = {
  id: string;
  sufficient_conditions: string[];
  expected_affordances: string[];
  failure_modes: string[];
};

export type TransformationPolicy = {
  allowed: string[];
  required_checks: string[];
  forbidden: string[];
};

export type PilotConceptContract = {
  version: "1.0.0-pilot";
  concept_id: PilotConceptId;
  annotation_scope: AnnotationScope[];
  minimal_definition: string;
  object_type: ConceptObjectType;
  mechanism_families: MechanismFamily[];
  constitutive_conditions: string[];
  supporting_evidence: string[];
  disqualifiers: string[];
  confounders: string[];
  neighboring_concepts: string[];
  presence_criteria: string[];
  affordance_criteria: string[];
  decision_relevance_criteria: string[];
  centrality_evidence: string[];
  uncertainty_conditions: string[];
  pedagogical_priority_criteria: string[];
  training_suitability_criteria: string[];
  known_boundary_cases: string[];
  known_expert_disagreement_cases: string[];
  counterfactual_policy: TransformationPolicy;
  invariance_policy: TransformationPolicy;
  causal_flip_policy: TransformationPolicy;
  holdout_policy: {
    development_only: true;
    forbidden_split_leakage: string[];
    future_independent_requirements: string[];
  };
  shortcuts_under_test: string[];
};

export type RelationProbe = {
  id: string;
  concept_id: PilotConceptId;
  kind: "invariance" | "causal_flip";
  baseline_reference_id: string;
  comparison_reference_id: string;
  variable: string;
  expected: {
    presence: "stable" | "up" | "down";
    affordance: "stable" | "up" | "down";
    decision_relevance: "stable" | "up" | "down";
    pedagogical_priority: "stable" | "up" | "down";
  };
  rationale: string;
};

export type CoverageCell = {
  concept_id: PilotConceptId;
  mechanism_family: string;
  structure: string;
  material_signature: string;
  side_to_move: string;
  elo_bucket: string;
  eval_state: string;
  tactical_competition: string;
  neighboring_concept: string;
  source: string;
  difficulty: string;
  negative_type: ReferenceFamily | "positive";
  natural_vs_synthetic: "natural" | "branch" | "synthetic";
  agreement_status: AgreementStatus;
  reference_ids: string[];
};

export type FutureHoldoutManifest = {
  version: "1.0.0-pilot";
  status: "manifest_only_no_labels";
  target_concepts: PilotConceptId[];
  target_elo_buckets: string[];
  collection_requirements: string[];
  annotation_requirements: string[];
  exclusion_clusters: string[];
  split_strategies: string[];
  release_gate: string[];
};
