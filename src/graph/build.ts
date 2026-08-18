import type { Project } from "ts-morph";
import { parseMany } from "../parser/parse.js";
import type { ParsedFile } from "../types/parser.js";
import type { DependencyGraph } from "../types/graph.js";
import { pathKey } from "../utils/paths.js";
import { findCycles } from "./cycles.js";
import { resolveImports, type ResolverContext } from "./resolve.js";

/**
 * Build the in-memory dependency graph.
 *
 * 1. Parse every discovered file (shared ts-morph project).
 * 2. Resolve every import against the file set (aliases, index files, ...).
 * 3. Populate `forward` / `reverse` / `external` and graph stats.
 * 4. Detect cycles (SCC groups).
 *
 * `reverse` is built incrementally here so reverse traversals stay O(n).
 */
export function buildGraph(
  project: Project,
  filePaths: string[],
  context: ResolverContext,
): DependencyGraph {
  return buildGraphFromParsed(parseMany(project, filePaths), context);
}

/**
 * Build the graph from already-parsed surfaces (used by the incremental
 * parse cache, which reuses cached surfaces for unchanged files). The result
 * is identical to `buildGraph`: resolution, cycles and stats are always
 * recomputed from the parsed imports.
 */
export function buildGraphFromParsed(
  parsedFiles: ParsedFile[],
  context: ResolverContext,
): DependencyGraph {
  const nodes: DependencyGraph["nodes"] = new Map();
  const forward: DependencyGraph["forward"] = new Map();
  const reverse: DependencyGraph["reverse"] = new Map();
  const external: DependencyGraph["external"] = new Map();

  let parsedCount = 0;
  let internalEdges = 0;
  let unresolvedEdges = 0;
  let externalEdges = 0;

  for (const parsed of parsedFiles) {
    const key = pathKey(parsed.path, context.rootDir);
    nodes.set(key, { path: parsed.path, parsed });
    if (!parsed.parseError) parsedCount++;
  }

  for (const parsed of parsedFiles) {
    const fromKey = pathKey(parsed.path, context.rootDir);
    const targets = new Set<string>();

    const {
      internal,
      external: externalSpecifiers,
      unresolved,
    } = resolveImports(
      parsed.path,
      parsed.imports.map((decl) => decl.raw),
      context,
    );

    internalEdges += internal.length;
    unresolvedEdges += unresolved.length;
    externalEdges += externalSpecifiers.length;

    for (const target of internal) {
      targets.add(pathKey(target, context.rootDir));
    }

    if (externalSpecifiers.length > 0) {
      external.set(fromKey, new Set(externalSpecifiers));
    }

    forward.set(fromKey, targets);
    for (const target of targets) {
      const importers = reverse.get(target) ?? new Set<string>();
      importers.add(fromKey);
      reverse.set(target, importers);
    }
  }

  const graph: DependencyGraph = {
    nodes,
    forward,
    reverse,
    external,
    cycles: [],
    stats: {
      files: parsedFiles.length,
      parsed: parsedCount,
      internalEdges,
      unresolvedEdges,
      externalEdges,
      cycles: 0,
    },
  };
  graph.cycles = findCycles(graph);
  graph.stats.cycles = graph.cycles.length;
  return graph;
}

/**
 * Look up a graph node by absolute path. Returns the node's canonical key
 * and its parsed surface, or `undefined` when the file is not in the graph.
 */
export function findNode(
  graph: DependencyGraph,
  filePath: string,
  rootDir: string,
): { key: string; parsed: ParsedFile } | undefined {
  const key = pathKey(filePath, rootDir);
  const node = graph.nodes.get(key);
  if (!node) return undefined;
  return { key, parsed: node.parsed };
}
