import { describe, expect, it } from "vitest";
import type { PatternOccurrence } from "../patterns/engine";
import { scorePedagogicalMoment } from "./pedagogical-score";

function score(beforeCp: number, afterCp: number): number {
  return scorePedagogicalMoment({ beforeCp, afterCp }).score;
}

describe("pedagogical state scoring", () => {
  it("keeps large deltas inside a winning state at low priority", () => {
    expect(score(600, 400)).toBeLessThan(30);
    expect(score(1_000, 600)).toBeLessThan(30);
  });

  it("prioritizes practical state changes", () => {
    expect(score(200, 0)).toBeGreaterThanOrEqual(75);
    expect(score(0, -300)).toBeGreaterThanOrEqual(90);
    expect(score(100, -100)).toBeGreaterThanOrEqual(85);
    expect(score(-100, -300)).toBeGreaterThanOrEqual(60);
  });

  it("ignores deterioration when the position was already clearly lost", () => {
    expect(score(-700, -1_000)).toBe(0);
  });

  it("recognizes a genuine defensive recovery", () => {
    const result = scorePedagogicalMoment({ beforeCp: -100, afterCp: 0 });
    expect(result.kind).toBe("defensive_resource");
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it("keeps an equal position when a reliable concept was missed", () => {
    const pattern: PatternOccurrence = {
      conceptSlug: "outpost",
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      ply: 24,
      confidence: 0.91,
      opportunity: true,
      success: false,
      source: "pattern_engine_stockfish_validated",
      moveUci: "a1a2",
    };
    const result = scorePedagogicalMoment({ beforeCp: 10, afterCp: 0, patterns: [pattern] });
    expect(result.kind).toBe("stable_pattern");
    expect(result.worthy).toBe(true);
  });
});
