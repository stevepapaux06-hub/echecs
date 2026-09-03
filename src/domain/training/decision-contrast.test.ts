import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { CONCEPT_HOLDOUT } from "../patterns/concept-holdout";
import { causalFeatures } from "../patterns/concept-specifications";
import type { TrainingExercise } from "../chess/types";
import { assessDecisionContrast, humanAlternativePool, plausibleHumanMove } from "./decision-contrast";
import { assessHumanQuality } from "./human-quality";

const base: TrainingExercise = { id:"contrast-test",fen:CONCEPT_HOLDOUT[0].fen,bestMove:"a1d1",type:"strategy",category:"strategy",
  origin:"concept",mode:"one-move",phase:"middlegame",playerColor:"white",conceptSlug:"open_file",theme:"open_file",title:"",prompt:"",
  sourceLabel:"regression",baselinePlayerCp:20,maxPlayerMoves:1,concept:"",difficulty:1400,pedagogicalUnit:"single_move" };
const lines = [{ uci:"a1d1",playerCp:20,pv:["a1d1"] },{ uci:"a1b1",playerCp:-350,pv:["a1b1"] },{ uci:"f1e1",playerCp:0,pv:["f1e1"] }];
const outcome = {source:"stockfish_wdl" as const,root:"tenable" as const,after:"tenable" as const};
describe("causal decision contrast",()=>{
  it("does not cap a plausible natural error at 200 cp",()=>{
    expect(assessDecisionContrast(base,lines,outcome)).toMatchObject({passed:true,naturalMistake:"a1b1"});
  });
  it("keeps a causal +1.8 strategy decision rather than imposing +1.5",()=>{
    const shifted=lines.map(l=>({...l,playerCp:l.playerCp+160}));
    expect(assessHumanQuality(base,{lines:shifted,outcome}).failedGates).not.toContain("outcome");
  });
  it("rejects equivalent plans even when many moves are legal",()=>{
    expect(assessDecisionContrast(base,lines.map(l=>({...l,playerCp:20})),outcome).passed).toBe(false);
  });
  it("compares different pieces and never generates illegal alternatives",()=>{
    const pool=humanAlternativePool(base.fen,[base.bestMove],6);
    expect(new Set(pool.map(m=>m.slice(0,2))).size).toBeGreaterThan(1);
    for(const uci of pool) expect(plausibleHumanMove(base.fen,uci)).toBe(true);
    expect(plausibleHumanMove(base.fen,"a1h8")).toBe(false);
  });
  const ending:TrainingExercise={...base,fen:"8/8/4k3/8/3P4/4K3/6P1/8 w - - 0 40",bestMove:"e3e4",category:"endgame",type:"endgame",conceptSlug:"opposition"};
  const endLines=["e3e4","e3d3","e3f3","g2g3"].map((uci,i)=>({uci,playerCp:500-i*80,pv:[uci]}));
  it("rejects opposition with two extra pawns when every plausible choice wins",()=>{
    expect(causalFeatures(ending.fen,ending.bestMove)?.signals).toContain("opposition_acquired");
    const exact={source:"syzygy" as const,root:"win" as const,after:"win" as const};
    expect(assessDecisionContrast(ending,endLines,exact,endLines.map(l=>({uci:l.uci,state:"win"}))).passed).toBe(false);
  });
  it("requires exact WDL loss rather than DTZ differences",()=>{
    const exact={source:"syzygy" as const,root:"win" as const,after:"win" as const};
    const states=endLines.map(l=>({uci:l.uci,state:l.uci===ending.bestMove?"win" as const:"draw" as const}));
    expect(assessDecisionContrast(ending,endLines,exact,states)).toMatchObject({passed:true,consequence:"win_to_draw"});
  });
  it("rejects all-losing resources",()=>{
    expect(assessDecisionContrast(ending,endLines,{source:"syzygy",root:"loss",after:"loss"},endLines.map(l=>({uci:l.uci,state:"loss"}))).passed).toBe(false);
  });
  it("keeps all acceptable moves with the same good mechanism",()=>{
    const pool=humanAlternativePool(base.fen,[base.bestMove],30);
    const legal=new Set(new Chess(base.fen).moves({verbose:true}).map(m=>m.from+m.to));
    expect(pool.every(m=>legal.has(m))).toBe(true);
    expect(assessDecisionContrast(base,lines,outcome).goodMoves).toContain(base.bestMove);
  });
});
