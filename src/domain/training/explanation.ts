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
    } else if (concept === "remove_defender" || concept === "overloaded_defender") {
      const target = capturedPiece ? `${PIECE_NAMES[capturedPiece.type]} en ${to}` : `défenseur autour de ${to}`;
      explanation.notice = `${target[0].toUpperCase()}${target.slice(1)} tient une cible ou une case essentielle.`;
      explanation.focus = target;
      explanation.plan = `Éliminer ou détourner ce défenseur avec ${from}–${to}, puis exploiter la cible libérée.`;
      explanation.objective = "Faire disparaître l’unique protection avant de réaliser le gain principal.";
      explanation.rule = "Avant une combinaison, demande-toi quelle pièce empêche encore le gain et comment la détourner.";
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
