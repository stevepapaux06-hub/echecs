import { describe, expect, it } from "vitest";
import { parseChessComGame } from "./pgn";

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
});
