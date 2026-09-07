import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { StructuredExerciseExplanation, TrainingExercise } from "../chess/types";
import { causalFeatures, causalLineFeatures, causalPlanFeatures, CONCEPT_SPECIFICATIONS } from "../patterns/concept-specifications";

const PIECES: Record<PieceSymbol, string> = {
  p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame", k: "roi",
};

const CONCEPTS: Record<string, string> = {
  open_file: "utiliser une colonne ouverte", outpost: "installer une pièce sur un avant-poste",
  weak_square: "exploiter une case faible", improve_worst_piece: "améliorer la pièce la moins active",
  piece_activity: "augmenter l’activité des pièces", weak_pawn: "fixer puis attaquer un pion faible",
  pawn_break: "préparer une rupture de pion", pawn_structure: "transformer favorablement la structure",
  favorable_exchange: "choisir un échange qui améliore la position", rook_activity: "activer la tour",
  rook_behind_pawn: "placer la tour derrière le pion passé", rook_endgame: "appliquer une méthode de finale de tours",
  opposition: "prendre l’opposition", rule_of_square: "appliquer la règle du carré",
  passed_pawn: "faire progresser le pion passé", king_activity: "activer le roi vers une cible",
  king_and_pawn: "gagner les cases clés de la finale de pions", bishop_endgame: "activer le fou en finale",
  knight_endgame: "centraliser le cavalier en finale", convert_small_advantage: "convertir un petit avantage",
  simplify_when_ahead: "simplifier sans rendre l’avantage", restrict_counterplay: "limiter le contre-jeu",
  use_material_advantage: "faire agir le matériel supplémentaire", favorable_endgame_transition: "transposer dans une finale favorable",
  preserve_activity: "conserver l’activité pendant la conversion", create_second_weakness: "créer une deuxième faiblesse",
  avoid_forcing_too_soon: "améliorer avant de forcer", active_defense: "défendre activement",
  defensive_resource: "trouver une ressource défensive", exchange_attacker: "échanger l’attaquant principal",
  defensive_counterplay: "créer du contre-jeu", simplification_to_hold: "simplifier vers une position tenable",
  defensive_endgame_activity: "activer les pièces pour tenir", return_material: "rendre du matériel pour neutraliser l’attaque",
};

