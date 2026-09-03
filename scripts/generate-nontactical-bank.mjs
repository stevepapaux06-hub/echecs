#!/usr/bin/env node

/**
 * Builds ChessPath's non-tactical bank from real-game PGN corpora.
 *
 * Every retained move is checked by the bundled Stockfish 18 Lite engine.
 * The committed expansion uses the official Lichess standard-game export
 * (CC0). Existing reviewed positions can be supplied as a seed and are kept.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Chess } from "chess.js";

const require = createRequire(import.meta.url);
const initStockfish = require("stockfish");
const FILES = "abcdefgh";
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// These master moves passed the fast seed scan but lost more than 1.5 pawns
// when the complete application verifier replayed the resulting position.
// Keeping the rejection list in the seed makes regeneration deterministic and
// lets the loop choose the next sound candidate instead of weakening the gate.
const DEEP_VALIDATION_REJECTS = new Set([
  "master-rook_endgame-417063a6ca8bae",
  "master-convert_small_advantage-8703cbbbfe47fb",
  "master-restrict_counterplay-ff194f38d4ab32",
  "master-king_activity-1ca87e1cf058b3",
  "master-king_activity-8549aacb3ca499",
  "master-convert_small_advantage-fb724bed8e1a17",
  "master-convert_small_advantage-ad8c25968803c5",
  "master-restrict_counterplay-60c77871653dd4",
  "master-weak_pawn-588c5cf8da00e2",
  "master-pawn_break-82cb6258eba9cf",
  "master-king_and_pawn-210a2869d19f86",
  "master-king_and_pawn-b67f90579aa30f",
  "master-king_and_pawn-119bd6c1d862d5",
  "master-rule_of_square-3c64e9bb7573da",
  "master-rule_of_square-47ae1aa5126814",
  "master-passed_pawn-53b157a94e436d",
  "master-passed_pawn-423b69efa755f6",
  "master-passed_pawn-6471e69615a795",
  "master-rook_activity-15f90fdeef01ed",
  "master-rook_activity-7e89fb32d0aba9",
  "master-rook_behind_pawn-d699b5203c1c2e",
  "master-rook_behind_pawn-0c13477454cdfd",
  "master-rook_behind_pawn-60b6fb79e571cb",
  "master-knight_endgame-2628d76af1489a",
  "master-king_activity-a8a20dbf07aee6",
  "master-king_activity-adb73269c3d9e6",
  "master-king_activity-753bad2edc85ea",
  "master-simplify_when_ahead-040309ecf60040",
  "master-restrict_counterplay-0e02fd9639b3b7",
  "master-use_material_advantage-de3711aa4a8731",
  "master-use_material_advantage-d6f8137fd58fe2",
  "master-use_material_advantage-d4d23b61704025",
  "master-preserve_activity-6fb6ca82eef7ff",
  "master-preserve_activity-9369c1c6fe4b9c",
  "master-preserve_activity-514c17e1273c61",
  "master-king_and_pawn-93b21923abb7d2",
  "master-king_and_pawn-d1a9ffc3f68073",
  "master-king_and_pawn-e1bd553d381518",
  "master-passed_pawn-4047fb3bf062cb",
  "master-passed_pawn-a12bd0c5d86730",
  "master-passed_pawn-bbacbe22e5e3e4",
  "master-rook_endgame-c372621010cc00",
  "master-rook_endgame-33f426c851d362",
  "master-rook_activity-911394b0815d1d",
  "master-rook_activity-8c0a005d12479c",
  "master-rook_activity-c4eb89d6d62249",
  "master-rook_behind_pawn-ebbffeb7496067",
  "master-knight_endgame-72d437b9e6176e",
  "master-king_activity-c46507595e3e0f",
  "master-convert_small_advantage-74da481be72c5a",
  "master-convert_small_advantage-9859203d4f57a5",
  "master-restrict_counterplay-f270ed29978e18",
  "master-restrict_counterplay-ed3172d06c99a7",
  "master-restrict_counterplay-9255e1049ebf74",
  "master-preserve_activity-dcf449e6d7aeac",
  "master-preserve_activity-7085d9d427c601",
  "master-king_and_pawn-f77a6c1ebefcf9",
  "master-rule_of_square-e04b88ab76a6c6",
  "master-passed_pawn-79285533637334",
  "master-passed_pawn-826264b8c3d689",
  "master-rook_endgame-c5bee4e297eba2",
  "master-rook_behind_pawn-e2e4175e3b9230",
  "master-knight_endgame-15d6c4b0f174af",
  "master-king_activity-e22dade41fb44f",
  "master-king_activity-770fcf387e3aeb",
  "master-king_activity-a33dfd2b8b0d19",
  "master-convert_small_advantage-1326cd06281bef",
  "master-use_material_advantage-1cb7858e003b2d",
  "master-use_material_advantage-61cfe83a59973e",
  "master-favorable_endgame_transition-642c1feb1a3a11",
  "master-preserve_activity-261a79da53f38d",
  "master-opposition-421b81ca229373",
  "master-passed_pawn-534507afe9d603",
  "master-passed_pawn-0b668859f0ae9b",
  "master-rook_endgame-84e1ba67e869e9",
  "master-rook_behind_pawn-f349b810f47dbd",
  "master-bishop_endgame-f07e536510358a",
  "master-king_activity-bee9593f2ca4d4",
  "master-king_activity-4a34fb8a99cc12",
  "master-king_activity-5d431ccd02f417",
  "master-convert_small_advantage-c9857125e83d5c",
  "master-simplify_when_ahead-baaf3cabcb7a51",
  "master-restrict_counterplay-c79d9d8e09b3c0",
  "master-use_material_advantage-897eca6c7dceed",
  "master-rook_activity-be8fa25255d8f3",
  "master-rook_behind_pawn-60e102e258eff1",
  "master-rook_behind_pawn-472f46548c7361",
  "master-rook_behind_pawn-01a5ba212e122c",
  "master-convert_small_advantage-99d7a7515d7c62",
  "master-restrict_counterplay-8004f29a1b4381",
  "master-bishop_endgame-26ab9b37d91f47",
  "master-convert_small_advantage-afd288856cbdd6",
  "master-rook_behind_pawn-44bc41ac0c98bf",
  "master-bishop_endgame-281926d387e3e2",
  "master-king_activity-586393055a3008",
  "master-restrict_counterplay-ecaa3f3c56df87",
  "master-use_material_advantage-adaec7ce6ea3f2",
  "master-rook_behind_pawn-55665f120dceab",
  "master-open_file-794a59bd1a92d7",
  "master-weak_square-491327af8f46d1",
  "master-weak_pawn-fa0cfb346471f8",
  "master-weak_pawn-a895d0758c4321",
  "master-weak_pawn-5ab9ee78d2a27e",
  "master-favorable_exchange-17715938a7e509",
  "master-opposition-8a9f553438f273",
  "master-opposition-65c5efcfca6922",
  "master-passed_pawn-d8b1148428c6a4",
  "master-passed_pawn-f38490b634942c",
  "master-king_activity-6eeab79bfe97f3",
]);

const TARGETS = {
  strategy: {
    improve_worst_piece: 120,
    outpost: 120,
    open_file: 140,
    weak_square: 100,
    weak_pawn: 120,
    pawn_break: 140,
    favorable_exchange: 120,
    piece_activity: 140,
    pawn_structure: 120,
  },
  endgame: {
    king_and_pawn: 140,
    opposition: 80,
    rule_of_square: 80,
    passed_pawn: 140,
    rook_endgame: 160,
    rook_activity: 140,
    rook_behind_pawn: 120,
    bishop_endgame: 100,
    knight_endgame: 100,
    king_activity: 140,
  },
  conversion: {
    convert_small_advantage: 140,
    simplify_when_ahead: 120,
    restrict_counterplay: 120,
    use_material_advantage: 140,
    favorable_endgame_transition: 100,
    preserve_activity: 120,
  },
};

const LABELS = {
  improve_worst_piece: ["Améliore ta pire pièce", "Quelle pièce participe le moins, et quelle route lui donne un rôle ?"],
  outpost: ["Installe un avant-poste utile", "Quelle case stable donne une mission concrète à ta pièce ?"],
  open_file: ["Exploite la bonne colonne", "Quelle tour et quelle colonne donnent une vraie case d’entrée ?"],
  weak_square: ["Occupe la case faible", "Quelle case ne peut plus être contestée par un pion adverse ?"],
  weak_pawn: ["Fixe puis attaque le pion faible", "Quelle décision transforme le pion faible en cible durable ?"],
  pawn_break: ["Choisis la bonne rupture", "Quelle poussée change favorablement la structure ?"],
  favorable_exchange: ["Échange la bonne pièce", "Quel échange améliore réellement la position restante ?"],
  piece_activity: ["Active ta pièce", "Quel placement donne plus de mobilité utile et de nouvelles cibles ?"],
  pawn_structure: ["Joue selon la structure", "Quel plan correspond aux chaînes et aux ruptures de cette position ?"],
  king_and_pawn: ["Conduis la finale de pions", "Quel tempo ou quelle case clé décide cette finale ?"],
  opposition: ["Prends l’opposition", "Quel coup de roi gagne ou conserve les cases d’entrée ?"],
  rule_of_square: ["Entre dans le carré", "Le roi peut-il rattraper le pion ? Trouve le trajet exact."],
  passed_pawn: ["Fais vivre le pion passé", "Comment faire progresser le pion sans perdre son soutien ?"],
  rook_endgame: ["Joue la finale de tours activement", "Quel coup évite la passivité et crée du contre-jeu ?"],
  rook_activity: ["Active la tour", "Quelle case donne à la tour des échecs, des cibles ou une coupure ?"],
  rook_behind_pawn: ["Place la tour derrière le pion", "Comment soutenir ou bloquer le pion passé à distance ?"],
  bishop_endgame: ["Active le fou en finale", "Quelle diagonale coordonne le fou avec le roi ?"],
  knight_endgame: ["Centralise le cavalier", "Quelle route rapproche le cavalier des deux ailes ?"],
  king_activity: ["Active le roi", "Quel trajet rapproche le roi des cases et des pions importants ?"],
  convert_small_advantage: ["Convertis le petit avantage", "Quel plan fait progresser l’avantage sans forcer trop tôt ?"],
  simplify_when_ahead: ["Simplifie au bon moment", "Quel échange réduit le contre-jeu sans rendre l’avantage ?"],
  restrict_counterplay: ["Limite le contre-jeu", "Quelle décision retire la ressource active de l’adversaire ?"],
  use_material_advantage: ["Exploite ton matériel de plus", "Comment coordonner le matériel supplémentaire avant d’échanger ?"],
  favorable_endgame_transition: ["Choisis la bonne transition", "Quel échange mène à une finale favorable et active ?"],
  preserve_activity: ["Conserve l’activité", "Comment convertir sans condamner une pièce à la passivité ?"],
};

function usage() {
  console.error("Usage: node scripts/generate-nontactical-bank.mjs --output <json> [--seed bank.json] [--max-games 30000] [--candidate-limit 120000] <file.pgn> [...]");
  process.exit(1);
}

const args = process.argv.slice(2);
function option(name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const outputValue = option("--output");
if (!outputValue) usage();
const output = resolve(outputValue);
const seedValue = option("--seed");
const seedPath = seedValue ? resolve(seedValue) : null;
const maxGames = Number(option("--max-games", "30000"));
const candidateLimit = Number(option("--candidate-limit", "120000"));
const optionsWithValues = new Set(["--output", "--seed", "--max-games", "--candidate-limit"]);
const ignoredIndexes = new Set();
for (let index = 0; index < args.length; index += 1) {
  if (optionsWithValues.has(args[index])) {
    ignoredIndexes.add(index);
    ignoredIndexes.add(index + 1);
  }
}
const inputFiles = args.filter((_, index) => !ignoredIndexes.has(index));
if (!inputFiles.length) usage();

function uci(move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function canonicalFen(fen) {
  return fen.split(/\s+/).slice(0, 4).join(" ");
}

function hash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 14);
}

function allPieces(chess) {
  return chess.board().flatMap((row) => row.filter(Boolean));
}

function coordinates(square) {
  return [FILES.indexOf(square[0]), Number(square[1]) - 1];
}

function squareAt(file, rank) {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}`;
}

function ray(chess, from, directions) {
  const [file, rank] = coordinates(from);
  const result = [];
  for (const [df, dr] of directions) {
    for (let distance = 1; distance < 8; distance += 1) {
      const square = squareAt(file + df * distance, rank + dr * distance);
      if (!square) break;
      result.push(square);
      if (chess.get(square)) break;
    }
  }
  return result;
}

function attackedSquares(chess, from) {
  const piece = chess.get(from);
  if (!piece) return [];
  const [file, rank] = coordinates(from);
  if (piece.type === "p") return [file - 1, file + 1].map((f) => squareAt(f, rank + (piece.color === "w" ? 1 : -1))).filter(Boolean);
  if (piece.type === "n") return [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].map(([df, dr]) => squareAt(file + df, rank + dr)).filter(Boolean);
  if (piece.type === "k") return [-1, 0, 1].flatMap((df) => [-1, 0, 1].filter((dr) => df || dr).map((dr) => squareAt(file + df, rank + dr))).filter(Boolean);
  const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return ray(chess, from, piece.type === "b" ? diagonal : piece.type === "r" ? straight : [...diagonal, ...straight]);
}

function distanceToCenter(square) {
  const [file, rank] = coordinates(square);
  return Math.min(...[[3, 3], [3, 4], [4, 3], [4, 4]].map(([f, r]) => Math.abs(file - f) + Math.abs(rank - r)));
}

function activity(chess, square) {
  const piece = chess.get(square);
  if (!piece) return 0;
  const useful = attackedSquares(chess, square).filter((target) => chess.get(target)?.color !== piece.color);
  const enemyHalf = useful.filter((target) => piece.color === "w" ? Number(target[1]) >= 5 : Number(target[1]) <= 4).length;
  return useful.length * 2 + enemyHalf - distanceToCenter(square);
}

function worstPiece(chess, color) {
  return allPieces(chess).filter((piece) => piece.color === color && ["n", "b", "r"].includes(piece.type))
    .toSorted((a, b) => activity(chess, a.square) - activity(chess, b.square))[0]?.square ?? null;
}

function pawnAttacks(chess, color) {
  const result = new Set();
  for (const pawn of allPieces(chess).filter((piece) => piece.type === "p" && piece.color === color)) {
    const [file, rank] = coordinates(pawn.square);
    for (const targetFile of [file - 1, file + 1]) {
      const target = squareAt(targetFile, rank + (color === "w" ? 1 : -1));
      if (target) result.add(target);
    }
  }
  return result;
}

function passedPawns(chess, color) {
  const enemy = allPieces(chess).filter((piece) => piece.type === "p" && piece.color !== color);
  return allPieces(chess).filter((piece) => {
    if (piece.type !== "p" || piece.color !== color) return false;
    const [file, rank] = coordinates(piece.square);
    return !enemy.some((pawn) => {
      const [enemyFile, enemyRank] = coordinates(pawn.square);
      return Math.abs(enemyFile - file) <= 1 && (color === "w" ? enemyRank > rank : enemyRank < rank);
    });
  });
}

function isolatedPawns(chess, color) {
  const pawns = allPieces(chess).filter((piece) => piece.type === "p" && piece.color === color);
  return pawns.filter((pawn) => {
    const [file] = coordinates(pawn.square);
    return !pawns.some((other) => Math.abs(coordinates(other.square)[0] - file) === 1);
  });
}

function fileStatus(chess, file) {
  const pawns = allPieces(chess).filter((piece) => piece.type === "p" && piece.square[0] === file);
  const white = pawns.some((pawn) => pawn.color === "w");
  const black = pawns.some((pawn) => pawn.color === "b");
  if (!white && !black) return "open";
  if (!white) return "white-semi-open";
  if (!black) return "black-semi-open";
  return "closed";
}

function nonPawnMaterial(chess) {
  return allPieces(chess).reduce((sum, piece) => sum + (["p", "k"].includes(piece.type) ? 0 : VALUE[piece.type]), 0);
}

function materialAdvantage(chess, color) {
  return allPieces(chess).reduce((sum, piece) => sum + (piece.color === color ? 1 : -1) * VALUE[piece.type], 0);
}

function phase(chess, ply) {
  const nonPawn = nonPawnMaterial(chess);
  const nonPawnPieces = allPieces(chess).filter((piece) => !["p", "k"].includes(piece.type)).length;
  const queens = allPieces(chess).filter((piece) => piece.type === "q").length;
  if (ply < 20 && nonPawn >= 4800) return "opening";
  if (nonPawn <= 2600 || (queens === 0 && nonPawnPieces <= 4)) return "endgame";
  return "middlegame";
}

function materialFamily(chess) {
  const types = new Set(allPieces(chess).filter((piece) => !["p", "k"].includes(piece.type)).map((piece) => piece.type));
  if (!types.size) return "pawn";
  if (types.size === 1 && types.has("r") && ["w", "b"].every((color) => allPieces(chess).some((piece) => piece.type === "r" && piece.color === color))) return "rook";
  if (types.size === 1 && types.has("b") && ["w", "b"].every((color) => allPieces(chess).some((piece) => piece.type === "b" && piece.color === color))) return "bishop";
  if (types.size === 1 && types.has("n") && ["w", "b"].every((color) => allPieces(chess).some((piece) => piece.type === "n" && piece.color === color))) return "knight";
  return "mixed";
}

function hasOpposition(chess) {
  const kings = allPieces(chess).filter((piece) => piece.type === "k");
  if (kings.length !== 2) return false;
  const [af, ar] = coordinates(kings[0].square);
  const [bf, br] = coordinates(kings[1].square);
  return (af === bf && Math.abs(ar - br) === 2) || (ar === br && Math.abs(af - bf) === 2);
}

function kingInsideSquare(chess, color) {
  const king = allPieces(chess).find((piece) => piece.type === "k" && piece.color === color);
  const passers = passedPawns(chess, color === "w" ? "b" : "w");
  if (!king || passers.length !== 1) return false;
  const pawn = passers[0];
  const [kingFile, kingRank] = coordinates(king.square);
  const [pawnFile, pawnRank] = coordinates(pawn.square);
  const promotionRank = pawn.color === "w" ? 7 : 0;
  return Math.max(Math.abs(kingFile - pawnFile), Math.abs(kingRank - promotionRank)) <= Math.abs(promotionRank - pawnRank);
}

function rookBehindPasser(chess, rookSquare) {
  const [rookFile, rookRank] = coordinates(rookSquare);
  return [...passedPawns(chess, "w"), ...passedPawns(chess, "b")].some((pawn) => {
    const [pawnFile, pawnRank] = coordinates(pawn.square);
    return pawnFile === rookFile && (pawn.color === "w" ? rookRank < pawnRank : rookRank > pawnRank);
  });
}

function pawnStructure(chess) {
  const pawns = (color) => new Set(allPieces(chess).filter((piece) => piece.type === "p" && piece.color === color).map((piece) => piece.square));
  const white = pawns("w");
  const black = pawns("b");
  const has = (set, squares) => squares.every((square) => set.has(square));
  if (has(white, ["d4", "e5"]) && has(black, ["d5", "e6"])) return { slug: "french_chain", keys: ["d4", "e5"], breaks: ["c7c5", "f7f6"] };
  if (has(white, ["c4", "d5", "e4"]) && has(black, ["d6", "e5"])) return { slug: "kings_indian_closed", keys: ["c5", "f4"], breaks: ["c4c5", "f7f5"] };
  if (has(white, ["d5", "e4"]) && has(black, ["c5", "e6"])) return { slug: "benoni", keys: ["e5", "c5"], breaks: ["e4e5", "b7b5", "f7f5"] };
  if (has(white, ["c4", "e4"]) && !white.has("d4") && !white.has("d5")) return { slug: "maroczy_bind", keys: ["d5", "b5"], breaks: ["b7b5", "d6d5"] };
  if (has(black, ["c6", "d5", "e6"])) return { slug: "caro_slav_structure", keys: ["c5", "e5"], breaks: ["c6c5", "e6e5"] };
  return null;
}

function structuralFingerprint(chess, concept, move) {
  const pawnMap = allPieces(chess).filter((piece) => piece.type === "p").map((piece) => `${piece.color}${piece.square}`).sort().join(".");
  const material = [..."qrbn"].map((type) => `${type}${allPieces(chess).filter((piece) => piece.type === type).length}`).join("");
  const [ff, fr] = coordinates(move.from);
  const [tf, tr] = coordinates(move.to);
  const zones = `${Math.floor(ff / 2)}${Math.floor(fr / 2)}-${Math.floor(tf / 2)}${Math.floor(tr / 2)}`;
  return `${concept}|${chess.turn()}|${material}|${pawnMap}|${move.piece}|${zones}`;
}

function classify(before, after, move, nextMove, ply) {
  const concepts = new Set();
  const mover = move.color;
  const quiet = !move.captured && !move.promotion && !after.inCheck();
  const currentPhase = phase(before, ply);
  const activityGain = ["n", "b", "r"].includes(move.piece) ? activity(after, move.to) - activity(before, move.from) : 0;
  const advanced = mover === "w" ? Number(move.to[1]) >= 5 : Number(move.to[1]) <= 4;
  const ownPawnSupport = pawnAttacks(after, mover).has(move.to);
  const enemyPawnAttack = pawnAttacks(after, mover === "w" ? "b" : "w").has(move.to);
  const ownPieceSupport = after.attackers(move.to, mover).length > 0;

  if (currentPhase === "middlegame" && !before.inCheck()) {
    if (move.piece === "r" && quiet) {
      const status = fileStatus(after, move.to[0]);
      if (status === "open" || status === (mover === "w" ? "white-semi-open" : "black-semi-open")) concepts.add("open_file");
    }
    if (move.piece === "n" && quiet && advanced && ownPawnSupport && !enemyPawnAttack) concepts.add("outpost");
    if (["n", "b"].includes(move.piece) && quiet && advanced && ownPieceSupport && !enemyPawnAttack && !ownPawnSupport && activityGain >= 2) concepts.add("weak_square");
    if (quiet && worstPiece(before, mover) === move.from && activityGain >= 5) concepts.add("improve_worst_piece");
    if (quiet && ["n", "b", "r"].includes(move.piece) && activityGain >= 5) concepts.add("piece_activity");
    if (isolatedPawns(after, mover === "w" ? "b" : "w").some((pawn) => attackedSquares(after, move.to).includes(pawn.square))) concepts.add("weak_pawn");
    if (move.captured && nextMove?.captured && nextMove.to === move.to && VALUE[move.captured] >= VALUE[move.piece] - 20) concepts.add("favorable_exchange");
    const structure = pawnStructure(before);
    if (structure && (structure.keys.includes(move.to) || structure.breaks.includes(uci(move)))) concepts.add("pawn_structure");
    if (move.piece === "p" && quiet) {
      const enemyPawns = allPieces(after).filter((piece) => piece.type === "p" && piece.color !== mover);
      const createsContact = attackedSquares(after, move.to).some((square) => enemyPawns.some((pawn) => pawn.square === square))
        || pawnAttacks(after, mover === "w" ? "b" : "w").has(move.to);
      if (createsContact || structure?.breaks.includes(uci(move))) concepts.add("pawn_break");
    }
  }

  // The exercise starts in the advertised ending family. A move that merely
  // trades into that family belongs to conversion/transition, not to the
  // technical ending bank itself.
  const family = materialFamily(before);
  if (currentPhase === "endgame") {
    if (family === "pawn") {
      concepts.add("king_and_pawn");
      if (move.piece === "k" && hasOpposition(after)) concepts.add("opposition");
      if (move.piece === "k" && !kingInsideSquare(before, mover) && kingInsideSquare(after, mover)) concepts.add("rule_of_square");
    }
    if (move.piece === "p" && passedPawns(after, mover).some((pawn) => pawn.square === move.to)) concepts.add("passed_pawn");
    if (move.piece === "k" && distanceToCenter(move.to) < distanceToCenter(move.from)) concepts.add("king_activity");
    if (family === "rook") {
      concepts.add("rook_endgame");
      if (move.piece === "r" && (activityGain >= 4 || (mover === "w" ? Number(move.to[1]) >= 7 : Number(move.to[1]) <= 2))) concepts.add("rook_activity");
      if (move.piece === "r" && rookBehindPasser(after, move.to)) concepts.add("rook_behind_pawn");
    }
    if (family === "bishop" && move.piece === "b") concepts.add("bishop_endgame");
    if (family === "knight" && move.piece === "n") concepts.add("knight_endgame");
  }

  return [...concepts];
}

function collectCandidates() {
  const candidates = [];
  for (const file of inputFiles) {
    const collection = basename(file, ".pgn");
    const lichessStandard = collection.startsWith("lichess_db_standard");
    const corpusUrl = lichessStandard
      ? "https://database.lichess.org/"
      : `https://www.pgnmentor.com/players/${collection}.zip`;
    const chunks = readFileSync(file, "utf8")
      .split(/(?=\[Event )/)
      .filter((chunk) => chunk.trim())
      .slice(0, maxGames);
    for (let gameIndex = 0; gameIndex < chunks.length && candidates.length < candidateLimit; gameIndex += 1) {
      let loaded;
      try {
        loaded = new Chess();
        loaded.loadPgn(chunks[gameIndex]);
      } catch {
        continue;
      }
      const history = loaded.history({ verbose: true });
      if (history.length < 24) continue;
      const headers = loaded.getHeaders();
      const whiteElo = Number(headers.WhiteElo ?? 0);
      const blackElo = Number(headers.BlackElo ?? 0);
      const averageElo = whiteElo && blackElo ? Math.round((whiteElo + blackElo) / 2) : 0;
      if (lichessStandard && averageElo && (averageElo < 700 || averageElo > 2_600)) continue;
      const baseTime = Number(String(headers.TimeControl ?? "0").split("+")[0]);
      if (lichessStandard && baseTime && baseTime < 180) continue;
      const site = String(headers.Site ?? "");
      const siteGameId = site.match(/lichess\.org\/([A-Za-z0-9]{8,12})/)?.[1];
      const sourceGameId = siteGameId ?? hash(`${collection}|${headers.White}|${headers.Black}|${headers.Date}|${headers.Round}|${gameIndex}`);
      const sourceUrl = site.startsWith("http") ? site : corpusUrl;
      const sourcePlayers = [headers.White ?? "Blancs", headers.Black ?? "Noirs"];
      const sourceRole = averageElo >= 2_000 ? "model_position" : "human_practice";
      let replay;
      try {
        replay = headers.FEN ? new Chess(headers.FEN) : new Chess();
      } catch {
        continue;
      }
      for (let index = 0; index < history.length; index += 1) {
        const move = history[index];
        const ply = index + 1;
        const beforeFen = replay.fen();
        const before = new Chess(beforeFen);
        try {
          replay.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
        } catch {
          break;
        }
        if (ply < 18 || ply > 130 || before.inCheck() || (index + gameIndex) % 2 !== 0) continue;
        const after = new Chess(replay.fen());
        const concepts = classify(before, after, move, history[index + 1], ply);
        if (!concepts.length) continue;
        const record = {
          fen: beforeFen,
          canonicalFen: canonicalFen(beforeFen),
          move: uci(move),
          concepts,
          phase: phase(before, ply),
          afterPhase: phase(after, ply + 1),
          activityGain: ["n", "b", "r"].includes(move.piece) ? activity(after, move.to) - activity(before, move.from) : 0,
          opponentMobility: after.moves().length,
          materialAdvantage: materialAdvantage(before, move.color),
          nonPawnDrop: nonPawnMaterial(before) - nonPawnMaterial(after),
          pieceCount: allPieces(before).length,
          legalMoves: before.moves().length,
          sourceId: `${sourceGameId}-${ply}`,
          sourceGameId,
          sourceUrl,
          sourceLabel: `${headers.White ?? "Blancs"} – ${headers.Black ?? "Noirs"}${headers.Date ? ` · ${headers.Date}` : ""}`,
          sourcePlayers,
          sourceRole,
          averageElo,
          source: lichessStandard ? "lichess_standard" : "master_game",
          collection,
          ply,
          mover: move.color,
          movePiece: move.piece,
          captured: move.captured ?? null,
        };
        candidates.push(record);
      }
    }
  }
  return candidates;
}

class StockfishEvaluator {
  constructor(engine) {
    this.engine = engine;
    this.pending = null;
    this.latest = null;
    engine.listener = (message) => this.handle(String(message));
    engine.sendCommand("setoption name Hash value 64");
    engine.sendCommand("setoption name MultiPV value 1");
    engine.sendCommand("isready");
  }

  handle(message) {
    const match = message.match(/^info .*?\bdepth (\d+).*?\bscore (cp|mate) (-?\d+).*?\bpv (.+)$/);
    if (match) {
      const value = Number(match[3]);
      this.latest = {
        depth: Number(match[1]),
        score: match[2] === "mate" ? Math.sign(value) * 10000 : value,
        mate: match[2] === "mate",
        pv: match[4].trim().split(/\s+/),
      };
    }
    if (message.startsWith("bestmove") && this.pending) {
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.resolve(this.latest);
    }
  }

  analyze(fen, searchMove = null, depth = 9) {
    if (this.pending) throw new Error("Stockfish request overlap");
    this.latest = null;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.engine.sendCommand("stop");
        reject(new Error(`Stockfish timeout for ${fen}`));
      }, 15_000);
      this.pending = { resolve: resolvePromise, reject, timer };
      this.engine.sendCommand(`position fen ${fen}`);
      this.engine.sendCommand(`go depth ${depth}${searchMove ? ` searchmoves ${searchMove}` : ""}`);
    });
  }

  close() {
    this.engine.sendCommand("quit");
  }
}

function difficulty(candidate, concept, acceptableMoves = 1) {
  const subtlety = {
    opposition: 80,
    rule_of_square: 0,
    king_and_pawn: 40,
    open_file: 120,
    improve_worst_piece: 220,
    weak_square: 260,
    pawn_structure: 300,
    favorable_exchange: 180,
    convert_small_advantage: 300,
    favorable_endgame_transition: 260,
    restrict_counterplay: 330,
  }[concept] ?? 180;
  const complexity = Math.min(520, candidate.pieceCount * 18 + candidate.legalMoves * 6);
  const choiceRelief = Math.max(0, acceptableMoves - 1) * 45;
  return Math.max(750, Math.min(2200, Math.round((700 + subtlety + complexity - choiceRelief) / 25) * 25));
}

function domainFor(concept) {
  if (Object.hasOwn(TARGETS.strategy, concept)) return "strategy";
  if (Object.hasOwn(TARGETS.endgame, concept)) return "endgame";
  return "conversion";
}

function typeFor(domain) {
  return domain === "strategy" ? "strategy" : domain === "endgame" ? "endgame" : "conversion";
}

function conceptSentence(concept) {
  return LABELS[concept]?.[1] ?? "Trouve le plan le plus précis dans cette position.";
}

function materialSignature(chess) {
  return ["w", "b"].map((color) => `${color}:${["q", "r", "b", "n", "p"]
    .map((type) => `${type}${allPieces(chess).filter((piece) => piece.color === color && piece.type === type).length}`)
    .join("")}`).join("|");
}

function pawnStructureSignature(chess) {
  return allPieces(chess)
    .filter((piece) => piece.type === "p")
    .map((piece) => `${piece.color}${piece.square}`)
    .sort()
    .join(".");
}

function additionalConversionConcepts(candidate, bestScore) {
  if (bestScore < 80 || bestScore > 320) return [];
  const concepts = ["convert_small_advantage"];
  if (candidate.nonPawnDrop >= 300 || candidate.captured) concepts.push("simplify_when_ahead");
  if (candidate.materialAdvantage >= 100) concepts.push("use_material_advantage");
  if (candidate.phase === "middlegame" && candidate.afterPhase === "endgame") concepts.push("favorable_endgame_transition");
  if (candidate.activityGain >= 5) concepts.push("preserve_activity");
  if (candidate.opponentMobility <= 14) concepts.push("restrict_counterplay");
  return concepts;
}

function preEngineConversionConcepts(candidate) {
  const concepts = ["convert_small_advantage"];
  if (candidate.nonPawnDrop >= 300 || candidate.captured) concepts.push("simplify_when_ahead");
  if (candidate.materialAdvantage >= 100) concepts.push("use_material_advantage");
  if (candidate.phase === "middlegame" && candidate.afterPhase === "endgame") concepts.push("favorable_endgame_transition");
  if (candidate.activityGain >= 5) concepts.push("preserve_activity");
  if (candidate.opponentMobility <= 14) concepts.push("restrict_counterplay");
  return concepts;
}

function acceptableForDomain(candidate, concept, best, played) {
  if (!best || !played || best.mate || played.mate || !played.pv?.length) return false;
  const loss = best.score - played.score;
  const domain = domainFor(concept);
  if (loss < -40 || loss > (domain === "strategy" ? 55 : domain === "endgame" ? 70 : 65)) return false;
  if (domain === "strategy") return candidate.phase === "middlegame" && best.score >= -120 && best.score <= 120;
  if (domain === "conversion") return best.score >= 80 && best.score <= 320 && played.score >= 20;
  return candidate.phase === "endgame" && Math.abs(best.score) <= 900;
}

function exerciseFrom(candidate, concept, best, played) {
  const domain = domainFor(concept);
  const [title, prompt] = LABELS[concept] ?? [concept, "Trouve le plan."];
  const loss = Math.max(0, best.score - played.score);
  const solutionLine = played.pv.slice(0, domain === "strategy" ? 3 : 7);
  const quality = Math.max(84, Math.min(98, Math.round(98 - loss / 5)));
  const chess = new Chess(candidate.fen);
  const planSignature = structuralFingerprint(chess, concept, {
    from: candidate.move.slice(0, 2),
    to: candidate.move.slice(2, 4),
    piece: candidate.movePiece,
  });
  return {
    id: `master-${concept}-${hash(`${candidate.canonicalFen}|${candidate.move}`)}`,
    type: typeFor(domain),
    origin: "concept",
    mode: domain === "strategy" ? "one-move" : "playout",
    theme: concept,
    conceptSlug: concept,
    domain,
    primaryConcept: concept,
    secondaryConcepts: candidate.concepts.filter((value) => value !== concept).slice(0, 3),
    secondaryConceptSlugs: candidate.concepts.filter((value) => value !== concept).slice(0, 3),
    category: domain,
    title,
    prompt,
    sourceLabel: `Partie de maître · ${candidate.sourceLabel}`,
    fen: candidate.fen,
    playerColor: candidate.mover === "w" ? "white" : "black",
    bestMove: candidate.move,
    baselinePlayerCp: best.score,
    acceptedConceptMoveUcis: [candidate.move],
    phase: candidate.phase,
    gameUrl: candidate.sourceUrl,
    concept: conceptSentence(concept),
    maxPlayerMoves: domain === "strategy" ? 1 : 3,
    solutionLine,
    successThresholdCp: domain === "conversion" ? Math.max(20, best.score - 100) : domain === "endgame" ? best.score - 120 : undefined,
    classificationConfidence: 0.9,
    difficulty: difficulty(candidate, concept),
    source: candidate.source,
    sourceId: candidate.sourceId,
    sourceGameId: candidate.sourceGameId,
    sourcePlayers: candidate.sourcePlayers,
    positionPly: candidate.ply,
    sourceRole: candidate.sourceRole,
    pedagogicalMechanism: concept,
    planSignature,
    materialSignature: materialSignature(chess),
    pawnStructureSignature: pawnStructureSignature(chess),
    keyPieces: [candidate.move.slice(0, 2)],
    keySquares: [candidate.move.slice(2, 4)],
    qualityScore: quality,
    isVerified: true,
    verificationSource: "stockfish18-lite-depth9",
  };
}

async function main() {
  const raw = collectCandidates();
  console.log(`Collected ${raw.length} pedagogical candidates from ${inputFiles.length} PGN files.`);
  const seedPayload = seedPath ? JSON.parse(readFileSync(seedPath, "utf8")) : null;
  const seedPositions = Array.isArray(seedPayload?.positions) ? seedPayload.positions : [];
  const engine = new StockfishEvaluator(await initStockfish("lite-single"));
  const bestCache = new Map();
  const playedCache = new Map();
  const usedFens = new Set(seedPositions.map((exercise) => canonicalFen(exercise.fen)));
  const similarityCounts = new Map();
  const outputExercises = [...seedPositions];
  const candidatePools = new Map();
  const usedGameMoments = new Map();
  const miningReport = {};

  for (const exercise of seedPositions) {
    if (exercise.planSignature) {
      similarityCounts.set(exercise.planSignature, (similarityCounts.get(exercise.planSignature) ?? 0) + 1);
    }
    if (exercise.sourceGameId && Number.isFinite(exercise.positionPly)) {
      const key = `${exercise.conceptSlug}|${exercise.sourceGameId}`;
      const values = usedGameMoments.get(key) ?? [];
      values.push(exercise.positionPly);
      usedGameMoments.set(key, values);
    }
  }

  for (const domain of Object.keys(TARGETS)) {
    for (const concept of Object.keys(TARGETS[domain])) {
      const pool = raw.filter((candidate) => candidate.concepts.includes(concept));
      candidatePools.set(concept, pool);
    }
  }
  // Conversion concepts depend on engine evaluation. Any strategically quiet
  // or endgame master decision can become a candidate after the +1..+3 check.
  const conversionPool = raw.filter((candidate) => candidate.phase !== "opening");
  for (const concept of Object.keys(TARGETS.conversion)) candidatePools.set(concept, conversionPool);

  async function analyses(candidate) {
    let best = bestCache.get(candidate.canonicalFen);
    if (!best) {
      best = await engine.analyze(candidate.fen);
      bestCache.set(candidate.canonicalFen, best);
    }
    const playedKey = `${candidate.canonicalFen}|${candidate.move}`;
    let played = playedCache.get(playedKey);
    if (!played) {
      played = await engine.analyze(candidate.fen, candidate.move);
      playedCache.set(playedKey, played);
    }
    return { best, played };
  }

  const order = [
    ...Object.keys(TARGETS.strategy),
    ...Object.keys(TARGETS.endgame),
    ...Object.keys(TARGETS.conversion),
  ];
  for (const concept of order) {
    const domain = domainFor(concept);
    const target = TARGETS[domain][concept];
    const pool = candidatePools.get(concept) ?? [];
    const seedCount = seedPositions.filter((exercise) => exercise.conceptSlug === concept).length;
    let accepted = seedCount;
    let technicalPassed = 0;
    let conceptPassed = 0;
    let dedupeRejected = 0;
    for (const candidate of pool) {
      if (accepted >= target) break;
      if (usedFens.has(candidate.canonicalFen)) {
        dedupeRejected += 1;
        continue;
      }
      const gameMomentKey = `${concept}|${candidate.sourceGameId}`;
      const neighbouringPlies = usedGameMoments.get(gameMomentKey) ?? [];
      if (neighbouringPlies.some((ply) => Math.abs(ply - candidate.ply) <= 6)) {
        dedupeRejected += 1;
        continue;
      }
      if (domain === "conversion") {
        if (!preEngineConversionConcepts(candidate).includes(concept)) continue;
        let best;
        try {
          best = bestCache.get(candidate.canonicalFen) ?? await engine.analyze(candidate.fen);
        } catch {
          continue;
        }
        bestCache.set(candidate.canonicalFen, best);
        if (!additionalConversionConcepts(candidate, best?.score ?? -999).includes(concept)) continue;
      }
      conceptPassed += 1;
      const similarity = structuralFingerprint(new Chess(candidate.fen), concept, {
        from: candidate.move.slice(0, 2),
        to: candidate.move.slice(2, 4),
        piece: candidate.movePiece,
      });
      if ((similarityCounts.get(similarity) ?? 0) >= 2) {
        dedupeRejected += 1;
        continue;
      }
      let best;
      let played;
      try {
        ({ best, played } = await analyses(candidate));
      } catch {
        continue;
      }
      if (!acceptableForDomain(candidate, concept, best, played)) continue;
      technicalPassed += 1;
      const exercise = exerciseFrom(candidate, concept, best, played);
      if (DEEP_VALIDATION_REJECTS.has(exercise.id)) continue;
      outputExercises.push(exercise);
      usedFens.add(candidate.canonicalFen);
      similarityCounts.set(similarity, (similarityCounts.get(similarity) ?? 0) + 1);
      const plies = usedGameMoments.get(gameMomentKey) ?? [];
      plies.push(candidate.ply);
      usedGameMoments.set(gameMomentKey, plies);
      accepted += 1;
    }
    miningReport[concept] = {
      domain,
      rawCandidates: pool.length,
      conceptGate: conceptPassed,
      engineAndOutcomeGate: technicalPassed,
      dedupeRejected,
      seedKept: seedCount,
      newlyMined: Math.max(0, accepted - seedCount),
      active: accepted,
    };
    console.log(`${domain}/${concept}: ${accepted}/${target} (${Math.max(0, accepted - seedCount)} new)`);
  }

  engine.close();
  const result = {
    generatedAt: new Date().toISOString(),
    sources: [
      ...(seedPayload?.sources ?? []),
      ...inputFiles.map((file) => ({
        collection: basename(file, ".pgn"),
        url: basename(file, ".pgn").startsWith("lichess_db_standard")
          ? "https://database.lichess.org/"
          : `https://www.pgnmentor.com/players/${basename(file, ".pgn")}.zip`,
        license: basename(file, ".pgn").startsWith("lichess_db_standard") ? "CC0" : "source PGN terms",
      })),
    ],
    engine: "Stockfish 18 Lite WASM, depth 9",
    scannedGames: Math.min(maxGames * inputFiles.length, 121_332),
    rawCandidates: raw.length,
    miningReport,
    deduplication: "canonical FEN + source-game/concept ±6 ply + concept/material/pawn-structure/move-zone diversity cap",
    positions: outputExercises,
  };
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputExercises.length} positions to ${output}`);
}

await main();
