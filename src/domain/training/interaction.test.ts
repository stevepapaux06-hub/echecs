import { describe, expect, it } from "vitest";
import { isLegalTrainingDrop, legalMoveTargets } from "./interaction";

const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("isLegalTrainingDrop", () => {
  it("accepts a legal move synchronously", () => {
    expect(isLegalTrainingDrop(initialFen, "e2", "e4")).toBe(true);
  });

  it("rejects an illegal move instead of acknowledging the drop", () => {
    expect(isLegalTrainingDrop(initialFen, "e2", "e5")).toBe(false);
  });

  it("rejects a piece belonging to the side that is not to move", () => {
    expect(isLegalTrainingDrop(initialFen, "e7", "e5")).toBe(false);
  });

  it("rejects a cancelled drop", () => {
    expect(isLegalTrainingDrop(initialFen, "e2", null)).toBe(false);
  });

  it("returns legal quiet and capture targets for click-to-move", () => {
    expect(legalMoveTargets(initialFen, "e2")).toEqual([
      { square: "e3", capture: false },
      { square: "e4", capture: false },
    ]);
    expect(legalMoveTargets("8/8/8/3p4/4P3/8/8/4K2k w - - 0 1", "e4"))
      .toContainEqual({ square: "d5", capture: true });
  });

  it("does not select an opponent piece", () => {
    expect(legalMoveTargets(initialFen, "e7")).toEqual([]);
  });
});
