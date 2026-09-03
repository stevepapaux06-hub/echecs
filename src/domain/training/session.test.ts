import { describe, expect, it } from "vitest";
import type { TrainingAttemptRecord, TrainingExercise } from "@/domain/chess/types";
import { allConceptExercises } from "./library";
import {
  buildTrainingSession,
  conceptTrainingFilter,
  DEFAULT_TRAINING_BATCH_SIZE,
  nextExerciseIndex,
  sharesPreciseConcept,
  trainingPoolForFilter,
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
      DEFAULT_TRAINING_BATCH_SIZE,
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
      DEFAULT_TRAINING_BATCH_SIZE,
      { now: Date.parse("2026-08-31T10:00:00.000Z") },
    );
    expect(session.findIndex((exercise) => exercise.id === failed.id)).toBeGreaterThan(0);
    expect(session.some((exercise) => exercise.id === failed.id)).toBe(true);
  });

  it("never wraps a loaded batch back to the first exercise", () => {
    const progress: string[] = [];
    let index: number | null = 0;
    while (index !== null) {
      progress.push(`${index + 1}`);
      index = nextExerciseIndex(index, DEFAULT_TRAINING_BATCH_SIZE);
    }
    expect(progress).toHaveLength(DEFAULT_TRAINING_BATCH_SIZE);
    expect(progress.at(-1)).toBe(String(DEFAULT_TRAINING_BATCH_SIZE));
  });

  it("does not call two exercises the same concept merely because their categories match", () => {
    const rook = concepts.find((exercise) => exercise.conceptSlug === "open_file")!;
    const outpost = concepts.find((exercise) => exercise.conceptSlug === "outpost")!;
    expect(rook.category).toBe(outpost.category);
    expect(sharesPreciseConcept(rook, outpost)).toBe(false);
  });

  it("uses fresh positions in the next batch instead of restarting the same material", () => {
    const pool = concepts.slice(0, DEFAULT_TRAINING_BATCH_SIZE * 3);
    const first = buildTrainingSession(pool, [], "mix", DEFAULT_TRAINING_BATCH_SIZE, { now: Date.parse(now) });
    const completed = first.map((exercise) => attempt(exercise.id, "success"));
    const second = buildTrainingSession(pool, completed, "mix", DEFAULT_TRAINING_BATCH_SIZE, { now: Date.parse(now) });
    expect(second).toHaveLength(DEFAULT_TRAINING_BATCH_SIZE);
    expect(second.every((exercise) => !first.some((seen) => seen.id === exercise.id))).toBe(true);
  });

  it("moves difficulty upward after repeated success on the same concept", () => {
    const forkPool = concepts.filter((exercise) => exercise.conceptSlug === "fork" && exercise.difficulty);
    const successes = Array.from({ length: 4 }, (_, index) => ({
      ...attempt(`old-${index}`, "success"),
      theme: "fork",
    }));
    const session = buildTrainingSession(forkPool, successes, "tactic", DEFAULT_TRAINING_BATCH_SIZE, {
      now: Date.parse(now),
      userRating: 1_200,
    });
    expect(session[0].difficulty).toBeGreaterThanOrEqual(1_200);
  });

  it("keeps a Fourchette session on real fork positions only", () => {
    const session = buildTrainingSession(
      concepts,
      [],
      conceptTrainingFilter("fork"),
      DEFAULT_TRAINING_BATCH_SIZE,
      { userRating: 1_300 },
    );
    expect(session).toHaveLength(DEFAULT_TRAINING_BATCH_SIZE);
    expect(session.every((exercise) => exercise.conceptSlug === "fork")).toBe(true);
  });

  it("continues after one batch with new positions from the same exact concept", () => {
    const filter = conceptTrainingFilter("fork");
    const first = buildTrainingSession(concepts, [], filter, DEFAULT_TRAINING_BATCH_SIZE, { userRating: 1_300 });
    const second = buildTrainingSession(concepts, [], filter, DEFAULT_TRAINING_BATCH_SIZE, {
      userRating: 1_300,
      excludeExerciseIds: new Set(first.map((exercise) => exercise.id)),
    });
    expect(second).toHaveLength(DEFAULT_TRAINING_BATCH_SIZE);
    expect(second.every((exercise) => exercise.conceptSlug === "fork")).toBe(true);
    expect(second.every((exercise) => !first.some((seen) => seen.id === exercise.id))).toBe(true);
  });

  it("filters Mes parties, Banque and Mix without changing the requested concept", () => {
    const sourcePool = [personal, sameTheme, ...concepts];
    const personalOnly = trainingPoolForFilter(sourcePool, conceptTrainingFilter("fork"), "personal");
    const bankOnly = trainingPoolForFilter(sourcePool, conceptTrainingFilter("fork"), "bank");
    const mixed = trainingPoolForFilter(sourcePool, conceptTrainingFilter("fork"), "mix");

    expect(personalOnly).toHaveLength(1);
    expect(personalOnly.every((exercise) => exercise.origin === "personal")).toBe(true);
    expect(bankOnly.length).toBeGreaterThan(DEFAULT_TRAINING_BATCH_SIZE);
    expect(bankOnly.every((exercise) => exercise.origin === "concept" && exercise.conceptSlug === "fork")).toBe(true);
    expect(mixed.some((exercise) => exercise.origin === "personal")).toBe(true);
    expect(mixed.some((exercise) => exercise.origin === "concept")).toBe(true);
  });

  it("turns a fork diagnostic into an exact transfer sequence", () => {
    const session = buildTrainingSession(
      [personal, sameTheme, ...concepts],
      [],
      "recommended",
      DEFAULT_TRAINING_BATCH_SIZE,
      { priorityConcept: "fork", userRating: 1_300 },
    );
    expect(session[0].origin).toBe("personal");
    expect(session.every((exercise) => exercise.conceptSlug === "fork")).toBe(true);
  });

  it("uses the seed to vary the first position instead of storage order", () => {
    const pool = concepts.filter((exercise) => exercise.conceptSlug === "fork").slice(0, 80);
    const firstIds = new Set(["alpha", "beta", "gamma", "delta"].map((seed) => (
      buildTrainingSession(pool, [], conceptTrainingFilter("fork"), 6, { seed, userRating: 1_400 })[0]?.id
    )));
    expect(firstIds.size).toBeGreaterThan(1);
  });

  it("does not serve neighbouring moments from the same source game consecutively", () => {
    const base = concepts.filter((exercise) => exercise.conceptSlug === "fork").slice(0, 6);
    const pool = base.map((exercise, index) => ({
      ...exercise,
      id: `diversity-${index}`,
      sourceGameId: index < 3 ? "same-game" : `other-game-${index}`,
      positionPly: 20 + index * 2,
    }));
    const session = buildTrainingSession(pool, [], conceptTrainingFilter("fork"), 6, { seed: "source-diversity" });
    expect(session.every((exercise, index) => (
      index === 0 || exercise.sourceGameId !== session[index - 1].sourceGameId
    ))).toBe(true);
  });
});
