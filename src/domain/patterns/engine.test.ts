import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { AnalyzedMove } from "../chess/types";
import { detectMovePatterns, patternCandidatesForPosition, patternsForAnalyzedMove } from "./engine";

describe("deterministic Pattern Engine", () => {
  it("recognizes an obvious knight fork", () => {
    const patterns = detectMovePatterns("4k3/8/4q1r1/8/8/3N4/8/K7 w - - 0 1", "d3f4");
    expect(patterns).toContainEqual({ conceptSlug: "fork", confidence: 0.95 });
  });

  it("recognizes an absolute pin on the king", () => {
    const patterns = detectMovePatterns("4k3/8/4n3/8/8/8/8/R6K w - - 0 1", "a1e1");
    expect(patterns.some((pattern) => pattern.conceptSlug === "pin" && pattern.confidence >= 0.9)).toBe(true);
  });

  it("recognizes the capture of a loose piece", () => {
    const patterns = detectMovePatterns("4k3/8/8/8/8/8/4q3/4R2K w - - 0 1", "e1e2");
    expect(patterns.some((pattern) => pattern.conceptSlug === "loose_piece" && pattern.confidence >= 0.9)).toBe(true);
  });

  it("does not attach a high-confidence concept to an ambiguous quiet move", () => {
    const patterns = detectMovePatterns("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "a2a3");
    expect(patterns.filter((pattern) => pattern.confidence >= 0.8)).toEqual([]);
  });

  it("finds a reliable opportunity before Stockfish selects the position", () => {
    const candidates = patternCandidatesForPosition("4k3/8/4q1r1/8/8/3N4/8/K7 w - - 0 1", {
      phase: "middlegame",
      ply: 30,
    });
    expect(candidates.some((candidate) => candidate.conceptSlug === "fork" && candidate.moveUci === "d3f4"))
      .toBe(true);
  });

  it("keeps only an open-file plan with a real target or entry square", () => {
    const purposeless = "rn4k1/pbp1q1pp/1p1pp3/5r2/3P2Nb/1PP1PP1Q/PB1NK2P/R6R w - - 2 17";
    expect(detectMovePatterns(purposeless, "h1g1")
      .some((pattern) => pattern.conceptSlug === "open_file")).toBe(false);

    const fen = "r2q1rk1/pp1nbppp/2p1pn2/8/8/2N1PN2/PPQ1BPPP/R4RK1 w - - 2 13";
    const patterns = detectMovePatterns(fen, "a1d1");
    expect(patterns.some((pattern) => pattern.conceptSlug === "open_file" && pattern.confidence >= 0.84))
      .toBe(true);
    expect(patternCandidatesForPosition(fen, { phase: "middlegame", ply: 25 })
      .some((candidate) => candidate.conceptSlug === "open_file")).toBe(true);
  });

  it("recognizes a real rook ending and rejects a transition as king-and-pawn", () => {
    const rookEnding = detectMovePatterns("8/5p2/2r2k2/p5p1/P7/4P1KP/R4P2/8 w - - 0 37", "a2d2");
    expect(rookEnding.some((pattern) => pattern.conceptSlug === "rook_endgame")).toBe(true);

    const transition = detectMovePatterns(
      "5R2/p5k1/2p1p2p/1p2P1p1/3P2P1/P1P2K2/2P4P/8 b - - 0 27",
      "g7f8",
    );
    expect(transition.some((pattern) => pattern.conceptSlug === "king_and_pawn")).toBe(false);
  });

  it("records a Stockfish-validated small advantage as a conversion opportunity", () => {
    const fen = "2b3nr/1pp2k2/1p5p/2bP4/r2N1p1P/2P3p1/PP2B1P1/R1B3KR b - - 2 17";
    const chess = new Chess(fen);
    chess.move({ from: "c5", to: "d4" });
    const analyzed = {
      ply: 34,
      san: "Bd4",
      uci: "c5d4",
      from: "c5",
      to: "d4",
      color: "b",
      fenBefore: fen,
      fenAfter: chess.fen(),
      phase: "middlegame",
      playerCpBefore: 160,
      playerCpAfter: 125,
      lossCp: 35,
      before: { bestMove: "c5d4", lines: [] },
      after: {},
    } as unknown as AnalyzedMove;
    const occurrences = patternsForAnalyzedMove(analyzed);
    expect(occurrences).toContainEqual(expect.objectContaining({
      conceptSlug: "convert_small_advantage",
      opportunity: true,
      success: true,
    }));
  });

  it("labels an active answer to a concrete threat as a defensive resource", () => {
    const patterns = detectMovePatterns(
      "6k1/5ppp/8/8/2p5/3r4/5PPP/3R2K1 w - - 0 1",
      "d1d3",
    );
    expect(patterns).toContainEqual(expect.objectContaining({
      conceptSlug: "defensive_resource",
      confidence: expect.any(Number),
    }));
  });
});
