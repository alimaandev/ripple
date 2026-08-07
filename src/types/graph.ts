import type { ParsedFile } from "./parser.js";

/**
 * Classification of a resolved import edge.
 */
export type EdgeKind = "internal" | "external" | "unresolved";

export interface ResolvedImport {
  /** The original declaration the edge was derived from. */
  raw: string;
  edgeKind: EdgeKind;
  /**
   * Absolute path of the resolved target. Only set when `edgeKind ===
   * "internal"`.
   */
  resolvedPath?: string;
}

export interface GraphNode {
  /** Absolute path of the file. */
  path: string;
  parsed: ParsedFile;
}

/**
 * A circular dependency group: every file that is mutually reachable
 * (strongly connected component). `path` is a representative import chain
 * through the group, `members` the complete sorted member set.
 */
export interface Cycle {
  /** Complete sorted member paths of the cycle group. */
  members: string[];
  /** Representative ordered cycle path (first element === last element). */
  path: string[];
}

/**
 * Aggregate statistics of a graph, computed during build. Feeds the
 * confidence heuristic and `ripple graph` output.
 */
export interface GraphStats {
  /** Discovered files. */
  files: number;
  /** Files that parsed without errors. */
  parsed: number;
  /** Internal edges that resolved to a discovered file. */
  internalEdges: number;
  /** Relative/alias edges that resolved to nothing. */
  unresolvedEdges: number;
  /** Edges leaving the analyzed file set (packages, assets). */
  externalEdges: number;
  /** Circular dependency groups. */
  cycles: number;
}

/**
 * In-memory directed dependency graph.
 *
 * - `forward` maps a file to the set of files it imports.
 * - `reverse` maps a file to the set of files that import it.
 * - `external` maps a file to the set of specifiers that leave the project
 *   (node_modules packages, assets, non-discovered files).
 */
export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  forward: Map<string, Set<string>>;
  reverse: Map<string, Set<string>>;
  external: Map<string, Set<string>>;
  cycles: Cycle[];
  stats: GraphStats;
}

export function edgeCount(graph: DependencyGraph): number {
  let count = 0;
  for (const targets of graph.forward.values()) {
    count += targets.size;
  }
  return count;
}

export function externalEdgeCount(graph: DependencyGraph): number {
  let count = 0;
  for (const targets of graph.external.values()) {
    count += targets.size;
  }
  return count;
}

/** All file paths that participate in at least one cycle. */
export function cycleMemberPaths(graph: DependencyGraph): Set<string> {
  const members = new Set<string>();
  for (const cycle of graph.cycles) {
    for (const path of cycle.members) {
      members.add(path);
    }
  }
  return members;
}
