#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nonTactical = JSON.parse(readFileSync(resolve("src/domain/training/nontactical-bank.generated.json"), "utf8"));
const defense = JSON.parse(readFileSync(resolve("src/domain/training/defense-bank.generated.json"), "utf8"));
const positions = [...nonTactical.positions, ...defense.positions];
const byDomain = {};
const byConcept = {};
const players = new Map();
const games = new Set();
const neighbouringDuplicates = [];
const moments = new Map();

for (const position of positions) {
  const domain = position.domain ?? position.category;
  byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  const concept = `${domain}/${position.primaryConcept ?? position.conceptSlug}`;
  byConcept[concept] = (byConcept[concept] ?? 0) + 1;
  if (position.sourceGameId) games.add(position.sourceGameId);
  for (const player of position.sourcePlayers ?? []) players.set(player, (players.get(player) ?? 0) + 1);
  if (position.sourceGameId && Number.isFinite(position.positionPly)) {
    const key = `${position.sourceGameId}|${position.pedagogicalMechanism ?? position.conceptSlug}`;
    const prior = moments.get(key) ?? [];
    if (prior.some((ply) => Math.abs(ply - position.positionPly) <= 6)) neighbouringDuplicates.push(position.id);
    prior.push(position.positionPly);
    moments.set(key, prior);
  }
}

const topPlayer = [...players.entries()].toSorted((first, second) => second[1] - first[1])[0] ?? null;
console.log(JSON.stringify({
  generatedPositions: positions.length,
  byDomain,
  byConcept,
  uniqueSourceGames: games.size,
  uniquePlayers: players.size,
  largestPlayerConcentration: topPlayer
    ? { player: topPlayer[0], positions: topPlayer[1], share: Number((topPlayer[1] / positions.length).toFixed(4)) }
    : null,
  neighbouringDuplicates: neighbouringDuplicates.length,
  nonTacticalPipeline: nonTactical.miningReport,
  defensePipeline: defense.pipelineReport,
}, null, 2));
