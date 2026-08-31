import type { User } from "@supabase/supabase-js";
import type {
  AnalysisPayload,
  CompleteAnalysis,
  DiagnosticMetrics,
  ParsedGame,
  PlayerProfile,
  TrainingAttemptRecord,
  TrainingExercise,
} from "@/domain/chess/types";
import type { Json } from "./database.types";
import { normalizeAuthError } from "./auth-errors";
import { getSupabaseClient } from "./client";
import { addGameConceptSample, addTrainingConceptAttempt, type ConceptStatCounters } from "../../domain/diagnostic/concept-stats";
import { normalizeConceptSlug } from "../../domain/knowledge/concepts";

export type AnalysisHistoryItem = {
  id: string;
  title: string;
  source: string;
  requestedGames: number;
  cadence: string;
  createdAt: string;
  metrics: DiagnosticMetrics;
  exercises: TrainingExercise[];
  warnings: string[];
};

export type SavedGame = {
  id: string;
  externalId: string;
  source: string;
  playedAt: string | null;
  timeClass: string | null;
  result: string | null;
  opponent: string;
};

export type WeaknessRecord = {
  theme: string;
  title: string;
  confidence: string;
  sampleSize: number;
  issueCount: number;
  status: string;
};

export type PersistentProfile = {
  user: User;
  chess: PlayerProfile | null;
  analyses: AnalysisHistoryItem[];
  games: SavedGame[];
  weaknesses: WeaknessRecord[];
  attempts: number;
  trainingAttempts: TrainingAttemptRecord[];
  conceptStats: ConceptStatsRecord[];
};

export type ConceptStatsRecord = {
  conceptSlug: string;
  opportunities: number;
  successes: number;
  failures: number;
  trainingAttempts: number;
  trainingSuccesses: number;
  gameOpportunities: number;
  gameSuccesses: number;
  masteryScore: number | null;
  lastSeenAt: string | null;
  lastTrainedAt: string | null;
};

function missingOptionalTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

function countersFromRow(row: {
  opportunities: number;
  successes: number;
  failures: number;
  training_attempts: number;
  training_successes: number;
  game_opportunities: number;
  game_successes: number;
  mastery_score: number | null;
} | null | undefined): ConceptStatCounters | undefined {
  if (!row) return undefined;
  return {
    opportunities: row.opportunities,
    successes: row.successes,
    failures: row.failures,
    trainingAttempts: row.training_attempts,
    trainingSuccesses: row.training_successes,
    gameOpportunities: row.game_opportunities,
    gameSuccesses: row.game_successes,
    masteryScore: row.mastery_score,
  };
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function throwAuthError(reason: unknown): never {
  throw normalizeAuthError(reason);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throwAuthError(error);
  } catch (reason) {
    throwAuthError(reason);
  }
}

export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throwAuthError(error);
    return Boolean(data.session);
  } catch (reason) {
    throwAuthError(reason);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/reset-password", window.location.origin).toString(),
    });
    if (error) throwAuthError(error);
  } catch (reason) {
    throwAuthError(reason);
  }
}

export async function resendConfirmationEmail(email: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throwAuthError(error);
  } catch (reason) {
    throwAuthError(reason);
  }
}

export async function updatePassword(password: string): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throwAuthError(error);
  } catch (reason) {
    throwAuthError(reason);
  }
}

export async function signOut(): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throwAuthError(error);
  } catch (reason) {
    throwAuthError(reason);
  }
}

function profileFromRow(row: {
  chess_username: string | null;
  display_name: string | null;
  rapid_rating: number | null;
  blitz_rating: number | null;
  bullet_rating: number | null;
  daily_rating: number | null;
} | null): PlayerProfile | null {
  if (!row?.chess_username) return null;
  const ratings = {
    rapid: row.rapid_rating ?? undefined,
    blitz: row.blitz_rating ?? undefined,
    bullet: row.bullet_rating ?? undefined,
    daily: row.daily_rating ?? undefined,
  };
  return {
    username: row.chess_username,
    displayName: row.display_name || row.chess_username,
    rating: ratings.rapid ?? ratings.blitz ?? ratings.bullet ?? ratings.daily,
    ratings,
  };
}

