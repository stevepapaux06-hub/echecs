/** Explicit pedagogical relations used by diagnosis → bank → session.
 * Absence from this map means abstention, never a silent category fallback. */
export const DECLARED_TRAINING_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  rook_endgame: ["rook_activity"],
  king_and_pawn: ["king_activity"],
  conversion: ["convert_small_advantage"],
  defense: ["defensive_resource"],
};

export function declaredFallbacksFor(conceptSlug: string): readonly string[] {
  return DECLARED_TRAINING_FALLBACKS[conceptSlug] ?? [];
}
