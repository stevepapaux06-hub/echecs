import { generateExercisesWithAudit } from "@/domain/training/generate";
import type { AnalyzedGame, DiagnosticMetrics } from "@/domain/chess/types";

type Request = { games: AnalyzedGame[]; metrics: DiagnosticMetrics };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  try {
    const result = generateExercisesWithAudit(event.data.games, event.data.metrics);
    self.postMessage({ ok: true, result });
  } catch (reason) {
    self.postMessage({
      ok: false,
      error: reason instanceof Error ? reason.message : "La préparation pédagogique a échoué.",
    });
  }
});
