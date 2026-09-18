import type { AnalyzedGame, DiagnosticMetrics } from "@/domain/chess/types";
import type { AnalysisPostprocessResult } from "@/domain/chess/analyze";

type WorkerResponse =
  | { ok: true; result: AnalysisPostprocessResult }
  | { ok: false; error: string };

/** Loads the large exercise bank and builds the final reserve off the UI thread. */
export function generateExercisesOffMainThread(
  games: AnalyzedGame[],
  metrics: DiagnosticMetrics,
): Promise<AnalysisPostprocessResult> {
  if (typeof Worker === "undefined") {
    return import("@/domain/training/generate").then(({ generateExercisesWithAudit }) => (
      generateExercisesWithAudit(games, metrics)
    ));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./analysis-postprocessor.worker.ts", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("La préparation de l’entraînement a pris trop de temps."));
    }, 60_000);

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    }, { once: true });
    worker.addEventListener("error", () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error("Le module de préparation pédagogique n’a pas pu démarrer."));
    }, { once: true });
    worker.postMessage({ games, metrics });
  });
}
