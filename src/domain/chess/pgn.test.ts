import { describe, expect, it } from "vitest";
import { parseChessComGame, parsePgnCollection } from "./pgn";

describe("parseChessComGame", () => {
  it("reconstructs legal positions and the player perspective", () => {
    const parsed = parseChessComGame({
      uuid: "game-1",
      url: "https://www.chess.com/game/live/1",
      pgn: `[Event "Live Chess"]\n[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`,
      end_time: 1_700_000_000,
      time_class: "rapid",
      time_control: "600",
      rated: true,
      rules: "chess",
      white: { username: "Alice", rating: 1400, result: "win" },
      black: { username: "Bob", rating: 1410, result: "resigned" },
    }, "alice");

    expect(parsed.playerColor).toBe("white");
    expect(parsed.outcome).toBe("win");
    expect(parsed.moves).toHaveLength(6);
    expect(parsed.moves[0].uci).toBe("e2e4");
    expect(parsed.moves.at(-1)?.fenAfter).toContain(" w ");
  });

  it("imports several PGN games and keeps only the requested volume", () => {
    const payload = parsePgnCollection(`[Event "Round 1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[Date "2026.08.20"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Round 2"]
[White "Carol"]
[Black "Alice"]
[Result "1/2-1/2"]
[Date "2026.08.21"]

1. d4 d5 2. c4 e6 1/2-1/2`, "Alice", 1);

    expect(payload.games).toHaveLength(1);
    expect(payload.games[0].opponent).toBe("Carol");
    expect(payload.games[0].source).toBe("pgn");
    expect(payload.selection).toEqual({ source: "pgn", requestedGames: 1, cadence: "all" });
  });

  it("rejects an empty PGN", () => {
    expect(() => parsePgnCollection("  ", "Alice")).toThrow("vide");
  });
});
