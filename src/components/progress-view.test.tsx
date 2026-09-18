import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildProgressFixture } from "../domain/progress/progress-read-model.fixtures";
import type { PersistentProfile } from "../infrastructure/supabase/repository";
import {
  conceptDisplayStatus,
  developmentFixtureName,
  ProgressView,
  progressAchievements,
  progressStrengths,
  progressSummary,
  progressWorkItems,
} from "./progress-view";

function renderFixture(name: Parameters<typeof buildProgressFixture>[0]): string {
  const profile = { progress: buildProgressFixture(name), analyses: [] } as unknown as PersistentProfile;
  return renderToStaticMarkup(<ProgressView profile={profile} onProfile={() => undefined} onAnalyze={() => undefined} onTrain={() => undefined} />);
}

describe("ProgressView player map", () => {
  it("renders low data honestly without a fabricated radar value", () => {
    const html = renderFixture("INSUFFICIENT_DATA");
    expect(html).toContain("Ton profil prend forme");
    expect(html).toContain("Non mesuré");
    expect(html).toContain("Encore 14 parties avant une tendance fiable");
  });

  it("recognizes a balanced profile from the five observed domain rates", () => {
    const model = buildProgressFixture("BALANCED");
    expect(progressSummary(model).title).toBe("Ton profil est plutôt équilibré.");
    const html = renderFixture("BALANCED");
    expect(html).toContain("5/5 domaines mesurés");
    expect(html).toContain("16/20 occasions bien traitées");
  });

  it("shows a strong tactical profile as observed performance, never domain Elo", () => {
    const html = renderFixture("TACTICAL_STRENGTH");
    expect(html).toContain("98 %");
    expect(progressStrengths(buildProgressFixture("TACTICAL_STRENGTH"))).toContainEqual(expect.objectContaining({
      label: "POINT FORT OBSERVÉ",
      concept: expect.objectContaining({ conceptSlug: "fork" }),
    }));
    expect(html).not.toMatch(/elo tactique|elo stratégie|elo finales/i);
  });

  it("labels a demonstrated fragile strategy as a priority with supporting evidence", () => {
    const model = buildProgressFixture("STRATEGY_FRAGILE");
    const work = progressWorkItems(model);
    expect(work[0]).toMatchObject({ label: "PRIORITÉ", concept: { conceptSlug: "open_file" } });
    expect(progressSummary(model).title).toContain("fragilité récurrente en stratégie");
    const html = renderFixture("STRATEGY_FRAGILE");
    expect(html).toContain("Voir mes erreurs");
    expect(html).toContain("5 parties distinctes");
  });

  it("keeps emerging evidence as a recommendation rather than a demonstrated weakness", () => {
    const item = progressWorkItems(buildProgressFixture("EMERGING_ONLY"))[0];
    expect(item.label).toBe("FOCUS RECOMMANDÉ");
    expect(item.detail).toContain("insuffisant pour déclarer une faiblesse");
  });

  it("limits strengths and work recommendations to three items", () => {
    expect(progressStrengths(buildProgressFixture("MULTIPLE_STRENGTHS"))).toHaveLength(3);
    expect(progressWorkItems(buildProgressFixture("RICH_PROFILE")).length).toBeLessThanOrEqual(3);
  });

  it("does not call a concept with enough successful observations insufficient", () => {
    const concept = buildProgressFixture("MULTIPLE_STRENGTHS").concepts.find((item) => item.conceptSlug === "fork")!;
    expect(concept.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(conceptDisplayStatus(concept)).toBe("Point fort observé");
  });

  it("keeps real progress distinct from observed strength", () => {
    expect(progressAchievements(buildProgressFixture("IMPROVING"))).toContainEqual(expect.objectContaining({ kind: "IMPROVING" }));
    expect(progressAchievements(buildProgressFixture("RESOLVED"))).toContainEqual(expect.objectContaining({ kind: "RESOLVED" }));
    expect(renderFixture("INSUFFICIENT_DATA")).toContain("avant une tendance fiable");
  });

  it("renders accessible domain exploration and training actions", () => {
    const html = renderFixture("RICH_PROFILE");
    expect(html).toContain("Explorer par domaine");
    expect(html).toContain("Tactique");
    expect(html).toContain("Stratégie");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("M’entraîner");
  });

  it("never activates DEV fixtures in production", () => {
    expect(developmentFixtureName("RICH_PROFILE", "production")).toBeNull();
    expect(developmentFixtureName("BALANCED", "development")).toBe("BALANCED");
    expect(developmentFixtureName("UNKNOWN", "development")).toBeNull();
  });
});