export async function loadPersistentProfile(user: User): Promise<PersistentProfile> {
  const supabase = getSupabaseClient();
  const [profileResult, analysesResult, gamesResult, weaknessesResult, attemptsResult, conceptStatsResult] = await Promise.all([
    supabase.from("chess_profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("analyses").select("*").order("created_at", { ascending: false }),
    supabase.from("games").select("id,external_id,source,played_at,time_class,result,parsed_game").order("played_at", { ascending: false }).limit(100),
    supabase.from("weaknesses").select("*").order("last_seen_at", { ascending: false }),
    supabase
      .from("exercise_attempts")
      .select("exercise_key,theme,result,loss_cp,moves,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("concept_stats").select("*"),
  ]);
  const firstError = profileResult.error || analysesResult.error || gamesResult.error || weaknessesResult.error || attemptsResult.error;
  if (firstError) throw firstError;
  if (conceptStatsResult.error && !missingOptionalTable(conceptStatsResult.error)) throw conceptStatsResult.error;

  return {
    user,
    chess: profileFromRow(profileResult.data),
    analyses: (analysesResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      source: row.source,
      requestedGames: row.requested_games,
      cadence: row.cadence,
      createdAt: row.created_at,
      metrics: row.metrics as unknown as DiagnosticMetrics,
      exercises: row.exercises as unknown as TrainingExercise[],
      warnings: row.warnings as unknown as string[],
    })),
    games: (gamesResult.data ?? []).map((row) => {
      const parsed = row.parsed_game as unknown as ParsedGame;
      return {
        id: row.id,
        externalId: row.external_id,
        source: row.source,
        playedAt: row.played_at,
        timeClass: row.time_class,
        result: row.result,
        opponent: parsed.opponent || "Adversaire",
      };
    }),
    weaknesses: (weaknessesResult.data ?? []).map((row) => ({
      theme: row.theme,
      title: row.title,
      confidence: row.confidence,
      sampleSize: row.sample_size,
      issueCount: row.issue_count,
      status: row.status,
    })),
    attempts: attemptsResult.count ?? 0,
    trainingAttempts: (attemptsResult.data ?? []).map((row) => ({
      exerciseId: row.exercise_key,
      theme: row.theme,
      result: row.result as TrainingAttemptRecord["result"],
      lossCp: row.loss_cp,
      moves: Array.isArray(row.moves) ? row.moves.filter((move): move is string => typeof move === "string") : [],
      createdAt: row.created_at,
    })),
    conceptStats: (conceptStatsResult.data ?? []).map((row) => ({
      conceptSlug: row.concept_slug,
      opportunities: row.opportunities,
      successes: row.successes,
      failures: row.failures,
      trainingAttempts: row.training_attempts,
      trainingSuccesses: row.training_successes,
      gameOpportunities: row.game_opportunities,
      gameSuccesses: row.game_successes,
      masteryScore: row.mastery_score,
      lastSeenAt: row.last_seen_at,
      lastTrainedAt: row.last_trained_at,
    })),
  };
}

