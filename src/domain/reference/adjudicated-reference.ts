import { Chess } from "chess.js";
import { semanticBoardErrors } from "./board-truth";
import { REFERENCE_SOURCE_BY_KEY } from "./source-catalog";
import type {
  AbstentionReason,
  AffordanceAssessment,
  AxisAssessment,
  ConceptAssessment,
  DevelopmentReference,
  Evidence,
  PilotConceptId,
  ReferenceFamily,
} from "./types";

type ReferenceSeed = {
  id: string;
  conceptId: PilotConceptId;
  family: ReferenceFamily;
  sourceKey: string;
  move?: string;
  line?: string[];
  label: DevelopmentReference["label"];
  mechanismFamily: string;
  subject: DevelopmentReference["concept_object"]["subject"];
  constitutiveConditions: DevelopmentReference["concept_object"]["constitutive_conditions"];
  objectEvidence: Evidence[];
  counterevidence: Evidence[];
  objectUncertainty: string[];
  confounders: string[];
  affordance: AffordanceAssessment;
  assessment: ConceptAssessment;
  interpretations: DevelopmentReference["candidate_interpretations"];
  adjudicated: DevelopmentReference["adjudicated_interpretation"];
  secondaryConcepts: string[];
  unresolved?: string;
  claims: DevelopmentReference["semantic_claims"];
  tacticalCompetition: DevelopmentReference["decision_comparison"]["tactical_competition"];
  decisionNote: string;
  stateChange: string[];
  limitations: string[];
};

const board = (claim: string, value?: string | number | boolean): Evidence => ({ kind: "board_fact", claim, value });
const human = (claim: string): Evidence => ({ kind: "human_annotation", claim });

function axis(
  score: number,
  status: AxisAssessment["status"],
  rationale: string,
  evidence: Evidence[],
  uncertainty: string[] = [],
): AxisAssessment {
  return { score, status, rationale, evidence, uncertainty };
}

function assessed(
  presence: AxisAssessment,
  decisionRelevance: AxisAssessment,
  pedagogicalPriority: AxisAssessment,
  confidence: number,
  abstentions: AbstentionReason[] = [],
): ConceptAssessment {
  return { presence, decision_relevance: decisionRelevance, pedagogical_priority: pedagogicalPriority, confidence, abstentions };
}

function materialSignature(fen: string): string {
  const counts = new Map<string, number>();
  for (const token of fen.split(" ")[0].replace(/[1-8/]/g, "")) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([piece, count]) => `${piece}${count}`).join("");
}

function provisionalGates(reference: DevelopmentReference): DevelopmentReference["quality_gates"] {
  const boardErrors = semanticBoardErrors(reference);
  const presenceResolved = reference.assessment.presence.status !== "unknown";
  const affordanceResolved = reference.affordance.available !== "unknown";
  const decisionResolved = reference.assessment.decision_relevance.status !== "unknown";
  const centralityResolved = reference.assessment.pedagogical_priority.status !== "unknown";
  const uncertaintyExplicit = reference.assessment.abstentions.length > 0
    || [reference.assessment.presence, reference.assessment.decision_relevance, reference.assessment.pedagogical_priority]
      .every((item) => item.status !== "unknown" || item.uncertainty.length > 0);
  return [
    { gate: "board_truth", status: boardErrors.length ? "unresolved" : "pass", rationale: boardErrors.length ? `Board errors: ${boardErrors.join(", ")}` : "FEN, pièces, cases et ligne UCI vérifiées par chess.js et les assertions sémantiques." },
    { gate: "concept_presence_truth", status: presenceResolved ? "pass" : "unresolved", rationale: reference.assessment.presence.rationale },
    { gate: "affordance_truth", status: affordanceResolved ? "pass" : "unresolved", rationale: `${reference.affordance.mechanism}: ${reference.affordance.access}` },
    { gate: "decision_truth", status: decisionResolved ? "pass" : "unresolved", rationale: reference.assessment.decision_relevance.rationale },
    { gate: "centrality_truth", status: centralityResolved ? "pass" : "unresolved", rationale: reference.assessment.pedagogical_priority.rationale },
    { gate: "provenance", status: reference.provenance.source_url.startsWith("https://lichess.org/") ? "pass" : "unresolved", rationale: `Source ${reference.provenance.source_record_id} et partie ${reference.provenance.source_game_id}.` },
    { gate: "contradiction", status: "pass", rationale: `Observation unique ${reference.observation_key}; les interprétations concurrentes sont regroupées.` },
    { gate: "uncertainty", status: uncertaintyExplicit ? "pass" : "unresolved", rationale: uncertaintyExplicit ? "Toute incertitude est reliée à une abstention ou explicitée sur l’axe concerné." : "Incertitude insuffisamment documentée." },
  ];
}

function makeReference(seed: ReferenceSeed): DevelopmentReference {
  const source = REFERENCE_SOURCE_BY_KEY.get(seed.sourceKey);
  if (!source) throw new Error(`Unknown reference source ${seed.sourceKey}`);
  const firstMove = seed.move ?? seed.line?.[0];
  const scope = seed.line && seed.line.length > 1 ? "short_sequence" : firstMove ? "move" : seed.conceptId === "opposition" ? "theoretical_state" : "position";
  const observationKey = [seed.conceptId, source.fen.split(" ").slice(0, 4).join(" "), firstMove ?? scope].join("|");
  const reference: DevelopmentReference = {
    id: seed.id,
    observation_key: observationKey,
    status: "development_reference",
    concept_id: seed.conceptId,
    family: seed.family,
    fen: source.fen,
    phase: source.phase,
    move_uci: firstMove,
    line_uci: seed.line,
    annotation_scope: scope,
    label: seed.label,
    concept_object: {
      object_id: `${seed.id}-object`,
      concept_id: seed.conceptId,
      object_type: seed.conceptId === "open_file" ? "static_property"
        : seed.conceptId === "outpost" ? "functional_relation"
          : seed.conceptId === "opposition" ? "theoretical_state"
            : seed.conceptId === "exchange_attacker" ? "decision_comparison" : "plan_intention",
      scope,
      subject: seed.subject,
      evidence: seed.objectEvidence,
      counterevidence: seed.counterevidence,
      uncertainty: seed.objectUncertainty,
      constitutive_conditions: seed.constitutiveConditions,
      confounders: seed.confounders,
    },
    affordance: seed.affordance,
    decision_comparison: {
      candidates: firstMove ? [{
        move_uci: firstMove,
        line_uci: seed.line,
        human_rationale: seed.assessment.decision_relevance.rationale,
        mechanism_realized: seed.assessment.decision_relevance.score >= 0.6 ? [seed.mechanismFamily] : [],
        opponent_resource_prevented: seed.conceptId === "restrict_counterplay" ? [String(seed.subject.opponent_resource ?? "unresolved")] : [],
        concessions: seed.counterevidence.map((item) => item.claim),
        state_change: seed.stateChange,
        critical_reply_stability: seed.unresolved ? "uncertain" : seed.tacticalCompetition === "dominant" ? "refuted" : "unchecked",
      }] : [],
      equivalent_mechanism_moves: [],
      tactical_competition: seed.tacticalCompetition,
      note: seed.decisionNote,
    },
    assessment: seed.assessment,
    training_suitability: {
      suitable: false,
      reasons: ["Development Reference A.1 : aucune publication Training dans ce Work.", ...seed.limitations],
      plausible_human_alternative: seed.interpretations.length > 1,
      target_elo: ["unknown"],
    },
    provenance: {
      source: source.source,
      source_url: source.sourceUrl,
      source_game_id: source.gameId,
      source_players: [...source.players],
      position_ply: source.ply,
      source_record_id: source.sourceRecordId,
      collection_path: "existing_natural_source_corpus; detector-influenced discovery; internal A.1 reannotation",
    },
    clusters: {
      game_cluster: `game:${source.gameId}`,
      player_clusters: source.players.filter((player) => player !== "unknown").map((player) => `player:${player.toLowerCase()}`),
      opening_cluster: source.phase === "endgame" ? "opening:not-applicable" : "opening:unknown",
      structure_cluster: `structure:${source.structure}`,
      position_cluster: `position:${source.gameId}:${Math.floor(source.ply / 6)}`,
      pv_cluster: seed.line ? `pv:${source.gameId}:${seed.line.join("-")}` : "pv:none",
      counterfactual_cluster: `counterfactual:${seed.conceptId}:${source.gameId}:${source.ply}`,
      transformation_cluster: "transformation:none",
      symmetry_cluster: `symmetry:${source.gameId}:${source.ply}`,
    },
    mechanism_family: seed.mechanismFamily,
    material_signature: materialSignature(source.fen),
    structure: source.structure,
    side_to_move: source.fen.split(" ")[1] === "w" ? "white" : "black",
    // Training difficulty is not player Elo. The corpus does not preserve a
    // reliable player-rating field for these records, so A.1 abstains.
    elo_bucket: "unknown",
    eval_state: "unknown",
    difficulty: "unknown",
    agreement_status: seed.unresolved ? "expert_disagreement" : "needs_second_review",
    candidate_interpretations: seed.interpretations,
    adjudicated_interpretation: seed.adjudicated,
    secondary_concepts: seed.secondaryConcepts,
    unresolved_disagreement: seed.unresolved,
    internal_second_review: {
      completed: true,
      reviewer: "same_work_internal_review",
      notes: ["Réexamen A.1 interne ; aucune indépendance humaine revendiquée.", ...seed.limitations],
    },
    external_review_required: true,
    semantic_claims: seed.claims,
    quality_gates: [],
    notes: ["DEVELOPMENT REFERENCE seulement.", ...seed.limitations],
  };
  reference.quality_gates = provisionalGates(reference);
  return reference;
}

