import { describe, expect, it } from "vitest";
import { allConceptExercises } from "./library";
import { classifyPedagogicalMove, decideSequence, referenceReply } from "./sequence";

function exercise(id: string) {
  const found = allConceptExercises().find((candidate) => candidate.id === `concept-${id}`);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

describe("multi-move training sequences", () => {
  it("keeps a sound move with another idea out of pedagogical success", () => {
    const opening = exercise("opening-develop-with-tempo");
    expect(classifyPedagogicalMove(opening, "b1c3", 15)).toBe("good-alternative");
    expect(decideSequence({
      exercise: opening,
      playerMoves: 1,
      decisionLossCp: 15,
      totalLossCp: 15,
      afterPlayerCp: 5,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
      pedagogicalMove: "good-alternative",
    }).result).toBe("partial");
  });

  it("counts the Stockfish-valid concept move as pedagogical success", () => {
    const opening = exercise("opening-develop-with-tempo");
    expect(classifyPedagogicalMove(opening, "g1f3", 0)).toBe("concept");
    expect(decideSequence({
      exercise: opening,
      playerMoves: 1,
      decisionLossCp: 0,
      totalLossCp: 0,
      afterPlayerCp: 20,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
      pedagogicalMove: "concept",
    }).result).toBe("success");
  });

  it("automatically provides the validated opponent reply in a tactic", () => {
    const tactic = exercise("fork-knight-c7");
    expect(referenceReply(tactic, ["b5c7"])).toBe("e8d7");
    expect(decideSequence({
      exercise: tactic,
      playerMoves: 1,
      decisionLossCp: 0,
      totalLossCp: 0,
      afterPlayerCp: 500,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    }).finished).toBe(false);
    expect(decideSequence({
      exercise: tactic,
      playerMoves: 2,
      decisionLossCp: 0,
      totalLossCp: 0,
      afterPlayerCp: 500,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: true,
    }).result).toBe("success");
  });

  it("keeps a king-and-pawn endgame alive for several player moves", () => {
    const endgame = exercise("endgame-opposition");
    expect(decideSequence({
      exercise: endgame,
      playerMoves: 1,
      decisionLossCp: 10,
      totalLossCp: 10,
      afterPlayerCp: 600,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    }).finished).toBe(false);
    expect(decideSequence({
      exercise: endgame,
      playerMoves: 4,
      decisionLossCp: 10,
      totalLossCp: 30,
      afterPlayerCp: 580,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    }).result).toBe("success");
  });

  it("validates conversion over a technical sequence and stops on a true error", () => {
    const conversion = exercise("conversion-rook-pawn");
    expect(decideSequence({
      exercise: conversion,
      playerMoves: 1,
      decisionLossCp: 20,
      totalLossCp: 20,
      afterPlayerCp: 900,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    }).finished).toBe(false);
    expect(decideSequence({
      exercise: conversion,
      playerMoves: 2,
      decisionLossCp: 220,
      totalLossCp: 220,
      afterPlayerCp: 300,
      isGameOver: false,
      isCheckmate: false,
      promoted: false,
      captured: false,
    })).toMatchObject({ finished: true, result: "failed", reason: "mistake" });
  });
});
