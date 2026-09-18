import type { ProgressEvidenceSample, ProgressGameSample, ProgressReadModel } from "./progress-read-model";
import { buildProgressReadModel } from "./progress-read-model";

export const PROGRESS_FIXTURE_NAMES = [
  "NO_DATA",
  "INSUFFICIENT_DATA",
  "EMERGING_ONLY",
  "RECURRING",
  "IMPROVING",
  "RESOLVED",
  "RICH_PROFILE",
] as const;

export type ProgressFixtureName = typeof PROGRESS_FIXTURE_NAMES[number];

const USER_ID = "fixture-user";
const DAY = 24 * 60 * 60 * 1_000;
const START = Date.parse("2026-08-01T12:00:00.000Z");

function game(
  index: number,
  concepts: ProgressGameSample["concepts"] = [],
  userId = USER_ID,
): ProgressGameSample {
  return {
    userId,
    gameId: `g${index}`,
    uniqueGameKey: `chesscom:g${index}`,
    playedAt: new Date(START + index * DAY).toISOString(),
    hasExposureData: true,
    concepts,
  };
}

function proof(
  gameIndex: number,
  conceptSlug: string,
  reason: ProgressEvidenceSample["reason"] = "ERROR",
  momentId = "24",
  userId = USER_ID,
): ProgressEvidenceSample {
  return {
    userId,
    evidenceId: `${userId}:g${gameIndex}:${momentId}:${conceptSlug}`,
    exerciseId: `personal-g${gameIndex}-${momentId}`,
    gameId: `g${gameIndex}`,
    momentId,
    conceptSlug,
    reason,
    conceptRole: "PRIMARY",
    confidence: 0.9,
    occurredAt: new Date(START + gameIndex * DAY).toISOString(),
    validationFingerprint: `fp-g${gameIndex}-${momentId}-${conceptSlug}`,
    validationStatus: "active",
  };
}

function twentyGames(
  exposures: (index: number) => ProgressGameSample["concepts"] = () => [],
): ProgressGameSample[] {
  return Array.from({ length: 20 }, (_, offset) => game(offset + 1, exposures(offset + 1)));
}

export function progressFixtureInput(name: ProgressFixtureName): {
  userId: string;
  games: ProgressGameSample[];
  evidence: ProgressEvidenceSample[];
} {
  if (name === "NO_DATA") return { userId: USER_ID, games: [], evidence: [] };
  if (name === "INSUFFICIENT_DATA") {
    return {
      userId: USER_ID,
      games: Array.from({ length: 6 }, (_, offset) => game(offset + 1)),
      evidence: [proof(6, "fork")],
    };
  }
  if (name === "EMERGING_ONLY") {
    return {
      userId: USER_ID,
      games: twentyGames(),
      evidence: [proof(17, "fork"), proof(20, "fork", "OPPORTUNITY")],
    };
  }
  if (name === "RECURRING") {
    return {
      userId: USER_ID,
      games: twentyGames(),
      evidence: [proof(14, "fork"), proof(17, "fork"), proof(20, "fork", "OPPORTUNITY")],
    };
  }
  if (name === "IMPROVING") {
    return {
      userId: USER_ID,
      games: twentyGames((index) => [{
        conceptSlug: "open_file",
        opportunities: 1,
        successes: index <= 10 ? Number(index > 4) : Number(index !== 20),
      }]),
      evidence: [proof(2, "open_file"), proof(5, "open_file"), proof(8, "open_file"), proof(20, "open_file")],
    };
  }
  if (name === "RESOLVED") {
    return {
      userId: USER_ID,
      games: twentyGames((index) => [{
        conceptSlug: "outpost",
        opportunities: index > 10 && index <= 16 ? 1 : 0,
        successes: index > 10 && index <= 16 ? 1 : 0,
      }]),
      evidence: [proof(2, "outpost"), proof(5, "outpost"), proof(8, "outpost")],
    };
  }

  return {
    userId: USER_ID,
    games: twentyGames((index) => [
      { conceptSlug: "fork", opportunities: 1, successes: Number(![4, 8, 12, 16, 20].includes(index)) },
      { conceptSlug: "open_file", opportunities: 1, successes: index <= 10 ? Number(index > 4) : Number(index !== 20) },
      { conceptSlug: "outpost", opportunities: index > 10 && index <= 16 ? 1 : 0, successes: index > 10 && index <= 16 ? 1 : 0 },
      { conceptSlug: "piece_activity", opportunities: index > 10 && index <= 15 ? 1 : 0, successes: index > 10 && index <= 15 ? 1 : 0 },
    ]),
    evidence: [
      proof(4, "fork"), proof(8, "fork"), proof(12, "fork"), proof(16, "fork"), proof(20, "fork"),
      proof(2, "open_file"), proof(5, "open_file"), proof(8, "open_file"), proof(20, "open_file"),
      proof(2, "outpost"), proof(5, "outpost"), proof(8, "outpost"),
      proof(18, "pin"), proof(19, "pin", "OPPORTUNITY"),
    ],
  };
}

/** DEV/TEST-only fixture entry point; production data never flows through here. */
export function buildProgressFixture(name: ProgressFixtureName): ProgressReadModel {
  return buildProgressReadModel(progressFixtureInput(name));
}
