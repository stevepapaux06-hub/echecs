#!/usr/bin/env node

/** Reproducible, read-only pilot selector. It joins previously evaluated
 * candidates to the exact public Lichess PGN headers, without promoting any
 * position. The output is a review ledger, not a training-bank generator. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const corpus = resolve(root, ".tmp-corpus/lichess_db_standard_rated_2013-01.pgn");
const runtimePath = resolve(root, "src/domain/training/runtime-bank.generated.ts");
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : null;

function runtimeBank() {
  const source = readFileSync(runtimePath, "utf8");
  const match = source.match(/export default JSON\.parse\((.*)\) as unknown\[\];/s);
  if (!match) throw new Error("Runtime bank is not compiled");
  return JSON.parse(JSON.parse(match[1]));
}

function candidateRows() {
  const active = new Set(runtimeBank().map((exercise) => exercise.id));
  const validationSource = readFileSync(resolve(root, "src/domain/training/validation.ts"), "utf8");
  const holdSection = validationSource.match(/const ENGINE_REVIEW_HOLD[\s\S]+?function legalLine/)?.[0] ?? "";
  const holds = new Set([...holdSection.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  const rows = [];
  for (let shard = 0; shard < 7; shard += 1) {
    const content = readFileSync(resolve(root, `.tmp-corpus/repopulation-${shard}.jsonl`), "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;
      const record = JSON.parse(line);
      const exercise = record.exercise;
      if (exercise.source !== "lichess_standard"
        || record.assessment?.exerciseability !== true
        || active.has(exercise.id)
        || holds.has(exercise.id)) continue;
      rows.push({ exercise, assessment: record.assessment, corpus: record.corpus, shard });
    }
  }
  return rows;
}

function pgnMetadata(gameIds) {
  const metadata = new Map();
  const games = readFileSync(corpus, "utf8").split(/(?=\[Event )/);
  for (const game of games) {
    const gameId = game.match(/\[Site "https:\/\/lichess\.org\/([A-Za-z0-9]+)"\]/)?.[1];
    if (!gameId || !gameIds.has(gameId)) continue;
    const header = (name) => game.match(new RegExp(`\\[${name} "([^"]*)"\\]`))?.[1];
    const whiteElo = Number(header("WhiteElo") || 0);
    const blackElo = Number(header("BlackElo") || 0);
    metadata.set(gameId, {
      gameId,
      url: `https://lichess.org/${gameId}`,
      players: [header("White"), header("Black")],
      ratings: [whiteElo, blackElo],
      averageRating: whiteElo && blackElo ? Math.round((whiteElo + blackElo) / 2) : null,
      date: header("UTCDate"),
      timeControl: header("TimeControl"),
      event: header("Event"),
      sourceCorpus: "lichess_db_standard_rated_2013-01",
      sourceUrl: "https://database.lichess.org/standard/",
      license: "CC0",
    });
  }
  return metadata;
}

function ratingBand(rating) {
  if (!rating) return "unknown";
  if (rating < 1000) return "800-1000";
  if (rating < 1200) return "1000-1200";
  if (rating < 1400) return "1200-1400";
  if (rating < 1600) return "1400-1600";
  if (rating < 1800) return "1600-1800";
  return ">1800";
}

function balancedPilot(rows) {
  const domains = ["strategy", "conversion", "endgame", "defense"];
  const selected = [];
  for (const domain of domains) {
    const pool = rows.filter((row) => (row.exercise.domain ?? row.exercise.category) === domain)
      .toSorted((first, second) => {
        if (domain === "strategy") {
          const firstTarget = Number(first.provenance.averageRating >= 800 && first.provenance.averageRating < 1200);
          const secondTarget = Number(second.provenance.averageRating >= 800 && second.provenance.averageRating < 1200);
          if (firstTarget !== secondTarget) return secondTarget - firstTarget;
        }
        if (domain === "conversion") {
          const firstSequence = Number((first.exercise.solutionLine?.length ?? 0) >= 3);
          const secondSequence = Number((second.exercise.solutionLine?.length ?? 0) >= 3);
          if (firstSequence !== secondSequence) return secondSequence - firstSequence;
        }
        return (second.assessment.score ?? 0) - (first.assessment.score ?? 0)
          || first.exercise.id.localeCompare(second.exercise.id);
      });
    const conceptCounts = new Map();
    const games = new Set();
    for (const row of pool) {
      if (selected.filter((candidate) => (candidate.exercise.domain ?? candidate.exercise.category) === domain).length >= 20) break;
      const concept = row.exercise.conceptSlug;
      if ((conceptCounts.get(concept) ?? 0) >= 4 || games.has(row.provenance.gameId)) continue;
      conceptCounts.set(concept, (conceptCounts.get(concept) ?? 0) + 1);
      games.add(row.provenance.gameId);
      selected.push(row);
    }
  }
  return selected;
}

const raw = candidateRows();
const metadata = pgnMetadata(new Set(raw.map((row) => row.exercise.sourceGameId)));
const joined = raw.map((row) => ({ ...row, provenance: metadata.get(row.exercise.sourceGameId) }))
  .filter((row) => row.provenance?.averageRating >= 800 && row.provenance.averageRating <= 1800);
const selected = balancedPilot(joined);
const bandCounts = Object.fromEntries([...new Set(["800-1000", "1000-1200", "1200-1400", "1400-1600", "1600-1800", ">1800", "unknown"])]
  .map((band) => [band, selected.filter((row) => ratingBand(row.provenance.averageRating) === band).length]));
const domainCounts = Object.fromEntries(["strategy", "conversion", "endgame", "defense"]
  .map((domain) => [domain, selected.filter((row) => (row.exercise.domain ?? row.exercise.category) === domain).length]));
const result = {
  generatedAt: new Date().toISOString(),
  source: {
    corpus: "lichess_db_standard_rated_2013-01.pgn",
    url: "https://database.lichess.org/standard/",
    license: "CC0",
    format: "PGN with player ratings, date and time control",
  },
  pipeline: "previously Stockfish-evaluated, not active, current exerciseability=true, engine holds excluded, provenance rejoined from source PGN",
  eligibleBeforePilotLimit: joined.length,
  selectedForDeepReview: selected.length,
  domainCounts,
  ratingBands: bandCounts,
  candidates: selected.map(({ exercise, assessment, provenance, shard }) => ({
    id: exercise.id,
    domain: exercise.domain ?? exercise.category,
    concept: exercise.conceptSlug,
    fen: exercise.fen,
    bestMove: exercise.bestMove,
    solutionLine: exercise.solutionLine,
    baselinePlayerCp: exercise.baselinePlayerCp,
    pedagogicalDifficulty: exercise.difficulty,
    assessment,
    provenance,
    sourceRecord: `repopulation-${shard}.jsonl`,
  })),
};

if (outputPath) writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
else console.log(JSON.stringify(result, null, 2));
