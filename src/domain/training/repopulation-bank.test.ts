import { describe, expect, it } from "vitest";
import { Chess, type Square } from "chess.js";
import { allConceptExercises, conceptExercisesForSlug } from "./library";
import { referenceMilestoneIndex, milestoneReached } from "./milestones";
import { validateTrainingExercise } from "./validation";
import QUALITY from "./quality-bank.generated.json";

describe.skipIf(QUALITY.version < 2)("published Decision Contrast bank",()=>{
  const bank=allConceptExercises();
  const nonTactical=bank.filter(e=>["strategy","endgame","conversion","defense"].includes(e.category));
  it("counts only active lessons and reaches the four requested minimums",()=>{
    for(const [domain,min]of Object.entries({strategy:600,endgame:400,conversion:300,defense:200}))
      expect(nonTactical.filter(e=>e.category===domain).length,domain).toBeGreaterThanOrEqual(min);
    expect(bank.filter(e=>e.category==='tactic')).toHaveLength(2197);
  });
  it("has no reference-only, unverified, or noncontrasting entry in Training",()=>{
    for(const e of nonTactical){
      expect(e.isVerified,e.id).toBe(true);
      expect(e.trainingAssessment?.exerciseability,e.id).toBe(true);
      expect(e.trainingAssessment?.contrast?.passed,e.id).toBe(true);
      expect(e.trainingAssessment?.failedGates,e.id).toEqual([]);
      expect(validateTrainingExercise(e).status,e.id).toBe('active');
    }
  },15_000);
  it("uses predominantly verified multi-decision strategy plans",()=>{
    const strategy=nonTactical.filter(e=>e.category==='strategy');
    const multi=strategy.filter(e=>e.pedagogicalUnit!=='single_move');
    expect(multi.length).toBeGreaterThan(strategy.length/2);
    for(const e of multi){
      expect(e.requiredSteps?.length,e.id).toBeGreaterThanOrEqual(2);
      expect(referenceMilestoneIndex(e),e.id).not.toBeNull();
    }
  });
  it("ends every reference endgame on its real obtained-position milestone",()=>{
    for(const e of nonTactical.filter(e=>e.category==='endgame')){
      expect(e.phase,e.id).toBe('endgame');
      expect(e.sequenceStopCondition,e.id).toBe('pedagogical_milestone');
      const index=referenceMilestoneIndex(e);expect(index,e.id).not.toBeNull();
      const chess=new Chess(e.fen);let before=e.fen;
      for(const uci of e.solutionLine!.slice(0,index!+1)){
        before=chess.fen();chess.move({from:uci.slice(0,2) as Square,to:uci.slice(2,4) as Square,promotion:uci[4]||'q'});
      }
      expect(milestoneReached(e,chess.fen(),Math.ceil((index!+1)/2),before,e.solutionLine![index!]),e.id).toBe(true);
    }
  });
  it("provides many distinct same-concept positions, not seven aliases",()=>{
    for(const concept of ['open_file','outpost','weak_square','improve_worst_piece','weak_pawn','pawn_break','favorable_exchange','piece_activity']){
      const positions=conceptExercisesForSlug(concept,1000,1500);
      expect(positions.length,concept).toBeGreaterThanOrEqual(60);
      expect(new Set(positions.map(e=>e.fen.split(' ').slice(0,4).join(' '))).size,concept).toBe(positions.length);
      expect(positions.every(e=>e.conceptSlug===concept)).toBe(true);
    }
  });
});
