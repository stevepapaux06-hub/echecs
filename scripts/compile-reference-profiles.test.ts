/** Offline compact feature coverage for the scanner. No mining, network or LLM. */
import { writeFileSync } from "node:fs";
import { it, expect } from "vitest";
import { allConceptExercises, referenceBank, TRAINING_BANK_GATE_REPORT } from "../src/domain/training/library";
import QUALITY from "../src/domain/training/quality-bank.generated.json";
import MINED from "../src/domain/training/remined-reference.generated.json";
import { CONCEPT_SPECIFICATIONS } from "../src/domain/patterns/concept-specifications";
import { CONCEPT_HOLDOUT } from "../src/domain/patterns/concept-holdout";

it.skipIf(process.env.CHESSPATH_REFERENCE_COMPILE !== "1")("compiles the Reference Bank into feature coverage, not a FEN lookup", () => {
  const references = referenceBank();
  const concepts: Record<string, { positive: number; boundary: number; sourceGames: number; exampleIds: string[]; boundaryIds: string[] }> = {};
  for (const concept of Object.keys(CONCEPT_SPECIFICATIONS)) {
    const entries = references.filter((exercise) => exercise.conceptSlug === concept && exercise.trainingAssessment);
    const positive = entries.filter((exercise) => !exercise.trainingAssessment!.failedGates.includes("causality")
      && !exercise.trainingAssessment!.failedGates.includes("domain"));
    const boundary = entries.filter((exercise) => exercise.trainingAssessment!.failedGates.includes("causality"));
    concepts[concept] = {
      positive: positive.length, boundary: boundary.length,
      sourceGames: new Set(positive.map((e) => e.sourceGameId ?? e.sourceId ?? e.id)).size,
      exampleIds: positive.slice(0, 4).map((e) => e.id),
      boundaryIds: boundary.slice(0, 4).map((e) => e.id),
    };
  }
  expect(CONCEPT_HOLDOUT.every((sample) => !references.some((e) => e.fen === sample.fen))).toBe(true);
  writeFileSync("src/domain/patterns/reference-profiles.generated.json", JSON.stringify({
    version: 1, provenance: "Existing Reference Bank; automatic feature evidence, not ground-truth accuracy",
    concepts,
  }, null, 2) + "\n");
  const training = allConceptExercises();
  const count = (values: string[]) => values.reduce<Record<string, number>>((out, key) => { out[key] = (out[key] ?? 0) + 1; return out; }, {});
  const source = (e: (typeof training)[number]) => e.sourceGameId ?? e.sourceId?.replace(/[-_]\d+$/, "");
  const knownPlayers = training.flatMap((e) => e.sourcePlayers ?? []);
  const playerCounts = count(knownPlayers);
  const sourceCounts = count(training.map(source).filter((id): id is string => Boolean(id)));
  const strategy = training.filter((e) => e.category === "strategy");
  const sequences = strategy.filter((e) => e.pedagogicalMilestone);
  const endings = training.filter((e) => e.category === "endgame");
  const referenceRoles = count(references.map((e) => e.trainingAssessment?.failedGates.includes("causality") ? "boundary"
    : e.trainingAssessment ? "feature_positive" : "not_human_audited"));
  writeFileSync("docs/bank-quality-report.json", JSON.stringify({
    baseline: { commit: "ad44e5d", reference: 5791, training: 5610, byDomain: { tactic: 2197, strategy: 1117, endgame: 1358, conversion: 708, defense: 228, opening: 2 } },
    reference: { count: references.length, roles: referenceRoles, independentHoldout: CONCEPT_HOLDOUT.length, hardNegativeHoldout: CONCEPT_HOLDOUT.filter((e) => !e.positive).length },
    training: { count: training.length, byDomain: count(training.map((e) => e.category)), byConcept: count(training.map((e) => `${e.category}/${e.conceptSlug}`)) },
    exclusions: { overlappingHumanGates: QUALITY.report.rejectedByGate, technical: TRAINING_BANK_GATE_REPORT },
    remining: { provenance: MINED, accepted: training.filter((e) => e.id.startsWith("quality-mine-")).length },
    strategy: { units: count(strategy.map((e) => e.pedagogicalUnit!)), sequences: sequences.length,
      meanPlayerDecisions: sequences.length ? sequences.reduce((sum, e) => sum + Math.ceil((e.solutionLine?.length ?? 0) / 2), 0) / sequences.length : 0 },
    endings: { milestoneTypes: count(endings.map((e) => e.pedagogicalMilestone!.kind)), proof: count(endings.map((e) => e.pedagogicalMilestone!.proof)),
      outcomeEvidence: count(endings.map((e) => e.trainingAssessment!.outcome!.source)) },
    diversity: { sourceGamesKnown: Object.keys(sourceCounts).length, playersKnown: Object.keys(playerCounts).length,
      positionsWithPlayerMetadata: training.filter((e) => e.sourcePlayers?.length).length,
      topSources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 3),
      topPlayers: Object.entries(playerCounts).sort((a, b) => b[1] - a[1]).slice(0, 3) },
  }, (key, value) => key === "positions" || key.endsWith("Ids") ? undefined : value, 2) + "\n");
});
