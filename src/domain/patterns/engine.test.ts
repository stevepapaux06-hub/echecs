import { describe, expect, it } from "vitest";
import { detectMovePatterns } from "./engine";

describe("deterministic Pattern Engine", () => {
  it("recognizes an obvious knight fork", () => {
    const patterns = detectMovePatterns("4k3/8/4q1r1/8/8/3N4/8/K7 w - - 0 1", "d3f4");
    expect(patterns).toContainEqual({ conceptSlug: "fork", confidence: 0.95 });
  });

  it("recognizes an absolute pin on the king", () => {
    const patterns = detectMovePatterns("4k3/8/4n3/8/8/8/8/R6K w - - 0 1", "a1e1");
    expect(patterns.some((pattern) => pattern.conceptSlug === "pin" && pattern.confidence >= 0.9)).toBe(true);
  });

  it("recognizes the capture of a loose piece", () => {
    const patterns = detectMovePatterns("4k3/8/8/8/8/8/4q3/4R2K w - - 0 1", "e1e2");
    expect(patterns.some((pattern) => pattern.conceptSlug === "loose_piece" && pattern.confidence >= 0.9)).toBe(true);
  });

  it("does not attach a high-confidence concept to an ambiguous quiet move", () => {
    const patterns = detectMovePatterns("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "a2a3");
    expect(patterns.filter((pattern) => pattern.confidence >= 0.8)).toEqual([]);
  });
});
