/** Resumable offline miner: existing corpus + streamed real-game candidates.
 * No UI import, no runtime search/network, no count-based quality relaxation. */
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { it } from "vitest";
import type { TrainingExercise, TrainingCandidateLine } from "../src/domain/chess/types";
import { referenceBank } from "../src/domain/training/library";
import { causalFeatures, causalPlanFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../src/domain/patterns/concept-specifications";
import { assessHumanQuality, playLine, type OutcomeEvidence, type TrainingAssessment } from "../src/domain/training/human-quality";
import { assessDecisionContrast, humanAlternativePool, type AlternativeOutcome } from "../src/domain/training/decision-contrast";
import { referenceMilestoneIndex } from "../src/domain/training/milestones";
import { search, tablebase, state, startEngine, stopEngine, saveCaches } from "./audit-training-quality.test";

type SourcePosition = { fen: string; move: string; previous?: string; game: string; ply: number;
  players: string[]; rating: number; source: TrainingExercise["source"]; corpus: string; url: string; date: string;
  sourceCp: number | null; humanLine: string[] };
type RecordResult = { exercise: TrainingExercise; assessment: TrainingAssessment; corpus?: string };
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 18);
const shard = Number(process.env.CHESSPATH_MINE_SHARD ?? 0);
const shards = Number(process.env.CHESSPATH_MINE_SHARDS ?? 1);
const partition = Number(process.env.CHESSPATH_MINE_PARTITION ?? shard);
const onlyDomain = process.env.CHESSPATH_MINE_DOMAIN;
const onlyConcepts = process.env.CHESSPATH_MINE_CONCEPTS?.split(',');
const output = `.tmp-corpus/repopulation-${shard}.jsonl`;

async function comparisons(fen: string, chosenUci: string, depth = 10): Promise<TrainingCandidateLine[]> {
  const root = await search(fen,"",4,depth);
  const lines = [...root.lines];
  for (const uci of [chosenUci, ...humanAlternativePool(fen, [...lines.map((l) => l.uci), chosenUci], 5)]) {
    if (!lines.some((l) => l.uci === uci)) {
      const forced = await search(fen, uci, 1,depth); if (forced.lines[0]) lines.push(forced.lines[0]);
    }
  }
  return lines.sort((a,b) => b.playerCp-a.playerCp);
}

