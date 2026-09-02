import { describe, expect, it } from "vitest";
import { allConceptExercises } from "./library";
import { buildExerciseTeaching } from "./explanation";

describe("deterministic training explanation", () => {
  it("names the piece, plan and objective of a strategic open-file move", () => {
    const exercise = allConceptExercises().find((candidate) => candidate.id === "concept-rook-open-file")!;
    const teaching = buildExerciseTeaching(
      exercise.fen,
      exercise.bestMove,
      exercise.conceptSlug,
      exercise.solutionLine,
    );
    expect(teaching?.explanation.notice).toContain("colonne d");
    expect(teaching?.explanation.focus).toContain("tour");
    expect(teaching?.explanation.plan).toContain("d1");
    expect(teaching?.explanation.objective).toContain("invasion");
  });

  it("keeps board arrows and highlighted squares aligned with the explanation", () => {
    const exercise = allConceptExercises().find((candidate) => candidate.id === "concept-rook-open-file")!;
    const teaching = buildExerciseTeaching(exercise.fen, exercise.bestMove, exercise.conceptSlug);
    expect(teaching?.planArrows).toContainEqual(expect.objectContaining({ from: "a1", to: "d1" }));
    expect(teaching?.planArrows).toContainEqual(expect.objectContaining({ from: "d1", to: "d7" }));
    expect(teaching?.planSquares).toContainEqual(expect.objectContaining({ square: "d7" }));
  });

  it("explains remove_defender causally instead of falling back to piece improvement", () => {
    const exercise = allConceptExercises().find((candidate) => candidate.conceptSlug === "remove_defender")!;
    const teaching = buildExerciseTeaching(exercise.fen, exercise.bestMove, exercise.conceptSlug, exercise.solutionLine);
    const copy = Object.values(teaching?.explanation ?? {}).join(" ").toLowerCase();
    expect(copy).toMatch(/défenseur|défense/);
    expect(copy).toMatch(/éliminer|détourner|disparaître/);
    expect(copy).not.toContain("améliorer le roi");
  });

  it("keeps forcing feedback about calculation rather than a generic king route", () => {
    const exercise = allConceptExercises().find((candidate) => candidate.id === "concept-fork-knight-c7")!;
    const teaching = buildExerciseTeaching(exercise.fen, exercise.bestMove, "forcing_moves", exercise.solutionLine);
    const copy = Object.values(teaching?.explanation ?? {}).join(" ").toLowerCase();
    expect(copy).toMatch(/forcing|échec|prise|menace|promotion/);
    expect(copy).toContain("réponse");
    expect(copy).not.toContain("améliorer le roi");
  });
});
