import { describe, expect, it } from "vitest";
import type { TrainingAttemptRecord, TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import {
  buildTrainingSession,
  nextExerciseIndex,
  sharesPreciseConcept,
} from "./session";

const now = "2026-08-28T10:00:00.000Z";

function attempt(exerciseId: string, result: TrainingAttemptRecord["result"]): TrainingAttemptRecord {
  return { exerciseId, result, theme: "forks", lossCp: 0, moves: [], createdAt: now };
}

describe("personalized training session", () => {
  const concepts = allConceptExercises();
  const forkA = concepts.find((exercise) => exercise.id === "concept-fork-knight-c7")!;
  const forkB = concepts.find((exercise) => exercise.id === "concept-tactic-fork-second")!;
  const personal: TrainingExercise = {
    ...forkA,
    id: "personal-game-42-ply-17",
    origin: "personal",
    theme: "forks",
    sourceLabel: "Ta partie contre Camille",
  };
  const sameTheme: TrainingExercise = { ...forkB, theme: "forks" };

  it("starts from a personal error then changes to a genuinely different position", () => {
    const session = buildTrainingSession([personal, sameTheme, ...concepts], [], "recommended");
    expect(session[0].origin).toBe("personal");
    expect(sharesPreciseConcept(session[0], session[1])).toBe(true);
    expect(session[1].conceptSlug).toBe(session[0].conceptSlug);
    expect(session[1].fen).not.toBe(session[0].fen);
  });

  it("postpones a recently solved exact position when an alternative exists", () => {
    const session = buildTrainingSession(
      [personal, sameTheme, ...concepts],
      [attempt(personal.id, "success")],
      "mix",
      7,
      { now: Date.parse("2026-08-31T10:00:00.000Z") },
    );
    expect(session[0].id).not.toBe(personal.id);
    expect(session.slice(0, -1).some((exercise) => exercise.id === personal.id)).toBe(false);
  });

  it("remembers a failed exercise and schedules it later in the session", () => {
    const failed = concepts.find((exercise) => exercise.category === "strategy")!;
    const session = buildTrainingSession(
      [personal, sameTheme, ...concepts],
      [attempt(failed.id, "failed")],
      "recommended",
      7,
      { now: Date.parse("2026-08-31T10:00:00.000Z") },
    );
    expect(session.findIndex((exercise) => exercise.id === failed.id)).toBeGreaterThan(0);
    expect(session.some((exercise) => exercise.id === failed.id)).toBe(true);
  });

  it("never wraps a seven-position session back to the first exercise", () => {
    const progress: string[] = [];
    let index: number | null = 0;
    while (index !== null) {
      progress.push(`${index + 1}/7`);
      index = nextExerciseIndex(index, 7);
    }
    expect(progress).toEqual(["1/7", "2/7", "3/7", "4/7", "5/7", "6/7", "7/7"]);
  });

  it("does not call two exercises the same concept merely because their categories match", () => {
    const rook = concepts.find((exercise) => exercise.conceptSlug === "open_file")!;
    const outpost = concepts.find((exercise) => exercise.conceptSlug === "outpost")!;
    expect(rook.category).toBe(outpost.category);
    expect(sharesPreciseConcept(rook, outpost)).toBe(false);
  });

  it("uses fresh positions in the next session instead of restarting the same seven", () => {
    const pool = concepts.slice(0, 20);
    const first = buildTrainingSession(pool, [], "mix", 7, { now: Date.parse(now) });
    const completed = first.map((exercise) => attempt(exercise.id, "success"));
    const second = buildTrainingSession(pool, completed, "mix", 7, { now: Date.parse(now) });
    expect(second).toHaveLength(7);
    expect(second.every((exercise) => !first.some((seen) => seen.id === exercise.id))).toBe(true);
  });

  it("moves difficulty upward after repeated success on the same concept", () => {
    const forkPool = concepts.filter((exercise) => exercise.conceptSlug === "fork" && exercise.difficulty);
    const successes = Array.from({ length: 4 }, (_, index) => ({
      ...attempt(`old-${index}`, "success"),
      theme: "fork",
    }));
    const session = buildTrainingSession(forkPool, successes, "tactic", 7, {
      now: Date.parse(now),
      userRating: 1_200,
    });
    expect(session[0].difficulty).toBeGreaterThanOrEqual(1_200);
  });
});
