import { DEVELOPMENT_REFERENCE_BANK } from "./adjudicated-reference";
import { PILOT_CONCEPT_IDS, type CoverageCell, type FutureHoldoutManifest, type PilotConceptId, type RelationProbe } from "./types";

export type CounterfactualPair = {
  id: string;
  concept_id: PilotConceptId;
  kind: "branch";
  initial_fen: string;
  baseline_reference_id: string;
  comparison_reference_id: string;
  branch_a_uci: string[];
  branch_b_uci: string[];
  causal_variable: string;
  controlled_variables: string[];
  variables_also_changed: string[];
  legality_checked: true;
  plausibility_checked: boolean;
  hidden_tactic_status: "not_detected" | "requires_engine_check";
  confidence: number;
  intended_effect: string;
  limitations: string[];
};

export type NaturalRelationPair = {
  id: string;
  concept_id: PilotConceptId;
  baseline_reference_id: string;
  comparison_reference_id: string;
  relation: "same_game_later_state" | "same_mechanism_different_game";
  variables_also_changed: string[];
  confidence: number;
  limitations: string[];
};

function reference(id: string) {
  const found = DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === id);
  if (!found) throw new Error(`Missing adjudicated reference ${id}`);
  return found;
}

function branchPair(seed: Omit<CounterfactualPair, "initial_fen">): CounterfactualPair {
  const baseline = reference(seed.baseline_reference_id);
  const comparison = reference(seed.comparison_reference_id);
  if (baseline.fen !== comparison.fen) throw new Error(`${seed.id}: branch pair does not share its initial FEN`);
  return { ...seed, initial_fen: baseline.fen };
}

/** Only genuinely same-initial-position branches are called counterfactuals.
 * They are not advertised as perfectly controlled: every extra changed
 * variable and possible hidden tactic is explicit. */
export const COUNTERFACTUAL_PAIRS: readonly CounterfactualPair[] = [
  branchPair({
    id: "counterfactual-outpost-d5-vs-a4",
    concept_id: "outpost",
    kind: "branch",
    baseline_reference_id: "obs-outpost-a-c3d5",
    comparison_reference_id: "obs-outpost-a-c3a4",
    branch_a_uci: ["c3d5"],
    branch_b_uci: ["c3a4"],
    causal_variable: "destination stability and central function",
    controlled_variables: ["initial FEN", "side to move", "moving piece", "material", "pawn structure"],
    variables_also_changed: ["destination square", "immediate attacks", "piece mobility"],
    legality_checked: true,
    plausibility_checked: true,
    hidden_tactic_status: "requires_engine_check",
    confidence: 0.62,
    intended_effect: "Presence of the effective-outpost relation should fall for Na4; pedagogical centrality of Nd5 remains only boundary-level because it also attacks Be3.",
    limitations: ["Not a single-variable causal intervention", "No engine stability check attached", "External concept review required"],
  }),
  branchPair({
    id: "counterfactual-opposition-kd5-vs-kf5",
    concept_id: "opposition",
    kind: "branch",
    baseline_reference_id: "obs-opposition-a-e6d5",
    comparison_reference_id: "obs-opposition-a-e6f5",
    branch_a_uci: ["e6d5"],
    branch_b_uci: ["e6f5"],
    causal_variable: "direct king geometry after the move",
    controlled_variables: ["initial FEN", "side to move", "moving king", "material", "pawn structure"],
    variables_also_changed: ["king destination", "key-square access", "pawn-distance geometry"],
    legality_checked: true,
    plausibility_checked: true,
    hidden_tactic_status: "requires_engine_check",
    confidence: 0.68,
    intended_effect: "Direct-opposition geometry appears after Kd5 and is absent after Kf5; practical method centrality remains unresolved.",
    limitations: ["Geometry flip is verified, game-theoretical consequence is not", "Multi-pawn tempi remain confounders", "External review required"],
  }),
];

/** Natural relations are useful context but never presented as controlled
 * counterfactuals. */
export const NATURAL_RELATION_PAIRS: readonly NaturalRelationPair[] = [
  {
    id: "natural-opposition-reserve-tempo-to-later-king-state",
    concept_id: "opposition",
    baseline_reference_id: "obs-opposition-b-g2h2",
    comparison_reference_id: "obs-opposition-c-e4f4",
    relation: "same_game_later_state",
    variables_also_changed: ["twelve plies", "pawn count", "king squares", "pawn structure", "side objectives"],
    confidence: 0.42,
    limitations: ["Observational pair only", "Cannot isolate opposition from king activity or passed-pawn play"],
  },
  {
    id: "natural-open-file-two-games",
    concept_id: "open_file",
    baseline_reference_id: "obs-open-file-d-a1c1",
    comparison_reference_id: "obs-open-file-e-a1d1",
    relation: "same_mechanism_different_game",
    variables_also_changed: ["game", "players", "file", "structure", "material", "tactical context"],
    confidence: 0.66,
    limitations: ["Supports cross-source mechanism invariance only", "Not a controlled move comparison"],
  },
];

