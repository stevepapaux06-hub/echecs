import type { AnalysisPatternProcessor, PatternClassification, PatternClassificationInput } from "@/domain/chess/analyze";
import type { MoveSnapshot } from "@/domain/chess/types";
import type { PositionPatternCandidate } from "@/domain/patterns/engine";

type JobResult<T> = { index: number; value: T };
type WorkerResponse<T> =
  | { id: number; type: "progress"; completed: number; total: number }
  | { id: number; type: "result"; results: Array<JobResult<T>> }
  | { id: number; type: "error"; error: string };

type PendingJob<T> = {
  resolve: (results: Array<JobResult<T>>) => void;
  reject: (error: Error) => void;
  onProgress?: (completed: number, total: number) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const MAX_WORKER_COUNT = 6;
const MAX_JOB_MS = 8 * 60_000;

class PatternWorkerPool {
  private workers: Worker[] = [];
  private nextId = 1;
  private pending = new Map<number, PendingJob<unknown>>();

  private ensureWorkers(count: number): Worker[] {
    while (this.workers.length < count) {
      const worker = new Worker(new URL("./analysis-patterns.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", this.onMessage);
      worker.addEventListener("error", this.onError);
      this.workers.push(worker);
    }
    return this.workers;
  }

  async run<TInput, TOutput>(
    type: "scan" | "classify",
    items: TInput[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<TOutput[]> {
    if (!items.length) return [];
    const logicalProcessors = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
    const workerCount = Math.min(items.length, MAX_WORKER_COUNT, Math.max(2, logicalProcessors - 2));
    const workers = this.ensureWorkers(workerCount).slice(0, workerCount);
    const chunks = workers.map(() => [] as Array<{ index: number; move: TInput }>);
    items.forEach((move, index) => chunks[index % chunks.length].push({ index, move }));
    const completedByChunk = new Array(chunks.length).fill(0) as number[];
    const results = await Promise.all(chunks.map((chunk, chunkIndex) => this.runChunk<TInput, TOutput>(
      workers[chunkIndex],
      type,
      chunk,
      (completed) => {
        completedByChunk[chunkIndex] = completed;
        onProgress?.(completedByChunk.reduce((sum, value) => sum + value, 0), items.length);
      },
    )));
    return results.flat().toSorted((first, second) => first.index - second.index).map((item) => item.value);
  }

  private runChunk<TInput, TOutput>(
    worker: Worker,
    type: "scan" | "classify",
    items: Array<{ index: number; move: TInput }>,
    onProgress?: (completed: number) => void,
  ): Promise<Array<JobResult<TOutput>>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.reset(new Error("La classification pédagogique a dépassé le temps maximal autorisé."));
      }, MAX_JOB_MS);
      this.pending.set(id, {
        resolve: resolve as PendingJob<unknown>["resolve"],
        reject,
        onProgress: (completed) => onProgress?.(completed),
        timeout,
      });
      worker.postMessage({ id, type, items });
    });
  }

  private onMessage = (event: MessageEvent<WorkerResponse<unknown>>) => {
    const pending = this.pending.get(event.data.id);
    if (!pending) return;
    if (event.data.type === "progress") {
      pending.onProgress?.(event.data.completed, event.data.total);
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(event.data.id);
    if (event.data.type === "result") pending.resolve(event.data.results);
    else pending.reject(new Error(event.data.error));
  };

  private onError = () => {
    this.reset(new Error("Le module de classification pédagogique n’a pas pu démarrer."));
  };

  private reset(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
  }
}

let pool: PatternWorkerPool | null = null;

function workerPool(): PatternWorkerPool {
  pool ??= new PatternWorkerPool();
  return pool;
}

export const processPatternsOffMainThread: AnalysisPatternProcessor = {
  scan: (moves: MoveSnapshot[]) => workerPool().run<MoveSnapshot, PositionPatternCandidate[]>("scan", moves),
  classify: (moves: PatternClassificationInput[], onProgress) => (
    workerPool().run<PatternClassificationInput, PatternClassification>("classify", moves, onProgress)
  ),
};
