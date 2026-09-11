import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { classifyPhase } from "../chess/phase";
import type { GamePhase } from "../chess/types";
import {
  attackedSquaresByPiece,
  fileStatus,
  isolatedPawns,
  isPawnEndgame,
  loosePieces,
  materialAdvantage,
  openAndSemiOpenFiles,
  opposite,
  passedPawns,
  pawnAttackSquares,
  pieceActivity,
  pieces,
  PIECE_VALUE,
  squareCoordinates,
} from "./position-features";

export const PILOT_RUNTIME_CONCEPTS = [
  "outpost",
  "open_file",
  "improve_worst_piece",
  "opposition",
  "restrict_counterplay",
  "exchange_attacker",
] as const;

export type PilotRuntimeConcept = (typeof PILOT_RUNTIME_CONCEPTS)[number];

export type PatternAbstentionReason =
  | "concept_unknown"
  | "weak_signal"
  | "multiple_concepts_no_dominant"
  | "tactical_override"
  | "unstable_mechanism"
  | "present_but_not_relevant"
  | "relevant_but_not_pedagogically_central"
  | "insufficient_evidence"
  | "unsuitable_for_training";

export type PatternEvidence = {
  kind: "board_fact" | "legal_branch" | "tactical_fact" | "tablebase_check" | "engine_validation";
  claim: string;
  value?: string | number | boolean | string[];
};

export type PatternAxis = {
  score: number;
  status: "absent" | "weak" | "present" | "strong" | "unknown";
  rationale: string;
  evidence: PatternEvidence[];
  uncertainty: string[];
};

export type TacticalOverrideAssessment = {
  active: boolean;
  severity: "none" | "secondary" | "dominant";
  reasons: string[];
  evidence: PatternEvidence[];
  facts: Array<{
    kind: string;
    role: "dominant" | "supporting" | "incidental" | "unknown";
    detail: string;
  }>;
  uncertainty: string[];
  priorityMultiplier: number;
};

type ForcingMove = { uci: string; check: boolean; capture: boolean; promotion: boolean };

export type OpponentForcingState = {
  status: "known" | "unknown";
  moves: ForcingMove[];
  reason?: string;
};

export type TacticalVulnerability = {
  square: string;
  nominalDefenders: string[];
  effectiveDefenders: string[];
  pinnedDefenders: string[];
  overloadedDefenders: string[];
};

export type VerifiedChessState = {
  fen: string;
  sideToMove: Color;
  phase: GamePhase;
  materialSignature: string;
  materialBalanceForMover: number;
  pieceCount: number;
  legalMoves: string[];
  openFiles: string[];
  semiOpenFiles: { white: string[]; black: string[] };
  pawnStructure: {
    white: { files: string[]; islands: number; isolated: string[]; doubledFiles: string[] };
    black: { files: string[]; islands: number; isolated: string[]; doubledFiles: string[] };
  };
  pawnAttacks: { white: string[]; black: string[] };
  loosePieces: { white: string[]; black: string[] };
  attackedSquares: Record<string, string[]>;
  defendedSquares: Record<string, string[]>;
  passedPawns: { white: string[]; black: string[] };
  inCheck: boolean;
  forcingMoves: ForcingMove[];
  opponentForcingState: OpponentForcingState;
  tacticalVulnerabilities: { white: TacticalVulnerability[]; black: TacticalVulnerability[] };
  kingGeometry: {
    whiteKing?: string;
    blackKing?: string;
    fileDistance?: number;
    rankDistance?: number;
    directOpposition: boolean;
    distantOpposition: boolean;
  };
};

export type PatternDecisionCandidate = {
  moveUci: string;
  role: "played" | "same_mechanism" | "forcing" | "natural_competing_plan" | "tactically_necessary";
  whyHumanPlausible: string;
  mechanismRealized: string[];
  evidence: string[];
  relevantBoardFacts: string[];
  stateChange: string[];
  concessions: string[];
  tacticalStatus: "necessary" | "forcing" | "quiet" | "unknown";
  criticalReply?: string;
  robustness: "geometric" | "reply_dependent" | "unchecked";
  uncertainty: string[];
  humanRelevanceScore: number;
};

export type PatternDetectionCandidate = {
  conceptId: PilotRuntimeConcept;
  subject: Record<string, string | number | boolean | string[]>;
  scope: "move" | "short_sequence" | "theoretical_state";
  mechanism: string;
  evidence: PatternEvidence[];
  counterevidence: PatternEvidence[];
  uncertainty: string[];
  constitutiveConditionsPassed: string[];
  constitutiveConditionsFailed: string[];
  confounders: string[];
  affordance: {
    available: boolean | "unknown";
    mechanism: string;
    access: string;
    target: string | null;
    cost: string;
    stability: "stable" | "reply_dependent" | "unstable" | "unknown";
  };
  decisionComparison: {
    candidates: PatternDecisionCandidate[];
    equivalentMechanismMoves: string[];
    opponentResourcesPrevented: string[];
    concessions: string[];
    stateChange: string[];
    criticalReply?: string;
    robustness: "geometric" | "reply_dependent" | "unchecked";
  };
  presence: PatternAxis;
  decisionRelevance: PatternAxis;
  pedagogicalPriority: PatternAxis;
  confidence: number;
  abstentions: PatternAbstentionReason[];
  tacticalOverride: TacticalOverrideAssessment;
  experimental: boolean;
  trainingCandidate: "yes" | "no" | "unknown";
};

type PatternCandidateDraft = Omit<PatternDetectionCandidate, "confidence" | "abstentions" | "trainingCandidate">;

export type PilotDecisionOptions = {
  lineUci?: string[];
  requestedConcepts?: PilotRuntimeConcept[];
  opponentResourceUci?: string;
  compareDecisions?: boolean;
  comparisonMoveUcis?: string[];
  tablebase?: {
    wdlBefore: "win" | "draw" | "loss" | "cursed-win" | "blessed-loss" | "unknown";
    wdlAfter?: "win" | "draw" | "loss" | "cursed-win" | "blessed-loss" | "unknown";
    dtzBefore?: number;
    dtzAfter?: number;
  };
};

type FunctionalContribution = {
  square: Square;
  activity: number;
  enemyTargets: string[];
  defendedAllies: string[];
  importantDefense: string[];
  passedPawnBlockades: string[];
  kingSafetyFunctions: string[];
  coordinationLinks: string[];
  tacticalUncertainty: string[];
  score: number;
};

type MoveContext = {
  verifiedState: VerifiedChessState;
  before: Chess;
  afterFirst: Chess;
  afterLine: Chess;
  firstMove: Move;
  line: string[];
  mover: Color;
  finalSubjectSquare: Square;
  capturedPiece: ReturnType<Chess["get"]>;
  tacticalOverride: TacticalOverrideAssessment;
};

const FILES = "abcdefgh";
const VERIFIED_STATE_CACHE_LIMIT = 64;
const verifiedStateCache = new Map<string, VerifiedChessState>();

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function axisStatus(score: number): PatternAxis["status"] {
  if (score >= 0.85) return "strong";
  if (score >= 0.62) return "present";
  if (score >= 0.2) return "weak";
  return "absent";
}

function axis(score: number, rationale: string, evidence: PatternEvidence[], uncertainty: string[] = []): PatternAxis {
  return { score: clamp(score), status: axisStatus(score), rationale, evidence, uncertainty };
}

function board(claim: string, value?: PatternEvidence["value"]): PatternEvidence {
  return { kind: "board_fact", claim, value };
}

function tactical(claim: string, value?: PatternEvidence["value"]): PatternEvidence {
  return { kind: "tactical_fact", claim, value };
}

function legal(claim: string, value?: PatternEvidence["value"]): PatternEvidence {
  return { kind: "legal_branch", claim, value };
}

function uci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function play(chess: Chess, moveUci: string): Move | null {
  try {
    return chess.move({
      from: moveUci.slice(0, 2) as Square,
      to: moveUci.slice(2, 4) as Square,
      promotion: (moveUci[4] as PieceSymbol | undefined) ?? "q",
    });
  } catch {
    return null;
  }
}

function phaseFor(fen: string): GamePhase {
  const fullMove = Number(fen.split(" ")[5] ?? 1);
  return classifyPhase(fen, Math.max(0, fullMove * 2 - (fen.split(" ")[1] === "w" ? 2 : 1)));
}

