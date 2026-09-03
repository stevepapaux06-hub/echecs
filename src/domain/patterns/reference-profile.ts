import PROFILES from "./reference-profiles.generated.json";

type ReferenceProfile = { positive: number; boundary: number; sourceGames: number; exampleIds: string[]; boundaryIds: string[] };
const profiles = PROFILES.concepts as Record<string, ReferenceProfile>;

/** References validate feature coverage, not exact FEN recognition or a learned
 * precision score. Sparse support caps the detector below diagnostic threshold.
 * The independent hand-labelled holdout is deliberately excluded from counts. */
export function referenceSupportedConfidence(concept: string, confidence: number): number {
  const profile = profiles[concept];
  if (!profile) return Math.min(confidence, 0.79);
  return profile.positive >= 3 && profile.sourceGames >= 3 ? confidence : Math.min(confidence, 0.79);
}

export function conceptReferenceProfile(concept: string): ReferenceProfile | undefined { return profiles[concept]; }
