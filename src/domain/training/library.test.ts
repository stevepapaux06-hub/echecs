import { Chess, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  allConceptExercises,
  conceptExercisesFor,
  LICHESS_LIBRARY_METADATA,
  TRAINING_BANK_GATE_REPORT,
  referenceBank,
} from "./library";

describe("curated training library", () => {
  it("contains legal positions and legal reference moves", () => {
    for (const exercise of allConceptExercises()) {
      const chess = new Chess(exercise.fen);
      const line = exercise.solutionLine ?? [exercise.bestMove];
      for (const uci of line) {
        expect(() => chess.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci.slice(4, 5) || "q",
        }), `${exercise.id}: ${uci}`).not.toThrow();
      }
    }
  }, 15_000);

  it("contains genuinely different multi-move tactic, endgame and conversion positions", () => {
    const exercises = allConceptExercises();
    expect(new Set(exercises.map((exercise) => exercise.fen)).size).toBe(exercises.length);
    expect(exercises.some((exercise) => exercise.category === "tactic" && exercise.mode === "line")).toBe(true);
    expect(exercises.some((exercise) => exercise.category === "endgame" && exercise.mode === "playout")).toBe(true);
    expect(exercises.some((exercise) => exercise.category === "conversion" && exercise.mode === "playout")).toBe(true);
    expect(exercises.filter((exercise) => exercise.category === "tactic").length).toBeGreaterThanOrEqual(2);
    expect(exercises.filter((exercise) => exercise.category === "endgame").length).toBeGreaterThanOrEqual(2);
    expect(exercises.filter((exercise) => exercise.category === "conversion").length).toBeGreaterThanOrEqual(2);
  });

  it("selects the exact weakness slug and adapts rating when choices exist", () => {
    const selected = conceptExercisesFor("tactic", "fork", 5, 1_500);
    expect(selected).toHaveLength(5);
    expect(selected.every((exercise) => exercise.conceptSlug === "fork")).toBe(true);
    const rated = selected.filter((exercise) => exercise.difficulty !== undefined);
    expect(rated.length).toBeGreaterThan(1);
    const distances = rated.map((exercise) => Math.abs((exercise.difficulty ?? 0) - 1_500));
    expect(distances).toEqual([...distances].toSorted((a, b) => a - b));
  });

  it("ships a varied verified offline Lichess bank", () => {
    const lichess = allConceptExercises().filter((exercise) => exercise.source === "lichess");
    expect(LICHESS_LIBRARY_METADATA.positions).toBe(2_747);
    expect(lichess.filter((exercise) => exercise.category === "tactic")).toHaveLength(2_194);
    const concepts = new Set(lichess.map((exercise) => exercise.conceptSlug));
    for (const concept of ["fork", "pin", "skewer", "loose_piece", "remove_defender", "opponent_threat"]) {
      expect(concepts.has(concept)).toBe(true);
    }
    expect(lichess.every((exercise) => (
      exercise.isVerified
      && exercise.verificationStatus === "active"
      && exercise.sourceId
      && exercise.difficulty
    ))).toBe(true);
    expect(lichess.filter((exercise) => exercise.category === "endgame")
      .every((exercise) => exercise.phase === "endgame")).toBe(true);
  });

  it("publishes only positions that pass the technical and pedagogical gate", () => {
    expect(TRAINING_BANK_GATE_REPORT.total).toBeGreaterThan(TRAINING_BANK_GATE_REPORT.active);
    expect(TRAINING_BANK_GATE_REPORT.rejected).toBeGreaterThan(0);
    expect(TRAINING_BANK_GATE_REPORT.needsVerification).toBeGreaterThan(0);
    expect(allConceptExercises().every((exercise) => (
      exercise.verificationStatus === "active"
      && Boolean(exercise.verificationSource)
      && Boolean(exercise.verification)
    ))).toBe(true);
    expect(allConceptExercises().some((exercise) => exercise.id === "concept-conversion-rook-pawn")).toBe(false);
  });

  it("retains the deep reference corpus without mistaking volume for exerciseability", () => {
    const master = referenceBank().filter((exercise) => exercise.source === "master_game");
    const byDomain = (domain: string) => master.filter((exercise) => exercise.domain === domain);
    expect(master.length).toBeGreaterThanOrEqual(530);
    expect(byDomain("strategy").length).toBeGreaterThanOrEqual(200);
    expect(byDomain("endgame").length).toBeGreaterThanOrEqual(185);
    expect(byDomain("conversion").length).toBeGreaterThanOrEqual(130);

    const strategyMinimums: Record<string, number> = {
      improve_worst_piece: 20,
      outpost: 20,
      open_file: 24,
      weak_square: 16,
      weak_pawn: 20,
      pawn_break: 24,
      favorable_exchange: 18,
      piece_activity: 20,
      pawn_structure: 20,
    };
    for (const [concept, minimum] of Object.entries(strategyMinimums)) {
      expect(master.filter((exercise) => exercise.conceptSlug === concept).length, concept)
        .toBeGreaterThanOrEqual(minimum);
    }
    const training = allConceptExercises().filter((exercise) => !["tactic", "opening"].includes(exercise.category));
    expect(training.length).toBeGreaterThan(300);
    expect(training.every((exercise) => exercise.trainingAssessment?.exerciseability
      && exercise.trainingAssessment.failedGates.length === 0
      && exercise.trainingAssessment.score >= 9)).toBe(true);
  });

  it("keeps strategy quiet, conversion modest and ending families honest", () => {
    const master = allConceptExercises().filter((exercise) => !["tactic", "opening"].includes(exercise.category));
    const strategy = master.filter((exercise) => exercise.domain === "strategy");
    expect(strategy.every((exercise) => (
      exercise.phase === "middlegame"
      && exercise.baselinePlayerCp >= -150
      && exercise.baselinePlayerCp <= 150
    ))).toBe(true);

    const conversion = master.filter((exercise) => exercise.domain === "conversion");
    expect(conversion.every((exercise) => (
      exercise.baselinePlayerCp >= 80 && exercise.baselinePlayerCp <= 320
    ))).toBe(true);

    const nonPawnFamily = (exercise: (typeof master)[number]) => {
      const chess = new Chess(exercise.fen);
      return chess.board().flat().filter((piece) => piece && !["p", "k"].includes(piece.type));
    };
    expect(master.filter((exercise) => exercise.conceptSlug === "king_and_pawn")
      .every((exercise) => nonPawnFamily(exercise).length === 0)).toBe(true);
    expect(master.filter((exercise) => exercise.conceptSlug === "rook_endgame")
      .every((exercise) => nonPawnFamily(exercise).every((piece) => piece?.type === "r"))).toBe(true);
    expect(master.filter((exercise) => exercise.conceptSlug === "bishop_endgame")
      .every((exercise) => nonPawnFamily(exercise).every((piece) => piece?.type === "b"))).toBe(true);
    expect(master.filter((exercise) => exercise.conceptSlug === "knight_endgame")
      .every((exercise) => nonPawnFamily(exercise).every((piece) => piece?.type === "n"))).toBe(true);
  });

  it("deduplicates positions and keeps one concept varied across long training", () => {
    const master = allConceptExercises().filter((exercise) => !["tactic", "opening"].includes(exercise.category));
    const canonicalFens = master.map((exercise) => exercise.fen.split(" ").slice(0, 4).join(" "));
    expect(new Set(canonicalFens).size).toBe(master.length);

    const openFiles = master.filter((exercise) => exercise.conceptSlug === "open_file");
    const targetFiles = new Set(openFiles.map((exercise) => exercise.bestMove[2]));
    const materialProfiles = new Set(openFiles.map((exercise) => (
      exercise.fen.split(" ")[0].replace(/[1-8/]/g, "").toLowerCase().split("").toSorted().join("")
    )));
    expect(targetFiles.size).toBeGreaterThanOrEqual(4);
    expect(materialProfiles.size).toBeGreaterThanOrEqual(8);

    const continuous = conceptExercisesFor("strategy", "open_file", 16, 1_500);
    expect(continuous).toHaveLength(16);
    expect(new Set(continuous.map((exercise) => exercise.fen)).size).toBe(16);
  });

  it("hydrates master positions with causal teaching and board annotations", () => {
    const master = allConceptExercises().filter((exercise) => exercise.source === "master_game");
    expect(master.every((exercise) => (
      Boolean(exercise.explanation?.notice)
      && Boolean(exercise.explanation?.plan)
      && Boolean(exercise.explanation?.objective)
      && Boolean(exercise.explanation?.rule)
      && Boolean(exercise.explanation?.positionEssentials)
      && Boolean(exercise.explanation?.chosenPlanRationale)
      && Boolean(exercise.explanation?.planSteps?.length)
      && Boolean(exercise.explanation?.transferRule)
      && Boolean(exercise.planArrows?.length)
      && Boolean(exercise.planSquares?.length)
    ))).toBe(true);
  });

  it("retains theoretical references without exposing an unproved method as Training", () => {
    const verified = referenceBank().filter((exercise) => exercise.source === "lichess_tablebase");
    for (const concept of ["lucena", "philidor", "rule_of_square"]) {
      const exercise = verified.find((candidate) => candidate.conceptSlug === concept);
      expect(exercise, concept).toBeDefined();
      expect(exercise?.phase).toBe("endgame");
      expect(exercise?.tablebaseWdl).toMatch(/win|draw|loss/);
    }
    expect(allConceptExercises().filter((exercise) => exercise.category === "endgame")
      .every((exercise) => Boolean(exercise.pedagogicalMilestone))).toBe(true);
  });
});
