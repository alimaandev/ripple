import path from "node:path";
import type { ProjectContext } from "../types/project.js";
import type { AnalysisResult } from "../types/analysis.js";
import type { DependencyGraph } from "../types/graph.js";
import { cycleMemberPaths } from "../types/graph.js";
import { pathExistsSync } from "../utils/fs.js";
import { computeConfidence } from "./confidence.js";
import { createCategorizer } from "./categorize.js";
import { buildSummary } from "./impact.js";
import { reverseTraverse } from "./reverse-traverse.js";
import { scoreRisk } from "../risk/score.js";

/**
 * Orchestrates a single `ripple analyze` run on top of an already-built
 * graph. Everything the commands layer needs is injected; the function is
 * pure apart from cheap filesystem existence checks.
 */

export interface AnalyzeInput {
  graph: DependencyGraph;
  context: ProjectContext;
  /** Absolute paths of detected entry points. */
  entryPoints: Set<string>;
  /** Canonical graph key of the analyzed file. */
  targetKey: string;
  /** Absolute path of the analyzed file. */
  targetPath: string;
  /** Wall time of the whole run, for reporting. */
  durationMs: number;
  /** Cap on traversal depth (undefined = unlimited). */
  maxDepth?: number;
}

/** The source root (directory holding the source tree) for impact areas. */
export function sourceRoot(rootDir: string): string {
  const candidate = path.join(rootDir, "src");
  return pathExistsSync(candidate) ? candidate : rootDir;
}

export function analyzeFile(input: AnalyzeInput): AnalysisResult {
  const { graph, context, entryPoints, targetKey, targetPath, durationMs, maxDepth } = input;

  const node = graph.nodes.get(targetKey);
  if (!node) {
    throw new Error(`Target file is not part of the graph: ${targetPath}`);
  }

  const categorize = createCategorizer({ rootDir: context.rootDir, entryPoints });
  const { affected, maxDepth: reachedDepth } = reverseTraverse(graph, targetKey, {
    maxDepth,
    categorize,
  });

  const targetInCycle = cycleMemberPaths(graph).has(targetKey);
  const confidence = computeConfidence(graph.stats, targetInCycle);
  const summary = buildSummary(affected, sourceRoot(context.rootDir), confidence);

  const risk = scoreRisk({
    summary,
    targetParsed: node.parsed,
    targetInCycle,
    riskConfig: context.config.risk,
  });

  return {
    targetPath,
    rootDir: context.rootDir,
    graph,
    affected,
    summary,
    risk,
    targetInCycle,
    durationMs,
    maxDepth: reachedDepth,
  };
}
