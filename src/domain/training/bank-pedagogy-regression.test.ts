import { describe, expect, it } from "vitest";
import { allConceptExercises, referenceBank } from "./library";
import {
  BANK_CONTRAST_CHALLENGE, evaluateBankContrastCase, materializeBankContrastCase,
} from "./bank-contrast-challenge";
import {
  PRIORITY_TEACHING_FAMILIES, teachingContractReasons, teachingDisposition,
} from "./teaching-facts";

const SUSPECT_IDS = [
  "contrast-mine-open_file-4125d1b7f568423bf8",
  "contrast-mine-open_file-094051d95da9003225",
  "contrast-mine-outpost-b0b0d5d159ffdfb8b6",
  "contrast-mine-weak_pawn-825be1dd72b0f304dc",
  "contrast-mine-favorable_exchange-fe61049767b389fa1b",
  "contrast-mine-piece_activity-9950c6fa6b03597a21",
  "contrast-mine-king_activity-251f6a1b8905bcfed1",
];

describe("published bank teaching contract", { timeout: 300_000 }, () => {
  const active = allConceptExercises();

  it("keeps all seven audited contradictions outside active training", () => {
    const activeIds = new Set(active.map((exercise) => exercise.id));
    const referenceIds = new Set(referenceBank().map((exercise) => exercise.id));
    for (const id of SUSPECT_IDS) {
      expect(activeIds.has(id), id).toBe(false);
      expect(referenceIds.has(id), id).toBe(true);
    }
  });

  it("binds priority-family prose and annotations to board-derived facts", () => {
    const priority = active.filter((exercise) => PRIORITY_TEACHING_FAMILIES.has(exercise.conceptSlug));
    expect(priority.length).toBeGreaterThan(0);
    for (const exercise of priority) {
      expect(teachingContractReasons(exercise), exercise.id).toEqual([]);
      expect(exercise.explanation?.teachingFacts?.decisionMoveUci, exercise.id).toBe(exercise.bestMove);
    }
  });

  it("invalidates a changed piece/square/target/mechanism contract", () => {
    const exercise = active.find((candidate) => candidate.explanation?.teachingFacts);
    expect(exercise).toBeDefined();
    const changed = {
      ...exercise!,
      explanation: {
        ...exercise!.explanation!,
        teachingFacts: { ...exercise!.explanation!.teachingFacts!, destinationSquare: "a1" },
      },
    };
    expect(teachingContractReasons(changed)).toContain("structured_teaching_facts_stale");
    expect(teachingDisposition(changed)).toBe("reject");
  });

  it("passes classic positives, rejects hard negatives and abstains on ambiguity", () => {
    expect(BANK_CONTRAST_CHALLENGE).toHaveLength(24);
    expect(BANK_CONTRAST_CHALLENGE.filter((challenge) => challenge.type === "B")).toHaveLength(4);
    expect(BANK_CONTRAST_CHALLENGE.filter((challenge) => challenge.type === "D")).toHaveLength(4);
    expect(BANK_CONTRAST_CHALLENGE.filter((challenge) => challenge.type === "E")).toHaveLength(4);
    for (const challenge of BANK_CONTRAST_CHALLENGE) {
      expect(evaluateBankContrastCase(challenge, active), challenge.id).toBe(challenge.expected);
      const materialized = materializeBankContrastCase(challenge, active);
      expect(materialized.id).toBeTruthy();
      expect(challenge.chessReason).toBeTruthy();
      expect(challenge.pedagogicalReason).toBeTruthy();
    }
  });
});
