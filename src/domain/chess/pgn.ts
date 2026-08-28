import { Chess } from "chess.js";
import { classifyPhase } from "./phase";
import type {
  AnalysisPayload,
  GameOutcome,
  MoveSnapshot,
  ParsedGame,
  PlayerColor,
} from "./types";

type ChessComSide = {
  username: string;
  rating: number;
  result: string;
};

export type ChessComGame = {
  uuid?: string;
  url: string;
  pgn: string;
  end_time: number;
  time_class: string;
  time_control: string;
  rated: boolean;
  rules: string;
  eco?: string;
  white: ChessComSide;
  black: ChessComSide;
};

const DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

function getChessComOutcome(result: string): GameOutcome {
  if (result === "win") return "win";
  if (DRAW_RESULTS.has(result)) return "draw";
  return "loss";
}
function getPgnOutcome(result: string, playerColor: PlayerColor): GameOutcome {
  if (result === "1/2-1/2" || result === "*") return "draw";
  if ((result === "1-0" && playerColor === "white") || (result === "0-1" && playerColor === "black")) {
    return "win";
  }
  return "loss";
}

function buildMoveSnapshots(chess: Chess, initialFen?: string): MoveSnapshot[] {
  const history = chess.history({ verbose: true });
  const replay = initialFen ? new Chess(initialFen) : new Chess();

  return history.map((move, index) => {
    const fenBefore = replay.fen();
    replay.move({ from: move.from, to: move.to, promotion: move.promotion });
    const fenAfter = replay.fen();

    return {
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      color: move.color,
      fenBefore,
      fenAfter,
      phase: classifyPhase(fenAfter, index + 1),
    };
  });
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pgn-${(hash >>> 0).toString(16)}`;
}

function pgnDateToUnix(headers: Record<string, string>): number {
  const raw = headers.UTCDate || headers.Date;
  if (!raw || !/^\d{4}\.\d{2}\.\d{2}$/.test(raw)) return Math.floor(Date.now() / 1000);
  const [year, month, day] = raw.split(".").map(Number);
  const time = (headers.UTCTime || "12:00:00").split(":").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, time[0] || 12, time[1] || 0, time[2] || 0) / 1000);
}

function splitPgnDocuments(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return [];

  const starts = [...normalized.matchAll(/^\s*\[Event\s+"/gm)].map((match) => match.index ?? 0);
  if (starts.length <= 1) return [normalized];

  return starts
    .map((start, index) => normalized.slice(start, starts[index + 1] ?? normalized.length).trim())
    .filter(Boolean);
}

export function parseChessComGame(game: ChessComGame, username: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(game.pgn, { strict: false });
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
  const playerColor: PlayerColor = isWhite ? "white" : "black";
  const player = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;

  return {
    id: game.uuid ?? game.url.split("/").filter(Boolean).at(-1) ?? `${game.end_time}`,
    source: "chesscom",
    url: game.url,
    rawPgn: game.pgn,
    playedAt: game.end_time,
    timeClass: game.time_class,
    timeControl: game.time_control,
    rated: game.rated,
    playerColor,
    playerRating: player.rating,
    opponent: opponent.username,
    opponentRating: opponent.rating,
    outcome: getChessComOutcome(player.result),
    opening: game.eco?.split("/").at(-1)?.replaceAll("-", " "),
    moves: buildMoveSnapshots(chess),
  };
}

export function parsePgnGame(pgn: string, playerName: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });
  const headers = chess.getHeaders();
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  const normalizedPlayer = playerName.trim().toLowerCase();

  if (!white || !black) throw new Error("Le PGN doit indiquer les joueurs White et Black.");
  const isWhite = white.toLowerCase() === normalizedPlayer;
  const isBlack = black.toLowerCase() === normalizedPlayer;
  if (!isWhite && !isBlack) {
    throw new Error(`Le joueur « ${playerName} » n’apparaît pas dans ce PGN.`);
  }

  const playerColor: PlayerColor = isWhite ? "white" : "black";
  const initialFen = headers.SetUp === "1" ? headers.FEN : undefined;
  const moves = buildMoveSnapshots(chess, initialFen);
  if (moves.length === 0) throw new Error("Cette partie PGN ne contient aucun coup exploitable.");

  const playerRating = Number(isWhite ? headers.WhiteElo : headers.BlackElo) || 0;
  const opponentRating = Number(isWhite ? headers.BlackElo : headers.WhiteElo) || 0;

  return {
    id: stableId(pgn.replace(/\s+/g, " ").trim()),
    source: "pgn",
    rawPgn: pgn,
    playedAt: pgnDateToUnix(headers),
    timeClass: headers.TimeClass?.toLowerCase() || "pgn",
    timeControl: headers.TimeControl || "unknown",
    rated: headers.Rated?.toLowerCase() === "true",
    playerColor,
    playerRating,
    opponent: isWhite ? black : white,
    opponentRating,
    outcome: getPgnOutcome(headers.Result || "*", playerColor),
    opening: headers.Opening || headers.ECO,
    moves,
  };
}

export function parsePgnCollection(
  text: string,
  playerName: string,
  requestedGames = 100,
): AnalysisPayload {
  if (!text.trim()) throw new Error("Le PGN est vide.");
  if (!playerName.trim()) throw new Error("Indique ton nom tel qu’il apparaît dans le PGN.");

  const documents = splitPgnDocuments(text);
  const games: ParsedGame[] = [];
  const failures: string[] = [];

  for (const document of documents.slice(0, 100)) {
    try {
      games.push(parsePgnGame(document, playerName));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Partie PGN invalide.");
    }
  }

  const selected = games
    .toSorted((a, b) => b.playedAt - a.playedAt)
    .slice(0, Math.min(100, Math.max(1, Math.floor(requestedGames))));
  if (selected.length === 0) {
    throw new Error(failures[0] || "Aucune partie PGN exploitable n’a été trouvée.");
  }

  const warnings: string[] = [];
  if (failures.length > 0) {
    warnings.push(`${failures.length} partie${failures.length > 1 ? "s" : ""} PGN ignorée${failures.length > 1 ? "s" : ""} car invalide${failures.length > 1 ? "s" : ""}.`);
  }
  if (selected.length < 6) {
    warnings.push(`Le diagnostic repose sur ${selected.length} partie${selected.length > 1 ? "s" : ""} : il reste indicatif.`);
  }

  return {
    profile: {
      username: playerName.trim(),
      displayName: playerName.trim(),
      rating: selected.find((game) => game.playerRating > 0)?.playerRating,
    },
    games: selected,
    warnings,
    selection: { source: "pgn", requestedGames, cadence: "all" },
  };
}
