import { describe, expect, it } from "vitest";
import {
  MATE_SCORE_CP,
  buildEngineEvaluation,
  buildTerminalEvaluation,
  evaluationForPlayer,
  formatWhiteCentricEvaluation,
  parseUciInfoLine,
  scoreToComparableCp,
  sideToMoveFromFen,
} from "./uci";

const WHITE_TO_MOVE = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
const BLACK_TO_MOVE = "4k3/8/8/8/8/8/8/4K3 b - - 0 1";

describe("UCI score normalization", () => {
  it("formats every displayed evaluation from White's perspective", () => {
    expect(formatWhiteCentricEvaluation(275)).toBe("+2.8");
    expect(formatWhiteCentricEvaluation(-275)).toBe("−2.8");
    expect(formatWhiteCentricEvaluation(0)).toBe("0.0");
  });
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

  it("resolves checkmates without requiring a principal variation", () => {
    const whiteMated = buildTerminalEvaluation(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
      8,
    );
    const blackMated = buildTerminalEvaluation(
      "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
      8,
    );

    expect(whiteMated?.whiteCp).toBe(-MATE_SCORE_CP);
    expect(whiteMated?.mate).toBe(-1);
    expect(whiteMated?.bestMove).toBe("");
    expect(blackMated?.whiteCp).toBe(MATE_SCORE_CP);
    expect(blackMated?.mate).toBe(1);
  });

  it("scores a terminal draw as equal", () => {
    const stalemate = buildTerminalEvaluation(
      "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
      8,
    );

    expect(stalemate?.whiteCp).toBe(0);
    expect(stalemate?.mate).toBeUndefined();
    expect(stalemate?.lines).toEqual([]);
  });
});