export async function saveChessProfile(userId: string, profile: PlayerProfile): Promise<void> {
  const ratings = profile.ratings ?? {};
  const { error } = await getSupabaseClient().from("chess_profiles").upsert({
    id: userId,
    chess_username: profile.username,
    display_name: profile.displayName,
    rapid_rating: ratings.rapid ?? null,
    blitz_rating: ratings.blitz ?? null,
    bullet_rating: ratings.bullet ?? null,
    daily_rating: ratings.daily ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message || "Le compte Chess.com n’a pas pu être sauvegardé.");
}

export async function unlinkChessProfile(userId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("chess_profiles").upsert({
    id: userId,
    chess_username: null,
    display_name: null,
    rapid_rating: null,
    blitz_rating: null,
    bullet_rating: null,
    daily_rating: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message || "Le compte Chess.com n’a pas pu être délié.");
}

export async function saveGames(
  userId: string,
  profile: PlayerProfile,
  games: ParsedGame[],
): Promise<{ ids: string[]; inserted: number }> {
  if (games.length === 0) return { ids: [], inserted: 0 };
  const supabase = getSupabaseClient();
  const externalIds = games.map((game) => game.id);
  const { data: existing, error: existingError } = await supabase
    .from("games")
    .select("external_id")
    .eq("user_id", userId)
    .in("external_id", externalIds);
  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((row) => row.external_id));

  const { data, error } = await supabase
    .from("games")
    .upsert(games.map((game) => ({
      user_id: userId,
      source: game.source,
      external_id: game.id,
      chess_username: profile.username,
      pgn: game.rawPgn,
      played_at: new Date(game.playedAt * 1000).toISOString(),
      time_class: game.timeClass,
      time_control: game.timeControl,
      result: game.outcome,
      player_color: game.playerColor,
      parsed_game: json(game),
    })), { onConflict: "user_id,source,external_id" })
    .select("id,external_id");
  if (error) throw error;
  return {
    ids: (data ?? []).map((row) => row.id),
    inserted: games.filter((game) => !existingIds.has(game.id)).length,
  };
}

export async function saveCompleteAnalysis(
  userId: string,
  payload: AnalysisPayload,
  result: CompleteAnalysis,
): Promise<string> {
  const supabase = getSupabaseClient();
  await saveChessProfile(userId, payload.profile);

  const savedGames = await saveGames(userId, payload.profile, payload.games);
  const cadenceLabel = payload.selection.cadence === "all"
    ? "toutes cadences"
    : payload.selection.cadence[0].toUpperCase() + payload.selection.cadence.slice(1);
  const title = `${result.metrics.gamesAnalyzed} parties · ${cadenceLabel}`;

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      user_id: userId,
      title,
      source: payload.selection.source,
      requested_games: payload.selection.requestedGames,
      cadence: payload.selection.cadence,
      game_ids: savedGames.ids,
      metrics: json(result.metrics),
      exercises: json(result.exercises),
      warnings: json(result.warnings),
    })
    .select("id")
    .single();
  if (analysisError) throw analysisError;

  const [previousWeaknessesResult, attemptsResult, previousConceptStatsResult] = await Promise.all([
    supabase
      .from("weaknesses")
      .select("theme,sample_size,issue_count,status")
      .eq("user_id", userId),
    supabase
      .from("exercise_attempts")
      .select("theme,result")
      .eq("user_id", userId),
    supabase
      .from("concept_stats")
      .select("*")
      .eq("user_id", userId),
  ]);
  if (previousWeaknessesResult.error) throw previousWeaknessesResult.error;
  if (attemptsResult.error) throw attemptsResult.error;
  if (previousConceptStatsResult.error && !missingOptionalTable(previousConceptStatsResult.error)) {
    throw previousConceptStatsResult.error;
  }

  const previousByTheme = new Map(
    (previousWeaknessesResult.data ?? []).map((weakness) => [weakness.theme, weakness]),
  );
  const attemptsByTheme = new Map<string, { total: number; successful: number }>();
  for (const attempt of attemptsResult.data ?? []) {
    const aggregate = attemptsByTheme.get(attempt.theme) ?? { total: 0, successful: 0 };
    aggregate.total += 1;
    if (attempt.result === "success") aggregate.successful += 1;
    attemptsByTheme.set(attempt.theme, aggregate);
  }

  const weaknessRows = result.metrics.themes.map((theme) => {
    const previous = previousByTheme.get(theme.id);
    const attempts = attemptsByTheme.get(theme.id) ?? { total: 0, successful: 0 };
    const currentRate = theme.issueCount / Math.max(theme.sampleSize, 1);
    const previousRate = previous
      ? previous.issue_count / Math.max(previous.sample_size, 1)
      : null;
    const trainingSuccess = attempts.successful / Math.max(attempts.total, 1);
    const measuredImprovement = previousRate !== null
      && theme.sampleSize >= 4
      && currentRate <= previousRate * 0.75;

    let status = theme.confidence === "high" ? "to_work" : "learning";
    if (measuredImprovement) status = "progressing";
    if (theme.sampleSize >= 8 && currentRate <= 0.15 && attempts.total >= 3 && trainingSuccess >= 0.75) {
      status = "mastered";
    } else if (previous?.status === "mastered" && currentRate <= 0.2) {
      status = "mastered";
    }

    return {
      user_id: userId,
      theme: theme.id,
      title: theme.title,
      confidence: theme.confidence,
      sample_size: theme.sampleSize,
      issue_count: theme.issueCount,
      status,
      details: json({
        ...theme,
        progression: {
          previousIssueRate: previousRate,
          currentIssueRate: currentRate,
          trainingAttempts: attempts.total,
          trainingSuccessRate: attempts.total ? trainingSuccess : null,
        },
      }),
      last_seen_at: new Date().toISOString(),
    };
  });
  if (weaknessRows.length) {
    const { error } = await supabase.from("weaknesses").upsert(weaknessRows, { onConflict: "user_id,theme" });
    if (error) throw error;
  }

  if (!previousConceptStatsResult.error && result.metrics.conceptStats?.length) {
    const previousByConcept = new Map((previousConceptStatsResult.data ?? []).map((row) => [row.concept_slug, row]));
    const now = new Date().toISOString();
    const conceptRows = result.metrics.conceptStats.map((stat) => {
      const previous = previousByConcept.get(stat.conceptSlug);
      const counters = addGameConceptSample(countersFromRow(previous), stat);
      return {
        user_id: userId,
        concept_slug: stat.conceptSlug,
        opportunities: counters.opportunities,
        successes: counters.successes,
        failures: counters.failures,
        training_attempts: counters.trainingAttempts,
        training_successes: counters.trainingSuccesses,
        game_opportunities: counters.gameOpportunities,
        game_successes: counters.gameSuccesses,
        mastery_score: counters.masteryScore,
        last_seen_at: now,
        last_trained_at: previous?.last_trained_at ?? null,
        updated_at: now,
      };
    });
    const { error } = await supabase.from("concept_stats").upsert(conceptRows, { onConflict: "user_id,concept_slug" });
    if (error) throw error;
  }

  const exerciseRows = result.exercises.map((exercise) => ({
    user_id: userId,
    analysis_id: analysis.id,
    exercise_key: exercise.id,
    theme: exercise.conceptSlug,
    origin: exercise.origin,
    fen: exercise.fen,
    payload: json(exercise),
  }));
  if (exerciseRows.length) {
    const { error } = await supabase.from("exercises").upsert(exerciseRows, { onConflict: "user_id,exercise_key" });
    if (error) throw error;
  }

  const { error: snapshotError } = await supabase.from("progress_snapshots").insert({
    user_id: userId,
    analysis_id: analysis.id,
    metrics: json(result.metrics),
  });
  if (snapshotError) throw snapshotError;
  return analysis.id;
}