const SIGNAL_COPY: Record<string, (from: string, to: string, targets: string[]) => string> = {
  useful_file: (_from, to, targets) => `La tour occupe maintenant la colonne ${to[0]}${targets.length ? ` et dispose des cases d’entrée ${targets.join(", ")}` : " avec une ligne d’action concrète"}.`,
  useful_outpost: (_from, to, targets) => `La pièce est installée en ${to}, une case stable soutenue par un pion${targets.length ? `, d’où elle vise ${targets.join(", ")}` : ""}.`,
  usable_weak_square: (_from, to, targets) => `La case ${to} devient un point d’appui utilisable${targets.length ? ` contre ${targets.join(", ")}` : ""}.`,
  worst_piece_activated: (from, to, targets) => `La pièce jusque-là passive quitte ${from} et obtient en ${to} un rôle concret${targets.length ? ` contre ${targets.join(", ")}` : " sur une ligne d’entrée"}.`,
  useful_activity_gain: (from, to, targets) => `Le déplacement ${from}–${to} augmente l’activité vers ${targets.length ? targets.join(", ") : "le camp adverse"}.`,
  new_weak_pawn_pressure: (_from, to, targets) => `Depuis ${to}, la pièce attaque désormais le pion faible ${targets[0] ?? "ciblé"}.`,
  pawn_contact_created: (from, to, targets) => `La poussée ${from}–${to} crée un contact immédiat avec ${targets.length ? targets.join(", ") : "la chaîne de pions adverse"}.`,
  pawn_structure_changed: (from, to) => `La poussée ${from}–${to} modifie réellement la structure et les lignes disponibles.`,
  useful_exchange: (_from, to) => `L’échange en ${to} retire une pièce adverse active sans abandonner l’objectif de la position.`,
  rook_activated: (from, to, targets) => `La tour passe de ${from} à ${to} et gagne une activité concrète${targets.length ? ` vers ${targets.join(", ")}` : ""}.`,
  rook_newly_behind_passer: (_from, to, targets) => `La tour arrive en ${to}, derrière le pion passé ${targets[0] ?? "concerné"}, pour le soutenir ou le bloquer.`,
  rook_method: (from, to) => `Le coup ${from}–${to} atteint la disposition technique recherchée en finale de tours.`,
  opposition_acquired: (_from, to) => `Le roi atteint ${to} et donne le trait à l’adversaire avec une case d’écart : l’opposition est obtenue.`,
  pawn_square_changed: (_from, to) => `En allant en ${to}, le roi entre dans le carré du pion avant qu’il ne puisse promouvoir.`,
  passer_progress: (from, to) => `Le pion passé avance de ${from} à ${to} dans de bonnes conditions, soutenu ou hors du carré du roi adverse.`,
  king_approaches_target: (from, to, targets) => `Le roi se rapproche de ${targets[0] ?? "la faiblesse"} par ${from}–${to} au lieu de rester passif.`,
  pawn_method: (from, to) => `Le coup ${from}–${to} obtient une case clé liée à la course des pions.`,
  bishop_activated: (from, to, targets) => `Le fou gagne une diagonale utile de ${from} à ${to}${targets.length ? ` vers ${targets.join(", ")}` : ""}.`,
  knight_activated: (from, to, targets) => `Le cavalier se centralise en ${to}${targets.length ? ` et vise ${targets.join(", ")}` : ""}.`,
  threat_reduced: (from, to) => `Après ${from}–${to}, la menace adverse détectée n’est plus disponible dans la même forme.`,
  attacker_removed: (_from, to) => `La pièce qui portait la menace est éliminée en ${to}.`,
  active_threat_answer: (from, to) => `${from}–${to} répond à la menace tout en créant une activité qui impose une décision à l’adversaire.`,
  forcing_threat_answer: (from, to) => `${from}–${to} neutralise l’urgence en créant une menace directe.`,
  saving_exchange: (_from, to) => `L’échange en ${to} réduit l’attaque et conduit à une position objectivement plus tenable.`,
  material_return: (from, to) => `Le matériel rendu par ${from}–${to} supprime une ressource offensive plus dangereuse que sa valeur nominale.`,
  defensive_activity: (from, to) => `La défense devient active après ${from}–${to} : la pièce défend et agit en même temps.`,
  endgame_transition: (from, to) => `Après ${from}–${to}, le matériel restant correspond à une finale où l’avantage est plus facile à contrôler.`,
  material_advantage_used: (from, to) => `La pièce supplémentaire participe enfin au jeu après ${from}–${to}.`,
  advantage_transformed: (from, to) => `${from}–${to} transforme l’avantage existant en un bénéfice durable et observable.`,
};

function moveInfo(fen: string, uci: string): { label: string; piece: string; from: string; to: string; capture: boolean; check: boolean } | null {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const piece = chess.get(from);
    if (!piece) return null;
    const move = chess.move({ from, to, promotion: uci[4] || "q" });
    return { label: `${move.san} (${from}–${to})`, piece: PIECES[piece.type], from, to, capture: Boolean(move.captured), check: move.san.includes("+") };
  } catch { return null; }
}

function afterMoveFen(fen: string, uci: string): string | null {
  try { const chess = new Chess(fen); chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" }); return chess.fen(); } catch { return null; }
}

function primarySignal(exercise: TrainingExercise): { signal?: string; from: string; to: string; targets: string[] } {
  const domain = exercise.domain ?? exercise.category;
  const feature = domain === "strategy"
    ? causalPlanFeatures(exercise.fen, exercise.solutionLine ?? [exercise.bestMove], exercise.conceptSlug)
    : domain === "defense"
      ? causalLineFeatures(exercise.fen, exercise.solutionLine ?? [exercise.bestMove])
    : causalFeatures(exercise.fen, exercise.bestMove);
  const required = CONCEPT_SPECIFICATIONS[exercise.conceptSlug]?.necessary_signals ?? [];
  const signal = feature?.signals.find((candidate) => SIGNAL_COPY[candidate] && required.includes(candidate))
    ?? feature?.signals.find((candidate) => SIGNAL_COPY[candidate]);
  if (signal) {
    try {
      const chess = new Chess(exercise.fen);
      for (const [index, uci] of (exercise.solutionLine ?? [exercise.bestMove]).entries()) {
        const decision = index % 2 === 0 ? causalFeatures(chess.fen(), uci) : null;
        if (decision?.signals.includes(signal)) return {
          signal, from: decision.from, to: decision.to, targets: decision.targetSquares,
        };
        chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || "q" });
      }
    } catch { /* The sequence gate reports an invalid reference separately. */ }
  }
  const preparatoryFinish = feature?.signals.includes("preparatory_maneuver") ? exercise.solutionLine?.[2] : undefined;
  return {
    signal,
    from: preparatoryFinish?.slice(0, 2) ?? feature?.from ?? exercise.bestMove.slice(0, 2),
    to: preparatoryFinish?.slice(2, 4) ?? feature?.to ?? exercise.bestMove.slice(2, 4),
    targets: feature?.targetSquares ?? [],
  };
}

