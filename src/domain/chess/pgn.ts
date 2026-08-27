import { Chess } from "chess.js";
import { classifyPhase } from "./phase";
import type { GameOutcome, ParsedGame, PlayerColor } from "./types";

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

function getOutcome(result: string): GameOutcome {
  if (result === "win") return "win";
  if (DRAW_RESULTS.has(result)) return "draw";
  return "loss";
}

export function parseChessComGame(game: ChessComGame, username: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(game.pgn, { strict: false });
  const history = chess.history({ verbose: true });
  const replay = new Chess();
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
  const playerColor: PlayerColor = isWhite ? "white" : "black";
  const player = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;

  const moves = history.map((move, index) => {
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

  return {
    id: game.uuid ?? game.url.split("/").filter(Boolean).at(-1) ?? `${game.end_time}`,
    url: game.url,
    playedAt: game.end_time,
    timeClass: game.time_class,
    timeControl: game.time_control,
    rated: game.rated,
    playerColor,
    playerRating: player.rating,
    opponent: opponent.username,
    opponentRating: opponent.rating,
    outcome: getOutcome(player.result),
    opening: game.eco?.split("/").at(-1)?.replaceAll("-", " "),
    moves,
  };
}
