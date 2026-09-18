import { generateExercisesWithAudit } from "@/domain/training/generate";
import type { AnalyzedGame, DiagnosticMetrics } from "@/domain/chess/types";

type Request =
  | { id: number; type: "warmup" }
  | { id: number; type: "generate"; games: AnalyzedGame[]; metrics: DiagnosticMetrics };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  if (event.data.type === "warmup") {
    self.postMessage({ id: event.data.id, ok: true, ready: true });
    return;
  }
  try {
    const result = generateExercisesWithAudit(event.data.games, event.data.metrics);
    self.postMessage({ id: event.data.id, ok: true, result });
  } catch (reason) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error: reason instanceof Error ? reason.message : "La préparation pédagogique a échoué.",
    });
  }
});
