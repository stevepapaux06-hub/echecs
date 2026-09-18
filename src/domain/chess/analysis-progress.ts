export type AnalysisPhase =
  | "preparation"
  | "analysis"
  | "identification"
  | "training"
  | "finalization";

export const ANALYSIS_PHASE_LABELS: Record<AnalysisPhase, string> = {
  preparation: "Préparation",
  analysis: "Analyse de la partie",
  identification: "Identification des moments",
  training: "Préparation de l’entraînement",
  finalization: "Finalisation",
};

const PHASE_RANGES: Record<AnalysisPhase, readonly [number, number]> = {
  preparation: [4, 20],
  analysis: [20, 72],
  identification: [72, 90],
  training: [90, 97],
  finalization: [97, 99],
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
): number {
  if (actual >= 100) return 100;
  const [, ceiling] = PHASE_RANGES[phase];
  const caughtUp = Math.max(current, Math.min(actual, 99));
  if (caughtUp >= ceiling) return caughtUp;

  // Keep the UI alive between real checkpoints without claiming that the next
  // phase has completed. The phase ceiling prevents fabricated completion.
  const remaining = ceiling - caughtUp;
  return Math.min(ceiling, caughtUp + Math.max(0.12, remaining * 0.025));
}

export function phaseIsComplete(current: AnalysisPhase, target: AnalysisPhase): boolean {
  const order: AnalysisPhase[] = [
    "preparation",
    "analysis",
    "identification",
    "training",
    "finalization",
  ];
  return order.indexOf(current) > order.indexOf(target);
}
