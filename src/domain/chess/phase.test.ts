import { describe, expect, it } from "vitest";
import { classifyPhase } from "./phase";

describe("classifyPhase", () => {
  it("recognizes the initial position as an opening", () => {
    expect(classifyPhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1)).toBe("opening");
  });

  it("recognizes reduced material as an endgame", () => {
    expect(classifyPhase("8/5pk1/6p1/8/5P2/6P1/5K2/8 w - - 0 40", 79)).toBe("endgame");
  });

  it("keeps a queenless position with four rooks and four minor pieces in the middlegame", () => {
    expect(classifyPhase("r3r1k1/pp3ppp/2n1bn2/8/8/2N1BN2/PP3PPP/R3R1K1 w - - 0 25", 49))
      .toBe("middlegame");
  });
});
