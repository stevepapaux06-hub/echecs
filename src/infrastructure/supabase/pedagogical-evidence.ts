import type { ValidatedWeaknessEvidence } from "../../domain/diagnostic/recurring-weaknesses";

export type PersistedPedagogicalEvidence = {
  user_id: string;
  game_id: string;
  moment_id: string;
  position_ply: number | null;
  concept_slug: string;
  reason: "ERROR" | "OPPORTUNITY";
  confidence: number;
  played_at: string | null;
  analyzed_at: string;
  source_exercise_id: string;
  validation_fingerprint: string;
  is_active: boolean;
  invalidated_at: string | null;
  updated_at: string;
};

function rowKey(row: Pick<PersistedPedagogicalEvidence, "user_id" | "game_id" | "moment_id" | "concept_slug">): string {
  return `${row.user_id}:${row.game_id}:${row.moment_id}:${row.concept_slug}`;
}

function numericPly(momentId: string): number | null {
  return /^\d+$/.test(momentId) ? Number(momentId) : null;
}

/** Replaces evidence only for games analyzed in this run. Existing evidence for
 * every other game remains untouched; missing evidence in a re-analyzed game is
 * explicitly invalidated instead of becoming an orphan. */
export function mergePedagogicalEvidenceForAnalyzedGames(input: {
  userId: string;
  analyzedGameIds: string[];
  existing: PersistedPedagogicalEvidence[];
  current: ValidatedWeaknessEvidence[];
  analyzedAt: string;
}): PersistedPedagogicalEvidence[] {
  const analyzedGames = new Set(input.analyzedGameIds);
  const existing = input.existing.filter((row) => (
    row.user_id === input.userId && analyzedGames.has(row.game_id)
  ));
  const existingByKey = new Map(existing.map((row) => [rowKey(row), row]));
  const currentByKey = new Map<string, PersistedPedagogicalEvidence>();

  for (const evidence of input.current) {
    if (!analyzedGames.has(evidence.gameId) || !evidence.validationFingerprint) continue;
    if (evidence.reason !== "ERROR" && evidence.reason !== "OPPORTUNITY") continue;
    const row: PersistedPedagogicalEvidence = {
      user_id: input.userId,
      game_id: evidence.gameId,
      moment_id: evidence.momentId,
      position_ply: numericPly(evidence.momentId),
      concept_slug: evidence.conceptSlug,
      reason: evidence.reason,
      confidence: evidence.confidence,
      played_at: evidence.occurredAt ?? null,
      analyzed_at: input.analyzedAt,
      source_exercise_id: evidence.exerciseId,
      validation_fingerprint: evidence.validationFingerprint,
      is_active: true,
      invalidated_at: null,
      updated_at: input.analyzedAt,
    };
    const key = rowKey(row);
    const previous = currentByKey.get(key);
    if (!previous || row.confidence > previous.confidence) currentByKey.set(key, row);
  }

  const merged = [...currentByKey.values()];
  for (const [key, previous] of existingByKey) {
    if (currentByKey.has(key)) continue;
    merged.push({
      ...previous,
      is_active: false,
      invalidated_at: input.analyzedAt,
      analyzed_at: input.analyzedAt,
      updated_at: input.analyzedAt,
    });
  }
  return merged;
}

export function activeWeaknessEvidenceFromRows(
  rows: PersistedPedagogicalEvidence[],
  userId: string,
): ValidatedWeaknessEvidence[] {
  return rows.flatMap((row): ValidatedWeaknessEvidence[] => {
    if (row.user_id !== userId || !row.is_active) return [];
    return [{
      evidenceId: `${row.game_id}:${row.moment_id}:${row.concept_slug}`,
      exerciseId: row.source_exercise_id,
      gameId: row.game_id,
      momentId: row.moment_id,
      conceptSlug: row.concept_slug,
      reason: row.reason,
      conceptRole: "PRIMARY",
      confidence: row.confidence,
      occurredAt: row.played_at ?? undefined,
      validationFingerprint: row.validation_fingerprint,
      validationStatus: "active",
    }];
  });
}