async function verify(original: TrainingExercise, previous?: string): Promise<RecordResult> {
  const exercise = { ...original, pedagogicalUnit: "single_move" as TrainingExercise["pedagogicalUnit"] };
  let assessment = assessHumanQuality(exercise, { skipSequence: true, previousMove: previous });
  if (assessment.failedGates.some((g) => ["domain", "triviality", "causality", "concept_specific"].includes(g))) return { exercise, assessment };
  let root = await search(exercise.fen);
  let chosen = root.lines.find((l) => l.uci === exercise.bestMove);
  if (!chosen) chosen = (await search(exercise.fen, exercise.bestMove, 1)).lines[0];
  if (!chosen || root.lines[0].playerCp-chosen.playerCp > 80) {
    assessment.failedGates = ["verification"]; assessment.reasons = ["teaching_move_objectively_inferior"]; assessment.exerciseability = false;
    return { exercise, assessment };
  }
  const feature = causalPlanFeatures(exercise.fen, original.solutionLine ?? [exercise.bestMove], exercise.conceptSlug)!;
  const afterFen = playLine(exercise.fen, [exercise.bestMove])!;
  let after = await search(afterFen, "", 1);
  let depth = 10;
  if (exercise.category === "defense" && feature.pieceCount > 7 && !exercise.sourceThemes?.includes("equality")
    && Math.abs(root.lines[0].playerCp) <= 35 && root.loss <= 50) {
    depth = 16; root = await search(exercise.fen,"",4,depth);
    chosen = root.lines.find(l=>l.uci===exercise.bestMove) ?? (await search(exercise.fen,exercise.bestMove,1,depth)).lines[0];
    after = await search(afterFen,"",1,depth);
  }
  let outcome: OutcomeEvidence = { source: "stockfish_wdl",
    root: root.loss <= 150 && root.lines[0].playerCp >= -120 ? "tenable" : "loss",
    after: after.lines[0] && -after.lines[0].playerCp >= (exercise.category === "defense" ? -35 : -120) ? "tenable" : "loss", lossPermille: root.loss,verifiedDepth:depth };
  let alternativeOutcomes: AlternativeOutcome[] = [];
  if (feature.pieceCount <= 7) {
    const tb = await tablebase(exercise.fen); const move = tb?.moves.find((m) => m.uci === exercise.bestMove);
    if (tb && move) { outcome = { source: "syzygy", root: state(tb.category), after: state(move.category, true), rootDtz: tb.dtz, afterDtz: move.dtz };
      alternativeOutcomes = tb.moves.map((m) => ({ uci: m.uci, state: state(m.category,true) })); }
  }
  const equality = exercise.category === "defense" && exercise.sourceThemes?.includes("equality") && exercise.sourceThemes.includes("defensiveMove");
  if (equality && chosen.playerCp >= -35 && -after.lines[0].playerCp >= -35) outcome = { source: "lichess_equality", root: "draw", after: "draw" };
  exercise.baselinePlayerCp = root.lines[0].playerCp;
  assessment = assessHumanQuality(exercise, { lines: [...root.lines, chosen], outcome, skipSequence: true, previousMove: previous });
  if (assessment.failedGates.includes("outcome")) return { exercise, assessment };
  const lines = await comparisons(exercise.fen, exercise.bestMove,depth);
  exercise.engineCandidates = lines;
  // Prefer a causally linked engine line; otherwise the actual game's reply
  // may illustrate the plan, but only when independently near-best for BOTH.
  let reference = chosen.pv;
  if (exercise.category === "strategy" && original.solutionLine && original.solutionLine.length >= 3) {
    const linked = (line: string[]) => line.length >= 3 && line[2].slice(0,2) === exercise.bestMove.slice(2,4)
      && !!causalPlanFeatures(exercise.fen,line,exercise.conceptSlug)?.signals.includes("preparatory_maneuver");
    if (!linked(reference) && linked(original.solutionLine)) {
      const reply = (await search(afterFen,original.solutionLine[1],1)).lines[0];
      if (reply && after.lines[0].playerCp-reply.playerCp <= 60) reference = original.solutionLine;
    }
  }
  exercise.solutionLine = reference;
  const contrast = assessDecisionContrast(exercise, lines, outcome, alternativeOutcomes);
  if (!contrast.passed) return { exercise, assessment: assessHumanQuality(exercise, { lines, outcome, alternativeOutcomes, previousMove: previous, skipSequence: true }) };
  exercise.acceptedConceptMoveUcis = [...new Set([exercise.bestMove, ...contrast.goodMoves])];
  const spec = CONCEPT_SPECIFICATIONS[exercise.conceptSlug];
  if (exercise.category === "endgame") {
    const kind = exercise.conceptSlug === "opposition" ? "opposition" : exercise.conceptSlug === "rule_of_square" ? "pawn_square_secured"
      : exercise.conceptSlug === "passed_pawn" ? "pawn_race_resolved" : exercise.conceptSlug === "rook_behind_pawn" ? "rook_behind_passer" : "concept_state";
    exercise.pedagogicalMilestone = { kind, proof: "structural", minimumPlayerMoves: kind === "concept_state" ? 2 : 1, signal: spec.necessary_signals[0] };
    exercise.pedagogicalUnit = "theoretical_method";
    const milestoneIndex = referenceMilestoneIndex(exercise);
    if (milestoneIndex !== null) exercise.solutionLine = chosen.pv.slice(0,milestoneIndex+1);
  } else if (exercise.category !== "defense" && reference.length >= 3) {
    const secondFen = playLine(exercise.fen, reference.slice(0,2))!;
    const second = causalFeatures(secondFen,reference[2]);
    const linked = second && (second.from === exercise.bestMove.slice(2,4)
      || second.targetSquares.some((s) => feature.targetSquares.includes(s)));
    const signal = second?.signals.find((s) => ["useful_activity_gain","useful_file","new_weak_pawn_pressure","pawn_contact_created","threat_reduced","passer_progress","useful_outpost","usable_weak_square","useful_exchange"].includes(s));
    if (linked && signal) {
      const secondConcept = Object.keys(CONCEPT_SPECIFICATIONS).find((c) => CONCEPT_SPECIFICATIONS[c].necessary_signals.includes(signal));
      const secondLines = await comparisons(secondFen, reference[2]);
      const secondExercise = { ...exercise, fen: secondFen, bestMove: reference[2], solutionLine:reference.slice(2), conceptSlug: secondConcept ?? exercise.conceptSlug };
      const secondContrast = assessDecisionContrast(secondExercise, secondLines, outcome);
      const secondScore = secondLines.find((l) => l.uci === reference[2]);
      if (secondContrast.passed && secondScore && secondLines[0].playerCp-secondScore.playerCp <= 60) {
        exercise.pedagogicalUnit = "decision_then_continuation";
        exercise.pedagogicalMilestone = { kind: "concept_state", proof: "structural", minimumPlayerMoves: 2, signal };
        exercise.solutionLine = reference.slice(0,3);
        exercise.requiredSteps = [{ label: spec.transfer_rule_family, acceptedMoveUcis: exercise.acceptedConceptMoveUcis },
          { label: spec.transfer_rule_family, acceptedMoveUcis: [...new Set([reference[2], ...secondContrast.goodMoves])] }];
      }
    }
  }
  if (exercise.category === "defense") { exercise.pedagogicalUnit = original.pedagogicalUnit; exercise.solutionLine = original.solutionLine; }
  exercise.sequenceStopCondition = exercise.pedagogicalMilestone ? "pedagogical_milestone" : "first_decision";
  exercise.maxPlayerMoves = exercise.pedagogicalMilestone ? 24 : 1;
  exercise.mode = exercise.pedagogicalMilestone ? (["endgame","conversion"].includes(exercise.category) ? "playout" : "line") : exercise.mode;
  assessment = assessHumanQuality(exercise, { lines, outcome, alternativeOutcomes, previousMove: previous });
  if (assessment.exerciseability) { exercise.isVerified = true; exercise.verificationSource = `Stockfish 18 depth ${depth}; human alternatives + causal contrast + milestone`;
    exercise.verification = { engine: "Stockfish", version: "18 lite", depth, multiPv: 4 }; }
  return { exercise, assessment };
}

