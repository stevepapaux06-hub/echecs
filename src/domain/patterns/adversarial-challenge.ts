import { DEVELOPMENT_REFERENCE_BANK } from "../reference/adjudicated-reference";
import { REFERENCE_SOURCE_BY_KEY } from "../reference/source-catalog";
import { evaluateDevelopmentReference, NATURAL_GENERALIZATION_RESULTS } from "./development-evaluation";
import { analyzePilotDecision, type PilotRuntimeConcept } from "./pilot-engine";
import { pilotPolicyDecision } from "./policy";

export type AdversarialCaseKind =
  | "classic_positive"
  | "nonclassic_positive"
  | "hard_negative"
  | "minimal_counterfactual"
  | "dominant_competing_plan"
  | "ambiguous_abstain";

export type ExpectedChallengeBehavior = "promote" | "abstain" | "reject";
export type ChallengeFailureLayer = "detector" | "ranking" | "content" | "none";

export type AdversarialChallengeCase = {
  id: string;
  conceptId: PilotRuntimeConcept;
  kind: AdversarialCaseKind;
  expected: ExpectedChallengeBehavior;
  referenceId?: string;
  sourceKey?: string;
  moveUci?: string;
  auditQuestion: string;
  provenance: "natural_development_reference" | "natural_detector_influenced_probe" | "same_fen_decision_branch";
  /** None of the current cases is falsely advertised as a blind holdout. */
  independentHoldout: false;
  limitations: string[];
};

/** Small, frozen anti-shortcut suite. It intentionally reuses already sourced
 * natural positions and the two honest same-FEN branches instead of creating
 * synthetic boards with unknown chess truth. Missing cells remain visible in
 * CHALLENGE_COVERAGE_GAPS rather than being filled with invented labels. */
