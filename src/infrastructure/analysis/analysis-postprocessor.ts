import type { AnalyzedGame, DiagnosticMetrics } from "@/domain/chess/types";
import type { AnalysisPostprocessResult } from "@/domain/chess/analyze";

type WorkerResponse =
  | { id: number; ok: true; ready: true }
  | { id: number; ok: true; result: AnalysisPostprocessResult }
  | { id: number; ok: false; error: string };

type Pending = {
  resolve: (result: AnalysisPostprocessResult | null) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function resetWorker(error: Error): void {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(error);
  }
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  worker = new Worker(new URL("./analysis-postprocessor.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(event.data.id);
    if (!event.data.ok) request.reject(new Error(event.data.error));
    else request.resolve("result" in event.data ? event.data.result : null);
  });
  worker.addEventListener("error", () => {
    resetWorker(new Error("Le module de préparation pédagogique n’a pas pu démarrer."));
  });
  return worker;
}

function requestWorker(
  request: { type: "warmup" } | { type: "generate"; games: AnalyzedGame[]; metrics: DiagnosticMetrics },
): Promise<AnalysisPostprocessResult | null> {
  const activeWorker = ensureWorker();
  if (!activeWorker) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      resetWorker(new Error("La préparation de l’entraînement a pris trop de temps."));
    }, 120_000);
    pending.set(id, { resolve, reject, timeout });
    activeWorker.postMessage({ id, ...request });
  });
}

/** Starts loading the large immutable bank while Stockfish is already working. */
export async function warmAnalysisPostprocessor(): Promise<void> {
  if (typeof Worker === "undefined") return;
  await requestWorker({ type: "warmup" });
}

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
  return requestWorker({ type: "generate", games, metrics }).then((result) => {
    if (!result) throw new Error("La préparation pédagogique n’a renvoyé aucun résultat.");
    return result;
  });
}
