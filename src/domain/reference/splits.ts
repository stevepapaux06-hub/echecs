import type { DevelopmentReference } from "./types";

export type ClusterSplitStrategy =
  | "leave_one_game_out"
  | "leave_one_source_out"
  | "leave_one_structure_out"
  | "leave_one_counterfactual_generator_out";

function splitValue(reference: DevelopmentReference, strategy: ClusterSplitStrategy): string {
  switch (strategy) {
    case "leave_one_game_out": return reference.clusters.game_cluster;
    case "leave_one_source_out": return reference.provenance.source;
    case "leave_one_structure_out": return reference.clusters.structure_cluster;
    case "leave_one_counterfactual_generator_out": return reference.clusters.transformation_cluster;
  }
}

export function clusterValues(references: readonly DevelopmentReference[], strategy: ClusterSplitStrategy): string[] {
  return [...new Set(references.map((reference) => splitValue(reference, strategy)))].toSorted();
}

/** Deterministic grouping utility for future detector experiments. Both sides
 * remain Development Reference; this function never upgrades the held-out side
 * to an independent or gold set. */
export function leaveOneClusterOut(
  references: readonly DevelopmentReference[],
  strategy: ClusterSplitStrategy,
  heldOutCluster: string,
): { development: DevelopmentReference[]; evaluation: DevelopmentReference[] } {
  const evaluation = references.filter((reference) => splitValue(reference, strategy) === heldOutCluster);
  const development = references.filter((reference) => splitValue(reference, strategy) !== heldOutCluster);
  return { development, evaluation };
}

export function splitHasLeakage(
  split: { development: DevelopmentReference[]; evaluation: DevelopmentReference[] },
  strategy: ClusterSplitStrategy,
): boolean {
  const developmentClusters = new Set(split.development.map((reference) => splitValue(reference, strategy)));
  return split.evaluation.some((reference) => developmentClusters.has(splitValue(reference, strategy)));
}
