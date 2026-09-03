import { Chess, type Color, type Square } from "chess.js";
import type { DiagnosticCategory, PedagogicalUnit } from "../chess/types";
import { classifyPhase } from "../chess/phase";
import { CONCEPT_HOLDOUT } from "./concept-holdout";
import {
  attackedSquaresByPiece, fileStatus, isBishopEndgame, isKnightEndgame,
  isPawnEndgame, isRookEndgame, isolatedPawns, materialAdvantage,
  nonPawnMaterial, opposite, passedPawns, pieceActivity, pieces,
  rookBehindPassedPawn, squareCoordinates, worstActivePiece,
} from "./position-features";

export type ConceptSpecification = {
  domain: DiagnosticCategory;
  candidate_sources: string[];
  necessary_signals: string[];
  supporting_signals: string[];
  contextual_signals: string[];
  hard_negatives: string[];
  human_decision_criteria: string[];
  human_alternative_patterns: string[];
  meaningful_state_change: string[];
  acceptable_outcome_changes: string[];
  acceptable_outcome_states: string[];
  preferred_exercise_unit: PedagogicalUnit;
  sequence_termination_condition: string;
  transfer_rule_family: string;
  holdout_validation_examples: string[];
};

function specification(domain: DiagnosticCategory, signal: string, rule: string, negatives: string[]): ConceptSpecification {
  return {
    domain, candidate_sources: ["existing_reviewed_bank", "local_lichess_pgn"],
    necessary_signals: [signal], supporting_signals: ["safe_destination", "observable_change"],
    contextual_signals: domain === "conversion" ? ["advantage_already_exists", "opponent_resources"] : ["material_family", "legal_alternatives"],
    hard_negatives: negatives,
    human_decision_criteria: ["distinct_plausible_alternative", "causal_consequence", "transferable_change"],
    human_alternative_patterns: ["another_piece_or_target", "natural_exchange", "reasonable_check", "competing_concept"],
    meaningful_state_change: [signal],
    acceptable_outcome_changes: domain === "endgame" || domain === "defense"
      ? ["win_to_draw", "draw_to_loss"] : ["advantage_dissipated", "mechanism_missed_with_objective_cost"],
    acceptable_outcome_states: domain === "conversion" ? ["advantage_preserved"] : ["tenable", "draw", "win"],
    preferred_exercise_unit: domain === "endgame" ? "theoretical_method" : "decision_then_continuation",
    sequence_termination_condition: signal,
    transfer_rule_family: rule,
    holdout_validation_examples: [],
  };
}

/** The registry is executable: necessary signals below are checked both by the
 * game scanner and the bank gate. No FEN lookup participates in classification. */
