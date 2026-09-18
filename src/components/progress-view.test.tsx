import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildProgressFixture } from "../domain/progress/progress-read-model.fixtures";
import type { PersistentProfile } from "../infrastructure/supabase/repository";
import { developmentFixtureName, ProgressView, progressAchievements, progressSummary } from "./progress-view";

function renderFixture(name: Parameters<typeof buildProgressFixture>[0]): string {
  const profile = { progress: buildProgressFixture(name) } as PersistentProfile;
  return renderToStaticMarkup(<ProgressView profile={profile} onProfile={() => undefined} onAnalyze={() => undefined} onTrain={() => undefined} />);
}

describe("ProgressView V2", () => {
  it("renders an honest no-data state without a fake chart", () => {
    const html = renderFixture("NO_DATA");
    expect(html).toContain("Ton profil attend sa première analyse");
    expect(html).toContain("La tendance se construit par blocs de 5 parties");
  });

  it("explains insufficient data instead of claiming progress", () => {
    const model = buildProgressFixture("INSUFFICIENT_DATA");
    expect(progressSummary(model).title).toBe("ChessPath apprend encore ton jeu.");
    expect(renderFixture("INSUFFICIENT_DATA")).toContain("Aucune progression n’est encore démontrée");
  });

  it("shows the current priority and its training CTA", () => {
    const html = renderFixture("RICH_PROFILE");
    expect(html).toContain("Fourchette");
    expect(html).toContain("Travailler cette faiblesse");
    expect(html).toContain("Pourquoi ?");
  });

  it("does not describe an emerging signal as recurring", () => {
    expect(progressSummary(buildProgressFixture("EMERGING_ONLY")).title).toContain("commence à apparaître");
    expect(progressSummary(buildProgressFixture("EMERGING_ONLY")).title).not.toContain("récurrent");
  });

  it("derives improving, resolved and observed-strength achievements", () => {
    expect(progressAchievements(buildProgressFixture("IMPROVING"))).toContainEqual(expect.objectContaining({ kind: "IMPROVING" }));
    expect(progressAchievements(buildProgressFixture("RESOLVED"))).toContainEqual(expect.objectContaining({ kind: "RESOLVED" }));
    expect(progressAchievements(buildProgressFixture("RICH_PROFILE"))).toContainEqual(expect.objectContaining({ kind: "STRENGTH" }));
  });

  it("renders collapsed domain accordions with real buttons", () => {
    const html = renderFixture("RICH_PROFILE");
    expect(html).toContain("Tactique");
    expect(html).toContain("Stratégie");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).not.toContain("progress-domain-concepts");
  });

  it("does not bring the removed vanity metrics back", () => {
    const html = renderFixture("RICH_PROFILE");
    expect(html).not.toContain("Parties conservées");
    expect(html).not.toContain("Thèmes suivis");
    expect(html).not.toContain("analyses comparables");
  });

  it("never activates DEV fixtures in production", () => {
    expect(developmentFixtureName("RICH_PROFILE", "production")).toBeNull();
    expect(developmentFixtureName("RICH_PROFILE", "development")).toBe("RICH_PROFILE");
    expect(developmentFixtureName("UNKNOWN", "development")).toBeNull();
  });
});
