import { describe, expect, it } from "vitest";
import { addGameConceptSample, addTrainingConceptAttempt } from "./concept-stats";

describe("concept performance counters", () => {
  it("updates reliable game opportunities and failures", () => {
    expect(addGameConceptSample(undefined, { opportunities: 9, successes: 3 })).toMatchObject({
      opportunities: 9,
      successes: 3,
      failures: 6,
      gameOpportunities: 9,
      gameSuccesses: 3,
      masteryScore: 33.33,
    });
  });

  it("updates training attempts without inventing game opportunities", () => {
    const game = addGameConceptSample(undefined, { opportunities: 4, successes: 3 });
    const trained = addTrainingConceptAttempt(game, true);
    expect(trained).toMatchObject({
      opportunities: 4,
      successes: 3,
      trainingAttempts: 1,
      trainingSuccesses: 1,
      masteryScore: 80,
    });
  });
});
