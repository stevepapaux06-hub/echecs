import { afterEach, describe, expect, it, vi } from "vitest";
import { StockfishClient } from "./stockfish-client";

const WHITE_FEN = "4k3/7p/8/8/8/8/P7/4K3 w - - 0 1";
const BLACK_FEN = "4k3/7p/8/8/8/8/P7/4K3 b - - 0 1";
const CHECKMATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

class FakeWorker {
  static latest: FakeWorker | undefined;
  static instances = 0;
  static incompleteSearchesRemaining = 0;

  readonly commands: string[] = [];
  private messageListeners: Array<(event: MessageEvent<unknown>) => void> = [];
  private errorListeners: Array<() => void> = [];
  private fen = WHITE_FEN;
  private multiPv = 1;

  constructor() {
    FakeWorker.instances += 1;
    FakeWorker.latest = this;
  }

  addEventListener(type: "message" | "error", listener: EventListener): void {
    if (type === "message") {
      this.messageListeners.push(listener as (event: MessageEvent<unknown>) => void);
    } else {
      this.errorListeners.push(listener as () => void);
    }
  }

  postMessage(command: string): void {
    this.commands.push(command);
    if (command === "uci") queueMicrotask(() => this.emit("uciok"));
    if (command === "isready") queueMicrotask(() => this.emit("readyok"));
    if (command.startsWith("position fen ")) this.fen = command.slice("position fen ".length);
    if (command.startsWith("setoption name MultiPV value ")) {
      this.multiPv = Number(command.split(" ").at(-1));
    }
    if (command.startsWith("go depth ")) {
      if (FakeWorker.incompleteSearchesRemaining > 0) {
        FakeWorker.incompleteSearchesRemaining -= 1;
        setTimeout(() => this.emit("bestmove (none)"), 5);
        return;
      }
      const searchedFen = this.fen;
      const searchedMultiPv = this.multiPv;
      setTimeout(() => {
        const isWhite = searchedFen.includes(" w ");
        this.emit(`info depth 9 multipv 1 score cp ${isWhite ? 80 : -120} nodes 100 pv e1e2 e8e7`);
        if (searchedMultiPv > 1) {
          this.emit(`info depth 9 multipv 2 score cp ${isWhite ? 65 : -105} nodes 100 pv e1d2 e8d7`);
        }
        this.emit("bestmove e1e2");
      }, 5);
    }
  }

  terminate(): void {
    this.messageListeners = [];
    this.errorListeners = [];
  }

  private emit(line: string): void {
    const event = { data: line } as MessageEvent<unknown>;
    this.messageListeners.forEach((listener) => listener(event));
  }
}

afterEach(() => {
  FakeWorker.latest = undefined;
  FakeWorker.instances = 0;
  FakeWorker.incompleteSearchesRemaining = 0;
  vi.unstubAllGlobals();
});

describe("StockfishClient request isolation", () => {
  it("serializes concurrent calls and keeps each result tied to its FEN", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new StockfishClient();

    const [white, black] = await Promise.all([
      client.analyze(WHITE_FEN, { depth: 9, multiPv: 2 }),
      client.analyze(BLACK_FEN, { depth: 9, multiPv: 1 }),
    ]);

    expect(white.fen).toBe(WHITE_FEN);
    expect(white.whiteCp).toBe(80);
    expect(white.lines).toHaveLength(2);
    expect(black.fen).toBe(BLACK_FEN);
    expect(black.whiteCp).toBe(120);
    expect(black.lines).toHaveLength(1);

    const positionCommands = FakeWorker.latest?.commands.filter((command) => command.startsWith("position fen"));
    expect(positionCommands).toEqual([
      `position fen ${WHITE_FEN}`,
      `position fen ${BLACK_FEN}`,
    ]);
    client.destroy();
  });

  it("does not start a worker search for an already finished position", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new StockfishClient();

    const result = await client.analyze(CHECKMATE_FEN, { depth: 9 });

    expect(result.whiteCp).toBeLessThan(-90_000);
    expect(result.bestMove).toBe("");
    expect(FakeWorker.latest).toBeUndefined();
    client.destroy();
  });

  it("restarts the worker once when a non-terminal response has no variation", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.incompleteSearchesRemaining = 1;
    const client = new StockfishClient();

    const result = await client.analyze(WHITE_FEN, { depth: 9 });

    expect(result.whiteCp).toBe(80);
    expect(FakeWorker.instances).toBe(2);
    client.destroy();
  });
});
