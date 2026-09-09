import type { AuditDisposition, LegacyReferenceAudit, PilotConceptId, ReferenceFamily } from "./types";

type AuditSeed = [ReferenceFamily, AuditDisposition, string, string?];

function rows(concept: PilotConceptId, seeds: AuditSeed[]): LegacyReferenceAudit[] {
  return seeds.map(([family, disposition, reason, resultingObservationId], index) => ({
    legacy_id: `pilot-${concept}-${family}-${String(index + 1).padStart(2, "0")}`,
    concept_id: concept,
    disposition,
    reason,
    resulting_observation_id: resultingObservationId,
  }));
}

/** Internal A.1 audit of every item emitted by Work A. A disposition concerns
 * the original annotation, not the source game. REJECT means the annotation is
 * absent from the rebuilt benchmark; the natural FEN remains traceable. */
export const LEGACY_REFERENCE_AUDIT: readonly LegacyReferenceAudit[] = [
  ...rows("outpost", [
    ["natural_positive", "RELABEL", "Nd5 is a real supported outpost, but it attacks Be3 immediately; presence survives while pedagogical centrality falls.", "obs-outpost-a-c3d5"],
    ["natural_positive", "REPAIR", "Nd5 remains a plausible anchor, but target b6 was wrong and tactical/king-safety competition was omitted.", "obs-outpost-b-c3d5"],
    ["constitutive_negative", "KEEP", "Na4 is legal and advanced but lacks the stability/role needed for an effective outpost.", "obs-outpost-a-c3a4"],
    ["affordance_negative", "REJECT", "Nc3-b5 was narrated without a complete chase, exchange, and target audit; the conclusion was not established."],
    ["relevance_negative", "REJECT", "e4-e5 may leave the d5 property contextual, but its move-purpose and tactical stability were not independently verified enough for the rebuilt bank."],
    ["centrality_negative", "REJECT", "Same FEN+Nc3-d5 as another item with a competing verdict; folded into one adjudicated observation."],
    ["neighbor_negative", "REJECT", "Na3-c4 belongs to the worst-piece observation and was duplicated here without an outpost-square audit."],
    ["tactical_override", "REJECT", "Same outpost-b FEN+Nc3-d5 duplicated a positive; tactical competition is now represented inside one observation."],
    ["human_plausible_misconception", "REJECT", "Same outpost-b FEN+Nc3-d5 duplicated again; shortcut risk is now metadata on the unified observation."],
    ["engine_disagreement", "REJECT", "Same outpost-c FEN+Nc3-d5 duplicated a centrality case and lacked adjudication; not retained."],
  ]),
  ...rows("open_file", [
    ["natural_positive", "RELABEL", "Rc2-d2 lands on a file containing the black pawn d5; this is not open_file_exists under the contract.", "obs-open-file-a-c2d2"],
    ["natural_positive", "RELABEL", "Ra1-d1 lands on a file containing the black pawn d7; retained only as a constitutive negative.", "obs-open-file-b-a1d1"],
    ["constitutive_negative", "REJECT", "Rc2-c1 does not test the same claimed open-file affordance and added no information beyond the repaired anchor."],
    ["affordance_negative", "REJECT", "Rf1-a1 changed both file and rook role without establishing that the a-file property itself was causal."],
    ["relevance_negative", "REJECT", "b5-b6 is legal, but the old annotation did not identify a specific open-file decision or affordance worth preserving."],
    ["centrality_negative", "REJECT", "Same file-c FEN+Ra1-d1 was also a tactical override; one unresolved story cannot support two verdicts."],
    ["neighbor_negative", "REJECT", "Rf1-e1 was attached to the wrong source concept and lacked a verified open-file target."],
    ["tactical_override", "REJECT", "Same file-c FEN+Ra1-d1 duplicated the centrality item; removed rather than narratively repaired."],
    ["human_plausible_misconception", "REJECT", "Same invalid file-b Ra1-d1 input duplicated the false positive; folded into its constitutive-negative observation."],
    ["engine_disagreement", "REJECT", "Same invalid file-b Ra1-d1 input; engine ranking cannot repair a false board-level open-file claim."],
  ]),
  ...rows("improve_worst_piece", [
    ["natural_positive", "RELABEL", "Ne2-c3 creates immediate attacks; the worst-piece hypothesis is not central enough for a positive anchor.", "obs-worst-a-e2c3"],
    ["natural_positive", "REPAIR", "Na3-c4 is retained as a plausible reroute, with comparative role and tactical uncertainty made explicit.", "obs-worst-b-a3c4"],
    ["constitutive_negative", "REJECT", "Ne2-f4 was not checked for tactical legality, safety, and role; it is not a reliable hard negative."],
    ["affordance_negative", "REJECT", "Ne2-g3 was assigned no destination function, but the absence itself was only asserted rather than established."],
    ["relevance_negative", "REJECT", "Be5-d6 was not tied to an independently established worst piece and mixed a different piece decision."],
    ["centrality_negative", "REJECT", "Same worst-c Na3-c4 input conflicted with another family; removed pending a proper structure/plan adjudication."],
    ["neighbor_negative", "REJECT", "Nc3-d5 is represented once under outpost; duplicating it under worst-piece would recreate a cross-concept observation conflict."],
    ["tactical_override", "REJECT", "Be5-c7 was described as a forcing move without a verified tactic or worst-piece baseline."],
    ["human_plausible_misconception", "REJECT", "Same worst-b Na3-c4 input duplicated its positive; shortcut risk moved into the unified observation."],
    ["engine_disagreement", "REJECT", "Same worst-c Na3-c4 input duplicated centrality with no independent comparison of human plans."],
  ]),
  ...rows("opposition", [
    ["natural_positive", "REPAIR", "Ke6-d5 creates direct opposition geometry, but multiple pawn tempi mean method centrality remains unresolved.", "obs-opposition-a-e6d5"],
    ["natural_positive", "KEEP", "Kg2-h2 followed by ...Kh4-g5 and Kh2-g3 is a traceable reserve-tempo method in the source line.", "obs-opposition-b-g2h2"],
    ["constitutive_negative", "KEEP", "Ke6-f5 does not create the same direct opposition geometry and is a valid same-FEN branch contrast.", "obs-opposition-a-e6f5"],
    ["affordance_negative", "REJECT", "Same opposition-b Kg2-h2 was simultaneously positive and affordance-negative; merged into one observation."],
    ["relevance_negative", "REJECT", "a5-a4 changes pawn tempi and structure, so it is not a clean relevance-only comparison."],
    ["centrality_negative", "REPAIR", "Ke4-f4 is retained as later natural state, but king activity/pawn race are explicit competing interpretations.", "obs-opposition-c-e4f4"],
    ["neighbor_negative", "REJECT", "Same opposition-c Ke4-f4 duplicated the centrality observation; neighbor concepts are now stored on it."],
    ["tactical_override", "REJECT", "f7-f6 starts a forcing pawn sequence but does not form a controlled opposition counterfactual."],
    ["human_plausible_misconception", "REJECT", "Same opposition-b Kg2-h2 duplicated the positive; shortcut risk is now attached to one observation."],
    ["engine_disagreement", "REJECT", "Ke6-e5 is a same-FEN alternative but no tablebase/method annotation established an opposition disagreement."],
  ]),
  ...rows("restrict_counterplay", [
    ["natural_positive", "REJECT", "The alleged resource ...Rd5 is played immediately after b3; the move did not remove that resource."],
    ["natural_positive", "REJECT", "The alleged ...c5-c4 resource is impossible because no black pawn occupies c5."],
    ["constitutive_negative", "REJECT", "Ra4-a3 lacked an independently annotated opponent resource; absence alone was too low-information for the rebuilt bank."],
    ["affordance_negative", "REJECT", "Qh5-h4 was not shown to restrict a viable resource and was duplicated by the disagreement item."],
    ["relevance_negative", "REJECT", "d4-c5 is a white pawn capture, not a clean restriction comparison; too many variables change."],
    ["centrality_negative", "REJECT", "b2-b4 is primarily a pawn break; the claimed ...c5-c4 resource does not exist."],
    ["neighbor_negative", "RELABEL", "Kg1xf2 is a forced capture of the checking bishop, better retained as exchange-attacker tactical override.", "obs-exchange-a-g1f2"],
    ["tactical_override", "REJECT", "Ra4-a5 differs from the alleged resource mechanism and the source evaluation alone is not a semantic label."],
    ["human_plausible_misconception", "REJECT", "The narration called Qh5-h6 a pawn move; the board fact is false and the observation is rejected."],
    ["engine_disagreement", "REJECT", "Same Qh5-h4 input as another family; no causal resource trace was established."],
  ]),
  ...rows("exchange_attacker", [
    ["natural_positive", "RELABEL", "Kg1xf2 is a forced answer to check, not a clean optional exchange-attacker lesson.", "obs-exchange-a-g1f2"],
    ["natural_positive", "RELABEL", "Qc2xc3 forces a queen liquidation after invasion; tactical/simplification centrality dominates.", "obs-exchange-b-c2c3"],
    ["constitutive_negative", "KEEP", "g4xf5 exchanges a pawn and no attacking piece is identified; valid constitutive negative.", "obs-exchange-c-g4f5"],
    ["affordance_negative", "REJECT", "Rd1-e1 does not offer or execute an exchange and adds little beyond absence of the mechanism."],
    ["relevance_negative", "REJECT", "Rd3-e3 likewise removes no attacker; duplicate low-information absence case."],
    ["centrality_negative", "REJECT", "Same Qc2xc3 sequence duplicated a positive; folded into one tactical-override observation."],
    ["neighbor_negative", "REJECT", "Same Qc2xc3 sequence duplicated again; simplification is now a candidate interpretation, not another truth."],
    ["tactical_override", "REJECT", "Na4xb2 wins a queen and is a pure material tactic, too remote from the target defensive mechanism."],
    ["human_plausible_misconception", "REJECT", "Same g4xf5 input duplicated the constitutive negative; shortcut metadata moved to that observation."],
    ["engine_disagreement", "REJECT", "Same Qc2xc3 sequence duplicated the forced-capture story; no separate disagreement observation remains."],
  ]),
] as const;

export const LEGACY_AUDIT_COUNTS = LEGACY_REFERENCE_AUDIT.reduce<Record<AuditDisposition, number>>((counts, item) => {
  counts[item.disposition] += 1;
  return counts;
}, { KEEP: 0, RELABEL: 0, REPAIR: 0, REJECT: 0 });