export const CONCEPT_SPECIFICATIONS: Record<string, ConceptSpecification> = {
  open_file: specification("strategy", "useful_file", "entrée ou cible sur la colonne", ["file_without_entry", "unchanged_rook_role"]),
  outpost: specification("strategy", "useful_outpost", "case durable avec cibles", ["future_pawn_chase", "outpost_without_target"]),
  weak_square: specification("strategy", "usable_weak_square", "faiblesse réellement exploitable", ["unreachable_square", "no_new_influence"]),
  improve_worst_piece: specification("strategy", "worst_piece_activated", "donner un rôle à la pièce passive", ["already_active_piece", "cosmetic_move"]),
  piece_activity: specification("strategy", "useful_activity_gain", "activité vers cibles concrètes", ["mobility_without_purpose"]),
  weak_pawn: specification("strategy", "new_weak_pawn_pressure", "fixer et attaquer la faiblesse", ["unreachable_pawn", "already_attacked_same_way"]),
  pawn_break: specification("strategy", "pawn_contact_created", "rupture créant un contact nouveau", ["harmless_pawn_push"]),
  pawn_structure: specification("strategy", "pawn_structure_changed", "transformer la structure", ["structure_present_only"]),
  favorable_exchange: specification("strategy", "useful_exchange", "échanger une pièce pour une raison", ["automatic_recapture", "routine_queen_trade"]),
  rook_activity: specification("endgame", "rook_activated", "activité de la tour avec conséquence", ["rook_just_moves"]),
  rook_behind_pawn: specification("endgame", "rook_newly_behind_passer", "soutien ou blocage du pion passé", ["blocked_rook_ray", "already_behind"]),
  rook_endgame: specification("endgame", "rook_method", "méthode de finale de tours", ["rook_material_only"]),
  opposition: specification("endgame", "opposition_acquired", "opposition reliée à un pion", ["kings_aligned_without_pawn_goal"]),
  rule_of_square: specification("endgame", "pawn_square_changed", "entrer dans le carré à temps", ["tempo_or_double_push_ignored"]),
  passed_pawn: specification("endgame", "passer_progress", "pion passé soutenu ou hors du carré", ["passer_present_only", "unguarded_push"]),
  king_activity: specification("endgame", "king_approaches_target", "roi vers une vraie cible", ["king_to_center_only"]),
  king_and_pawn: specification("endgame", "pawn_method", "cases et courses de pions", ["pawn_material_only"]),
  bishop_endgame: specification("endgame", "bishop_activated", "diagonale utile en finale", ["bishop_just_moves"]),
  knight_endgame: specification("endgame", "knight_activated", "cavalier vers cibles en finale", ["knight_just_moves"]),
  convert_small_advantage: specification("conversion", "advantage_transformed", "transformer un avantage existant", ["equal_position", "mechanically_won"]),
  simplify_when_ahead: specification("conversion", "useful_exchange", "simplifier en supprimant une ressource", ["queen_trade_only"]),
  restrict_counterplay: specification("conversion", "threat_reduced", "supprimer une menace concrète", ["low_move_count_only"]),
  use_material_advantage: specification("conversion", "material_advantage_used", "faire agir le matériel supplémentaire", ["material_present_only", "free_piece"]),
  favorable_endgame_transition: specification("conversion", "endgame_transition", "transition avec avantage préservé", ["exchange_without_transition"]),
  preserve_activity: specification("conversion", "useful_activity_gain", "activité avant récolte", ["cosmetic_move"]),
  active_defense: specification("defense", "active_threat_answer", "activité et réponse à la menace", ["quiet_move_without_threat"]),
  defensive_resource: specification("defense", "threat_reduced", "neutraliser une menace", ["best_resistance_still_lost"]),
  exchange_attacker: specification("defense", "attacker_removed", "éliminer l’attaquant réel", ["unrelated_capture"]),
  defensive_counterplay: specification("defense", "forcing_threat_answer", "contre-jeu qui interrompt la menace", ["check_without_threat"]),
  simplification_to_hold: specification("defense", "saving_exchange", "liquidation salvatrice", ["material_drop_without_safety"]),
  defensive_endgame_activity: specification("defense", "defensive_activity", "activité utile pour tenir", ["lost_ending"]),
  return_material: specification("defense", "material_return", "rendre pour neutraliser", ["material_loss_without_resource"]),
};
// Empty means not independently covered yet, not an invented validation ID.
for (const [concept, spec] of Object.entries(CONCEPT_SPECIFICATIONS)) {
  spec.holdout_validation_examples = CONCEPT_HOLDOUT.filter((example) => example.concept === concept).map((example) => example.id);
}
// Concept-specific alternatives guide the offline comparison audit. They are
// hypotheses to test, never labels sufficient to activate a position.
const HUMAN_ALTERNATIVES: Record<string,string[]> = {
  open_file:["occupy_other_file","double_without_entry","keep_rook_defending"],
  outpost:["develop_toward_other_target","exchange_knight","occupy_chaseable_square"],
  weak_square:["attack_pawn_instead","use_another_entry","leave_weak_square_unused"],
  improve_worst_piece:["move_already_active_piece","direct_route_instead_of_maneuver","premature_pawn_action"],
  piece_activity:["defend_passively","exchange_active_piece","target_other_wing"],
  weak_pawn:["attack_other_target","premature_capture","allow_weakness_to_advance"],
  pawn_break:["prepare_instead_of_break","break_on_other_wing","close_structure"],
  pawn_structure:["recapture_with_other_pawn","preserve_tension","release_tension"],
  favorable_exchange:["maintain_tension","exchange_other_piece","retreat_passive_piece"],
  opposition:["direct_king_approach","pawn_tempo","different_king_route"],
  rule_of_square:["advance_own_pawn","wrong_king_route","king_capture_detour"],
  passed_pawn:["premature_push","king_support_first","other_pawn_race"],
  king_and_pawn:["pawn_tempo","direct_king_route","capture_instead_of_key_square"],
  king_activity:["hold_pawns","king_defends_instead_of_infiltrating","target_other_pawn"],
  rook_behind_pawn:["side_support","frontal_blockade","check_instead_of_blockade"],
  rook_activity:["passive_pawn_defense","check_from_short_distance","capture_instead_of_activity"],
  rook_endgame:["passive_pawn_defense","premature_liquidation","check_instead_of_cutoff"],
  bishop_endgame:["defend_pawn_instead_of_active_diagonal","exchange_pawns","king_route"],
  knight_endgame:["direct_knight_route","king_activation","pawn_push"],
  convert_small_advantage:["premature_forcing_action","ignore_counterplay","preserve_structure"],
  simplify_when_ahead:["keep_active_pieces","exchange_wrong_piece","capture_pawn"],
  restrict_counterplay:["pursue_own_plan","material_gain","passive_defense"],
  use_material_advantage:["collect_more_material","keep_surplus_piece_passive","premature_trade"],
  favorable_endgame_transition:["keep_middlegame","different_exchange","pawn_capture"],
  preserve_activity:["defend_pawn_passively","exchange_active_piece","advance_pawn_first"],
  active_defense:["passive_cover","exchange_attacker","countercheck"],
  defensive_resource:["natural_defense","counterattack","escape_threat"],
  exchange_attacker:["defend_target","exchange_other_piece","king_escape"],
  defensive_counterplay:["meet_threat_directly","quiet_defense","countercheck_on_other_square"],
  simplification_to_hold:["keep_material","different_exchange","passive_defense"],
  defensive_endgame_activity:["passive_defense","pawn_push","exchange_active_piece"],
  return_material:["keep_material","escape_with_piece","exchange_other_attacker"],
};
for(const [concept,patterns]of Object.entries(HUMAN_ALTERNATIVES))CONCEPT_SPECIFICATIONS[concept].human_alternative_patterns=patterns;

