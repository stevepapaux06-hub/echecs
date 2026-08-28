import "server-only";

import type {
  AnalysisPayload,
  GameCadence,
  PlayerProfile,
} from "@/domain/chess/types";
import { parseChessComGame, type ChessComGame } from "@/domain/chess/pgn";

const API_ROOT = "https://api.chess.com/pub";
const USER_AGENT = "ChessPath-prototype/0.1";
const STANDARD_SPEEDS = new Set(["rapid", "blitz", "bullet", "daily"]);

type ChessComProfile = {
  username: string;
  name?: string;
  title?: string;
};

type ChessComStats = Record<string, { last?: { rating?: number } } | undefined>;

export class ChessComError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "unavailable" | "rate_limited" | "no_games",
  ) {
    super(message);
  }
}

async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
  } catch {
    throw new ChessComError("Chess.com est momentanément injoignable.", "unavailable");
  }

  if (response.status === 404) {
    throw new ChessComError("Ce joueur Chess.com n’existe pas.", "not_found");
  }
  if (response.status === 429) {
    throw new ChessComError("Chess.com reçoit trop de demandes. Réessaie dans un instant.", "rate_limited");
  }
  if (!response.ok) {
    throw new ChessComError("L’API Chess.com ne répond pas correctement.", "unavailable");
  }
  return response.json() as Promise<T>;
}

function pickRatings(stats: ChessComStats): NonNullable<PlayerProfile["ratings"]> {
  return {
    rapid: stats.chess_rapid?.last?.rating,
    blitz: stats.chess_blitz?.last?.rating,
    bullet: stats.chess_bullet?.last?.rating,
    daily: stats.chess_daily?.last?.rating,
  };
}

export async function getRecentGames(
  username: string,
  limit = 10,
  cadence: GameCadence = "all",
): Promise<AnalysisPayload> {
  // Requests are intentionally serial: Chess.com's PubAPI documents that serial
  // access avoids the rate limits that can affect parallel calls.
  const profileData = await getJson<ChessComProfile>(`${API_ROOT}/player/${username}`);
  const stats = await getJson<ChessComStats>(`${API_ROOT}/player/${username}/stats`);
  const archiveList = await getJson<{ archives: string[] }>(
    `${API_ROOT}/player/${username}/games/archives`,
  );

  if (archiveList.archives.length === 0) {
    throw new ChessComError("Aucune partie publique n’est disponible pour ce joueur.", "no_games");
  }

  const rawGames: ChessComGame[] = [];
  for (const archiveUrl of archiveList.archives.toReversed()) {
    const archive = await getJson<{ games: ChessComGame[] }>(archiveUrl);
    const eligible = archive.games
      .filter((game) =>
        game.rules === "chess"
        && STANDARD_SPEEDS.has(game.time_class)
        && (cadence === "all" || game.time_class === cadence)
        && game.pgn,
      )
      .toReversed();
    rawGames.push(...eligible);
    if (rawGames.length >= limit) break;
  }

  const games = rawGames
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, limit)
    .flatMap((game) => {
      try {
        return [parseChessComGame(game, profileData.username)];
      } catch {
        return [];
      }
    });

  if (games.length === 0) {
    throw new ChessComError("Aucune partie standard exploitable n’a été trouvée.", "no_games");
  }

  const warnings: string[] = [];
  if (games.length < limit) {
    warnings.push(
      `Chess.com ne fournit que ${games.length} partie${games.length > 1 ? "s" : ""} ${cadence === "all" ? "standard" : cadence} exploitable${games.length > 1 ? "s" : ""} sur les archives disponibles.`,
    );
  }
  if (games.length < 6) {
    warnings.push(
      `Le diagnostic repose sur ${games.length} partie${games.length > 1 ? "s" : ""} : il reste indicatif.`,
    );
  }

  const ratings = pickRatings(stats);
  const profile: PlayerProfile = {
    username: profileData.username,
    displayName: profileData.name || profileData.username,
    title: profileData.title,
    rating: cadence === "all"
      ? ratings.rapid ?? ratings.blitz ?? ratings.bullet ?? ratings.daily
      : ratings[cadence],
    ratings,
  };

  return {
    profile,
    games,
    warnings,
    selection: { source: "chesscom", requestedGames: limit, cadence },
  };
}
