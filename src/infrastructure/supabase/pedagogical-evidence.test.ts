import { describe, expect, it } from "vitest";
import {
  aggregateRecurringWeaknesses,
  type ValidatedWeaknessEvidence,
} from "../../domain/diagnostic/recurring-weaknesses";
import {
  activeWeaknessEvidenceFromRows,
  mergePedagogicalEvidenceForAnalyzedGames,
  type PersistedPedagogicalEvidence,
} from "./pedagogical-evidence";

const DATES = [
  "2026-09-01T12:00:00.000Z",
  "2026-09-08T12:00:00.000Z",
  "2026-09-15T12:00:00.000Z",
];

function evidence(gameId: string, conceptSlug = "fork", momentId = "20"): ValidatedWeaknessEvidence {
  return {
    evidenceId: `${gameId}:${momentId}:${conceptSlug}`,
    exerciseId: `personal-${gameId}-${momentId}`,
    gameId,
    momentId,
    conceptSlug,
    reason: "ERROR",
    conceptRole: "PRIMARY",
    confidence: 0.92,
    occurredAt: DATES[0],
    validationFingerprint: `fingerprint-${gameId}-${momentId}-${conceptSlug}`,
    validationStatus: "active",
  };
}

function applyAnalysis(
  history: PersistedPedagogicalEvidence[],
  userId: string,
  gameIds: string[],
  current: ValidatedWeaknessEvidence[],
  analyzedAt: string,
): PersistedPedagogicalEvidence[] {
  const analyzed = new Set(gameIds);
  const untouched = history.filter((row) => row.user_id !== userId || !analyzed.has(row.game_id));
  const existing = history.filter((row) => row.user_id === userId && analyzed.has(row.game_id));
  return [...untouched, ...mergePedagogicalEvidenceForAnalyzedGames({
    userId,
    analyzedGameIds: gameIds,
    existing,
    current,
    analyzedAt,
  })];
}

function profile(history: PersistedPedagogicalEvidence[], userId: string) {
  return aggregateRecurringWeaknesses(
    activeWeaknessEvidenceFromRows(history, userId),
    Date.parse("2026-09-17T12:00:00.000Z"),
  );
}

describe("persistent pedagogical evidence", () => {
  it("stores the first analysis as insufficient evidence", () => {
    const history = applyAnalysis([], "user-a", ["g1"], [evidence("g1")], DATES[0]);
    expect(history).toHaveLength(1);
    expect(profile(history, "user-a")[0]).toMatchObject({
      conceptSlug: "fork",
      status: "INSUFFICIENT_EVIDENCE",
      distinctGames: 1,
    });
  });

  it("promotes the second independent game to emerging and the third to recurring", () => {
    let history = applyAnalysis([], "user-a", ["g1"], [evidence("g1")], DATES[0]);
    history = applyAnalysis(history, "user-a", ["g2"], [evidence("g2")], DATES[1]);
    expect(profile(history, "user-a")[0].status).toBe("EMERGING");
    history = applyAnalysis(history, "user-a", ["g3"], [evidence("g3")], DATES[2]);
    expect(profile(history, "user-a")[0]).toMatchObject({ status: "RECURRING", distinctGames: 3 });
  });

  it("is idempotent when the same game is analyzed again", () => {
    let history = applyAnalysis([], "user-a", ["g1"], [evidence("g1")], DATES[0]);
    history = applyAnalysis(history, "user-a", ["g1"], [evidence("g1")], DATES[1]);
    expect(activeWeaknessEvidenceFromRows(history, "user-a")).toHaveLength(1);
    expect(profile(history, "user-a")[0].evidenceCount).toBe(1);
  });

  it("keeps different concepts in separate histories", () => {
    let history = applyAnalysis([], "user-a", ["g1"], [evidence("g1", "fork")], DATES[0]);
    history = applyAnalysis(history, "user-a", ["g2"], [evidence("g2", "pin")], DATES[1]);
    expect(profile(history, "user-a").map((item) => item.conceptSlug).toSorted())
      .toEqual(["fork", "pin"]);
  });

  it("invalidates evidence that is no longer valid after re-analysis", () => {
    let history = applyAnalysis([], "user-a", ["g1"], [evidence("g1")], DATES[0]);
    history = applyAnalysis(history, "user-a", ["g1"], [], DATES[1]);
    expect(history[0]).toMatchObject({ is_active: false, invalidated_at: DATES[1] });
    expect(profile(history, "user-a")).toEqual([]);
  });

  it("strictly separates two users even for the same game and moment", () => {
    let history = applyAnalysis([], "user-a", ["g1"], [evidence("g1", "fork")], DATES[0]);
    history = applyAnalysis(history, "user-b", ["g1"], [evidence("g1", "pin")], DATES[1]);
    expect(profile(history, "user-a").map((item) => item.conceptSlug)).toEqual(["fork"]);
    expect(profile(history, "user-b").map((item) => item.conceptSlug)).toEqual(["pin"]);
  });
});