function distance(a: Square, b: Square): number {
  const [af, ar] = squareCoordinates(a); const [bf, br] = squareCoordinates(b);
  return Math.max(Math.abs(af - bf), Math.abs(ar - br));
}

/** Conservative permanence check, including an enemy pawn that can advance to
 * attack the square later. Current pawn attacks alone do not establish an outpost. */
function futurePawnChase(chess: Chess, square: Square, owner: Color): boolean {
  const [f, r] = squareCoordinates(square);
  return pieces(chess).some((p) => {
    const [pf, pr] = squareCoordinates(p.square);
    return p.type === "p" && p.color !== owner && Math.abs(pf - f) === 1
      && (p.color === "w" ? pr < r : pr > r);
  });
}

function safe(chess: Chess, square: Square, color: Color): boolean {
  const enemy = chess.attackers(square, opposite(color));
  return !enemy.length || (chess.attackers(square, color).length > enemy.length
    && !enemy.some((s) => chess.get(s)?.type === "p"));
}

function targets(chess: Chess, square: Square, color: Color): Square[] {
  return attackedSquaresByPiece(chess, square).filter((s) => {
    const p = chess.get(s); return p && p.color !== color;
  });
}

function usefulEntries(chess: Chess, square: Square, color: Color): Square[] {
  if (chess.get(square)?.type !== "r") return [];
  return attackedSquaresByPiece(chess, square).filter((s) => s[0] === square[0]
    && (color === "w" ? Number(s[1]) >= 6 : Number(s[1]) <= 3)
    && chess.get(s)?.color !== color && safe(chess, s, color));
}

