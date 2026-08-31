import { createRequire } from "node:module";
import { Chess, type Square } from "chess.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EngineEvaluation, EngineLine } from "@/domain/chess/types";
import { allConceptExercises } from "../../domain/training/library";
import { buildEngineEvaluation, parseUciInfoLine } from "./uci";

type NodeStockfish = {
  listener?: (line: string) => void;
  sendCommand: (command: string) => void;
};

const require = createRequire(import.meta.url);
const initStockfish = require("stockfish") as (flavor: string) => Promise<NodeStockfish>;

let engine: NodeStockfish;
let consumeLine: (line: string) => void = () => undefined;

function waitFor(token: string, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Stockfish timeout: ${token}`)), 10_000);
    consumeLine = (line) => {
      if (!line.includes(token)) return;
      clearTimeout(timeout);
      resolve();
    };
    engine.sendCommand(command);
  });
}

async function analyze(fen: string, { depth = 8, multiPv = 1 } = {}): Promise<EngineEvaluation> {
  engine.sendCommand(`setoption name MultiPV value ${multiPv}`);
  await waitFor("readyok", "isready");

  return new Promise((resolve, reject) => {
    const lines = new Map<number, EngineLine>();
    const timeout = setTimeout(() => reject(new Error("Stockfish reference search timeout")), 10_000);
    consumeLine = (line) => {
      const parsed = parseUciInfoLine(line, fen);
      if (parsed) {
        const previous = lines.get(parsed.multipv);
        if (!previous || parsed.depth >= previous.depth) lines.set(parsed.multipv, parsed);
        return;
      }
      if (!line.startsWith("bestmove")) return;

      clearTimeout(timeout);
      try {
        resolve(buildEngineEvaluation({
          fen,
          requestedDepth: depth,
          bestMove: line.split(/\s+/)[1] ?? "",
          lines: [...lines.values()],
        }));
      } catch (reason) {
        reject(reason);
      }
    };
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`go depth ${depth}`);
  });
}

beforeAll(async () => {
  engine = await initStockfish("lite-single");
  engine.listener = (line) => consumeLine(String(line));
  await waitFor("uciok", "uci");
}, 20_000);

afterAll(() => {
  engine?.sendCommand("quit");
});

describe("Stockfish reference positions", () => {
  it("recognizes a roughly equal initial position", async () => {
    const result = await analyze("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(Math.abs(result.whiteCp)).toBeLessThan(120);
    expect(result.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  });

  it("keeps White advantage positive even when Black has the move", async () => {
    const result = await analyze("7k/8/8/8/8/8/7Q/7K b - - 0 1");
    expect(result.lines[0].rawScore.value).toBeLessThan(0);
    expect(result.whiteCp).toBeGreaterThan(500);
  });

  it("keeps Black advantage negative from White's perspective", async () => {
    const result = await analyze("7k/7q/8/8/8/8/8/7K w - - 0 1");
    expect(result.whiteCp).toBeLessThan(-500);
  });

  it("detects the best defensive capture and the loss after a bad move", async () => {
    const before = await analyze("4k3/8/8/8/8/8/3q4/3QK3 w - - 0 1", { multiPv: 3 });
    const afterBadMove = await analyze("4k3/8/8/8/8/8/3q4/3Q1K2 b - - 1 1");

    expect(before.lines.map((line) => line.pv[0])).toContain("d1d2");
    expect(before.whiteCp).toBeGreaterThan(500);
    expect(afterBadMove.whiteCp).toBeLessThan(-500);
    expect(before.whiteCp - afterBadMove.whiteCp).toBeGreaterThan(1_000);
  });

  it("preserves a forced mate and its principal move", async () => {
    const fen = "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1";
    const result = await analyze(fen);
    const chess = new Chess(fen);
    chess.move({
      from: result.bestMove.slice(0, 2) as Square,
      to: result.bestMove.slice(2, 4) as Square,
      promotion: result.bestMove.slice(4, 5) || "q",
    });

    expect(result.mate).toBe(1);
    expect(chess.isCheckmate()).toBe(true);
  });

  it("normalizes a forced mate for Black from White's perspective", async () => {
    const fen = "8/8/8/8/8/6k1/5q2/7K b - - 0 1";
    const result = await analyze(fen);
    expect(result.mate).toBe(-1);
    expect(result.whiteCp).toBeLessThan(-90_000);
  });

  it("accounts for compensation instead of returning the raw material count", async () => {
    // White owns a queen, two rooks and two pawns against a queen. The exposed
    // king gives Black enough activity that the engine discounts that nominal
    // material edge instead of echoing a material-only score.
    const fen = "8/8/8/8/8/5k2/RR3qPP/Q6K b - - 0 1";
    const result = await analyze(fen);
    expect(result.whiteCp).toBeGreaterThan(500);
    expect(result.whiteCp).toBeLessThan(1_200);
  });

  it("recognizes a technically winning position with only one extra pawn", async () => {
    const fen = "2k5/8/8/3PK3/8/8/8/8 w - - 0 1";
    const result = await analyze(fen, { depth: 12 });
    expect(result.whiteCp).toBeGreaterThan(250);
  });

  it("validates every curated teaching move against Stockfish", async () => {
    const all = allConceptExercises();
    const curated = all.filter((exercise) => exercise.source !== "lichess");
    const lichessByConcept = new Map<string, (typeof all)[number]>();
    for (const exercise of all.filter((candidate) => candidate.source === "lichess")) {
      if (!lichessByConcept.has(exercise.conceptSlug)) lichessByConcept.set(exercise.conceptSlug, exercise);
    }
    for (const exercise of [...curated, ...lichessByConcept.values()]) {
      const before = await analyze(exercise.fen, { depth: 9, multiPv: 3 });
      const chess = new Chess(exercise.fen);
      const played = chess.move({
        from: exercise.bestMove.slice(0, 2) as Square,
        to: exercise.bestMove.slice(2, 4) as Square,
        promotion: exercise.bestMove.slice(4, 5) || "q",
      });
      expect(played, `${exercise.id} must stay legal`).not.toBeNull();

      const beforePlayerCp = exercise.playerColor === "white" ? before.whiteCp : -before.whiteCp;
      if (exercise.baselinePlayerCp >= 200) {
        expect(
          beforePlayerCp,
          `${exercise.id} is presented as a winning position`,
        ).toBeGreaterThan(150);
      }
      if (chess.isGameOver()) {
        expect(
          chess.isCheckmate(),
          `${exercise.id} must only finish immediately by checkmate`,
        ).toBe(true);
        continue;
      }

      const after = await analyze(chess.fen(), { depth: 9 });
      const afterPlayerCp = exercise.playerColor === "white" ? after.whiteCp : -after.whiteCp;
      expect(
        beforePlayerCp - afterPlayerCp,
        `${exercise.id} should preserve the engine evaluation`,
      ).toBeLessThanOrEqual(150);
    }
  }, 60_000);
});
