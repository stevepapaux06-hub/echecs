import { describe, expect, it } from "vitest";
import { importLichessPuzzleCsv, mapLichessThemesToConcepts, parseLichessPuzzleCsvLine } from "./lichess-import";

const HEADER = "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate";
const FORK = "00sJ9,r3r1k1/p4ppp/2p2n2/1p6/3P1qb1/2NQR3/PPB2PP1/R1B3K1 w - - 5 18,e3g3 e8e1 g1h2 e1c1 a1c1 f4h6 h2g1 h6c1,2671,105,87,325,advantage attraction fork middlegame sacrifice veryLong,https://lichess.org/gyFeQsOE#35,French_Defense,1607774862751";

describe("Lichess puzzle importer", () => {
  it("uses the position after the setup move and starts the solution at move two", () => {
    const puzzle = parseLichessPuzzleCsvLine(FORK);
    expect(puzzle).toMatchObject({
      id: "lichess-00sJ9",
      conceptSlug: "fork",
      difficulty: 2671,
      source: "lichess",
      sourceGameId: "00sJ9",
      qualityScore: 87,
      isVerified: true,
      solutionMoves: ["e8e1", "g1h2", "e1c1", "a1c1", "f4h6", "h2g1", "h6c1"],
    });
    expect(puzzle?.fen).not.toContain(" w ");
  });

  it("maps only exact official themes and never broad tags", () => {
    expect(mapLichessThemesToConcepts(["fork", "pin", "advantage", "middlegame"]))
      .toEqual(["fork", "pin"]);
    expect(mapLichessThemesToConcepts(["deflection", "advancedPawn"])).toEqual([]);
  });

  it("indexes a fork weakness with fork positions only", () => {
    const imported = importLichessPuzzleCsv(`${HEADER}\n${FORK}`, { perConcept: 5, minPopularity: 0 });
    expect(imported).toHaveLength(1);
    expect(imported.every((position) => position.conceptSlug === "fork")).toBe(true);
  });
});
