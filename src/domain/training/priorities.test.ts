import { describe, expect, it } from "vitest";
import { rankWeaknesses } from "./priorities";

describe("training weakness priorities", () => {
  it("prioritizes two failures in four opportunities above two in thirty", () => {
    const ranked = rankWeaknesses([
      { conceptSlug: "fork", opportunities: 30, failures: 2 },
      { conceptSlug: "opponent_threat", opportunities: 4, failures: 2 },
    ]);
    expect(ranked.map((weakness) => weakness.conceptSlug)).toEqual(["opponent_threat", "fork"]);
  });

  it("ignores signals without a reliable opportunity sample", () => {
    expect(rankWeaknesses([
      { conceptSlug: "pin", opportunities: 1, failures: 1 },
      { conceptSlug: "fork", opportunities: 12, failures: 0 },
    ])).toEqual([]);
  });
});