it.skipIf(process.env.CHESSPATH_REPOPULATE !== "1")("repopulates only causally contrasting real-game lessons", async () => {
  const done = new Set<string>(); const accepted: Record<string, number> = {}; const multi:Record<string,number>={}; const units: Record<string,number> = {};
  const counts = { positions: 0, candidates: 0, resumed: 0, verified: 0 };
  const funnel: Record<string,Record<string,number>> = {}; const samples: Record<string, string[]> = {};
  const remember = (r: RecordResult, resumed = false) => {
    const { exercise: e, assessment: a } = r; done.add(e.id);
    if (a.exerciseability) { accepted[e.conceptSlug] = (accepted[e.conceptSlug] ?? 0)+1;
      if(e.pedagogicalUnit === "decision_then_continuation") multi[e.conceptSlug]=(multi[e.conceptSlug]??0)+1;
      units[`${e.category}/${e.pedagogicalUnit}`] = (units[`${e.category}/${e.pedagogicalUnit}`] ?? 0)+1; }
    const f = funnel[`${e.category}/${e.conceptSlug}`] ??= {}; f.candidates = (f.candidates ?? 0)+1;
    let pass = true;
    for (const [label,gates] of Object.entries({ domain: ["domain"], outcome: ["outcome"], decision_contrast: ["decision_contrast","triviality"],
      concept: ["causality","concept_specific"], human_value: ["human_value","verification"], sequence: ["sequence"] })) {
      pass = pass && !a.failedGates.some((g) => gates.includes(g)); if (pass) f[label] = (f[label] ?? 0)+1;
    }
    for (const gate of a.failedGates) { const key = `${e.conceptSlug}/${gate}`; if ((samples[key]?.length ?? 0) < 3) (samples[key] ??= []).push(e.id); }
    if (resumed) counts.resumed += 1;
  };
  if (existsSync(output)) for (const line of readFileSync(output,"utf8").trim().split("\n").filter(Boolean)) remember(JSON.parse(line), true);
  const save = () => { saveCaches(); writeFileSync(`.tmp-corpus/repopulation-${shard}.report.json`,JSON.stringify({ counts,accepted,units,funnel,rejectionSamples:samples },null,2));
    console.log(JSON.stringify({ shard,...counts,accepted: Object.values(accepted).reduce((a,b)=>a+b,0),units })); };
  const inspect = async (exercise: TrainingExercise, previous?: string, corpus?: string) => {
    if (done.has(exercise.id)) return;
    counts.candidates += 1;
    const result = await verify(exercise, previous); result.corpus = corpus;
    appendFileSync(output, JSON.stringify(result)+'\n'); remember(result); counts.verified += 1;
    if (counts.verified % 50 === 0) save();
  };
  await startEngine();
  try {
    if (process.env.CHESSPATH_MINE_EXISTING !== "0") for (const e of referenceBank()) {
      if (!["strategy","conversion","endgame","defense"].includes(e.category)) continue;
      if(onlyDomain && e.category !== onlyDomain) continue;
      if(onlyConcepts && !onlyConcepts.includes(e.conceptSlug))continue;
      if (parseInt(sha(e.id).slice(0,8),16) % shards !== partition) continue;
      await inspect(e, undefined, "existing_reference");
    }
    for (const file of readdirSync('.tmp-corpus').filter((f) => f.endsWith('.candidates.jsonl'))) {
      if(process.env.CHESSPATH_MINE_CORPUS && !file.includes(process.env.CHESSPATH_MINE_CORPUS))continue;
      if (!existsSync(`.tmp-corpus/${file.replace('.jsonl','.report.json')}`)) continue;
      const stream = createInterface({ input: createReadStream(`.tmp-corpus/${file}`), crlfDelay: Infinity });
      for await (const line of stream) {
        const p: SourcePosition = JSON.parse(line);
        if (parseInt(p.game.slice(0,8),16) % shards !== partition) continue;
        counts.positions += 1;
        if(onlyConcepts?.every(c=>(accepted[c]??0)>=70))break;
        if(onlyDomain === "defense" && p.sourceCp !== null && Math.abs(p.sourceCp)>50) continue;
        const feature = causalFeatures(p.fen,p.move); if (!feature) continue;
        const secondFen = p.humanLine.length >= 3 && p.humanLine[2].slice(0,2) === feature.to && !feature.capture && feature.signals.includes("safe_destination")
          ? playLine(p.fen,p.humanLine.slice(0,2)) : null;
        const preparatory = secondFen ? causalFeatures(secondFen,p.humanLine[2]) : null;
        const matches = (c:string) => matchesConceptSpecification(c,feature) || (CONCEPT_SPECIFICATIONS[c].domain === "strategy"
          && preparatory && matchesConceptSpecification(c,preparatory) && preparatory.to !== feature.from);
        const concepts = Object.entries(CONCEPT_SPECIFICATIONS).filter(([concept,s]) => {
          if(onlyConcepts && !onlyConcepts.includes(concept))return false;
          if(onlyDomain && s.domain !== onlyDomain) return false;
          if (s.domain === "defense") return feature.pieceCount <= 7 || (onlyDomain === "defense" && (p.sourceCp === null || Math.abs(p.sourceCp)<=50));
          if (s.domain === "endgame" && feature.phase !== "endgame") return false;
          if (s.domain === "strategy" && feature.phase !== "middlegame") return false;
          if (s.domain === "conversion" && p.sourceCp !== null && (p.sourceCp < 50 || p.sourceCp > 450)) return false;
          return matches(concept);
        }).filter(([concept]) => matches(concept))
          .sort(([a],[b]) => (accepted[a] ?? 0)-(accepted[b] ?? 0));
        // Only one concept is proposed per board; source diversity is handled
        // again by the unchanged downstream pedagogical deduplicator.
        const picked = concepts.find(([c,s]) => s.domain === "strategy" ? (multi[c]??0)<60
          : (accepted[c] ?? 0) < (s.domain === "endgame" || s.domain === "defense" ? 180 : 150));
        if (!picked) continue;
        const [concept,spec] = picked;
        const canonical = p.fen.split(' ').slice(0,4).join(' ');
        const e: TrainingExercise = { id: `contrast-mine-${concept}-${sha(canonical)}`, fen:p.fen,bestMove:p.move,
          type: spec.domain === "conversion" ? "conversion" : spec.domain === "endgame" ? "endgame" : spec.domain === "defense" ? "defense" : "strategy",
          domain:spec.domain,category:spec.domain,phase:feature.phase as TrainingExercise["phase"],conceptSlug:concept,primaryConcept:concept,
          theme:concept,origin:"concept",mode:"one-move",pedagogicalUnit:"single_move",source:p.source,
          sourceId:`${p.game}-${p.ply}`,sourceGameId:p.game,positionPly:p.ply,sourcePlayers:p.players,
          sourceRole:"model_position",sourceLabel:`${p.players.join(' – ')} · ${p.date} · ${p.corpus} · CC-BY-SA 4.0`,
          gameUrl:p.url,title:"Décision de partie",prompt:"Compare les plans.",playerColor:p.fen.split(' ')[1] === 'w' ? "white" : "black",
          baselinePlayerCp:p.sourceCp ?? (spec.domain === "conversion" ? 150 : 0),concept:spec.transfer_rule_family,maxPlayerMoves:1,
          solutionLine:p.humanLine,difficulty:Math.round(Math.min(2000,1050+feature.pieceCount*15+feature.legalChoices*4)),
          classificationConfidence:0.9,pedagogicalMechanism:concept,keyPieces:[p.move.slice(0,2)],keySquares:feature.targetSquares,
          materialSignature:p.fen.split(' ')[0].replace(/[1-8/]/g,'').split('').sort().join(''),
          pawnStructureSignature:new Chess(p.fen).board().flat().filter((x)=>x?.type==='p').map((x)=>`${x!.color}${x!.square}`).sort().join('|'),
          qualityScore:80,isVerified:false,verificationSource:"candidate only" };
        await inspect(e,p.previous,p.corpus);
      }
    }
  } finally { save(); stopEngine(); }
}, 86_400_000);
