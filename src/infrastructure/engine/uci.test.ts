import { describe, expect, it } from "vitest";
import {
  MATE_SCORE_CP,
  buildEngineEvaluation,
  evaluationForPlayer,
  parseUciInfoLine,
  scoreToComparableCp,
  sideToMoveFromFen,
} from "./uci";

const WHITE_TO_MOVE = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
const BLACK_TO_MOVE = "4k3/8/8/8/8/8/8/4K3 b - - 0 1";

describe("UCI score normalization", () => {
  it("reads the side to move from FEN", () => {
    expect(sideToMoveFromFen(WHITE_TO_MOVE)).toBe("w");
    expect(sideToMoveFromFen(BLACK_TO_MOVE)).toBe("b");
  });

  it("keeps a positive White score when White has the move", () => {
    const parsed = parseUciInfoLine(
      "info depth 10 multipv 1 score cp 125 nodes 50 pv e1e2 e8e7",
      WHITE_TO_MOVE,
    );

    expect(parsed?.rawScore).toEqual({ type: "cp", value: 125 });
    expect(parsed?.whiteCp).toBe(125);
  });

  it("flips a side-to-move score exactly once when Black has the move", () => {
    const parsed = parseUciInfoLine(
      "info depth 10 multipv 1 score cp -340 nodes 50 pv e8e7 e1e2",
      BLACK_TO_MOVE,
    );

    expect(parsed?.rawScore).toEqual({ type: "cp", value: -340 });
    expect(parsed?.whiteScore).toEqual({ type: "cp", value: 340 });
    expect(evaluationForPlayer(parsed?.whiteCp ?? 0, "black")).toBe(-340);
  });

  it("preserves mate direction and keeps it beyond centipawn scores", () => {
    const whiteMate = parseUciInfoLine(
      "info depth 8 multipv 1 score mate 2 nodes 80 pv f7f8 h8h7",
      WHITE_TO_MOVE,
    );
    const blackGetsMated = parseUciInfoLine(
      "info depth 8 multipv 1 score mate -2 nodes 80 pv h8h7 f7f8",
      BLACK_TO_MOVE,
    );

    expect(whiteMate?.whiteScore).toEqual({ type: "mate", value: 2 });
    expect(blackGetsMated?.whiteScore).toEqual({ type: "mate", value: 2 });
    expect(scoreToComparableCp({ type: "mate", value: 2 })).toBeGreaterThan(MATE_SCORE_CP - 100);
  });

  it("builds ordered MultiPV output and uses the explicit bestmove", () => {
    const second = parseUciInfoLine(
      "info depth 9 multipv 2 score cp 24 nodes 90 pv g1f3 g8f6",
      WHITE_TO_MOVE,
    );
    const first = parseUciInfoLine(
      "info depth 10 multipv 1 score cp 31 nodes 100 pv e2e4 e7e5",
      WHITE_TO_MOVE,
    );
    if (!first || !second) throw new Error("Fixture UCI invalide");

    const evaluation = buildEngineEvaluation({
      fen: WHITE_TO_MOVE,
      requestedDepth: 10,
      bestMove: "d2d4",
      lines: [second, first],
    });

    expect(evaluation.bestMove).toBe("d2d4");
    expect(evaluation.lines.map((line) => line.multipv)).toEqual([1, 2]);
    expect(evaluation.debug.lines[0].rawScore).toBe("cp 31");
  });
});