function threats(chess: Chess, color: Color): Square[] {
  return pieces(chess).filter((p) => p.color === color && p.type !== "k"
    && chess.attackers(p.square, opposite(color)).length > 0
    && chess.attackers(p.square, color).length === 0).map((p) => p.square);
}

function opposition(chess: Chess): boolean {
  const k = pieces(chess).filter((p) => p.type === "k");
  return k.length === 2 && distance(k[0].square, k[1].square) === 2
    && (k[0].square[0] === k[1].square[0] || k[0].square[1] === k[1].square[1]);
}

export function outsidePawnSquare(chess: Chess, color: Color): boolean {
  const king = pieces(chess).find((p) => p.type === "k" && p.color !== color);
  if (!king) return false;
  return passedPawns(chess.fen(), color).some((p) => {
    const promotion = `${p.square[0]}${color === "w" ? 8 : 1}` as Square;
    let moves = Math.abs(Number(promotion[1]) - Number(p.square[1]));
    // A starting pawn may use its double step if both squares are free.
    const start = color === "w" ? 2 : 7; const dir = color === "w" ? 1 : -1;
    if (Number(p.square[1]) === start && !chess.get(`${p.square[0]}${start + dir}` as Square)
      && !chess.get(`${p.square[0]}${start + 2 * dir}` as Square)) moves -= 1;
    const defenderTempo = chess.turn() !== color ? 1 : 0;
    const clear = Array.from({ length: Math.abs(Number(promotion[1]) - Number(p.square[1])) }, (_, i) => (
      `${p.square[0]}${Number(p.square[1]) + dir * (i + 1)}` as Square
    )).every((s) => !chess.get(s));
    return clear && distance(king.square, promotion) > moves + defenderTempo;
  });
}

export type CausalFeatures = {
  signals: string[]; targetSquares: string[]; from: string; to: string;
  activityGain: number; legalChoices: number; capture: boolean; queenTrade: boolean;
  freeCapture: boolean; phase: string; pieceCount: number;
};

