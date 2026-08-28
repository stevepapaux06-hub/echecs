import type { EngineEvaluation, EngineLine } from "@/domain/chess/types";
import { buildEngineEvaluation, buildTerminalEvaluation, parseUciInfoLine } from "./uci";

type SearchRequest = {
  fen: string;
  depth: number;
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (error: Error) => void;
  lines: Map<number, EngineLine>;
  timeout: ReturnType<typeof setTimeout>;
};

type TokenWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type EngineAnalysisOptions = {
  depth?: number;
  multiPv?: number;
  timeoutMs?: number;
};

const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

function debugEngineResult(result: EngineEvaluation): void {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("debug") !== "engine") return;

  console.groupCollapsed(
    `[ChessPath · Stockfish] ${result.debug.sideToMove} · profondeur ${result.debug.reachedDepth}`,
  );
  console.debug("FEN", result.debug.fen);
  console.debug("Meilleur coup", result.debug.bestMove);
  console.table(result.debug.lines.map((line) => ({
    multipv: line.multipv,
    depth: line.depth,
    raw: line.rawScore,
    white: line.whiteScore,
    pv: line.pv.join(" "),
  })));
  console.groupEnd();
}

/**
 * Serialized UCI adapter around the local Stockfish Web Worker.
 *
 * One worker owns one active search. Requests are queued, every line is tied to
 * the current FEN, and scores leave this boundary normalized from White's point
 * of view. Domain code can therefore switch to the player's point of view once,
 * without alternating signs after every ply.
 */
export class StockfishClient {
  private worker: Worker | null = null;
  private tokenWaiters = new Map<string, TokenWaiter[]>();
  private search: SearchRequest | null = null;
  private initialized = false;
  private initialization: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private destroyed = false;

  async init(): Promise<void> {
    if (this.destroyed) throw new Error("Le moteur Stockfish a été arrêté.");
    if (this.initialized) return;
    if (this.initialization) return this.initialization;

    this.initialization = this.initialize();
    try {
      await this.initialization;
    } finally {
      this.initialization = null;
    }
  }

  async evaluate(fen: string, depth = 7): Promise<EngineEvaluation> {
    return this.analyze(fen, { depth, multiPv: 1 });
  }

  analyze(fen: string, options: EngineAnalysisOptions = {}): Promise<EngineEvaluation> {
    const depth = Math.max(1, Math.round(options.depth ?? 9));
    const multiPv = Math.min(5, Math.max(1, Math.round(options.multiPv ?? 1)));
    const timeoutMs = Math.max(5_000, options.timeoutMs ?? 20_000);

    const task = this.queue.then(() => this.analyzePosition(fen, depth, multiPv, timeoutMs));
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  destroy(): void {
    this.destroyed = true;
    const error = new Error("Analyse interrompue.");

    if (this.search) {
      clearTimeout(this.search.timeout);
      this.search.reject(error);
      this.search = null;
    }
    this.rejectTokenWaiters(error);
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }

  private async initialize(): Promise<void> {
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      throw new Error("Ce navigateur ne peut pas lancer le moteur local.");
    }

    this.worker = new Worker(ENGINE_URL);
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onWorkerError);
    await this.sendAndWait("uci", "uciok", 12_000);
    this.send("setoption name Hash value 16");
    await this.sendAndWait("isready", "readyok", 12_000);
    this.initialized = true;
  }

  private async analyzePosition(
    fen: string,
    depth: number,
    multiPv: number,
    timeoutMs: number,
  ): Promise<EngineEvaluation> {
    const terminal = buildTerminalEvaluation(fen, depth);
    if (terminal) {
      debugEngineResult(terminal);
      return terminal;
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.init();
        return await this.searchPosition(fen, depth, multiPv, timeoutMs);
      } catch (reason) {
        lastError = reason instanceof Error ? reason : new Error("Réponse Stockfish invalide.");
        if (attempt === 1 || this.destroyed) throw lastError;
        this.resetWorkerForRetry();
      }
    }

    throw lastError ?? new Error("Stockfish n’a pas pu analyser cette position.");
  }

  private resetWorkerForRetry(): void {
    const error = new Error("Redémarrage automatique de Stockfish.");
    this.rejectTokenWaiters(error);
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    this.initialization = null;
  }

  private async searchPosition(
    fen: string,
    depth: number,
    multiPv: number,
    timeoutMs: number,
  ): Promise<EngineEvaluation> {
    if (this.destroyed) throw new Error("Le moteur Stockfish a été arrêté.");
    if (this.search) throw new Error("Une analyse Stockfish est déjà active.");

    this.send(`setoption name MultiPV value ${multiPv}`);
    await this.sendAndWait("isready", "readyok", 12_000);

    return new Promise<EngineEvaluation>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.send("stop");
        this.search = null;
        reject(new Error("L’analyse locale a pris trop de temps."));
      }, timeoutMs);

      this.search = {
        fen,
        depth,
        resolve,
        reject,
        lines: new Map(),
        timeout,
      };
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private async sendAndWait(command: string, token: string, timeoutMs: number): Promise<void> {
    const response = this.waitFor(token, timeoutMs);
    this.send(command);
    return response;
  }

  private waitFor(token: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter: TokenWaiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          const current = this.tokenWaiters.get(token) ?? [];
          const remaining = current.filter((item) => item !== waiter);
          if (remaining.length) this.tokenWaiters.set(token, remaining);
          else this.tokenWaiters.delete(token);
          reject(new Error(`Stockfish n’a pas répondu (${token}).`));
        }, timeoutMs),
      };
      this.tokenWaiters.set(token, [...(this.tokenWaiters.get(token) ?? []), waiter]);
    });
  }

  private rejectTokenWaiters(error: Error): void {
    for (const waiters of this.tokenWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
    }
    this.tokenWaiters.clear();
  }

  private onMessage = (event: MessageEvent<unknown>) => {
    const line = String(event.data ?? "");

    for (const [token, waiters] of this.tokenWaiters) {
      if (!line.includes(token)) continue;
      this.tokenWaiters.delete(token);
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve();
      }
    }

    if (!this.search) return;

    const parsed = parseUciInfoLine(line, this.search.fen);
    if (parsed) {
      const previous = this.search.lines.get(parsed.multipv);
      if (!previous || parsed.depth >= previous.depth) {
        this.search.lines.set(parsed.multipv, parsed);
      }
      return;
    }

    if (line.startsWith("bestmove")) {
      const bestMove = line.split(/\s+/)[1] ?? "";
      const search = this.search;
      this.search = null;
      clearTimeout(search.timeout);

      try {
        const result = buildEngineEvaluation({
          fen: search.fen,
          requestedDepth: search.depth,
          bestMove,
          lines: [...search.lines.values()],
        });
        debugEngineResult(result);
        search.resolve(result);
      } catch (reason) {
        search.reject(reason instanceof Error ? reason : new Error("Réponse Stockfish invalide."));
      }
    }
  };

  private onWorkerError = () => {
    const error = new Error("Le moteur Stockfish local n’a pas pu démarrer.");
    this.rejectTokenWaiters(error);
    this.initialized = false;
    this.worker?.terminate();
    this.worker = null;
    if (!this.search) return;
    const search = this.search;
    this.search = null;
    clearTimeout(search.timeout);
    search.reject(error);
  };
}