export const RELATION_PROBES: readonly RelationProbe[] = [
  {
    id: "invariance-open-file-contest-cross-source",
    concept_id: "open_file",
    kind: "invariance",
    baseline_reference_id: "obs-open-file-d-a1c1",
    comparison_reference_id: "obs-open-file-e-a1d1",
    variable: "source game and file identity",
    controlled_variables: ["verified pawn-free file", "rook relocation to that file", "contest mechanism"],
    variables_also_changed: ["board structure", "material", "players", "file letter", "reply context"],
    confidence: 0.66,
    limitations: ["Mechanism-level invariance, not outcome invariance", "External review required"],
    expected: { presence: "stable", affordance: "stable", decision_relevance: "stable", pedagogical_priority: "stable" },
    rationale: "Two different natural games preserve the board-level open-file fact and rook-contest mechanism; they do not prove identical practical value.",
  },
  {
    id: "causal-flip-opposition-geometry",
    concept_id: "opposition",
    kind: "causal_flip",
    baseline_reference_id: "obs-opposition-a-e6d5",
    comparison_reference_id: "obs-opposition-a-e6f5",
    variable: "king destination and resulting direct-opposition geometry",
    controlled_variables: ["initial FEN", "side to move", "moving king", "material", "pawn structure"],
    variables_also_changed: ["key-square access", "distance to pawns"],
    confidence: 0.68,
    limitations: ["Tests presence geometry, not tablebase outcome or pedagogical priority"],
    expected: { presence: "down", affordance: "down", decision_relevance: "down", pedagogical_priority: "stable" },
    rationale: "The branch removes the direct geometry, while both branches remain low-priority until the multi-pawn method is externally adjudicated.",
  },
  {
    id: "causal-flip-outpost-stability",
    concept_id: "outpost",
    kind: "causal_flip",
    baseline_reference_id: "obs-outpost-a-c3d5",
    comparison_reference_id: "obs-outpost-a-c3a4",
    variable: "destination stability and central function",
    controlled_variables: ["initial FEN", "side to move", "moving knight", "material", "pawn structure"],
    variables_also_changed: ["immediate targets", "mobility", "king proximity"],
    confidence: 0.62,
    limitations: ["Multiple move consequences change", "No hidden-tactic engine check attached"],
    expected: { presence: "down", affordance: "down", decision_relevance: "down", pedagogical_priority: "down" },
    rationale: "Na4 removes the annotated stable central destination, but this remains a modest-confidence branch probe rather than a clean scientific intervention.",
  },
];

export function buildCoverageMatrix(): CoverageCell[] {
  const cells = new Map<string, CoverageCell>();
  for (const sample of DEVELOPMENT_REFERENCE_BANK) {
    const neighboring = sample.secondary_concepts.toSorted().join("|") || "none";
    const negativeType = sample.label === "positive" ? "positive" : sample.family;
    const dimensions = [
      sample.concept_id,
      sample.mechanism_family,
      sample.structure,
      sample.material_signature,
      sample.side_to_move,
      sample.elo_bucket,
      sample.eval_state,
      sample.decision_comparison.tactical_competition,
      neighboring,
      sample.provenance.source,
      sample.difficulty,
      negativeType,
      sample.agreement_status,
    ];
    const key = dimensions.join("::");
    const existing = cells.get(key);
    if (existing) existing.reference_ids.push(sample.id);
    else cells.set(key, {
      concept_id: sample.concept_id,
      mechanism_family: sample.mechanism_family,
      structure: sample.structure,
      material_signature: sample.material_signature,
      side_to_move: sample.side_to_move,
      elo_bucket: sample.elo_bucket,
      eval_state: sample.eval_state,
      tactical_competition: sample.decision_comparison.tactical_competition,
      neighboring_concept: neighboring,
      source: sample.provenance.source,
      difficulty: sample.difficulty,
      negative_type: negativeType,
      natural_vs_synthetic: "natural",
      agreement_status: sample.agreement_status,
      reference_ids: [sample.id],
    });
  }
  return [...cells.values()].toSorted((a, b) => a.concept_id.localeCompare(b.concept_id)
    || a.mechanism_family.localeCompare(b.mechanism_family)
    || a.negative_type.localeCompare(b.negative_type));
}

export const COVERAGE_MATRIX = buildCoverageMatrix();

export const COVERAGE_GAPS: Record<PilotConceptId, string[]> = {
  outpost: ["clean positive without tactical target", "prevent-enemy mechanism", "verified installed-piece stability", "independent player Elo", "external double annotation"],
  open_file: ["create-entry mechanism", "choice between two files", "open file without useful target", "semi-open contrast", "independent player Elo"],
  improve_worst_piece: ["clean multi-step maneuver", "rook reroute", "bishop activation", "comparative baseline for all pieces", "external plan review"],
  opposition: ["single-pawn theoretical anchor", "distant opposition", "edge/stalemate boundary", "tablebase result for every <=7-piece case", "external method annotation"],
  restrict_counterplay: ["no reliable positive anchor", "resource-removal sequence", "alternative opponent resource", "stable reply tree", "independent annotation"],
  exchange_attacker: ["no clean optional positive anchor", "offer-exchange mechanism", "multiple attackers", "attack-state before/after", "non-forcing defensive decision"],
};

