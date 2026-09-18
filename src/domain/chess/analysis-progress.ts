export type AnalysisPhase =
  | "preparation"
  | "analysis"
  | "identification"
  | "training"
  | "saving"
  | "finalization";

export const ANALYSIS_PHASE_LABELS: Record<AnalysisPhase, string> = {
  preparation: "Préparation",
  analysis: "Analyse de la partie",
  identification: "Identification des moments",
  training: "Préparation de l’entraînement",
  saving: "Sauvegarde",
  finalization: "Finalisation",
};

// These ranges reflect the measured browser pipeline: pattern preparation and
// classification dominate multi-game runs, Stockfish is the second large
// phase, while exercise assembly and persistence are shorter but observable.
const PHASE_RANGES: Record<AnalysisPhase, readonly [number, number]> = {
  preparation: [4, 24],
  analysis: [24, 58],
  identification: [58, 87],
  training: [87, 94],
  saving: [94, 98],
  finalization: [98, 99],
};

export function progressForPhase(
  phase: AnalysisPhase,
  completed: number,
  total: number,
): number {
  const [start, end] = PHASE_RANGES[phase];
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  return start + (end - start) * ratio;
}

export function advanceVisualProgress(
  current: number,
  actual: number,
  phase: AnalysisPhase,
  elapsedMs = 350,
  observedActualRate = 0,
): number {
  if (actual >= 100) return 100;
  const [start, ceiling] = PHASE_RANGES[phase];
  const caughtUp = Math.max(current, Math.min(actual, 99));
  if (caughtUp >= ceiling) return caughtUp;

  // Follow the measured checkpoint velocity, then decelerate as the phase
  // ceiling approaches. This is interpolation inside real phase boundaries,
  // not a fake fixed-duration estimate of the whole analysis.
  const remaining = ceiling - caughtUp;
  const range = Math.max(1, ceiling - start);
  const velocity = Math.min(2.4, Math.max(0.18, observedActualRate * 0.3));
  const deceleration = Math.min(1, Math.max(0.12, remaining / (range * 0.35)));
  const step = velocity * Math.max(0.05, elapsedMs / 1_000) * deceleration;
  return Math.min(ceiling, caughtUp + step);
}

export function phaseIsComplete(current: AnalysisPhase, target: AnalysisPhase): boolean {
  const order: AnalysisPhase[] = [
    "preparation",
    "analysis",
    "identification",
    "training",
    "saving",
    "finalization",
  ];
  return order.indexOf(current) > order.indexOf(target);
}
