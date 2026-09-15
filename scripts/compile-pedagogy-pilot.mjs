#!/usr/bin/env node

/** Compiles only the deliberately selected sourcing pilot. Candidate ledgers
 * stay outside runtime; the active and challenge corpora remain explicit. */
import { readFileSync, writeFileSync } from "node:fs";

const CONVERSION_ACTIVE_IDS = [
  "master-convert_small_advantage-1950b775762cdd",
  "master-convert_small_advantage-785b1cea1ab4d4",
  "master-preserve_activity-127a510bb797e6",
  "master-simplify_when_ahead-a6ea4df0000c4d",
  "master-preserve_activity-414ac68db26bdc",
];
const RATING_CHALLENGE_IDS = [
  "rating-pilot-piece_activity-964d3a330ea38a",
  "rating-pilot-weak_pawn-98381e08a999bb",
  "rating-pilot-pawn_break-2e911a07a9b23a",
  "rating-pilot-open_file-2c465ea3a46d53",
];

function repopulationRows() {
  const records = new Map();
  for (let shard = 0; shard < 7; shard += 1) {
    for (const line of readFileSync(`.tmp-corpus/repopulation-${shard}.jsonl`, "utf8").split(/\r?\n/)) {
      if (!line) continue; const record = JSON.parse(line); records.set(record.exercise.id, record);
    }
  }
  return records;
}

function pgnMetadata(gameIds) {
  const metadata = new Map();
  const games = readFileSync(".tmp-corpus/lichess_db_standard_rated_2013-01.pgn", "utf8").split(/(?=\[Event )/);
  for (const game of games) {
    const id = game.match(/\[Site "https:\/\/lichess\.org\/([A-Za-z0-9]+)"\]/)?.[1];
    if (!id || !gameIds.has(id)) continue;
    const header = (name) => game.match(new RegExp(`\\[${name} "([^"]*)"\\]`))?.[1];
    const white = Number(header("WhiteElo") || 0); const black = Number(header("BlackElo") || 0);
    metadata.set(id, {
      sourcePlayerRatings: [white, black], sourceAverageRating: white && black ? Math.round((white + black) / 2) : undefined,
      sourceDate: header("UTCDate"), sourceTimeControl: header("TimeControl"),
      sourceCorpus: "lichess_db_standard_rated_2013-01", sourceCorpusUrl: "https://database.lichess.org/standard/",
      sourceLicense: "CC0",
    });
  }
  return metadata;
}

const rating = JSON.parse(readFileSync(".tmp-corpus/rating-pilot-review.json", "utf8"));
const records = repopulationRows();
const selectedRecords = CONVERSION_ACTIVE_IDS.map((id) => records.get(id));
if (selectedRecords.some((record) => !record)) throw new Error("Missing selected conversion record");
const metadata = pgnMetadata(new Set(selectedRecords.map((record) => record.exercise.sourceGameId)));

// The one structurally valid 800–1200 position has two genuinely sound plans:
// Stockfish slightly prefers ...h6 while the authored lesson accepts only ...c5.
// Keep it as competing-plan evidence until the exercise can accept and explain
// both plans; precision is more important than publishing a quota candidate.
const ratingCompetingPlans = rating.active.map(({ exercise, assessment }) => ({
  exercise: {
    ...exercise,
    isVerified: false,
    trainingAssessment: {
      ...assessment,
      exerciseability: false,
      reasons: [...assessment.reasons, "competing_sound_plan_not_explained"],
    },
  },
  disposition: "CHALLENGE_REFERENCE",
  reasons: ["competing_sound_plan_not_explained"],
}));
const conversionActive = selectedRecords.map(({ exercise, assessment }) => ({
  ...exercise,
  ...metadata.get(exercise.sourceGameId),
  trainingAssessment: assessment,
  conceptRelabelLocked: true,
  sourceRole: "human_practice",
}));
const challengeReference = [...ratingCompetingPlans, ...rating.challenge
  .filter(({ exercise }) => RATING_CHALLENGE_IDS.includes(exercise.id))
  .map((record) => ({
    exercise: { ...record.exercise, trainingAssessment: record.assessment, isVerified: false },
    disposition: "CHALLENGE_REFERENCE",
    reasons: record.reasons,
  }))];

const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  policy: "No quota promotion: only current causal, engine, outcome, contrast and explanation gates may publish.",
  activeTraining: conversionActive,
  challengeReference,
  quarantine: [],
  rejected: [
    ...rating.rejected.map((record) => ({ id: record.exercise.id, reasons: record.reasons })),
    ...rating.challenge.filter((record) => !RATING_CHALLENGE_IDS.includes(record.exercise.id))
      .map((record) => ({ id: record.exercise.id, reasons: record.reasons })),
    { id: "master-simplify_when_ahead-0980a43c4e0123", reasons: ["same_source_game_as_active_lesson"] },
    { id: "quality-mine-restrict_counterplay-1dcd5524ac4030", reasons: ["advantage_above_conversion_pilot_prior"] },
    { id: "quality-mine-restrict_counterplay-77ee7cf7938428", reasons: ["advantage_above_conversion_pilot_prior"] },
  ],
  report: {
    sourceGames800To1200: rating.sourceGamesEligible,
    strategyDeepReview: rating.positionsExaminedDeeply,
    priorLichessDeepReview: 48,
    activeByDomain: { strategy: 0, conversion: conversionActive.length, endgame: 0, defense: 0 },
    referenceByDomain: { strategy: challengeReference.length, conversion: 0, endgame: 3, defense: 0 },
    sourceDecisions: {
      lichessStandard2013: "use_for_1200_1800_conversion_and_model_positions",
      datasnaekTidyTuesday: "stop_after_bounded_800_1200_pilot_low_yield",
      lichessPuzzles: "retain_for_verified_defensive_resources_not_quiet_strategy",
      lichessTablebase: "retain_as_technical_truth_reference_not_automatic_concept_label",
      fics: "do_not_ingest_until_licence_is_clear",
      booksAndArticles: "taxonomy_reference_only_no_bulk_copy",
    },
  },
};

writeFileSync("src/domain/training/pedagogy-pilot.generated.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ active: result.activeTraining.length, challenge: result.challengeReference.length, rejected: result.rejected.length }, null, 2));
