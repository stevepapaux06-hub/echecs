import { Chess, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import { allConceptExercises, currentTrainingPool, referenceBank } from "./library";
import { referenceMilestoneIndex } from "./milestones";
import { decideSequence } from "./sequence";
import { buildTrainingSession, conceptTrainingFilter } from "./session";
import { conceptReferenceProfile } from "../patterns/reference-profile";

describe("applied bank quality and continuous training", () => {
  it("does not present a single decision as a multi-move sequence", () => {
    expect(allConceptExercises().filter((e) => e.pedagogicalUnit === "single_move")
      .every((e) => e.mode === "one-move" && e.maxPlayerMoves === 1)).toBe(true);
  });
  it("does not resurrect quarantined bank copies from an old analysis", () => {
    const removed = referenceBank().find((e) => !allConceptExercises().some((active) => active.id === e.id))!;
    const personal = { ...removed, id: "unproved-personal", origin: "personal" as const, category: "strategy" as const, trainingAssessment: undefined };
    expect(currentTrainingPool([removed, personal]).some((e) => e.id === removed.id)).toBe(false);
    expect(currentTrainingPool([removed, personal]).some((e) => e.id === personal.id)).toBe(true);
    expect(referenceBank().some((e) => e.id === removed.id)).toBe(true);
  });
  it("uses reference feature coverage with both positives and boundaries", () => {
    for (const concept of ["open_file", "weak_square", "rook_activity"]) {
      const profile = conceptReferenceProfile(concept)!;
      expect(profile.positive).toBeGreaterThan(3);
      expect(profile.boundary).toBeGreaterThan(0);
      expect(profile.sourceGames).toBeGreaterThan(3);
    }
  });
  it("every active method actually reaches its declared milestone", () => {
    for (const exercise of allConceptExercises().filter((e) => e.pedagogicalMilestone)) {
      const index = referenceMilestoneIndex(exercise);
      expect(index, exercise.id).not.toBeNull();
      const chess = new Chess(exercise.fen); const ownMoves: string[] = [];
      for (const [i, uci] of exercise.solutionLine!.entries()) {
        const before = chess.fen();
        chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
        if (i % 2 !== 0) continue;
        ownMoves.push(uci);
        const decision = decideSequence({ exercise, playerMoves: ownMoves.length, playedMoveUcis: ownMoves,
          decisionLossCp: 0, totalLossCp: 0, afterPlayerCp: 350, isGameOver: chess.isGameOver(),
          isCheckmate: chess.isCheckmate(), promoted: !!uci[4], captured: false, afterFen: chess.fen(), decisionFen: before });
        expect(decision.finished, `${exercise.id} ply ${i}`).toBe(i >= index!);
        if (i >= index!) break;
      }
    }
  });
  it("drawn target results are successful without playing to mate", () => {
    const ending = allConceptExercises().find((e) => e.category === "endgame")!;
    expect(decideSequence({ exercise: { ...ending, trainingAssessment: { ...ending.trainingAssessment!, outcome: { source: "syzygy", root: "draw", after: "draw" } } },
      playerMoves: 4, decisionLossCp: 0, totalLossCp: 0, afterPlayerCp: 0,
      isGameOver: true, isCheckmate: false, promoted: false, captured: false }).result).toBe("success");
  });
  it("continues on fresh file decisions beyond seven and varies session starts", () => {
    const pool = allConceptExercises();
    const filter = conceptTrainingFilter("open_file", "strategy");
    const first = buildTrainingSession(pool, [], filter, 8, { seed: 1 });
    const second = buildTrainingSession(pool, [], filter, 8, { seed: 2, excludeExerciseIds: new Set(first.map((e) => e.id)) });
    expect(first).toHaveLength(8); expect(second).toHaveLength(8);
    expect(new Set([...first, ...second].map((e) => e.id)).size).toBe(16);
    const starts = [1, 2, 3, 4, 5].map((seed) => buildTrainingSession(pool, [], filter, 12, { seed })[0].id);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });
});
