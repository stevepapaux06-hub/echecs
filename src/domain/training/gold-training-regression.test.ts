import { describe, expect, it } from "vitest";
import { allConceptExercises, referenceBank } from "./library";
import { GOLD_TRAINING_IDS, goldDecisionCount, TRAINING_REFERENCE_ONLY } from "./lesson-refinement";

const GOLD_IDS = [
  "master-improve_worst_piece-ceaed0f6c0bb7e",
  "contrast-mine-outpost-b0b0d5d159ffdfb8b6",
  "contrast-mine-open_file-673d0f89da8656ec2c",
  "master-pawn_break-09953be549f251",
  "contrast-mine-weak_square-222bfde2c12e897356",
  "contrast-mine-favorable_exchange-fe61049767b389fa1b",
  "contrast-mine-opposition-865f5d5ce49ed89693",
  "contrast-mine-king_and_pawn-7e8c7e2928e07f38ab",
  "contrast-mine-king_activity-ef0775a578eef98ee6",
  "contrast-mine-rook_endgame-d72e2f4a3d4f7aac48",
  "lichess-0BFjc",
  "quality-mine-convert_small_advantage-bb8cedb67c2f2f",
  "contrast-mine-simplify_when_ahead-0a0f72e07ab19368e5",
  "contrast-mine-restrict_counterplay-dcf7ec5be80f75aa1d",
  "contrast-mine-use_material_advantage-540b14a180975e7dbc",
  "master-favorable_endgame_transition-3085c977752ecf",
  "contrast-mine-defensive_resource-354a5e95b007199406",
  "lichess-Ay1hj",
  "contrast-mine-simplification_to_hold-9bcc851927265d9e80",
  "lichess-J6NVc",
] as const;

describe("independent 20-position gold regression set", () => {
  const training = new Map(allConceptExercises().map((exercise) => [exercise.id, exercise]));
  const reference = new Map(referenceBank().map((exercise) => [exercise.id, exercise]));

  it("keeps every audited source traceable", () => {
    expect(GOLD_IDS.filter((id) => !training.has(id) && !reference.has(id))).toEqual([]);
  });

  it("moves the three audit-declared weak lessons out of Training", () => {
    for (const id of TRAINING_REFERENCE_ONLY) {
      expect(training.has(id), id).toBe(false);
      expect(reference.has(id), id).toBe(true);
    }
  });

  it("keeps every MUST PASS lesson in Training", () => {
    expect([...GOLD_TRAINING_IDS].filter((id) => !training.has(id))).toEqual([]);
  });

  it("publishes audited lesson lengths instead of truncating verified continuations", () => {
    const mismatches = GOLD_IDS.flatMap((id) => {
      const expected = goldDecisionCount(id);
      const exercise = training.get(id);
      if (!expected || !exercise) return [];
      return exercise.maxPlayerMoves === expected ? [] : [`${id}:${exercise.maxPlayerMoves}/${expected}`];
    });
    expect(mismatches).toEqual([]);
  });

  it("contains no generic alternative justification in active non-tactical lessons", () => {
    const offenders = [...training.values()].filter((exercise) => !["tactic", "opening"].includes(exercise.category)
      && exercise.explanation?.whyNaturalAlternativeIsInferior?.includes("ne crée pas le changement concret recherché"));
    expect(offenders.map((exercise) => exercise.id)).toEqual([]);
  });

  it("uses arrows only for real moves/routes and squares for abstract targets", () => {
    const invalid = [...training.values()].filter((exercise) => !["tactic", "opening"].includes(exercise.category))
      .filter((exercise) => exercise.planArrows?.some((arrow) => !arrow.role)
        || exercise.planSquares?.some((square) => !square.role));
    expect(invalid.map((exercise) => exercise.id).slice(0, 20)).toEqual([]);
  });
});
