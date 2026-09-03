import { createReadStream, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { it } from "vitest";
import { Chess } from "chess.js";
import type { TrainingExercise } from "../src/domain/chess/types";
import type { TrainingAssessment } from "../src/domain/training/human-quality";
import { allConceptExercises, referenceBank } from "../src/domain/training/library";
import { gateTrainingExercises } from "../src/domain/training/validation";
import OLD from "../src/domain/training/quality-bank.generated.json";
import MINED from "../src/domain/training/remined-reference.generated.json";

type RecordResult={exercise:TrainingExercise;assessment:TrainingAssessment;corpus?:string};
const count=(keys:string[])=>keys.reduce<Record<string,number>>((o,k)=>{o[k]=(o[k]??0)+1;return o;},{});
// Normalise the mover to White, then reflect files where castling cannot make
// the two geometries inequivalent. This is an offline extra diversity check.
function geometry(e:TrainingExercise):string {
  const b=new Chess(e.fen);const black=b.turn()==='b';
  const parts=b.board().flat().filter(x=>!!x).map(p=>({type:p!.type,color:black?(p!.color==='w'?'b':'w'):p!.color,
    file:p!.square.charCodeAt(0)-97,rank:black?8-Number(p!.square[1]):Number(p!.square[1])-1}));
  const key=(mirror:boolean)=>parts.map(p=>`${p.color}${p.type}${mirror?7-p.file:p.file}${p.rank}`).sort().join('|');
  return b.fen().split(' ')[2]==='-'?[key(false),key(true)].sort()[0]:key(false);
}

it.skipIf(process.env.CHESSPATH_COMPILE_REPOPULATION!=="1")("compiles only validated distinct lessons and an auditable funnel",async()=>{
  const records=new Map<string,RecordResult>();
  for(const file of readdirSync('.tmp-corpus').filter(f=>/^repopulation-\d+\.jsonl$/.test(f))){
    for await(const line of createInterface({input:createReadStream(`.tmp-corpus/${file}`),crlfDelay:Infinity})) {
      if(!line.trim())continue;const r:RecordResult=JSON.parse(line);
      // Structural prefilters intentionally avoid engine work. Do not report
      // their missing outcome/comparison as a measured contrast failure.
      const omitted = !r.assessment.outcome ? ['outcome','decision_contrast','human_value','sequence']
        : r.assessment.failedGates.includes('outcome') ? ['decision_contrast','human_value','sequence'] : [];
      const measured=r.assessment.failedGates.map((gate,i)=>({gate,reason:r.assessment.reasons[i]})).filter(x=>!omitted.includes(x.gate));
      r.assessment={...r.assessment,failedGates:measured.map(x=>x.gate),reasons:measured.map(x=>x.reason)};
      const prior=records.get(r.exercise.id);
      if(!prior || r.assessment.exerciseability || !prior.assessment.exerciseability)records.set(r.exercise.id,r);
    }
  }
  const all=[...records.values()]; const passed=all.filter(r=>r.assessment.exerciseability);
  const ordered=passed.map(r=>r.exercise).sort((a,b)=>Number(b.pedagogicalUnit!=="single_move")-Number(a.pedagogicalUnit!=="single_move")
    || (b.qualityScore??0)-(a.qualityScore??0));
  const technical=gateTrainingExercises(ordered);
  const singleGroups=new Map<string,TrainingExercise[]>();
  const balanced=technical.active.filter(e=>!(e.category==='strategy'&&e.pedagogicalUnit==='single_move'));
  const coverage=count(balanced.filter(e=>e.category==='strategy').map(e=>e.conceptSlug));
  for(const e of technical.active.filter(e=>e.category==='strategy'&&e.pedagogicalUnit==='single_move')){
    const group=singleGroups.get(e.conceptSlug)??[];group.push(e);singleGroups.set(e.conceptSlug,group);
  }
  while([...singleGroups.values()].some(g=>g.length)){
    const entry=[...singleGroups.entries()].filter(([,g])=>g.length).sort(([a],[b])=>(coverage[a]??0)-(coverage[b]??0))[0];
    balanced.push(entry[1].shift()!);coverage[entry[0]]=(coverage[entry[0]]??0)+1;
  }
  const seen=new Set<string>();const players=new Map<string,number>();const structures=new Map<string,number>();
  const seenBoards=new Set(allConceptExercises().filter(e=>['tactic','opening'].includes(e.category)).map(e=>e.fen.split(' ').slice(0,4).join(' ')));
  const selected:TrainingExercise[]=[];const excluded=new Map<string,string>();
  // A recommended strategy bank is predominantly plans; strong one-decision
  // examples remain references until enough distinct multi-decision lessons exist.
  let singleBudget=0;
  for(const e of balanced){
    const boardKey=e.fen.split(' ').slice(0,4).join(' ');
    const geo=geometry(e);const structure=`${e.conceptSlug}|${e.pawnStructureSignature}|${e.materialSignature}|${e.bestMove.slice(0,2)}`;
    const sourcePlayers=(e.sourcePlayers??[]).filter(p=>p!=='?');
    let reason:string|undefined;
    if(seenBoards.has(boardKey)||seen.has(geo))reason='mirrored_or_exact_geometry';
    else if(sourcePlayers.some(p=>(players.get(`${e.conceptSlug}|${p}`)??0)>=12))reason='player_concentration';
    else if((structures.get(structure)??0)>=6)reason='same_structure_material_plan';
    else if(e.category==='strategy'&&e.pedagogicalUnit==='single_move'&&singleBudget<=1)reason='strategy_prioritises_multiple_decisions';
    if(reason){excluded.set(e.id,reason);continue;}
    if(e.pedagogicalMilestone&&['endgame','conversion'].includes(e.category))e.mode='playout';
    selected.push(e);seen.add(geo);seenBoards.add(boardKey);structures.set(structure,(structures.get(structure)??0)+1);
    for(const p of sourcePlayers)players.set(`${e.conceptSlug}|${p}`,(players.get(`${e.conceptSlug}|${p}`)??0)+1);
    if(e.category==='strategy'&&e.pedagogicalUnit==='single_move')singleBudget-=1;
    if(e.category==='strategy'&&e.pedagogicalUnit!=='single_move')singleBudget+=1;
  }
  const finalIds=new Set(selected.map(e=>e.id));
  const existing=referenceBank(); const existingIds=new Set(existing.map(e=>e.id));
  const assessmentMap:Record<string,TrainingAssessment>={...(OLD.assessments as unknown as Record<string,TrainingAssessment>)};
  const retained=new Map((MINED.positions as unknown as TrainingExercise[]).map(e=>[e.id,e]));
  const patchMap:Record<string,Partial<TrainingExercise>>={};
  const rejectionSamples:Record<string,RecordResult[]>={};
  for(const r of all){
    for(const g of r.assessment.failedGates){const key=`${r.exercise.conceptSlug}/${g}`;if((rejectionSamples[key]?.length??0)<3)(rejectionSamples[key]??=[]).push(r);}
  }
  for(const r of all){
    const e=r.exercise;let a=r.assessment;
    if(a.exerciseability&&!finalIds.has(e.id))a={...a,exerciseability:false,failedGates:["deduplication"],reasons:[excluded.get(e.id)??'technical_or_neighbour_duplicate']};
    if(existingIds.has(e.id)||finalIds.has(e.id))assessmentMap[e.id]=a;
    if(finalIds.has(e.id)){
      const {baselinePlayerCp,engineCandidates,solutionLine,pedagogicalMilestone,pedagogicalUnit,sequenceStopCondition,
        maxPlayerMoves,acceptedConceptMoveUcis,requiredSteps,isVerified,verification,verificationSource,mode}=e;
      patchMap[e.id]={baselinePlayerCp,engineCandidates,solutionLine,pedagogicalMilestone,pedagogicalUnit,sequenceStopCondition,
        maxPlayerMoves,acceptedConceptMoveUcis,requiredSteps,isVerified,verification,verificationSource,
        mode:pedagogicalMilestone&&['endgame','conversion'].includes(e.category)?'playout':mode};
      if(!existingIds.has(e.id))retained.set(e.id,{...e,trainingAssessment:undefined,isVerified:false});
    }
  }
  for(const samples of Object.values(rejectionSamples))for(const r of samples){
    assessmentMap[r.exercise.id]=r.assessment;
    if(!existingIds.has(r.exercise.id))retained.set(r.exercise.id,{...r.exercise,isVerified:false});
  }
  // A historical positive assessment is not allowed to bypass the new gate.
  for(const [id,a]of Object.entries(assessmentMap))if(!records.has(id))assessmentMap[id]={...a,exerciseability:false,failedGates:["verification"],reasons:["not_revalidated_with_decision_contrast"]};
  const funnel:Record<string,Record<string,number>>={};
  for(const r of all){const e=r.exercise,a=r.assessment;const f=funnel[`${e.category}/${e.conceptSlug}`]??={};f.candidates=(f.candidates??0)+1;
    let pass=true;for(const [label,gates]of Object.entries({domain:['domain'],outcome:['outcome'],decision_contrast:['decision_contrast','triviality'],concept:['causality','concept_specific'],human_value:['human_value','verification'],sequence:['sequence']})){
      pass=pass&&!a.failedGates.some(g=>gates.includes(g))&&(label!=='outcome'||!!a.outcome)
        &&(label!=='decision_contrast'||a.contrast?.passed===true);if(pass)f[label]=(f[label]??0)+1;
    }if(finalIds.has(e.id)){f.dedup=(f.dedup??0)+1;f.training_active=(f.training_active??0)+1;}
  }
  const sourceReports=readdirSync('.tmp-corpus').filter(f=>f.endsWith('.candidates.report.json')).map(f=>JSON.parse(readFileSync(`.tmp-corpus/${f}`,'utf8')));
  const sources=[...new Map(sourceReports.map(s=>[s.source,{source:s.source,games:s.games,eligible:s.eligible,uniqueGames:s.uniqueGames,uniquePlayers:s.uniquePlayers,license:s.license}])).values()];
  const report={baseline:{commit:'c10ff16',strategy:127,endgame:38,conversion:161,defense:28},
    trainingNonTactical:selected.length,byDomain:count(selected.map(e=>e.category)),byConcept:count(selected.map(e=>`${e.category}/${e.conceptSlug}`)),
    examined:all.length,newAccepted:selected.filter(e=>e.id.startsWith('contrast-mine-')).length,
    rejectedByGate:count(all.flatMap(r=>r.assessment.failedGates)),funnel,
    referenceOnlyTrivialCandidates:all.filter(r=>r.assessment.failedGates.some(g=>g==='triviality'||g==='decision_contrast')).length,
    selectionExclusions:count([...excluded.values()]),strategyUnits:count(selected.filter(e=>e.category==='strategy').map(e=>e.pedagogicalUnit!)),
    endgameMilestones:count(selected.filter(e=>e.category==='endgame').map(e=>e.pedagogicalMilestone!.kind)),sources,
    minedCorpora:count(all.map(r=>r.corpus??'existing_reference')),
    acceptedCorpora:count(all.filter(r=>finalIds.has(r.exercise.id)).map(r=>r.corpus??'existing_reference')),
    candidateSourceGames:new Set(all.map(r=>r.exercise.sourceGameId??r.exercise.sourceId)).size,
    candidateKnownPlayers:new Set(all.flatMap(r=>r.exercise.sourcePlayers??[])).size,
    sourceGames:new Set(selected.map(e=>e.sourceGameId??e.sourceId)).size,knownPlayers:new Set(selected.flatMap(e=>e.sourcePlayers??[])).size,
    bySource:count(selected.map(e=>e.source??'unknown')),referenceOnlyPublished:Object.values(assessmentMap).filter(a=>!a.exerciseability).length,
    rejectionSamples:Object.fromEntries(Object.entries(rejectionSamples).map(([k,v])=>[k,v.map(r=>({id:r.exercise.id,fen:r.exercise.fen,move:r.exercise.bestMove,reasons:r.assessment.reasons}))]))};
  writeFileSync('docs/repopulation-report.json',JSON.stringify(report,null,2)+'\n');
  if(process.env.CHESSPATH_REPOPULATION_PUBLISH==='1'){
    writeFileSync('src/domain/training/remined-reference.generated.json',JSON.stringify({positions:[...retained.values()],report:{...MINED.report,repopulationSources:sources}},null,2)+'\n');
    writeFileSync('src/domain/training/quality-bank.generated.json',JSON.stringify({version:2,assessments:assessmentMap,patches:patchMap,report},null,2)+'\n');
  }
  console.log(JSON.stringify({...report,rejectionSamples:undefined,funnel:undefined},null,2));
},900_000);
