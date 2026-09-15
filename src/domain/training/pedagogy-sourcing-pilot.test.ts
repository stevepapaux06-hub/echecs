import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import PILOT from "./pedagogy-pilot.generated.json";
import { allConceptExercises, referenceBank, TRAINING_BANK_GATE_REPORT } from "./library";
import { trainingExerciseValidationFingerprint } from "./validation";

describe("bounded pedagogy sourcing pilot", () => {
  const active = allConceptExercises();
  const pilotIds = new Set(PILOT.activeTraining.map((exercise) => exercise.id));
  const challengeIds = new Set(PILOT.challengeReference.map((record) => record.exercise.id));

  it("keeps Active Training and Challenge/Reference strictly separated", () => {
    expect([...pilotIds].every((id) => active.some((exercise) => exercise.id === id)),
      JSON.stringify(TRAINING_BANK_GATE_REPORT.pedagogyPilot)).toBe(true);
    expect([...challengeIds].every((id) => !active.some((exercise) => exercise.id === id))).toBe(true);
  });

  it("retains reproducible provenance and keeps source Elo separate from difficulty", () => {
    const published = active.filter((exercise) => pilotIds.has(exercise.id));
    expect(published).toHaveLength(PILOT.activeTraining.length);
    for (const exercise of published) {
      expect(exercise.sourceGameId, exercise.id).toBeTruthy();
      expect(exercise.gameUrl, exercise.id).toMatch(/^https:\/\/lichess\.org\//);
      expect(exercise.sourcePlayerRatings, exercise.id).toHaveLength(2);
      expect(exercise.sourceAverageRating, exercise.id).toBeGreaterThanOrEqual(800);
      expect(exercise.sourceDate, exercise.id).toBeTruthy();
      expect(exercise.sourceTimeControl, exercise.id).toBeTruthy();
      expect(exercise.sourceCorpus, exercise.id).toBeTruthy();
      expect(exercise.sourceLicense, exercise.id).toBe("CC0");
      expect(exercise.validationFingerprint, exercise.id).toBe(trainingExerciseValidationFingerprint(exercise));
    }
    const target = PILOT.challengeReference.find(({ exercise }) => exercise.id === "rating-pilot-pawn_break-90b1e1a2db7c80")?.exercise;
    expect(target?.sourceAverageRating).toBe(1_099);
    expect(target?.difficulty).not.toBe(target?.sourceAverageRating);
  });

  it("keeps the quiet 800-1200 candidate as competing-plan reference rather than teaching one arbitrary answer", () => {
    const record = PILOT.challengeReference.find(({ exercise }) => exercise.id === "rating-pilot-pawn_break-90b1e1a2db7c80")!;
    const exercise = record.exercise;
    const chess = new Chess(exercise.fen);
    const move = chess.move({ from: exercise.bestMove.slice(0, 2), to: exercise.bestMove.slice(2, 4) });
    expect(move.captured).toBeUndefined();
    expect(move.san).not.toMatch(/[+#]/);
    expect(Math.abs(exercise.baselinePlayerCp)).toBeLessThanOrEqual(150);
    expect(exercise.trainingAssessment?.signals).toContain("pawn_contact_created");
    expect(record.reasons).toContain("competing_sound_plan_not_explained");
    expect(exercise.engineCandidates?.[0]?.uci).toBe("h7h6");
    expect(exercise.bestMove).toBe("c7c5");
    expect(active.some((candidate) => candidate.id === exercise.id)).toBe(false);
  });

  it("keeps conversion in the playable +1 to +3 prior with real continuations", () => {
    const conversion = active.filter((exercise) => pilotIds.has(exercise.id) && exercise.category === "conversion");
    expect(conversion).toHaveLength(5);
    expect(conversion.every((exercise) => exercise.baselinePlayerCp >= 80 && exercise.baselinePlayerCp <= 320)).toBe(true);
    expect(conversion.filter((exercise) => exercise.pedagogicalUnit === "decision_then_continuation").length).toBeGreaterThanOrEqual(3);
    expect(conversion.every((exercise) => (exercise.solutionLine?.length ?? 0) >= 3)).toBe(true);
    expect(conversion.every((exercise) => (exercise.engineCandidates?.length ?? 0) >= 4)).toBe(true);
  });

  it("retains technically verified endings as Reference, not automatic Training", () => {
    const technical = referenceBank().filter((exercise) => exercise.source === "lichess_tablebase");
    expect(technical.filter((exercise) => ["lucena", "philidor", "rule_of_square"].includes(exercise.conceptSlug))).toHaveLength(3);
    expect(technical.every((exercise) => exercise.tablebaseWdl && exercise.verificationSource)).toBe(true);
  });

  it("does not collapse Defense into one generic concept", () => {
    const concepts = new Set(active.filter((exercise) => exercise.category === "defense").map((exercise) => exercise.conceptSlug));
    expect(concepts.size).toBeGreaterThanOrEqual(5);
    expect(concepts.has("active_defense")).toBe(true);
    expect(concepts.has("return_material")).toBe(true);
  });

  it("contains no exact or same-game duplicates in the published pilot", () => {
    const published = active.filter((exercise) => pilotIds.has(exercise.id));
    expect(new Set(published.map((exercise) => exercise.fen.split(" ").slice(0, 4).join(" "))).size).toBe(published.length);
    expect(new Set(published.map((exercise) => exercise.sourceGameId)).size).toBe(published.length);
  });
});
