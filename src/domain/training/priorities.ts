export type WeaknessSignal = {
  conceptSlug: string;
  opportunities: number;
  failures: number;
  confidence?: "low" | "medium" | "high";
  lastSeenAt?: string | null;
};

export type RankedWeakness = WeaknessSignal & {
  failureRate: number;
  priorityScore: number;
};

/**
 * A weakness needs both a meaningful failure rate and enough reliable samples.
 * Recency and repeated failures refine the order without letting a large sample
 * hide a severe 2/4 weakness behind a mild 2/30 weakness.
 */
export function rankWeaknesses(
  signals: WeaknessSignal[],
  now = Date.now(),
): RankedWeakness[] {
  return signals
    .filter((signal) => signal.opportunities >= 2 && signal.failures > 0)
    .map((signal) => {
      const failureRate = signal.failures / signal.opportunities;
      const sampleConfidence = Math.min(18, Math.log2(signal.opportunities + 1) * 4);
      const severity = Math.min(18, signal.failures * 3);
      const detectorConfidence = signal.confidence === "high" ? 10 : signal.confidence === "medium" ? 6 : 2;
      const ageDays = signal.lastSeenAt
        ? Math.max(0, (now - Date.parse(signal.lastSeenAt)) / 86_400_000)
        : 30;
      const recency = Math.max(0, 12 - ageDays / 3);
      return {
        ...signal,
        failureRate,
        priorityScore: Math.round((failureRate * 55 + sampleConfidence + severity + recency + detectorConfidence) * 10) / 10,
      };
    })
    .toSorted((first, second) => (
      second.priorityScore - first.priorityScore
      || second.opportunities - first.opportunities
      || first.conceptSlug.localeCompare(second.conceptSlug)
    ));
}