function opponentResource(exercise: TrainingExercise): string | undefined {
  const reply = exercise.solutionLine?.[1];
  const after = afterMoveFen(exercise.fen, exercise.bestMove);
  if (!reply || !after) return undefined;
  const info = moveInfo(after, reply);
  if (!info) return undefined;
  const effect = info.check ? "donne échec et force une réponse" : info.capture ? "échange ou récupère du matériel" : `repositionne le ${info.piece} vers ${info.to}`;
  return `La meilleure résistance est ${info.label} : elle ${effect}. Le plan choisi doit rester valable après cette réponse précise.`;
}

function immediateProblem(exercise: TrainingExercise, chosen: NonNullable<ReturnType<typeof moveInfo>>,
  detected: ReturnType<typeof primarySignal>, legacy: StructuredExerciseExplanation): string {
  const chess = new Chess(exercise.fen);
  const color = chess.turn();
  const threatened = chess.board().flatMap((row) => row).filter((piece) => piece && piece.color === color && piece.type !== "k"
    && chess.attackers(piece.square, color === "w" ? "b" : "w").length > 0
    && chess.attackers(piece.square, color).length === 0).map((piece) => piece!.square);
  const article = chosen.piece === "tour" || chosen.piece === "dame" ? "La" : "Le";
  const pronoun = article === "La" ? "elle" : "il";
  switch (exercise.conceptSlug) {
    case "open_file": return `La tour en ${chosen.from} n’exploite pas encore la colonne ${chosen.to[0]}, où ${detected.targets.length ? `les entrées ${detected.targets.join(", ")} deviennent accessibles` : `la case ${chosen.to} lui donne une ligne utile`}.`;
    case "outpost": return `Le cavalier peut atteindre ${chosen.to}, une case soutenue qu’aucun pion adverse ne peut chasser et qui vise ${detected.targets.join(", ") || "le camp adverse"}.`;
    case "weak_square": return `La case ${chosen.to} ne peut pas être contestée par un pion adverse et donne accès à ${detected.targets.join(", ") || "une cible concrète"}.`;
    case "improve_worst_piece": return `${article} ${chosen.piece} en ${chosen.from} est la pièce la moins active ; la route vers ${detected.to} lui donne un rôle contre ${detected.targets.join(", ") || "une case d’entrée"}.`;
    case "piece_activity": return `${article} ${chosen.piece} en ${chosen.from} manque de cible ; depuis ${chosen.to}, ${pronoun} agit sur ${detected.targets.join(", ") || "une case d’entrée"}.`;
    case "weak_pawn": return `Le pion adverse ${detected.targets[0] ?? "isolé"} est une faiblesse atteignable que le ${chosen.piece} peut fixer et attaquer.`;
    case "pawn_break": return `La structure est encore fermée autour de ${chosen.to} ; la poussée ${chosen.from}–${chosen.to} crée le contact avec ${detected.targets.join(", ") || "la chaîne adverse"}.`;
    case "favorable_exchange": return `La pièce adverse en ${chosen.to} remplit un rôle plus actif ; l’échange proposé retire précisément cette pièce.`;
    case "restrict_counterplay": return threatened.length
      ? `L’adversaire exerce un contre-jeu immédiat contre ${threatened.join(", ")} ; progresser sans le neutraliser rendrait l’initiative.`
      : `L’avantage existe, mais la réponse adverse de la ligne vérifiée crée la ressource prioritaire à contrôler avant de progresser.`;
    case "active_defense": case "defensive_resource": case "exchange_attacker": case "defensive_counterplay":
    case "simplification_to_hold": case "defensive_endgame_activity": case "return_material":
      return chess.inCheck() ? `Le roi est en échec : la défense doit répondre à cette menace sans rester passive.`
        : threatened.length ? `La menace adverse vise ${threatened.join(", ")} ; une défense seulement passive ne résout pas le problème.`
          : `La position exige une ressource active qui modifie la menace adverse, pas simplement le coup qui retarde la perte.`;
    case "opposition": return `Dans cette finale de pions, le roi doit atteindre ${chosen.to} avec le bon trait pour empêcher le roi adverse de bloquer le pion.`;
    case "rule_of_square": return `Le pion adverse menace de promouvoir ; le roi doit choisir immédiatement une route qui entre dans son carré.`;
    case "rook_behind_pawn": return `Le pion passé a besoin d’un soutien ou d’un blocage par l’arrière ; la tour en ${chosen.from} n’occupe pas encore cette ligne.`;
    case "rook_activity": case "rook_endgame": return `La tour en ${chosen.from} est trop passive ; ${chosen.to} lui permet d’agir sur ${detected.targets.join(", ") || "le pion et le roi adverses"}.`;
    case "convert_small_advantage": case "simplify_when_ahead": case "use_material_advantage":
    case "favorable_endgame_transition": case "preserve_activity": case "create_second_weakness": case "avoid_forcing_too_soon":
      return `Ton avantage ne progressera que si tu conserves l’activité et contrôles d’abord la ressource adverse.`;
    default: return legacy.positionEssentials ?? legacy.notice;
  }
}

