#!/usr/bin/env node

/**
 * Builds ChessPath's non-tactical bank from public master-game PGNs.
 *
 * Reference collections used for the committed seed:
 * - https://www.pgnmentor.com/players/Capablanca.zip
 * - https://www.pgnmentor.com/players/Karpov.zip
 * - https://www.pgnmentor.com/players/Petrosian.zip
 * - https://www.pgnmentor.com/players/Rubinstein.zip
 *
 * Every retained move is checked by the bundled Stockfish 18 Lite engine.
 * The script deliberately keeps a modest, diverse sample instead of turning
 * every quiet master move into an exercise.
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
]);

const TARGETS = {
  strategy: {
    improve_worst_piece: 24,
    outpost: 22,
    open_file: 28,
    weak_square: 18,
    weak_pawn: 22,
    pawn_break: 28,
    favorable_exchange: 20,
    piece_activity: 24,
    pawn_structure: 24,
  },
  endgame: {
    king_and_pawn: 24,
    opposition: 14,
    rule_of_square: 16,
    passed_pawn: 26,
    rook_endgame: 28,
    rook_activity: 24,
    rook_behind_pawn: 20,
    bishop_endgame: 20,
    knight_endgame: 20,
    king_activity: 24,
  },
  conversion: {
    convert_small_advantage: 32,
    simplify_when_ahead: 24,
    restrict_counterplay: 20,
    use_material_advantage: 24,
    favorable_endgame_transition: 20,
    preserve_activity: 24,
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
  console.error("Usage: node scripts/generate-nontactical-bank.mjs --output <json> <file.pgn> [...]");
  process.exit(1);
}

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
if (outputIndex < 0 || !args[outputIndex + 1]) usage();
const output = resolve(args[outputIndex + 1]);
const inputFiles = args.filter((arg, index) => index !== outputIndex && index !== outputIndex + 1);
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
    const sourceUrl = `https://www.pgnmentor.com/players/${collection}.zip`;
    // Four collections × 400 games already expose tens of thousands of
    // decisions. Sampling one side per game preserves both colours across the
    // corpus while keeping regeneration comfortably below a few minutes.
    const chunks = readFileSync(file, "utf8").split(/(?=\[Event )/).filter((chunk) => chunk.trim()).slice(0, 400);
    for (let gameIndex = 0; gameIndex < chunks.length && candidates.length < 8_000; gameIndex += 1) {
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
          sourceId: `${collection}-${gameIndex + 1}-${ply}`,
          sourceUrl,
          sourceLabel: `${headers.White ?? "Blancs"} – ${headers.Black ?? "Noirs"}${headers.Date ? ` · ${headers.Date}` : ""}`,
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
    source: "master_game",
    sourceId: candidate.sourceId,
    qualityScore: quality,
    isVerified: true,
    verificationSource: "stockfish18-lite-depth9",
  };
}

async function main() {
  const raw = collectCandidates();
  console.log(`Collected ${raw.length} pedagogical candidates from ${inputFiles.length} PGN files.`);
  const engine = new StockfishEvaluator(await initStockfish("lite-single"));
  const bestCache = new Map();
  const playedCache = new Map();
  const usedFens = new Set();
  const similarityCounts = new Map();
  const outputExercises = [];
  const candidatePools = new Map();

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
    let accepted = 0;
    for (const candidate of pool) {
      if (accepted >= target) break;
      if (usedFens.has(candidate.canonicalFen)) continue;
      if (domain === "conversion") {
        const best = bestCache.get(candidate.canonicalFen) ?? await engine.analyze(candidate.fen);
        bestCache.set(candidate.canonicalFen, best);
        if (!additionalConversionConcepts(candidate, best?.score ?? -999).includes(concept)) continue;
      }
      const similarity = structuralFingerprint(new Chess(candidate.fen), concept, {
        from: candidate.move.slice(0, 2),
        to: candidate.move.slice(2, 4),
        piece: candidate.movePiece,
      });
      if ((similarityCounts.get(similarity) ?? 0) >= 2) continue;
      let best;
      let played;
      try {
        ({ best, played } = await analyses(candidate));
      } catch {
        continue;
      }
      if (!acceptableForDomain(candidate, concept, best, played)) continue;
      const exercise = exerciseFrom(candidate, concept, best, played);
      if (DEEP_VALIDATION_REJECTS.has(exercise.id)) continue;
      outputExercises.push(exercise);
      usedFens.add(candidate.canonicalFen);
      similarityCounts.set(similarity, (similarityCounts.get(similarity) ?? 0) + 1);
      accepted += 1;
    }
    console.log(`${domain}/${concept}: ${accepted}/${target}`);
  }

  engine.close();
  const result = {
    generatedAt: new Date().toISOString(),
    sources: inputFiles.map((file) => ({
      collection: basename(file, ".pgn"),
      url: `https://www.pgnmentor.com/players/${basename(file, ".pgn")}.zip`,
    })),
    engine: "Stockfish 18 Lite WASM, depth 9",
    deduplication: "canonical FEN + concept/material/pawn-structure/move-zone diversity cap",
    positions: outputExercises,
  };
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputExercises.length} positions to ${output}`);
}

await main();
