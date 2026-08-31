export type ConceptStatCounters = {
  opportunities: number;
  successes: number;
  failures: number;
  trainingAttempts: number;
  trainingSuccesses: number;
  gameOpportunities: number;
  gameSuccesses: number;
  masteryScore: number | null;
};

const EMPTY: ConceptStatCounters = {
  opportunities: 0,
  successes: 0,
  failures: 0,
  trainingAttempts: 0,
  trainingSuccesses: 0,
  gameOpportunities: 0,
  gameSuccesses: 0,
  masteryScore: null,
};

function withMastery(counters: Omit<ConceptStatCounters, "masteryScore">): ConceptStatCounters {
  const measured = counters.gameOpportunities + counters.trainingAttempts;
  return {
    ...counters,
    masteryScore: measured
      ? Math.round((counters.gameSuccesses + counters.trainingSuccesses) / measured * 10_000) / 100
      : null,
  };
}

export function addGameConceptSample(
  previous: ConceptStatCounters | undefined,
  sample: { opportunities: number; successes: number },
): ConceptStatCounters {
  const current = previous ?? EMPTY;
  const gameOpportunities = current.gameOpportunities + sample.opportunities;
  const gameSuccesses = current.gameSuccesses + sample.successes;
  return withMastery({
    opportunities: gameOpportunities,
    successes: gameSuccesses,
    failures: gameOpportunities - gameSuccesses,
    trainingAttempts: current.trainingAttempts,
    trainingSuccesses: current.trainingSuccesses,
    gameOpportunities,
    gameSuccesses,
  });
}

export function addTrainingConceptAttempt(
  previous: ConceptStatCounters | undefined,
  success: boolean,
): ConceptStatCounters {
  const current = previous ?? EMPTY;
  return withMastery({
    opportunities: current.gameOpportunities,
    successes: current.gameSuccesses,
    failures: current.gameOpportunities - current.gameSuccesses,
    trainingAttempts: current.trainingAttempts + 1,
    trainingSuccesses: current.trainingSuccesses + Number(success),
    gameOpportunities: current.gameOpportunities,
    gameSuccesses: current.gameSuccesses,
  });
}