export async function saveExerciseAttempt(
  userId: string,
  exercise: TrainingExercise,
  result: "success" | "partial" | "failed",
  lossCp: number,
  moves: string[],
): Promise<void> {
  const supabase = getSupabaseClient();
  const conceptSlug = normalizeConceptSlug(exercise.conceptSlug || exercise.theme);
  const [savedResult, conceptStatsResult] = await Promise.all([
    supabase
      .from("exercises")
      .select("id")
      .eq("user_id", userId)
      .eq("exercise_key", exercise.id)
      .maybeSingle(),
    supabase
      .from("concept_stats")
      .select("*")
      .eq("user_id", userId)
      .eq("concept_slug", conceptSlug)
      .maybeSingle(),
  ]);
  const { error } = await supabase.from("exercise_attempts").insert({
    user_id: userId,
    exercise_id: savedResult.data?.id ?? null,
    exercise_key: exercise.id,
    theme: conceptSlug,
    result,
    loss_cp: Math.round(lossCp),
    moves: json(moves),
  });
  if (error) throw error;
  if (conceptStatsResult.error) {
    if (missingOptionalTable(conceptStatsResult.error)) return;
    throw conceptStatsResult.error;
  }
  const previous = conceptStatsResult.data;
  const counters = addTrainingConceptAttempt(countersFromRow(previous), result === "success");
  const now = new Date().toISOString();
  const { error: statsError } = await supabase.from("concept_stats").upsert({
    user_id: userId,
    concept_slug: conceptSlug,
    opportunities: counters.opportunities,
    successes: counters.successes,
    failures: counters.failures,
    training_attempts: counters.trainingAttempts,
    training_successes: counters.trainingSuccesses,
    game_opportunities: counters.gameOpportunities,
    game_successes: counters.gameSuccesses,
    mastery_score: counters.masteryScore,
    last_seen_at: previous?.last_seen_at ?? null,
    last_trained_at: now,
    updated_at: now,
  }, { onConflict: "user_id,concept_slug" });
  if (statsError) throw statsError;
}

export function reopenAnalysis(
  history: AnalysisHistoryItem,
  profile: PlayerProfile,
): CompleteAnalysis {
  return {
    profile,
    selection: {
      source: history.source === "pgn" ? "pgn" : history.source === "saved" ? "saved" : "chesscom",
      requestedGames: history.requestedGames,
      cadence: history.cadence as CompleteAnalysis["selection"]["cadence"],
    },
    warnings: history.warnings,
    games: [],
    metrics: history.metrics,
    exercises: history.exercises,
  };
}
