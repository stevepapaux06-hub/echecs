import "server-only";

import type {
  AnalysisPayload,
  GameCadence,
  PlayerProfile,
} from "@/domain/chess/types";
import { parseChessComGame, type ChessComGame } from "@/domain/chess/pgn";

const API_ROOT = "https://api.chess.com/pub";
const USER_AGENT = "ChessPath/0.2 (+https://github.com/stevepapaux06-hub/echecs)";
const STANDARD_SPEEDS = new Set(["rapid", "blitz", "bullet", "daily"]);
const REQUEST_TIMEOUT_MS = 8_000;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

let requestQueue: Promise<void> = Promise.resolve();

type ChessComProfile = {
  username: string;
  name?: string;
  title?: string;
};

type ChessComStats = Record<string, { last?: { rating?: number } } | undefined>;

export class ChessComError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "unavailable"
      | "rate_limited"
      | "network"
      | "timeout"
      | "invalid_response"
      | "no_games",
  ) {
    super(message);
    this.name = "ChessComError";
  }
}

async function enqueue<T>(request: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(request, request);
  requestQueue = result.then(() => undefined, () => undefined);
  return result;
}

function retryDelay(response: Response): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter)
    ? Math.min(Math.max(retryAfter * 1_000, 250), 2_000)
    : 500;
}

async function fetchOnce(url: string): Promise<Response> {
  return enqueue(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") {
        throw new ChessComError(
          "Chess.com met trop de temps à répondre. Réessaie dans un instant.",
          "timeout",
        );
      }
      throw new ChessComError(
        "La connexion réseau vers Chess.com a échoué. Vérifie ta connexion puis réessaie.",
        "network",
      );
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function getJson<T>(url: string): Promise<T> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetchOnce(url);
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === 1) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response as Response)));
  }

  if (!response) {
    throw new ChessComError("Chess.com n’a renvoyé aucune réponse.", "unavailable");
  }
  if (response.status === 404) {
    throw new ChessComError("Ce joueur Chess.com n’existe pas.", "not_found");
  }
  if (response.status === 429) {
    throw new ChessComError(
      "La limite de requêtes Chess.com est atteinte. Attends quelques secondes puis réessaie.",
      "rate_limited",
    );
  }
  if (response.status === 403) {
    throw new ChessComError(
      "Chess.com a refusé cette requête publique. Réessaie dans quelques instants.",
      "unavailable",
    );
  }
  if (!response.ok) {
    throw new ChessComError(
      `Chess.com est indisponible pour le moment (HTTP ${response.status}).`,
      "unavailable",
    );
  }
  try {
    return await response.json() as T;
  } catch {
    throw new ChessComError(
      "Chess.com a renvoyé une réponse illisible. Aucune donnée n’a été modifiée.",
      "invalid_response",
    );
  }
}

function pickRatings(stats: ChessComStats): NonNullable<PlayerProfile["ratings"]> {
  return {
    rapid: stats.chess_rapid?.last?.rating,
    blitz: stats.chess_blitz?.last?.rating,
    bullet: stats.chess_bullet?.last?.rating,
    daily: stats.chess_daily?.last?.rating,
  };
}

export async function getChessComProfile(username: string): Promise<PlayerProfile> {
  const safeUsername = encodeURIComponent(username.trim());
  const profileData = await getJson<ChessComProfile>(`${API_ROOT}/player/${safeUsername}`);
  let stats: ChessComStats = {};
  try {
    stats = await getJson<ChessComStats>(`${API_ROOT}/player/${safeUsername}/stats`);
  } catch (reason) {
    if (!(reason instanceof ChessComError) || reason.code !== "not_found") throw reason;
  }
  const ratings = pickRatings(stats);
  return {
    username: profileData.username,
    displayName: profileData.name || profileData.username,
    title: profileData.title,
    rating: ratings.rapid ?? ratings.blitz ?? ratings.bullet ?? ratings.daily,
    ratings,
  };
}

export async function getRecentGames(
  username: string,
  limit = 10,
  cadence: GameCadence = "all",
): Promise<AnalysisPayload> {
  // Requests are intentionally serial: Chess.com's PubAPI documents that serial
  // access avoids the rate limits that can affect parallel calls.
  const profile = await getChessComProfile(username);
  const safeUsername = encodeURIComponent(profile.username);
  const archiveList = await getJson<{ archives: string[] }>(
    `${API_ROOT}/player/${safeUsername}/games/archives`,
  );

  if (!Array.isArray(archiveList.archives) || archiveList.archives.length === 0) {
    throw new ChessComError("Aucune partie publique n’est disponible pour ce joueur.", "no_games");
  }

  const rawGames: ChessComGame[] = [];
  for (const archiveUrl of archiveList.archives.toReversed()) {
    const archive = await getJson<{ games: ChessComGame[] }>(archiveUrl);
    if (!Array.isArray(archive.games)) {
      throw new ChessComError(
        "Chess.com a renvoyé une archive illisible. Aucune donnée n’a été modifiée.",
        "invalid_response",
      );
    }
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
        return [parseChessComGame(game, profile.username)];
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

  if (cadence !== "all") profile.rating = profile.ratings?.[cadence];

  return {
    profile,
    games,
    warnings,
    selection: { source: "chesscom", requestedGames: limit, cadence },
  };
}
