import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_REFERENCE_BANK } from "../reference/adjudicated-reference";
import {
  analyzePilotDecision,
  buildVerifiedChessState,
  pilotCandidatesForPosition,
  pilotPromotionScore,
} from "./pilot-engine";

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
