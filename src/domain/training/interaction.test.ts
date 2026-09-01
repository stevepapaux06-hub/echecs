import { describe, expect, it } from "vitest";
import { isLegalTrainingDrop } from "./interaction";

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
});
