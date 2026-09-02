import { Chess, type PieceSymbol, type Square } from "chess.js";
import type {
  PlanArrow,
  PlanSquare,
  StructuredExerciseExplanation,
} from "../chess/types";
import type { ConceptSlug } from "../knowledge/concepts";
import {
  attackedSquaresByPiece,
  isolatedPawns,
  loosePieces,
  opposite,
  PIECE_VALUE,
} from "../patterns/position-features";

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pion",
  n: "cavalier",
  b: "fou",
  r: "tour",
  q: "dame",
  k: "roi",
};

type TeachingPayload = {
  explanation: StructuredExerciseExplanation;
  planArrows: PlanArrow[];
  planSquares: PlanSquare[];
};

function genericTeaching(piece: string, from: string, to: string): StructuredExerciseExplanation {
  return {
    notice: `La coordination du ${piece} en ${from}.`,
    focus: `${piece} ${from} → ${to}`,
    plan: `Améliorer le ${piece} vers ${to}.`,
    objective: "Conserver une position saine tout en créant une menace ou une amélioration durable.",
    rule: "N’évalue pas seulement un coup : nomme la pièce, sa destination et l’objectif obtenu.",
  };
}

export function buildExerciseTeaching(
  fen: string,
  moveUci: string,
  conceptSlug: string,
  principalLine: string[] = [],
): TeachingPayload | null {
  try {
    const before = new Chess(fen);
    const moverColor = before.turn();
    const from = moveUci.slice(0, 2) as Square;
    const to = moveUci.slice(2, 4) as Square;
    const movingPiece = before.get(from);
    const capturedPiece = before.get(to);
    if (!movingPiece) return null;
    const piece = PIECE_NAMES[movingPiece.type];
    before.move({ from, to, promotion: moveUci.slice(4, 5) || "q" });
    const after = before;
    const nextOwnMove = principalLine[2];
    const opponentReply = principalLine[1];
    const arrows: PlanArrow[] = [{ from, to, color: "primary", label: "plan principal" }];
    if (nextOwnMove) {
      arrows.push({
        from: nextOwnMove.slice(0, 2),
        to: nextOwnMove.slice(2, 4),
        color: "secondary",
        label: "suite du plan",
      });
    }
    if (opponentReply && arrows.length < 3) {
      arrows.push({
        from: opponentReply.slice(0, 2),
        to: opponentReply.slice(2, 4),
        color: "warning",
        label: "meilleure réaction",
      });
    }
    const squares: PlanSquare[] = [{ square: to, color: "primary" }];
    const explanation = genericTeaching(piece, from, to);
    const concept = conceptSlug as ConceptSlug;

    if (concept === "fork") {
      const targets = attackedSquaresByPiece(after, to)
        .filter((square) => {
          const target = after.get(square);
          return target?.color === opposite(moverColor) && PIECE_VALUE[target.type] >= 3;
        });
      explanation.notice = `Depuis ${to}, le ${piece} attaque plusieurs cibles importantes en même temps.`;
      explanation.focus = targets.length
        ? `Cibles simultanées : ${targets.join(" et ")}.`
        : `La case de fourchette ${to}.`;
      explanation.plan = `Jouer ${from}–${to}, puis récupérer la cible que l’adversaire ne peut pas sauver.`;
      explanation.objective = "Transformer le double attaqué en gain concret après la meilleure réponse adverse.";
      explanation.rule = "Une fourchette n’est acquise qu’après avoir calculé quelle cible restera prenable.";
      squares.push(...targets.slice(0, 2).map((square) => ({ square, color: "warning" as const })));
    } else if (concept === "pin") {
      const enemyKing = after.board().flatMap((row) => row).find((candidate) => (
        candidate?.type === "k" && candidate.color === opposite(moverColor)
      ));
      explanation.notice = `Le ${piece} placé en ${to} aligne une pièce adverse avec son roi.`;
      explanation.focus = `La ligne créée depuis ${to}${enemyKing ? ` vers ${enemyKing.square}` : ""}.`;
      explanation.plan = `Installer le clouage par ${from}–${to}, puis augmenter la pression sur la pièce immobilisée.`;
      explanation.objective = "Empêcher la pièce clouée de remplir normalement son rôle défensif.";
      explanation.rule = "Vérifie toujours ce qui se trouve derrière la pièce : le clouage vient de cette cible plus importante.";
      if (enemyKing) squares.push({ square: enemyKing.square, color: "warning" });
    } else if (concept === "remove_defender") {
      const target = capturedPiece ? `${PIECE_NAMES[capturedPiece.type]} en ${to}` : `défenseur autour de ${to}`;
      explanation.notice = `${target[0].toUpperCase()}${target.slice(1)} tient une cible ou une case essentielle.`;
      explanation.focus = target;
      explanation.plan = `Éliminer ou détourner ce défenseur avec ${from}–${to}, puis exploiter la cible libérée.`;
      explanation.objective = "Faire disparaître l’unique protection avant de réaliser le gain principal.";
      explanation.rule = "Avant une combinaison, demande-toi quelle pièce empêche encore le gain et comment la détourner.";
      squares.push({ square: to, color: "warning" });
    } else if (concept === "overloaded_defender") {
      const target = capturedPiece ? `${PIECE_NAMES[capturedPiece.type]} en ${to}` : `défenseur autour de ${to}`;
      explanation.notice = `${target[0].toUpperCase()}${target.slice(1)} assume plusieurs tâches défensives à la fois.`;
      explanation.focus = `Le défenseur surchargé en ${to} et les cibles qu’il ne peut pas toutes tenir.`;
      explanation.plan = `Forcer ce défenseur à abandonner une obligation par ${from}–${to}, puis exploiter l’autre cible.`;
      explanation.objective = "Créer deux obligations incompatibles pour la même pièce défensive.";
      explanation.rule = "Un défenseur est surchargé lorsque répondre à une menace l’oblige à abandonner une autre cible.";
      squares.push({ square: to, color: "warning" });
    } else if (concept === "loose_piece") {
      explanation.notice = capturedPiece
        ? `Le ${PIECE_NAMES[capturedPiece.type]} en ${to} n’est pas suffisamment défendu.`
        : `Une pièce adverse autour de ${to} manque de protection.`;
      explanation.focus = `La pièce vulnérable en ${to}.`;
      explanation.plan = `L’exploiter immédiatement par ${from}–${to}.`;
      explanation.objective = "Gagner du matériel avant que l’adversaire ne puisse réorganiser sa défense.";
      explanation.rule = "Après chaque coup adverse, recompte les pièces attaquées et leurs défenseurs.";
      squares.push({ square: to, color: "warning" });
    } else if (concept === "skewer") {
      explanation.notice = `Le ${piece} en ${to} attaque une pièce de grande valeur placée devant une seconde cible.`;
      explanation.focus = `La ligne d’enfilade créée par ${from}–${to}.`;
      explanation.plan = "Forcer la première cible à bouger, puis capturer la pièce révélée derrière elle.";
      explanation.objective = "Gagner la cible arrière après le déplacement forcé de la cible avant.";
      explanation.rule = "Dans une enfilade, calcule d’abord où la pièce la plus forte peut fuir, puis vérifie que la cible arrière reste prenable.";
    } else if (concept === "forcing_moves") {
      const forcingNature = capturedPiece
        ? `la prise du ${PIECE_NAMES[capturedPiece.type]} en ${to}`
        : after.isCheck()
          ? `l’échec donné depuis ${to}`
          : moveUci.length > 4
            ? `la promotion en ${to}`
            : `la menace immédiate créée en ${to}`;
      explanation.notice = `Le coup forcing est ${forcingNature} : il réduit fortement les réponses adverses.`;
      explanation.focus = `La séquence concrète qui commence par ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}, prévoir la meilleure réponse adverse, puis vérifier la continuation avant de conclure.`;
      explanation.objective = "Calculer jusqu’au résultat concret plutôt que s’arrêter au premier coup spectaculaire.";
      explanation.rule = "Examine échecs, prises et menaces, mais ne retiens un coup forcing qu’après avoir calculé la réponse la plus résistante.";
    } else if (concept === "open_file") {
      const invasionRank = moverColor === "w" ? "7" : "2";
      const invasion = `${to[0]}${invasionRank}`;
      explanation.notice = `La colonne ${to[0]} ne contient pas de pion propre qui bloque la tour.`;
      explanation.focus = `La tour en ${from} et la colonne ${to[0]}.`;
      explanation.plan = `Transférer la tour en ${to}, puis viser une case d’entrée comme ${invasion}.`;
      explanation.objective = "Donner à la tour une ligne active et créer une possibilité d’invasion.";
      explanation.rule = "Une colonne ouverte n’est utile que si la tour possède une case d’entrée ou une cible.";
      arrows.splice(1, 0, { from: to, to: invasion, color: "secondary", label: "case d’invasion" });
      squares.push({ square: invasion, color: "secondary" });
    } else if (concept === "outpost") {
      explanation.notice = `La case ${to} est avancée, soutenue et difficile à chasser par un pion.`;
      explanation.focus = `${piece} en ${from} et avant-poste ${to}.`;
      explanation.plan = `Installer le ${piece} en ${to}, puis jouer autour de ses nouvelles cibles.`;
      explanation.objective = "Créer une pièce stable qui gêne durablement la coordination adverse.";
      explanation.rule = "Un avant-poste vaut surtout par les cibles qu’il attaque et l’absence de pion capable de le chasser.";
    } else if (concept === "weak_square") {
      explanation.notice = `La case ${to} ne peut pas être contrôlée durablement par un pion adverse.`;
      explanation.focus = `Case faible ${to} et ${piece} capable de l’occuper.`;
      explanation.plan = `Installer le ${piece} par ${from}–${to}, puis viser les cibles accessibles depuis cette case.`;
      explanation.objective = "Transformer une faiblesse de cases en activité concrète, sans confondre belle case et avant-poste utile.";
      explanation.rule = "Une case faible n’a de valeur que si une pièce peut l’occuper et y attaquer une cible réelle.";
    } else if (concept === "improve_worst_piece") {
      explanation.notice = `Le ${piece} en ${from} participe moins au jeu que les autres pièces.`;
      explanation.focus = `${piece} passif en ${from}.`;
      explanation.plan = `Le redéployer vers ${to}${nextOwnMove ? `, puis poursuivre vers ${nextOwnMove.slice(2, 4)}` : ""}.`;
      explanation.objective = "Augmenter sa mobilité et sa participation avant d’ouvrir le jeu.";
      explanation.rule = "Quand aucun coup forcing ne s’impose, améliore la pièce qui a le moins de cases utiles.";
    } else if (concept === "weak_pawn") {
      const weakTarget = isolatedPawns(after.fen(), opposite(moverColor)).find((pawn) => (
        attackedSquaresByPiece(after, to).includes(pawn.square)
      ));
      explanation.notice = weakTarget
        ? `Le pion isolé en ${weakTarget.square} ne peut pas être soutenu par un pion voisin.`
        : "Un pion adverse constitue une faiblesse durable et accessible.";
      explanation.focus = weakTarget ? `Pion faible en ${weakTarget.square}.` : `Cible créée depuis ${to}.`;
      explanation.plan = `Améliorer le ${piece} par ${from}–${to} pour fixer puis attaquer cette faiblesse.`;
      explanation.objective = "Obliger les pièces adverses à une défense passive avant d’ouvrir un second front.";
      explanation.rule = "Une faiblesse n’est utile que si elle peut être fixée et attaquée plus de fois qu’elle n’est défendue.";
      if (weakTarget) squares.push({ square: weakTarget.square, color: "warning" });
    } else if (concept === "pawn_break") {
      explanation.notice = `La poussée ${from}–${to} modifie immédiatement la structure de pions.`;
      explanation.focus = `La rupture sur la colonne ${from[0]}.`;
      explanation.plan = `Préparer puis jouer ${from}–${to} au moment où les pièces peuvent exploiter les lignes ouvertes.`;
      explanation.objective = "Ouvrir une colonne, une diagonale ou créer une nouvelle faiblesse dans le camp adverse.";
      explanation.rule = "Une rupture est bonne quand tes pièces profitent davantage que celles de l’adversaire des lignes qui s’ouvrent.";
    } else if (concept === "pawn_structure") {
      explanation.notice = "La structure de pions fixe les ailes où chaque camp peut créer du jeu et les ruptures disponibles.";
      explanation.focus = `Le plan structurel commencé par ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}, puis placer les pièces derrière la rupture ou la case clé correspondante.`;
      explanation.objective = "Choisir un plan cohérent avec les chaînes de pions plutôt qu’un coup isolé sans suite.";
      explanation.rule = "Lis d’abord les chaînes de pions : leur base indique souvent la cible et leur direction l’aile où jouer.";
    } else if (concept === "piece_activity") {
      explanation.notice = `Le ${piece} en ${from} manque de portée ou de cibles utiles.`;
      explanation.focus = `Gain d’activité ${from} → ${to}.`;
      explanation.plan = `Replacer le ${piece} en ${to}${nextOwnMove ? `, puis poursuivre vers ${nextOwnMove.slice(2, 4)}` : ""}.`;
      explanation.objective = "Augmenter la mobilité utile et obliger l’adversaire à répondre à une pièce plus active.";
      explanation.rule = "L’activité ne se mesure pas au nombre brut de cases : cherche les cases qui créent une cible ou gênent un plan adverse.";
    } else if (concept === "favorable_exchange") {
      const target = capturedPiece ? `${PIECE_NAMES[capturedPiece.type]} en ${to}` : `pièce adverse en ${to}`;
      explanation.notice = `L’échange du ${target} modifie favorablement l’activité ou la structure restante.`;
      explanation.focus = `Échange ${from} × ${to} et position obtenue après la reprise.`;
      explanation.plan = `Déclencher l’échange par ${from}–${to}, puis vérifier la reprise et la pièce qui devient plus active.`;
      explanation.objective = "Échanger une bonne pièce adverse ou entrer dans une structure plus facile à jouer.";
      explanation.rule = "Un échange est favorable par la position qui reste, pas seulement par la valeur des pièces retirées.";
    } else if (concept === "opponent_threat") {
      const endangered = loosePieces(fen, moverColor).find((candidate) => PIECE_VALUE[candidate.type] >= 3);
      explanation.notice = endangered
        ? `Le ${PIECE_NAMES[endangered.type]} en ${endangered.square} est menacé et insuffisamment défendu.`
        : "L’adversaire possède une menace concrète à traiter avant ton propre plan.";
      explanation.focus = endangered ? `Pièce menacée en ${endangered.square}.` : `Réponse défensive ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to} pour neutraliser la menace sans abandonner l’activité.`;
      explanation.objective = "Éviter la perte immédiate tout en gardant une position jouable.";
      explanation.rule = "Avant ton plan, demande toujours : que menace exactement mon adversaire au prochain coup ?";
      if (endangered) squares.push({ square: endangered.square, color: "warning" });
    } else if (concept === "passed_pawn") {
      explanation.notice = `Le pion en ${from} n’a plus de pion adverse capable de le bloquer sur sa route.`;
      explanation.focus = `Pion passé ${from} → ${to}.`;
      explanation.plan = `Le faire progresser avec ${from}–${to} tout en contrôlant sa case de promotion.`;
      explanation.objective = "Forcer les pièces adverses à se consacrer au pion passé.";
      explanation.rule = "Un pion passé doit avancer, mais seulement lorsque sa case suivante et la réponse adverse sont contrôlées.";
    } else if (concept === "king_activity") {
      explanation.notice = `En finale, le roi en ${from} peut devenir une pièce active au lieu de rester spectateur.`;
      explanation.focus = `Le trajet du roi ${from} → ${to}.`;
      explanation.plan = `Centraliser le roi vers ${to}${nextOwnMove ? `, puis ${nextOwnMove.slice(2, 4)}` : ""} pour atteindre les pions et cases clés.`;
      explanation.objective = "Gagner des tempos et contrôler les cases importantes de la finale.";
      explanation.rule = "Quand les dangers de mat ont disparu, active le roi avant de pousser automatiquement les pions.";
    } else if (concept === "opposition") {
      explanation.notice = `Le déplacement du roi vers ${to} vise à contrôler les cases d’entrée devant le roi adverse.`;
      explanation.focus = `Les cases clés autour de ${to}.`;
      explanation.plan = `Prendre l’opposition par ${from}–${to}, puis contourner lorsque le roi adverse doit céder le passage.`;
      explanation.objective = "Forcer le roi adverse à reculer et ouvrir la route du pion.";
      explanation.rule = "L’opposition est un moyen de gagner une case clé, pas un objectif isolé.";
    } else if (concept === "rule_of_square") {
      explanation.notice = "La course se décide en comparant le trajet du roi avec le nombre de poussées restant au pion.";
      explanation.focus = `La case ${to} et le carré de rattrapage du pion passé.`;
      explanation.plan = `Entrer dans le carré par ${from}–${to}, ou pousser si le roi adverse ne peut plus y entrer.`;
      explanation.objective = "Savoir immédiatement si le pion peut être rattrapé sans calculer chaque variante.";
      explanation.rule = "Trace mentalement le carré du pion : si le roi peut y entrer à temps, il peut normalement le rattraper.";
    } else if (concept === "rook_activity") {
      explanation.notice = `La tour en ${from} manque de cibles ou de liberté ; ${to} lui ouvre une ligne active.`;
      explanation.focus = `Tour ${from} → ${to} et accès à la rangée/colonne active.`;
      explanation.plan = `Activer la tour par ${from}–${to}${nextOwnMove ? `, puis viser ${nextOwnMove.slice(2, 4)}` : ""}.`;
      explanation.objective = "Créer des menaces latérales et empêcher le roi adverse de soutenir librement ses pions.";
      explanation.rule = "En finale de tours, l’activité vaut souvent davantage que la défense passive d’un pion.";
    } else if (concept === "rook_behind_pawn") {
      explanation.notice = `La tour peut se placer derrière le pion passé afin que sa portée augmente à mesure que le pion avance.`;
      explanation.focus = `Tour ${from} → ${to} et trajectoire du pion passé.`;
      explanation.plan = `Placer la tour derrière le pion par ${from}–${to}, puis soutenir ou bloquer sa progression à distance.`;
      explanation.objective = "Garder la tour active tout au long de la course à la promotion.";
      explanation.rule = "La tour appartient généralement derrière le pion passé, qu’il soit ami ou adverse, sauf tactique concrète.";
    } else if (concept === "king_and_pawn") {
      explanation.notice = "Il ne reste que les rois et les pions : chaque tempo et chaque case clé compte.";
      explanation.focus = `Coordination commencée par ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}, puis faire avancer le roi devant les pions avant de fixer la structure.`;
      explanation.objective = "Gagner les cases d’entrée sans gaspiller un tempo de pion irréversible.";
      explanation.rule = "Dans une finale de pions, améliore le roi avant de pousser sauf si la course est précisément calculée.";
    } else if (concept === "rook_endgame") {
      explanation.notice = "La position est une véritable finale de tours : l’activité et les échecs latéraux dominent souvent le matériel.";
      explanation.focus = `Tour ${from} → ${to} et activité obtenue.`;
      explanation.plan = `Activer la tour par ${from}–${to}, puis attaquer les pions de côté ou couper le roi adverse.`;
      explanation.objective = "Éviter la défense passive et conserver assez d’activité pour gagner ou tenir.";
      explanation.rule = "En finale de tours, active la tour avant de défendre passivement un pion.";
    } else if (concept === "lucena") {
      explanation.notice = "Le roi est devant son pion mais doit se protéger des échecs de la tour adverse.";
      explanation.focus = `Construction du pont par ${from}–${to}.`;
      explanation.plan = `Éloigner la tour par ${from}–${to}, interposer ensuite la tour et libérer le roi de ses échecs.`;
      explanation.objective = "Construire un pont qui permet au roi de sortir et au pion de promouvoir.";
      explanation.rule = "Lucena : roi devant le pion, tour active, puis construction du pont sur la quatrième rangée.";
    } else if (concept === "philidor") {
      explanation.notice = "Le camp défenseur doit empêcher le roi adverse d’avancer avant que le pion n’atteigne la sixième rangée.";
      explanation.focus = `Défense de la troisième rangée par ${from}–${to}.`;
      explanation.plan = `Maintenir la barrière latérale, puis passer aux échecs arrière lorsque le pion avance.`;
      explanation.objective = "Garder le roi adverse coupé et obtenir la nulle sans défense passive derrière le pion.";
      explanation.rule = "Philidor : troisième rangée d’abord, échecs arrière seulement après l’avancée du pion.";
    } else if (concept === "bishop_endgame") {
      explanation.notice = `Le fou en ${from} doit contrôler des cases utiles des deux ailes, pas seulement protéger un pion.`;
      explanation.focus = `Diagonale obtenue après ${from}–${to}.`;
      explanation.plan = `Activer le fou par ${from}–${to}, puis fixer les pions adverses sur sa couleur.`;
      explanation.objective = "Coordonner le roi et le fou contre les faiblesses accessibles.";
      explanation.rule = "En finale de fous, place les pions adverses sur la couleur de ton fou et les tiens sur l’autre couleur.";
    } else if (concept === "knight_endgame") {
      explanation.notice = `Le cavalier en ${from} a besoin d’un avant-poste stable proche des pions des deux ailes.`;
      explanation.focus = `Route du cavalier ${from} → ${to}.`;
      explanation.plan = `Centraliser le cavalier par ${from}–${to}, puis coordonner le roi avant de créer un pion passé.`;
      explanation.objective = "Réduire les tempos du cavalier et contrôler les cases d’entrée du roi adverse.";
      explanation.rule = "En finale de cavaliers, centralise tôt : un cavalier éloigné change d’aile trop lentement.";
    } else if (concept === "restrict_counterplay") {
      explanation.notice = "L’avantage est réel, mais l’adversaire possède encore une source de contre-jeu à neutraliser.";
      explanation.focus = `Le coup de contrôle ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to} pour couper la ressource adverse avant de faire progresser l’avantage.`;
      explanation.objective = "Réduire les réponses actives de l’adversaire et convertir sans lui rendre l’initiative.";
      explanation.rule = "Avant de convertir, identifie l’unique source de contre-jeu adverse et retire-la.";
    } else if (concept === "simplify_when_ahead") {
      explanation.notice = "L’échange proposé réduit les ressources adverses sans rendre l’avantage essentiel.";
      explanation.focus = `La simplification déclenchée par ${from}–${to}.`;
      explanation.plan = `Échanger par ${from}–${to}, puis entrer dans une position plus simple où l’avantage reste durable.`;
      explanation.objective = "Diminuer le contre-jeu et faciliter la conversion de l’avantage.";
      explanation.rule = "Simplifie les menaces adverses, pas automatiquement toutes les pièces : vérifie que la finale obtenue reste favorable.";
    } else if (concept === "use_material_advantage") {
      explanation.notice = "Le matériel supplémentaire doit être coordonné avant de chercher un gain immédiat.";
      explanation.focus = `Le regroupement commencé par ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to} pour mobiliser la pièce concernée et transformer l’avantage matériel en activité.`;
      explanation.objective = "Faire participer toutes les pièces et éviter qu’une pièce de plus reste hors jeu.";
      explanation.rule = "Avec du matériel en plus, coordonne d’abord tes pièces puis échange le contre-jeu adverse.";
    } else if (concept === "convert_small_advantage") {
      explanation.notice = "L’avantage est réel mais encore modeste : il peut disparaître après un plan imprécis.";
      explanation.focus = `Amélioration progressive ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}, améliorer la pièce concernée et ne créer une nouvelle faiblesse qu’après avoir limité les réponses actives.`;
      explanation.objective = "Transformer un petit plus durable en avantage concret sans chercher un gain forcé inexistant.";
      explanation.rule = "Un petit avantage se convertit par accumulation : meilleure pièce, cible fixée, puis second front.";
    } else if (concept === "favorable_endgame_transition") {
      explanation.notice = "L’échange mène à une vraie finale où l’avantage reste présent et plus facile à exploiter.";
      explanation.focus = `Transition déclenchée par ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}, vérifier la reprise puis activer immédiatement le roi et la pièce restante.`;
      explanation.objective = "Réduire le contre-jeu sans entrer dans une finale théoriquement nulle ou passive.";
      explanation.rule = "N’échange vers une finale que si l’activité, la structure et les cases d’entrée restent favorables.";
    } else if (concept === "preserve_activity") {
      explanation.notice = `Le ${piece} doit rester actif pendant la conversion au lieu de protéger passivement l’avantage.`;
      explanation.focus = `Activité conservée par ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}${nextOwnMove ? `, puis poursuivre vers ${nextOwnMove.slice(2, 4)}` : ""} tout en gardant les menaces adverses sous contrôle.`;
      explanation.objective = "Faire progresser l’avantage sans laisser l’adversaire reprendre l’initiative.";
      explanation.rule = "Convertir ne signifie pas reculer : garde au moins une pièce active qui crée des problèmes.";
    } else if (concept === "create_second_weakness") {
      explanation.notice = "Une seule faiblesse peut être défendue ; le plan consiste à ouvrir un second front.";
      explanation.focus = `Nouveau point de pression créé par ${from}–${to}.`;
      explanation.plan = `Fixer la première cible, jouer ${from}–${to}, puis transférer les pièces vers la nouvelle faiblesse.`;
      explanation.objective = "Surcharger la défense adverse en l’obligeant à protéger deux zones éloignées.";
      explanation.rule = "Quand une faiblesse est parfaitement défendue, crée-en une deuxième avant de forcer.";
    } else if (concept === "avoid_forcing_too_soon") {
      explanation.notice = "Aucune combinaison forcée n’est encore nécessaire ; une amélioration calme augmente la pression.";
      explanation.focus = `Coup préparatoire ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to}, supprimer la meilleure ressource adverse puis seulement ouvrir la position.`;
      explanation.objective = "Améliorer les conditions de la conversion avant de déclencher les opérations concrètes.";
      explanation.rule = "Ne force pas parce que tu es mieux : améliore d’abord ta position si l’adversaire n’a pas de contre-jeu urgent.";
    } else if (concept === "defensive_resource") {
      explanation.notice = "La position est difficile, mais ce coup crée une ressource concrète qui change réellement les chances de défense.";
      explanation.focus = `La ressource active ${from}–${to}.`;
      explanation.plan = `Jouer ${from}–${to} pour imposer une réponse et empêcher la conversion automatique adverse.`;
      explanation.objective = "Créer des problèmes concrets : menace, échange favorable ou activité suffisante pour tenir.";
      explanation.rule = "Une bonne défense cherche une ressource active qui modifie la position, pas seulement le coup qui perd le moins vite.";
    } else if (concept === "development" || concept === "center_control" || concept === "king_safety" || concept === "opening_tempo") {
      const openingGoal = concept === "development"
        ? "développer une pièce vers une case utile"
        : concept === "center_control"
          ? "augmenter le contrôle des cases centrales"
          : concept === "king_safety"
            ? "mettre le roi à l’abri avant d’ouvrir le jeu"
            : "gagner un temps utile sans déplacer plusieurs fois la même pièce";
      explanation.notice = `La priorité d’ouverture est de ${openingGoal}.`;
      explanation.focus = `Le coup ${from}–${to} et les objectifs qu’il remplit simultanément.`;
      explanation.plan = `Jouer ${from}–${to}, puis poursuivre le développement sans créer de faiblesse inutile.`;
      explanation.objective = "Arriver au milieu de jeu avec des pièces actives, un roi sûr et un centre cohérent.";
      explanation.rule = "En ouverture, préfère les coups qui remplissent plusieurs objectifs plutôt qu’un coup mémorisé sans idée.";
    }

    if (opponentReply) {
      explanation.opponentIdea = `La ligne de référence teste le plan par ${opponentReply.slice(0, 2)}–${opponentReply.slice(2, 4)}.`;
    }
    return {
      explanation,
      planArrows: arrows.slice(0, 3),
      planSquares: [...new Map(squares.map((square) => [square.square, square])).values()].slice(0, 3),
    };
  } catch {
    return null;
  }
}
