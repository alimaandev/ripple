import type { GraphStats } from "../types/graph.js";

/**
 * Confidence heuristic: how much of the graph could be analyzed reliably.
 *
 * - Parse rate: fraction of discovered files that parsed without errors.
 * - Resolution rate: fraction of non-external import edges that resolved to
 *   a known file.
 * - A cycle touching the analyzed file is a small uncertainty penalty.
 *
 * Range: 0-100, rounded.
 */
export function computeConfidence(stats: GraphStats, targetInCycle: boolean): number {
  const parseRate = stats.files === 0 ? 1 : stats.parsed / stats.files;
  const totalEdges = stats.internalEdges + stats.unresolvedEdges;
  const resolutionRate = totalEdges === 0 ? 1 : stats.internalEdges / totalEdges;

  let confidence = parseRate * (0.4 + 0.6 * resolutionRate);
  if (targetInCycle) confidence *= 0.95;

  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
