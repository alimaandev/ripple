import path from "node:path";
import { createTsProject } from "../parser/ts-project.js";
import { discoverSourceFiles } from "../scanner/discover.js";
import { buildGraph } from "../graph/build.js";
import type { DependencyGraph } from "../types/graph.js";
import type { ProjectContext } from "../types/project.js";
import { detectEntryPoints } from "../analyzer/categorize.js";
import { pathKey, displayPath } from "../utils/paths.js";
import { fileNotFound } from "../utils/errors.js";

/**
 * Shared pipeline for commands that need the full dependency graph
 * (analyze, graph, doctor). Loads context, discovers files, parses and
 * resolves everything into one graph, and detects entry points.
 */

export interface PipelineResult {
  graph: ReturnType<typeof buildGraph>;
  filePaths: string[];
  entryPoints: Set<string>;
  durationMs: number;
}

export async function runPipeline(context: ProjectContext): Promise<PipelineResult> {
  const started = Date.now();
  const project = createTsProject();
  const filePaths = await discoverSourceFiles({
    rootDir: context.rootDir,
    include: context.config.include,
    ignore: context.config.ignore,
  });
  const graph = buildGraph(project, filePaths, {
    rootDir: context.rootDir,
    aliases: context.aliases,
    fileKeys: new Set(filePaths.map((p) => pathKey(p, context.rootDir))),
  });
  const entryPoints = await detectEntryPoints(context.rootDir);
  return { graph, filePaths, entryPoints, durationMs: Date.now() - started };
}

/** Resolve the `<file>` argument to an absolute path (cwd-relative). */
export function resolveTargetFile(fileArg: string, cwd: string): string {
  return path.isAbsolute(fileArg) ? fileArg : path.join(cwd, fileArg);
}

/** Verify the target path is part of the graph; throws `RippleError`. */
export function requireNode(
  graph: DependencyGraph,
  targetPath: string,
  rootDir: string,
): { key: string } {
  const key = pathKey(targetPath, rootDir);
  if (!graph.nodes.has(key)) {
    throw fileNotFound(displayPath(targetPath, rootDir));
  }
  return { key };
}