function humanDifficulty(exercise: TrainingExercise, plans: number): Pick<StructuredExerciseExplanation, "humanDifficulty" | "difficultyReasons"> {
  const reasons: string[] = [];
  if (plans >= 3) reasons.push(`${plans} plans humains plausibles doivent être comparés`);
  if ((exercise.solutionLine?.length ?? 0) >= 3) reasons.push("la première décision doit résister à la réponse adverse");
  if (exercise.pedagogicalUnit === "theoretical_method") reasons.push("une méthode technique doit être reconnue puis exécutée");
  if (exercise.bestMove.length > 4) reasons.push("la promotion impose un choix précis");
  const rating = exercise.difficulty ?? 1300;
  const humanDifficulty = rating <= 950 ? "easy" : rating <= 1500 ? "appropriate" : rating <= 1850 ? "challenging_but_useful" : "advanced";
  return { humanDifficulty, difficultyReasons: reasons.length ? reasons : ["la position demande d’identifier le bon mécanisme, sans calcul artificiellement long"] };
}

function milestoneCopy(exercise: TrainingExercise, stateChange: string): string {
  const milestone = exercise.pedagogicalMilestone;
  if (!milestone) return stateChange;
  const labels: Record<string, string> = {
    promotion: "le pion promeut", pawn_race_resolved: "la course de pions est tranchée",
    pawn_square_secured: "le roi contrôle le carré du pion", opposition: "l’opposition est obtenue",
    rook_behind_passer: "la tour est placée derrière le pion passé", concept_state: stateChange,
    theoretical_position: "la position théorique de référence est atteinte",
  };
  return `Étape validée lorsque ${labels[milestone.kind] ?? stateChange.toLowerCase()}.`;
}

function normalizeSource(exercise: TrainingExercise): StructuredExerciseExplanation["evidence"] {
  if (exercise.tablebaseWdl || exercise.verification?.tablebase) return { source: "tablebase", detail: "Résultat et méthode vérifiés par tablebase." };
  if (exercise.source === "lichess" || exercise.source === "lichess_standard" || exercise.source === "lichess_broadcast") return { source: "lichess", detail: "Position réelle vérifiée, complétée par le détecteur causal ChessPath." };
  if (exercise.verification?.engine || exercise.engineCandidates?.length) return { source: "stockfish", detail: "Coup et alternatives comparés par Stockfish ; le concept vient du détecteur causal." };
  return { source: "causal_detector", detail: "Mécanisme vérifié par les caractéristiques observables de la position." };
}

/** Adds a position-first explanation to already verified non-tactical material.
 * It never labels a position: it only verbalises evidence already produced by
 * the concept detector, the decision contrast and the verified reference line. */
