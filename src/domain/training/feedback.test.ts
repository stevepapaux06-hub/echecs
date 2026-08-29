import { Chess, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import type { EngineEvaluation, EngineLine, TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import { buildSequenceFeedback, buildTrainingFeedback, gradeMove, uciLineToSan } from "./feedback";

function evaluation(fen: string, whiteCp: number, variations: string[][]): EngineEvaluation {
  const sideToMove = fen.split(" ")[1] as "w" | "b";
  const lines: EngineLine[] = variations.map((pv, index) => ({
    multipv: index + 1,
    depth: 10,
    rawScore: { type: "cp", value: sideToMove === "w" ? whiteCp - index * 10 : -(whiteCp - index * 10) },
    whiteScore: { type: "cp", value: whiteCp - index * 10 },
    whiteCp: whiteCp - index * 10,
    pv,
  }));
  const bestMove = variations[0]?.[0] ?? "";

  return {
    fen,
    sideToMove,
    whiteCp,
    bestMove,
    depth: 10,
    lines,
    debug: {
      fen,
      sideToMove,
      requestedDepth: 10,
      reachedDepth: 10,
      bestMove,
      lines: [],
    },
  };
}

function afterMove(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.slice(4, 5) || "q",
  });
  return chess.fen();
}

function exercise(fen: string, playerColor: "white" | "black", type: "mistake" | "conversion"): TrainingExercise {
  return {
    id: "test",
    type,
    origin: "personal",
    mode: "one-move",
    theme: "test",
    conceptSlug: "test-concept",
    category: type === "conversion" ? "conversion" : "tactic",
    title: "Test",
    prompt: "Test",
    sourceLabel: "Test",
    fen,
    playerColor,
    bestMove: "",
    baselinePlayerCp: 0,
    phase: "middlegame",
    concept: "Comprendre l’idée.",
    maxPlayerMoves: 1,
  };
}

describe("training feedback", () => {
  it("uses evaluation loss, not strict equality with the first move", () => {
    expect(gradeMove(20)).toBe("excellent");
    expect(gradeMove(21)).toBe("very-good");
    expect(gradeMove(75)).toBe("playable");
    expect(gradeMove(150)).toBe("inaccuracy");
    expect(gradeMove(181)).toBe("mistake");
  });

  it("detects a large loss after a legal bad move", () => {
    const fen = "4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1";
    const playedMove = "e1f1";
    const baseline = evaluation(fen, 749, [
      ["d1d2", "e8e7"],
      ["e1d2", "e8d7"],
      ["e1f1", "d2d1"],
    ]);
    const after = evaluation(afterMove(fen, playedMove), -813, [["d2d1", "f1f2"]]);

    const feedback = buildTrainingFeedback({
      fen,
      playerColor: "white",
      exercise: exercise(fen, "white", "mistake"),
      playedMove,
      playedMoveSan: "Kf1",
      baseline,
      after,
    });

    expect(feedback.grade).toBe("mistake");
    expect(feedback.lossCp).toBe(1_562);
    expect(feedback.bestMove).toBe("d1d2");
    expect(feedback.candidates).toHaveLength(3);
  });

  it("calculates loss from Black's perspective without changing signs by ply", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    const playedMove = "e7e5";
    const baseline = evaluation(fen, -300, [["d7d5", "d2d4"], ["e7e5", "e2e4"]]);
    const after = evaluation(afterMove(fen, playedMove), -100, [["e2e4", "g8f6"]]);

    const feedback = buildTrainingFeedback({
      fen,
      playerColor: "black",
      exercise: exercise(fen, "black", "conversion"),
      playedMove,
      playedMoveSan: "e5",
      baseline,
      after,
    });

    expect(feedback.lossCp).toBe(200);
    expect(feedback.grade).toBe("mistake");
  });

  it("renders a short legal PV in SAN", () => {
    const start = new Chess().fen();
    expect(uciLineToSan(start, ["e2e4", "e7e5", "g1f3"])).toBe("e4 e5 Nf3");
  });

  it("explains that a sound move with another idea does not master the concept", () => {
    const opening = allConceptExercises().find((candidate) => (
      candidate.id === "concept-opening-develop-with-tempo"
    ))!;
    const initial = evaluation(opening.fen, 20, [["g1f3"], ["b1c3"]]);
    const feedback = buildSequenceFeedback({
      exercise: opening,
      initial,
      moves: ["b1c3"],
      result: "partial",
      lossCp: 10,
      afterPlayerCp: 10,
      pedagogicalMove: "good-alternative",
    });
    expect(feedback.body).toContain("est bon, mais il ne correspond pas à l’idée travaillée ici");
  });
});
