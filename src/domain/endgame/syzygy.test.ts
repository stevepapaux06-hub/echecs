import { describe, expect, it } from "vitest";
import { isSyzygyEligible } from "./syzygy";

describe("Syzygy extension point", () => {
  it("limits probing to seven-piece positions", () => {
    expect(isSyzygyEligible("8/8/8/8/8/8/4K3/6k1 w - - 0 1")).toBe(true);
    expect(isSyzygyEligible("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(false);
  });
});