/** One position + one legal decision, shared by mining, training and diagnosis. */
export function causalFeatures(fen: string, uci: string): CausalFeatures | null {
  const before = new Chess(fen); const after = new Chess(fen); const color = before.turn();
  let move; try { move = after.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); } catch { return null; }
  const signals = new Set<string>(); const add = (signal: string, yes: boolean) => { if (yes) signals.add(signal); };
  const oldTargets = targets(before, move.from, color); const newTargets = targets(after, move.to, color).filter((s) => !oldTargets.includes(s));
  const oldEntries = usefulEntries(before, move.from, color); const entries = usefulEntries(after, move.to, color);
  const newEntries = entries.filter((s) => !oldEntries.includes(s));
  const activityGain = pieceActivity(after, move.to) - pieceActivity(before, move.from);
  const quiet = !move.captured && !move.promotion && !after.inCheck();
  const safeDestination = safe(after, move.to, color);
  const usefulGain = activityGain >= 5 && (newTargets.length > 0 || newEntries.length > 0);
  const originalThreats = threats(before, color); const remainingThreats = threats(after, color);
  const checkingPieces = pieces(before).filter((p) => p.color !== color && p.type !== "k"
    && (originalThreats.some((s) => attackedSquaresByPiece(before, p.square).includes(s))
      || (before.inCheck() && attackedSquaresByPiece(before, p.square).some((s) => before.get(s)?.type === "k" && before.get(s)?.color === color))));
  const threatReduced = (before.inCheck() || originalThreats.length > 0) && remainingThreats.length < Math.max(1, originalThreats.length);
  add("safe_destination", safeDestination);
  const status = fileStatus(after.fen(), move.to[0]);
  add("useful_file", move.piece === "r" && quiet && safeDestination
    && ["open", color === "w" ? "white-semi-open" : "black-semi-open"].includes(status)
    && (newEntries.length > 0 || newTargets.some((s) => s[0] === move.to[0])));
  const advanced = color === "w" ? Number(move.to[1]) >= 5 : Number(move.to[1]) <= 4;
  const stableSquare = advanced && !futurePawnChase(after, move.to, color) && safeDestination && newTargets.length > 0;
  add("useful_outpost", move.piece === "n" && quiet && stableSquare && after.attackers(move.to, color).some((s) => after.get(s)?.type === "p"));
  add("usable_weak_square", ["n", "b"].includes(move.piece) && quiet && stableSquare && activityGain >= 2);
  add("useful_activity_gain", ["n", "b", "r"].includes(move.piece) && quiet && safeDestination && usefulGain);
  add("worst_piece_activated", signals.has("useful_activity_gain") && worstActivePiece(before, color) === move.from && pieceActivity(before, move.from) <= 16);
  add("new_weak_pawn_pressure", quiet && safeDestination && isolatedPawns(after.fen(), opposite(color)).some((p) => newTargets.includes(p.square)));
  const newPawnContacts = newTargets.filter((s) => after.get(s)?.type === "p");
  add("pawn_contact_created", move.piece === "p" && quiet && newPawnContacts.length > 0);
  add("pawn_structure_changed", signals.has("pawn_contact_created") && passedPawns(after.fen(), color).length !== passedPawns(before.fen(), color).length);
  const queenTrade = move.piece === "q" && move.captured === "q";
  const removedActivePiece = Boolean(move.captured && checkingPieces.some((p) => p.square === move.to));
  // Exchanges are not automatically tactical. Removing an active minor piece
  // with our less active minor piece is observable even after an equal recapture.
  const capturedPiece = before.get(move.to);
  const roleExchange = Boolean(capturedPiece && ["n", "b"].includes(move.piece)
    && ["n", "b"].includes(capturedPiece.type)
    && pieceActivity(before, move.to) - pieceActivity(before, move.from) >= 5
    && before.attackers(move.to, opposite(color)).length > 0);
  add("useful_exchange", Boolean(move.captured) && (removedActivePiece || roleExchange)
    && (!queenTrade || threatReduced));
  add("attacker_removed", removedActivePiece);
  add("threat_reduced", threatReduced);
  add("active_threat_answer", threatReduced && (usefulGain || after.inCheck()));
  add("forcing_threat_answer", (before.inCheck() || originalThreats.length > 0) && after.inCheck());
  add("saving_exchange", removedActivePiece && nonPawnMaterial(after.fen()) < nonPawnMaterial(fen));
  add("material_return", threatReduced && materialAdvantage(after.fen(), color) < materialAdvantage(fen, color));
  const ending = classifyPhase(fen, Number(fen.split(" ")[5]) * 2) === "endgame";
  add("rook_activated", ending && move.piece === "r" && quiet && safeDestination && usefulGain);
  const behind = move.piece === "r" ? rookBehindPassedPawn(after.fen(), move.to) : null;
  add("rook_newly_behind_passer", ending && !!behind && !rookBehindPassedPawn(fen, move.from)
    && attackedSquaresByPiece(after, move.to).includes(behind.square) && safeDestination);
  add("rook_method", isRookEndgame(fen) && (signals.has("rook_activated") || signals.has("rook_newly_behind_passer")));
  add("opposition_acquired", isPawnEndgame(fen) && move.piece === "k" && !opposition(before) && opposition(after)
    && passedPawns(after.fen(), color).some((p) => distance(p.square, move.to) <= 3));
  add("pawn_square_changed", isPawnEndgame(fen) && move.piece === "k"
    && outsidePawnSquare(before, opposite(color)) && !outsidePawnSquare(after, opposite(color)));
  add("passer_progress", ending && move.piece === "p" && quiet && advanced && safeDestination
    && passedPawns(after.fen(), color).some((p) => p.square === move.to)
    && (outsidePawnSquare(after, color) || after.attackers(move.to, color).length > 0));
  const pawnTargets = pieces(before).filter((p) => p.type === "p" && p.color !== color);
  add("king_approaches_target", ending && move.piece === "k" && quiet && pawnTargets.some((p) => (
    distance(move.to, p.square) < distance(move.from, p.square) && distance(move.to, p.square) <= 2
  )));
  add("pawn_method", isPawnEndgame(fen) && ["opposition_acquired", "pawn_square_changed", "passer_progress", "king_approaches_target"].some((s) => signals.has(s)));
  add("bishop_activated", isBishopEndgame(fen) && move.piece === "b" && signals.has("useful_activity_gain"));
  add("knight_activated", isKnightEndgame(fen) && move.piece === "n" && signals.has("useful_activity_gain"));
  add("defensive_activity", ending && threatReduced && usefulGain);
  add("endgame_transition", !ending && classifyPhase(after.fen(), Number(fen.split(" ")[5]) * 2 + 1) === "endgame" && !queenTrade);
  add("material_advantage_used", materialAdvantage(fen, color) >= 100 && (usefulGain || removedActivePiece));
  add("advantage_transformed", ["useful_activity_gain", "useful_exchange", "threat_reduced", "endgame_transition", "pawn_contact_created"].some((s) => signals.has(s)));
  const freeCapture = Boolean(move.captured && before.attackers(move.to, opposite(color)).length === 0);
  return { signals: [...signals], targetSquares: [...new Set([...newTargets, ...newEntries])], from: move.from, to: move.to,
    activityGain, legalChoices: before.moves().length, capture: Boolean(move.captured), queenTrade, freeCapture,
    phase: ending ? "endgame" : classifyPhase(fen, Number(fen.split(" ")[5]) * 2), pieceCount: pieces(before).length };
}

