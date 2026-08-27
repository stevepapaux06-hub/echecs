import { ChessComError, getRecentGames } from "@/infrastructure/chesscom/client";

export const runtime = "nodejs";
export const maxDuration = 20;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,25}$/;

export async function POST(request: Request) {
  let body: { username?: unknown };
  try {
    body = (await request.json()) as { username?: unknown };
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!USERNAME_PATTERN.test(username)) {
    return Response.json(
      { error: "Entre un pseudo Chess.com valide (lettres, chiffres, tiret ou underscore)." },
      { status: 400 },
    );
  }

  try {
    return Response.json(await getRecentGames(username));
  } catch (error) {
    if (error instanceof ChessComError) {
      const status = error.code === "not_found" ? 404 : error.code === "rate_limited" ? 429 : 503;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    return Response.json(
      { error: "Une erreur inattendue a interrompu la récupération des parties." },
      { status: 500 },
    );
  }
}
