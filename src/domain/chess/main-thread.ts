type BrowserScheduler = { yield?: () => Promise<void> };

/** Lets the browser paint and process input between CPU-heavy analysis batches. */
export async function yieldToMainThread(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: BrowserScheduler }).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function measureAnalysisPhase<T>(label: string, operation: () => T): T {
  if (process.env.NODE_ENV !== "development" || typeof performance === "undefined") {
    return operation();
  }
  const startedAt = performance.now();
  try {
    return operation();
  } finally {
    console.debug(`[ChessPath · Analyse] ${label}: ${(performance.now() - startedAt).toFixed(1)} ms`);
  }
}

export async function measureAnalysisPhaseAsync<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV !== "development" || typeof performance === "undefined") {
    return operation();
  }
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    console.debug(`[ChessPath · Analyse] ${label}: ${(performance.now() - startedAt).toFixed(1)} ms`);
  }
}

export function createAnalysisTimer(label: string): {
  measure: <T>(operation: () => T) => T;
  report: () => void;
} {
  let duration = 0;
  return {
    measure<T>(operation: () => T): T {
      if (process.env.NODE_ENV !== "development" || typeof performance === "undefined") {
        return operation();
      }
      const startedAt = performance.now();
      try {
        return operation();
      } finally {
        duration += performance.now() - startedAt;
      }
    },
    report(): void {
      if (process.env.NODE_ENV === "development") {
        console.debug(`[ChessPath · Analyse] ${label}: ${duration.toFixed(1)} ms CPU`);
      }
    },
  };
}
