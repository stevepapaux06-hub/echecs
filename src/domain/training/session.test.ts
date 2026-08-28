import { describe, expect, it } from "vitest";
import type { TrainingAttemptRecord, TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import { buildTrainingSession } from "./session";

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
    expect(session[1].theme).toBe("forks");
    expect(session[1].fen).not.toBe(session[0].fen);
  });

  it("postpones a recently solved exact position when an alternative exists", () => {
    const session = buildTrainingSession([personal, sameTheme, ...concepts], [attempt(personal.id, "success")], "mix");
    expect(session[0].id).not.toBe(personal.id);
    expect(session.slice(0, -1).some((exercise) => exercise.id === personal.id)).toBe(false);
  });

  it("remembers a failed exercise and schedules it later in the session", () => {
    const failed = concepts.find((exercise) => exercise.category === "strategy")!;
    const session = buildTrainingSession(
      [personal, sameTheme, ...concepts],
      [attempt(failed.id, "failed")],
      "recommended",
    );
    expect(session.findIndex((exercise) => exercise.id === failed.id)).toBeGreaterThan(0);
    expect(session.some((exercise) => exercise.id === failed.id)).toBe(true);
  });
});