const REFERENCES: ReferenceSeed[] = [
  {
    id: "obs-outpost-d-f5e3-d5", conceptId: "outpost", family: "natural_positive", sourceKey: "outpost-d",
    line: ["f5e3", "a5c6", "e3d5"], label: "positive", mechanismFamily: "install",
    subject: { piece: "white knight f5", route: ["f5", "e3", "d5"], outpost_square: "d5" },
    constitutiveConditions: { stable_square: true, reachable: true, installed_after_sequence: true, useful_role: true },
    objectEvidence: [board("White knight starts on f5"), board("Legal route f5-e3-d5"), human("The route installs the knight on d5 rather than treating any advanced knight as an outpost.")],
    counterevidence: [human("The queen and king exposure make tactical competition non-trivial.")],
    objectUncertainty: ["External reviewer must confirm that the tactical benefits do not dominate the positional mechanism."], confounders: ["king safety", "queen activity"],
    affordance: { available: true, mechanism: "reachable installed outpost", access: "two-move knight route verified legal in the source line", target: "d5 influence and central restriction", cost: "two tempi", stability: "reply_dependent" },
    assessment: assessed(
      axis(0.9, "strong", "d5 is reached by the same knight through a legal route and is the declared positional destination.", [board("Final route square d5")], ["Pawn-chase value still requires external chess review."]),
      axis(0.78, "present", "The sequence is organized around reaching d5, so the outpost mechanism materially shapes the plan.", [board("f5-e3-a5c6-e3d5 is legal")], ["Other sound moves may realize different plans."]),
      axis(0.64, "present", "Outpost is teachable here, but king safety and tactics lower its pedagogical dominance.", [human("Central square is the sequence milestone")], ["External centrality review required."]),
      0.76,
    ),
    interpretations: [{ concept_id: "outpost", rationale: "Knight route culminates on a stable central square.", confidence: 0.76 }, { concept_id: "improve_worst_piece", rationale: "The same route also improves the knight.", confidence: 0.48 }],
    adjudicated: "outpost", secondaryConcepts: ["improve_worst_piece"], claims: { subject_piece: { square: "f5", type: "n", color: "white" }, outpost_square: "d5", target_squares: ["d5"] },
    tacticalCompetition: "secondary", decisionNote: "The complete maneuver, not only its first MultiPV move, is the unit of analysis.", stateChange: ["knight installed on d5 after the legal sequence"], limitations: ["Detector-influenced source discovery", "No independent annotator yet"],
  },
  {
    id: "obs-outpost-a-c3d5", conceptId: "outpost", family: "centrality_negative", sourceKey: "outpost-a", move: "c3d5", label: "boundary", mechanismFamily: "install",
    subject: { piece: "white knight c3", outpost_square: "d5", immediate_target: "e3" }, constitutiveConditions: { stable_square: true, reachable: true, installed_after_sequence: true, useful_role: true },
    objectEvidence: [board("White pawn e4 supports d5"), board("No black c/e pawn is available to chase from the current structure"), board("Nd5 attacks bishop e3 immediately")], counterevidence: [], objectUncertainty: ["Immediate tactical gain may be the main reason for Nd5."], confounders: ["attack on bishop e3"],
    affordance: { available: true, mechanism: "installed supported outpost", access: "Nc3-d5 is legal in one move", target: "bishop e3", cost: "one tempo", stability: "reply_dependent" },
    assessment: assessed(
      axis(0.94, "strong", "The knight can legally occupy supported d5 and cannot be chased by an extant adjacent black pawn.", [board("e4 supports d5"), board("black c/e pawns absent")]),
      axis(0.82, "strong", "Nd5 changes the decision because it combines a stable square with an immediate attack on Be3.", [board("Knight on d5 attacks e3")]),
      axis(0.35, "weak", "The immediate attack on Be3 competes strongly with the positional outpost lesson.", [board("Be3 is attacked after Nd5")], ["External reviewer must adjudicate tactical versus positional centrality."]),
      0.83, ["relevant_but_not_pedagogically_central", "unsuitable_for_training"],
    ),
    interpretations: [{ concept_id: "outpost", rationale: "Supported, non-chaseable d5 square.", confidence: 0.83 }, { concept_id: "forcing_moves", rationale: "Nd5 attacks Be3 immediately.", confidence: 0.72 }], adjudicated: "outpost", secondaryConcepts: ["forcing_moves"], claims: { subject_piece: { square: "c3", type: "n", color: "white" }, destination_square: "d5", outpost_square: "d5", target_squares: ["e3"] }, tacticalCompetition: "secondary", decisionNote: "Unified observation replaces three contradictory Work A rows.", stateChange: ["knight occupies d5", "bishop e3 attacked"], limitations: ["Not suitable as a pure outpost exercise"],
  },
  {
    id: "obs-outpost-a-c3a4", conceptId: "outpost", family: "constitutive_negative", sourceKey: "outpost-a", move: "c3a4", label: "negative", mechanismFamily: "install",
    subject: { piece: "white knight c3", candidate_square: "a4" }, constitutiveConditions: { stable_square: "unknown", reachable: true, installed_after_sequence: true, useful_role: false },
    objectEvidence: [board("Nc3-a4 is legal"), human("a4 has no documented durable target or restricting role")], counterevidence: [human("Advanced placement alone is not an effective outpost.")], objectUncertainty: ["Longer-term route from a4 is not analyzed."], confounders: ["advanced knight visual cue"],
    affordance: { available: false, mechanism: "advanced square without established role", access: "one legal move", target: null, cost: "one tempo", stability: "unknown" },
    assessment: assessed(axis(0.18, "weak", "The knight reaches a4, but the effective-outpost conditions are not established.", [board("destination a4")]), axis(0.12, "weak", "No decision-changing target or restriction has been identified.", [human("No target recorded")]), axis(0.05, "absent", "This is an anti-shortcut case, not an outpost lesson.", [human("advanced_knight ≠ outpost")]), 0.78, ["weak_signal", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "outpost", rationale: "Superficial advanced-knight cue only.", confidence: 0.18 }], adjudicated: "outpost", secondaryConcepts: [], claims: { subject_piece: { square: "c3", type: "n", color: "white" }, destination_square: "a4", outpost_square: "a4" }, tacticalCompetition: "none", decisionNote: "Constitutive negative from the same natural FEN as the positive boundary case.", stateChange: ["knight moves to a4 without established function"], limitations: ["Absence of long-term function is internally reviewed, not independently adjudicated"],
  },
  {
    id: "obs-outpost-b-c3d5", conceptId: "outpost", family: "engine_disagreement", sourceKey: "outpost-b", move: "c3d5", label: "abstain", mechanismFamily: "install",
    subject: { piece: "white knight c3", outpost_square: "d5" }, constitutiveConditions: { stable_square: true, reachable: true, installed_after_sequence: true, useful_role: "unknown" }, objectEvidence: [board("Nc3-d5 is legal"), board("White e4 pawn supports d5")], counterevidence: [human("Black queen/king context and tactical continuations are not adjudicated.")], objectUncertainty: ["Target b6 from Work A was factually wrong; b6 is empty."], confounders: ["queen activity", "king safety"],
    affordance: { available: "unknown", mechanism: "supported outpost candidate", access: "one legal move", target: null, cost: "one tempo", stability: "unknown" },
    assessment: assessed(axis(0.76, "present", "Supported d5 gives a real outpost candidate, but effective role remains unresolved.", [board("e4 pawn supports d5")], ["No verified target after arrival."]), axis(0.5, "unknown", "The move is plausible, but its causal importance versus tactics is unadjudicated.", [board("Nc3-d5 legal")], ["No independent decision comparison."]), axis(0.2, "weak", "The position must abstain until the role and tactical competition are externally reviewed.", [human("Wrong legacy target removed")], ["External review required."]), 0.54, ["unstable_mechanism", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "outpost", rationale: "Supported d5 candidate.", confidence: 0.54 }, { concept_id: "concept_unknown", rationale: "No causal role established.", confidence: 0.46 }], adjudicated: "unresolved", secondaryConcepts: [], unresolved: "Presence candidate is credible; decision relevance and centrality are not established.", claims: { subject_piece: { square: "c3", type: "n", color: "white" }, destination_square: "d5", outpost_square: "d5" }, tacticalCompetition: "unknown", decisionNote: "No engine rank is allowed to choose the semantic label.", stateChange: ["knight reaches supported d5"], limitations: ["External adjudication required"],
  },
  {
    id: "obs-open-file-d-a1c1", conceptId: "open_file", family: "natural_positive", sourceKey: "file-d", move: "a1c1", label: "positive", mechanismFamily: "contest",
    subject: { piece: "white rook a1", file: "c", opposing_rook: "c8" }, constitutiveConditions: { no_pawn_on_file: true, heavy_piece_access: true, entry_or_target: true, useful_role: true }, objectEvidence: [board("No pawn occupies the c-file"), board("Black rook occupies c8"), board("Ra1-c1 is legal")], counterevidence: [], objectUncertainty: ["Objective comparison with other plans remains external-review work."], confounders: [],
    affordance: { available: true, mechanism: "contest an open file", access: "rook reaches c1 directly", target: "black rook c8 / c-file control", cost: "one tempo", stability: "reply_dependent" },
    assessment: assessed(axis(0.98, "strong", "The c-file contains no pawn and both rooks can contest it.", [board("c-file pawn count = 0")]), axis(0.84, "strong", "Ra1-c1 directly changes control of the open file against Rc8.", [board("Ra1-c1 legal; black rook c8")]), axis(0.76, "present", "The file contest is a concrete, human-readable plan rather than a decorative rook move.", [human("file, rook and opposing heavy piece all identified")], ["External comparison with tactical alternatives required."]), 0.86),
    interpretations: [{ concept_id: "open_file", rationale: "Direct contest of a truly pawnless c-file.", confidence: 0.86 }, { concept_id: "rook_activity", rationale: "Rook activity is a secondary consequence.", confidence: 0.55 }], adjudicated: "open_file", secondaryConcepts: ["rook_activity"], claims: { subject_piece: { square: "a1", type: "r", color: "white" }, destination_square: "c1", open_file: "c", target_squares: ["c8"] }, tacticalCompetition: "none", decisionNote: "True open-file anchor replacing the two false Work A positives.", stateChange: ["white rook contests c-file"], limitations: ["Source surfaced by an existing candidate pipeline"],
  },
  {
    id: "obs-open-file-e-a1d1", conceptId: "open_file", family: "natural_positive", sourceKey: "file-e", move: "a1d1", label: "positive", mechanismFamily: "contest",
    subject: { piece: "white rook a1", file: "d", opposing_rook: "d8" }, constitutiveConditions: { no_pawn_on_file: true, heavy_piece_access: true, entry_or_target: true, useful_role: true }, objectEvidence: [board("No pawn occupies the d-file"), board("Black rook occupies d8"), board("Ra1-d1 is legal")], counterevidence: [], objectUncertainty: ["White king safety and the c4 bishop require external centrality review."], confounders: ["king safety"],
    affordance: { available: true, mechanism: "contest an open file", access: "rook reaches d1 directly", target: "black rook d8 / d-file control", cost: "one tempo", stability: "reply_dependent" },
    assessment: assessed(axis(0.98, "strong", "The d-file is objectively pawnless.", [board("d-file pawn count = 0")]), axis(0.82, "strong", "Ra1-d1 contests the rook already on d8.", [board("opposing rook d8")]), axis(0.68, "present", "The mechanism is central enough for a reference anchor, with king-safety uncertainty recorded.", [human("direct file contest")], ["External review of competing tactics."]), 0.82),
    interpretations: [{ concept_id: "open_file", rationale: "Direct contest of pawnless d-file.", confidence: 0.82 }, { concept_id: "rook_activity", rationale: "General activity is secondary.", confidence: 0.5 }], adjudicated: "open_file", secondaryConcepts: ["rook_activity"], claims: { subject_piece: { square: "a1", type: "r", color: "white" }, destination_square: "d1", open_file: "d", target_squares: ["d8"] }, tacticalCompetition: "secondary", decisionNote: "Same mechanism family as the c-file anchor; not falsely called invariance yet.", stateChange: ["white rook contests d-file"], limitations: ["No independent annotator"],
  },
  {
    id: "obs-open-file-a-c2d2", conceptId: "open_file", family: "constitutive_negative", sourceKey: "file-a", move: "c2d2", label: "negative", mechanismFamily: "occupy",
    subject: { piece: "white rook c2", claimed_file: "d", blocking_pawn: "d5" }, constitutiveConditions: { no_pawn_on_file: false, heavy_piece_access: true, entry_or_target: true, useful_role: true }, objectEvidence: [board("Black pawn occupies d5"), board("Rc2-d2 is legal")], counterevidence: [human("This may be semi-open-file pressure or attack on Nd4, but it is not open_file_exists.")], objectUncertainty: [], confounders: ["semi-open file", "attack on knight d4"],
    affordance: { available: false, mechanism: "true open-file occupation", access: "rook reaches d2", target: "knight d4", cost: "one tempo", stability: "stable" },
    assessment: assessed(axis(0.02, "absent", "A black pawn remains on d5, so the d-file is not open by contract.", [board("d5 = black pawn")]), axis(0.12, "weak", "The rook move may have another purpose, but open_file cannot explain it.", [board("Rc2-d2 legal")]), axis(0.01, "absent", "This is a factual hard negative for the open-file detector.", [human("open_file false despite rook-to-file cue")]), 0.99, ["unsuitable_for_training"]),
    interpretations: [{ concept_id: "open_file", rationale: "Rejected: d-file contains a pawn.", confidence: 0.02 }, { concept_id: "weak_pawn", rationale: "Pressure on d5 may be a neighboring story.", confidence: 0.48 }], adjudicated: "open_file", secondaryConcepts: ["weak_pawn"], claims: { subject_piece: { square: "c2", type: "r", color: "white" }, destination_square: "d2", target_squares: ["d4", "d5"] }, tacticalCompetition: "secondary", decisionNote: "Relabeled from false positive to constitutive negative after board inspection.", stateChange: ["rook reaches d2 on a non-open file"], limitations: ["Neighbor concept not adjudicated"],
  },
  {
    id: "obs-open-file-b-a1d1", conceptId: "open_file", family: "constitutive_negative", sourceKey: "file-b", move: "a1d1", label: "negative", mechanismFamily: "contest",
    subject: { piece: "white rook a1", claimed_file: "d", blocking_pawn: "d7" }, constitutiveConditions: { no_pawn_on_file: false, heavy_piece_access: true, entry_or_target: "unknown", useful_role: "unknown" }, objectEvidence: [board("Black pawn occupies d7"), board("Ra1-d1 is legal")], counterevidence: [human("The rook cue is insufficient because the file is not open.")], objectUncertainty: ["The move may still exploit a semi-open file."], confounders: ["semi-open file"],
    affordance: { available: false, mechanism: "true open-file contest", access: "rook reaches d1", target: "d7 pawn rather than an open lane", cost: "one tempo", stability: "stable" },
    assessment: assessed(axis(0.02, "absent", "The d7 pawn falsifies open_file_exists.", [board("d7 = black pawn")]), axis(0.1, "weak", "Any relevance is to pressure on a semi-open file, not the pilot concept as defined.", [human("contract requires pawnless file")]), axis(0.01, "absent", "Hard negative against rook + file-name shortcut.", [human("rook move does not override board truth")]), 0.99, ["unsuitable_for_training"]),
    interpretations: [{ concept_id: "open_file", rationale: "Rejected at presence layer.", confidence: 0.02 }, { concept_id: "weak_pawn", rationale: "d7 may be a target.", confidence: 0.4 }], adjudicated: "open_file", secondaryConcepts: ["weak_pawn"], claims: { subject_piece: { square: "a1", type: "r", color: "white" }, destination_square: "d1", target_squares: ["d7"] }, tacticalCompetition: "none", decisionNote: "All duplicate Work A interpretations collapse into this single negative observation.", stateChange: ["rook reaches d1 while d7 pawn remains"], limitations: ["Semi-open-file relevance outside this pilot contract"],
  },
  {
    id: "obs-worst-b-a3c4", conceptId: "improve_worst_piece", family: "natural_positive", sourceKey: "worst-b", move: "a3c4", label: "positive", mechanismFamily: "activate_minor",
    subject: { piece: "white knight a3", current_role: "rim knight", destination: "c4", destination_function: "central access" }, constitutiveConditions: { comparative_worst_piece: true, realistic_route: true, functional_destination: true, no_dominant_urgency: "unknown" }, objectEvidence: [board("White knight starts a3"), board("Na3-c4 legal"), human("c4 returns the rim knight toward central squares")], counterevidence: [human("External review must compare rook and king urgency.")], objectUncertainty: ["Comparative contribution is an internal chess judgment, not engine-labelled."], confounders: ["general piece activity"],
    affordance: { available: true, mechanism: "activate minor piece", access: "one-move reroute a3-c4", target: "central squares d6/e5/b6", cost: "one tempo", stability: "reply_dependent" },
    assessment: assessed(axis(0.82, "strong", "The knight on a3 is visibly the least integrated white piece and c4 restores central access.", [board("knight a3; legal c4")], ["Other pieces' defensive roles require external review."]), axis(0.72, "present", "Na3-c4 directly realizes the redéployment rather than gaining material.", [human("route and destination function identified")], ["Response stability not engine-adjudicated."]), axis(0.62, "present", "This is a defensible pilot anchor, though broader piece_activity remains a close neighbor.", [human("specific worst-piece comparison")], ["External centrality review required."]), 0.72),
    interpretations: [{ concept_id: "improve_worst_piece", rationale: "Rim knight receives a useful central route.", confidence: 0.72 }, { concept_id: "piece_activity", rationale: "Activity gain is the observable consequence.", confidence: 0.58 }], adjudicated: "improve_worst_piece", secondaryConcepts: ["piece_activity"], claims: { subject_piece: { square: "a3", type: "n", color: "white" }, destination_square: "c4", target_squares: ["d6", "e5", "b6"] }, tacticalCompetition: "none", decisionNote: "The comparison is against the knight's current role, not a low-mobility scalar alone.", stateChange: ["knight leaves rim and gains central routes"], limitations: ["Needs external comparative-piece review"],
  },
  {
    id: "obs-worst-a-e2c3", conceptId: "improve_worst_piece", family: "centrality_negative", sourceKey: "worst-a", move: "e2c3", label: "boundary", mechanismFamily: "activate_minor",
    subject: { piece: "white knight e2", destination: "c3", tactical_effects: ["attacks b5", "attacks d5"] }, constitutiveConditions: { comparative_worst_piece: "unknown", realistic_route: true, functional_destination: true, no_dominant_urgency: "unknown" }, objectEvidence: [board("White knight e2 exists"), board("Ne2-c3 legal"), board("Knight c3 attacks b5 and d5")], counterevidence: [human("Immediate tactical pressure contaminates a pure worst-piece lesson.")], objectUncertainty: ["The knight's comparative contribution was not established against every other white piece."], confounders: ["immediate attacks"],
    affordance: { available: true, mechanism: "activate minor piece", access: "one move", target: "b5 and d5", cost: "one tempo", stability: "reply_dependent" },
    assessment: assessed(axis(0.58, "present", "The knight improves, but 'worst' is not fully established.", [board("e2-c3 legal")], ["Comparative piece audit incomplete."]), axis(0.72, "present", "Ne2-c3 clearly changes the knight's role.", [board("new attacks from c3")]), axis(0.28, "weak", "Immediate targets may explain the move better than the general worst-piece principle.", [board("c3 attacks b5/d5")], ["Tactical centrality unresolved."]), 0.61, ["relevant_but_not_pedagogically_central", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "improve_worst_piece", rationale: "Knight role improves.", confidence: 0.61 }, { concept_id: "forcing_moves", rationale: "Immediate targets may dominate.", confidence: 0.52 }], adjudicated: "improve_worst_piece", secondaryConcepts: ["piece_activity"], claims: { subject_piece: { square: "e2", type: "n", color: "white" }, destination_square: "c3", target_squares: ["b5", "d5"] }, tacticalCompetition: "secondary", decisionNote: "Relabeled from positive anchor to centrality boundary.", stateChange: ["knight gains central activity and immediate attacks"], limitations: ["Not a clean Training example"],
  },
  {
    id: "obs-worst-d-f1b1", conceptId: "improve_worst_piece", family: "engine_disagreement", sourceKey: "worst-d", line: ["f1b1", "h7h6", "c3d2"], label: "abstain", mechanismFamily: "maneuver",
    subject: { first_piece: "white rook f1", second_piece: "white bishop c3", route: ["Rf1-b1", "Bc3-d2"] }, constitutiveConditions: { comparative_worst_piece: "unknown", realistic_route: true, functional_destination: "unknown", no_dominant_urgency: "unknown" }, objectEvidence: [board("Legal source line Rb1 ...h6 Bd2")], counterevidence: [human("The sequence changes two white pieces, so the actual worst piece is ambiguous.")], objectUncertainty: ["Source metadata names rook f1, while the continuation also improves bishop c3."], confounders: ["open file", "coordination"],
    affordance: { available: "unknown", mechanism: "multi-piece coordination", access: "legal three-ply line", target: null, cost: "two white tempi", stability: "unknown" },
    assessment: assessed(axis(0.44, "unknown", "At least one piece is being improved, but the single worst piece is not unambiguously identified.", [board("two white pieces move in the line")], ["Comparative contribution unresolved."]), axis(0.48, "unknown", "The sequence is coherent but may be coordination rather than worst-piece improvement.", [human("two-piece maneuver")], ["No independent plan comparison."]), axis(0.12, "weak", "Abstain until an expert identifies the primary piece and role.", [human("metadata/line mismatch")], ["External review required."]), 0.46, ["multiple_concepts_no_dominant", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "improve_worst_piece", rationale: "One of rook/bishop is rerouted.", confidence: 0.46 }, { concept_id: "piece_activity", rationale: "General coordination may be primary.", confidence: 0.5 }, { concept_id: "open_file", rationale: "Rb1 may seek a file role.", confidence: 0.35 }], adjudicated: "unresolved", secondaryConcepts: ["piece_activity", "open_file"], unresolved: "The source line is legal but does not isolate which piece is worst or why.", claims: { subject_piece: { square: "f1", type: "r", color: "white" }, target_squares: ["b1", "d2"] }, tacticalCompetition: "unknown", decisionNote: "Kept as disagreement, not promoted by prior gold-training status.", stateChange: ["rook rerouted to b1", "bishop later rerouted to d2"], limitations: ["Requires external plan annotation"],
  },
  {
    id: "obs-opposition-b-g2h2", conceptId: "opposition", family: "natural_positive", sourceKey: "opposition-b", line: ["g2h2", "h4g5", "h2g3"], label: "positive", mechanismFamily: "reserve_tempo",
    subject: { white_king: "g2", black_king: "h4", reserve_move: "Kh2", method_square: "g3" }, constitutiveConditions: { pawn_endgame: true, side_to_move_known: true, key_squares_identified: true, practical_consequence: true }, objectEvidence: [board("Only kings and pawns remain"), board("Legal line Kg2-h2 Kh4-g5 Kh2-g3")], counterevidence: [human("Several pawn tempi mean direct-opposition geometry alone is insufficient.")], objectUncertainty: ["Tablebase result is not yet attached because the position has more than seven pieces."], confounders: ["king activity", "spare pawn moves"],
    affordance: { available: true, mechanism: "reserve tempo leading to effective opposition", access: "Kh2 then Kg3", target: "key king square g3", cost: "one reserve tempo", stability: "reply_dependent" },
    assessment: assessed(axis(0.86, "strong", "The legal sequence uses the trait and king geometry to recover the key square g3.", [board("g2-h2-h4g5-h2g3 legal")], ["No <=7-piece tablebase at root."]), axis(0.82, "strong", "Kh2 is specifically valuable because it preserves the king response after ...Kg5.", [board("source line reaches Kg3")]), axis(0.7, "present", "Opposition/tempo is a defensible method label, with king activity retained as secondary.", [human("trait-sensitive king method")], ["External theoretical adjudication required."]), 0.78),
    interpretations: [{ concept_id: "opposition", rationale: "Reserve tempo preserves the effective king relation.", confidence: 0.78 }, { concept_id: "king_activity", rationale: "King route is also active.", confidence: 0.55 }], adjudicated: "opposition", secondaryConcepts: ["king_activity"], claims: { subject_piece: { square: "g2", type: "k", color: "white" }, destination_square: "h2", target_squares: ["g3"] }, tacticalCompetition: "none", decisionNote: "The full short sequence is the method; kings-facing geometry alone is not the label.", stateChange: ["white preserves a useful king tempo", "white reaches g3 after ...Kg5"], limitations: ["No root Syzygy result due piece count"],
  },
  {
    id: "obs-opposition-a-e6d5", conceptId: "opposition", family: "centrality_negative", sourceKey: "opposition-a", move: "e6d5", label: "boundary", mechanismFamily: "direct",
    subject: { black_king: "e6", white_king: "d3", destination: "d5" }, constitutiveConditions: { pawn_endgame: true, side_to_move_known: true, opposition_geometry_after_move: true, practical_consequence: "unknown" }, objectEvidence: [board("Ke6-d5 is legal"), board("After Kd5 kings are aligned d5/d3 with one square between")], counterevidence: [human("Multiple pawns and reserve tempi prevent geometry from proving the method consequence.")], objectUncertainty: ["No tablebase at this material count."], confounders: ["king activity", "pawn tempi"],
    affordance: { available: "unknown", mechanism: "direct opposition geometry", access: "one king move", target: "d4 key square candidate", cost: "one tempo", stability: "unknown" },
    assessment: assessed(axis(0.9, "strong", "Kd5 creates direct opposition geometry in a pawn ending.", [board("kings d5/d3 after move")]), axis(0.58, "present", "The geometry influences king access, but its theoretical consequence is not isolated.", [human("key-square candidate d4")], ["Spare pawn moves untested."]), axis(0.34, "weak", "King activity and pawn tempi may be more pedagogically central.", [human("multiple mechanisms remain")], ["External endgame review required."]), 0.66, ["relevant_but_not_pedagogically_central", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "opposition", rationale: "Direct geometry after Kd5.", confidence: 0.66 }, { concept_id: "king_activity", rationale: "Central king placement may explain the move.", confidence: 0.6 }], adjudicated: "opposition", secondaryConcepts: ["king_activity"], claims: { subject_piece: { square: "e6", type: "k", color: "black" }, destination_square: "d5", target_squares: ["d4"] }, tacticalCompetition: "none", decisionNote: "Presence is strong; method consequence and priority explicitly remain lower.", stateChange: ["direct opposition geometry appears after Kd5"], limitations: ["No controlled causal proof of theoretical outcome"],
  },
  {
    id: "obs-opposition-a-e6f5", conceptId: "opposition", family: "constitutive_negative", sourceKey: "opposition-a", move: "e6f5", label: "negative", mechanismFamily: "direct",
    subject: { black_king: "e6", white_king: "d3", destination: "f5" }, constitutiveConditions: { pawn_endgame: true, side_to_move_known: true, opposition_geometry_after_move: false, practical_consequence: "unknown" }, objectEvidence: [board("Ke6-f5 is legal"), board("Kings f5/d3 are not in direct opposition geometry")], counterevidence: [human("The king may still be active; only the opposition claim is negative.")], objectUncertainty: ["The move's objective value is not a semantic criterion."], confounders: ["king activity"],
    affordance: { available: false, mechanism: "direct opposition", access: "king moves to f5", target: null, cost: "one tempo", stability: "stable" },
    assessment: assessed(axis(0.05, "absent", "The same-FEN branch does not create direct opposition geometry.", [board("post-move kings f5/d3")]), axis(0.08, "absent", "Opposition cannot explain a branch that lacks its geometry.", [board("geometry absent")]), axis(0.02, "absent", "Useful same-FEN constitutive contrast, not a lesson.", [human("king activity may still exist")]), 0.94, ["unsuitable_for_training"]),
    interpretations: [{ concept_id: "opposition", rationale: "Direct geometry absent.", confidence: 0.05 }, { concept_id: "king_activity", rationale: "King centralization remains possible.", confidence: 0.42 }], adjudicated: "opposition", secondaryConcepts: ["king_activity"], claims: { subject_piece: { square: "e6", type: "k", color: "black" }, destination_square: "f5" }, tacticalCompetition: "none", decisionNote: "This is the valid same-initial-FEN branch against Kd5.", stateChange: ["king moves without acquiring direct opposition"], limitations: ["Not a claim about the branch's engine value"],
  },
  {
    id: "obs-opposition-c-e4f4", conceptId: "opposition", family: "neighbor_negative", sourceKey: "opposition-c", move: "e4f4", label: "abstain", mechanismFamily: "direct",
    subject: { white_king: "e4", black_king: "f6", destination: "f4" }, constitutiveConditions: { pawn_endgame: true, side_to_move_known: true, opposition_geometry_after_move: true, practical_consequence: "unknown" }, objectEvidence: [board("Ke4-f4 is legal"), board("After Kf4 kings f4/f6 show direct geometry")], counterevidence: [human("White's f5 pawn and king activity may dominate the explanation.")], objectUncertainty: ["Same source game as opposition-b but a later natural state with multiple changed variables."], confounders: ["king activity", "passed pawn"],
    affordance: { available: "unknown", mechanism: "direct opposition geometry", access: "one move", target: "support f5 pawn", cost: "one tempo", stability: "unknown" },
    assessment: assessed(axis(0.86, "strong", "Direct geometry exists after Kf4.", [board("post-move kings f4/f6")]), axis(0.5, "unknown", "The move supports a pawn and centralizes; opposition relevance is not isolated.", [human("multiple candidate interpretations")], ["No controlled same-FEN alternative annotated."]), axis(0.15, "weak", "Do not teach opposition until king activity and pawn support are adjudicated.", [human("neighbor concepts compete")], ["External review required."]), 0.53, ["multiple_concepts_no_dominant", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "opposition", rationale: "Geometry after Kf4.", confidence: 0.53 }, { concept_id: "king_activity", rationale: "King supports f5 and centralizes.", confidence: 0.67 }, { concept_id: "passed_pawn", rationale: "f-pawn progress may be central.", confidence: 0.5 }], adjudicated: "unresolved", secondaryConcepts: ["king_activity", "passed_pawn"], unresolved: "Geometry is true, but method centrality is not.", claims: { subject_piece: { square: "e4", type: "k", color: "white" }, destination_square: "f4", target_squares: ["f5"] }, tacticalCompetition: "none", decisionNote: "Natural later position; explicitly not treated as a controlled counterfactual to opposition-b.", stateChange: ["direct king geometry appears", "king supports f5"], limitations: ["Multiple natural variables changed"],
  },
  {
    id: "obs-opposition-d-e3e2", conceptId: "opposition", family: "engine_disagreement", sourceKey: "opposition-d", line: ["e3e2", "g2h2", "f2f1r", "h2g2", "f1f2"], label: "abstain", mechanismFamily: "promotion_race",
    subject: { black_king: "e3", white_king: "g2", route: ["Ke3-e2", "Kg2-h2"] }, constitutiveConditions: { pawn_endgame: true, side_to_move_known: true, opposition_geometry_after_move: true, practical_consequence: "unknown" }, objectEvidence: [board("Six-piece legal source position"), board("Legal promotion line stored in source"), { kind: "tablebase_check", claim: "Lichess Syzygy root position is won for Black; DTZ 1, DTM 9. Ke2 is a winning move (child category loss for White, DTZ -2).", value: "win;dtz=1;dtm=9;best=e3e2" }], counterevidence: [human("Promotion race may dominate opposition geometry.")], objectUncertainty: ["Tablebase verifies the outcome and Ke2, but does not identify opposition as the causal concept."], confounders: ["promotion", "underpromotion", "pawn race"],
    affordance: { available: "unknown", mechanism: "opposition during promotion race", access: "legal king move", target: "promotion control", cost: "one tempo", stability: "unknown" },
    assessment: assessed(axis(0.62, "present", "Ke2 creates king geometry, but the board is primarily a promotion race.", [board("six pieces; legal line"), { kind: "tablebase_check", claim: "Root WDL win; Ke2 preserves the win.", value: "win/dtz=1" }], ["WDL truth does not establish the concept label."]), axis(0.36, "weak", "The forcing promotion sequence may not depend on opposition as the decisive method.", [board("...f1=R appears in line"), { kind: "tablebase_check", claim: "Ke2 is winning, but tablebase supplies no conceptual explanation.", value: "e3e2:loss_for_child/dtz=-2" }], ["Causal method remains unadjudicated."]), axis(0.08, "weak", "Keep only as unresolved tablebase-verified outcome, never an opposition anchor yet.", [human("promotion-race override")], ["External concept review required."]), 0.55, ["unstable_mechanism", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "opposition", rationale: "King geometry appears.", confidence: 0.45 }, { concept_id: "rule_of_square", rationale: "Promotion race may be decisive.", confidence: 0.72 }], adjudicated: "unresolved", secondaryConcepts: ["rule_of_square"], unresolved: "Syzygy verifies win/Ke2; expert method annotation is still required.", claims: { subject_piece: { square: "e3", type: "k", color: "black" }, destination_square: "e2", target_squares: ["f1"], tablebase_wdl: "win" }, tacticalCompetition: "dominant", decisionNote: "Tablebase verifies the objective result, never the concept name.", stateChange: ["king enters promotion-support geometry", "pawn promotes in source line"], limitations: ["Syzygy result persisted; causal concept remains unresolved"],
  },
  {
    id: "obs-opposition-e-d5e5", conceptId: "opposition", family: "human_plausible_misconception", sourceKey: "opposition-e", move: "d5e5", label: "boundary", mechanismFamily: "direct",
    subject: { black_king: "d5", white_king: "e3", destination: "e5" }, constitutiveConditions: { pawn_endgame: true, side_to_move_known: true, opposition_geometry_after_move: true, practical_consequence: "unknown" }, objectEvidence: [board("Six-piece position"), board("After Ke5 kings e5/e3 show direct geometry"), { kind: "tablebase_check", claim: "Lichess Syzygy root position is drawn; DTZ 0, DTM 0. Best root move is Kd6.", value: "draw;dtz=0;dtm=0;best=d5d6" }], counterevidence: [human("Direct geometry does not by itself establish the drawing method."), { kind: "tablebase_check", claim: "Ke5 is not the first tablebase move returned; geometry alone cannot be promoted to the method.", value: "best=d5d6" }], objectUncertainty: ["Tablebase verifies the draw only; the causal role of Ke5 remains unproved."], confounders: ["passed pawns", "reserve tempi"],
    affordance: { available: "unknown", mechanism: "direct opposition geometry", access: "one king move", target: "e4 key square candidate", cost: "one tempo", stability: "unknown" },
    assessment: assessed(axis(0.88, "strong", "Direct opposition geometry appears after Ke5.", [board("post-move kings e5/e3")]), axis(0.48, "unknown", "The practical consequence is not established by geometry alone.", [human("two pawn pairs create tempi"), { kind: "tablebase_check", claim: "The root is drawn, with Kd6 returned first.", value: "draw/dtz=0" }], ["Tablebase outcome does not isolate Ke5's mechanism."]), axis(0.14, "weak", "Anti-shortcut case: kings facing is not enough for an opposition lesson.", [human("geometry ≠ decisive method")], ["External review required."]), 0.6, ["weak_signal", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "opposition", rationale: "Geometry true, consequence still unisolated.", confidence: 0.55 }, { concept_id: "king_activity", rationale: "King centralization may be sufficient description.", confidence: 0.5 }], adjudicated: "unresolved", secondaryConcepts: ["king_activity"], unresolved: "Syzygy verifies a draw, but effective opposition and method centrality still need expert adjudication.", claims: { subject_piece: { square: "d5", type: "k", color: "black" }, destination_square: "e5", target_squares: ["e4"], tablebase_wdl: "draw" }, tacticalCompetition: "none", decisionNote: "Retained as a six-piece boundary, not upgraded to theoretical positive.", stateChange: ["direct geometry appears after Ke5"], limitations: ["Syzygy outcome persisted; concept causality unresolved"],
  },
  {
    id: "obs-restrict-a-b2b3", conceptId: "restrict_counterplay", family: "constitutive_negative", sourceKey: "restrict-a", line: ["b2b3", "d8d5", "c4a3"], label: "negative", mechanismFamily: "remove_resource",
    subject: { restricting_action: "b2b3", opponent_resource: "d8d5" }, constitutiveConditions: { opponent_resource_before: true, resource_legal_after_action: true, resource_reduced: false, acceptable_cost: "unknown" }, objectEvidence: [board("b2-b3 and reply ...Rd8-d5 are legal in sequence"), board("The alleged resource is played immediately after the supposed restriction")], counterevidence: [human("resource_after is still available, so the constitutive restriction condition fails")], objectUncertainty: ["b3 may restrict a different resource, but none is annotated."], confounders: ["useful quiet move"],
    affordance: { available: false, mechanism: "remove ...Rd5 resource", access: "alleged resource remains legal", target: "...Rd5", cost: "one pawn tempo", stability: "stable" },
    assessment: assessed(axis(0.02, "absent", "The claimed restrict-counterplay mechanism is false because ...Rd5 remains legal and is played.", [board("line contains ...Rd5")]), axis(0.04, "absent", "b3 cannot be relevant by suppressing a resource it does not suppress.", [board("resource after = available")]), axis(0.01, "absent", "High-value causal hard negative for future detectors.", [human("quiet move ≠ restriction")]), 0.99, ["unsuitable_for_training"]),
    interpretations: [{ concept_id: "restrict_counterplay", rationale: "Rejected: announced resource survives.", confidence: 0.02 }, { concept_id: "concept_unknown", rationale: "Actual purpose of b3 not adjudicated.", confidence: 0.7 }], adjudicated: "restrict_counterplay", secondaryConcepts: [], claims: { subject_piece: { square: "b2", type: "p", color: "white" }, destination_square: "b3", opponent_resource_before: "d8d5", opponent_resource_after: "available", target_squares: ["d5"] }, tacticalCompetition: "none", decisionNote: "Former positive rebuilt as causal constitutive negative.", stateChange: ["b-pawn advances", "...Rd5 remains available"], limitations: ["Actual purpose of b3 unresolved"],
  },
  {
    id: "obs-restrict-b-h5h6", conceptId: "restrict_counterplay", family: "human_plausible_misconception", sourceKey: "restrict-b", move: "h5h6", label: "abstain", mechanismFamily: "stop_break",
    subject: { piece: "white queen h5", action: "Qh6", opponent_resource: "c5c4" }, constitutiveConditions: { opponent_resource_before: true, resource_legal_after_action: true, resource_reduced: false, acceptable_cost: "unknown" }, objectEvidence: [board("h5 contains a white queen, not a pawn"), board("Qh5-h6 is legal"), board("black pawn c5 can still play c5-c4 after Qh6")], counterevidence: [human("The legacy narration was factually wrong and the resource remains." )], objectUncertainty: ["Qh6 may have an attacking purpose unrelated to restriction."], confounders: ["queen attack"],
    affordance: { available: false, mechanism: "stop ...c4", access: "Qh6 does not remove the pawn break", target: "...c5-c4", cost: "queen tempo", stability: "stable" },
    assessment: assessed(axis(0.03, "absent", "The claimed resource is legal but not restricted by Qh6.", [board("c5 pawn remains able to move to c4")]), axis(0.05, "absent", "Qh6 cannot be explained as limiting that counterplay.", [board("h5 piece is queen")]), axis(0.01, "absent", "Retained only as an anti-shortcut/factual-annotation challenge.", [human("quiet-looking move ≠ prophylaxis")]), 0.97, ["unsuitable_for_training"]),
    interpretations: [{ concept_id: "restrict_counterplay", rationale: "Rejected for announced resource.", confidence: 0.03 }, { concept_id: "concept_unknown", rationale: "Queen move may pursue attack.", confidence: 0.72 }], adjudicated: "unresolved", secondaryConcepts: [], unresolved: "Actual attacking intent of Qh6 is outside this pilot annotation.", claims: { subject_piece: { square: "h5", type: "q", color: "white" }, destination_square: "h6", opponent_resource_before: "c5c4", opponent_resource_after: "available", target_squares: ["c4"] }, tacticalCompetition: "unknown", decisionNote: "Corrects the explicit pawn/queen factual error from Work A.", stateChange: ["queen moves h5-h6", "...c4 remains legal"], limitations: ["No positive restrict-counterplay anchor remains"],
  },
  {
    id: "obs-exchange-a-g1f2", conceptId: "exchange_attacker", family: "tactical_override", sourceKey: "exchange-a", line: ["g1f2", "d7f5", "f2g1"], label: "boundary", mechanismFamily: "forced_exchange",
    subject: { defender: "white king g1", attacker: "black bishop f2", threat: "check" }, constitutiveConditions: { attacker_identified: true, attacker_central_to_attack: true, exchange_or_removal_legal: true, danger_reduced: true, optional_decision: false }, objectEvidence: [board("Black bishop f2 attacks king g1"), board("Kg1xf2 legally removes bishop")], counterevidence: [human("The move is a forced response to check, not a strategic exchange choice.")], objectUncertainty: ["Longer-term danger after the source line is not fully annotated."], confounders: ["forced check response"],
    affordance: { available: true, mechanism: "forced removal of checking attacker", access: "king captures f2", target: "bishop f2", cost: "king displacement", stability: "reply_dependent" },
    assessment: assessed(axis(0.9, "strong", "The bishop on f2 is an actual attacker and is legally removed.", [board("Bf2 attacks Kg1")]), axis(0.88, "strong", "The move directly answers check by removing the attacker.", [board("Kxf2 legal")]), axis(0.16, "weak", "Tactical compulsion dominates; unsuitable as a clean exchange-attacker lesson.", [board("side to move is in check")], ["Could remain useful as a tactical boundary."]), 0.9, ["tactical_override", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "exchange_attacker", rationale: "Attacker is removed.", confidence: 0.9 }, { concept_id: "defensive_resource", rationale: "Forced legal answer to check.", confidence: 0.91 }], adjudicated: "exchange_attacker", secondaryConcepts: ["defensive_resource"], claims: { subject_piece: { square: "g1", type: "k", color: "white" }, destination_square: "f2", attacker_before: { square: "f2", type: "b", color: "black" }, threat_target: "g1", exchange_action: "g1f2", target_squares: ["f2"] }, tacticalCompetition: "dominant", decisionNote: "Presence and relevance are true; pedagogical priority is low because the move is forced.", stateChange: ["checking bishop removed", "king displaced to f2"], limitations: ["No optional defensive choice"],
  },
  {
    id: "obs-exchange-b-c2c3", conceptId: "exchange_attacker", family: "tactical_override", sourceKey: "exchange-b", line: ["c2c3", "c8c3", "c1c3"], label: "boundary", mechanismFamily: "forced_exchange",
    subject: { defender: "white queen c2", attacker: "black queen c3", threat: "check on king e1" }, constitutiveConditions: { attacker_identified: true, attacker_central_to_attack: true, exchange_or_removal_legal: true, danger_reduced: true, optional_decision: false }, objectEvidence: [board("Black queen c3 attacks white king e1 along c3-d2-e1"), board("Qc2xc3 is legal and forces rook recapture after ...Rc8xc3")], counterevidence: [human("The liquidation is forcing and may be better labeled simplification_to_hold.")], objectUncertainty: ["Remaining attack after the full line needs external review."], confounders: ["forced queen liquidation", "simplification_to_hold"],
    affordance: { available: true, mechanism: "forced queen liquidation", access: "Qc2xc3", target: "black queen c3", cost: "white queen and rook sequence", stability: "reply_dependent" },
    assessment: assessed(axis(0.92, "strong", "The black queen is the checking attacker and can be exchanged.", [board("Qc3 attacks Ke1")]), axis(0.86, "strong", "Qc2xc3 directly removes the queen invasion through a forced liquidation.", [board("legal three-ply sequence")]), axis(0.2, "weak", "The forcing tactical liquidation dominates a general exchange-attacker lesson.", [human("simplification neighbor is equally plausible")], ["External primary-concept adjudication required."]), 0.82, ["tactical_override", "relevant_but_not_pedagogically_central", "unsuitable_for_training"]),
    interpretations: [{ concept_id: "exchange_attacker", rationale: "Checking queen is exchanged.", confidence: 0.82 }, { concept_id: "simplification_to_hold", rationale: "Forced liquidation may be the better lesson.", confidence: 0.84 }], adjudicated: "unresolved", secondaryConcepts: ["simplification_to_hold", "defensive_resource"], unresolved: "Primary concept between attacker exchange and saving liquidation requires external adjudication.", claims: { subject_piece: { square: "c2", type: "q", color: "white" }, destination_square: "c3", attacker_before: { square: "c3", type: "q", color: "black" }, threat_target: "e1", exchange_action: "c2c3", target_squares: ["c3", "e1"] }, tacticalCompetition: "dominant", decisionNote: "All Work A duplicates collapse into one observation with two candidate interpretations.", stateChange: ["black queen removed", "white queen then white rook exchanged in line"], limitations: ["Not a clean optional exchange decision"],
  },
  {
    id: "obs-exchange-c-g4f5", conceptId: "exchange_attacker", family: "constitutive_negative", sourceKey: "exchange-c", move: "g4f5", label: "negative", mechanismFamily: "trade_defender_for_attacker",
    subject: { piece: "white pawn g4", captured_piece: "black pawn f5" }, constitutiveConditions: { attacker_identified: false, attacker_central_to_attack: false, exchange_or_removal_legal: true, danger_reduced: "unknown", optional_decision: true }, objectEvidence: [board("White pawn g4 captures black pawn f5")], counterevidence: [human("No attacking piece or attack state is identified before the pawn exchange.")], objectUncertainty: ["The pawn capture may have structural value outside this concept."], confounders: ["pawn structure", "passed pawn"],
    affordance: { available: false, mechanism: "exchange central attacker", access: "pawn capture only", target: "black pawn f5", cost: "pawn structure changes", stability: "unknown" },
    assessment: assessed(axis(0.03, "absent", "The captured pawn is not established as an essential attacker.", [board("g4xf5 captures pawn")]), axis(0.05, "absent", "No documented attack is reduced by this exchange.", [human("attack-before state missing")]), axis(0.01, "absent", "Hard negative against capture = exchange_attacker shortcut.", [human("capture alone is insufficient")]), 0.94, ["unsuitable_for_training"]),
    interpretations: [{ concept_id: "exchange_attacker", rationale: "Rejected: no attacker role.", confidence: 0.03 }, { concept_id: "pawn_structure", rationale: "Structural capture may be relevant.", confidence: 0.52 }], adjudicated: "exchange_attacker", secondaryConcepts: ["pawn_structure"], claims: { subject_piece: { square: "g4", type: "p", color: "white" }, destination_square: "f5", target_squares: ["f5"], exchange_action: "g4f5" }, tacticalCompetition: "none", decisionNote: "Unified constitutive negative; duplicate misconception row removed.", stateChange: ["pawns exchange", "no attacker-state change established"], limitations: ["Actual pawn-structure concept unadjudicated"],
  },
];

export const DEVELOPMENT_REFERENCE_BANK: readonly DevelopmentReference[] = REFERENCES.map(makeReference);

export function assertDevelopmentReferenceIntegrity(references = DEVELOPMENT_REFERENCE_BANK): void {
  const ids = new Set<string>();
  const observations = new Set<string>();
  for (const reference of references) {
    if (ids.has(reference.id)) throw new Error(`Duplicate reference id: ${reference.id}`);
    if (observations.has(reference.observation_key)) throw new Error(`Duplicate observation: ${reference.observation_key}`);
    ids.add(reference.id);
    observations.add(reference.observation_key);
    new Chess(reference.fen);
    const errors = semanticBoardErrors(reference);
    if (errors.length) throw new Error(`${reference.id}: ${errors.join(", ")}`);
  }
}