export function matchesConceptSpecification(concept: string, features: CausalFeatures): boolean {
  const spec = CONCEPT_SPECIFICATIONS[concept];
  return !spec || spec.necessary_signals.every((s) => features.signals.includes(s));
}

/** Narrow preparatory maneuver: the SAME safe piece moves twice and the second
 * decision establishes the concept. The compiler separately verifies the reply
 * and both decisions. This is not permission to label an arbitrary engine PV. */
export function causalPlanFeatures(fen: string, line: string[], concept: string): CausalFeatures | null {
  const root = causalFeatures(fen, line[0] ?? "");
  if (!root || matchesConceptSpecification(concept, root) || line.length < 3) return root;
  if (root.capture || !root.signals.includes("safe_destination") || line[2].slice(0,2) !== root.to) return root;
  try {
    const chess = new Chess(fen);
    for (const uci of line.slice(0,2)) chess.move({from:uci.slice(0,2) as Square,to:uci.slice(2,4) as Square,promotion:uci[4]||"q"});
    const next = causalFeatures(chess.fen(),line[2]);
    if (!next || !matchesConceptSpecification(concept,next) || next.to === root.from) return root;
    return {...root,signals:[...new Set([...root.signals,...next.signals,"preparatory_maneuver"])],targetSquares:next.targetSquares};
  } catch { return root; }
}

/** A verified tactical defense may realize its mechanism on the second own
 * move (for example returning material before exchanging the attacker). */
export function causalLineFeatures(fen: string, line: string[]): CausalFeatures | null {
  const root = causalFeatures(fen, line[0] ?? ""); if (!root) return null;
  const chess = new Chess(fen); const color = chess.turn(); const material = materialAdvantage(fen, color);
  const signals = new Set(root.signals);
  for (const [index, uci] of line.slice(0, 5).entries()) {
    if (index % 2 === 0) for (const signal of causalFeatures(chess.fen(), uci)?.signals ?? []) signals.add(signal);
    try { chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); } catch { break; }
    if (index === 1 && materialAdvantage(chess.fen(), color) < material) signals.add("material_return");
  }
  return { ...root, signals: [...signals] };
}