export const SHORTCUT_CHALLENGE_SET = DEVELOPMENT_REFERENCE_BANK.filter((sample) =>
  sample.label !== "positive"
  && (sample.assessment.presence.score >= 0.5
    || sample.family === "constitutive_negative"
    || sample.family === "human_plausible_misconception"
    || sample.family === "tactical_override"));

export const CONCEPT_SATURATION: Record<PilotConceptId, {
  status: "insufficient" | "developing";
  reference_count: number;
  positive_anchor_count: number;
  unresolved_count: number;
  new_error_families_still_appearing: true;
  reason: string;
}> = Object.fromEntries(PILOT_CONCEPT_IDS.map((concept) => {
  const samples = DEVELOPMENT_REFERENCE_BANK.filter((sample) => sample.concept_id === concept);
  const positive = samples.filter((sample) => sample.label === "positive").length;
  const unresolved = samples.filter((sample) => sample.adjudicated_interpretation === "unresolved").length;
  const sufficientForDeveloping = samples.length >= 4 && positive >= 1;
  return [concept, {
    status: sufficientForDeveloping ? "developing" : "insufficient",
    reference_count: samples.length,
    positive_anchor_count: positive,
    unresolved_count: unresolved,
    new_error_families_still_appearing: true,
    reason: sufficientForDeveloping
      ? "Some natural variation is present, but coverage is neither saturated nor independently reviewed."
      : "Too few clean anchors or mechanisms for even provisional breadth.",
  }];
})) as Record<PilotConceptId, {
  status: "insufficient" | "developing";
  reference_count: number;
  positive_anchor_count: number;
  unresolved_count: number;
  new_error_families_still_appearing: true;
  reason: string;
}>;

export const ELO_DISTRIBUTION = Object.fromEntries(
  [...new Set(DEVELOPMENT_REFERENCE_BANK.map((sample) => sample.elo_bucket))]
    .map((bucket) => [bucket, DEVELOPMENT_REFERENCE_BANK.filter((sample) => sample.elo_bucket === bucket).length]),
);

export const FUTURE_HOLDOUT_MANIFEST: FutureHoldoutManifest = {
  version: "1.0.0-pilot",
  status: "manifest_only_no_labels",
  target_concepts: [...PILOT_CONCEPT_IDS],
  target_elo_buckets: ["800-1000", "1000-1200", "1200-1400", "1400-1600", "1600-1800"],
  collection_requirements: [
    "sample games without running ChessPath detectors",
    "record actual public player ratings at game time rather than inferring Elo from puzzle difficulty",
    "stratify phase, structure, material, tactical competition and result",
    "freeze positions before annotation",
  ],
  annotation_requirements: [
    "two annotators using only the versioned concept contract",
    "annotate presence, affordance, relevance and priority separately",
    "permit and explain abstention",
    "expert adjudication blind to Pattern Engine output",
  ],
  exclusion_clusters: [...new Set(DEVELOPMENT_REFERENCE_BANK.flatMap((sample) => [
    sample.clusters.game_cluster,
    ...sample.clusters.player_clusters,
    sample.clusters.position_cluster,
    sample.clusters.structure_cluster,
    sample.clusters.counterfactual_cluster,
  ]))],
  split_strategies: [
    "leave_one_game_out",
    "leave_one_source_out",
    "leave_one_structure_out",
    "leave_one_counterfactual_generator_out",
    "leave_one_player_cluster_out",
  ],
  release_gate: [
    "no Development Reference cluster in the holdout",
    "publish agreement and disagreements by segment",
    "measure calibration and abstention separately",
    "never claim gold before independent review",
  ],
};

export const PILOT_BENCHMARK_METADATA = {
  name: "ChessPath Pilot Concept Development Reference A.1",
  version: "1.1.0-pilot",
  status: "development_reference_internal_review_only_external_review_required",
  concepts: [...PILOT_CONCEPT_IDS],
  referenceCount: DEVELOPMENT_REFERENCE_BANK.length,
  positiveAnchorCount: DEVELOPMENT_REFERENCE_BANK.filter((sample) => sample.label === "positive").length,
  unresolvedCount: DEVELOPMENT_REFERENCE_BANK.filter((sample) => sample.adjudicated_interpretation === "unresolved").length,
  relationProbeCount: RELATION_PROBES.length,
  counterfactualPairCount: COUNTERFACTUAL_PAIRS.length,
  naturalRelationPairCount: NATURAL_RELATION_PAIRS.length,
  syntheticCounterfactualCount: 0,
  coverageCellCount: COVERAGE_MATRIX.length,
  externalReviewRequired: true,
} as const;
