/** Opt-in, bounded sourcing pilot for ordinary 800-1200 Lichess games.
 * Run with CHESSPATH_RATING_PILOT=1. It examines at most 25 structurally
 * promising positions, then lets the normal causal + Stockfish gates decide.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Chess, type Move } from "chess.js";
import { it } from "vitest";
import type { TrainingCandidateLine, TrainingExercise } from "../src/domain/chess/types";
import {
  causalFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification,
} from "../src/domain/patterns/concept-specifications";
import { assessDecisionContrast, humanAlternativePool } from "../src/domain/training/decision-contrast";
import { assessHumanQuality, playLine, type OutcomeEvidence } from "../src/domain/training/human-quality";
import { search, saveCaches, startEngine, stopEngine } from "./audit-training-quality.test";

type CsvGame = {
  game_id: string; rated: string; start_time: string; turns: string;
  time_increment: string; white_id: string; white_rating: string;
  black_id: string; black_rating: string; moves: string;
};

const CONCEPTS = [
  "open_file", "outpost", "improve_worst_piece", "weak_pawn",
  "pawn_break", "favorable_exchange", "piece_activity",
] as const;

function csvRows(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); field = ""; if (row.some(Boolean)) rows.push(row); row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function games(): CsvGame[] {
  const rows = csvRows(readFileSync(".tmp-corpus/lichess-datasnaek-20k.csv", "utf8"));
  const headers = rows.shift()!;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as CsvGame);
}

function uci(move: Move): string { return `${move.from}${move.to}${move.promotion ?? ""}`; }
function canonical(fen: string): string { return fen.split(" ").slice(0, 4).join(" "); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 14); }
function dateFromMillis(value: string): string | undefined {
  const date = new Date(Number(value)); return Number.isNaN(date.valueOf()) ? undefined : date.toISOString().slice(0, 10);
}

async function comparisons(fen: string, chosen: string): Promise<TrainingCandidateLine[]> {
  const root = await search(fen, "", 4, 10); const lines = [...root.lines];
  for (const move of [chosen, ...humanAlternativePool(fen, [...lines.map((line) => line.uci), chosen], 4)]) {
    if (lines.some((line) => line.uci === move)) continue;
    const forced = await search(fen, move, 1, 10); if (forced.lines[0]) lines.push(forced.lines[0]);
  }
  return lines.toSorted((first, second) => second.playerCp - first.playerCp);
}

it.skipIf(process.env.CHESSPATH_RATING_PILOT !== "1")(
  "examines a bounded 800-1200 real-game sourcing pilot",
  async () => {
    const rawCandidates: Array<{ game: CsvGame; move: Move; concept: string; ply: number }> = [];
    const perConcept = new Map<string, number>(); const seenGames = new Set<string>();
    const sourceGames = games().filter((game) => {
      const white = Number(game.white_rating); const black = Number(game.black_rating);
      const minutes = Number(game.time_increment.split("+")[0]);
      return game.rated === "TRUE" && white >= 800 && white <= 1200 && black >= 800 && black <= 1200
        && Math.abs(white - black) <= 300 && minutes >= 8 && Number(game.turns) >= 30;
    });
    for (const game of sourceGames) {
      const chess = new Chess();
      try {
        for (const san of game.moves.split(/\s+/).filter(Boolean)) chess.move(san);
      } catch { continue; }
      for (const [index, move] of chess.history({ verbose: true }).entries()) {
        if (index < 18 || index > 90 || move.captured || move.promotion || /[+#]/.test(move.san)) continue;
        const feature = causalFeatures(move.before, uci(move));
        if (!feature || feature.phase !== "middlegame" || feature.legalChoices < 5) continue;
        const concept = CONCEPTS.find((name) => matchesConceptSpecification(name, feature));
        if (!concept || (perConcept.get(concept) ?? 0) >= 5 || seenGames.has(game.game_id)) continue;
        rawCandidates.push({ game, move, concept, ply: index + 1 }); seenGames.add(game.game_id);
        perConcept.set(concept, (perConcept.get(concept) ?? 0) + 1);
        break;
      }
      if (rawCandidates.length >= 25) break;
    }

    const active: Array<{ exercise: TrainingExercise; assessment: ReturnType<typeof assessHumanQuality>; provenance: object }> = [];
    const challenge: object[] = []; const rejected: object[] = [];
    await startEngine();
    try {
      for (const candidate of rawCandidates) {
        const { game, move, concept, ply } = candidate; const moveUci = uci(move);
        const root = await search(move.before, "", 4, 10);
        const lines = await comparisons(move.before, moveUci);
        const chosen = lines.find((line) => line.uci === moveUci);
        const reason: string[] = [];
        if (!root.lines[0] || !chosen) reason.push("engine_line_missing");
        if (root.lines[0] && Math.abs(root.lines[0].playerCp) > 150) reason.push("not_balanced_enough_for_strategy");
        if (root.lines[0] && chosen && root.lines[0].playerCp - chosen.playerCp > 60) reason.push("human_move_not_sound_enough");
        const bestMove = root.lines[0] ? new Chess(move.before).move({ from: root.lines[0].uci.slice(0, 2), to: root.lines[0].uci.slice(2, 4), promotion: root.lines[0].uci[4] || "q" }) : null;
        if (bestMove?.captured || bestMove?.promotion || /[+#]/.test(bestMove?.san ?? "")) reason.push("forcing_tactic_dominates");
        const afterFen = playLine(move.before, [moveUci]);
        const after = afterFen ? await search(afterFen, "", 1, 10) : null;
        const outcome: OutcomeEvidence = {
          source: "stockfish_wdl", root: root.loss <= 100 && (root.lines[0]?.playerCp ?? -999) >= -35 ? "tenable" : "loss",
          after: after?.lines[0] && -after.lines[0].playerCp >= -35 ? "tenable" : "loss",
          lossPermille: root.loss, verifiedDepth: 10,
        };
        const whiteRating = Number(game.white_rating); const blackRating = Number(game.black_rating);
        const averageRating = Math.round((whiteRating + blackRating) / 2);
        const exercise: TrainingExercise = {
          id: `rating-pilot-${concept}-${sha(`${canonical(move.before)}|${concept}`)}`,
          type: "strategy", origin: "concept", mode: "one-move", pedagogicalUnit: "single_move",
          theme: concept, conceptSlug: concept, domain: "strategy", category: "strategy", primaryConcept: concept,
          title: "Choisis un plan utile", prompt: "Compare les plans humains plausibles avant de jouer.",
          sourceLabel: "Partie Lichess publique · décision humaine vérifiée", fen: move.before,
          playerColor: move.color === "w" ? "white" : "black", bestMove: moveUci,
          baselinePlayerCp: root.lines[0]?.playerCp ?? 0, engineCandidates: lines,
          acceptedConceptMoveUcis: lines.filter((line) => (root.lines[0]?.playerCp ?? 0) - line.playerCp <= 60
            && !!causalFeatures(move.before, line.uci)
            && matchesConceptSpecification(concept, causalFeatures(move.before, line.uci)!)).map((line) => line.uci),
          phase: "middlegame", gameUrl: `https://lichess.org/${game.game_id}`,
          concept: CONCEPT_SPECIFICATIONS[concept].transfer_rule_family, maxPlayerMoves: 1,
          solutionLine: chosen?.pv ?? [moveUci], difficulty: Math.max(900, Math.min(1500, 900 + lines.length * 45)),
          classificationConfidence: 0.9, patternPolicyAccepted: true, source: "lichess_standard",
          sourceId: `${game.game_id}-${ply}`, sourceGameId: game.game_id, sourcePlayers: [game.white_id, game.black_id],
          sourcePlayerRatings: [whiteRating, blackRating], sourceAverageRating: averageRating,
          sourceDate: dateFromMillis(game.start_time), sourceTimeControl: game.time_increment,
          sourceCorpus: "datasnaek/chess via TidyTuesday 2024-10-01", sourceCorpusUrl: "https://www.kaggle.com/datasets/datasnaek/chess",
          sourceLicense: "CC0", positionPly: ply, sourceRole: "human_practice",
          pedagogicalMechanism: concept, keyPieces: [move.from], keySquares: causalFeatures(move.before, moveUci)?.targetSquares,
          verificationSource: "Stockfish 18 Lite depth 10; bounded rating pilot", verification: { engine: "Stockfish", version: "18 lite", depth: 10, multiPv: 4 },
        };
        const assessment = assessHumanQuality(exercise, { lines, outcome });
        const contrast = assessDecisionContrast(exercise, lines, outcome);
        if (!contrast.passed) reason.push(`contrast:${contrast.reason}`);
        if (!assessment.exerciseability) reason.push(...assessment.reasons);
        const record = { exercise, assessment, provenance: {
          gameId: game.game_id, players: [game.white_id, game.black_id], ratings: [whiteRating, blackRating],
          averageRating, date: dateFromMillis(game.start_time), timeControl: game.time_increment,
          source: "datasnaek/chess", mirror: "TidyTuesday 2024-10-01", license: "CC0",
        } };
        if (!reason.length) active.push(record);
        else if (!reason.includes("forcing_tactic_dominates") && assessment.referenceQuality === "high") challenge.push({ ...record, decision: "CHALLENGE_REFERENCE", reasons: [...new Set(reason)] });
        else rejected.push({ ...record, decision: "REJECT", reasons: [...new Set(reason)] });
      }
    } finally { saveCaches(); stopEngine(); }

    const report = {
      generatedAt: new Date().toISOString(), sourceGamesEligible: sourceGames.length,
      positionsExaminedDeeply: rawCandidates.length, activeTrainingCount: active.length,
      challengeReferenceCount: challenge.length, rejectedCount: rejected.length,
      candidatesByConcept: Object.fromEntries(perConcept), active, challenge, rejected,
    };
    writeFileSync(".tmp-corpus/rating-pilot-review.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, activeIds: active.map((record) => record.exercise.id), challengeCount: challenge.length, rejectedCount: rejected.length }, null, 2));
  },
  900_000,
);
