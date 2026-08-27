import type { EngineEvaluation } from "@/domain/chess/types";

type SearchRequest = {
  fen: string;
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (error: Error) => void;
  latest: EngineEvaluation;
  timeout: ReturnType<typeof setTimeout>;
};

const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

/** Lightweight UCI adapter around the local Stockfish Web Worker. */
export class StockfishClient {
  private worker: Worker | null = null;
  private tokenWaiters = new Map<string, Array<() => void>>();
  private search: SearchRequest | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      throw new Error("Ce navigateur ne peut pas lancer le moteur local.");
    }

    this.worker = new Worker(ENGINE_URL);
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onWorkerError);
    this.send("uci");
    await this.waitFor("uciok", 12_000);
    this.send("setoption name Hash value 16");
    this.send("isready");
    await this.waitFor("readyok", 12_000);
    this.initialized = true;
  }

  async evaluate(fen: string, depth = 7): Promise<EngineEvaluation> {
    await this.init();
    if (this.search) throw new Error("Le moteur traite déjà une position.");

    return new Promise<EngineEvaluation>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.send("stop");
        this.search = null;
        reject(new Error("L’analyse locale a pris trop de temps."));
      }, 15_000);

      this.search = {
        fen,
        resolve,
        reject,
        latest: { whiteCp: 0, bestMove: "", depth: 0 },
        timeout,
      };
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  destroy(): void {
    if (this.search) {
      clearTimeout(this.search.timeout);
      this.search.reject(new Error("Analyse interrompue."));
      this.search = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private waitFor(token: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Stockfish n’a pas répondu (${token}).`));
      }, timeoutMs);
      const resolver = () => {
        clearTimeout(timeout);
        resolve();
      };
      this.tokenWaiters.set(token, [...(this.tokenWaiters.get(token) ?? []), resolver]);
    });
  }

  private onMessage = (event: MessageEvent<unknown>) => {
    const line = String(event.data ?? "");

    for (const [token, waiters] of this.tokenWaiters) {
      if (!line.includes(token)) continue;
      this.tokenWaiters.delete(token);
      waiters.forEach((resolve) => resolve());
    }

    if (!this.search) return;

    if (line.startsWith("info ") && line.includes(" score ")) {
      const depthMatch = line.match(/\bdepth (\d+)/);
      const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
      const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (!scoreMatch) return;

      const sideToMove = this.search.fen.split(" ")[1];
      const scoreType = scoreMatch[1];
      const raw = Number(scoreMatch[2]);
      const sideToMoveCp = scoreType === "mate" ? Math.sign(raw || 1) * 10_000 : raw;
      this.search.latest = {
        whiteCp: sideToMove === "w" ? sideToMoveCp : -sideToMoveCp,
        bestMove: pvMatch?.[1] ?? this.search.latest.bestMove,
        depth: Number(depthMatch?.[1] ?? 0),
        mate: scoreType === "mate" ? raw : undefined,
      };
      return;
    }

    if (line.startsWith("bestmove")) {
      const bestMove = line.split(/\s+/)[1];
      const search = this.search;
      this.search = null;
      clearTimeout(search.timeout);
      search.resolve({ ...search.latest, bestMove: search.latest.bestMove || bestMove || "" });
    }
  };

  private onWorkerError = () => {
    if (!this.search) return;
    const search = this.search;
    this.search = null;
    clearTimeout(search.timeout);
    search.reject(new Error("Le moteur Stockfish local n’a pas pu démarrer."));
  };
}
