import { describe, expect, it } from "vitest";
import { PROGRESS_FIXTURE_NAMES, buildProgressFixture, progressFixtureInput } from "./progress-read-model.fixtures";
import { buildProgressReadModel, type ProgressEvidenceSample, type ProgressGameSample } from "./progress-read-model";

function concept(fixture: ReturnType<typeof buildProgressFixture>, slug: string) {
  const result = fixture.concepts.find((item) => item.conceptSlug === slug);
  expect(result).toBeDefined();
  return result!;
}

describe("progress read model", () => {
  it("exposes explicit no-data and insufficient-data states", () => {
    expect(buildProgressFixture("NO_DATA")).toMatchObject({ dataState: "NO_DATA", uniqueGames: 0 });
    expect(buildProgressFixture("INSUFFICIENT_DATA")).toMatchObject({
      dataState: "INSUFFICIENT_DATA",
      windows: { recentGames: 6, previousGames: 0 },
    });
  });

  it("keeps emerging and recurring states from the existing weakness aggregator", () => {
    expect(concept(buildProgressFixture("EMERGING_ONLY"), "fork").status).toBe("EMERGING");
    expect(concept(buildProgressFixture("RECURRING"), "fork").status).toBe("RECURRING");
  });

  it("compares the latest 10 unique games with the preceding 10", () => {
    const result = buildProgressFixture("IMPROVING");
    const openFile = concept(result, "open_file");
    expect(result.dataState).toBe("READY");
    expect(openFile.previous).toMatchObject({ gameCount: 10, exposures: 10, correctlyTreated: 6 });
    expect(openFile.recent).toMatchObject({ gameCount: 10, exposures: 10, correctlyTreated: 9 });
    expect(openFile.status).toBe("IMPROVING");
  });

  it("resolves only a historically recurring concept with enough correctly treated exposure", () => {
    const outpost = concept(buildProgressFixture("RESOLVED"), "outpost");
    expect(outpost).toMatchObject({ historicalStatus: "RECURRING", status: "RESOLVED", trend: "RESOLVED" });
    expect(outpost.recent).toMatchObject({ exposures: 6, correctlyTreated: 6, gamesWithValidatedProblem: 0 });
  });

  it("does not infer improvement or resolution from absence without comparable exposure", () => {
    const input = progressFixtureInput("RESOLVED");
    input.games = input.games.map((game) => ({ ...game, concepts: [] }));
    const outpost = concept(buildProgressReadModel(input), "outpost");
    expect(outpost.status).toBe("RECURRING");
    expect(outpost.trend).toBe("INSUFFICIENT_DATA");
  });

  it("reports strengths only with at least five recent comparable opportunities and 80% success", () => {
    const rich = buildProgressFixture("RICH_PROFILE");
    expect(rich.observedStrengths).toContainEqual(expect.objectContaining({
      conceptSlug: "piece_activity",
      opportunities: 5,
      correctlyTreated: 5,
      successRate: 1,
    }));
    expect(rich.observedStrengths.some((item) => item.conceptSlug === "pin")).toBe(false);
  });

  it("builds each player-map axis from observed opportunities without inventing missing data", () => {
    const balanced = buildProgressFixture("BALANCED");
    expect(balanced.domains).toHaveLength(5);
    expect(balanced.domains.find((domain) => domain.category === "tactic")).toMatchObject({
      opportunities: 20,
      correctlyTreated: 16,
      successRate: 0.8,
      observation: "WELL_OBSERVED",
    });
    expect(buildProgressFixture("INSUFFICIENT_DATA").domains.every((domain) => (
      domain.successRate === null && domain.observation === "INSUFFICIENT_DATA"
    ))).toBe(true);
  });

  it("does not call a well-observed 73/74 concept insufficient", () => {
    const input = progressFixtureInput("RICH_PROFILE");
    input.games = Array.from({ length: 20 }, (_, index) => ({
      ...input.games[index],
      concepts: [{ conceptSlug: "fork", opportunities: index < 17 ? 4 : 2, successes: index === 0 ? 3 : index < 17 ? 4 : 2 }],
    }));
    input.evidence = [];
    const result = buildProgressReadModel(input);
    expect(result.domains.find((domain) => domain.category === "tactic")).toMatchObject({
      opportunities: 74,
      correctlyTreated: 73,
      observation: "WELL_OBSERVED",
    });
    expect(result.observedStrengths).toContainEqual(expect.objectContaining({ conceptSlug: "fork" }));
  });

  it("keeps ERROR and OPPORTUNITY evidence separate", () => {
    const recurring = concept(buildProgressFixture("RECURRING"), "fork");
    expect(recurring).toMatchObject({ historicalErrors: 2, historicalMissedOpportunities: 1 });
    expect(recurring.recent).toMatchObject({ errors: 2, missedOpportunities: 1 });
  });

  it("ignores invalid, secondary and low-confidence proof in every progress projection", () => {
    const input = progressFixtureInput("RECURRING");
    input.evidence.push(
      { ...input.evidence[0], evidenceId: "invalid", gameId: "g18", momentId: "30", validationStatus: "invalidated" },
      { ...input.evidence[0], evidenceId: "secondary", gameId: "g19", momentId: "31", conceptRole: "SECONDARY" },
      { ...input.evidence[0], evidenceId: "low", gameId: "g20", momentId: "32", confidence: 0.79 },
    );
    const result = buildProgressReadModel(input);
    expect(concept(result, "fork").evidenceCount).toBe(3);
    expect(result.graph.overall.at(-1)?.gamesWithValidatedProblem).toBe(2);
  });

  it("builds the simple graph in complete chronological blocks of five games", () => {
    const graph = buildProgressFixture("RICH_PROFILE").graph.overall;
    expect(graph).toHaveLength(4);
    expect(graph.map((point) => point.games)).toEqual([5, 5, 5, 5]);
    expect(graph.map((point) => point.gamesWithValidatedProblem)).toEqual([3, 1, 1, 4]);
    expect(Date.parse(graph[0].fromPlayedAt)).toBeLessThan(Date.parse(graph[1].fromPlayedAt));
  });

  it("deduplicates games and isolates users", () => {
    const input = progressFixtureInput("RECURRING");
    const duplicate = { ...input.games[0], playedAt: new Date(Date.parse(input.games[0].playedAt) - 1_000).toISOString() };
    const foreignGame: ProgressGameSample = { ...input.games[0], userId: "other", uniqueGameKey: "other:g1" };
    const foreignProof: ProgressEvidenceSample = { ...input.evidence[0], userId: "other", evidenceId: "other-proof" };
    const result = buildProgressReadModel({ ...input, games: [...input.games, duplicate, foreignGame], evidence: [...input.evidence, foreignProof] });
    expect(result.uniqueGames).toBe(20);
    expect(concept(result, "fork").evidenceCount).toBe(3);
  });

  it("provides deterministic reevaluation checkpoints", () => {
    expect(buildProgressFixture("NO_DATA").reevaluation.newGamesNeeded).toBe(20);
    expect(buildProgressFixture("INSUFFICIENT_DATA").reevaluation.newGamesNeeded).toBe(14);
    expect(buildProgressFixture("RICH_PROFILE").reevaluation.newGamesNeeded).toBe(5);
  });

  it("selects an explainable current priority and excludes resolved concepts", () => {
    const rich = buildProgressFixture("RICH_PROFILE");
    expect(rich.priority).toMatchObject({ conceptSlug: "fork", status: "RECURRING", distinctGames: 5 });
    expect(rich.priority?.priorityReasons[0]).toContain("5 parties distinctes");
  });

  it("keeps every named DEV/TEST fixture executable through the production read-model builder", () => {
    expect(PROGRESS_FIXTURE_NAMES.map((name) => buildProgressFixture(name).dataState)).toEqual([
      "NO_DATA", "INSUFFICIENT_DATA", "READY", "READY", "READY", "READY",
      "READY", "READY", "READY", "READY", "READY",
    ]);
  });
});
