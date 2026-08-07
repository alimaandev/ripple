import type { AffectedFile } from "../types/analysis.js";
import type { Category } from "../types/analysis.js";
import type { DependencyGraph } from "../types/graph.js";
import { cycleMemberPaths } from "../types/graph.js";

/**
 * Reverse traversal: BFS over the reverse (importer) adjacency from a target
 * file, collecting every file that could be affected by changing it.
 *
 * - The target itself is never included in the result.
 * - `depth` is the number of import hops from the target (direct dependents
 *   are depth 1).
 * - `maxDepth` caps the blast radius; `undefined` means unlimited.
 * - Visited set makes the traversal linear in the reachable subgraph.
 */

export interface ReverseTraversalOptions {
  maxDepth?: number;
  /** Classifies each visited file; provided by the caller for testability. */
  categorize: (filePath: string) => Category[];
}

export interface ReverseTraversalResult {
  affected: Map<string, AffectedFile>;
  maxDepth: number;
}

export function reverseTraverse(
  graph: DependencyGraph,
  targetKey: string,
  options: ReverseTraversalOptions,
): ReverseTraversalResult {
  const { maxDepth, categorize } = options;

  const affected: Map<string, AffectedFile> = new Map();
  const visited = new Set<string>([targetKey]);
  const cycleMembers = cycleMemberPaths(graph);

  if (!graph.reverse.has(targetKey)) {
    return { affected, maxDepth: 0 };
  }

  const queue: Array<{ key: string; depth: number }> = [];
  for (const importer of graph.reverse.get(targetKey) ?? []) {
    queue.push({ key: importer, depth: 1 });
  }

  let deepest = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    if (visited.has(current.key)) continue;
    visited.add(current.key);

    deepest = Math.max(deepest, current.depth);
    const node = graph.nodes.get(current.key);
    const filePath = node?.path ?? current.key;

    affected.set(current.key, {
      path: filePath,
      depth: current.depth,
      direct: current.depth === 1,
      categories: categorize(filePath),
      inCycle: cycleMembers.has(current.key),
    });

    if (maxDepth === undefined || current.depth < maxDepth) {
      for (const importer of graph.reverse.get(current.key) ?? []) {
        if (!visited.has(importer)) {
          queue.push({ key: importer, depth: current.depth + 1 });
        }
      }
    }
  }

  return { affected, maxDepth: deepest };
}
