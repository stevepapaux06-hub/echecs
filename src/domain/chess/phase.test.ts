import { describe, expect, it } from "vitest";
import { classifyPhase } from "./phase";

describe("classifyPhase", () => {
  it("recognizes the initial position as an opening", () => {
    expect(classifyPhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1)).toBe("opening");
  });

  it("recognizes reduced material as an endgame", () => {
    expect(classifyPhase("8/5pk1/6p1/8/5P2/6P1/5K2/8 w - - 0 40", 79)).toBe("endgame");
  });
});
