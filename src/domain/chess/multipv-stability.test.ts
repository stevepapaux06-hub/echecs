import { describe, expect, it } from "vitest";
import type { EngineEvaluation, EngineLine } from "./types";
import {
  assessMultiPvStability,
  needsAdaptiveMultiPvProbe,
} from "./multipv-stability";

const FEN = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";

function evaluation(depth: number, candidates: Array<[string, number]>): EngineEvaluation {
  const lines: EngineLine[] = candidates.map(([move, cp], index) => ({
    multipv: index + 1,
    depth,
    rawScore: { type: "cp", value: cp },
    whiteScore: { type: "cp", value: cp },
    whiteCp: cp,
    pv: [move],
  }));
  return {
    fen: FEN,
    sideToMove: "w",
    whiteCp: lines[0].whiteCp,
    bestMove: lines[0].pv[0],
    depth,
    lines,
    debug: { fen: FEN, sideToMove: "w", requestedDepth: depth, reachedDepth: depth, bestMove: lines[0].pv[0], lines: [] },
  };
}

describe("adaptive MultiPV stability", () => {
  it("requests a deeper probe when close candidates can exchange rank", () => {
    const shallow = evaluation(8, [["a1a2", 10]]);
    const depth10 = evaluation(10, [["a1a2", 20], ["a1b1", -80]]);
    expect(needsAdaptiveMultiPvProbe(shallow, depth10, "white")).toBe(true);
  });

  it("turns a depth-dependent top move into a multi-plan contract", () => {
    const depth10 = evaluation(10, [["a1a2", 2], ["a1b1", -101]]);
    const depth12 = evaluation(12, [["a1b1", 95], ["a1a2", 94], ["a1b2", -40]]);
    expect(assessMultiPvStability([depth10, depth12], "white")).toMatchObject({
      status: "multi_plan",
      acceptedMoveUcis: ["a1b1", "a1a2"],
      maxDepthReached: 12,
    });
  });

  it("keeps oscillating rankings unstable at the cost ceiling", () => {
    const depth10 = evaluation(10, [["a1a2", 40], ["a1b1", -120]]);
    const depth12 = evaluation(12, [["a1b1", 180], ["a1a2", 0]]);
    const depth14 = evaluation(14, [["a1a2", 220], ["a1b1", 0]]);
    expect(assessMultiPvStability([depth10, depth12, depth14], "white", true)).toMatchObject({
      status: "unstable",
      acceptedMoveUcis: [],
      budgetExhausted: true,
    });
  });

  it("fails closed when the adaptive budget ends before confirmation depth", () => {
    const shallow = evaluation(8, [["a1a2", 10]]);
    const depth10 = evaluation(10, [["a1a2", 20], ["a1b1", 15]]);
    expect(assessMultiPvStability([shallow, depth10], "white", true)).toMatchObject({
      status: "unstable",
      acceptedMoveUcis: [],
      maxDepthReached: 10,
      budgetExhausted: true,
    });
  });
});
