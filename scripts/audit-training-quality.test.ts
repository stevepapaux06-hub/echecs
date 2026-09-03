/** Offline, opt-in data compiler. Run with CHESSPATH_BANK_AUDIT=1.
 * Engine/network results are cached locally; ordinary tests never fetch or mine. */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { it } from "vitest";
import type { TrainingExercise, TrainingCandidateLine } from "../src/domain/chess/types";
import { technicallyVerifiedBank, referenceBank } from "../src/domain/training/library";
import { assessHumanQuality, playLine, type OutcomeEvidence, type TrainingAssessment } from "../src/domain/training/human-quality";
import { causalFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../src/domain/patterns/concept-specifications";
import { referenceMilestoneIndex } from "../src/domain/training/milestones";

const require = createRequire(import.meta.url);
type Search = { lines: TrainingCandidateLine[]; loss: number };
const cacheFile = ".tmp-corpus/human-quality-engine-cache.json";
const tbFile = ".tmp-corpus/human-quality-tablebase-cache.json";
const searchCache: Record<string, Search> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
type TB = { category: string; dtz: number | null; moves: { uci: string; category: string; dtz: number | null }[] };
const tbCache: Record<string, TB> = existsSync(tbFile) ? JSON.parse(readFileSync(tbFile, "utf8")) : {};
let receive: (line: string) => void = () => {};
let engine: { listener?: (line: string) => void; sendCommand: (cmd: string) => void };
function commandWait(command: string, token: string) { return new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(token)), 20_000);
  receive = (line) => { if (line.startsWith(token)) { clearTimeout(timer); resolve(); } };
  engine.sendCommand(command);
}); }
async function search(fen: string, forced = "", multi = 4): Promise<Search> {
  const key = `${fen}|${forced}|${multi}|10`;
  if (searchCache[key]) return searchCache[key];
  engine.sendCommand("setoption name Clear Hash");
  engine.sendCommand(`setoption name MultiPV value ${multi}`);
  await commandWait("isready", "readyok");
  const result = await new Promise<Search>((resolve, reject) => {
    const lines = new Map<number, TrainingCandidateLine>(); let loss = 1000;
    const timer = setTimeout(() => { engine.sendCommand("stop"); reject(new Error(`engine timeout ${fen}`)); }, 30_000);
    receive = (line) => {
      const info = line.match(/\bscore (cp|mate) (-?\d+).*?\bpv (.+)$/);
      if (info && !/lowerbound|upperbound/.test(line)) {
        const index = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
        const pv = info[3].trim().split(/\s+/);
        const cp = info[1] === "mate" ? Math.sign(Number(info[2])) * 100000 : Number(info[2]);
        lines.set(index, { uci: pv[0], playerCp: cp, pv });
        const wdl = line.match(/\bwdl (\d+) (\d+) (\d+)/);
        if (index === 1 && wdl) loss = Number(wdl[3]);
      }
      if (line.startsWith("bestmove")) { clearTimeout(timer); resolve({ lines: [...lines.entries()].sort((a,b) => a[0]-b[0]).map(([,l]) => l), loss }); }
    };
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`go depth 10${forced ? ` searchmoves ${forced}` : ""}`);
  });
  searchCache[key] = result; return result;
}
let tablebaseUnavailable = false;
let tablebaseFailures = 0;
async function tablebase(fen: string): Promise<TB | undefined> {
  if (tbCache[fen]) return tbCache[fen];
  if (tablebaseUnavailable || process.env.CHESSPATH_TABLEBASE !== "1") return undefined;
  try {
    // The Node Stockfish bundle changes global fetch; keep tablebase I/O
    // independent of that engine implementation detail.
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = get(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`, (result) => {
        let body = ""; result.setEncoding("utf8"); result.on("data", (part) => { body += part; });
        result.on("end", () => resolve({ status: result.statusCode ?? 0, body }));
      });
      request.setTimeout(12_000, () => request.destroy(new Error("tablebase timeout"))); request.on("error", reject);
    });
    if (response.status === 429) { tablebaseUnavailable = true; return undefined; }
    if (response.status !== 200) return undefined;
    const data = JSON.parse(response.body) as TB;
    tablebaseFailures = 0;
    tbCache[fen] = data;
    await new Promise((r) => setTimeout(r, 350));
    return data;
  } catch (error) { tablebaseFailures += 1; console.log(`Tablebase query failed: ${String(error)}`); tablebaseUnavailable = tablebaseFailures >= 3; return undefined; }
}
function state(category: string, reverse = false): OutcomeEvidence["root"] {
  if (category === "draw" || category === "cursed-win" || category === "blessed-loss") return "draw";
  if (category === "win") return reverse ? "loss" : "win";
  if (category === "loss") return reverse ? "win" : "loss";
  return "unknown";
}
function saveCaches() { writeFileSync(cacheFile, JSON.stringify(searchCache)); writeFileSync(tbFile, JSON.stringify(tbCache)); }

it.skipIf(process.env.CHESSPATH_BANK_AUDIT !== "1")("compiles reference/training quality from the existing bank", async () => {
  engine = await require("stockfish")("lite-single");
  engine.listener = (line) => receive(String(line));
  await commandWait("uci", "uciok");
  engine.sendCommand("setoption name UCI_ShowWDL value true");
  const bank = [...technicallyVerifiedBank().filter((e) => !e.id.startsWith("quality-mine-")),
    ...referenceBank().filter((e) => e.id.startsWith("quality-mine-"))];
  const assessments: Record<string, TrainingAssessment> = {};
  const patches: Record<string, Partial<TrainingExercise>> = {};
  const counts: Record<string, number> = {}; const gates: Record<string, number> = {};
  let examined = 0; let searched = 0;
  for (const original of bank) {
    if (["tactic", "opening"].includes(original.category)) continue;
    examined += 1;
    let exercise: TrainingExercise = { ...original, pedagogicalUnit: "single_move" };
    const feature = causalFeatures(exercise.fen, exercise.bestMove);
    // First filter purely structural hard failures before spending engine time.
    let audit = assessHumanQuality(exercise, { skipSequence: true });
    if (audit.failedGates.some((g) => ["domain", "triviality", "causality", "concept_specific"].includes(g))) {
      const structural = audit.failedGates.map((g, i) => ({ gate: g, reason: audit.reasons[i] }))
        .filter(({ gate }) => ["domain", "triviality", "causality", "concept_specific"].includes(gate));
      audit.failedGates = structural.map(({ gate }) => gate); audit.reasons = structural.map(({ reason }) => reason);
      assessments[exercise.id] = audit; continue;
    }
    const root = await search(exercise.fen); searched += 1;
    if (!root.lines.length) continue;
    let chosen = root.lines.find((l) => l.uci === exercise.bestMove);
    if (!chosen) chosen = (await search(exercise.fen, exercise.bestMove, 1)).lines[0];
    if (!chosen) continue;
    const afterFen = playLine(exercise.fen, [exercise.bestMove]);
    if (!afterFen) continue;
    const after = await search(afterFen, "", 1);
    let outcome: OutcomeEvidence = { source: "stockfish_wdl", root: root.loss <= 100 && root.lines[0].playerCp >= -35 ? "tenable" : "loss",
      after: after.lines[0] && -after.lines[0].playerCp >= -35 ? "tenable" : "loss", lossPermille: root.loss };
    if (feature && feature.pieceCount <= 7) {
      const tb = await tablebase(exercise.fen); const move = tb?.moves.find((m) => m.uci === exercise.bestMove);
      if (tb && move) outcome = { source: "syzygy", root: state(tb.category), after: state(move.category, true), rootDtz: tb.dtz, afterDtz: move.dtz };
    }
    if (exercise.category === "defense" && exercise.sourceThemes?.includes("equality") && exercise.sourceThemes.includes("defensiveMove")) {
      outcome = { source: "lichess_equality", root: "draw", after: "draw" };
    }
    const lines = [...root.lines, ...(root.lines.some((l) => l.uci === chosen!.uci) ? [] : [chosen])];
    exercise = { ...exercise, baselinePlayerCp: root.lines[0].playerCp, engineCandidates: lines,
      solutionLine: chosen.pv, acceptedConceptMoveUcis: lines.filter((l) => root.lines[0].playerCp - l.playerCp <= 60
        && !!causalFeatures(exercise.fen, l.uci) && matchesConceptSpecification(exercise.conceptSlug, causalFeatures(exercise.fen, l.uci)!)).map((l) => l.uci) };
    const spec = CONCEPT_SPECIFICATIONS[exercise.conceptSlug];
    if (exercise.category === "endgame") {
      const kind = exercise.conceptSlug === "opposition" ? "opposition" : exercise.conceptSlug === "rule_of_square" ? "pawn_square_secured"
        : exercise.conceptSlug === "passed_pawn" ? "pawn_race_resolved"
        : exercise.conceptSlug === "rook_behind_pawn" ? "rook_behind_passer" : "concept_state";
      // Tablebase verifies the initial outcome, not an arbitrary later board.
      // The runtime milestone itself is a structural proof.
      exercise.pedagogicalMilestone = { kind, proof: "structural",
        minimumPlayerMoves: kind === "concept_state" ? 2 : 1, signal: spec?.necessary_signals[0] };
      exercise.pedagogicalUnit = "theoretical_method";
      // A longer engine line is not automatically a lesson: activate only if
      // an independently computed structural milestone actually occurs in it.
      const milestoneIndex = referenceMilestoneIndex(exercise);
      if (milestoneIndex !== null) exercise.solutionLine = chosen.pv.slice(0, milestoneIndex + 1);
    } else if (exercise.category !== "defense" && chosen.pv.length >= 3 && spec) {
      const secondFen = playLine(exercise.fen, chosen.pv.slice(0, 2));
      const second = secondFen ? causalFeatures(secondFen, chosen.pv[2]) : null;
      const continuationSignal = second?.signals.find((s) => ["useful_activity_gain", "new_weak_pawn_pressure", "pawn_contact_created", "threat_reduced", "passer_progress"].includes(s));
      const samePlan = second && continuationSignal && (second.from === exercise.bestMove.slice(2, 4)
        || second.targetSquares.some((s) => feature?.targetSquares.includes(s)));
      if (second && (matchesConceptSpecification(exercise.conceptSlug, second) || samePlan)) {
        const secondSearch = await search(secondFen!);
        const secondScore = secondSearch.lines.find((l) => l.uci === chosen!.pv[2])?.playerCp;
        if (secondScore !== undefined && secondSearch.lines.some((l) => l.uci !== chosen!.pv[2] && secondSearch.lines[0].playerCp - l.playerCp <= 200)) {
          exercise.pedagogicalUnit = "decision_then_continuation";
          exercise.pedagogicalMilestone = { kind: "concept_state", proof: "structural", minimumPlayerMoves: 2,
            signal: matchesConceptSpecification(exercise.conceptSlug, second) ? spec.necessary_signals[0] : continuationSignal };
          exercise.solutionLine = chosen.pv.slice(0, 3);
          exercise.requiredSteps = [{ label: spec.transfer_rule_family, acceptedMoveUcis: exercise.acceptedConceptMoveUcis! }, { label: "Confirmer le mécanisme", acceptedMoveUcis: [chosen.pv[2]] }];
        }
      }
    }
    if (exercise.category === "defense") { exercise.pedagogicalUnit = original.pedagogicalUnit; exercise.solutionLine = original.solutionLine; }
    exercise.sequenceStopCondition = exercise.pedagogicalMilestone ? "pedagogical_milestone" : "first_decision";
    exercise.maxPlayerMoves = exercise.pedagogicalMilestone ? 24 : original.maxPlayerMoves;
    audit = assessHumanQuality(exercise, { lines, outcome });
    assessments[exercise.id] = audit;
    if (audit.exerciseability) {
      const { baselinePlayerCp, engineCandidates, solutionLine, pedagogicalMilestone, pedagogicalUnit, sequenceStopCondition, maxPlayerMoves, acceptedConceptMoveUcis, requiredSteps } = exercise;
      patches[exercise.id] = { baselinePlayerCp, engineCandidates, solutionLine, pedagogicalMilestone, pedagogicalUnit, sequenceStopCondition, maxPlayerMoves, acceptedConceptMoveUcis, requiredSteps,
        isVerified: true, verificationSource: "Stockfish 18 Lite depth 10 + causal/human/milestone gates", verification: { engine: "Stockfish", version: "18 lite", depth: 10, multiPv: 4 } };
    }
    if (searched % 50 === 0) { saveCaches(); console.log(`Checked ${examined}/${bank.length}, engine=${searched}, training=${Object.keys(patches).length}`); }
  }
  for (const ex of bank) {
    const audit = assessments[ex.id]; if (!audit) continue;
    if (audit.exerciseability) counts[`${ex.category}/${ex.conceptSlug}`] = (counts[`${ex.category}/${ex.conceptSlug}`] ?? 0) + 1;
    for (const gate of audit.failedGates) gates[gate] = (gates[gate] ?? 0) + 1;
  }
  const report = { examined, searched, before: bank.length, trainingNonTactical: Object.keys(patches).length, byConcept: counts, rejectedByGate: gates, tablebaseQueriesCached: Object.keys(tbCache).length };
  saveCaches();
  const minedPath = "src/domain/training/remined-reference.generated.json";
  const mined = JSON.parse(readFileSync(minedPath, "utf8"));
  mined.positions = mined.positions.map((e: TrainingExercise) => ({ ...e, isVerified: false }));
  writeFileSync(minedPath, JSON.stringify(mined, null, 2) + "\n");
  writeFileSync("src/domain/training/quality-bank.generated.json", JSON.stringify({ version: 1, assessments, patches, report }, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2)); engine.sendCommand("quit");
}, 1_800_000);
