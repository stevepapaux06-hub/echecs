import { describe, expect, it } from "vitest";
import { advanceVisualProgress, progressForPhase } from "./analysis-progress";

describe("analysis progress", () => {
  it("maps real checkpoints inside their actual pipeline phase", () => {
    expect(progressForPhase("preparation", 0, 10)).toBe(4);
    expect(progressForPhase("analysis", 5, 10)).toBe(46);
    expect(progressForPhase("identification", 10, 10)).toBe(90);
    expect(progressForPhase("finalization", 0, 1)).toBe(97);
  });

  it("moves visually between checkpoints without crossing the phase ceiling", () => {
    let visual = 4;
    const values = [visual];
    for (let index = 0; index < 200; index += 1) {
      visual = advanceVisualProgress(visual, 4, "preparation");
      values.push(visual);
    }
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
    expect(visual).toBeGreaterThan(4);
    expect(visual).toBeLessThanOrEqual(20);
  });

  it("never reaches 100 before the real completion signal", () => {
    let visual = 98;
    for (let index = 0; index < 500; index += 1) {
      visual = advanceVisualProgress(visual, 99, "finalization");
    }
    expect(visual).toBe(99);
    expect(advanceVisualProgress(visual, 100, "finalization")).toBe(100);
  });

  it("never goes backwards when a stale checkpoint arrives", () => {
    expect(advanceVisualProgress(88, 72, "identification")).toBeGreaterThanOrEqual(88);
  });
});