function materialSignature(fen: string): string {
  const counts = new Map<string, number>();
  for (const piece of pieces(new Chess(fen))) {
    const key = `${piece.color}${piece.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `${key}${count}`).join("-");
}

function forcingMoves(chess: Chess): VerifiedChessState["forcingMoves"] {
  return chess.moves({ verbose: true }).flatMap((move) => {
    const after = new Chess(chess.fen());
    const played = play(after, uci(move));
    if (!played) return [];
    const result = { uci: uci(move), check: after.inCheck(), capture: Boolean(move.captured), promotion: Boolean(move.promotion) };
    return result.check || result.capture || result.promotion ? [result] : [];
  });
}

function kingGeometry(chess: Chess): VerifiedChessState["kingGeometry"] {
  const white = pieces(chess).find((piece) => piece.type === "k" && piece.color === "w")?.square;
  const black = pieces(chess).find((piece) => piece.type === "k" && piece.color === "b")?.square;
  if (!white || !black) return { directOpposition: false, distantOpposition: false };
  const [wf, wr] = squareCoordinates(white);
  const [bf, br] = squareCoordinates(black);
  const fileDistance = Math.abs(wf - bf);
  const rankDistance = Math.abs(wr - br);
  return {
    whiteKing: white,
    blackKing: black,
    fileDistance,
    rankDistance,
    directOpposition: (fileDistance === 0 && rankDistance === 2) || (rankDistance === 0 && fileDistance === 2),
    distantOpposition: (fileDistance === 0 && rankDistance === 4) || (rankDistance === 0 && fileDistance === 4),
  };
}

function alignedDirection(from: Square, to: Square): [number, number] | null {
  const [fromFile, fromRank] = squareCoordinates(from);
  const [toFile, toRank] = squareCoordinates(to);
  const fileDelta = toFile - fromFile;
  const rankDelta = toRank - fromRank;
  if (fileDelta === 0) return [0, Math.sign(rankDelta)];
  if (rankDelta === 0) return [Math.sign(fileDelta), 0];
  if (Math.abs(fileDelta) === Math.abs(rankDelta)) return [Math.sign(fileDelta), Math.sign(rankDelta)];
  return null;
}

function raySquares(from: Square, to: Square): Square[] {
  const direction = alignedDirection(from, to);
  if (!direction) return [];
  const [toFile, toRank] = squareCoordinates(to);
  let [file, rank] = squareCoordinates(from);
  const result: Square[] = [];
  file += direction[0];
  rank += direction[1];
  while (file !== toFile || rank !== toRank) {
    result.push(`${FILES[file]}${rank + 1}` as Square);
    file += direction[0];
    rank += direction[1];
  }
  return result;
}

function isAbsolutelyPinned(chess: Chess, square: Square, color: Color): boolean {
  const king = pieces(chess).find((piece) => piece.color === color && piece.type === "k")?.square;
  if (!king || !alignedDirection(king, square)) return false;
  const between = raySquares(king, square);
  if (between.some((candidate) => chess.get(candidate))) return false;
  const [kingFile, kingRank] = squareCoordinates(king);
  const [pieceFile, pieceRank] = squareCoordinates(square);
  const stepFile = Math.sign(pieceFile - kingFile);
  const stepRank = Math.sign(pieceRank - kingRank);
  let file = pieceFile + stepFile;
  let rank = pieceRank + stepRank;
  while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
    const candidateSquare = `${FILES[file]}${rank + 1}` as Square;
    const blocker = chess.get(candidateSquare);
    if (blocker) {
      if (blocker.color === opposite(color)) {
        const diagonal = stepFile !== 0 && stepRank !== 0;
        return blocker.type === "q" || (diagonal ? blocker.type === "b" : blocker.type === "r");
      }
      return false;
    }
    file += stepFile;
    rank += stepRank;
  }
  return false;
}

function vulnerabilities(chess: Chess, color: Color): TacticalVulnerability[] {
  const attacked = pieces(chess).filter((piece) => piece.color === color && piece.type !== "k"
    && chess.attackers(piece.square, opposite(color)).length > 0);
  const provisional = attacked.map((piece) => {
    const nominalDefenders = chess.attackers(piece.square, color).filter((square) => square !== piece.square);
    const pinnedDefenders = nominalDefenders.filter((square) => isAbsolutelyPinned(chess, square, color));
    return {
      square: piece.square,
      nominalDefenders,
      effectiveDefenders: nominalDefenders.filter((square) => !pinnedDefenders.includes(square)),
      pinnedDefenders,
      overloadedDefenders: [] as string[],
    };
  });
  const responsibilities = new Map<string, number>();
  for (const item of provisional) {
    for (const defender of item.effectiveDefenders) responsibilities.set(defender, (responsibilities.get(defender) ?? 0) + 1);
  }
  return provisional.map((item) => ({
    ...item,
    overloadedDefenders: item.effectiveDefenders.filter((square) => (responsibilities.get(square) ?? 0) > 1),
  }));
}

function opponentForcingState(fen: string): OpponentForcingState {
  try {
    const current = new Chess(fen);
    const nonMovingKing = pieces(current).find((piece) => piece.type === "k" && piece.color === opposite(current.turn()));
    if (!nonMovingKing || current.attackers(nonMovingKing.square, current.turn()).length > 0) {
      return { status: "unknown", moves: [], reason: "synthetic_turn_flip_invalid" };
    }
    return { status: "known", moves: forcingMoves(new Chess(switchTurn(fen))) };
  } catch {
    return { status: "unknown", moves: [], reason: "synthetic_turn_flip_failed" };
  }
}

function pawnStructureFacts(chess: Chess, color: Color): VerifiedChessState["pawnStructure"]["white"] {
  const pawns = pieces(chess).filter((piece) => piece.type === "p" && piece.color === color);
  const fileCounts = new Map<string, number>();
  for (const pawn of pawns) fileCounts.set(pawn.square[0], (fileCounts.get(pawn.square[0]) ?? 0) + 1);
  const fileIndexes = [...fileCounts.keys()].map((file) => FILES.indexOf(file)).toSorted((a, b) => a - b);
  const islands = fileIndexes.reduce((count, file, index) => (
    index === 0 || file !== fileIndexes[index - 1] + 1 ? count + 1 : count
  ), 0);
  return {
    files: [...fileCounts.keys()].toSorted(),
    islands,
    isolated: isolatedPawns(chess.fen(), color).map((pawn) => pawn.square),
    doubledFiles: [...fileCounts.entries()].filter(([, count]) => count > 1).map(([file]) => file).toSorted(),
  };
}

export function buildVerifiedChessState(fen: string): VerifiedChessState {
  const chess = new Chess(fen);
  const allPieces = pieces(chess);
  const attackedSquares: Record<string, string[]> = {};
  const defendedSquares: Record<string, string[]> = {};
  for (const piece of allPieces) {
    attackedSquares[piece.square] = attackedSquaresByPiece(chess, piece.square)
      .filter((square) => chess.get(square)?.color !== piece.color);
    defendedSquares[piece.square] = allPieces
      .filter((target) => target.color === piece.color && target.square !== piece.square
        && chess.attackers(target.square, piece.color).includes(piece.square))
      .map((target) => target.square);
  }
  const files = openAndSemiOpenFiles(fen);
  const opponentForcing = opponentForcingState(fen);
  return {
    fen,
    sideToMove: chess.turn(),
    phase: phaseFor(fen),
    materialSignature: materialSignature(fen),
    materialBalanceForMover: materialAdvantage(fen, chess.turn()),
    pieceCount: allPieces.length,
    legalMoves: chess.moves({ verbose: true }).map(uci),
    openFiles: files.filter((file) => file.status === "open").map((file) => file.file),
    semiOpenFiles: {
      white: files.filter((file) => file.status === "white-semi-open").map((file) => file.file),
      black: files.filter((file) => file.status === "black-semi-open").map((file) => file.file),
    },
    pawnStructure: {
      white: pawnStructureFacts(chess, "w"),
      black: pawnStructureFacts(chess, "b"),
    },
    pawnAttacks: { white: [...pawnAttackSquares(fen, "w")], black: [...pawnAttackSquares(fen, "b")] },
    loosePieces: { white: loosePieces(fen, "w").map((piece) => piece.square), black: loosePieces(fen, "b").map((piece) => piece.square) },
    attackedSquares,
    defendedSquares,
    passedPawns: { white: passedPawns(fen, "w").map((piece) => piece.square), black: passedPawns(fen, "b").map((piece) => piece.square) },
    inCheck: chess.inCheck(),
    forcingMoves: forcingMoves(chess),
    opponentForcingState: opponentForcing,
    tacticalVulnerabilities: {
      white: vulnerabilities(chess, "w"),
      black: vulnerabilities(chess, "b"),
    },
    kingGeometry: kingGeometry(chess),
  };
}

function verifiedStateFor(fen: string): VerifiedChessState {
  const cached = verifiedStateCache.get(fen);
  if (cached) return cached;
  const state = buildVerifiedChessState(fen);
  verifiedStateCache.set(fen, state);
  if (verifiedStateCache.size > VERIFIED_STATE_CACHE_LIMIT) {
    const oldest = verifiedStateCache.keys().next().value;
    if (oldest) verifiedStateCache.delete(oldest);
  }
  return state;
}

function futurePawnChase(chess: Chess, square: Square, owner: Color): { status: "yes" | "no" | "unknown"; reasons: string[] } {
  const [targetFile, targetRank] = squareCoordinates(square);
  const candidates = pieces(chess).filter((piece) => {
    if (piece.type !== "p" || piece.color === owner) return false;
    const [file, rank] = squareCoordinates(piece.square);
    if (Math.abs(file - targetFile) !== 1) return false;
    return piece.color === "w" ? rank < targetRank : rank > targetRank;
  });
  if (!candidates.length) return { status: "no", reasons: ["no_adjacent_enemy_pawn_route"] };
  let uncertain = false;
  for (const pawn of candidates) {
    if (isAbsolutelyPinned(chess, pawn.square, pawn.color)) {
      uncertain = true;
      continue;
    }
    let simulation: Chess;
    try {
      simulation = chess.turn() === pawn.color ? new Chess(chess.fen()) : new Chess(switchTurn(chess.fen()));
    } catch {
      uncertain = true;
      continue;
    }
    let pawnSquare = pawn.square;
    for (let step = 0; step < 2; step += 1) {
      const [, rank] = squareCoordinates(pawnSquare);
      const destination = `${pawnSquare[0]}${rank + 1 + (pawn.color === "w" ? 1 : -1)}` as Square;
      const advanced = play(simulation, `${pawnSquare}${destination}`);
      if (!advanced) break;
      pawnSquare = destination;
      if (pawnAttackSquares(simulation.fen(), pawn.color).has(square)) {
        return { status: "yes", reasons: [`legal_chase_route:${pawn.square}-${pawnSquare}`] };
      }
      try {
        simulation = new Chess(switchTurn(simulation.fen()));
      } catch {
        uncertain = true;
        break;
      }
    }
  }
  return uncertain
    ? { status: "unknown", reasons: ["pawn_route_pin_or_turn_state_uncertain"] }
    : { status: "no", reasons: ["candidate_pawn_routes_blocked_or_too_slow"] };
}

function safeDestination(chess: Chess, square: Square, color: Color): boolean {
  const attackers = chess.attackers(square, opposite(color));
  if (!attackers.length) return true;
  const defenders = chess.attackers(square, color).filter((defender) => defender !== square);
  return defenders.length > attackers.length && !attackers.some((attacker) => chess.get(attacker)?.type === "p");
}

function enemyTargets(chess: Chess, square: Square, color: Color): Square[] {
  return attackedSquaresByPiece(chess, square).filter((target) => {
    const piece = chess.get(target);
    return piece?.color === opposite(color);
  });
}

function entrySquares(chess: Chess, rookSquare: Square, color: Color): string[] {
  if (chess.get(rookSquare)?.type !== "r") return [];
  return attackedSquaresByPiece(chess, rookSquare).filter((square) => {
    if (square[0] !== rookSquare[0]) return false;
    const rank = Number(square[1]);
    const advanced = color === "w" ? rank >= 6 : rank <= 3;
    return advanced && chess.get(square)?.color !== color && safeDestination(chess, square, color);
  });
}

function functionalContribution(chess: Chess, square: Square, tacticalState?: TacticalVulnerability[]): FunctionalContribution {
  const piece = chess.get(square);
  if (!piece) return { square, activity: 0, enemyTargets: [], defendedAllies: [], importantDefense: [], passedPawnBlockades: [], kingSafetyFunctions: [], coordinationLinks: [], tacticalUncertainty: [], score: 0 };
  const allPieces = pieces(chess);
  const targets = enemyTargets(chess, square, piece.color);
  const defended = allPieces.filter((target) => target.color === piece.color && target.square !== square
    && chess.attackers(target.square, piece.color).includes(square)).map((target) => target.square);
  const important = allPieces.filter((target) => target.color === piece.color && ["q", "r", "k"].includes(target.type)
    && chess.attackers(target.square, piece.color).length === 1
    && chess.attackers(target.square, piece.color)[0] === square).map((target) => target.square);
  const passedPawnBlockades = passedPawns(chess.fen(), opposite(piece.color)).filter((pawn) => {
    const [, rank] = squareCoordinates(pawn.square);
    const blockSquare = `${pawn.square[0]}${rank + 1 + (pawn.color === "w" ? 1 : -1)}`;
    return blockSquare === square;
  }).map((pawn) => pawn.square);
  const king = allPieces.find((candidate) => candidate.color === piece.color && candidate.type === "k")?.square;
  const kingSafetyFunctions = king ? attackedSquaresByPiece(chess, square).filter((target) => {
    const [targetFile, targetRank] = squareCoordinates(target);
    const [kingFile, kingRank] = squareCoordinates(king);
    const inKingRing = Math.max(Math.abs(targetFile - kingFile), Math.abs(targetRank - kingRank)) <= 1;
    return inKingRing
      && chess.attackers(target, opposite(piece.color)).length > 0
      && chess.attackers(target, piece.color).filter((defender) => defender !== target).length === 1;
  }) : [];
  const coordinationLinks = defended.filter((target) => ["n", "b", "r", "q"].includes(chess.get(target)?.type ?? ""));
  const tacticalUncertainty = [
    ...(isAbsolutelyPinned(chess, square, piece.color) ? ["piece_pinned"] : []),
    ...((tacticalState ?? vulnerabilities(chess, piece.color)).some((item) => item.overloadedDefenders.includes(square)) ? ["piece_overloaded"] : []),
  ];
  const activity = pieceActivity(chess, square);
  return {
    square,
    activity,
    enemyTargets: targets,
    defendedAllies: defended,
    importantDefense: important,
    passedPawnBlockades,
    kingSafetyFunctions,
    coordinationLinks,
    tacticalUncertainty,
    score: activity + targets.length * 3 + defended.length + important.length * 5
      + passedPawnBlockades.length * 6 + kingSafetyFunctions.length * 3 + coordinationLinks.length,
  };
}

function contributions(chess: Chess, color: Color): FunctionalContribution[] {
  const tacticalState = vulnerabilities(chess, color);
  return pieces(chess)
    .filter((piece) => piece.color === color && ["n", "b", "r"].includes(piece.type))
    .map((piece) => functionalContribution(chess, piece.square, tacticalState))
    .toSorted((a, b) => a.score - b.score || a.square.localeCompare(b.square));
}

function switchTurn(fen: string): string {
  const fields = fen.split(" ");
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  return fields.join(" ");
}

function isLegalForOpponentBefore(fen: string, resourceUci: string): boolean {
  try {
    return Boolean(play(new Chess(switchTurn(fen)), resourceUci));
  } catch {
    return false;
  }
}

function forcingResourceState(fen: string): OpponentForcingState {
  try {
    return { status: "known", moves: forcingMoves(new Chess(fen)) };
  } catch {
    return { status: "unknown", moves: [], reason: "forcing_state_unavailable" };
  }
}

function replayContext(fen: string, moveUci: string, options: PilotDecisionOptions): MoveContext | null {
  const verifiedState = verifiedStateFor(fen);
  const before = new Chess(fen);
  const mover = before.turn();
  const capturedPiece = before.get(moveUci.slice(2, 4) as Square);
  const afterFirst = new Chess(fen);
  const firstMove = play(afterFirst, moveUci);
  if (!firstMove) return null;
  const line = options.lineUci?.length ? options.lineUci : [moveUci];
  if (line[0] !== moveUci) return null;
  const afterLine = new Chess(fen);
  let trackedSquare = firstMove.from as Square;
  for (const [index, lineMove] of line.entries()) {
    const moving = afterLine.get(lineMove.slice(0, 2) as Square);
    const played = play(afterLine, lineMove);
    if (!played) return null;
    if (index % 2 === 0 && moving?.color === mover && played.from === trackedSquare) trackedSquare = played.to;
  }
  return {
    verifiedState,
    before,
    afterFirst,
    afterLine,
    firstMove,
    line,
    mover,
    finalSubjectSquare: trackedSquare,
    capturedPiece,
    tacticalOverride: tacticalOverride(verifiedState, before, afterFirst, firstMove, capturedPiece, mover),
  };
}

function tacticalOverride(
  verifiedState: VerifiedChessState,
  before: Chess,
  after: Chess,
  move: Move,
  capturedPiece: ReturnType<Chess["get"]>,
  mover: Color,
): TacticalOverrideAssessment {
  const reasons: string[] = [];
  const evidence: PatternEvidence[] = [];
  const facts: TacticalOverrideAssessment["facts"] = [];
  const uncertainty: string[] = [];
  const addFact = (kind: string, role: TacticalOverrideAssessment["facts"][number]["role"], detail: string) => {
    facts.push({ kind, role, detail });
    if (role !== "incidental" && role !== "unknown") reasons.push(kind);
  };
  if (verifiedState.inCheck) {
    addFact("side_to_move_in_check", "dominant", "The move is a compulsory check evasion.");
    evidence.push(tactical("Le camp au trait doit répondre à un échec."));
  }
  if (move.captured && capturedPiece && PIECE_VALUE[capturedPiece.type] >= 3) {
    const moverValue = PIECE_VALUE[move.piece];
    const targetValue = PIECE_VALUE[capturedPiece.type];
    const recapturable = after.attackers(move.to, opposite(mover)).length > 0;
    const role = targetValue - moverValue >= 2 || (!recapturable && targetValue > moverValue)
      ? "dominant" : "incidental";
    addFact(role === "dominant" ? "immediate_material_win" : "strategic_exchange_capture", role,
      role === "dominant" ? "The capture wins material immediately." : "The capture changes material but does not by itself dominate the strategic mechanism.");
    evidence.push(tactical(role === "dominant" ? "Le coup gagne immédiatement du matériel." : "La capture est un fait tactique, sans gain matériel immédiat établi.", `${move.to}:${capturedPiece.type}`));
  }
  if (after.inCheck()) {
    const replies = after.moves({ verbose: true });
    const mate = replies.length === 0;
    const role = mate ? "dominant" : replies.length === 1 ? "supporting" : "incidental";
    addFact(mate ? "mate_or_critical_king_threat" : replies.length === 1 ? "single_critical_check" : "incidental_check", role,
      mate ? "The move checkmates." : `${replies.length} legal replies remain.`);
    evidence.push(tactical(mate ? "Le coup produit un mat immédiat." : "Le coup donne échec, mais plusieurs réponses peuvent le rendre incident au mécanisme.", replies.map(uci)));
  }
  const immediateTargets = enemyTargets(after, move.to, mover)
    .filter((square) => PIECE_VALUE[after.get(square)!.type] >= 3);
  if (immediateTargets.length) {
    addFact("immediate_piece_attack", "supporting", "The moved piece creates a concrete threat.");
    evidence.push(tactical("La pièce déplacée attaque immédiatement une pièce importante.", immediateTargets));
  }
  const beforeVulnerable = (mover === "w" ? verifiedState.tacticalVulnerabilities.white : verifiedState.tacticalVulnerabilities.black)
    .filter((item) => PIECE_VALUE[before.get(item.square as Square)?.type ?? "p"] >= 3
      && item.effectiveDefenders.length === 0);
  const afterVulnerable = vulnerabilities(after, mover).filter((item) => PIECE_VALUE[after.get(item.square as Square)?.type ?? "p"] >= 3
    && item.effectiveDefenders.length === 0);
  const movedPieceWasVulnerable = beforeVulnerable.some((item) => item.square === move.from);
  if (movedPieceWasVulnerable) {
    addFact("moving_piece_under_attack", "dominant", "The move rescues a tactically vulnerable piece.");
    evidence.push(tactical("La pièce déplacée était tactiquement vulnérable : la sauver est l’urgence immédiate.", move.from));
  }
  if (afterVulnerable.length >= beforeVulnerable.length && afterVulnerable.some((item) => item.square !== move.to)) {
    addFact("unresolved_tactical_vulnerability", "supporting", "A valuable piece remains effectively undefended.");
    evidence.push(tactical("Une pièce importante reste attaquée sans défenseur tactiquement valable.", afterVulnerable.map((item) => item.square)));
  }
  if (verifiedState.opponentForcingState.status === "unknown") {
    addFact("opponent_forcing_state", "unknown", "Synthetic opponent-turn state could not be verified.");
    uncertainty.push(verifiedState.opponentForcingState.reason ?? "opponent_forcing_state_unknown");
  } else {
    const opponentChecks = verifiedState.opponentForcingState.moves.filter((resource) => resource.check);
    if (opponentChecks.length === 1) {
      let replyCount: number | null = null;
      try {
        const opponentTurn = new Chess(switchTurn(before.fen()));
        if (play(opponentTurn, opponentChecks[0].uci)) replyCount = opponentTurn.moves().length;
      } catch {
        uncertainty.push("single_opponent_check_reply_count_unknown");
      }
      const role = replyCount !== null && replyCount <= 1 ? "supporting" : replyCount === null ? "unknown" : "incidental";
      addFact(role === "supporting" ? "single_critical_opponent_check" : "single_opponent_check", role,
        replyCount === null ? "The checking resource is legal but its criticality is unknown." : `${replyCount} legal replies remain.`);
      evidence.push(tactical("L’adversaire dispose d’un échec légal; sa dominance dépend des réponses disponibles.", opponentChecks[0].uci));
    } else if (opponentChecks.length >= 2) {
      addFact("immediate_king_danger", "supporting", "Several immediate checks compete with the strategic plan.");
      evidence.push(tactical("L’adversaire dispose de plusieurs échecs immédiats.", opponentChecks.map((resource) => resource.uci)));
    }
  }
  const severity: TacticalOverrideAssessment["severity"] = facts.some((fact) => fact.role === "dominant")
    ? "dominant" : facts.some((fact) => fact.role === "supporting") ? "secondary" : "none";
  return {
    active: severity !== "none",
    severity,
    reasons,
    evidence,
    facts,
    uncertainty,
    priorityMultiplier: severity === "dominant" ? 0.28 : severity === "secondary" ? 0.55 : 1,
  };
}

function abstentionsFor(
  presence: PatternAxis,
  relevance: PatternAxis,
  priority: PatternAxis,
  tacticalAssessment: TacticalOverrideAssessment,
  experimental: boolean,
  unstable: boolean,
  ambiguous: boolean,
): PatternAbstentionReason[] {
  const reasons = new Set<PatternAbstentionReason>();
  if (presence.score < 0.2) reasons.add("concept_unknown");
  else if (presence.score < 0.55) reasons.add("weak_signal");
  if (presence.score >= 0.62 && relevance.score < 0.5) reasons.add("present_but_not_relevant");
  if (relevance.score >= 0.62 && priority.score < 0.55) reasons.add("relevant_but_not_pedagogically_central");
  if (tacticalAssessment.active && priority.score < relevance.score) reasons.add("tactical_override");
  if (unstable) reasons.add("unstable_mechanism");
  if (ambiguous) reasons.add("multiple_concepts_no_dominant");
  if (experimental) reasons.add("insufficient_evidence");
  if (priority.score < 0.62 || experimental) reasons.add("unsuitable_for_training");
  return [...reasons];
}

function candidateDraft(seed: PatternCandidateDraft): PatternCandidateDraft {
  return seed;
}

function applyDecisionComparison(
  seed: PatternCandidateDraft,
  alternatives: PatternDecisionCandidate[],
): PatternCandidateDraft {
  const candidates = [...seed.decisionComparison.candidates, ...alternatives];
  const equivalentMechanismMoves = alternatives.filter((candidate) => candidate.role === "same_mechanism").map((candidate) => candidate.moveUci);
  const tacticalCompetitors = alternatives.filter((candidate) => candidate.role === "tactically_necessary");
  const strongerNaturalPlan = alternatives.find((candidate) => candidate.role === "natural_competing_plan"
    && candidate.humanRelevanceScore > (candidates[0]?.humanRelevanceScore ?? 0.7) + 0.12);
  const relevanceMultiplier = tacticalCompetitors.length ? 0.7 : strongerNaturalPlan ? 0.88 : 1;
  const priorityMultiplier = tacticalCompetitors.length ? 0.45 : strongerNaturalPlan ? 0.72 : 1;
  const rationaleSuffix = tacticalCompetitors.length
    ? " Une alternative tactiquement nécessaire concurrence directement cette lecture."
    : strongerNaturalPlan ? " Un plan humain concurrent plus saillant réduit la centralité de cette lecture." : "";
  return {
    ...seed,
    uncertainty: [...seed.uncertainty, ...alternatives.flatMap((candidate) => candidate.uncertainty)],
    decisionComparison: {
      ...seed.decisionComparison,
      candidates,
      equivalentMechanismMoves,
      concessions: [...seed.decisionComparison.concessions, ...alternatives.flatMap((candidate) => candidate.concessions)],
      robustness: alternatives.some((candidate) => candidate.robustness === "unchecked") ? "unchecked" : seed.decisionComparison.robustness,
    },
    decisionRelevance: axis(
      seed.decisionRelevance.score * relevanceMultiplier,
      `${seed.decisionRelevance.rationale}${rationaleSuffix}`,
      seed.decisionRelevance.evidence,
      [...seed.decisionRelevance.uncertainty, ...(tacticalCompetitors.length ? ["Tactically necessary alternative present."] : [])],
    ),
    pedagogicalPriority: axis(
      seed.pedagogicalPriority.score * priorityMultiplier,
      `${seed.pedagogicalPriority.rationale}${rationaleSuffix}`,
      seed.pedagogicalPriority.evidence,
      [...seed.pedagogicalPriority.uncertainty, ...(strongerNaturalPlan ? ["Competing human plan requires validation."] : [])],
    ),
    confounders: [...seed.confounders, ...(tacticalCompetitors.length ? ["tactically_necessary_alternative"] : []), ...(strongerNaturalPlan ? ["stronger_natural_plan"] : [])],
  };
}

function finishCandidate(rawSeed: PatternCandidateDraft, alternatives: PatternDecisionCandidate[] = []): PatternDetectionCandidate {
  const seed = applyDecisionComparison(rawSeed, alternatives);
  const ambiguous = seed.confounders.length > 1 && seed.pedagogicalPriority.score < 0.7;
  const unstable = seed.affordance.stability === "unstable" || seed.affordance.stability === "unknown";
  const abstentions = abstentionsFor(
    seed.presence,
    seed.decisionRelevance,
    seed.pedagogicalPriority,
    seed.tacticalOverride,
    seed.experimental,
    unstable,
    ambiguous,
  );
  const evidenceQuality = seed.evidence.length >= 3 ? 0.94 : seed.evidence.length === 2 ? 0.86 : 0.72;
  const conditionCoverage = seed.constitutiveConditionsPassed.length
    / Math.max(1, seed.constitutiveConditionsPassed.length + seed.constitutiveConditionsFailed.length);
  const confidence = clamp(evidenceQuality * 0.5 + conditionCoverage * 0.35
    + (seed.affordance.stability === "stable" ? 0.15 : seed.affordance.stability === "reply_dependent" ? 0.08 : 0)
    - seed.counterevidence.length * 0.04 - (seed.experimental ? 0.16 : 0)
    - (seed.decisionComparison.robustness === "unchecked" ? 0.06 : 0)
    - seed.tacticalOverride.uncertainty.length * 0.04);
  const promotable = seed.presence.score >= 0.72
    && seed.decisionRelevance.score >= 0.68
    && seed.pedagogicalPriority.score >= 0.62
    && confidence >= 0.7
    && !seed.experimental
    && !abstentions.includes("tactical_override")
    && !abstentions.includes("multiple_concepts_no_dominant");
  const unresolved = seed.presence.status === "unknown" || seed.decisionRelevance.status === "unknown"
    || seed.affordance.available === "unknown" || seed.experimental;
  return {
    ...seed,
    confidence,
    abstentions,
    trainingCandidate: promotable ? "yes" : unresolved ? "unknown" : "no",
  };
}

function baseDecisionComparison(
  moveUci: string,
  mechanism: string,
  evidence: string[],
  stateChange: string[],
  criticalReply?: string,
): PatternDetectionCandidate["decisionComparison"] {
  return {
    candidates: [{
      moveUci,
      role: "played",
      whyHumanPlausible: "Coup effectivement joué ou explicitement évalué.",
      mechanismRealized: [mechanism],
      evidence,
      relevantBoardFacts: evidence,
      stateChange,
      concessions: [],
      tacticalStatus: "quiet",
      criticalReply,
      robustness: criticalReply ? "reply_dependent" : "geometric",
      uncertainty: [],
      humanRelevanceScore: 0.7,
    }],
    equivalentMechanismMoves: [],
    opponentResourcesPrevented: [],
    concessions: [],
    stateChange,
    criticalReply,
    robustness: criticalReply ? "reply_dependent" : "geometric",
  };
}

function openFileCandidate(context: MoveContext): PatternCandidateDraft | null {
  const { firstMove: move, before, afterLine: after, mover, tacticalOverride: override } = context;
  if (move.piece !== "r") return null;
  const file = context.finalSubjectSquare[0];
  const status = fileStatus(after.fen(), file);
  const strictOpen = status === "open";
  const semiOpenForMover = status === (mover === "w" ? "white-semi-open" : "black-semi-open");
  const usableFile = strictOpen || semiOpenForMover;
  const entries = entrySquares(after, context.finalSubjectSquare, mover);
  const targets = enemyTargets(after, context.finalSubjectSquare, mover).filter((square) => square[0] === file);
  const rookRay = attackedSquaresByPiece(after, context.finalSubjectSquare);
  const contestedBy = pieces(after).filter((piece) => piece.color === opposite(mover)
    && ["r", "q"].includes(piece.type) && piece.square[0] === file
    && rookRay.includes(piece.square)).map((piece) => piece.square);
  const entriesBefore = move.from[0] === file ? entrySquares(before, move.from, mover) : [];
  const targetsBefore = move.from[0] === file
    ? enemyTargets(before, move.from, mover).filter((square) => square[0] === file) : [];
  const rayBefore = move.from[0] === file ? attackedSquaresByPiece(before, move.from) : [];
  const contestedBefore = move.from[0] === file ? pieces(before).filter((piece) => piece.color === opposite(mover)
    && ["r", "q"].includes(piece.type) && piece.square[0] === file && rayBefore.includes(piece.square)).map((piece) => piece.square) : [];
  const newEntries = entries.filter((square) => !entriesBefore.includes(square));
  const newTargets = targets.filter((square) => !targetsBefore.includes(square));
  const newContests = contestedBy.filter((square) => !contestedBefore.includes(square));
  const immediateAttackIsFileMechanism = targets.length > 0
    && override.severity === "secondary"
    && override.reasons.length > 0
    && override.reasons.every((reason) => reason === "immediate_piece_attack");
  const effectiveOverride: TacticalOverrideAssessment = immediateAttackIsFileMechanism
    ? { active: false, severity: "none", reasons: [], evidence: [], facts: [], uncertainty: override.uncertainty, priorityMultiplier: 1 }
    : override;
  const useful = usableFile && (newEntries.length > 0 || newTargets.length > 0 || newContests.length > 0);
  const evidence = [
    board(`La colonne ${file} est ${status}.`, status),
    legal(`La tour peut atteindre ${context.finalSubjectSquare}.`, context.line),
  ];
  if (entries.length) evidence.push(board("Cases d’entrée accessibles sur la colonne.", entries));
  if (targets.length) evidence.push(board("Cibles adverses sur la colonne.", targets));
  if (contestedBy.length) evidence.push(board("Pièce lourde adverse à contester sur la colonne.", contestedBy));
  if (useful) evidence.push(board("Nouvelle fonction créée par rapport à la case de départ.", [...newEntries, ...newTargets, ...newContests]));
  const counterevidence: PatternEvidence[] = [];
  if (!strictOpen) counterevidence.push(board(`La colonne ${file} n’est pas strictement ouverte; son état exact est ${status}.`, status));
  if (usableFile && !useful) counterevidence.push(board("La colonne utilisable existe mais aucune entrée, cible ou contestation connectée n’est établie."));
  const presence = axis(strictOpen ? 0.98 : semiOpenForMover ? 0.82 : 0.02,
    strictOpen ? `Aucun pion blanc ou noir n’occupe la colonne ${file}.`
      : semiOpenForMover ? `Le joueur n’a aucun pion sur ${file}, mais un pion adverse y demeure : colonne semi-ouverte.`
        : `La colonne ${file} n’est ni ouverte ni semi-ouverte pour le joueur.`,
    evidence.slice(0, 1));
  const relevance = axis(useful ? (strictOpen ? 0.84 : 0.76) : usableFile ? 0.34 : 0.04,
    useful ? "Le déplacement donne à la tour une entrée, une cible ou une contestation concrète." : "La propriété de colonne ne produit pas d’affordance décisionnelle démontrée.",
    evidence.slice(1), strictOpen && !useful ? ["La colonne peut devenir utile plus tard, sans que ce coup l’établisse."] : []);
  const priorityScore = relevance.score * effectiveOverride.priorityMultiplier;
  const priority = axis(priorityScore,
    effectiveOverride.active ? "Le mécanisme de colonne est présent, mais une urgence tactique concurrence la leçon." : useful ? "La colonne et son utilisation expliquent directement la décision." : "Aucune leçon de colonne centrale n’est justifiée.",
    effectiveOverride.active ? effectiveOverride.evidence : evidence.slice(-1));
  return candidateDraft({
    conceptId: "open_file",
    subject: { rook_from: move.from, rook_to: context.finalSubjectSquare, file, file_state: status, entries, targets, contested_by: contestedBy, new_entries: newEntries, new_targets: newTargets, new_contests: newContests },
    scope: context.line.length > 1 ? "short_sequence" : "move",
    mechanism: strictOpen ? "open_file_exploitation" : semiOpenForMover ? "semi_open_file_pressure" : "property_only",
    evidence,
    counterevidence,
    uncertainty: useful ? ["La robustesse face à la meilleure réponse reste à valider par Stockfish."] : [],
    constitutiveConditionsPassed: ["legal_access", ...(strictOpen ? ["open_file_exists"] : []), ...(semiOpenForMover ? ["semi_open_for_mover"] : []), ...(useful ? ["useful_exploitation"] : [])],
    constitutiveConditionsFailed: [...(!usableFile ? ["usable_file_exists"] : []), ...(usableFile && !useful ? ["useful_exploitation"] : [])],
    confounders: immediateAttackIsFileMechanism ? ["immediate_target_is_file_affordance"] : override.reasons,
    affordance: { available: useful, mechanism: "rook file exploitation", access: `${move.from}-${context.finalSubjectSquare}`, target: targets[0] ?? entries[0] ?? contestedBy[0] ?? null, cost: `${Math.ceil(context.line.length / 2)} player tempo`, stability: useful ? "reply_dependent" : "stable" },
    decisionComparison: baseDecisionComparison(uci(move), strictOpen ? "open_file_exploitation" : semiOpenForMover ? "semi_open_file_pressure" : "property_only", evidence.map((item) => item.claim), [`rook reaches ${context.finalSubjectSquare}`, ...(useful ? ["file obtains a concrete function"] : [])]),
    presence,
    decisionRelevance: relevance,
    pedagogicalPriority: priority,
    tacticalOverride: effectiveOverride,
    experimental: false,
  });
}

function outpostCandidate(context: MoveContext): PatternCandidateDraft | null {
  const { firstMove: move, afterLine: after, mover, tacticalOverride: override } = context;
  if (move.piece !== "n") return null;
  const square = context.finalSubjectSquare;
  const rank = Number(square[1]);
  const advanced = mover === "w" ? rank >= 5 : rank <= 4;
  const currentPawnChase = pawnAttackSquares(after.fen(), opposite(mover)).has(square);
  const futureChase = futurePawnChase(after, square, mover);
  const supportedByPawn = pawnAttackSquares(after.fen(), mover).has(square);
  const supportedByPiece = after.attackers(square, mover).some((defender) => defender !== square);
  const targets = enemyTargets(after, square, mover);
  const usefulInfluence = attackedSquaresByPiece(after, square).filter((target) => {
    const targetRank = Number(target[1]);
    return mover === "w" ? targetRank >= 5 : targetRank <= 4;
  });
  const stable = advanced && !currentPawnChase && futureChase.status === "no" && safeDestination(after, square, mover);
  const installed = context.line.length > 1 || move.to === square;
  const effective = stable && installed && (targets.length > 0 || usefulInfluence.length >= 4) && (supportedByPawn || supportedByPiece);
  const evidence = [legal("La route du cavalier est légale.", context.line), board(`Case finale ${square}.`, square)];
  if (supportedByPawn || supportedByPiece) evidence.push(board("La pièce est soutenue sur sa case finale.", supportedByPawn ? "pawn" : "piece"));
  if (targets.length) evidence.push(board("Cibles adverses depuis la case finale.", targets));
  const counterevidence: PatternEvidence[] = [];
  if (!advanced) counterevidence.push(board("La case n’est pas avancée dans le camp adverse."));
  if (currentPawnChase) counterevidence.push(board("Un pion adverse attaque déjà la case.", square));
  if (futureChase.status === "yes") counterevidence.push(board("Un pion adverse dispose d’une route légale pour chasser la pièce.", futureChase.reasons));
  if (futureChase.status === "unknown") counterevidence.push(board("La possibilité future de chasse par pion reste inconnue.", futureChase.reasons));
  if (!targets.length && usefulInfluence.length < 4) counterevidence.push(board("Aucune cible ou fonction durable suffisante n’est établie."));
  const presenceScore = effective ? 0.9 : stable && installed ? 0.58 : advanced ? 0.24 : 0.05;
  const presence = axis(presenceScore,
    effective ? "Le cavalier atteint une case avancée, stable, soutenue et fonctionnelle." : "Une ou plusieurs conditions constitutives de l’avant-poste effectif manquent.",
    evidence, counterevidence.map((item) => item.claim));
  const relevanceScore = effective ? 0.78 : stable ? 0.42 : 0.08;
  const relevance = axis(relevanceScore,
    effective ? "La route installe réellement le cavalier et lui donne des cibles ou une influence avancée." : "La simple apparence d’une case avancée ne suffit pas à expliquer la décision.",
    evidence.slice(1), !effective ? ["Le rôle final n’est pas suffisamment démontré."] : []);
  const priorityScore = relevanceScore * override.priorityMultiplier;
  const priority = axis(priorityScore,
    override.active ? "L’avant-poste peut exister, mais une attaque immédiate, un échec ou une capture domine la lecture pédagogique." : effective ? "Le mécanisme positionnel est assez central pour être proposé avec validation de réponse." : "Pas de leçon d’avant-poste fiable.",
    override.active ? override.evidence : evidence);
  return candidateDraft({
    conceptId: "outpost",
    subject: { knight_from: move.from, route: context.line, final_square: square, targets, supported_by_pawn: supportedByPawn, future_pawn_chase: futureChase.status, future_pawn_chase_reasons: futureChase.reasons },
    scope: context.line.length > 1 ? "short_sequence" : "move",
    mechanism: context.line.length > 1 ? "maneuver_to_install" : "install",
    evidence,
    counterevidence,
    uncertainty: [...(effective ? ["Réponse adverse et centralité tactique à valider."] : []), ...(futureChase.status === "unknown" ? futureChase.reasons : [])],
    constitutiveConditionsPassed: ["reachable", ...(advanced ? ["advanced_square"] : []), ...(stable ? ["stable_square"] : []), ...(installed ? ["installed"] : []), ...(effective ? ["effective"] : [])],
    constitutiveConditionsFailed: [...(!advanced ? ["advanced_square"] : []), ...(!stable ? ["stable_square"] : []), ...(!effective ? ["effective"] : [])],
    confounders: [...override.reasons, ...(targets.length ? ["immediate_target"] : [])],
    affordance: { available: futureChase.status === "unknown" ? "unknown" : effective, mechanism: "stable supported knight installation", access: context.line.join(" "), target: targets[0] ?? square, cost: `${Math.ceil(context.line.length / 2)} player tempo`, stability: futureChase.status === "unknown" ? "unknown" : stable ? "reply_dependent" : "unstable" },
    decisionComparison: baseDecisionComparison(uci(move), context.line.length > 1 ? "maneuver_to_install" : "install", evidence.map((item) => item.claim), [`knight reaches ${square}`, ...(targets.length ? [`targets ${targets.join(",")}`] : [])]),
    presence,
    decisionRelevance: relevance,
    pedagogicalPriority: priority,
    tacticalOverride: override,
    experimental: false,
  });
}

function improveWorstPieceCandidate(context: MoveContext): PatternCandidateDraft | null {
  const { firstMove: move, before, afterLine: after, mover, tacticalOverride: override } = context;
  if (!["n", "b", "r"].includes(move.piece)) return null;
  const beforeContributions = contributions(before, mover);
  const initial = beforeContributions.find((item) => item.square === move.from);
  const final = functionalContribution(after, context.finalSubjectSquare, vulnerabilities(after, mover));
  if (!initial) return null;
  const second = beforeContributions[1];
  const clearlyWorst = beforeContributions[0]?.square === move.from && (!second || second.score - initial.score >= 2);
  const importantDefender = initial.importantDefense.length > 0
    || initial.passedPawnBlockades.length > 0
    || initial.kingSafetyFunctions.length > 0;
  const tacticalRoleUnknown = initial.tacticalUncertainty.length > 0;
  const targetGain = final.enemyTargets.filter((target) => !initial.enemyTargets.includes(target));
  const defenseGain = final.defendedAllies.filter((target) => !initial.defendedAllies.includes(target));
  const contributionGain = final.score - initial.score;
  const functionalDestination = contributionGain >= 4 && (targetGain.length > 0 || defenseGain.length > 0 || final.activity - initial.activity >= 5);
  const timely = !override.active && !importantDefender && !tacticalRoleUnknown;
  const effective = clearlyWorst && functionalDestination && timely;
  const evidence = [
    board("Contribution fonctionnelle initiale de la pièce.", initial.score),
    board("Contribution fonctionnelle après la route.", final.score),
    legal("Route légale de la même pièce.", context.line),
  ];
  if (targetGain.length) evidence.push(board("Nouvelles cibles créées.", targetGain));
  if (defenseGain.length) evidence.push(board("Nouvelles fonctions défensives.", defenseGain));
  if (initial.passedPawnBlockades.length) evidence.push(board("La pièce bloque un pion passé adverse.", initial.passedPawnBlockades));
  if (initial.kingSafetyFunctions.length) evidence.push(board("La pièce contribue directement à la sécurité du roi.", initial.kingSafetyFunctions));
  const counterevidence: PatternEvidence[] = [];
  if (!clearlyWorst) counterevidence.push(board("La pièce n’est pas clairement la moins contributive par comparaison avec les autres."));
  if (importantDefender) counterevidence.push(board("La faible mobilité masque une fonction défensive irremplaçable.", initial.importantDefense));
  if (tacticalRoleUnknown) counterevidence.push(tactical("Le rôle de la pièce est tactiquement ambigu (clouage ou surcharge).", initial.tacticalUncertainty));
  if (!functionalDestination) counterevidence.push(board("La destination ne crée pas de fonction nouvelle suffisante."));
  const presenceScore = clearlyWorst && functionalDestination ? 0.84 : clearlyWorst ? 0.46 : 0.12;
  const relevanceScore = effective ? 0.78 : clearlyWorst && functionalDestination ? 0.56 : 0.1;
  const priorityScore = relevanceScore * override.priorityMultiplier;
  const presence = axis(presenceScore,
    clearlyWorst && functionalDestination ? "La pièce est comparativement faible et la route lui donne une fonction mesurable." : "Faible mobilité seule ou destination cosmétique : le mécanisme complet n’est pas établi.",
    evidence, counterevidence.map((item) => item.claim));
  const relevance = axis(relevanceScore,
    effective ? "La décision améliore précisément la pièce la moins contributive." : "La décision peut activer une pièce, mais le diagnostic de pire pièce ou le timing reste incertain.",
    evidence.slice(1), importantDefender ? ["Le rôle défensif doit être préservé."] : []);
  const priority = axis(priorityScore,
    override.active ? "Une urgence tactique réduit la priorité de la manœuvre positionnelle." : effective ? "La comparaison des pièces et le gain de fonction rendent la leçon centrale." : "La leçon n’est pas assez isolée.",
    override.active ? override.evidence : evidence);
  return candidateDraft({
    conceptId: "improve_worst_piece",
    subject: { piece_from: move.from, route: context.line, final_square: context.finalSubjectSquare, before_score: initial.score, after_score: final.score, important_defense: [...initial.importantDefense, ...initial.passedPawnBlockades, ...initial.kingSafetyFunctions], route_cost_tempi: Math.ceil(context.line.length / 2) },
    scope: context.line.length > 1 ? "short_sequence" : "move",
    mechanism: context.line.length > 1 ? "functional_maneuver" : "activate_low_contributor",
    evidence,
    counterevidence,
    uncertainty: [...(!clearlyWorst ? ["Plusieurs pièces ont une contribution comparable."] : []), ...initial.tacticalUncertainty],
    constitutiveConditionsPassed: [...(clearlyWorst ? ["comparative_worst_piece"] : []), "legal_route", ...(functionalDestination ? ["functional_destination"] : []), ...(timely ? ["timely"] : [])],
    constitutiveConditionsFailed: [...(!clearlyWorst ? ["comparative_worst_piece"] : []), ...(!functionalDestination ? ["functional_destination"] : []), ...(!timely ? ["timely"] : [])],
    confounders: [...override.reasons, ...(importantDefender ? ["important_defender"] : []), ...(tacticalRoleUnknown ? ["tactical_role_unknown"] : []), ...(targetGain.length ? ["immediate_target"] : [])],
    affordance: { available: functionalDestination, mechanism: "functional redeployment", access: context.line.join(" "), target: targetGain[0] ?? defenseGain[0] ?? context.finalSubjectSquare, cost: `${Math.ceil(context.line.length / 2)} player tempo`, stability: effective ? "reply_dependent" : "unknown" },
    decisionComparison: baseDecisionComparison(uci(move), context.line.length > 1 ? "functional_maneuver" : "activate_low_contributor", evidence.map((item) => item.claim), [`contribution ${initial.score} -> ${final.score}`]),
    presence,
    decisionRelevance: relevance,
    pedagogicalPriority: priority,
    tacticalOverride: override,
    experimental: false,
  });
}

function keySquaresForPawn(chess: Chess, square: Square): Square[] {
  const pawn = chess.get(square);
  if (!pawn || pawn.type !== "p") return [];
  const [file, rank] = squareCoordinates(square);
  const direction = pawn.color === "w" ? 1 : -1;
  const distance = pawn.color === "w" ? (rank <= 3 ? 2 : 1) : (rank >= 4 ? 2 : 1);
  const targetRank = rank + direction * distance;
  return [-1, 0, 1].flatMap((fileOffset) => {
    const targetFile = file + fileOffset;
    if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) return [];
    return [`${FILES[targetFile]}${targetRank + 1}` as Square];
  });
}

function kingOutflankingOptions(chess: Chess, mover: Color, keySquares: Square[]): string[] {
  if (!keySquares.length) return [];
  const moverTurn = chess.turn() === mover ? new Chess(chess.fen()) : new Chess(switchTurn(chess.fen()));
  const king = pieces(moverTurn).find((piece) => piece.type === "k" && piece.color === mover);
  if (!king) return [];
  const [kingFile, kingRank] = squareCoordinates(king.square);
  const beforeDistance = Math.min(...keySquares.map((square) => {
    const [file, rank] = squareCoordinates(square);
    return Math.max(Math.abs(file - kingFile), Math.abs(rank - kingRank));
  }));
  return moverTurn.moves({ verbose: true }).flatMap((move) => {
    if (move.piece !== "k") return [];
    const after = new Chess(moverTurn.fen());
    if (!play(after, uci(move)) || kingGeometry(after).directOpposition) return [];
    const [file, rank] = squareCoordinates(move.to);
    const afterDistance = Math.min(...keySquares.map((square) => {
      const [targetFile, targetRank] = squareCoordinates(square);
      return Math.max(Math.abs(targetFile - file), Math.abs(targetRank - rank));
    }));
    return afterDistance < beforeDistance ? [uci(move)] : [];
  });
}

function oppositionCandidate(context: MoveContext, options: PilotDecisionOptions): PatternCandidateDraft | null {
  const { firstMove: move, before, afterLine: after, mover, tacticalOverride: override } = context;
  if (move.piece !== "k" || !isPawnEndgame(before.fen())) return null;
  const geometry = kingGeometry(after);
  const pawnGoals = pieces(after)
    .filter((piece) => piece.type === "p" && piece.color === opposite(mover))
    .map((piece) => piece.square);
  const [kingFile, kingRank] = squareCoordinates(context.finalSubjectSquare);
  const nearbyPawnGoals = pawnGoals.filter((square) => {
    const [file, rank] = squareCoordinates(square as Square);
    return Math.max(Math.abs(file - kingFile), Math.abs(rank - kingRank)) <= 3;
  });
  const keySquares = [...new Set(nearbyPawnGoals.flatMap((square) => keySquaresForPawn(after, square as Square)))];
  const outflankingOptions = kingOutflankingOptions(after, mover, keySquares);
  const moverTurnAfter = after.turn() === mover ? new Chess(after.fen()) : new Chess(switchTurn(after.fen()));
  const reserveTempi = pieces(moverTurnAfter).filter((piece) => piece.type === "p" && piece.color === mover)
    .filter((piece) => {
      const clone = new Chess(moverTurnAfter.fen());
      const direction = mover === "w" ? 1 : -1;
      return Boolean(play(clone, `${piece.square}${piece.square[0]}${Number(piece.square[1]) + direction}`));
    }).length;
  const tablebaseKnown = Boolean(options.tablebase
    && options.tablebase.wdlBefore !== "unknown"
    && options.tablebase.wdlAfter
    && options.tablebase.wdlAfter !== "unknown");
  const tablebaseChanged = Boolean(tablebaseKnown && options.tablebase!.wdlBefore !== options.tablebase!.wdlAfter);
  const effectiveEvidence = Boolean(geometry.directOpposition && nearbyPawnGoals.length > 0
    && (pieces(after).length <= 4
      || tablebaseChanged));
  const presenceScore = geometry.directOpposition ? 0.92 : geometry.distantOpposition ? 0.46 : 0.04;
  const relevanceScore = effectiveEvidence ? 0.78 : geometry.directOpposition && nearbyPawnGoals.length ? 0.54 : 0.08;
  const priorityScore = relevanceScore * override.priorityMultiplier * (tablebaseKnown ? 1 : 0.88);
  const evidence: PatternEvidence[] = [
    legal("La route du roi est légale.", context.line),
    board("Géométrie finale des rois.", JSON.stringify(geometry)),
    board("Pions adverses proches des cases disputées.", nearbyPawnGoals),
    board("Cases clés géométriques liées aux pions proches.", keySquares),
    board("Tempi de réserve immédiatement légaux.", reserveTempi),
    board("Routes de débordement concurrentes immédiatement légales.", outflankingOptions),
  ];
  if (options.tablebase) evidence.push({ kind: "tablebase_check", claim: "Résultat objectif fourni par une tablebase externe au détecteur sémantique.", value: JSON.stringify(options.tablebase) });
  const counterevidence: PatternEvidence[] = [];
  if (!geometry.directOpposition) counterevidence.push(board(geometry.distantOpposition
    ? "La géométrie distante existe, mais aucun mécanisme effectif n’est démontré."
    : "La branche ne crée pas la géométrie directe."));
  if (geometry.directOpposition && !effectiveEvidence) counterevidence.push(board("La géométrie existe, mais son effet sur la méthode ou le résultat n’est pas établi."));
  const presence = axis(presenceScore,
    geometry.directOpposition ? "Les rois sont alignés avec exactement une case entre eux après la séquence."
      : geometry.distantOpposition ? "Une géométrie distante est observée sans preuve suffisante de méthode." : "La géométrie d’opposition directe est absente.",
    evidence.slice(0, 2));
  const relevance = axis(relevanceScore,
    effectiveEvidence ? "La géométrie est reliée à des pions/cases proches et dispose d’une validation objective ou d’un matériel théorique minimal." : "RoIs face à face ne suffit pas : l’effet sur les cases clés et le résultat reste inconnu.",
    evidence.slice(2), effectiveEvidence ? [] : ["Tablebase ou analyse de méthode manquante."]);
  const priority = axis(priorityScore,
    priorityScore >= 0.62 ? "L’opposition peut expliquer la décision, sous réserve de la méthode documentée." : "La position reste une frontière ou une abstention plutôt qu’une leçon automatique.",
    override.active ? override.evidence : evidence.slice(1));
  return candidateDraft({
    conceptId: "opposition",
    subject: { king_from: move.from, route: context.line, king_to: context.finalSubjectSquare, nearby_pawns: nearbyPawnGoals, key_squares: keySquares, reserve_tempi: reserveTempi, outflanking_options: outflankingOptions, tablebase_wdl_before: options.tablebase?.wdlBefore ?? "unknown", tablebase_wdl_after: options.tablebase?.wdlAfter ?? "unknown" },
    scope: "theoretical_state",
    mechanism: geometry.directOpposition
      ? reserveTempi > 0 ? "reserve_tempo_with_direct_opposition" : outflankingOptions.length ? "outflank_from_direct_opposition" : "direct_opposition"
      : geometry.distantOpposition ? "distant_opposition_unverified" : "king_geometry_absent",
    evidence,
    counterevidence,
    uncertainty: effectiveEvidence
      ? ["La tablebase valide un résultat avant/après, jamais le nom du concept à elle seule."]
      : [geometry.distantOpposition ? "Opposition distante non supportée par une preuve de méthode." : "Méthode causale et conséquence WDL non établies."],
    constitutiveConditionsPassed: ["pawn_endgame", "side_to_move_known", ...(geometry.directOpposition ? ["king_geometry"] : []), ...(effectiveEvidence ? ["effective_method_evidence"] : [])],
    constitutiveConditionsFailed: [...(!geometry.directOpposition ? ["king_geometry"] : []), ...(!effectiveEvidence ? ["effective_method_evidence"] : [])],
    confounders: [...override.reasons, ...(passedPawns(after.fen(), "w").length + passedPawns(after.fen(), "b").length > 1 ? ["pawn_race"] : []), ...(reserveTempi > 0 ? ["reserve_tempi"] : []), ...(outflankingOptions.length ? ["outflanking_alternative"] : [])],
    affordance: { available: effectiveEvidence ? true : geometry.directOpposition ? "unknown" : false, mechanism: "king geometry controlling key squares", access: context.line.join(" "), target: nearbyPawnGoals[0] ?? null, cost: `${Math.ceil(context.line.length / 2)} player tempo`, stability: tablebaseKnown ? "stable" : "unknown" },
    decisionComparison: baseDecisionComparison(uci(move), "king_geometry", evidence.map((item) => item.claim), [geometry.directOpposition ? "direct geometry acquired" : "direct geometry absent"]),
    presence,
    decisionRelevance: relevance,
    pedagogicalPriority: priority,
    tacticalOverride: override,
    experimental: false,
  });
}

function restrictCounterplayCandidate(context: MoveContext, options: PilotDecisionOptions): PatternCandidateDraft | null {
  const { firstMove: move, before, afterFirst: after, tacticalOverride: override } = context;
  const requested = options.requestedConcepts?.includes("restrict_counterplay") ?? false;
  const explicitResource = options.opponentResourceUci;
  const beforeState: OpponentForcingState = explicitResource
    ? { status: "known", moves: isLegalForOpponentBefore(before.fen(), explicitResource)
      ? [{ uci: explicitResource, check: false, capture: false, promotion: false }] : [] }
    : context.verifiedState.opponentForcingState;
  const afterState: OpponentForcingState = explicitResource
    ? { status: "known", moves: play(new Chess(after.fen()), explicitResource)
      ? [{ uci: explicitResource, check: false, capture: false, promotion: false }] : [] }
    : forcingResourceState(after.fen());
  const resourcesBefore = beforeState.moves.map((resource) => resource.uci);
  const resourcesAfter = afterState.moves.map((resource) => resource.uci);
  const resourceStateKnown = beforeState.status === "known" && afterState.status === "known";
  const suppressed = resourcesBefore.filter((resource) => !resourcesAfter.includes(resource));
  if (!requested && suppressed.length === 0) return null;
  const resourceReal = resourceStateKnown && resourcesBefore.length > 0;
  const resourceReduced = resourceStateKnown && suppressed.length > 0 && resourcesAfter.length < resourcesBefore.length;
  const viability = !resourceStateKnown ? "unknown"
    : resourceReduced ? resourcesAfter.length === 0 ? "legal_but_neutralized" : "replaced_by_equivalent_resource"
      : resourceReal ? "legal_and_viable" : "unknown";
  const evidence = [
    board("Ressources adverses concrètes avant le coup.", resourcesBefore),
    legal("Coup candidat légal.", uci(move)),
    board("Ressources adverses encore disponibles après le coup.", resourcesAfter),
  ];
  const counterevidence: PatternEvidence[] = [];
  if (!resourceStateKnown) counterevidence.push(board("L’état forcing adverse avant/après est inconnu; aucune absence de ressource n’est inférée.", [beforeState.reason ?? "known", afterState.reason ?? "known"]));
  if (!resourceReal) counterevidence.push(board("La ressource annoncée n’est pas légalement disponible avant le coup."));
  if (resourceReal && !resourceReduced) counterevidence.push(board("La ressource annoncée reste jouable après le prétendu coup restrictif.", resourcesAfter));
  if (resourcesAfter.length > 0) counterevidence.push(board("D’autres ressources adverses subsistent.", resourcesAfter));
  const presenceScore = resourceReal && resourceReduced ? 0.64 : 0.04;
  const relevanceScore = resourceReduced && resourcesAfter.length === 0 ? 0.58 : resourceReduced ? 0.42 : 0.04;
  const priorityScore = Math.min(0.49, relevanceScore * override.priorityMultiplier);
  const presence = axis(presenceScore,
    resourceReal && resourceReduced ? "Une ressource adverse légale est effectivement supprimée." : "Aucune réduction causale de ressource n’est établie.",
    evidence, counterevidence.map((item) => item.claim));
  const relevance = axis(relevanceScore,
    resourceReduced ? "Le coup modifie l’ensemble des ressources adverses, mais leur viabilité stratégique reste à valider." : "Le coup ne peut pas être expliqué par une ressource qui reste disponible ou n’existait pas.",
    evidence, ["La viabilité d’une ressource ne se réduit pas à sa légalité."]);
  const priority = axis(priorityScore,
    "Concept expérimental sans anchor positif externe : aucune leçon automatique, même si une ressource semble supprimée.",
    counterevidence.length ? counterevidence : evidence);
  const candidate = candidateDraft({
    conceptId: "restrict_counterplay",
    subject: { move: uci(move), resource_before: resourcesBefore, resource_after: resourcesAfter, suppressed_resources: suppressed, resource_viability: viability, forcing_state_before: beforeState.status, forcing_state_after: afterState.status },
    scope: "move",
    mechanism: "remove_specific_resource",
    evidence,
    counterevidence,
    uncertainty: ["La légalité ne prouve ni la viabilité ni la centralité de la ressource.", "Aucun anchor positif externe n’est disponible.", ...(!resourceStateKnown ? ["Opponent forcing state unknown."] : [])],
    constitutiveConditionsPassed: ["legal_action", ...(resourceReal ? ["resource_before_legal"] : []), ...(resourceReduced ? ["resource_after_reduced"] : [])],
    constitutiveConditionsFailed: [...(!resourceReal ? ["resource_before_legal"] : []), ...(!resourceReduced ? ["resource_after_reduced"] : []), "resource_viability_external_validation"],
    confounders: [...override.reasons, ...(resourcesAfter.length ? ["remaining_resources"] : [])],
    affordance: { available: resourceReduced ? "unknown" : false, mechanism: "remove opponent resource", access: uci(move), target: suppressed[0] ?? explicitResource ?? null, cost: "one tempo", stability: "unknown" },
    decisionComparison: baseDecisionComparison(uci(move), "remove_specific_resource", evidence.map((item) => item.claim), [`resources ${resourcesBefore.length} -> ${resourcesAfter.length}`], resourcesAfter[0]),
    presence,
    decisionRelevance: relevance,
    pedagogicalPriority: priority,
    tacticalOverride: override,
    experimental: true,
  });
  candidate.decisionComparison.opponentResourcesPrevented = suppressed;
  candidate.decisionComparison.concessions = resourcesAfter.map((resource) => `remaining:${resource}`);
  return candidate;
}

function kingSquare(chess: Chess, color: Color): Square | undefined {
  return pieces(chess).find((piece) => piece.type === "k" && piece.color === color)?.square;
}

function activeAttackers(chess: Chess, defender: Color): Square[] {
  const king = kingSquare(chess, defender);
  const checking = king ? chess.attackers(king, opposite(defender)) : [];
  const loose = loosePieces(chess.fen(), defender)
    .filter((piece) => PIECE_VALUE[piece.type] >= 3)
    .flatMap((piece) => chess.attackers(piece.square, opposite(defender)));
  return [...new Set([...checking, ...loose])];
}

function exchangeAttackerCandidate(context: MoveContext, options: PilotDecisionOptions): PatternCandidateDraft | null {
  const { firstMove: move, before, afterFirst: after, mover, capturedPiece, tacticalOverride: override } = context;
  const requested = options.requestedConcepts?.includes("exchange_attacker") ?? false;
  if (!move.captured && !requested) return null;
  const attackersBefore = activeAttackers(before, mover);
  const attackersAfter = activeAttackers(after, mover);
  const capturedAttacker = Boolean(capturedPiece && attackersBefore.includes(move.to));
  const threatReduced = capturedAttacker && attackersAfter.length < attackersBefore.length;
  const forcedCheckEvasion = before.inCheck();
  const replaceable = attackersAfter.length > 0;
  const beforeDanger = activeAttackers(before, mover).length;
  const afterDanger = activeAttackers(after, mover).length;
  const attackerRole = forcedCheckEvasion ? "direct_king_attacker"
    : capturedAttacker && !replaceable ? "key_attacking_piece"
      : capturedAttacker && replaceable ? "supporting_or_replaceable_attacker" : "unknown";
  const evidence = [
    board("Attaquants identifiés avant la décision.", attackersBefore),
    legal("Action d’échange/capture légale.", uci(move)),
    board("Attaquants restant après la décision.", attackersAfter),
  ];
  const counterevidence: PatternEvidence[] = [];
  if (!capturedAttacker) counterevidence.push(board("La pièce capturée n’est pas identifiée comme porteuse de la menace avant le coup."));
  if (forcedCheckEvasion) counterevidence.push(tactical("La capture est une réponse forcing à l’échec, pas un choix défensif positionnel libre."));
  if (replaceable) counterevidence.push(board("Un autre attaquant ou une autre menace subsiste.", attackersAfter));
  const presenceScore = capturedAttacker ? 0.78 : 0.03;
  const relevanceScore = threatReduced ? 0.68 : capturedAttacker ? 0.42 : 0.04;
  const priorityScore = Math.min(0.49, relevanceScore * (forcedCheckEvasion ? 0.25 : override.priorityMultiplier));
  const presence = axis(presenceScore,
    capturedAttacker ? "La pièce retirée était effectivement reliée à une menace concrète." : "Une capture ne suffit pas : le rôle d’attaquant n’est pas établi.",
    evidence, counterevidence.map((item) => item.claim));
  const relevance = axis(relevanceScore,
    threatReduced ? "Le retrait diminue le nombre d’attaquants concrets." : "Le danger n’est pas suffisamment réduit ou la cible n’était pas l’attaquant central.",
    evidence, replaceable ? ["Attaque remplaçable."] : []);
  const priority = axis(priorityScore,
    "Concept expérimental : une réponse forcing ou une simple capture reste une frontière, jamais une leçon automatique.",
    counterevidence.length ? counterevidence : evidence);
  return candidateDraft({
    conceptId: "exchange_attacker",
    subject: { move: uci(move), attacker_before: attackersBefore, captured_square: move.to, remaining_attackers: attackersAfter, forced_check_evasion: forcedCheckEvasion, attacker_role: attackerRole, replaceable, danger_before: beforeDanger, danger_after: afterDanger },
    scope: "move",
    mechanism: forcedCheckEvasion ? "forced_attacker_removal" : "remove_active_attacker",
    evidence,
    counterevidence,
    uncertainty: ["L’importance relative des attaquants et la sécurité après la suite critique nécessitent validation."],
    constitutiveConditionsPassed: ["legal_action", ...(capturedAttacker ? ["attacker_before", "exchange_action"] : []), ...(threatReduced ? ["danger_reduced"] : [])],
    constitutiveConditionsFailed: [...(!capturedAttacker ? ["attacker_before"] : []), ...(!threatReduced ? ["danger_reduced"] : []), "external_positive_anchor"],
    confounders: [...override.reasons, ...(forcedCheckEvasion ? ["forced_check_evasion"] : []), ...(replaceable ? ["remaining_attackers"] : [])],
    affordance: { available: threatReduced ? "unknown" : false, mechanism: "remove active attacker", access: uci(move), target: capturedAttacker ? move.to : null, cost: capturedPiece ? `exchange against ${capturedPiece.type}` : "unknown", stability: "unknown" },
    decisionComparison: baseDecisionComparison(uci(move), forcedCheckEvasion ? "forced_attacker_removal" : "remove_active_attacker", evidence.map((item) => item.claim), [`attackers ${attackersBefore.length} -> ${attackersAfter.length}`], forcingResourceState(after.fen()).moves[0]?.uci),
    presence,
    decisionRelevance: relevance,
    pedagogicalPriority: priority,
    tacticalOverride: override,
    experimental: true,
  });
}

function rawCandidates(fen: string, moveUci: string, options: PilotDecisionOptions): PatternCandidateDraft[] {
  const context = replayContext(fen, moveUci, options);
  if (!context) return [];
  const requested = options.requestedConcepts?.length ? new Set(options.requestedConcepts) : null;
  const candidates = [
    !requested || requested.has("open_file") ? openFileCandidate(context) : null,
    !requested || requested.has("outpost") ? outpostCandidate(context) : null,
    !requested || requested.has("improve_worst_piece") ? improveWorstPieceCandidate(context) : null,
    !requested || requested.has("opposition") ? oppositionCandidate(context, options) : null,
    !requested || requested.has("restrict_counterplay") ? restrictCounterplayCandidate(context, options) : null,
    !requested || requested.has("exchange_attacker") ? exchangeAttackerCandidate(context, options) : null,
  ].filter((candidate): candidate is PatternCandidateDraft => Boolean(candidate));
  return candidates;
}

function plausibleAlternatives(
  fen: string,
  playedMove: string,
  concept: PilotRuntimeConcept,
  comparisonMoveUcis?: string[],
): PatternDecisionCandidate[] {
  const chess = new Chess(fen);
  const alternatives: PatternDecisionCandidate[] = [];
  const requested = comparisonMoveUcis ? new Set(comparisonMoveUcis) : null;
  if (requested?.size === 0) return [];
  const mover = chess.turn();
  const beforeVulnerabilities = vulnerabilities(chess, mover).filter((item) => item.effectiveDefenders.length === 0);
  for (const move of chess.moves({ verbose: true })) {
    const moveUci = uci(move);
    if (moveUci === playedMove) continue;
    if (requested && !requested.has(moveUci)) continue;
    const sameConcept = rawCandidates(fen, moveUci, { requestedConcepts: [concept], compareDecisions: false })[0];
    const after = new Chess(fen);
    const played = play(after, moveUci);
    if (!played) continue;
    const critical = forcingResourceState(after.fen());
    const movingVulnerablePiece = beforeVulnerabilities.some((item) => item.square === move.from);
    const materialGain = move.captured ? PIECE_VALUE[move.captured] - PIECE_VALUE[move.piece] : 0;
    const givesMate = after.inCheck() && after.moves().length === 0;
    const tacticallyNecessary = chess.inCheck() || movingVulnerablePiece || givesMate || materialGain >= 2;
    const forcing = Boolean(move.captured || move.promotion || after.inCheck());
    const activityGain = ["n", "b", "r", "k"].includes(played.piece)
      ? pieceActivity(after, played.to) - pieceActivity(chess, played.from) : 0;
    const sameMechanism = Boolean(sameConcept && sameConcept.presence.score >= 0.62 && sameConcept.decisionRelevance.score >= 0.5);
    const natural = activityGain >= 2;
    if (!sameMechanism && !forcing && !natural && !tacticallyNecessary) continue;
    const role: PatternDecisionCandidate["role"] = tacticallyNecessary ? "tactically_necessary"
      : sameMechanism ? "same_mechanism" : forcing ? "forcing" : "natural_competing_plan";
    const humanRelevanceScore = clamp(
      tacticallyNecessary ? 0.98
        : sameMechanism ? 0.78 + (sameConcept?.decisionRelevance.score ?? 0) * 0.15
          : forcing ? 0.7 + Math.max(0, materialGain) * 0.05 : 0.52 + Math.min(0.2, activityGain * 0.025),
    );
    const boardFacts = sameConcept?.evidence.map((item) => item.claim)
      ?? [forcing ? "Coup forcing légal." : "Coup calme qui augmente l’activité géométrique."];
    alternatives.push({
      moveUci,
      role,
      whyHumanPlausible: tacticallyNecessary ? "Répond à une contrainte tactique immédiate."
        : sameMechanism ? "Réalise le même mécanisme par une autre route."
          : forcing ? "Échec, capture ou promotion naturellement examiné en priorité." : "Plan calme concurrent avec gain d’activité.",
      mechanismRealized: sameConcept ? [sameConcept.mechanism] : [forcing ? "forcing_move" : "natural_activity_plan"],
      evidence: boardFacts,
      relevantBoardFacts: boardFacts,
      stateChange: sameConcept?.decisionComparison.stateChange
        ?? [move.captured ? `captures ${move.captured}` : after.inCheck() ? "check delivered" : `${played.from}-${played.to}`],
      concessions: movingVulnerablePiece ? [] : beforeVulnerabilities.map((item) => `unresolved:${item.square}`),
      tacticalStatus: tacticallyNecessary ? "necessary" : forcing ? "forcing" : "quiet",
      criticalReply: critical.moves[0]?.uci,
      robustness: sameConcept?.decisionComparison.robustness ?? (critical.status === "known" ? "reply_dependent" : "unchecked"),
      uncertainty: critical.status === "unknown" ? [critical.reason ?? "critical_reply_unknown"] : [],
      humanRelevanceScore,
    });
  }
  return alternatives
    .toSorted((first, second) => second.humanRelevanceScore - first.humanRelevanceScore || first.moveUci.localeCompare(second.moveUci))
    .slice(0, 6);
}

/** Hierarchical pilot API. It never imports reference data, source IDs, player
 * metadata or family labels. Stockfish may later validate candidates, but does
 * not create any concept hypothesis here. */
export function analyzePilotDecision(
  fen: string,
  moveUci: string,
  options: PilotDecisionOptions = {},
): PatternDetectionCandidate[] {
  const drafts = rawCandidates(fen, moveUci, options);
  return drafts.map((candidate) => {
    const alternatives = options.compareDecisions === false
      ? [] : plausibleAlternatives(fen, moveUci, candidate.conceptId, options.comparisonMoveUcis);
    return finishCandidate(candidate, alternatives);
  });
}

/** Score used only by the legacy flat API. It promotes a lesson when presence,
 * decision relevance and pedagogical priority all survive the hierarchy. */
export function pilotPromotionScore(candidate: PatternDetectionCandidate): number {
  if (candidate.experimental || candidate.trainingCandidate !== "yes") return 0;
  return Math.min(candidate.presence.score, candidate.decisionRelevance.score, candidate.pedagogicalPriority.score, candidate.confidence);
}

export function pilotCandidatesForPosition(
  fen: string,
  minPromotionScore = 0.62,
): Array<PatternDetectionCandidate & { moveUci: string }> {
  const chess = new Chess(fen);
  const draftBest = new Map<PilotRuntimeConcept, { draft: PatternCandidateDraft; moveUci: string; provisionalScore: number }>();
  for (const move of chess.moves({ verbose: true })) {
    const moveUci = uci(move);
    for (const draft of rawCandidates(fen, moveUci, {})) {
      const provisionalScore = Math.min(draft.presence.score, draft.decisionRelevance.score, draft.pedagogicalPriority.score);
      if (provisionalScore < minPromotionScore) continue;
      const previous = draftBest.get(draft.conceptId);
      if (!previous || provisionalScore > previous.provisionalScore) {
        draftBest.set(draft.conceptId, { draft, moveUci, provisionalScore });
      }
    }
  }
  const best = new Map<PilotRuntimeConcept, PatternDetectionCandidate & { moveUci: string }>();
  for (const { draft, moveUci } of draftBest.values()) {
    const alternatives = plausibleAlternatives(fen, moveUci, draft.conceptId);
    const candidate = finishCandidate(draft, alternatives);
    const score = pilotPromotionScore(candidate);
    if (score >= minPromotionScore) best.set(candidate.conceptId, { ...candidate, moveUci });
  }
  return [...best.values()].toSorted((a, b) => pilotPromotionScore(b) - pilotPromotionScore(a) || a.moveUci.localeCompare(b.moveUci));
}
