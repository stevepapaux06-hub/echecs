import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_REFERENCE_BANK } from "../reference/adjudicated-reference";
import {
  analyzePilotDecision,
  buildVerifiedChessState,
  pilotCandidatesForPosition,
  pilotPromotionScore,
} from "./pilot-engine";
import { pilotPolicyDecision } from "./policy";

describe("hierarchical pilot Pattern Engine", () => {
  it("builds chess facts without naming concepts", () => {
    const state = buildVerifiedChessState("r2q1rk1/pp1nbppp/2p1pn2/8/8/2N1PN2/PPQ1BPPP/R4RK1 w - - 2 13");
    expect(state.sideToMove).toBe("w");
    expect(state.legalMoves).toContain("a1d1");
    expect(state.openFiles).toContain("d");
    expect(state.materialSignature).toMatch(/wk1/);
    expect(Object.keys(state.attackedSquares)).toContain("a1");
    expect(state.pawnStructure.white.islands).toBeGreaterThan(0);
    expect(state.pawnStructure.white.doubledFiles).toEqual([]);
  });

  it("keeps presence, relevance and pedagogical priority distinct", () => {
    const candidate = analyzePilotDecision(
      "r2q1rk1/pp1nbppp/2p1pn2/8/8/2N1PN2/PPQ1BPPP/R4RK1 w - - 2 13",
      "a1d1",
      { requestedConcepts: ["open_file"] },
    )[0];
    expect(candidate?.presence.score).toBeGreaterThanOrEqual(0.9);
    expect(candidate?.decisionRelevance.score).toBeGreaterThanOrEqual(0.6);
    expect(candidate?.pedagogicalPriority.score).toBeGreaterThanOrEqual(0.6);
    expect(candidate?.affordance.target).toBeTruthy();
    expect(candidate?.trainingCandidate).toBe("yes");
  });

  it("lets a tactical urgency override an attractive strategic label", () => {
    const reference = DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === "obs-outpost-a-c3d5");
    expect(reference).toBeTruthy();
    const candidate = analyzePilotDecision(reference!.fen, "c3d5", {
      requestedConcepts: ["outpost"],
    })[0];
    expect(candidate?.presence.score).toBeGreaterThanOrEqual(0.8);
    expect(candidate?.tacticalOverride.active).toBe(true);
    expect(candidate?.pedagogicalPriority.score).toBeLessThan(candidate!.decisionRelevance.score);
    expect(candidate?.abstentions).toContain("tactical_override");
  });

  it("does not turn simple activity into a worst-piece lesson", () => {
    const reference = DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === "obs-worst-a-e2c3");
    expect(reference).toBeTruthy();
    const candidate = analyzePilotDecision(reference!.fen, reference!.move_uci!, {
      requestedConcepts: ["improve_worst_piece"],
    })[0];
    expect(candidate?.trainingCandidate).not.toBe("yes");
    expect(candidate?.constitutiveConditionsFailed.length).toBeGreaterThan(0);
  });

  it("does not mistake a low-mobility sole defender for a disposable worst piece", () => {
    const candidate = analyzePilotDecision(
      "4k3/8/8/8/8/8/Q7/R3K3 w Q - 0 1",
      "a1b1",
      { requestedConcepts: ["improve_worst_piece"] },
    )[0];
    expect(candidate?.confounders).toContain("important_defender");
    expect(candidate?.constitutiveConditionsFailed).toContain("timely");
    expect(candidate?.trainingCandidate).not.toBe("yes");
  });

  it("does not infer opposition pedagogy from king geometry alone", () => {
    const reference = DEVELOPMENT_REFERENCE_BANK.find((item) => item.id === "obs-opposition-a-e6d5");
    expect(reference).toBeTruthy();
    const candidate = analyzePilotDecision(reference!.fen, "e6d5", {
      requestedConcepts: ["opposition"],
    })[0];
    expect(candidate?.presence.score).toBeGreaterThanOrEqual(0.9);
    expect(candidate?.trainingCandidate).not.toBe("yes");
    expect(candidate?.abstentions).toContain("unstable_mechanism");
  });

  it("keeps experimental concepts out of automatic promotion", () => {
    const exchange = analyzePilotDecision(
      "6k1/5ppp/8/8/2p5/3r4/5PPP/3R2K1 w - - 0 1",
      "d1d3",
      { requestedConcepts: ["exchange_attacker"] },
    )[0];
    expect(exchange?.experimental).toBe(true);
    expect(pilotPromotionScore(exchange!)).toBe(0);
    expect(exchange?.abstentions).toContain("insufficient_evidence");
  });

  it("compares the played decision with plausible alternatives", () => {
    const candidate = analyzePilotDecision(
      "4k3/8/8/8/8/8/6K1/R6R w - - 0 1",
      "a1d1",
      { requestedConcepts: ["open_file"], compareDecisions: true },
    )[0];
    expect(candidate?.decisionComparison.candidates[0]).toMatchObject({ moveUci: "a1d1", role: "played" });
    expect(candidate?.decisionComparison.candidates.length).toBeGreaterThan(1);
    expect(candidate?.decisionComparison.equivalentMechanismMoves.length).toBeGreaterThan(0);
    expect(candidate?.decisionComparison.candidates.some((move) => move.role === "same_mechanism")).toBe(true);
  });

  it("lets the compared decision set change relevance and the final training verdict", () => {
    const fen = "r2q1rk1/pp1nbppp/2p1pn2/8/8/b1N1PN2/PPQ1BPPP/R4RK1 w - - 2 13";
    const withoutCompetitor = analyzePilotDecision(fen, "a1d1", {
      requestedConcepts: ["open_file"],
      comparisonMoveUcis: [],
    })[0];
    const withCompetitor = analyzePilotDecision(fen, "a1d1", {
      requestedConcepts: ["open_file"],
      comparisonMoveUcis: ["b2a3"],
    })[0];
    expect(withCompetitor?.decisionComparison.candidates.some((move) => move.role === "tactically_necessary")).toBe(true);
    expect(withCompetitor!.decisionRelevance.score).toBeLessThan(withoutCompetitor!.decisionRelevance.score);
    expect(withCompetitor!.pedagogicalPriority.score).toBeLessThan(withoutCompetitor!.pedagogicalPriority.score);
    expect(withCompetitor?.trainingCandidate).not.toBe(withoutCompetitor?.trainingCandidate);
  });

  it("keeps strict open and semi-open facts truthful and mechanisms distinct", () => {
    const fen = "3qk3/3p4/8/8/8/8/8/R3K3 w Q - 0 1";
    const state = buildVerifiedChessState(fen);
    expect(state.openFiles).not.toContain("d");
    expect(state.semiOpenFiles.white).toContain("d");
    const candidate = analyzePilotDecision(fen, "a1d1", { requestedConcepts: ["open_file"], comparisonMoveUcis: [] })[0];
    expect(candidate?.subject.file_state).toBe("white-semi-open");
    expect(candidate?.mechanism).toBe("semi_open_file_pressure");
    expect(candidate?.evidence[0].claim).toContain("white-semi-open");
  });

  it("checks a future pawn chase through legal routes rather than geometry alone", () => {
    const candidate = analyzePilotDecision(
      "4k3/2p5/2b5/8/4P3/2N5/8/4K3 w - - 0 1",
      "c3d5",
      { requestedConcepts: ["outpost"], comparisonMoveUcis: [] },
    )[0];
    expect(candidate?.subject.future_pawn_chase).toBe("no");
    expect(candidate?.subject.future_pawn_chase_reasons).toContain("candidate_pawn_routes_blocked_or_too_slow");
  });

  it("does not call a blocked heavy piece a connected file contest", () => {
    const candidate = analyzePilotDecision(
      "3rk3/8/8/3p4/8/8/8/R3K3 w Q - 0 1",
      "a1d1",
      { requestedConcepts: ["open_file"], comparisonMoveUcis: [] },
    )[0];
    expect(candidate?.subject.contested_by).toEqual([]);
    expect(candidate?.mechanism).toBe("semi_open_file_pressure");
  });

  it("does not make every major capture or check a dominant tactical override", () => {
    const strategicExchange = analyzePilotDecision(
      "4k3/8/4p3/3n4/2B5/8/8/4K3 w - - 0 1",
      "c4d5",
      { requestedConcepts: ["improve_worst_piece"], comparisonMoveUcis: [] },
    )[0];
    expect(strategicExchange?.tacticalOverride.facts.some((fact) => fact.kind === "strategic_exchange_capture" && fact.role === "incidental")).toBe(true);
    expect(strategicExchange?.tacticalOverride.severity).not.toBe("dominant");

    const incidentalCheck = analyzePilotDecision(
      "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1",
      "a1a8",
      { requestedConcepts: ["open_file"], comparisonMoveUcis: [] },
    )[0];
    expect(incidentalCheck?.tacticalOverride.facts.some((fact) => fact.kind === "incidental_check")).toBe(true);
    expect(incidentalCheck?.tacticalOverride.severity).not.toBe("dominant");
  });

  it("excludes an absolutely pinned nominal defender from effective defense", () => {
    const state = buildVerifiedChessState("k3r3/8/8/8/1b6/2Q5/4N3/4K3 w - - 0 1");
    const queen = state.tacticalVulnerabilities.white.find((item) => item.square === "c3");
    expect(queen?.nominalDefenders).toContain("e2");
    expect(queen?.pinnedDefenders).toContain("e2");
    expect(queen?.effectiveDefenders).not.toContain("e2");
  });

  it("represents a failed synthetic opponent-turn computation as unknown", () => {
    const state = buildVerifiedChessState("4k3/8/8/8/8/8/8/4R1K1 w - - 0 1");
    expect(state.opponentForcingState.status).toBe("unknown");
    expect(state.opponentForcingState.moves).toEqual([]);
  });

  it("propagates tablebase before and after without using WDL as a concept name", () => {
    const candidate = analyzePilotDecision(
      "8/3p4/4k3/8/8/4K3/8/8 w - - 0 1",
      "e3e4",
      {
        requestedConcepts: ["opposition"],
        comparisonMoveUcis: [],
        tablebase: { wdlBefore: "draw", wdlAfter: "win", dtzBefore: 0, dtzAfter: 12 },
      },
    )[0];
    expect(candidate?.subject.tablebase_wdl_before).toBe("draw");
    expect(candidate?.subject.tablebase_wdl_after).toBe("win");
    expect(candidate?.mechanism).toMatch(/opposition|tempo|outflank/);
  });

  it("abstains on distant opposition when the effective method is unsupported", () => {
    const candidate = analyzePilotDecision(
      "4k3/3p4/8/8/8/4K3/8/8 w - - 0 1",
      "e3e4",
      { requestedConcepts: ["opposition"], comparisonMoveUcis: [] },
    )[0];
    expect(candidate?.mechanism).toBe("distant_opposition_unverified");
    expect(candidate?.trainingCandidate).not.toBe("yes");
    expect(candidate?.uncertainty).toContain("Opposition distante non supportée par une preuve de méthode.");
  });

  it("keeps experimental resource semantics safe when viability is unresolved", () => {
    const candidate = analyzePilotDecision(
      "4k3/8/8/8/8/8/8/4R1K1 w - - 0 1",
      "e1e2",
      { requestedConcepts: ["restrict_counterplay"], comparisonMoveUcis: [] },
    )[0];
    expect(candidate?.experimental).toBe(true);
    expect(candidate?.subject.forcing_state_before).toBe("unknown");
    expect(candidate?.subject.resource_viability).toBe("unknown");
    expect(candidate?.trainingCandidate).not.toBe("yes");
    expect(pilotPolicyDecision(candidate!).eligible).toBe(false);
  });

  it("promotes only candidates that survive the hierarchy", () => {
    const promoted = pilotCandidatesForPosition("r2q1rk1/pp1nbppp/2p1pn2/8/8/2N1PN2/PPQ1BPPP/R4RK1 w - - 2 13");
    expect(promoted.some((candidate) => candidate.conceptId === "open_file" && candidate.moveUci === "a1d1")).toBe(true);
    expect(promoted.some((candidate) => candidate.experimental)).toBe(false);
  });

  it("contains no reference-bank or source shortcut in runtime files", () => {
    const runtime = [
      readFileSync(new URL("./pilot-engine.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./engine.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(runtime).not.toMatch(/adjudicated-reference|source-catalog|REFERENCE_SOURCE|REFERENCE_BANK/);
    for (const reference of DEVELOPMENT_REFERENCE_BANK) {
      expect(runtime).not.toContain(reference.fen);
      expect(runtime).not.toContain(reference.id);
    }
  });
});