export const ADVERSARIAL_CHALLENGE_SET: readonly AdversarialChallengeCase[] = [
  { id: "file-classic-contest", conceptId: "open_file", kind: "classic_positive", expected: "promote", referenceId: "obs-open-file-d-a1c1", auditQuestion: "Does a rook contest a genuinely useful pawn-free file?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Existing development anchor", "No blind external annotation"] },
  { id: "worst-piece-classic", conceptId: "improve_worst_piece", kind: "classic_positive", expected: "promote", referenceId: "obs-worst-b-a3c4", auditQuestion: "Is the low-activity knight actually improved rather than merely moved?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Existing development anchor"] },
  { id: "outpost-maneuver-nonclassic", conceptId: "outpost", kind: "nonclassic_positive", expected: "promote", referenceId: "obs-outpost-d-f5e3-d5", auditQuestion: "Can a preparatory maneuver count when the outpost is reached later in the verified line?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Existing development anchor", "Line-based rather than one-move"] },
  { id: "file-semi-open-nonclassic", conceptId: "open_file", kind: "nonclassic_positive", expected: "promote", referenceId: "obs-open-file-b-a1d1", auditQuestion: "Does the detector recognize useful semi-open pressure without claiming a pawn-free file?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Provisional ontology-migration case", "Not gold-scored"] },
  { id: "opposition-reserve-tempo-nonclassic", conceptId: "opposition", kind: "nonclassic_positive", expected: "promote", referenceId: "obs-opposition-b-g2h2", auditQuestion: "Can the method recognize a reserve tempo rather than only kings already facing?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["No complete tablebase-backed method proof", "Expected false-negative remains visible"] },

  { id: "outpost-rim-near-miss", conceptId: "outpost", kind: "hard_negative", expected: "reject", referenceId: "obs-outpost-a-c3a4", auditQuestion: "Does a legal knight relocation become an outpost merely because the square is stable?", provenance: "same_fen_decision_branch", independentHoldout: false, limitations: ["Shares source position with boundary branch"] },
  { id: "exchange-capture-near-miss", conceptId: "exchange_attacker", kind: "hard_negative", expected: "reject", referenceId: "obs-exchange-c-g4f5", auditQuestion: "Does any capture get mislabeled as removing the main attacker?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Actual pawn-structure idea is unadjudicated"] },
  { id: "restriction-resource-survives", conceptId: "restrict_counterplay", kind: "hard_negative", expected: "reject", referenceId: "obs-restrict-a-b2b3", auditQuestion: "Does a quiet move count as prophylaxis when the named resource remains legal?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Actual purpose of b3 is unadjudicated"] },

  { id: "outpost-counterfactual-positive-branch", conceptId: "outpost", kind: "minimal_counterfactual", expected: "abstain", referenceId: "obs-outpost-a-c3d5", auditQuestion: "Does centrality rise versus Na4 without ignoring the tactical capture?", provenance: "same_fen_decision_branch", independentHoldout: false, limitations: ["Not a single-variable intervention", "Tactical competition remains"] },
  { id: "opposition-counterfactual-negative-branch", conceptId: "opposition", kind: "minimal_counterfactual", expected: "reject", referenceId: "obs-opposition-a-e6f5", auditQuestion: "Does changing the king destination remove direct-opposition geometry?", provenance: "same_fen_decision_branch", independentHoldout: false, limitations: ["Tests geometry, not game-theoretical outcome"] },

  { id: "outpost-dominant-tactic", conceptId: "outpost", kind: "dominant_competing_plan", expected: "abstain", sourceKey: "outpost-c", moveUci: "c3d5", auditQuestion: "Does an attractive square get demoted when immediate tactics dominate?", provenance: "natural_detector_influenced_probe", independentHoldout: false, limitations: ["Source was known before final audit"] },
  { id: "file-dominant-king-danger", conceptId: "open_file", kind: "dominant_competing_plan", expected: "abstain", sourceKey: "file-c", moveUci: "a1d1", auditQuestion: "Does file occupation get demoted under queen invasion and king danger?", provenance: "natural_detector_influenced_probe", independentHoldout: false, limitations: ["Source was known before final audit"] },
  { id: "exchange-forced-check-response", conceptId: "exchange_attacker", kind: "dominant_competing_plan", expected: "abstain", referenceId: "obs-exchange-a-g1f2", auditQuestion: "Does a forced capture in check avoid becoming a strategic exchange lesson?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Presence is true; pedagogical centrality is not"] },

  { id: "worst-piece-maneuver-ambiguous", conceptId: "improve_worst_piece", kind: "ambiguous_abstain", expected: "abstain", referenceId: "obs-worst-d-f1b1", auditQuestion: "Does the engine abstain when the supposed worst piece and route are unresolved?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["External plan review missing"] },
  { id: "opposition-promotion-race-ambiguous", conceptId: "opposition", kind: "ambiguous_abstain", expected: "abstain", referenceId: "obs-opposition-d-e3e2", auditQuestion: "Does tablebase truth avoid proving the opposition label during a promotion race?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["WDL verified; causal method unproved"] },
  { id: "restriction-queen-move-ambiguous", conceptId: "restrict_counterplay", kind: "ambiguous_abstain", expected: "reject", referenceId: "obs-restrict-b-h5h6", auditQuestion: "Does a quiet-looking queen move avoid a prophylaxis label when the resource survives?", provenance: "natural_development_reference", independentHoldout: false, limitations: ["Actual attacking intent is outside the pilot"] },
];

function behaviorForCandidates(candidates: ReturnType<typeof analyzePilotDecision>, conceptId: PilotRuntimeConcept): ExpectedChallengeBehavior {
  const candidate = candidates.find((item) => item.conceptId === conceptId);
  if (!candidate) return "reject";
  if (pilotPolicyDecision(candidate).eligible && candidate.trainingCandidate === "yes") return "promote";
  if (candidate.abstentions.length > 0 || candidate.presence.score >= 0.5) return "abstain";
  return "reject";
}

export const ADVERSARIAL_CHALLENGE_RESULTS = ADVERSARIAL_CHALLENGE_SET.map((challenge) => {
  let actual: ExpectedChallengeBehavior;
  if (challenge.referenceId) {
    const reference = DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === challenge.referenceId);
    if (!reference) throw new Error(`Missing challenge reference ${challenge.referenceId}`);
    const result = evaluateDevelopmentReference(reference);
    actual = behaviorForCandidates(result.candidate ? [result.candidate] : [], challenge.conceptId);
  } else {
    const existingProbe = NATURAL_GENERALIZATION_RESULTS.find((item) => item.sourceKey === challenge.sourceKey && item.moveUci === challenge.moveUci);
    if (existingProbe) actual = behaviorForCandidates(existingProbe.candidates, challenge.conceptId);
    else {
      const source = REFERENCE_SOURCE_BY_KEY.get(challenge.sourceKey ?? "");
      if (!source) throw new Error(`Missing challenge source ${challenge.sourceKey}`);
      actual = behaviorForCandidates(analyzePilotDecision(source.fen, challenge.moveUci ?? "", { compareDecisions: true }), challenge.conceptId);
    }
  }
  const matched = actual === challenge.expected;
  const failureLayer: ChallengeFailureLayer = matched ? "none"
    : challenge.expected === "promote" && actual === "reject" ? "detector"
      : challenge.expected === "promote" || actual === "promote" ? "ranking"
        : "content";
  return { ...challenge, actual, matched, failureLayer };
});

const challengeConcepts: PilotRuntimeConcept[] = ["outpost", "open_file", "improve_worst_piece", "opposition", "restrict_counterplay", "exchange_attacker"];
const challengeKinds: AdversarialCaseKind[] = ["classic_positive", "nonclassic_positive", "hard_negative", "minimal_counterfactual", "dominant_competing_plan", "ambiguous_abstain"];

export const CHALLENGE_COVERAGE_GAPS = Object.fromEntries(challengeConcepts.map((conceptId) => [conceptId,
  challengeKinds.filter((kind) => !ADVERSARIAL_CHALLENGE_SET.some((item) => item.conceptId === conceptId && item.kind === kind)),
])) as Record<PilotRuntimeConcept, AdversarialCaseKind[]>;

export const ADVERSARIAL_CHALLENGE_SUMMARY = {
  total: ADVERSARIAL_CHALLENGE_RESULTS.length,
  matched: ADVERSARIAL_CHALLENGE_RESULTS.filter((item) => item.matched).length,
  falsePositive: ADVERSARIAL_CHALLENGE_RESULTS.filter((item) => item.actual === "promote" && item.expected !== "promote").length,
  falseNegative: ADVERSARIAL_CHALLENGE_RESULTS.filter((item) => item.actual !== "promote" && item.expected === "promote").length,
  byFailureLayer: Object.fromEntries((["detector", "ranking", "content"] as const).map((layer) => [layer,
    ADVERSARIAL_CHALLENGE_RESULTS.filter((item) => item.failureLayer === layer).length,
  ])),
  independentHoldoutCases: ADVERSARIAL_CHALLENGE_RESULTS.filter((item) => item.independentHoldout).length,
  syntheticCases: 0,
} as const;
