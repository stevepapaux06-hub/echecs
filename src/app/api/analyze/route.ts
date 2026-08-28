import { ChessComError, getRecentGames } from "@/infrastructure/chesscom/client";
import type { GameCadence } from "@/domain/chess/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,25}$/;
const CADENCES = new Set<GameCadence>(["all", "rapid", "blitz", "bullet", "daily"]);

export async function POST(request: Request) {
  let body: { username?: unknown; limit?: unknown; cadence?: unknown };
  try {
    body = (await request.json()) as { username?: unknown; limit?: unknown; cadence?: unknown };
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const limit = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const cadence = typeof body.cadence === "string" ? body.cadence : "all";
  if (!USERNAME_PATTERN.test(username)) {
    return Response.json(
      { error: "Entre un pseudo Chess.com valide (lettres, chiffres, tiret ou underscore)." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json(
      { error: "Choisis un nombre entier de parties entre 1 et 100." },
      { status: 400 },
    );
  }
  if (!CADENCES.has(cadence as GameCadence)) {
    return Response.json({ error: "Cette cadence n’est pas disponible." }, { status: 400 });
  }

  try {
    return Response.json(await getRecentGames(username, limit, cadence as GameCadence));
  } catch (error) {
    if (error instanceof ChessComError) {
      const status = error.code === "not_found"
        ? 404
        : error.code === "rate_limited"
          ? 429
          : error.code === "no_games"
            ? 422
            : error.code === "timeout"
              ? 504
              : error.code === "network" || error.code === "invalid_response"
                ? 502
                : 503;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    return Response.json(
      {
        error: "Une erreur interne ChessPath a interrompu la récupération. Aucune donnée n’a été modifiée.",
        code: "internal",
      },
      { status: 500 },
    );
  }
}
