import { describe, expect, it } from "vitest";
import { recognizePawnStructure } from "./pawn-structures";

describe("pawn structure recognition", () => {
  it("recognizes an exact French chain", () => {
    expect(recognizePawnStructure("4k3/8/4p3/3pP3/3P4/8/8/4K3 w - - 0 1"))
      .toMatchObject({ structureSlug: "french_chain", confidence: 0.98 });
  });

  it("returns unknown instead of forcing a doubtful label", () => {
    expect(recognizePawnStructure("4k3/8/8/8/4P3/8/8/4K3 w - - 0 1"))
      .toEqual({ structureSlug: "unknown", confidence: 0, evidence: [] });
  });
});
