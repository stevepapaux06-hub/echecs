import type { PedagogyCandidate } from "@/domain/training/pedagogy";
import { requestPedagogyFromOpenAI } from "@/infrastructure/openai/pedagogy";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestWindows = new Map<string, { startedAt: number; count: number }>();

function isRateLimited(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!forwarded) return false;
  const now = Date.now();
  const current = requestWindows.get(forwarded);
  if (!current || now - current.startedAt >= 60_000) {
    requestWindows.set(forwarded, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

function isCandidate(value: unknown): value is PedagogyCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PedagogyCandidate>;
  return typeof candidate.exerciseId === "string"
    && /^[a-zA-Z0-9:_-]{1,160}$/.test(candidate.exerciseId)
    && typeof candidate.cacheKey === "string"
    && candidate.cacheKey.length <= 100
    && typeof candidate.fen === "string"
    && candidate.fen.length <= 120
    && (candidate.sideToMove === "w" || candidate.sideToMove === "b")
    && typeof candidate.eloBand === "string"
    && candidate.eloBand.length <= 50
    && typeof candidate.evaluationBeforeCp === "number"
    && Number.isFinite(candidate.evaluationBeforeCp)
    && (candidate.evaluationAfterCp === undefined || Number.isFinite(candidate.evaluationAfterCp))
    && (candidate.lossCp === undefined || Number.isFinite(candidate.lossCp))
    && (candidate.playedMove === undefined || /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(candidate.playedMove))
    && typeof candidate.assumedConcept === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.assumedConcept)
    && ["tactic", "strategy", "opening", "endgame", "conversion", "defense"].includes(candidate.assumedCategory ?? "")
    && (candidate.origin === "personal" || candidate.origin === "concept")
    && ["opening", "middlegame", "endgame"].includes(candidate.phase ?? "")
    && Array.isArray(candidate.stockfishCandidates)
    && candidate.stockfishCandidates.length >= 1
    && candidate.stockfishCandidates.length <= 3
    && candidate.stockfishCandidates.every((line) => (
      line
      && typeof line.uci === "string"
      && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(line.uci)
      && typeof line.playerCp === "number"
      && Array.isArray(line.pv)
      && line.pv.length <= 6
      && line.pv.every((move) => typeof move === "string")
    ));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return Response.json({ error: "Origine non autorisée." }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Origine invalide." }, { status: 403 });
    }
  }
  if (Number(request.headers.get("content-length") ?? 0) > 60_000) {
    return Response.json({ error: "Requête pédagogique trop volumineuse." }, { status: 413 });
  }
  if (isRateLimited(request)) {
    return Response.json({ error: "Coach momentanément occupé." }, { status: 429 });
  }

  let body: { candidates?: unknown };
  try {
    body = await request.json() as { candidates?: unknown };
  } catch {
    return Response.json({ error: "Requête pédagogique invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.candidates)
    || body.candidates.length < 1
    || body.candidates.length > 5
    || !body.candidates.every(isCandidate)) {
    return Response.json({ error: "Positions pédagogiques invalides." }, { status: 400 });
  }

  return Response.json(await requestPedagogyFromOpenAI(body.candidates));
}