export function enrichCausalExplanation(exercise: TrainingExercise): TrainingExercise {
  if (["tactic", "opening"].includes(exercise.category)) return exercise;
  const legacy = exercise.explanation;
  if (!legacy) return exercise;
  const chosen = moveInfo(exercise.fen, exercise.bestMove);
  if (!chosen) return exercise;
  const detected = primarySignal(exercise);
  const stateChange = detected.signal
    ? SIGNAL_COPY[detected.signal](detected.from, detected.to, detected.targets)
    : `Après ${chosen.label}, le rôle du ${chosen.piece} change de ${chosen.from} vers ${chosen.to}.`;
  const contrast = exercise.trainingAssessment?.contrast;
  const plausible = [...new Set([exercise.bestMove, ...(contrast?.plausible ?? [])])].slice(0, 4);
  const candidatePlans = plausible.map((uci) => {
    const info = moveInfo(exercise.fen, uci);
    const feature = causalFeatures(exercise.fen, uci);
    const isChosen = uci === exercise.bestMove;
    return {
      moveUci: uci,
      label: info?.label ?? uci,
      mechanism: isChosen
        ? (CONCEPTS[exercise.conceptSlug] ?? legacy.focus)
        : feature?.signals.includes("useful_exchange") ? "chercher un échange"
          : feature?.signals.includes("useful_activity_gain") ? "chercher de l’activité"
            : feature?.capture ? "prendre du matériel" : `repositionner une pièce vers ${uci.slice(2, 4)}`,
    };
  });
  const naturalUci = contrast?.naturalMistake ?? exercise.trainingAssessment?.naturalMistake;
  const natural = naturalUci ? moveInfo(exercise.fen, naturalUci) : null;
  const acceptableMoves = [...new Set([
    exercise.bestMove,
    ...(exercise.acceptedConceptMoveUcis ?? []),
    ...(contrast?.goodMoves ?? []),
  ])].filter((uci) => legalUci(exercise.fen, uci));
  const verifiedPlanSteps = (exercise.solutionLine ?? [exercise.bestMove])
    .filter((_uci, index) => index % 2 === 0)
    .map((uci) => `${uci.slice(0, 2)}–${uci.slice(2, 4)}`);
  const explanation: StructuredExerciseExplanation = {
    ...legacy,
    problem: immediateProblem(exercise, chosen, detected, legacy),
    primaryConcept: CONCEPTS[exercise.conceptSlug] ?? legacy.focus,
    opponentResource: opponentResource(exercise),
    candidatePlans,
    chosenPlan: `${chosen.label} — ${legacy.plan}`,
    whyItWorksHere: detected.signal ? stateChange : legacy.chosenPlanRationale ?? legacy.objective,
    naturalAlternative: natural ? `${natural.label} est une alternative humaine naturelle.` : legacy.naturalAlternative,
    whyNaturalAlternativeIsInferior: natural
      ? `${natural.label} ne crée pas le changement concret recherché et laisse l’adversaire conserver sa ressource principale.`
      : legacy.whyNaturalAlternativeIsInferior,
    stateChange,
    resultingPositionChange: stateChange,
    milestone: milestoneCopy(exercise, stateChange),
    transferRule: /^((si|quand|lorsque|avant)\b)/i.test(legacy.transferRule ?? legacy.rule)
      ? (legacy.transferRule ?? legacy.rule)
      : `Quand une position présente le même mécanisme, ${legacy.rule.charAt(0).toLowerCase()}${legacy.rule.slice(1)}`,
    acceptableMoves,
    evidence: normalizeSource(exercise),
    ...humanDifficulty(exercise, candidatePlans.length),
    reasonablePlans: candidatePlans.map((candidate) => `${candidate.label} : ${candidate.mechanism}`),
    chosenPlanRationale: detected.signal ? stateChange : legacy.chosenPlanRationale ?? legacy.objective,
    opponentIdea: opponentResource(exercise) ?? legacy.opponentIdea,
    planSteps: verifiedPlanSteps,
  };
  const reply = exercise.solutionLine?.[1];
  const nextOwn = exercise.solutionLine?.[2];
  const conceptualTarget = detected.targets[0];
  const planArrows = [
    { from: chosen.from, to: chosen.to, color: "primary" as const, label: "décision" },
    ...(conceptualTarget && conceptualTarget !== chosen.to ? [{ from: chosen.to, to: conceptualTarget, color: "secondary" as const, label: "rôle obtenu" }] : []),
    ...(!conceptualTarget && nextOwn ? [{ from: nextOwn.slice(0, 2), to: nextOwn.slice(2, 4), color: "secondary" as const, label: "suite vérifiée" }] : []),
    ...(reply ? [{ from: reply.slice(0, 2), to: reply.slice(2, 4), color: "warning" as const, label: "meilleure résistance" }] : []),
  ].slice(0, 3);
  const planSquares = [...new Set([chosen.to, ...detected.targets])].slice(0, 3).map((square, index) => ({
    square, color: index === 0 ? "primary" as const : "secondary" as const,
  }));
  return {
    ...exercise,
    acceptedConceptMoveUcis: acceptableMoves,
    explanation,
    planArrows,
    planSquares,
  };
}

function legalUci(fen: string, uci: string): boolean {
  return Boolean(moveInfo(fen, uci));
}
